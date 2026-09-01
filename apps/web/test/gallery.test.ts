import { describe, expect, it } from 'vitest';
import { buildProject, defaultParams, frameOf, type ProjectParams } from '@cabgen/core';
import {
  BACK_STYLE,
  BAY_FRONT,
  BAY_INSIDE,
  CABINET_TYPE,
  CARCASS_JOINT,
  CONSTRUCTION,
  DOOR_FIT,
  EFFECT_KIND,
  FLOOR,
  NEST_STRATEGY,
  RELIEF,
  TOP_STYLE,
  type Gallery,
} from '../src/gallery/choices';
import { sampleParams, sampleProject } from '../src/gallery/samples';
import { draw, sectionQuads } from '../src/gallery/render';
import { STARTERS } from '../src/gallery/starters';
import { applyWorkshop, workshopOf } from '../src/workshop';

/**
 * The pictures are the tool's own output, so nothing here checks that they
 * look nice. What it checks is that they are still *of* the thing they claim
 * to be: every sample still builds, every cutaway still crosses the joinery it
 * exists to show, and two options never come out as the same picture.
 *
 * The failure this is written against is a quiet one. A model change that
 * moves a joint leaves the gallery rendering happily — the same tile, of
 * nothing in particular — and somebody picks tab and slot from a picture of a
 * plain box.
 */

const GALLERIES: Array<Gallery<string>> = [
  CARCASS_JOINT,
  RELIEF,
  TOP_STYLE,
  BACK_STYLE,
  FLOOR,
  CONSTRUCTION,
  CABINET_TYPE,
  BAY_FRONT,
  BAY_INSIDE,
  DOOR_FIT,
  EFFECT_KIND,
  NEST_STRATEGY,
];

const withPictures = GALLERIES.filter((g) => g.options.some((o) => o.apply));

/**
 * A shop that can cut anything, so whatever a build complains about is the
 * design's own doing.
 *
 * The shipped default is a 1000 mm bed and a 1220 mm sheet, which raises the
 * same two errors for every project there has ever been — R-16 measured them
 * as the first thing a new user sees, and R-21 owns moving them to where they
 * can be fixed. Carrying them into every assertion here would only prove that
 * this file can copy them.
 */
function roomy(): ProjectParams {
  const p = defaultParams();
  p.machine = { ...p.machine, travelX: 3000, travelY: 1600 };
  return p;
}

describe('every option in every gallery', () => {
  const cases = GALLERIES.flatMap((gallery) =>
    gallery.options.map((option) => ({ gallery, option })),
  );

  it.each(cases.filter((c) => c.option.apply).map((c) => [c.gallery.id, c.option.value, c]))(
    '%s / %s builds a sample with no errors',
    (_id, _value, c) => {
      const entry = c as { gallery: Gallery<string>; option: { apply?: (p: ProjectParams) => void } };
      const params = sampleParams(roomy(), (p) => {
        entry.gallery.seed?.(p);
        entry.option.apply?.(p);
      });
      const project = buildProject(params);
      expect(project.parts.length).toBeGreaterThan(0);
      expect(project.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message)).toEqual(
        [],
      );
    },
  );

  it.each(withPictures.map((g) => [g.id, g]))('%s draws every option', (_id, g) => {
    const gallery = g as Gallery<string>;
    for (const option of gallery.options) {
      if (!option.apply) continue;
      const drawing = draw(
        sampleProject(roomy(), (p) => {
          gallery.seed?.(p);
          option.apply?.(p);
        }),
        gallery.view,
      );
      expect(drawing.shapes.length, `${gallery.id}/${option.value} drew nothing`).toBeGreaterThan(0);
    }
  });

  // The one that catches a stale sample. A gallery whose options all render
  // the same is a gallery of one picture with several names, which is worse
  // than the dropdown it replaced: it looks like it is telling you something.
  it.each(withPictures.map((g) => [g.id, g]))('%s draws each option differently', (_id, g) => {
    const gallery = g as Gallery<string>;
    const seen = new Map<string, string>();
    for (const option of gallery.options) {
      if (!option.apply) continue;
      const drawing = draw(
        sampleProject(roomy(), (p) => {
          gallery.seed?.(p);
          option.apply?.(p);
        }),
        gallery.view,
      );
      const ink = drawing.shapes.map((s) => s.d).join('|');
      const twin = seen.get(ink);
      expect(twin, `${gallery.id}: ${option.value} draws exactly like ${twin}`).toBeUndefined();
      seen.set(ink, option.value);
    }
  });

  it('says what each option costs, in words that are not the option name', () => {
    for (const gallery of GALLERIES) {
      expect(gallery.question.endsWith('?'), `${gallery.id} is not a question`).toBe(true);
      for (const option of gallery.options) {
        expect(option.about.length, `${gallery.id}/${option.value}`).toBeGreaterThan(20);
        expect(option.about.toLowerCase()).not.toBe(option.label.toLowerCase());
      }
    }
  });
});

