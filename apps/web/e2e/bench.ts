import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The bench, opened the way every measurement in docs/UX.md was taken, plus a
 * counter for the thing those measurements are made of.
 *
 * **An interaction** is docs/UX.md's own definition: one discrete input act —
 * a click, or one field given a value. Hovering is not one; neither is
 * scrolling, which that document counts separately and in pixels because it is
 * continuous. So `press`, `fill` and `choose` count and `hover` does not, and a
 * journey spec reads as the walk with its own total falling out of it, rather
 * than as a number somebody asserted from memory.
 *
 * **Every act waits for the build.** `buildProject` runs in a worker (R-12) and
 * the interface is deliberately allowed to lag a build behind the parameters,
 * so an assertion made in the gap between a keystroke and its rebuild reads the
 * *previous* cabinet. The top bar says which state it is in; this waits for
 * that rather than sleeping.
 */
export class Bench {
  interactions = 0;
  /** Anything the page logged as an error, from the first navigation on. */
  readonly consoleErrors: string[] = [];

  private constructor(readonly page: Page) {}

  /**
   * A browser that has opened this before: no autosaved project, and the
   * starter gallery already spent.
   *
   * That is the state every count in docs/UX.md is against. Measured: the
   * shell renders **23** controls here, **26** once the quiet suggestion has
   * appeared under the inspector, and **30** on a first visit with the starter
   * gallery up — which is what `openFirstVisit` gives, for the two tests that
   * are about the front door itself.
   */
  static async open(page: Page): Promise<Bench> {
    return Bench.load(page, () => {
      localStorage.clear();
      localStorage.setItem('cabgen:starters-seen', 'yes');
    });
  }

  /** A browser that has never held a project: the starter gallery is up. */
  static async openFirstVisit(page: Page): Promise<Bench> {
    return Bench.load(page, () => localStorage.clear());
  }

  private static async load(page: Page, seed: () => void): Promise<Bench> {
    const bench = new Bench(page);
    page.on('console', (m) => {
      if (m.type() === 'error') bench.consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => bench.consoleErrors.push(e.message));
    await page.addInitScript(seed);
    await page.goto('/');
    await expect(page.locator('header.topbar')).toBeVisible();
    await bench.settled();
    // A blank canvas and a thrown exception both leave a page that looks
    // plausible in a screenshot. Neither is allowed to pass silently.
    expect(bench.consoleErrors, 'the console carried errors while the bench loaded').toEqual([]);
    return bench;
  }

  /** One click, counted. */
  async press(target: Locator | string): Promise<void> {
    this.interactions += 1;
    await this.locate(target).click();
    await this.settled();
  }

  /** One field given a value, counted. */
  async fill(target: Locator | string, value: string): Promise<void> {
    this.interactions += 1;
    await this.locate(target).fill(value);
    await this.settled();
  }

  /** One option chosen from a `<select>`, counted. */
  async choose(target: Locator | string, value: string): Promise<void> {
    this.interactions += 1;
    await this.locate(target).selectOption(value);
    await this.settled();
  }

  /** Not an interaction: docs/UX.md counts the click, not the move before it. */
  async hover(target: Locator | string): Promise<void> {
    await this.locate(target).hover();
  }

  /** Wait until the worker has caught up with what is on screen. */
  async settled(): Promise<void> {
    await expect(this.page.locator('header.topbar > span.badge')).not.toContainText('updating…');
  }

  /**
   * Wait until the project this browser has autosaved holds `value` at `path`.
   *
   * The autosave is the store's own parameters written out on every change, so
   * it is the one place a walk can check it reached the *cabinet* it meant to
   * rather than only the screen it meant to. Debounced, hence a wait rather
   * than a read: `path` is dotted, with array indices as plain segments —
   * `cabinets.0.carcasses.0.width`.
   */
  async savedToHave(path: string, value: unknown): Promise<void> {
    await this.page
      .waitForFunction(
        (want: { path: string; json: string }) => {
          const raw = localStorage.getItem('cabgen:autosave');
          if (!raw) return false;
          const at = want.path
            .split('.')
            .reduce<unknown>(
              (o, k) => (o === null || o === undefined ? o : (o as Record<string, unknown>)[k]),
              JSON.parse(raw) as unknown,
            );
          return JSON.stringify(at) === want.json;
        },
        { path, json: JSON.stringify(value) },
        { timeout: 5000 },
      )
      .catch(async () => {
        // A bare "waitForFunction timed out" says nothing about which cabinet
        // it actually built, which is the only thing worth knowing here.
        const actual = await this.page.evaluate((p: string) => {
          const raw = localStorage.getItem('cabgen:autosave');
          if (!raw) return '(nothing autosaved)';
          return JSON.stringify(
            p
              .split('.')
              .reduce<unknown>(
                (o, k) => (o === null || o === undefined ? o : (o as Record<string, unknown>)[k]),
                JSON.parse(raw) as unknown,
              ),
          );
        }, path);
        throw new Error(`${path} is ${actual}, wanted ${JSON.stringify(value)}`);
      });
  }

  /**
   * Every control the shell has on screen right now.
   *
   * docs/UX.md's method, unchanged: every `input`, `select`, `textarea` and
   * `button` in the whole page whose rectangle is on screen. Not scoped to a
   * panel — the shell has no sidebar to scope it to, and scoping it to the
   * inspector would flatter it by eight.
   */
  async controlsAtRest(): Promise<number> {
    return this.page.evaluate(() => {
      const view = { w: window.innerWidth, h: window.innerHeight };
      return [...document.querySelectorAll('input, select, textarea, button')].filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          r.right > 0 &&
          r.bottom > 0 &&
          r.left < view.w &&
          r.top < view.h
        );
      }).length;
    });
  }

  /**
   * How much of the window the model's own rectangle takes, as a percentage.
   *
   * Given twice because the inspector floats over the model rather than
   * dividing the window: `gross` is the model's own rectangle and `net`
   * subtracts the card, which is the honest comparison against R-16's 42.7%.
   * `card` is the card's height, because that is the only part of the figure
   * that moves — a suggestion under the controls costs about 110 px.
   */
  async modelShare(): Promise<{ gross: number; net: number; card: number }> {
    return this.page.evaluate(() => {
      const view = window.innerWidth * window.innerHeight;
      const stage = document.querySelector('.viewport')?.getBoundingClientRect();
      const card = document.querySelector('.inspector')?.getBoundingClientRect();
      if (!stage) return { gross: 0, net: 0, card: 0 };
      const gross = (stage.width * stage.height) / view;
      const covered = card ? card.width * card.height : 0;
      return {
        gross: gross * 100,
        net: ((stage.width * stage.height - covered) / view) * 100,
        card: Math.round(card?.height ?? 0),
      };
    });
  }

  private locate(target: Locator | string): Locator {
    return typeof target === 'string' ? this.page.locator(target) : target;
  }
}
