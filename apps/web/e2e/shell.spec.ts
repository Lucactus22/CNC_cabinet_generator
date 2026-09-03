import { expect, test } from '@playwright/test';
import { Bench } from './bench';

/**
 * The shell's own numbers: what it renders at rest, and how much of the window
 * the cabinet gets.
 *
 * These are the figures R-17 was set as a budget and every item since has
 * re-measured by hand. Written down in docs/UX.md, they rot the first time
 * somebody adds a control; asserted here, they cannot. They are stated as
 * ceilings and floors rather than equalities, with the exact figure in the
 * failure message — a shell that gets *quieter* or gives the model *more* is
 * not a regression.
 */

test.describe('the resting state', () => {
  /**
   * R-16 measured 39 controls rendered at rest, out of 129 the sidebar could
   * render on the default project and 243 with every branch switched on.
   * R-17 took it to 20, R-20 to 21 with the section-plane button, and R-23
   * re-measured the whole page at 26 — the difference being R-22's own two
   * additions, the "At the machine" door and the info button beside every
   * explained field.
   *
   * There are **two** resting states and the first version of this test
   * conflated them, asserting ≤ 26 against a state that renders 23 — three
   * controls of slack in the one budget the walk exists to hold. They are
   * separated now: **23** before the quiet suggestion appears, and **26**
   * while one is up, which can happen at most six times in the life of a
   * browser. The breakdown is asserted too, so a future drift says *which*
   * surface grew rather than only that one did.
   */
  test('the shell renders 23 controls at rest, and the model keeps the window', async ({
    page,
  }) => {
    const bench = await Bench.open(page);

    const controls = await bench.controlsAtRest();
    expect(controls, `controls at rest: ${controls}`).toBeLessThanOrEqual(23);

    const where = await page.evaluate(() => {
      // On screen, the same way the total is counted: the top bar carries a
      // hidden file input that Open borrows, which nobody can reach or see.
      const on = (root: Element | null) =>
        root
          ? [...root.querySelectorAll('input, select, textarea, button')].filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            }).length
          : 0;
      return {
        topbar: on(document.querySelector('header.topbar')),
        inspector: on(document.querySelector('.inspector')),
        runstrip: on(document.querySelector('.runstrip')),
      };
    });
    // The top bar is the one surface that is always there whatever is
    // selected, and it is the one a new door gets added to.
    expect(where.topbar, `top bar controls: ${where.topbar}`).toBeLessThanOrEqual(9);
    // "All of them about the selection" was the other half of R-17's
    // criterion: at rest the inspector holds the run's own four.
    expect(where.inspector, `inspector controls: ${where.inspector}`).toBeLessThanOrEqual(4);
    expect(where.runstrip, `run strip controls: ${where.runstrip}`).toBeLessThanOrEqual(8);

    // The cabinet is the workspace, not a preview panel. R-16 measured 42.7%
    // of the window at this size; R-17 was set ≥ 70% and measured 84.4% gross
    // and 76.0% net of the floating card, which R-23 re-measured at 73.1%
    // once the suggestion line is showing under it.
    const share = await bench.modelShare();
    const measured = `gross ${share.gross.toFixed(1)}%, net ${share.net.toFixed(1)}%, card ${share.card}px`;
    expect(share.gross, measured).toBeGreaterThanOrEqual(80);
    expect(share.net, measured).toBeGreaterThanOrEqual(70);
  });

  /**
   * The other resting state: a quiet suggestion under the inspector, which is
   * the 26 R-23 recorded. It costs three controls and 111 px of the card, and
   * it is spent for good the moment it is dismissed — so it is asserted
   * separately rather than folded into the budget above as slack.
   */
  test('and 26 while a quiet suggestion is up', async ({ page }) => {
    const bench = await Bench.open(page);
    // Waited for rather than slept through: the suggestion is gated on a
    // settled selection with nothing building, so it lands after the build
    // the shell opens on.
    await expect(page.locator('.suggestion')).toBeVisible();

    const controls = await bench.controlsAtRest();
    expect(controls, `controls with a suggestion up: ${controls}`).toBeLessThanOrEqual(26);

    // It must not cost the model its budget either — R-19 measured 73.5% net
    // with one showing against 76.0% without.
    const share = await bench.modelShare();
    expect(
      share.net,
      `net ${share.net.toFixed(1)}%, card ${share.card}px with a suggestion up`,
    ).toBeGreaterThanOrEqual(70);
  });

  /** The same budget at the smaller size docs/UX.md also measures. */
  test('and holds at 1024 × 768', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const bench = await Bench.open(page);
    const share = await bench.modelShare();
    expect(share.gross, `model share gross: ${share.gross.toFixed(1)}%`).toBeGreaterThanOrEqual(78);
    expect(share.net, `model share net: ${share.net.toFixed(1)}%`).toBeGreaterThanOrEqual(60);
  });

  /**
   * The diagnostics panel took 26.4% of the window permanently, on every tab
   * — more than the sidebar did. R-21's answer is that it holds none of it
   * until it is opened, and docks along the bottom when it is, with the
   * cabinet still visible above it.
   */
  test('the diagnostics panel takes none of the window until it is opened', async ({ page }) => {
    const bench = await Bench.open(page);
    await expect(page.locator('.diagnostics-sheet')).toHaveCount(0);

    await bench.press(page.locator('header.topbar button.chip'));
    const panel = page.locator('.diagnostics-sheet');
    await expect(panel).toBeVisible();

    const overlap = await page.evaluate(() => {
      const sheet = document.querySelector('.diagnostics-sheet')!.getBoundingClientRect();
      const model = document.querySelector('.viewport')!.getBoundingClientRect();
      return { covered: sheet.height / model.height, top: sheet.top > model.top };
    });
    // Docked along the bottom, not a card over the middle of the cabinet.
    expect(overlap.top).toBe(true);
    expect(overlap.covered, 'the diagnostics panel covers the cabinet').toBeLessThan(0.6);
  });
});

