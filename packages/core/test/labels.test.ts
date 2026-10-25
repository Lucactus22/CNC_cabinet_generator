import { describe, expect, it } from 'vitest';
import {
  applyToPath,
  buildProject,
  composeSheet,
  defaultExportOptions,
  defaultParams,
  exportProject,
  forcesFace,
  partsNeedingFlip,
  partTransform,
  rectInside,
} from '../src/index.js';

/**
 * R-10. The label sheet's whole job is letting someone match a printed label
 * back to the right blank off a stack of freshly-cut panels, so id, size and
 * which face is up all have to agree with what the machine actually produced
 * — never a second, hand-derived description that could drift from it.
 */
describe('label sheet', () => {
  const project = buildProject(defaultParams());

  it('has exactly one label per part, in the same order as the cut list', () => {
    expect(project.labels).toHaveLength(project.parts.length);
    expect(project.labels.map((l) => l.id)).toEqual(project.parts.map((p) => p.id));
  });

  it("reuses the part's own label as the description, not a second invented one", () => {
    for (const label of project.labels) {
      const part = project.parts.find((p) => p.id === label.id)!;
      expect(label.description).toBe(part.label);
    }
  });

  it('agrees with the cut list on size, since both describe the same blank', () => {
    for (const label of project.labels) {
      const row = project.cutList.concat(project.stockCutList).find((r) => r.id === label.id)!;
      expect(label.length).toBeCloseTo(row.length, 6);
      expect(label.width).toBeCloseTo(row.width, 6);
      expect(label.thickness).toBeCloseTo(row.thickness, 6);
    }
  });

  it('says which face is up exactly when the part forces one', () => {
    for (const label of project.labels) {
      const part = project.parts.find((p) => p.id === label.id)!;
      const forced = part.features.some(forcesFace);
      if (forced) expect(label.faceUp).not.toBe('either');
      else expect(label.faceUp).toBe('either');
    }
  });

  it('flags exactly the parts that need turning over, and the default project has at least one', () => {
    const flipped = new Set(partsNeedingFlip(project.parts).map((p) => p.id));
    expect(flipped.size).toBeGreaterThan(0);
    for (const label of project.labels) {
      expect(label.flipped).toBe(flipped.has(label.id));
    }
  });

  it('names solid stock by its own material list, not the sheet materials', () => {
    const params = defaultParams();
    params.cabinets[0]!.carcasses[0]!.construction = 'face-frame';
    const p2 = buildProject(params);
    const stile = p2.labels.find((l) => l.role === 'stile')!;
    const stockNames = new Set(params.stockMaterials.map((m) => m.name));
    expect(stockNames.has(stile.material)).toBe(true);
  });
});

describe('the engraved ID', () => {
  // A face-framed carcass as well, for the stiles: 44 mm wide and 782 long,
  // the one part where reading along local u would leave the board at once.
  const framed = defaultParams();
  framed.cabinets[0]!.carcasses[0]!.construction = 'face-frame';

  for (const [name, params] of [
    ['the default project', defaultParams()],
    ['a face-framed base', framed],
  ] as const) {
    const project = buildProject(params);
    const nested = [
      ...project.nest.sheets.map((s) => ({ sheet: s, kind: 'sheet' })),
      ...project.stockNest.sheets.map((s) => ({ sheet: s, kind: 'board' })),
    ];

    it(`stays on the part it names, however the nester turned it, in ${name}`, () => {
      // Every part the nester turns a quarter — grain-locked sides, dividers,
      // doors — once had its ID start 12 mm inside its edge and run some
      // 50 mm on across the part gap into its neighbour. Checked against the
      // drawn outline, not its bounding box: a side panel's corner is its toe
      // kick notch, and a label inside the box can still be in thin air.
      let turned = 0;
      for (const { sheet } of nested) {
        const { drawing } = composeSheet(project.params, project.parts, sheet, {
          ...defaultExportOptions(),
        });
        for (const placed of sheet.parts) {
          const part = project.parts.find((p) => p.id === placed.partId)!;
          const outline = applyToPath(part.outline, partTransform(part, placed));
          const text = drawing.texts.find((t) => t.text === part.id)!;
          const deg = text.rotation ?? 0;
          if (deg !== 0) turned++;
          const rad = (deg * Math.PI) / 180;
          const run = { x: Math.round(Math.cos(rad)), y: Math.round(Math.sin(rad)) };
          const up = { x: -run.y, y: run.x };
          // A generous letter width: wider than any CAM font engraves.
          const length = text.text.length * text.height;
          const xs = [text.x, text.x + run.x * length, text.x + up.x * text.height];
          const ys = [text.y, text.y + run.y * length, text.y + up.y * text.height];
          const footprint = {
            x0: Math.min(...xs, text.x + run.x * length + up.x * text.height),
            x1: Math.max(...xs, text.x + run.x * length + up.x * text.height),
            y0: Math.min(...ys, text.y + run.y * length + up.y * text.height),
            y1: Math.max(...ys, text.y + run.y * length + up.y * text.height),
          };
          expect(rectInside(outline, footprint), `${part.id} on ${sheet.index + 1}`).toBe(true);
        }
      }
      expect(turned).toBeGreaterThan(0);
    });
  }

  it('is cut on face A, in the first pass, and the written file says how it is turned', () => {
    // Face A is cut in the first pass on every part, so the ID is never the
    // reason a panel is turned over.
    const project = buildProject(defaultParams());
    for (const part of project.parts) {
      const label = part.features.find((f) => f.kind === 'engrave');
      expect(label?.side).toBe('A');
    }
    const files = exportProject(project).files.filter((f) => /-sheet\d+\.dxf$/.test(f.name));
    expect(files.some((f) => /\r\nLABEL_FLIP\r\n/.test(f.dxf))).toBe(false);
    // A TEXT entity turned a quarter carries its angle in group 50.
    expect(files.some((f) => /\r\n50\r\n(90|180|270)\.000000\r\n/.test(f.dxf))).toBe(true);
  });
});
