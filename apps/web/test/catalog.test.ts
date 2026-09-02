import { describe, expect, it } from 'vitest';
import {
  buildProject,
  copyEntry,
  defaultParams,
  newCabinetOfType,
  resolveHardware,
  type ProjectParams,
} from '@cabgen/core';
import { CATALOG, NOT_A_CONTROL, normalisePath, search } from '../src/catalog';

/**
 * The inventory R-17 promised not to shrink.
 *
 * The easiest way to score well on "fewer controls on screen" is to quietly
 * drop controls, and nothing else in this repository would notice: a parameter
 * with no control does not fail a build, does not fail a type check, and does
 * not fail a core test. docs/UX.md found eight already missing before the
 * rebuild started, one of them named as the fix in a diagnostic the app raises.
 *
 * So every leaf of `ProjectParams` has to be claimed here — by a catalogue
 * entry, which is also what find-by-name searches and what the palette
 * navigates to, or by an explicit note saying why it is not a control.
 */

/**
 * A project with every conditional branch switched on, so the walk reaches the
 * fields that only exist under an option — the face frame, the drawer stack,
 * the banding rule, the remnant, the measured corner, the copied hinge.
 *
 * Built the same way docs/UX.md's "every branch on" seed was, and run through
 * `buildProject` for the same reason: a malformed one would otherwise be
 * quietly normalised and counted as if it were the ceiling.
 */
function everyBranchOn(): ProjectParams {
  const p = defaultParams();
  p.cabinets.push(newCabinetOfType('wall', p.cabinets));

  const base = p.cabinets[0]!.carcasses[0]!;
  base.construction = 'face-frame';
  base.dividerCount = 2;
  base.bayWidths = [200, 200, 200];
  base.bays = [
    {
      shelves: 'adjustable',
      shelfCount: 0,
      shelfGaps: [],
      doors: 'double',
      drawerFrontHeights: [],
    },
    {
      shelves: 'fixed',
      shelfCount: 2,
      shelfGaps: [300, 300, 300],
      doors: 'left',
      drawerFrontHeights: [],
    },
    {
      shelves: 'none',
      shelfCount: 0,
      shelfGaps: [],
      doors: 'none',
      drawerFrontHeights: [200, 200, 200],
    },
  ];
  base.back.style = 'rabbet';
  base.hangingRail.enabled = true;
  base.toeKick.enabled = true;

  const upper = p.cabinets[0]!.carcasses[1]!;
  upper.floor = 'below';

  p.opening.enabled = true;
  p.opening.cornerTriangleLeft = { alongBack: 600, alongReturn: 800, diagonal: 1002 };
  p.opening.cornerTriangleRight = { alongBack: 600, alongReturn: 800, diagonal: 998 };

  p.joinery.carcassJoint = 'tabslot';
  p.joinery.screwHoles = true;

  p.materials[0]!.sheets.push({ length: 1200, width: 600, quantity: 2 });
  p.edgeBanding.door = { edges: ['left', 'right'], materialId: p.bandingMaterials[0]!.id };
  p.surfaceEffects.push({
    id: 'fx1',
    enabled: true,
    target: { select: 'role', role: 'door' },
    face: 'outside',
    effect: { kind: 'frame', margin: 60, width: 8, depth: 4 },
  });
  p.surfaceEffects.push({
    id: 'fx2',
    enabled: true,
    target: { select: 'role', role: 'back' },
    face: 'inside',
    effect: {
      kind: 'grooves',
      direction: 'vertical',
      spacing: 60,
      width: 6,
      depth: 3,
      margin: 0,
      fit: 'even',
    },
  });
  p.hardware.handleId = 'bar-128';
  // One of each kind, so the custom-entry editors' own fields are walked too.
  const bored = resolveHardware(p.hardware);
  for (const source of [bored.hinge, bored.shelfPin, bored.slide, bored.handle]) {
    if (source) p.hardware.custom.push(copyEntry(source, p.hardware.custom));
  }
  return p;
}

