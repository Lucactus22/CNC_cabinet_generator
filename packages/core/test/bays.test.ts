import { describe, expect, it } from 'vitest';
import { buildProject, defaultParams, layoutShelves, normaliseParams } from '../src/index.js';
import type { BayVolume, Part, ProjectParams } from '../src/index.js';
import { base, upper } from './carcasses.js';

const find = (parts: Part[], id: string): Part => {
  const p = parts.find((x) => x.id === id);
  if (!p) throw new Error(`No part '${id}'. Have: ${parts.map((x) => x.id).join(', ')}`);
  return p;
};

const bayOf = (bays: BayVolume[], carcassId: string, index: number): BayVolume => {
  const found = bays.find((b) => b.carcassId === carcassId && b.index === index);
  if (!found) throw new Error(`No bay ${index} in carcass '${carcassId}'.`);
  return found;
};

/** The default project with one carcass turned into three bays of fixed shelves. */
function threeBays(): ProjectParams {
  const params = defaultParams();
  const carcass = base(params);
  carcass.dividerCount = 2;
  carcass.bays = [0, 1, 2].map(() => ({
    shelves: 'fixed' as const,
    shelfCount: 2,
    shelfGaps: [],
    doors: 'none' as const,
    drawerFrontHeights: [],
  }));
  return params;
}

describe('where a bay stands', () => {
  /**
   * A bay produces no part, so the volume the interface points at is the only
   * description of it there is. If it drifted from the panels either side, a
   * click would land on an opening that is not the one being machined — and
   * nothing else in the pipeline would notice.
   */
  it('runs exactly between the panels bounding it', () => {
    const project = buildProject(threeBays());
    const bays = project.bays.filter((b) => b.carcassId === 'B');
    expect(bays).toHaveLength(3);

    for (const bay of bays) {
      const left = find(project.parts, bay.leftPanelId);
      const right = find(project.parts, bay.rightPanelId);
      // The clear opening runs face to face: from the inner face of whatever
      // stands on its left to the inner face of whatever stands on its right.
      expect(bay.box.min.x).toBeCloseTo(left.box.max.x, 6);
      expect(bay.box.max.x).toBeCloseTo(right.box.min.x, 6);
      expect(bay.box.max.x).toBeGreaterThan(bay.box.min.x);
    }

    // Consecutive bays hand over to each other: the divider between two of
    // them is the right-hand panel of one and the left-hand panel of the next.
    expect(bays[0]!.rightPanelId).toBe(bays[1]!.leftPanelId);
    expect(bays[1]!.rightPanelId).toBe(bays[2]!.leftPanelId);
    expect(bays[0]!.leftPanelId).toBe('C1-B-SIDE-L');
    expect(bays[2]!.rightPanelId).toBe('C1-B-SIDE-R');
  });

  it('claims every part built inside it, and none built inside another', () => {
    const params = threeBays();
    base(params).bays[1]!.doors = 'double';
    const project = buildProject(params);
    const bays = project.bays.filter((b) => b.carcassId === 'B');

    for (const bay of bays) {
      for (const id of bay.partIds) {
        const part = find(project.parts, id);
        const mid = (part.box.min.x + part.box.max.x) / 2;
        // A shelf sits inside its own bay; a door overlays past it. Either way
        // its middle belongs to the opening that claimed it, which is what
        // makes "the bay this panel is in" answerable at all.
        expect(mid, `${id} claimed by bay ${bay.index}`).toBeGreaterThan(bay.box.min.x - 20);
        expect(mid, `${id} claimed by bay ${bay.index}`).toBeLessThan(bay.box.max.x + 20);
      }
    }

    const claimed = bays.flatMap((b) => b.partIds);
    expect(new Set(claimed).size, 'a part claimed by two bays').toBe(claimed.length);
    expect(bays[1]!.partIds.filter((id) => id.includes('-DOOR-'))).toHaveLength(2);
  });

  /**
   * A hanging rail stands in the top of the bay rather than shortening it. If
   * the volume stopped under the rail, the band of the opening beside it would
   * belong to nothing and a click there would silently deselect.
   */
  it('reaches the underside of the top even when a hanging rail takes the shelf run', () => {
    const params = defaultParams();
    const carcass = upper(params);
    carcass.hangingRail.enabled = true;
    const project = buildProject(params);
    const bay = bayOf(project.bays, 'T', 0);
    const top = find(project.parts, 'C1-T-TOP');

    expect(bay.box.max.z).toBeCloseTo(top.box.min.z, 6);
    expect(bay.shelfRun.z1).toBeCloseTo(bay.box.max.z - carcass.hangingRail.height, 6);
    expect(bay.shelfRun.z0).toBeCloseTo(bay.box.min.z, 6);
  });

  it('gives a bay per opening in every carcass of every cabinet', () => {
    const params = threeBays();
    params.cabinets.push({ ...params.cabinets[0]!, id: 'C2', name: 'Second' });
    const project = buildProject(params);
    const openings = params.cabinets[0]!.carcasses.reduce((n, c) => n + c.dividerCount + 1, 0);
    expect(project.bays).toHaveLength(openings * 2);
    expect(project.bays.filter((b) => b.cabinetId === 'C2')).toHaveLength(openings);
  });
});

