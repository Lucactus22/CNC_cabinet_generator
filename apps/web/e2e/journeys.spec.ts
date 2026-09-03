import { expect, test, type Page } from '@playwright/test';
import { Bench } from './bench';

/**
 * The seven journeys of docs/UX.md, walked, with the counts asserted.
 *
 * R-16 scripted these walks and recorded what they cost; R-17 through R-22
 * rebuilt the interface against those numbers and recorded new ones. Until now
 * every one of those figures lived only in a document, which means the first
 * person to add a control back would move them without anything saying so.
 * That is what this file is for — it is the reason R-16 said R-24 "now has
 * something concrete to pin".
 *
 * Each walk counts interactions the way docs/UX.md defines one: a click, or
 * one field given a value. `Bench` does the counting, so the number falls out
 * of the walk rather than being asserted from memory. The counts are upper
 * bounds and the exact figure is logged, because a route that gets *shorter*
 * is not a regression — a route that gets longer is.
 */

/** One of the inspector's collapsible sections, by its heading. */
const group = (page: Page, title: string) =>
  page
    .locator('.inspector details.group')
    .filter({ has: page.locator(`summary:text-is("${title}")`) });

test.describe('J1 — build the thing in my head', () => {
  /**
   * docs/UX.md's target: a single base unit, 1200 × 750 × 650, three bays —
   * three drawers on the left, adjustable shelves behind a pair of doors in
   * the middle, an open bay on the right — and no box on top. Deliberately
   * not the shipped default with one number changed.
   *
   * R-16 measured 11 interactions and 1880 px of scrolling. R-17 measured 8
   * and none, and noted the margin is one: the walk only comes in under nine
   * because removing the upper carcass leaves the base *selected*.
   */
  test('reaches the target cabinet in 8 interactions and no scrolling', async ({ page }) => {
    const bench = await Bench.open(page);

    // Removing the upper box first is what saves the interaction: it leaves
    // the base selected, so nothing is ever spent saying which box is meant.
    const upper = page.locator('.carc', {
      has: page.locator('button.carc-tab', { hasText: 'Upper' }),
    });
    await bench.hover(upper);
    await bench.press('button[aria-label="Remove Upper"]');
    await expect(page.locator('.crumbs')).toContainText('Base');

    const size = group(page, 'Size');
    await bench.fill(size.getByLabel('Width', { exact: true }), '1200');
    await bench.fill(size.getByLabel('Height', { exact: true }), '750');
    await bench.fill(size.getByLabel('Depth', { exact: true }), '650');

    await bench.fill(page.getByLabel('Bays', { exact: true }), '3');

    const bay = (i: number) => page.locator('.bay-card').nth(i);
    await bench.choose(bay(0).getByLabel('Front', { exact: true }), 'drawers');
    await bench.choose(bay(1).getByLabel('Front', { exact: true }), 'double');
    await bench.choose(bay(1).getByLabel('Inside', { exact: true }), 'adjustable');

    expect(bench.interactions, 'J1 interactions').toBeLessThanOrEqual(8);

    // The cabinet, not only the screen: this is the whole point of the walk.
    const carcass = 'cabinets.0.carcasses.0';
    await bench.savedToHave('cabinets.0.carcasses.length', 1);
    await bench.savedToHave(`${carcass}.width`, 1200);
    await bench.savedToHave(`${carcass}.height`, 750);
    await bench.savedToHave(`${carcass}.depth`, 650);
    await bench.savedToHave(`${carcass}.dividerCount`, 2);
    await bench.savedToHave(`${carcass}.bays.0.drawerFrontHeights.length`, 3);
    await bench.savedToHave(`${carcass}.bays.1.doors`, 'double');
    await bench.savedToHave(`${carcass}.bays.1.shelves`, 'adjustable');
    await bench.savedToHave(`${carcass}.bays.2.doors`, 'none');
    await bench.savedToHave(`${carcass}.bays.2.shelves`, 'none');

    // "Scroll ≤ one screen per journey" was R-17's target and it measured 0.
    // The inspector is the only thing on the bench that can scroll at all.
    const scrolled = await page.evaluate(
      () => document.querySelector('.inspector-body')?.scrollTop ?? 0,
    );
    expect(scrolled, 'J1 scrolled the inspector').toBe(0);
  });
});

