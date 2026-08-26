import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildProject, defaultParams, exportProject } from '../src/index.js';

/**
 * The 0.1 output, frozen.
 *
 * R-03 turned the two hardcoded carcasses into a project holding a list of
 * cabinets. That is a refactor: the same parameters must still cut the same
 * plywood. These files were written by 0.1 before a line of it was touched, and
 * a byte that moves here means somebody has changed a real dimension while
 * meaning only to move code.
 *
 * Labels are off in the fixture on purpose. Part IDs gained a cabinet prefix
 * (`B-SIDE-L` became `C1-B-SIDE-L`), and the ID is engraved on the LABEL layer,
 * so the labelled DXF cannot be byte-identical and never will be again. The
 * geometry can, and is. The prefixing itself is pinned separately below.
 */
const GOLDEN_DIR = fileURLToPath(new URL('./golden/default-0.1/', import.meta.url));

/** Every part 0.1 produced from the default parameters, in build order. */
const PARTS_0_1 = [
  'B-SIDE-L',
  'B-SIDE-R',
  'B-TOP',
  'B-BOTTOM',
  'B-TOERAIL',
  'B-DIV-1',
  'B-SHELF-2-1',
  'B-DOOR-1',
  'B-DOOR-2',
  'B-BACK',
  'T-SIDE-L',
  'T-SIDE-R',
  'T-TOP',
  'T-BOTTOM',
  'T-DIV-1',
  'T-SHELF-1-1',
  'T-SHELF-1-2',
  'T-SHELF-1-3',
  'T-SHELF-1-4',
  'T-SHELF-ADJ-2',
  'T-BACK',
];

const SHEETS_0_1 = [
  'stacked-built-in-sheet1.dxf',
  'stacked-built-in-sheet2.dxf',
  'stacked-built-in-sheet3.dxf',
  'stacked-built-in-sheet4.dxf',
];

describe('the 0.1 default project', () => {
  it('still exports byte-identical sheet DXF', () => {
    const params = defaultParams();
    // The one deliberate difference between 0.1 and now, isolated so the rest
    // can be compared as bytes. See the note above.
    params.labelParts = false;

    const files = new Map(exportProject(buildProject(params)).files.map((f) => [f.name, f.dxf]));

    for (const name of SHEETS_0_1) {
      const expected = readFileSync(GOLDEN_DIR + name, 'utf8');
      expect(files.get(name), `${name} is missing from the export`).toBeDefined();
      expect(files.get(name), `${name} differs from the 0.1 output`).toBe(expected);
    }
  });

  it('produces the same files, in the same order', () => {
    const params = defaultParams();
    params.labelParts = false;
    const names = exportProject(buildProject(params)).files.map((f) => f.name);
    // Tiles come from clipping the very drawing compared above, so the sheets
    // matching means the tiles do too. What this pins is that the same sheets,
    // and the same number of setups, still come out.
    expect(names).toEqual([
      'stacked-built-in-sheet1.dxf',
      'stacked-built-in-sheet1-tile1.dxf',
      'stacked-built-in-sheet1-tile2.dxf',
      'stacked-built-in-sheet1-tile3.dxf',
      'stacked-built-in-sheet2.dxf',
      'stacked-built-in-sheet2-tile1.dxf',
      'stacked-built-in-sheet2-tile2.dxf',
      'stacked-built-in-sheet2-tile3.dxf',
      'stacked-built-in-sheet3.dxf',
      'stacked-built-in-sheet3-tile1.dxf',
      'stacked-built-in-sheet3-tile2.dxf',
      'stacked-built-in-sheet3-tile3.dxf',
      'stacked-built-in-sheet4.dxf',
      'stacked-built-in-sheet4-tile1.dxf',
      'stacked-built-in-sheet4-tile2.dxf',
      'stacked-built-in-cutlist.csv',
    ]);
  });

  it('builds the same parts, in the same order, under a cabinet prefix', () => {
    const ids = buildProject(defaultParams()).parts.map((p) => p.id);
    // A part that appears, disappears or moves in this list has changed what
    // comes off the machine, whatever the DXF bytes say.
    expect(ids).toEqual(PARTS_0_1.map(withCabinetPrefix));
  });

  it('engraves the prefixed id on every part', () => {
    const engraved = buildProject(defaultParams())
      .parts.flatMap((p) => p.features.filter((f) => f.kind === 'engrave').map((f) => f.text))
      .sort();
    expect(engraved).toEqual(PARTS_0_1.map(withCabinetPrefix).sort());
  });
});

/**
 * How a 0.1 part ID reads now.
 *
 * Kept as a function rather than a literal list so the prefixing scheme is
 * stated once: if it changes, this is the line that has to be argued with.
 */
const withCabinetPrefix = (id: string): string => `C1-${id}`;