test.describe('everything is reachable by name', () => {
  /**
   * R-17's criterion, and the reason find-by-name shipped with the shell
   * rather than with R-19. `apps/web/test/catalog.test.ts` already proves
   * every parameter is claimed by a catalogue entry and every entry's path
   * appears on a control; what it cannot prove is that typing the word gets
   * you there, through the surface switch and the section opening.
   *
   * The words are the trade's, not the app's — which is the half of the
   * promise a catalogue of field labels would silently drop.
   */
  for (const [word, param] of [
    ['kickboard', 'cabinets[].carcasses[].toeKick.enabled'],
    ['knock-down', 'joinery.carcassJoint'],
    ['rebate', 'cabinets[].carcasses[].back.style'],
    ['beadboard', 'surfaceEffects'],
  ] as const) {
    test(`"${word}" lands on the control that sets it`, async ({ page }) => {
      const bench = await Bench.open(page);
      await bench.press(page.getByRole('button', { name: /Find/ }));
      const palette = page.getByRole('dialog', { name: 'Find a setting' });
      await palette.getByRole('textbox').fill(word);
      await expect(palette.locator('li button').first()).toBeVisible();
      await page.keyboard.press('Enter');

      // Where it landed, and that it is open and focused rather than merely
      // scrolled to a heading — the first version of the palette did that.
      const host = page.locator(`[data-param="${param.replace(/"/g, '\\"')}"]`).first();
      await expect(host).toBeVisible();
      const focusedParam = await page.evaluate(
        () => document.activeElement?.closest('[data-param]')?.getAttribute('data-param') ?? null,
      );
      expect(focusedParam).toBe(param);
    });
  }

  /**
   * The bug R-18 found on the way and which was not R-18's: the palette did
   * not `preventDefault` on Enter, so Enter's own default action landed on
   * whatever `reveal` had just focused — and where that is a row of options,
   * the first one got *picked*. Searching "knock-down" quietly set the
   * carcass joint to stopped dado and said nothing.
   */
  test('and pressing Enter to get there changes nothing', async ({ page }) => {
    const bench = await Bench.open(page);
    await bench.press(page.getByRole('button', { name: /Find/ }));
    const palette = page.getByRole('dialog', { name: 'Find a setting' });
    await palette.getByRole('textbox').fill('knock-down');
    await expect(palette.locator('li button').first()).toBeVisible();
    await page.keyboard.press('Enter');
    await bench.settled();

    // Nothing was committed, so nothing was autosaved at all.
    const saved = await page.evaluate(() => localStorage.getItem('cabgen:autosave'));
    expect(saved, 'landing on a gallery changed the design').toBeNull();
    // And the option under the keyboard is the one already in force, not the
    // first tile — landing on a gallery must not preview a choice either.
    const pressed = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-pressed') ?? null,
    );
    expect(pressed).toBe('true');
  });
});
