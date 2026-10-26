import { describe, expect, it } from 'vitest';
import {
  CABINET_TYPES,
  buildProject,
  defaultParams,
  newCabinetOfType,
  normaliseParams,
  restShelvesOnPins,
  pinHeights,
} from '../src/index.js';
import { buildParts } from '../src/build/builder.js';
import { upper } from './carcasses.js';

describe('loose shelves on a pin ladder', () => {
  const withShelves = (n: number) => {
    const p = defaultParams();
    const bay = upper(p).bays[1]!;
    bay.shelves = 'adjustable';
    bay.looseShelfCount = n;
    return p;
  };
  const looseShelves = (p: ReturnType<typeof defaultParams>) =>
    buildParts(p).parts.filter((x) => x.id.startsWith('C1-T-SHELF-ADJ-2'));

  it('places as many loose shelves as asked for, not always one', () => {
    for (const n of [1, 2, 3, 4]) expect(looseShelves(withShelves(n))).toHaveLength(n);
  });

  it('keeps the id a single loose shelf has always had', () => {
    expect(looseShelves(withShelves(3)).map((s) => s.id)).toEqual([
      'C1-T-SHELF-ADJ-2',
      'C1-T-SHELF-ADJ-2-2',
      'C1-T-SHELF-ADJ-2-3',
    ]);
  });

  // A shelf resting between holes would hang in the air in the cabinet it was
  // cut for: every one has to sit on a pin that was actually bored.
  it('seats every shelf on a bored pin hole, a full shelf thickness clear of the next', () => {
    const p = withShelves(4);
    const built = buildParts(p);
    const shelves = built.parts.filter((x) => x.id.startsWith('C1-T-SHELF-ADJ-2'));
    const holes = built.pinRows.find((r) => r.panelId === 'C1-T-DIV-1')!.heights;
    const zs = shelves.map((s) => s.box.min.z).sort((a, b) => a - b);
    for (const z of zs) expect(holes.some((h) => Math.abs(h - z) < 1e-6)).toBe(true);
    for (let i = 1; i < zs.length; i++) expect(zs[i]! - zs[i - 1]!).toBeGreaterThanOrEqual(17.8);
  });

  it('says so, rather than silently dropping shelves, when the ladder is too short', () => {
    const p = withShelves(40);
    const built = buildParts(p);
    const placed = built.parts.filter((x) => x.id.startsWith('C1-T-SHELF-ADJ-2')).length;
    expect(placed).toBeLessThan(40);
    expect(built.warnings.join(' ')).toMatch(
      new RegExp(`room for ${placed} loose shelves, not 40`),
    );
  });

  it('never seats two shelves on the same pin', () => {
    const pins = pinHeights(100, 900, { pitch: 32, startAbove: 100, endBelow: 100 });
    const { zs } = restShelvesOnPins(pins, 900, 6, 18, 100);
    expect(new Set(zs).size).toBe(zs.length);
  });

  it('reads a bay switched from fixed to adjustable, still carrying its old fixed count, as the one shelf it always built', () => {
    const p = defaultParams();
    upper(p).bays[0]!.shelves = 'adjustable';
    expect(upper(p).bays[0]!.shelfCount).toBe(4);
    const read = normaliseParams(JSON.parse(JSON.stringify(p)));
    const shelves = buildParts(read).parts.filter((x) => x.id.startsWith('C1-T-SHELF-ADJ-1'));
    expect(shelves.map((x) => x.id)).toEqual(['C1-T-SHELF-ADJ-1']);
  });

  it('keeps a shelf a full thickness clear of the next even when the pins are closer than that', () => {
    const pins = Array.from({ length: 40 }, (_, i) => 100 + i * 10);
    const { zs } = restShelvesOnPins(pins, 500, 5, 18, 100);
    expect(zs).toHaveLength(5);
    for (let i = 1; i < zs.length; i++) expect(zs[i]! - zs[i - 1]!).toBeGreaterThanOrEqual(18);
  });
});

