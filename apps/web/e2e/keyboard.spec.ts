import { expect, test } from '@playwright/test';
import { Bench } from './bench';

/**
 * The half of R-23's keyboard pass that needs a real browser.
 *
 * The rest is in `apps/web/test/keyboard.test.tsx`, under jsdom, where the
 * overlays and the field labels can be checked in milliseconds. What is here
 * cannot be: the 3D view moves a three.js camera and needs a GL context, a
 * focus ring is a painted rectangle rather than a rule somebody can read, and
 * an accessible name is Chromium's own computation rather than a guess at it.
 */

test.describe('the model answers a keyboard', () => {
  /**
   * "The 3D view could not be reached at all, let alone orbited." It takes
   * focus now, and the arrows step through the same bays and panels a click
   * reaches — which, before R-23, was the only route to selecting a panel
   * outside the cut list.
   */
  test('arrows step through its bays and panels', async ({ page }) => {
    await Bench.open(page);
    const scene = page.locator('.viewport .scene');
    await scene.focus();
    await expect(scene).toBeFocused();

    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      seen.add(((await page.locator('.crumbs').textContent()) ?? '').trim());
    }
    // Six steps, six different things — a stepper that got stuck would leave
    // the model reachable and unusable, which is the state it was in before.
    expect(seen.size, `stepped through ${seen.size} distinct selections`).toBeGreaterThanOrEqual(4);
    expect([...seen].some((c) => c.includes('Bay'))).toBe(true);

    // And back the other way.
    const forward = ((await page.locator('.crumbs').textContent()) ?? '').trim();
    await page.keyboard.press('ArrowLeft');
    expect(((await page.locator('.crumbs').textContent()) ?? '').trim()).not.toBe(forward);
  });

  /**
   * `+` *is* Shift and `=` on most layouts, and the first version tested the
   * modifier before the zoom keys — so both `+` and `_` were dead while the
   * label promised them. Asserted against the picture, because the camera is
   * the only thing that changes and nothing in the DOM reports it.
   */
  test('shift turns it, and + and − zoom — including the shifted key', async ({ page }) => {
    await Bench.open(page);
    const scene = page.locator('.viewport .scene');
    const view = page.locator('.viewport');
    await scene.focus();

    for (const key of ['Shift+ArrowLeft', '+', '-', '=', '_']) {
      const before = await view.screenshot();
      await page.keyboard.press(key);
      await expect
        .poll(async () => Buffer.compare(await view.screenshot(), before), {
          message: `"${key}" moved nothing`,
        })
        .not.toBe(0);
    }
  });

  /** Escape from the model goes back to the run, the way the label says. */
  test('escape goes back to the run', async ({ page }) => {
    await Bench.open(page);
    const scene = page.locator('.viewport .scene');
    await scene.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.crumbs')).not.toHaveText('Run');
    await page.keyboard.press('Escape');
    await expect(page.locator('.crumbs')).toHaveText('Run');
  });
});

test.describe('focus is visible where the keyboard is', () => {
  /**
   * `input:focus { outline: none }` predated all of Milestone F and left a
   * keyboard user with no way to tell which of sixty fields had focus. The
   * jsdom suite checks the *rule* is not there; this checks a ring is
   * actually painted, which is the thing the user needs.
   */
  test('a field tabbed into is painted with a ring', async ({ page }) => {
    const bench = await Bench.open(page);
    await bench.press(page.locator('button.carc-tab', { hasText: 'Base' }));

    const width = page
      .locator('.inspector details.group')
      .filter({ has: page.locator('summary:text-is("Size")') })
      .getByLabel('Width', { exact: true });
    await width.focus();
    // `:focus-visible` only matches a keyboard focus, so the key press is
    // load-bearing: `focus()` alone leaves the ring off in Chromium.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');

    const outline = await width.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: parseFloat(s.outlineWidth), style: s.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);
  });

  /** The model's own ring, which had to go inside the frame to be visible. */
  test('and so is the 3D view when it takes focus', async ({ page }) => {
    await Bench.open(page);
    const scene = page.locator('.viewport .scene');
    await scene.focus();
    await page.keyboard.press('ArrowRight');
    const outline = await scene.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: parseFloat(s.outlineWidth), offset: parseFloat(s.outlineOffset) };
    });
    expect(outline.width).toBeGreaterThan(0);
    // Offset outwards, it is clipped by the stage and invisible.
    expect(outline.offset).toBeLessThan(0);
  });
});

test.describe('the whole bench is reachable without a pointer', () => {
  /**
   * Tabbing from the top of the page must reach every door off the bench —
   * the workshop, the output pack, the machine view and export — before it
   * runs out of stops. A control that can only be clicked is a control a
   * tablet at the machine and a screen reader both lose.
   */
  test('tab reaches every door in the top bar', async ({ page }) => {
    await Bench.open(page);
    await page.locator('body').press('Tab');

    const reached: string[] = [];
    for (let i = 0; i < 30; i++) {
      reached.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return (el?.getAttribute('aria-label') ?? el?.textContent ?? '').trim();
        }),
      );
      await page.keyboard.press('Tab');
    }

    for (const door of ['Workshop', 'Output', 'At the machine', 'Export DXF']) {
      expect(
        reached.some((name) => name.startsWith(door)),
        `Tab never reached "${door}" — reached: ${reached.join(' | ')}`,
      ).toBe(true);
    }
  });
});

