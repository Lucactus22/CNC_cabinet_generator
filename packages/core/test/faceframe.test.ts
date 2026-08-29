import { describe, expect, it } from 'vitest';
import { base } from './carcasses.js';
import {
  buildProject,
  defaultParams,
  doorLeafRect,
  type DrillFeature,
  type FrontOpening,
  type Part,
  type PocketFeature,
} from '../src/index.js';
import type { ProjectParams } from '../src/model/types.js';

const faceFramed = (patch: (p: ProjectParams) => void = () => {}): ProjectParams => {
  const p = defaultParams();
  base(p).construction = 'face-frame';
  patch(p);
  return p;
};

const find = (parts: Part[], id: string): Part => {
  const part = parts.find((p) => p.id === id);
  if (!part) throw new Error(`No part '${id}'`);
  return part;
};
const lapPockets = (p: Part): PocketFeature[] =>
  p.features.filter(
    (f): f is PocketFeature => f.kind === 'pocket' && f.purpose === 'face-frame-lap',
  );
const platesOn = (p: Part): DrillFeature[] =>
  p.features.filter((f): f is DrillFeature => f.kind === 'drill' && f.purpose === 'hinge-plate');

describe('half-lap joints between stiles and rails', () => {
  const project = buildProject(faceFramed());
  const parts = project.parts;
  // 44 mm stock, 900 mm carcass, one divider at the midpoint.
  const stileL = find(parts, 'C1-B-STILE-L');
  const stileR = find(parts, 'C1-B-STILE-R');
  const stileM = find(parts, 'C1-B-STILE-M1');
  const railTop = find(parts, 'C1-B-RAIL-TOP');
  const railBottom = find(parts, 'C1-B-RAIL-BOTTOM');
  const t = stileL.thickness;

  it('cuts a pocket into each half at every crossing', () => {
    // Two crossings per stile (top rail, bottom rail); one per stile for each rail.
    expect(lapPockets(stileL)).toHaveLength(2);
    expect(lapPockets(stileR)).toHaveLength(2);
    expect(lapPockets(stileM)).toHaveLength(2);
    // Three stiles cross each rail: the two outer ones and the mid-stile.
    expect(lapPockets(railTop)).toHaveLength(3);
    expect(lapPockets(railBottom)).toHaveLength(3);
  });

  it('cuts each half exactly half the material thickness deep', () => {
    for (const pocket of [...lapPockets(stileL), ...lapPockets(stileM), ...lapPockets(railTop)]) {
      expect(pocket.depth).toBeCloseTo(t / 2, 6);
    }
  });

  it('cuts the two halves from opposite faces, so together they fill the frame', () => {
    // A stile's front face stays flat and uncut through the crossing — that is
    // what lets a hinge's mounting plate bore into the same face with nothing
    // to flip for — so it is always cut from the back, face A.
    for (const pocket of lapPockets(stileL)) expect(pocket.side).toBe('A');
    // The rail is what gives way at the crossing instead: cut from the front.
    for (const pocket of lapPockets(railTop)) expect(pocket.side).toBe('B');
    // A pocket on one face and its opposite number on the other add up to the
    // full thickness: nothing left proud, nothing short, at either surface.
    expect(lapPockets(stileL)[0]!.depth + lapPockets(railBottom)[0]!.depth).toBeCloseTo(t, 6);
  });

  it('warns when the crossing is narrower than the cutter, same as a dado would', () => {
    const params = faceFramed((p) => {
      p.tool.diameter = 50; // bigger than the 44 mm stiles and rails cross at
    });
    const narrow = buildProject(params);
    const warn = narrow.diagnostics.find(
      (d) => d.topic === 'joinery' && d.message.includes('half lap is narrower than'),
    );
    expect(warn?.severity).toBe('warning');
    expect(warn?.message).toContain('50 mm cutter');
  });

  it('sizes each pocket to the crossing footprint: the other member is exactly one member wide', () => {
    // The pocket in the stile spans the rail's own width...
    for (const pocket of lapPockets(stileL)) {
      const h = Math.abs(pocket.path.pts[2]!.y - pocket.path.pts[0]!.y);
      expect(h).toBeCloseTo(base(project.params).faceFrame.railWidth, 6);
    }
    // ...and the pocket in the rail spans the stile's own width.
    for (const pocket of lapPockets(railTop)) {
      const w = Math.abs(pocket.path.pts[2]!.x - pocket.path.pts[0]!.x);
      expect(w).toBeCloseTo(base(project.params).faceFrame.stileWidth, 6);
    }
  });

  it('does not flip a stile that also carries a hinge plate: both land on face A', () => {
    // C1-B-DOOR-1 hinges low, against the left stile.
    expect(platesOn(stileL).length).toBeGreaterThan(0);
    for (const hole of platesOn(stileL)) expect(hole.side).toBe('A');
  });
});

