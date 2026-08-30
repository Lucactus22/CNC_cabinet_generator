import { describe, expect, it } from 'vitest';
import { buildProject, defaultParams, forcesFace, partsNeedingFlip } from '../src/index.js';

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