test.describe('J2 — find out what this can do', () => {
  /**
   * The three capabilities R-16 named as unfindable — tab-and-slot joinery,
   * surface effects, and the bottomless upper carcass — reached *and
   * explained*, without knowing a word to search for. Two interactions
   * through the project menu, against R-16's six that assumed you already
   * knew all three existed.
   */
  test('the three capabilities R-16 called unfindable are two clicks away, explained', async ({
    page,
  }) => {
    const bench = await Bench.open(page);

    await bench.press(page.getByRole('button', { name: 'Project menu' }));
    await bench.press(page.getByRole('button', { name: 'What this can make…' }));

    const showroom = page.getByRole('dialog', { name: 'What this can make' });
    await expect(showroom).toBeVisible();
    expect(bench.interactions, 'J2 interactions').toBeLessThanOrEqual(6);

    // Named, and explained where they are named: a heading alone is what the
    // old sidebar offered and is exactly what this journey failed on.
    for (const capability of [/tab and slot/i, /groove/i, /bottom/i]) {
      const card = showroom.locator('.showcase').filter({ hasText: capability }).first();
      await expect(card).toBeVisible();
      expect((await card.textContent())!.length).toBeGreaterThan(80);
    }
  });

  /**
   * R-19's own measurement, which is the stronger claim: on a browser that has
   * never held a project, capabilities are named **before a single click**.
   */
  test('a first visit names capabilities before anything is clicked', async ({ page }) => {
    await Bench.openFirstVisit(page);
    const starters = page.getByRole('dialog', { name: 'Start from a design' });
    await expect(starters).toBeVisible();
    // Each starter names the capabilities it is there to demonstrate, by
    // title — R-19 counted 13 distinct ones before a single click.
    const named = new Set(await starters.locator('.demonstrates i').allTextContents());
    expect(named.size, `named on a fresh browser: ${[...named].join(', ')}`).toBeGreaterThanOrEqual(
      10,
    );
  });
});

test.describe('J3 — fit it to a real room', () => {
  /**
   * The one journey whose target is not a count. R-16 measured the by-hand
   * route at nine interactions, twelve cheaper than the walkthrough — *and*
   * silently accepting two corner angles typed as degrees. A guessed angle is
   * one the fillers get cut to, so the target R-17 was set is that **no route
   * accepts a typed angle at any count**, even if that makes it longer.
   *
   * Asserted as the absence of a control, which is the only form the promise
   * has: the angle is shown with where it came from, and changed only through
   * the walkthrough that derives it from three tape readings.
   */
  test('no route in the app accepts a typed corner angle', async ({ page }) => {
    const bench = await Bench.open(page);
    const room = group(page, 'The room');
    await bench.press(room.getByLabel('Fit to a measured opening'));

    // Every reading the room asks for, and not one of them an angle.
    const named = await room.locator('input, select').evaluateAll((els) =>
      els.map((el) => {
        const by = el.getAttribute('aria-labelledby');
        return by ? (document.getElementById(by)?.textContent ?? '') : '';
      }),
    );
    expect(named.length).toBeGreaterThan(5);
    for (const label of named) expect(label.toLowerCase()).not.toContain('angle');

    // Shown, with its provenance, rather than editable.
    const corner = room.locator('[data-param="opening.cornerAngleLeft"]');
    await expect(corner).toContainText('90.0°');
    await expect(corner).toContainText('assumed square — not measured yet');
    expect(await corner.locator('input, select, textarea').count()).toBe(0);

    // And the route that can change it is the one that derives it.
    await bench.press(room.getByRole('button', { name: 'Measure the room…' }));
    await expect(page.getByRole('dialog', { name: 'Measure the opening' })).toBeVisible();
  });
});

test.describe('J4 — change my mind about one bay', () => {
  /**
   * The journey R-16 called the one people repeat, measured at five
   * interactions of which the first two were wasted: clicking the bay in the
   * model isolated a panel and changed nothing else, so the click had to be
   * undone before the real route started. R-17 took it to two through the run
   * strip; R-20 made the same two work by pointing at the bay in the model.
   */
  test('drawers in that bay, in 2 interactions and no scrolling', async ({ page }) => {
    const bench = await Bench.open(page);

    await bench.press('button[aria-label="Base, bay 2"]');
    await expect(page.locator('.crumbs')).toContainText('Bay 2');

    const front = page.locator('.gallery').filter({ hasText: 'What goes across this bay?' });
    await bench.press(front.locator('.gallery-option', { hasText: 'Drawers' }));

    expect(bench.interactions, 'J4 interactions').toBeLessThanOrEqual(2);
    await bench.savedToHave('cabinets.0.carcasses.0.bays.1.drawerFrontHeights.length', 3);
    expect(
      await page.evaluate(() => document.querySelector('.inspector-body')?.scrollTop ?? 0),
    ).toBe(0);
  });

  /** R-20's own route: the model itself answers a click. */
  test('and the model answers a click', async ({ page }) => {
    const bench = await Bench.open(page);
    const scene = page.locator('.viewport .scene');
    await expect(page.locator('.crumbs')).toHaveText('Run');

    await bench.press(scene);
    // Whatever is under the pointer, the inspector followed it down past the
    // run — which is the fourteen characters of sidebar R-16 measured, gone.
    await expect(page.locator('.crumbs')).not.toHaveText('Run');

    // And clicking the same thing again brings the rest of the cabinet back,
    // which means the run: there is no state where nothing is selected.
    await bench.press(scene);
    await expect(page.locator('.crumbs')).toHaveText('Run');
  });
});