describe('the frame opening', () => {
  it('is bounded by the stiles and rails, not the carcass panels behind them', () => {
    const params = faceFramed();
    const ff = base(params).faceFrame;
    const project = buildProject(params);
    const door = find(project.parts, 'C1-B-DOOR-1');
    const stileL = find(project.parts, 'C1-B-STILE-L');
    const railBottom = find(project.parts, 'C1-B-RAIL-BOTTOM');

    // Overlay is clamped to the stile/rail width by default (10 mm onto a
    // 44 mm member), so the door's edges sit inside the stile and rail, never
    // out at the carcass side panel the frame is standing in front of.
    expect(door.box.min.x).toBeGreaterThan(stileL.box.min.x);
    expect(door.box.min.x).toBeLessThan(stileL.box.max.x);
    expect(door.box.min.z).toBeGreaterThan(railBottom.box.min.z);
    expect(door.box.min.z).toBeLessThan(railBottom.box.max.z);
    void ff;
  });

  it('derives the clear opening from the stile and rail widths', () => {
    const params = faceFramed((p) => {
      base(p).faceFrame.stileWidth = 60;
      base(p).faceFrame.railWidth = 50;
      p.doors.fit = 'inset';
    });
    const project = buildProject(params);
    const door = find(project.parts, 'C1-B-DOOR-1');
    const stileL = find(project.parts, 'C1-B-STILE-L');
    const railBottom = find(project.parts, 'C1-B-RAIL-BOTTOM');

    // An inset door sits in the clear opening plus its own gap, so working
    // backwards gives exactly the stile's and rail's own inner edges.
    expect(door.box.min.x - params.doors.insetGap).toBeCloseTo(stileL.box.max.x, 6);
    expect(door.box.min.z - params.doors.insetGap).toBeCloseTo(railBottom.box.max.z, 6);
  });

  it('sizes a partial overlay from the configured reveal onto the frame, not the whole member', () => {
    const params = faceFramed((p) => {
      base(p).faceFrame.overlay = 12;
    });
    const project = buildProject(params);
    const door = find(project.parts, 'C1-B-DOOR-1');
    const stileL = find(project.parts, 'C1-B-STILE-L');
    // The door reaches 12 mm onto the stile, less half the reveal — it does
    // not cover the stile edge to edge the way a frameless overlay door
    // covers a thin carcass side, which is the entire point of R-07.
    const expected = stileL.box.max.x - 12 + params.doors.reveal / 2;
    expect(door.box.min.x).toBeCloseTo(expected, 6);
    expect(door.box.min.x).toBeGreaterThan(stileL.box.min.x);
  });

  it('clamps an overlay wider than the frame member and says so', () => {
    const params = faceFramed((p) => {
      base(p).faceFrame.overlay = 100; // wider than the 44 mm stile
    });
    const project = buildProject(params);
    const door = find(project.parts, 'C1-B-DOOR-1');
    const stileL = find(project.parts, 'C1-B-STILE-L');
    // Held to the stile's own outer edge rather than hanging past it over the
    // carcass side with nothing under it.
    expect(door.box.min.x).toBeCloseTo(stileL.box.min.x + params.doors.reveal / 2, 6);
    expect(project.notes.join(' ')).toContain('wider than the frame member');
  });

  it('door layout itself takes no branch on construction style: one function serves both openings', () => {
    const frameless: FrontOpening = {
      clearX0: 18,
      clearX1: 400,
      clearZ0: 100,
      clearZ1: 800,
      overlayX0: 0,
      overlayX1: 418,
      overlayZ0: 100,
      overlayZ1: 800,
    };
    const framed: FrontOpening = {
      clearX0: 44,
      clearX1: 400,
      clearZ0: 144,
      clearZ1: 800,
      overlayX0: 34,
      overlayX1: 410,
      overlayZ0: 134,
      overlayZ1: 810,
    };
    for (const opening of [frameless, framed]) {
      const overlay = doorLeafRect(opening, 'overlay', 3, 2);
      expect(overlay.x0).toBeCloseTo(opening.overlayX0 + 1.5, 6);
      expect(overlay.x1).toBeCloseTo(opening.overlayX1 - 1.5, 6);
      const inset = doorLeafRect(opening, 'inset', 3, 2);
      expect(inset.x0).toBeCloseTo(opening.clearX0 + 2, 6);
      expect(inset.x1).toBeCloseTo(opening.clearX1 - 2, 6);
    }
  });
});

