import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Bench } from './bench';

/**
 * The three flows R-14 named and R-24 inherited: change a parameter and see
 * the preview update, add an effect, export a zip.
 *
 * These are the ones a component test cannot make: the preview is a WebGL
 * scene, the effect renders as machining on a panel, and the zip is a file a
 * browser hands to a disk. Each is asserted at the far end — the pixels, the
 * geometry, the bytes — rather than at the click.
 */

test('a changed parameter reaches the model, the badge and the sheets', async ({ page }) => {
  const bench = await Bench.open(page);
  const scene = page.locator('.viewport');
  const badge = page.locator('header.topbar > span.badge');

  await expect(badge).toContainText('900 × 2000 mm');
  const before = await scene.screenshot();

  await bench.press(page.locator('button.carc-tab', { hasText: 'Base' }));
  const size = page
    .locator('.inspector details.group')
    .filter({ has: page.locator('summary:text-is("Size")') });
  await bench.fill(size.getByLabel('Width', { exact: true }), '1800');

  await expect(badge).toContainText('1800 ×');
  await bench.savedToHave('cabinets.0.carcasses.0.width', 1800);

  // The picture, not only the number. A model that stopped redrawing would
  // leave every count above correct and the workspace a lie.
  await expect
    .poll(async () => Buffer.compare(await scene.screenshot(), before), {
      message: 'the 3D view did not redraw',
    })
    .not.toBe(0);

  // And the sheets it is nested on, which is what actually gets cut.
  await bench.press(page.locator('header.topbar button', { hasText: 'Output' }));
  await expect(page.locator('#pack-sheets svg').first()).toBeVisible();
});

test('an effect adds machining to the panels it names', async ({ page }) => {
  const bench = await Bench.open(page);

  const effects = page
    .locator('.inspector details.group')
    .filter({ has: page.locator('summary:text-is("Surface effects")') });
  await bench.press(effects.locator('summary'));
  await bench.press(effects.getByRole('button', { name: 'Add an effect' }));

  // The effect exists, targets a role, and says how many panels it caught —
  // "0 panels" is the shape this feature fails in, and it looks identical
  // to working until somebody opens the DXF.
  await expect(effects.locator('.effect-head strong')).toContainText('Grooves');
  await expect(effects.locator('.effect-head strong')).toContainText('panels');
  await expect(effects.locator('.effect-head strong')).not.toContainText('0 panels');
  await bench.savedToHave('surfaceEffects.0.effect.kind', 'grooves');

  // And it is one undo step, like every other change.
  await bench.press(page.getByRole('button', { name: 'Undo' }));
  await bench.savedToHave('surfaceEffects.length', 0);
});

test('the export writes a zip holding the files the preview promised', async ({ page }) => {
  const bench = await Bench.open(page);

  // A fresh project is blocked on the shipped machine; take the offered fix.
  await bench.press(page.locator('header.topbar button.chip'));
  await bench.press(page.locator('.diagnostics-sheet .fix-button').first());

  await bench.press(page.locator('header.topbar button.primary'));
  const preview = page.getByRole('dialog', { name: 'Export preview' });
  await expect(preview).toBeVisible();
  // The beat before real material is committed: what is in the zip, and what
  // to buy, said before the download rather than after it.
  await expect(preview.locator('.export-thumbs .export-thumb').first()).toBeVisible();
  await expect(preview).toContainText('sheets');
  const sheetsPromised = await preview.locator('.export-thumbs .export-thumb').count();

  const download = page.waitForEvent('download');
  await bench.press(preview.getByRole('button', { name: 'Download the zip' }));
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.zip$/);

  const names = entriesOf(readFileSync((await file.path())!));
  expect(names.length).toBeGreaterThan(0);
  // Every sheet the preview drew is a file in the zip, and the paperwork the
  // pack promises is in there too.
  expect(names.filter((n) => n.endsWith('.dxf')).length).toBeGreaterThanOrEqual(sheetsPromised);
  expect(names.some((n) => n.endsWith('.csv'))).toBe(true);
});

/**
 * The names in a store-mode zip's central directory.
 *
 * `apps/web/src/download.ts` writes the archive by hand rather than pulling in
 * a compression library; reading it back with an independent parser is what
 * makes "it downloaded something" into "it downloaded a zip a tool can open".
 */
function entriesOf(zip: Buffer): string[] {
  const names: string[] = [];
  for (let at = 0; at + 4 <= zip.length; at++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) continue;
    const nameLength = zip.readUInt16LE(at + 28);
    names.push(zip.subarray(at + 46, at + 46 + nameLength).toString('utf8'));
  }
  return names;
}
