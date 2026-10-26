import { describe, expect, it } from 'vitest';
import {
  buildProject,
  composeSheet,
  defaultExportOptions,
  defaultParams,
  planTiles,
  machiningReach,
  bboxOf,
} from '@cabgen/core';
import { partsTurnedOver, splitPasses, turnOverSteps, turnedFootprint } from '../src/turnOver';

/** A machine as big as the sheets: one setup, nothing tiled. */
function oneSetup() {
  const params = defaultParams();
  params.machine.travelX = 3000;
  params.machine.travelY = 1500;
  const project = buildProject(params);
  const sheet = project.nest.sheets.find((s) =>
    s.parts.some((p) =>
      project.parts
        .find((x) => x.id === p.partId)
        ?.features.some((f) => f.kind !== 'through' && f.side === 'B'),
    ),
  )!;
  const drawing = composeSheet(params, project.parts, sheet, defaultExportOptions()).drawing;
  return { params, project, sheet, drawing };
}

describe('a sheet that is turned over', () => {
  it('is split so neither picture carries the other pass', () => {
    const { drawing } = oneSetup();
    const { first, second } = splitPasses(drawing);
    expect(second).not.toBeNull();
    expect([...first.paths, ...first.circles].some((e) => e.layer.endsWith('_FLIP'))).toBe(false);
    expect([...second!.paths, ...second!.circles].every((e) => e.layer.endsWith('_FLIP'))).toBe(
      true,
    );
  });

  // The export looked wrong because second-face pockets were drawn on top of
  // the first pass, far from any part. Each is in fact inside its own part's
  // footprint once the sheet is turned over, and this is what proves the file
  // is right and the overlay was the lie.
  it('puts every second-face feature inside the part it belongs to, where that part lies once turned', () => {
    const { project, sheet, drawing } = oneSetup();
    const { second } = splitPasses(drawing);
    const turned = partsTurnedOver(sheet, project.parts);
    expect(turned.size).toBeGreaterThan(0);
    const footprints = sheet.parts
      .filter((p) => turned.has(p.partId))
      .map((p) => turnedFootprint(sheet, p));
    const inside = (b: { minX: number; maxX: number; minY: number; maxY: number }) =>
      footprints.some(
        (f) =>
          b.minX >= f.x - 1e-6 &&
          b.maxX <= f.x + f.w + 1e-6 &&
          b.minY >= f.y - 1e-6 &&
          b.maxY <= f.y + f.h + 1e-6,
      );
    expect(second!.paths.length).toBeGreaterThan(0);
    for (const path of second!.paths) expect(inside(bboxOf(path.path))).toBe(true);
    for (const c of second!.circles)
      expect(inside({ minX: c.x, maxX: c.x, minY: c.y, maxY: c.y })).toBe(true);
  });

  it('says plainly that a single-setup sheet has no locating holes', () => {
    const { params, project, sheet } = oneSetup();
    const tiles = planTiles(
      machiningReach(sheet, project.parts),
      sheet.width,
      params.machine,
      params.nesting.sheetMargin,
    );
    expect(tiles).toBeNull();
    expect(turnOverSteps(sheet, tiles).join(' ')).toMatch(/no locating holes/);
  });

  it('names the registration holes, and the second set, when the sheet is tiled', () => {
    const params = defaultParams();
    const project = buildProject(params);
    const sheet = project.nest.sheets.find((s) => s.length > params.machine.travelX)!;
    const tiles = planTiles(sheet.length, sheet.width, params.machine, params.nesting.sheetMargin)!;
    const text = turnOverSteps(sheet, tiles).join(' ');
    expect(text).toMatch(/TILE_REG\b/);
    expect(text).toMatch(/TILE_REG_FLIP/);
  });
});