describe('a board too short or too narrow, or a frame too shallow', () => {
  it('errors when a stile or rail is longer than the board it is cut from', () => {
    const params = faceFramed((p) => {
      p.stockMaterials[0]!.boardLength = 200; // shorter than any stile here
    });
    const project = buildProject(params);
    expect(project.stockNest.unplaced.length).toBeGreaterThan(0);
    const diag = project.diagnostics.find((d) => d.message.includes('too big for the board'));
    expect(diag?.severity).toBe('error');
    expect(diag?.partIds).toEqual(project.stockNest.unplaced);
  });

  it('errors when a stile or rail is wider than the board it is cut from', () => {
    const params = faceFramed((p) => {
      p.stockMaterials[0]!.boardWidth = 30; // narrower than the 44 mm stiles and rails
    });
    const project = buildProject(params);
    expect(project.stockNest.unplaced.length).toBeGreaterThan(0);
    expect(project.diagnostics.some((d) => d.message.includes('too big for the board'))).toBe(true);
  });

  it('rejects a stock part too big for the machine, the same as a sheet part', () => {
    const params = faceFramed((p) => {
      base(p).height = 3000;
      p.machine.tilingAxis = 'none';
      p.machine.travelX = 1200;
      p.machine.travelY = 1200;
      p.stockMaterials[0]!.boardLength = 4000; // long enough to nest; the machine is the limit
    });
    const project = buildProject(params);
    const stileDiag = project.diagnostics.find(
      (d) => d.severity === 'error' && d.partIds?.includes('C1-B-STILE-L'),
    );
    expect(stileDiag?.message).toContain('cannot be cut on this machine');
  });

  it('says so when the top and bottom rails do not both fit in the height the doors run in', () => {
    const params = faceFramed((p) => {
      base(p).faceFrame.railWidth = 400; // twice over runs past the ~780 mm door height here
    });
    const project = buildProject(params);
    expect(project.notes.join(' ')).toContain('do not both fit');
  });
});

describe('a carcass without a face frame material on hand', () => {
  it('says so, and leaves the doors on the carcass opening instead of silently failing', () => {
    const params = faceFramed((p) => {
      base(p).faceFrame.materialId = 'no-such-stock';
    });
    const project = buildProject(params);
    expect(project.notes.join(' ')).toContain('missing from the stock list');
    // Still a cuttable door: it just fell back to fronting the carcass.
    expect(project.parts.some((p) => p.id === 'C1-B-DOOR-1')).toBe(true);
    expect(project.parts.some((p) => p.role === 'stile')).toBe(false);
  });
});

describe('solid stock is kept apart from sheet goods', () => {
  const project = buildProject(faceFramed());

  it('lists stiles and rails on their own cut list, not the sheet one', () => {
    expect(project.cutList.some((r) => r.role === 'stile' || r.role === 'rail')).toBe(false);
    expect(project.stockCutList.filter((r) => r.role === 'stile')).toHaveLength(3);
    expect(project.stockCutList.filter((r) => r.role === 'rail')).toHaveLength(2);
  });

  it('nests stock along boards rather than sheets, and never reports it unplaced', () => {
    const stock = project.params.stockMaterials.find(
      (m) => m.id === base(project.params).faceFrame.materialId,
    )!;
    expect(project.stockNest.unplaced).toEqual([]);
    expect(project.stockNest.sheets.length).toBeGreaterThan(0);
    // A board is the stock's own fixed width, not a sheet the part was
    // rotated onto to save yield — there is nothing to rotate a length of
    // board into.
    for (const board of project.stockNest.sheets) {
      expect(board.length).toBe(stock.boardLength);
      expect(board.width).toBe(stock.boardWidth);
      for (const p of board.parts) expect(p.rotated).toBe(false);
    }
  });

  it('never asks the sheet nester to place a stock part', () => {
    const sheetPartIds = new Set(project.nest.sheets.flatMap((s) => s.parts.map((p) => p.partId)));
    for (const row of project.stockCutList) expect(sheetPartIds.has(row.id)).toBe(false);
  });

  it('reports sheet and board yield as two separate counts, neither counting the other', () => {
    const nestedOnSheets = project.nest.sheets.reduce((a, s) => a + s.parts.length, 0);
    const nestedOnBoards = project.stockNest.sheets.reduce((a, s) => a + s.parts.length, 0);
    const sheetInfo = project.diagnostics.find((d) =>
      /^\d+ parts on \d+ sheet\(s\)/.test(d.message),
    );
    const boardInfo = project.diagnostics.find((d) =>
      /face-frame parts on \d+ board\(s\)/.test(d.message),
    );
    expect(sheetInfo?.message).toContain(`${nestedOnSheets} parts on`);
    expect(boardInfo?.message).toContain(`${nestedOnBoards} face-frame parts on`);
  });
});

describe('frameless is unaffected', () => {
  it('builds the identical geometry whether construction is left at its default or set explicitly', () => {
    const implicit = buildProject(defaultParams());
    const p = defaultParams();
    base(p).construction = 'frameless';
    const setExplicitly = buildProject(p);
    expect(setExplicitly.parts).toEqual(implicit.parts);
  });

  it('produces no stile, rail or face-frame-lap features anywhere in the default project', () => {
    const project = buildProject(defaultParams());
    expect(project.parts.some((p) => p.role === 'stile' || p.role === 'rail')).toBe(false);
    expect(
      project.parts
        .flatMap((p) => p.features)
        .some((f) => 'purpose' in f && f.purpose === 'face-frame-lap'),
    ).toBe(false);
  });
});