describe('wall screws are one setting for the project', () => {
  const wall = () => {
    const p = defaultParams();
    p.cabinets = [newCabinetOfType('wall', []), newCabinetOfType('wall', [])];
    p.cabinets[1]!.id = 'C2';
    return p;
  };
  const wallHoles = (p: ReturnType<typeof defaultParams>) =>
    buildProject(p)
      .parts.filter((x) => x.role === 'hanging-rail')
      .flatMap((x) => x.features)
      .filter((f) => f.kind === 'drill' && f.purpose === 'wall-mount')
      .map((f) => (f.kind === 'drill' ? f.diameter : 0));

  it('drills every hanging rail in every cabinet to the one size', () => {
    const p = wall();
    p.joinery.wallScrewDiameter = 5;
    const sizes = wallHoles(p);
    expect(sizes.length).toBeGreaterThan(4);
    expect(new Set(sizes)).toEqual(new Set([5]));
  });

  it('takes the size from a rail that is drilled, not from a disabled one carrying the old default', () => {
    const old = JSON.parse(JSON.stringify(wall())) as ReturnType<typeof defaultParams>;
    delete (old.joinery as Partial<typeof old.joinery>).wallScrewDiameter;
    Object.assign(old.cabinets[0]!.carcasses[0]!.hangingRail, { enabled: false, screwDiameter: 6 });
    Object.assign(old.cabinets[1]!.carcasses[0]!.hangingRail, { enabled: true, screwDiameter: 8 });
    expect(normaliseParams(old).joinery.wallScrewDiameter).toBe(8);
  });

  it('adopts the size an older file set on its hanging rail, rather than going back to the default', () => {
    const old = JSON.parse(JSON.stringify(wall())) as ReturnType<typeof defaultParams>;
    delete (old.joinery as Partial<typeof old.joinery>).wallScrewDiameter;
    delete (old.joinery as Partial<typeof old.joinery>).wallScrewSpacing;
    Object.assign(old.cabinets[0]!.carcasses[0]!.hangingRail, {
      enabled: true,
      screwDiameter: 8,
      screwSpacing: 250,
    });
    const read = normaliseParams(old);
    expect(read.joinery.wallScrewDiameter).toBe(8);
    expect(read.joinery.wallScrewSpacing).toBe(250);
    expect(read.cabinets[0]!.carcasses[0]!.hangingRail).not.toHaveProperty('screwDiameter');
  });
});

/**
 * The 3D view draws each part at its box. Two boxes may share space only where
 * a joint buries one panel in the other; anywhere else it is two parts built
 * through each other, which was reported from a screenshot and could not be
 * told from a joint by eye.
 */
describe('parts only share space where they are jointed', () => {
  const overlap = (
    a: { min: Record<'x' | 'y' | 'z', number>; max: Record<'x' | 'y' | 'z', number> },
    b: typeof a,
  ) =>
    (['x', 'y', 'z'] as const).every(
      (k) => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]) > 0.01,
    );

  for (const faceFrame of [false, true]) {
    for (const rail of [false, true]) {
      for (const type of CABINET_TYPES) {
        it(`${type.type}${faceFrame ? ' with a face frame' : ''}${rail ? ' and a hanging rail' : ''}`, () => {
          const p = defaultParams();
          const cabinet = newCabinetOfType(type.type, []);
          for (const c of cabinet.carcasses) {
            c.hangingRail.enabled = rail;
            if (faceFrame) c.construction = 'face-frame';
          }
          p.cabinets = [cabinet];
          const { parts, joints } = buildParts(p);
          const jointed = new Set(
            joints.flatMap((j) => [`${j.maleId}|${j.femaleId}`, `${j.femaleId}|${j.maleId}`]),
          );
          const strays: string[] = [];
          for (let i = 0; i < parts.length; i++)
            for (let j = i + 1; j < parts.length; j++)
              if (
                overlap(parts[i]!.box, parts[j]!.box) &&
                !jointed.has(`${parts[i]!.id}|${parts[j]!.id}`)
              )
                strays.push(`${parts[i]!.id} x ${parts[j]!.id}`);
          expect(strays).toEqual([]);
        });
      }
    }
  }

  it('still builds the whole project around them', () => {
    expect(buildProject(defaultParams()).parts.length).toBeGreaterThan(0);
  });
});
