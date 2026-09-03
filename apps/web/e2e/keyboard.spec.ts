import { expect, test } from '@playwright/test';
import { Bench } from './bench';

/**
 * The half of R-23's keyboard pass that needs a real browser.
 *
 * The rest is in `apps/web/test/keyboard.test.tsx`, under jsdom, where the
 * overlays and the field labels can be checked in milliseconds. These four
 * cannot be: the 3D view moves a three.js camera and needs a GL context, and
 * a focus ring is a painted rectangle rather than a rule somebody can read.
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
