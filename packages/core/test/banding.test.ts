import { describe, expect, it } from 'vitest';
import { bboxOf } from '../src/geom/index.js';
import {
  buildCutList,
  buildProject,
  defaultParams,
  generate,
  MATERIAL_BANDING,
  nestParts,
} from '../src/index.js';
import type { Part } from '../src/model/types.js';

const find = (parts: Part[], id: string): Part => {
  const p = parts.find((x) => x.id === id);
  if (!p) throw new Error(`no part ${id}; have ${parts.map((x) => x.id).join(', ')}`);
  return p;
};

describe('edge banding', () => {
  it('bands no edges on the default project, and changes no geometry', () => {
    const params = defaultParams();
    const { parts, warnings } = generate(params);
    expect(warnings).toEqual([]);
    expect(parts.every((p) => p.bandedEdges.length === 0)).toBe(true);
  });

  it('shrinks a door on every edge it bands, and only the edges it bands', () => {
    const plain = defaultParams();
    const banded = defaultParams();
    banded.edgeBanding.door = {
      edges: ['left', 'right', 'top', 'bottom'],
      materialId: MATERIAL_BANDING,
    };

    const plainDoor = find(generate(plain).parts, 'C1-B-DOOR-1');
    const result = generate(banded);
    expect(result.warnings).toEqual([]);
    const bandedDoor = find(result.parts, 'C1-B-DOOR-1');

    const t = defaultParams().bandingMaterials[0]!.thickness;
    expect(bandedDoor.width).toBeCloseTo(plainDoor.width - 2 * t, 6);
    expect(bandedDoor.height).toBeCloseTo(plainDoor.height - 2 * t, 6);

    // Reported for every edge asked for, each the *finished* (designed)
    // length — a door banded all round needs a full-height strip on its left
    // and right edges even though top and bottom have also eaten into the
    // substrate there, because whichever pair of edges is taped second is
    // measured after the first pair has already returned that dimension to
    // its designed size. Using the door's own post-shrink width or height
    // here would under-report by up to 2 × t on the second pair.
    expect(bandedDoor.bandedEdges).toHaveLength(4);
    for (const e of bandedDoor.bandedEdges) {
      expect(e.materialId).toBe(MATERIAL_BANDING);
      const expectedLength =
        e.localEdge === 'left' || e.localEdge === 'right' ? plainDoor.height : plainDoor.width;
      expect(e.length).toBeCloseTo(expectedLength, 6);
    }
  });

  it('bands only the requested edge, leaving the panel full size the other way', () => {
    const plain = defaultParams();
    const banded = defaultParams();
    // The front edge only: the shelf's visible edge, not the two captured in
    // the side panels' dados or the one against the back.
    banded.edgeBanding.shelf = { edges: ['front'], materialId: MATERIAL_BANDING };

    const plainShelf = find(generate(plain).parts, 'C1-B-SHELF-2-1');
    const result = generate(banded);
    // In particular: no false "stopped-dado notch is large" warning from the
    // shrunk blank colliding with the front-corner notch that already clears
    // the stopped groove — the notch is measured from the substrate's own
    // edge, and banding rides along with it (see joinery/banding.ts).
    expect(result.warnings).toEqual([]);
    const bandedShelf = find(result.parts, 'C1-B-SHELF-2-1');

    const t = defaultParams().bandingMaterials[0]!.thickness;
    // Depth (front-to-back) shrinks by the tape thickness; width does not.
    expect(bandedShelf.height).toBeCloseTo(plainShelf.height - t, 6);
    expect(bandedShelf.width).toBeCloseTo(plainShelf.width, 6);
    expect(bandedShelf.bandedEdges).toEqual([
      {
        edge: 'front',
        localEdge: 'bottom',
        materialId: MATERIAL_BANDING,
        length: bandedShelf.width,
      },
    ]);
  });

  it('recesses the banded edge from the design edge rather than growing the other way', () => {
    const banded = defaultParams();
    banded.edgeBanding.shelf = { edges: ['front'], materialId: MATERIAL_BANDING };
    const shelf = find(generate(banded).parts, 'C1-B-SHELF-2-1');
    const bb = bboxOf(shelf.outline);
    const t = defaultParams().bandingMaterials[0]!.thickness;
    // Local v = 0 is the shelf's front edge (see frame.ts: v runs +Y, and the
    // frame origin sits at the front). The substrate now starts `t` in from
    // it and the rear edge has not moved.
    expect(bb.minY).toBeCloseTo(t, 6);
    expect(bb.maxY).toBeCloseTo(shelf.exposed.y + shelf.exposed.h, 6);
  });

  it('reduces the blank size reported in the cut list', () => {
    const plain = defaultParams();
    const banded = defaultParams();
    banded.edgeBanding.door = { edges: ['left'], materialId: MATERIAL_BANDING };

    const plainResult = generate(plain);
    const bandedResult = generate(banded);
    const plainRow = buildCutList(
      plain,
      plainResult.parts,
      nestParts(plain, plainResult.parts),
    ).find((r) => r.id === 'C1-B-DOOR-1')!;
    const bandedRow = buildCutList(
      banded,
      bandedResult.parts,
      nestParts(banded, bandedResult.parts),
    ).find((r) => r.id === 'C1-B-DOOR-1')!;

    const t = defaultParams().bandingMaterials[0]!.thickness;
    // The door's local width is its shorter side, so it is the CSV's "width"
    // column, not "length" — banding one vertical edge takes it down by `t`,
    // give or take the row's own 0.1 mm rounding.
    expect(bandedRow.width).toBeLessThan(plainRow.width);
    expect(plainRow.width - bandedRow.width).toBeCloseTo(t, 0);
  });

  it('reports total banding length per material, for ordering tape', () => {
    const plain = defaultParams();
    const params = defaultParams();
    params.edgeBanding.door = {
      edges: ['left', 'right', 'top', 'bottom'],
      materialId: MATERIAL_BANDING,
    };
    const project = buildProject(params);

    // Computed independently of `bandedEdges`, from each door's own *design*
    // perimeter — not from the parts the code under test just produced, which
    // would only prove the summary agrees with itself even if both were
    // wrong the same way (as they were: see the length note in banding.ts).
    const plainDoors = generate(plain).parts.filter((p) => p.role === 'door');
    expect(plainDoors.length).toBeGreaterThan(0);
    const expected = plainDoors.reduce((a, d) => a + 2 * (d.width + d.height), 0);

    expect(project.banding).toEqual([
      { material: params.bandingMaterials[0]!.name, length: Math.round(expected * 10) / 10 },
    ]);
  });

  it('says so and leaves the part unbanded when the material is missing', () => {
    const params = defaultParams();
    params.edgeBanding.door = { edges: ['left'], materialId: 'no-such-tape' };
    const { parts, warnings } = generate(params);

    expect(warnings.some((w) => w.includes('no-such-tape'))).toBe(true);
    expect(parts.filter((p) => p.role === 'door').every((p) => p.bandedEdges.length === 0)).toBe(
      true,
    );
  });

  it('says so when an edge is asked for that a role never has', () => {
    const params = defaultParams();
    // A side panel's own left/right faces are its thickness, not an edge: its
    // perimeter is front, back, top and bottom, whichever hand it is.
    params.edgeBanding.side = { edges: ['left'], materialId: MATERIAL_BANDING };
    const { parts, warnings } = generate(params);

    expect(warnings.some((w) => w.includes('side') && w.includes("'left'"))).toBe(true);
    expect(parts.filter((p) => p.role === 'side').every((p) => p.bandedEdges.length === 0)).toBe(
      true,
    );
  });

  it('refuses to band a panel down to nothing, and says so', () => {
    const params = defaultParams();
    params.bandingMaterials.push({ id: 'thick', name: 'Absurdly thick tape', thickness: 10000 });
    params.edgeBanding.divider = { edges: ['top', 'bottom'], materialId: 'thick' };

    const plain = generate(defaultParams()).parts.find((p) => p.role === 'divider')!;
    const { parts, warnings } = generate(params);
    const divider = parts.find((p) => p.role === 'divider')!;

    expect(warnings.some((w) => w.includes('nothing'))).toBe(true);
    // Left exactly as it was, not clamped to some smaller-but-still-wrong size.
    expect(divider.height).toBeCloseTo(plain.height, 6);
    expect(divider.bandedEdges).toEqual([]);
  });

  it('keeps hinge boring on the finished edge when the door is banded on its hinge side', () => {
    // The hinge-side edge is the one most tempting to band along with the
    // rest of the door, and the one where a wrongly-shifted cup would ruin
    // the door outright.
    const plain = defaultParams();
    const banded = defaultParams();
    banded.edgeBanding.door = { edges: ['left', 'right'], materialId: MATERIAL_BANDING };

    const plainDoor = find(generate(plain).parts, 'C1-B-DOOR-1');
    const bandedDoor = find(generate(banded).parts, 'C1-B-DOOR-1');

    const cupAt = (p: Part): { x: number; y: number } => {
      const cup = p.features.find((f) => f.kind === 'pocket' && f.purpose === 'hinge-cup');
      if (!cup || cup.kind !== 'pocket') throw new Error('no hinge cup on ' + p.id);
      const bb = bboxOf(cup.path);
      return { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
    };

    const plainCup = cupAt(plainDoor);
    const bandedCup = cupAt(bandedDoor);
    // Same local coordinates either way: the cup is bored from the door's
    // frame, fixed at build time, never from the banded (shrunk) blank.
    expect(bandedCup.x).toBeCloseTo(plainCup.x, 6);
    expect(bandedCup.y).toBeCloseTo(plainCup.y, 6);
  });
});
