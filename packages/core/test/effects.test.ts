import { describe, expect, it } from 'vitest';
import {
  bboxOf,
  buildProject,
  defaultParams,
  exportProject,
  faceSideFor,
  grooveCentres,
  partsNeedingFlip,
} from '../src/index.js';
import type {
  ProjectParams,
  GrooveEffect,
  Part,
  PocketFeature,
  SurfaceEffectSpec,
} from '../src/model/types.js';

const GROOVES: GrooveEffect = {
  kind: 'grooves',
  direction: 'vertical',
  spacing: 60,
  width: 6,
  depth: 3,
  margin: 0,
  fit: 'even',
};

function withEffect(
  patch: Partial<SurfaceEffectSpec> = {},
  effect: Partial<GrooveEffect> = {},
): ProjectParams {
  const p = defaultParams();
  p.surfaceEffects = [
    {
      id: 'e1',
      enabled: true,
      target: { select: 'role', role: 'back', carcassId: undefined },
      face: 'inside',
      effect: { ...GROOVES, ...effect },
      ...patch,
    },
  ];
  return p;
}

const grooves = (part: Part): PocketFeature[] =>
  part.features.filter(
    (f): f is PocketFeature => f.kind === 'pocket' && f.purpose === 'surface-grooves',
  );

const find = (parts: Part[], id: string): Part => parts.find((p) => p.id === id)!;

describe('groove layout', () => {
  it('divides the span into equal bays when fitting evenly', () => {
    // 900 wide at a nominal 100 spacing: 9 bays, so 8 internal grooves.
    const c = grooveCentres(900, { ...GROOVES, spacing: 100, fit: 'even' });
    expect(c).toHaveLength(8);
    expect(c[0]).toBeCloseTo(100, 6);
    for (let i = 1; i < c.length; i++) expect(c[i]! - c[i - 1]!).toBeCloseTo(100, 6);
  });

  it('nudges the spacing so the bays come out equal', () => {
    // 850 at a nominal 100 does not divide, so the pitch shifts to 850/9.
    const c = grooveCentres(850, { ...GROOVES, spacing: 100, fit: 'even' });
    const pitch = 850 / 9;
    expect(c).toHaveLength(8);
    for (let i = 0; i < c.length; i++) expect(c[i]).toBeCloseTo(pitch * (i + 1), 6);
  });

  it('keeps the spacing literal and centres the run when fitting exactly', () => {
    const c = grooveCentres(850, { ...GROOVES, spacing: 100, fit: 'exact' });
    for (let i = 1; i < c.length; i++) expect(c[i]! - c[i - 1]!).toBeCloseTo(100, 6);
    // Symmetric about the middle.
    expect(c[0]! + c[c.length - 1]!).toBeCloseTo(850, 6);
  });

  it('produces nothing when the spacing cannot fit', () => {
    expect(grooveCentres(50, { ...GROOVES, spacing: 200, fit: 'even' })).toEqual([]);
    expect(grooveCentres(0, GROOVES)).toEqual([]);
  });
});

