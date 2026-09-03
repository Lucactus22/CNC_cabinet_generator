import { expect, type Locator, type Page } from '@playwright/test';
import type { ProjectParams } from '@cabgen/core';

/**
 * A journey, walked and counted.
 *
 * docs/UX.md defines an interaction as "one discrete input act: a click, or
 * one field given a value", and every number in that document was taken by
 * counting them by hand. Counting them here instead is what stops the numbers
 * rotting: a control added back into a route fails the walk that route is
 * measured by, in the same commit that added it.
 */
export class Walk {
  interactions = 0;

  constructor(readonly page: Page) {}

  async click(target: Locator): Promise<void> {
    this.interactions += 1;
    await target.click();
  }

  /** One field given a value, however many keys that takes. */
  async set(target: Locator, value: string): Promise<void> {
    this.interactions += 1;
    await target.fill(value);
    await target.blur();
  }

  /**
   * Find-by-name, opened and asked a question: two acts.
   *
   * Here rather than counted at the call site, so the ruling that a query and
   * the Enter committing it are *one* field given a value lives in the same
   * place as every other counting rule — adding a keystroke to this must move
   * the count, and at a call site it would not.
   */
  async find(word: string): Promise<void> {
    await this.click(this.page.getByRole('button', { name: /Find…/ }));
    const palette = this.page.getByRole('dialog', { name: 'Find a setting' });
    this.interactions += 1;
    await palette.getByRole('textbox').fill(word);
    await palette.getByRole('textbox').press('Enter');
    await expect(palette).toHaveCount(0);
  }

  async choose(target: Locator, option: string): Promise<void> {
    this.interactions += 1;
    await target.selectOption({ label: option });
  }

  /**
   * The design as the app has it, read back out of its own autosave.
   *
   * Deliberately not a hook hung on `window` for the tests to read: the
   * autosave is a real thing the app does, so asserting against it also
   * asserts that reloading would come back to the same cabinet.
   *
   * It is debounced, and the first value in the store is not necessarily the
   * finished design — a burst of edits flushes once, part way through, and a
   * read that took whatever was there caught a cabinet three fields old. So
   * this waits for the stored text to stop changing rather than for it to
   * exist. Reading a stale design is worse than a slow test: the assertions
   * that follow describe a cabinet the walk never built.
   */
  async params(): Promise<ProjectParams> {
    await this.settled();
    let previous: string | null = null;
    let stable: string | null = null;
    await expect
      .poll(
        async () => {
          const raw = await this.page.evaluate(() => localStorage.getItem('cabgen:autosave'));
          const unchanged = raw !== null && raw === previous;
          previous = raw;
          if (unchanged) stable = raw;
          return unchanged;
        },
        { intervals: Array.from({ length: 20 }, () => 300) },
      )
      .toBe(true);
    return JSON.parse(stable!) as ProjectParams;
  }

  /**
   * Wait for the worker to catch up, so a read is not a build behind.
   *
   * The badge in the top bar is where the app itself says so, which makes
   * this the same answer a person standing in front of it would get.
   */
  async settled(): Promise<void> {
    await expect(this.page.locator('.topbar .badge')).not.toContainText('updating');
  }
}

/**
 * Open the app at rest: no autosave, and the starter gallery already seen.
 *
 * The seed is written once, before the app's own script runs, rather than
 * through `addInitScript` — that runs on *every* navigation, so a walk that
 * reloads would have its seed re-applied and, worse, anything the app had
 * written since would be overwritten. A walk asserting that something is
 * remembered across a reload would then be asserting it against a store the
 * walk itself had just reset, and would pass whatever the app did.
 *
 * Nothing needs clearing first: Playwright gives each test its own browser
 * context, so `localStorage` starts empty.
 */
export async function openAtRest(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('cabgen:starters-seen', 'yes'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Export DXF' })).toBeVisible();
  // *At rest* means the app has finished everything it was going to do,
  // R-19's once-only suggestion line included — it waits for the selection to
  // sit still for a moment before saying anything, and a count taken before
  // it lands is a count of a screen nobody sees.
  await expect(page.getByLabel('Something this could do')).toBeVisible();
}

/** Spend the once-only suggestion, leaving the bench in its steady state. */
export async function dismissSuggestion(page: Page): Promise<void> {
  const line = page.getByLabel('Something this could do');
  await line.getByRole('button', { name: 'Dismiss, and do not show this again' }).click();
  await expect(line).toHaveCount(0);
}

/**
 * Every control whose rectangle is on screen, by the name it answers to.
 *
 * Counted over the whole page rather than one panel, because this shell has
 * no sidebar to scope it to, and scoping it to the inspector would flatter it.
 *
 * The name is resolved the way the accessible-name computation does —
 * `aria-label`, then `aria-labelledby`, then the `<label>` that claims it,
 * then the control's own contents, and only then `title`. That order is the
 * point rather than a detail: a control nothing names comes back as `UNNAMED`
 * with its markup attached, instead of being quietly filled in with its tag's
 * `type`. Reporting the type is how the explode slider passed for a control
 * called `range`.
 */
export async function controlsOnScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const within = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.right > 0 &&
        r.top < window.innerHeight &&
        r.left < window.innerWidth
      );
    };

    // Children joined with a space, so a button wrapping a word and a badge
    // reads "Workshop 2" rather than "Workshop2".
    const textOf = (el: Element | null): string =>
      el === null
        ? ''
        : Array.from(el.childNodes)
            .map((n) => (n.textContent ?? '').trim())
            .filter((t) => t !== '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

    const nameOf = (el: Element): string => {
      const label = el.getAttribute('aria-label');
      if (label) return label.trim();
      const by = el.getAttribute('aria-labelledby');
      if (by) return textOf(document.getElementById(by));
      const id = el.getAttribute('id');
      if (id) {
        const claimed = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (claimed) return textOf(claimed);
      }
      const wrapping = el.closest('label');
      if (wrapping) return textOf(wrapping);
      return textOf(el) || (el.getAttribute('title') ?? '').trim();
    };

    return Array.from(document.querySelectorAll('input, select, textarea, button'))
      .filter(within)
      .map((el) => nameOf(el) || `UNNAMED: ${el.outerHTML.slice(0, 160)}`);
  });
}