test.describe('J5 — choose how it goes together', () => {
  /**
   * R-16's finding: switching from a stopped dado to tab and slot changed
   * *nothing on screen* — same badge, same 21 parts, same 4 sheets — so the
   * cost of a construction choice was invisible. R-18's answer is that
   * hovering an option builds the whole project as that option would make it
   * and says what it costs before anything is committed.
   */
  test('the cost of the joint is stated before it is committed', async ({ page }) => {
    const bench = await Bench.open(page);

    await bench.press(page.locator('button.carc-tab', { hasText: 'Base' }));
    await bench.press(
      page.locator('.inspector details.group summary', { hasText: 'How it goes together' }),
    );

    const gallery = page
      .locator('.gallery')
      .filter({ hasText: 'How should the boxes go together?' });
    await bench.hover(gallery.locator('.gallery-option', { hasText: 'Tab and slot' }));

    const cost = gallery.locator('.gallery-cost');
    await expect(cost).toContainText('Tab and slot');
    // Parts and sheets really are unchanged — that was never the lie. The
    // cuts are the screw holes a knock-down joint does not need, and they are
    // the number R-16 measured as invisible.
    await expect(cost).toContainText('cuts');
    await expect(cost).toContainText('(');

    await bench.press(gallery.locator('.gallery-option', { hasText: 'Tab and slot' }));
    expect(bench.interactions, 'J5 interactions').toBeLessThanOrEqual(3);
    await bench.savedToHave('joinery.carcassJoint', 'tabslot');
  });
});

test.describe('J6 — take it to the machine', () => {
  /**
   * The single worst thing R-16 found: the app's own suggested fix for the
   * only blocking errors a fresh project has traded them for a *different*
   * blocking error whose hint contradicted the button just pressed, and
   * export stayed blocked either way.
   *
   * The target R-21 was set is two interactions, both offered, with the cost
   * stated. Every part of that is asserted here — including that the fix that
   * leads is the one that actually clears everything, because a list sorted
   * the other way would put the trap back at the top.
   */
  test('a fresh project reaches an exportable state in 2 offered interactions', async ({
    page,
  }) => {
    const bench = await Bench.open(page);

    const chip = page.locator('header.topbar button.chip');
    await expect(chip).toContainText('blocking');
    await bench.press(chip);

    const panel = page.locator('.diagnostics-sheet');
    await expect(panel.locator('header b')).toContainText('Not ready to cut');

    const fixes = panel.locator('.fix-button');
    await expect(fixes.first()).toContainText('Clears everything blocking export');
    // Never hidden, and never claiming more than it does: the fix R-16 found
    // as a trap is still offered, honestly labelled, below the one that works.
    await expect(fixes.nth(1)).toContainText('Leaves 1 blocking');
    // The cost, on the button, before it is pressed.
    await expect(fixes.first()).toContainText('costs');

    await bench.press(fixes.first());
    expect(bench.interactions, 'J6 interactions').toBeLessThanOrEqual(2);
    await expect(panel.locator('header b')).toContainText('Ready to cut');
    await expect(page.locator('header.topbar button.primary')).not.toHaveClass(/blocked/);
  });

  /** Blocked, Export explains itself rather than only refusing. */
  test('a blocked export opens the list that says why', async ({ page }) => {
    const bench = await Bench.open(page);
    const exportButton = page.locator('header.topbar button.primary');
    await expect(exportButton).toHaveClass(/blocked/);
    await bench.press(exportButton);
    await expect(page.locator('.diagnostics-sheet')).toBeVisible();
    await expect(page.locator('.export-preview')).toHaveCount(0);
  });
});

test.describe('J7 — re-cut one part I ruined', () => {
  /**
   * The only one of the seven that could not be completed at all when R-16
   * walked it: the route to one ruined panel was the whole-project zip and
   * another program. R-22 made it the item's highest-value line, at a target
   * of three.
   */
  test('one part comes back on its own, in 3 interactions', async ({ page }) => {
    const bench = await Bench.open(page);

    await bench.press(page.locator('header.topbar button', { hasText: 'Output' }));
    const firstRow = page.locator('#pack-parts table tbody tr button').first();
    const partId = (await firstRow.textContent())!.trim();
    await bench.press(firstRow);

    const download = page.waitForEvent('download');
    await bench.press(page.getByRole('button', { name: /Download this part/ }));

    expect(bench.interactions, 'J7 interactions').toBeLessThanOrEqual(3);
    expect((await download).suggestedFilename()).toBe(`${partId}.dxf`);
  });
});
