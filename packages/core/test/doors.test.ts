import { describe, expect, it } from 'vitest';
import { bboxOf, buildProject, defaultParams, hingeHeights } from '../src/index.js';
import type { CabinetParams, DrillFeature, Part, PocketFeature } from '../src/model/types.js';

const doorsOn = (patch: (p: CabinetParams) => void = () => {}): CabinetParams => {
  const p = defaultParams();
  patch(p);
  return p;
};

const find = (parts: Part[], id: string): Part => parts.find((p) => p.id === id)!;
const cups = (p: Part): PocketFeature[] =>
  p.features.filter((f): f is PocketFeature => f.kind === 'pocket' && f.purpose === 'hinge-cup');
const dowels = (p: Part): DrillFeature[] =>
  p.features.filter((f): f is DrillFeature => f.kind === 'drill' && f.purpose === 'hinge-dowel');
const plates = (p: Part): DrillFeature[] =>
  p.features.filter((f): f is DrillFeature => f.kind === 'drill' && f.purpose === 'hinge-plate');

describe('hinge spacing rules', () => {
  it('uses two hinges up to 900 mm and adds one past that', () => {
    expect(hingeHeights(0, 700, 76.2)).toHaveLength(2);
    expect(hingeHeights(0, 900, 76.2)).toHaveLength(2);
    expect(hingeHeights(0, 1200, 76.2)).toHaveLength(3);
    expect(hingeHeights(0, 1800, 76.2)).toHaveLength(4);
    expect(hingeHeights(0, 2400, 76.2)).toHaveLength(5);
  });

  it('sets the end pair in from each end and spreads the rest evenly', () => {
    const h = hingeHeights(0, 1200, 76.2);
    expect(h[0]).toBeCloseTo(76.2, 6);
    expect(h[h.length - 1]).toBeCloseTo(1200 - 76.2, 6);
    for (let i = 2; i < h.length; i++) {
      expect(h[i]! - h[i - 1]!).toBeCloseTo(h[1]! - h[0]!, 6);
    }
  });

  it('falls back to a single hinge on a door too short for a pair', () => {
    expect(hingeHeights(0, 100, 76.2)).toHaveLength(1);
  });
});

describe('door layout', () => {
  const project = buildProject(doorsOn());
  const doors = project.parts.filter((p) => p.role === 'door');

  it('builds one door per bay that asks for one', () => {
    expect(doors.map((d) => d.id).sort()).toEqual(['B-DOOR-1', 'B-DOOR-2']);
  });

  it('hangs overlay doors in front of the carcass', () => {
    const door = find(project.parts, 'B-DOOR-1');
    const side = find(project.parts, 'B-SIDE-L');
    expect(door.box.max.y).toBeCloseTo(side.box.min.y, 6); // back of door on the carcass front
    expect(door.box.min.y).toBeLessThan(side.box.min.y);
  });

  it('leaves an even reveal between neighbouring doors', () => {
    const a = find(project.parts, 'B-DOOR-1');
    const b = find(project.parts, 'B-DOOR-2');
    expect(b.box.min.x - a.box.max.x).toBeCloseTo(project.params.doors.reveal, 6);
  });

  it('covers the carcass to its outer edges, less half a reveal', () => {
    const reveal = project.params.doors.reveal;
    expect(find(project.parts, 'B-DOOR-1').box.min.x).toBeCloseTo(reveal / 2, 6);
    expect(find(project.parts, 'B-DOOR-2').box.max.x).toBeCloseTo(
      project.params.base.width - reveal / 2,
      6,
    );
  });

  it('stops the doors under the ledge and above the toe kick', () => {
    const door = find(project.parts, 'B-DOOR-1');
    const top = find(project.parts, 'B-TOP');
    const kick = project.params.base.toeKick;
    expect(door.box.max.z).toBeLessThanOrEqual(top.box.min.z + 1e-6);
    expect(door.box.min.z).toBeGreaterThanOrEqual(kick.height);
  });

  it('sits inset doors inside the opening instead', () => {
    const p = buildProject(
      doorsOn((x) => {
        x.doors.fit = 'inset';
      }),
    );
    const door = find(p.parts, 'B-DOOR-1');
    const side = find(p.parts, 'B-SIDE-L');
    expect(door.box.min.y).toBeGreaterThanOrEqual(side.box.min.y - 1e-6);
    expect(door.box.min.x).toBeGreaterThan(side.box.max.x);
  });

  it('splits a pair down the middle with a reveal between', () => {
    const p = buildProject(
      doorsOn((x) => {
        x.base.bays[0]!.doors = 'double';
      }),
    );
    const l = find(p.parts, 'B-DOOR-1L');
    const r = find(p.parts, 'B-DOOR-1R');
    expect(r.box.min.x - l.box.max.x).toBeCloseTo(p.params.doors.reveal, 6);
    expect(l.box.max.x - l.box.min.x).toBeCloseTo(r.box.max.x - r.box.min.x, 6);
  });

  it('builds no doors when every bay is open', () => {
    const p = buildProject(
      doorsOn((x) => {
        for (const b of x.base.bays) b.doors = 'none';
      }),
    );
    expect(p.parts.filter((q) => q.role === 'door')).toHaveLength(0);
  });
});