describe('the cutaway really cuts', () => {
  /**
   * A stopped dado leaves the side panel full thickness everywhere except
   * across the groove, where exactly the dado depth is gone. If the section
   * ever stops finding that step it is drawing a plain rectangle and calling
   * it a joint.
   */
  it('leaves a side panel one dado depth thinner across the groove', () => {
    const params = sampleParams(roomy(), (p) => {
      p.joinery.carcassJoint = 'dado';
    });
    const project = buildProject(params);
    const side = project.parts.find((p) => p.role === 'side')!;
    const groove = side.features.find((f) => f.kind === 'pocket')!;
    expect(groove.kind).toBe('pocket');

    // A plane across the width, at the middle of the groove's own run.
    const f = frameOf(side);
    const quads = sectionQuads(side, 'y', (groove.kind === 'pocket' ? midOfPocketY(side, groove) : 0));
    expect(quads.length).toBeGreaterThan(1);

    const thicknesses = quads.map((q) => spanAlong(q, f.n)).sort((a, b) => a - b);
    const depth = groove.kind === 'pocket' ? groove.depth : 0;
    expect(thicknesses[0]).toBeCloseTo(side.thickness - depth, 6);
    expect(thicknesses[thicknesses.length - 1]!).toBeCloseTo(side.thickness, 6);
  });

  it('shows a tab passing right through the panel it slots into', () => {
    const params = sampleParams(roomy(), (p) => {
      p.joinery.carcassJoint = 'tabslot';
    });
    const project = buildProject(params);
    const side = project.parts.find((p) => p.role === 'side')!;
    const slot = side.features.find((f) => f.kind === 'through');
    expect(slot, 'tab and slot produced no slot to cut through').toBeDefined();
  });
});

describe('the sample cache', () => {
  it('hands the same build back for the same numbers', () => {
    const live = roomy();
    const shape = (p: ProjectParams): void => {
      p.joinery.carcassJoint = 'dado';
    };
    expect(sampleProject(live, shape)).toBe(sampleProject(live, shape));
  });

  // The risk R-18 named: thumbnails depend on material thickness and tool
  // diameter, not on cabinet size. Keyed on the sample's own parameters, a
  // joinery change misses and a cabinet resize does not.
  it('misses after a joinery change and hits after a cabinet resize', () => {
    const live = roomy();
    const shape = (p: ProjectParams): void => {
      p.joinery.carcassJoint = 'dado';
    };
    const before = sampleProject(live, shape);

    const resized = structuredClone(live);
    resized.cabinets[0]!.carcasses[0]!.width = 1234;
    expect(sampleProject(resized, shape)).toBe(before);

    const deeper = structuredClone(live);
    deeper.joinery.dadoDepth = live.joinery.dadoDepth + 2;
    const after = sampleProject(deeper, shape);
    expect(after).not.toBe(before);
    expect(draw(after, CARCASS_JOINT.view).shapes.map((s) => s.d).join('|')).not.toEqual(
      draw(before, CARCASS_JOINT.view).shapes.map((s) => s.d).join('|'),
    );
  });
});

describe('the starter designs', () => {
  it.each(STARTERS.map((s) => [s.id, s]))('%s builds with nothing blocking', (_id, entry) => {
    const starter = entry as (typeof STARTERS)[number];
    const design = starter.build();
    applyWorkshop(design, workshopOf(roomy()));
    const project = buildProject(design);
    expect(project.parts.length).toBeGreaterThan(4);
    expect(
      project.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message),
    ).toEqual([]);
  });

  it('gives every cabinet in every starter an id nothing else claims', () => {
    for (const starter of STARTERS) {
      const ids = starter.build().cabinets.map((c) => c.id);
      expect(new Set(ids).size, `${starter.id} repeats a cabinet id`).toBe(ids.length);
    }
  });

  it('keeps this workshop rather than the one the starter was written on', () => {
    const mine = defaultParams();
    mine.materials = [
      { ...mine.materials[0]!, id: 'mine', name: '15 mm poplar ply', actualThickness: 15 },
    ];
    mine.carcassMaterialId = 'mine';
    mine.shelfMaterialId = 'mine';
    mine.drawerBoxMaterialId = 'mine';

    for (const starter of STARTERS) {
      const design = starter.build();
      const notes = applyWorkshop(design, workshopOf(mine));
      // Loudly, never silently: a back panel quietly re-cut to a thickness
      // nobody chose is the failure CLAUDE.md calls the worst available.
      expect(notes.length, `${starter.id} repointed nothing and said nothing`).toBeGreaterThan(0);
      for (const cabinet of design.cabinets) {
        for (const carcass of cabinet.carcasses) {
          expect(carcass.back.materialId).toBe('mine');
        }
      }
      expect(buildProject(design).parts.length).toBeGreaterThan(4);
    }
  });
});

/** The middle of a pocket, in assembly Y, so a section plane crosses it. */
function midOfPocketY(
  part: Parameters<typeof sectionQuads>[0],
  pocket: { kind: 'pocket'; path: { pts: Array<{ x: number; y: number }> } },
): number {
  const f = frameOf(part);
  const ys = pocket.path.pts.map((p) => f.origin.y + f.u.y * p.x + f.v.y * p.y);
  return (Math.min(...ys) + Math.max(...ys)) / 2;
}

/** How far a quad reaches along a direction — the material left in the plane. */
function spanAlong(quad: Array<{ x: number; y: number; z: number }>, n: { x: number; y: number; z: number }): number {
  const ds = quad.map((p) => p.x * n.x + p.y * n.y + p.z * n.z);
  return Math.max(...ds) - Math.min(...ds);
}