describe('grooves on the back panel', () => {
  const params = withEffect();
  const project = buildProject(params);
  const back = find(project.parts, 'C1-T-BACK');
  const cut = grooves(back);

  it('cuts grooves at the requested depth on the inside face', () => {
    expect(cut.length).toBeGreaterThan(5);
    for (const g of cut) {
      expect(g.depth).toBe(GROOVES.depth);
      expect(g.side).toBe('A'); // face A looks into the cabinet here
    }
  });

  it('spaces them evenly, at the pitch that makes the bays come out equal', () => {
    const xs = cut.map((g) => bboxOf(g.path).minX).sort((a, b) => a - b);
    const pitches = xs.slice(1).map((x, i) => Math.round((x - xs[i]!) * 100) / 100);
    expect(new Set(pitches).size).toBe(1);
    // 'even' trades the literal spacing for equal bays edge to edge, so the
    // pitch lands near the request rather than on it.
    const bays = cut.length + 1;
    expect(pitches[0]).toBeCloseTo(back.exposed.w / bays, 1);
    expect(Math.abs(pitches[0]! - GROOVES.spacing)).toBeLessThan(GROOVES.spacing / 2);
  });

  it('honours the spacing literally when asked to fit exactly', () => {
    const p = buildProject(withEffect({}, { fit: 'exact' }));
    const xs = grooves(find(p.parts, 'C1-T-BACK'))
      .map((g) => bboxOf(g.path).minX)
      .sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(GROOVES.spacing, 6);
  });

  it('runs them vertically, the long way up the panel', () => {
    for (const g of cut) {
      const bb = bboxOf(g.path);
      expect(bb.maxX - bb.minX).toBeCloseTo(GROOVES.width, 6);
      expect(bb.maxY - bb.minY).toBeGreaterThan(bb.maxX - bb.minX);
    }
  });

  it('runs them horizontally when asked', () => {
    const p = buildProject(withEffect({}, { direction: 'horizontal' }));
    for (const g of grooves(find(p.parts, 'C1-T-BACK'))) {
      const bb = bboxOf(g.path);
      expect(bb.maxY - bb.minY).toBeCloseTo(GROOVES.width, 6);
      expect(bb.maxX - bb.minX).toBeGreaterThan(bb.maxY - bb.minY);
    }
  });

  it('keeps clear of the tongues buried in the carcass grooves', () => {
    // The blank is bigger than the visible face; grooving across a tongue would
    // both show at the edge and weaken the joint.
    expect(back.exposed.w).toBeLessThan(back.width);
    expect(back.exposed.h).toBeLessThan(back.height);
    for (const g of cut) {
      const bb = bboxOf(g.path);
      expect(bb.minX).toBeGreaterThanOrEqual(back.exposed.x - 1e-6);
      expect(bb.maxX).toBeLessThanOrEqual(back.exposed.x + back.exposed.w + 1e-6);
      expect(bb.minY).toBeGreaterThanOrEqual(back.exposed.y - 1e-6);
      expect(bb.maxY).toBeLessThanOrEqual(back.exposed.y + back.exposed.h + 1e-6);
    }
  });

  it('holds off the edges by the margin when one is set', () => {
    const p = buildProject(withEffect({}, { margin: 20 }));
    const part = find(p.parts, 'C1-T-BACK');
    for (const g of grooves(part)) {
      expect(bboxOf(g.path).minX).toBeGreaterThanOrEqual(part.exposed.x + 20 - 1e-6);
    }
  });

  it('reaches the export as ordinary pockets on their own depth layer', () => {
    const all = exportProject(project)
      .files.map((f) => f.dxf)
      .join('');
    // Effects emit plain features, so the exporter needs no special case: a
    // 3 mm groove simply lands on its own depth layer alongside the joinery.
    expect(all).toContain('POCKET_D3');
    expect(all).toContain('POCKET_D6');
  });
});

