import { expect, test } from '@playwright/test';
import { Walk, controlsOnScreen, dismissSuggestion, openAtRest } from './walk';

/**
 * The journeys of docs/UX.md, walked and counted in a real browser.
 *
 * R-16 measured seven journeys by hand and set targets for them; R-17 rebuilt
 * the interface and re-measured. Those numbers are the only claim in this
 * repository that nothing else can check — the counts live in a document, and
 * a document cannot notice when somebody adds a control back into a route.
 * That is what these are for, and it is the concrete thing R-24 was given to
 * pin.
 *
 * A count that changes here is not automatically a failure. It means the
 * route changed and docs/UX.md has to be re-measured and told about it.
 */

test.describe('the shell at rest', () => {
  /**
   * R-17 got this to 20 against a target of ≤ 20; R-23 last measured 26,
   * which was taken with R-19's once-only suggestion line showing. Split in
   * two here, because the two numbers describe different sessions: 23 is the
   * steady state, and each of the three over R-17's budget is a later item's
   * own deliberate addition.
   *
   * - *At the machine* in the top bar (R-22)
   * - the info button beside the project's name (R-22, F-10: a tablet at the
   *   machine cannot hover, so no explanation may live only in a `title`)
   * - the section-plane button in the viewport (R-20)
   *
   * A brand-new browser shows three more for a moment — R-19's once-only
   * suggestion line — which is the next test.
   *
   * Pinned exactly rather than as a ceiling, for the same reason the golden
   * DXF files are: an at-rest count that drifts a control at a time is how a
   * budget stops meaning anything. If you changed this on purpose, re-measure
   * and say so in docs/UX.md.
   */
  test('renders 23 controls, all of them about the run or the selection', async ({ page }) => {
    await openAtRest(page);
    await dismissSuggestion(page);
    // Named rather than only counted. A count alone passes over a control
    // with no accessible name at all — which is what the explode slider was
    // until this listed what it found and the entry read `range`.
    const controls = await controlsOnScreen(page);
    // Nothing nameless. This is the assertion that failed first, and it is
    // the one worth keeping: a control a screen reader cannot name is
    // unreachable however visible it is.
    expect(controls.filter((name) => name.startsWith('UNNAMED:'))).toEqual([]);
    expect(controls.sort()).toEqual(
      [
        '2 blocking',
        'Add a cabinet to the end of the run',
        'At the machine',
        'Base',
        'Base, bay 1',
        'Base, bay 2',
        'Explode',
        'Export DXF',
        'Find… ⌘K',
        'Fit to a measured opening',
        'Measure the room…',
        'Name',
        'Output',
        'Project menu',
        'Redo',
        'Section',
        'Stacked unit',
        'Undo',
        'Upper',
        'Upper, bay 1',
        'Upper, bay 2',
        'What this does',
        'Workshop 2',
      ].sort(),
    );
  });

  test('offers one quiet line on a new browser, and never again once spent', async ({ page }) => {
    await openAtRest(page);
    const line = page.getByLabel('Something this could do');
    await expect(line).toBeVisible();
    expect(await controlsOnScreen(page)).toHaveLength(26);

    await line.getByRole('button', { name: 'Dismiss, and do not show this again' }).click();
    await expect(line).toHaveCount(0);

    // Not just this session: a tip that comes back is the failure R-19's rule
    // about suggestions exists to prevent. The line waits for the selection to
    // sit still before it says anything, so asserting its absence the instant
    // the page reloads asserts nothing — it is not there yet either way.
    // `openAtRest` already proved that wait is shorter than the visibility
    // timeout, so the same timeout is a fair test of its absence.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Export DXF' })).toBeVisible();
    await expect(line).toHaveCount(0, { timeout: 5_000 });
  });

  test('gives the cabinet the window, not a form beside it', async ({ page }) => {
    await openAtRest(page);
    const share = async (): Promise<{ gross: number; net: number }> =>
      page.evaluate(() => {
        const stage = document.querySelector('.stage')!.getBoundingClientRect();
        const card = document.querySelector('.inspector')!.getBoundingClientRect();
        const whole = window.innerWidth * window.innerHeight;
        return {
          gross: (stage.width * stage.height) / whole,
          net: (stage.width * stage.height - card.width * card.height) / whole,
        };
      });

    // R-16 measured 42.7% at this size and set ≥ 70%. The readings rather than
    // the target: a check that only asserted "> 70%" would sit still while the
    // inspector grew back, year by year, to the sidebar this replaced.
    //
    // Twice, because the inspector's height is its contents: R-23's 73.1% was
    // taken with the once-only suggestion line in the card, and every session
    // after the first is the taller number.
    expect(await share()).toMatchObject({
      gross: expect.closeTo(0.844, 2),
      net: expect.closeTo(0.731, 2),
    });

    await dismissSuggestion(page);
    expect(await share()).toMatchObject({
      gross: expect.closeTo(0.844, 2),
      net: expect.closeTo(0.757, 2),
    });
  });

  test('needs no scrolling to reach what it shows', async ({ page }) => {
    await openAtRest(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

/**
 * J1 — build the thing in my head.
 *
 * A single base unit, 1200 × 750 × 650, three bays: three drawers on the
 * left, adjustable shelves behind a pair of doors in the middle, an open bay
 * on the right, and no box on top. Deliberately not the default with one
 * number changed. R-16 walked it in 11 interactions and 1880 px of scrolling;
 * R-17 measured 8 and no scrolling.
 */
test('J1: builds the target cabinet in eight interactions and no scrolling', async ({ page }) => {
  await openAtRest(page);
  const walk = new Walk(page);
  const inspector = page.getByLabel('Inspector');

  // Removing the upper carcass leaves the base selected, the way every list
  // behaves — which is the whole reason this walk is 8 and not 9. The remove
  // button appears on the box under the pointer, so reaching it costs a hover
  // and no interaction: docs/UX.md counts input acts, and moving the mouse to
  // the thing you are about to click is not one.
  await page.locator('.carc').filter({ hasText: 'Upper' }).first().hover();
  await walk.click(page.getByRole('button', { name: 'Remove Upper' }));
  const field = (label: string) => inspector.getByRole('spinbutton', { name: label, exact: true });
  await walk.set(field('Width'), '1200');
  await walk.set(field('Height'), '750');
  await walk.set(field('Depth'), '650');
  await walk.set(field('Bays'), '3');

  const bay = (n: number) => inspector.locator('.bay-card').filter({ hasText: `Bay ${n}` });
  await walk.choose(bay(1).getByLabel('Front'), 'Drawers');
  await walk.choose(bay(2).getByLabel('Front'), 'Pair of doors');
  await walk.choose(bay(2).getByLabel('Inside'), 'Adjustable');

  expect(walk.interactions).toBe(8);

  const carcass = (await walk.params()).cabinets[0]!.carcasses[0]!;
  expect(carcass).toMatchObject({ width: 1200, height: 750, depth: 650, dividerCount: 2 });
  expect(carcass.bays[0]!.drawerFrontHeights.length).toBe(3);
  expect(carcass.bays[1]).toMatchObject({ doors: 'double', shelves: 'adjustable' });
  expect(carcass.bays[2]).toMatchObject({ doors: 'none', shelves: 'none' });
  // One carcass left, so nothing stands on top of it.
  expect((await walk.params()).cabinets[0]!.carcasses.length).toBe(1);

  expect(
    await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
  ).toBeLessThanOrEqual(0);
});

/**
 * J4 — change my mind about one bay.
 *
 * R-16 walked this in five interactions, the first two of them wasted:
 * clicking the bay in the 3D view did nothing the sidebar answered, so the
 * click had to be undone and the bay found by number instead. R-17 measured 2.
 */
test('J4: puts drawers in that bay in two interactions', async ({ page }) => {
  await openAtRest(page);
  const walk = new Walk(page);

  await walk.click(page.getByRole('button', { name: 'Base, bay 1' }));
  await walk.click(page.getByRole('button', { name: /^Drawers/ }));

  expect(walk.interactions).toBe(2);
  const bay = (await walk.params()).cabinets[0]!.carcasses[0]!.bays[0]!;
  expect(bay.drawerFrontHeights.length).toBeGreaterThan(0);
});

/**
 * J6 — take it to the machine.
 *
 * The worst thing R-16 found. A fresh project has two blocking errors that
 * are about the machine rather than the design, and the app's own suggested
 * fix traded them for a different blocking error whose hint contradicted the
 * button. R-21 made every fix prove itself first; the target was ≤ 2
 * interactions, offered, with the cost stated.
 */
test('J6: reaches a cuttable project in two interactions, from the fix it offers first', async ({
  page,
}) => {
  await openAtRest(page);
  const walk = new Walk(page);

  const chip = page.getByRole('button', { name: /blocking/ });
  await expect(chip).toBeVisible();
  await walk.click(chip);

  const first = page.locator('.fix-button').first();
  // The cost is on the button, before it is pressed.
  await expect(first).toContainText('Clears everything blocking export');
  await expect(first).toContainText('costs');
  await walk.click(first);

  expect(walk.interactions).toBe(2);
  await walk.settled();
  await expect(page.getByRole('button', { name: /blocking/ })).toHaveCount(0);

  // …and export is genuinely open now, not merely un-red.
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Export DXF' }).click();
  await expect(page.getByRole('dialog', { name: 'Export preview' })).toBeVisible();
});

/**
 * J2 — find out what this can do.
 *
 * R-16 reached three capabilities in six interactions and was told what none
 * of them were: tab-and-slot was 3550 px down a column with no explanation,
 * effects 5224 px, guillotine nesting 6538 px, and twelve of seventeen groups
 * were closed at rest and rendered nothing at all (F-6). The target was the
 * same six, each explained where it lands.
 *
 * Counted as two acts per capability: one to open find-by-name, one to give
 * the field the word. That is the reading docs/UX.md's own six was taken
 * under — the query and the Enter that commits it are one field given a
 * value, not two.
 */
test('J2: reaches three capabilities by name in six interactions, each explained', async ({
  page,
}) => {
  await openAtRest(page);
  const walk = new Walk(page);
  const inspector = page.getByLabel('Inspector');

  for (const [word, control] of [
    ['knock-down', 'joinery.carcassJoint'],
    ['beadboard', 'surfaceEffects'],
    ['guillotine', 'nesting.strategy'],
  ] as const) {
    // The trade's word, not the app's: none of these three appears on the
    // label of the control it finds.
    await walk.find(word);

    // Landed on the control itself — and on something that says what it is,
    // rather than a bare field with a jargon label. That is the half of J2
    // the old sidebar failed: the capabilities were all reachable in
    // principle and none of them explained.
    const landed = page.locator(`[data-param="${control}"]`).first();
    await expect(landed).toBeVisible();
    const explains = landed.locator('.gallery-question, .infotip-btn, .about, .hint');
    await expect(explains.first()).toBeVisible();
  }

  expect(walk.interactions).toBe(6);

  // The palette searches the explanations as well as the settings, so a word
  // for a thing finds what it *is* and not only where it is set.
  await page.getByRole('button', { name: /Find…/ }).click();
  const palette = page.getByRole('dialog', { name: 'Find a setting' });
  await palette.getByRole('textbox').fill('dogbone');
  await expect(palette.getByText('What it is').first()).toBeVisible();
  await expect(inspector).toBeVisible();
});

/**
 * J5 — choose how it goes together.
 *
 * Three interactions to change the joint, and zero to find out what it cost:
 * R-16 measured the top bar reading `900 × 2000 mm · 21 parts · 4 sheets`
 * before and after switching to tab and slot. The target was the same three,
 * with the cost shown *before* committing.
 */
test('J5: changes the joint in three interactions, with the cost shown first', async ({ page }) => {
  await openAtRest(page);
  const walk = new Walk(page);

  await walk.click(page.locator('.carc-tab').filter({ hasText: 'Base' }));
  await walk.click(page.getByLabel('Inspector').getByText('How it goes together', { exact: true }));

  const option = page.getByRole('button', { name: /Tab and slot/ }).first();
  // Hovering is not an input act, and it is where the answer appears: the
  // whole option built on the real design, priced in the shop's own terms.
  await option.hover();
  // Named, not just priced: the preview is coalesced and tagged, so a cost
  // line that said something plausible about the *previously* hovered option
  // would be exactly the failure the tag exists to prevent.
  const cost = page.locator('.gallery-cost');
  await expect(cost).toContainText('Tab and slot');
  await expect(cost).toContainText(/[+−-]\d/);

  await walk.click(option);
  expect(walk.interactions).toBe(3);
  expect((await walk.params()).joinery.carcassJoint).toBe('tabslot');
});

/**
 * J3 — fit it to a real room.
 *
 * The one journey where a lower count would be a worse tool. Its target is
 * not fewer interactions but that no corner angle can be guessed: the by-hand
 * route used to accept a typed angle defaulting to 90, and a guessed angle is
 * one the fillers get cut to.
 */
test('J3: offers nowhere to type a corner angle', async ({ page }) => {
  await openAtRest(page);
  await page.getByLabel('Fit to a measured opening').check();

  const inspector = page.getByLabel('Inspector');
  await expect(inspector.getByLabel('Width at the top')).toBeVisible();
  // Every field in the room panel, by its label. An angle among them would be
  // an angle somebody could guess.
  const labels = await inspector.locator('.field label').allInnerTexts();
  expect(labels.join(' ').toLowerCase()).not.toContain('angle');

  const opener = page.getByRole('button', { name: 'Measure the room…' });
  await opener.click();
  const wizard = page.getByRole('dialog', { name: /measur/i });
  await expect(wizard).toBeVisible();

  // The one keyboard defect R-23 actually found, and the only one it wrote a
  // paragraph about: Escape did nothing here, because the listener was keyed
  // on a prop rebuilt every render and the global handler's own store update
  // re-rendered the inspector during the same event's dispatch. It is also
  // the dialog you most want to back out of — eleven tape readings deep.
  await page.keyboard.press('Escape');
  await expect(wizard).toHaveCount(0);
  await expect(opener).toBeFocused();
});

/**
 * J7 — re-cut one part I ruined.
 *
 * The only one of the seven that could not be completed at all before R-22.
 */
test('J7: gets one part out on its own, in three interactions', async ({ page }) => {
  await openAtRest(page);
  const walk = new Walk(page);

  await walk.click(page.getByRole('button', { name: 'Output' }));
  await walk.click(page.locator('table.parts tbody .row-pick').first());

  const download = page.waitForEvent('download');
  await walk.click(page.getByRole('button', { name: /Download this part/ }));
  expect(walk.interactions).toBe(3);

  // A file with geometry in it, not merely a button that was clickable: this
  // is the only one of the seven journeys that could not be completed at all
  // before R-22, and "you can press it" is what it looked like then too.
  const file = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of file) chunks.push(chunk as Buffer);
  const dxf = Buffer.concat(chunks).toString();
  expect(dxf).toContain('SECTION');
  expect(dxf).toContain('OUTLINE');
});