describe('UTRUSTA hinge boring', () => {
  const params = doorsOn();
  const project = buildProject(params);
  const h = params.hinge;
  const door = find(project.parts, 'B-DOOR-2'); // hinged on its right, low local x

  it('bores a 35 mm cup to the right depth on the back face', () => {
    expect(cups(door)).toHaveLength(2);
    for (const c of cups(door)) {
      const bb = bboxOf(c.path);
      expect(bb.maxX - bb.minX).toBeCloseTo(h.cupDiameter, 6);
      expect(c.depth).toBeCloseTo(h.cupDepth, 6);
      expect(c.side).toBe('A'); // the back
    }
  });

  it('puts the cup centre one boring distance plus a radius in from the edge', () => {
    // Blum quotes the boring distance to the *edge* of the cup, so the centre
    // lands 17.5 mm further in. Getting this wrong ruins a door.
    const expected = h.boringDistance + h.cupDiameter / 2;
    const centres = cups(door).map((c) => {
      const bb = bboxOf(c.path);
      return (bb.minX + bb.maxX) / 2;
    });
    for (const c of centres) expect(c).toBeCloseTo(expected, 6);
  });

  it('sets the dowels 45 mm apart and 9.5 mm behind the cup centre', () => {
    const d = dowels(door);
    expect(d).toHaveLength(4); // two per hinge
    for (const one of d) expect(one.diameter).toBeCloseTo(h.dowelDiameter, 6);

    const cupX = h.boringDistance + h.cupDiameter / 2;
    for (const one of d) expect(one.x).toBeCloseTo(cupX + h.dowelOffset, 6);

    const first = d
      .filter((one) => Math.abs(one.y - 76.2) < h.dowelSpacing)
      .map((o) => o.y)
      .sort();
    expect(first[1]! - first[0]!).toBeCloseTo(h.dowelSpacing, 6);
  });

  it('mirrors the pattern for a door hinged on the other side', () => {
    const left = find(project.parts, 'B-DOOR-1');
    const expected = left.width - (h.boringDistance + h.cupDiameter / 2);
    for (const c of cups(left)) {
      const bb = bboxOf(c.path);
      expect((bb.minX + bb.maxX) / 2).toBeCloseTo(expected, 6);
    }
    // The dowels still sit *into* the door, not off its edge.
    for (const one of dowels(left)) expect(one.x).toBeCloseTo(expected - h.dowelOffset, 6);
  });

  it('places the cups the standard distance in from each end', () => {
    const ys = [
      ...new Set(
        cups(door).map((c) => {
          const bb = bboxOf(c.path);
          return Math.round(((bb.minY + bb.maxY) / 2) * 10) / 10;
        }),
      ),
    ].sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(h.endOffset, 1);
    expect(ys[ys.length - 1]).toBeCloseTo(door.height - h.endOffset, 1);
  });

  it('drills the plate holes on the 32 mm system in the carcass', () => {
    const side = find(project.parts, 'B-SIDE-L');
    const p = plates(side);
    expect(p.length).toBe(4); // two hinges, two holes each
    for (const one of p) {
      expect(one.diameter).toBeCloseTo(h.plateHoleDiameter, 6);
      expect(one.x).toBeCloseTo(h.plateFrontOffset, 6); // in from the front edge
      expect(one.side).toBe('A'); // the inner face, already being machined
    }
    const ys = p.map((o) => o.y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeCloseTo(h.plateHoleSpacing, 6);
  });

  it('warns when the cup would go through a thin door', () => {
    const p = buildProject(
      doorsOn((x) => {
        x.materials.push({
          ...x.materials[1]!,
          id: 'thin',
          name: '12 mm door',
          actualThickness: 11.9,
        });
        x.doors.materialId = 'thin';
      }),
    );
    expect(p.diagnostics.some((d) => d.message.includes('straight through'))).toBe(true);
  });

  it('warns when the boring distance is outside what the hardware allows', () => {
    const p = buildProject(
      doorsOn((x) => {
        x.hinge.boringDistance = 15;
      }),
    );
    expect(p.diagnostics.some((d) => d.message.includes('3-8 mm'))).toBe(true);
  });
});

describe('door designs', () => {
  const shaker = (): CabinetParams =>
    doorsOn((p) => {
      p.surfaceEffects = [
        {
          id: 'shaker',
          enabled: true,
          target: { select: 'role', role: 'door', carcass: 'both' },
          face: 'outside',
          effect: { kind: 'frame', margin: 60, width: 8, depth: 4 },
        },
      ];
    });

  it('runs a frame groove round the door face', () => {
    const project = buildProject(shaker());
    const door = find(project.parts, 'B-DOOR-1');
    const frame = door.features.filter(
      (f): f is PocketFeature => f.kind === 'pocket' && f.purpose === 'surface-frame',
    );
    expect(frame).toHaveLength(4); // four runs make the rectangle
    for (const f of frame) {
      expect(f.depth).toBe(4);
      expect(f.side).toBe('B'); // the front
    }
    // The outer edge of the frame sits at the requested inset.
    const xs = frame.map((f) => bboxOf(f.path).minX);
    expect(Math.min(...xs)).toBeCloseTo(60, 6);
  });

  it('explains the flip in terms of the door, not as something to avoid', () => {
    const project = buildProject(shaker());
    const warn = project.diagnostics.find((d) => d.message.includes('machined on both faces'));
    expect(warn?.message).toContain('turn the sheet over');
    expect(warn?.message).not.toContain('would avoid that');
  });

  it('lists the doors as needing both faces cut', () => {
    const project = buildProject(shaker());
    const flip = project.diagnostics.find((d) => d.message.includes('turned over on the bed'));
    expect(flip?.partIds).toContain('B-DOOR-1');
  });

  it('takes beadboard grooves on a door just as well', () => {
    const p = doorsOn((x) => {
      x.surfaceEffects = [
        {
          id: 'bead',
          enabled: true,
          target: { select: 'role', role: 'door', carcass: 'base' },
          face: 'outside',
          effect: {
            kind: 'grooves',
            direction: 'vertical',
            spacing: 50,
            width: 6,
            depth: 3,
            margin: 0,
            fit: 'even',
          },
        },
      ];
    });
    const door = find(buildProject(p).parts, 'B-DOOR-1');
    expect(
      door.features.filter((f) => f.kind === 'pocket' && f.purpose === 'surface-grooves').length,
    ).toBeGreaterThan(3);
  });
});

describe('doors through the rest of the pipeline', () => {
  it('nests, lists and exports without complaint', () => {
    const project = buildProject(doorsOn());
    expect(project.nest.unplaced).toEqual([]);
    expect(project.cutList.filter((r) => r.role === 'door')).toHaveLength(2);
    expect(
      project.diagnostics.filter((d) => d.severity === 'error' && d.topic === 'joinery'),
    ).toEqual([]);
  });
});