/** Every leaf path in an object, with array indices levelled to `[]`. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => leafPaths(v, `${prefix}[${i}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
  }
  return prefix === '' ? [] : [prefix];
}

const claimed = (path: string): boolean =>
  CATALOG.some((e) =>
    e.covers
      ? path === e.path || path.startsWith(`${e.path}.`) || path.startsWith(`${e.path}[`)
      : e.path === path,
  ) || NOT_A_CONTROL.some((e) => path === e.path || path.startsWith(`${e.path}.`));

describe('the catalogue of every parameter', () => {
  const params = everyBranchOn();

  it('builds, so the walk below is over a project that really exists', () => {
    const project = buildProject(params);
    expect(project.parts.length).toBeGreaterThan(40);
  });

  it('claims every parameter in a project with every branch switched on', () => {
    const paths = [...new Set(leafPaths(params).map(normalisePath))];
    const orphans = paths.filter((path) => !claimed(path));
    expect(orphans).toEqual([]);
  });

  it('claims every parameter of a fresh project too', () => {
    const paths = [...new Set(leafPaths(defaultParams()).map(normalisePath))];
    expect(paths.filter((path) => !claimed(path))).toEqual([]);
  });

  it('has no entry for a parameter that no longer exists', () => {
    const paths = new Set(leafPaths(params).map(normalisePath));
    // A `covers` entry stands for a subtree, so it is enough that something
    // under it exists; a plain entry has to name a real leaf.
    const stale = CATALOG.filter((e) =>
      e.covers
        ? ![...paths].some(
            (p) => p === e.path || p.startsWith(`${e.path}.`) || p.startsWith(`${e.path}[`),
          )
        : !paths.has(e.path),
    ).map((e) => e.path);
    expect(stale).toEqual([]);
  });

  it('reaches the eight parameters docs/UX.md found with no control at all', () => {
    // The measured failure R-17 had to fix, listed one by one so a regression
    // says which one came back rather than "a path is missing".
    for (const path of [
      'carcassMaterialId',
      'shelfMaterialId',
      'drawerBoxMaterialId',
      'doors.materialId',
      'cabinets[].carcasses[].back.materialId',
      'cabinets[].carcasses[].bayWidths',
      'joinery.shelfPin.startAbove',
      'joinery.shelfPin.endBelow',
    ]) {
      expect(
        CATALOG.some((e) => e.path === path),
        path,
      ).toBe(true);
    }
  });
});

describe('find by name', () => {
  // The words a woodworker types are not the words on the controls, and the
  // roadmap names these four specifically. A search that only matched labels
  // would leave the trade's own vocabulary unable to find anything.
  const trade: Array<[string, string]> = [
    ['kickboard', 'cabinets[].carcasses[].toeKick.enabled'],
    ['beadboard', 'surfaceEffects'],
    ['knock-down', 'joinery.carcassJoint'],
    ['rebate', 'cabinets[].carcasses[].back.style'],
    ['plinth', 'cabinets[].carcasses[].toeKick.enabled'],
    ['system 32', 'joinery.shelfPin.frontOffset'],
    ['runner', 'hardware.slideId'],
    ['offcut', 'materials[].sheets[].quantity'],
    ['french cleat', 'cabinets[].carcasses[].hangingRail.enabled'],
    ['calipers', 'materials[].actualThickness'],
  ];

  it.each(trade)('finds %s', (word, path) => {
    const hits = search(word);
    expect(hits.length, `nothing matched "${word}"`).toBeGreaterThan(0);
    expect(hits.slice(0, 5).map((h) => h.entry.path)).toContain(path);
  });

  it('finds nothing for a word nobody uses', () => {
    expect(search('flange bracket')).toEqual([]);
  });
});

describe('every catalogued parameter has a control wired to it', () => {
  // The catalogue test above proves nothing is missing from the *list*. This
  // proves the list is not a work of fiction: each path has to appear as a
  // `param` or `data-param` on a real control in the app's source. Between
  // them, dropping a control fails the build in the same way deleting a core
  // function does.
  // The catalogue itself lists every path by definition, so reading it back
  // would make this test pass on its own contents.
  const modules = import.meta.glob('../src/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  const source = Object.entries(modules)
    .filter(([name]) => !name.endsWith('/catalog.ts'))
    .map(([, text]) => text as string);

  it.each(CATALOG.map((e) => [e.path, e.label]))('renders a control for %s (%s)', (path) => {
    expect(source.some((file) => file.includes(`"${path}"`) || file.includes(`'${path}'`))).toBe(
      true,
    );
  });
});