describe('targeting a surface', () => {
  it('applies to both carcasses, or just one', () => {
    const both = buildProject(
      withEffect({ target: { select: 'role', role: 'back', carcassId: undefined } }),
    );
    expect(grooves(find(both.parts, 'C1-B-BACK')).length).toBeGreaterThan(0);
    expect(grooves(find(both.parts, 'C1-T-BACK')).length).toBeGreaterThan(0);

    const upper = buildProject(
      withEffect({ target: { select: 'role', role: 'back', carcassId: 'T' } }),
    );
    expect(grooves(find(upper.parts, 'C1-B-BACK'))).toHaveLength(0);
    expect(grooves(find(upper.parts, 'C1-T-BACK')).length).toBeGreaterThan(0);
  });

  it('applies to a single named part', () => {
    const p = buildProject(withEffect({ target: { select: 'part', partId: 'C1-T-BACK' } }));
    expect(grooves(find(p.parts, 'C1-T-BACK')).length).toBeGreaterThan(0);
    expect(grooves(find(p.parts, 'C1-B-BACK'))).toHaveLength(0);
  });

  it('says so when the target matches nothing', () => {
    const p = buildProject(withEffect({ target: { select: 'part', partId: 'NOPE' } }));
    expect(p.diagnostics.some((d) => d.message.includes('matches no panel'))).toBe(true);
  });

  it('can be switched off without being removed', () => {
    const p = buildProject(withEffect({ enabled: false }));
    expect(grooves(find(p.parts, 'C1-T-BACK'))).toHaveLength(0);
  });

  it('resolves inside and outside geometrically, not by face letter', () => {
    const { parts } = buildProject(defaultParams());
    const centroid = { x: 450, y: 300, z: 1000 };
    // A side panel's inner face and the back panel's inner face are both A.
    expect(faceSideFor(find(parts, 'C1-B-SIDE-L'), centroid, 'inside')).toBe('A');
    expect(faceSideFor(find(parts, 'C1-B-SIDE-L'), centroid, 'outside')).toBe('B');
    expect(faceSideFor(find(parts, 'C1-B-BACK'), centroid, 'inside')).toBe('A');
  });
});

describe('the both-sides warning', () => {
  /** The warning the effect itself raises, not the pre-existing divider notice. */
  const effectFlipWarning = (p: ReturnType<typeof buildProject>) =>
    p.diagnostics.find((d) => d.message.includes('effect is on the'));

  it('stays quiet when the effect lands on the face already being machined', () => {
    const p = buildProject(
      withEffect({ target: { select: 'role', role: 'side', carcassId: 'B' }, face: 'inside' }),
    );
    expect(effectFlipWarning(p)).toBeUndefined();
  });

  it('warns when the effect forces the panel onto its second face', () => {
    const p = buildProject(
      withEffect({ target: { select: 'role', role: 'side', carcassId: 'B' }, face: 'outside' }),
    );
    const warn = effectFlipWarning(p);
    expect(warn).toBeDefined();
    expect(warn!.message).toContain('has to be turned over on the bed');
    expect(warn!.severity).toBe('warning');
    expect(warn!.message).toContain('outside face');
    expect(partsNeedingFlip(p.parts).map((x) => x.id)).toContain('C1-B-SIDE-L');
  });

  it('does not let an engraved label count as machining a face', () => {
    // A part label is a reference marking; it must never be the reason a panel
    // gets turned over.
    const p = buildProject(withEffect({ face: 'outside' }));
    expect(effectFlipWarning(p)).toBeUndefined();
    expect(partsNeedingFlip(p.parts).map((x) => x.id)).not.toContain('C1-T-BACK');
  });
});

describe('groove validation', () => {
  const bad = (effect: Partial<GrooveEffect>): string[] =>
    buildProject(withEffect({}, effect)).diagnostics.map((d) => d.message);

  it('rejects a groove narrower than the cutter', () => {
    expect(bad({ width: 2 }).some((m) => m.includes('narrower than'))).toBe(true);
  });

  it('rejects a groove that would cut through', () => {
    expect(bad({ depth: 20 }).some((m) => m.includes('straight through'))).toBe(true);
  });

  it('warns when the groove leaves the panel fragile', () => {
    expect(bad({ depth: 7 }).some((m) => m.includes('fragile'))).toBe(true);
  });

  it('rejects spacing that would merge the grooves', () => {
    expect(bad({ spacing: 6, width: 6 }).some((m) => m.includes('merge'))).toBe(true);
  });

  it('says so when the margin eats the whole face', () => {
    expect(bad({ margin: 900 }).some((m) => m.includes('nothing left'))).toBe(true);
  });

  it('leaves the default model untouched', () => {
    expect(defaultParams().surfaceEffects).toEqual([]);
    expect(buildProject(defaultParams()).parts.every((p) => grooves(p).length === 0)).toBe(true);
  });
});