describe('fixed shelf heights', () => {
  /**
   * Evenly spaced is what every project before this was cut to, so an empty
   * list has to keep giving exactly that. Anything else silently re-cuts a
   * saved design the first time it is opened.
   */
  it('spaces them evenly when no heights are given', () => {
    const { zs, fellBackToEven } = layoutShelves(0, 1000, 3, 20, []);
    expect(fellBackToEven).toBe(false);
    // (1000 - 3 × 20) / 4 = 235 of clear opening under each shelf.
    expect(zs).toEqual([235, 490, 745]);
  });

  it('uses the heights given when they add up', () => {
    const { zs, fellBackToEven } = layoutShelves(0, 1000, 3, 20, [400, 200, 200, 140]);
    expect(fellBackToEven).toBe(false);
    expect(zs).toEqual([400, 620, 840]);
    // The list describes the whole opening: the last entry is the headroom
    // above the top shelf, which is why there is one more of them than shelves.
    expect(1000 - (zs[2]! + 20)).toBeCloseTo(140, 6);
  });

  /**
   * Heights that do not reach are the same failure `bayWidths` has, and get
   * the same answer: a stack of equal shelves someone can cut beats one sized
   * to numbers that leave a shelf hanging out of the top of the box.
   */
  it('falls back to an even split when they do not add up, and says so', () => {
    const { zs, fellBackToEven } = layoutShelves(0, 1000, 3, 20, [400, 200, 200, 999]);
    expect(fellBackToEven).toBe(true);
    expect(zs).toEqual([235, 490, 745]);

    const params = defaultParams();
    const bay = base(params).bays[1]!;
    bay.shelves = 'fixed';
    bay.shelfCount = 2;
    bay.shelfGaps = [10, 10, 10];
    const project = buildProject(params);
    expect(project.notes.some((n) => n.includes('shelf heights did not add up'))).toBe(true);
  });

  it('puts the shelves where the heights say, in the assembly', () => {
    const params = defaultParams();
    const bay = base(params).bays[1]!;
    bay.shelves = 'fixed';
    bay.shelfCount = 2;
    const even = buildProject(params);
    const volume = bayOf(even.bays, 'B', 1);
    const run = volume.shelfRun.z1 - volume.shelfRun.z0;
    const t = even.parts.find((p) => p.id === 'C1-B-SHELF-2-1')!.thickness;

    // Deliberately lopsided: a tall space at the bottom for pans, two shallow
    // ones above. That is the whole reason this parameter exists.
    const tall = run - 2 * t - 2 * 150;
    bay.shelfGaps = [tall, 150, 150];
    const project = buildProject(params);
    expect(project.notes.some((n) => n.includes('shelf heights did not add up'))).toBe(false);

    const lower = find(project.parts, 'C1-B-SHELF-2-1');
    const higher = find(project.parts, 'C1-B-SHELF-2-2');
    expect(lower.box.min.z).toBeCloseTo(volume.shelfRun.z0 + tall, 6);
    expect(higher.box.min.z).toBeCloseTo(lower.box.max.z + 150, 6);
    expect(volume.shelfRun.z1 - higher.box.max.z).toBeCloseTo(150, 6);
  });

  /**
   * A bay written before this parameter existed has no list at all. The
   * builder reads it with `.filter` the moment a carcass is built, so an
   * unfilled one takes the whole pipeline down before anything can report why.
   */
  it('opens a project saved before shelf heights existed', () => {
    const params = defaultParams();
    const raw = JSON.parse(JSON.stringify(params)) as ProjectParams;
    for (const cabinet of raw.cabinets) {
      for (const carcass of cabinet.carcasses) {
        for (const bay of carcass.bays) delete (bay as Partial<typeof bay>).shelfGaps;
      }
    }
    const opened = normaliseParams(raw);
    expect(opened.cabinets[0]!.carcasses[0]!.bays[0]!.shelfGaps).toEqual([]);
    expect(() => buildProject(opened)).not.toThrow();
  });
});