/**
 * Every control in the app, asked what it is called.
 *
 * The first version of this suite asked that question of `.field` elements
 * inside the inspector, and review found the very defect it was written for
 * still live two components away: the export toolbar's "safe layer names"
 * checkbox announced itself as *"safe layer names What this does"*, and the
 * explode slider — one of the controls on the resting bench — had no name at
 * all. A test scoped to where the bug was first noticed does not catch the
 * bug; it catches that one instance of it.
 *
 * So this sweeps whole surfaces, and it reads Chromium's own accessibility
 * tree rather than guessing at the name computation: `ariaSnapshot()` reports
 * a control as `- checkbox "safe layer names"`, and one with no name at all as
 * a bare `- slider: "0"`.
 *
 * That last shape is why the name is matched only where it belongs — directly
 * after the role. The first cut of this took *any* quoted string on the line,
 * which is a control's **value** on a slider or a text field, so an unnamed
 * slider read as one called "0" and the sweep passed with the very defect it
 * was written for still in the page. Found by removing the fix and watching
 * this test not care — which is the check every assertion here earns its
 * place by surviving.
 */
test.describe('every control in the app says what it is', () => {
  /**
   * `- <role>` optionally followed by `"<name>"`, and nothing else: a `:
   * value`, a `[state]` or a child line must not be read as a name.
   */
  const CONTROL =
    /^\s*- (button|checkbox|textbox|slider|combobox|spinbutton|radio|switch|searchbox)(?:\s+"((?:[^"\\]|\\.)*)")?(?=\s|:|$)/;
  /** The info button's own name, which no *other* control may end up wearing. */
  const INFO = 'What this does';

  const audit = async (snapshot: string): Promise<{ unnamed: string[]; wearing: string[] }> => {
    const controls = snapshot.split('\n').flatMap((line) => {
      const match = CONTROL.exec(line);
      return match ? [{ line: line.trim(), name: match[2] ?? null }] : [];
    });
    expect(controls.length, 'the surface rendered no controls to audit').toBeGreaterThan(3);
    return {
      unnamed: controls.filter((c) => c.name === null).map((c) => c.line),
      // The info button is legitimately called that; anything *else* carrying
      // the phrase has swallowed it out of its own label.
      wearing: controls
        .filter((c) => c.name !== null && c.name !== INFO && c.name.includes(INFO))
        .map((c) => c.line),
    };
  };

  test('on the bench, the workshop, the output pack and at the machine', async ({ page }) => {
    const bench = await Bench.open(page);

    // The section plane's controls only exist once a cut is made, and one of
    // them is a slider with no visible label of its own.
    await bench.press(page.locator('.viewport button', { hasText: 'Section' }));

    const surfaces: Array<[string, string]> = [['the bench', 'body']];
    const found = await audit(await page.locator('body').ariaSnapshot());
    expect(found.unnamed, 'unnamed controls on the bench').toEqual([]);
    expect(found.wearing, 'controls wearing the info button’s name on the bench').toEqual([]);

    await bench.press(page.locator('header.topbar button', { hasText: 'Workshop' }));
    // Every section, because a closed one renders its controls but lays out
    // nothing, and half of the app's fields live behind these headings.
    await page.locator('.workshop details').evaluateAll((els) => {
      for (const el of els) (el as HTMLDetailsElement).open = true;
    });
    surfaces.push(['the workshop', '.workshop']);

    for (const [name, selector] of surfaces.slice(1)) {
      const result = await audit(await page.locator(selector).ariaSnapshot());
      expect(result.unnamed, `unnamed controls in ${name}`).toEqual([]);
      expect(result.wearing, `controls wearing the info button’s name in ${name}`).toEqual([]);
    }

    await page.keyboard.press('Escape');
    await bench.press(page.locator('header.topbar button', { hasText: 'Output' }));
    const pack = await audit(await page.locator('.pack').ariaSnapshot());
    expect(pack.unnamed, 'unnamed controls in the output pack').toEqual([]);
    // The one review actually found: "safe layer names What this does".
    expect(pack.wearing, 'controls wearing the info button’s name in the output pack').toEqual([]);

    await bench.press(page.locator('header.topbar button', { hasText: 'At the machine' }));
    const machine = await audit(await page.locator('.at-machine').ariaSnapshot());
    expect(machine.unnamed, 'unnamed controls at the machine').toEqual([]);
    expect(machine.wearing, 'controls wearing the info button’s name at the machine').toEqual([]);
  });
});
