import { describe, expect, it } from 'vitest';
import { base } from './carcasses.js';
import {
  buildProject,
  defaultParams,
  HANDLE_BAR_128,
  HINGE_UTRUSTA,
  PIN_5MM,
  SLIDE_BLUM_TANDEM_H,
  type Part,
} from '../src/index.js';

const cupBores = (parts: Part[]): number =>
  parts
    .flatMap((p) => p.features)
    // Pocketed, not drilled — hardware/hinges.ts bores the 35 mm cup with
    // whatever cutter is already in the spindle rather than a Forstner bit.
    .filter((f) => f.kind === 'pocket' && f.purpose === 'hinge-cup').length;

/** Distinct doors carrying at least one handle-fixing hole — a bar drills two, but is one handle. */
const doorsWithHandles = (parts: Part[]): number =>
  new Set(
    parts
      .filter((p) => p.features.some((f) => f.kind === 'drill' && f.purpose === 'handle'))
      .map((p) => p.id),
  ).size;

/**
 * R-22: the shopping summary — "sheets by material" already existed as
 * `project.materials`; this is its hardware sibling. Every count here is
 * checked against an oracle that does not go through `hardwareSummary`
 * itself — the cup holes actually bored, the handle holes actually drilled,
 * the shelf actually left loose — so a bug that made the summary agree with
 * its own arithmetic but not with the plywood would still fail here.
 */
describe('the hardware shopping summary', () => {
  it('counts hinges by the cups they actually bore, on the default project', () => {
    const project = buildProject(defaultParams());
    const row = project.hardware.find((r) => r.kind === 'hinge');
    expect(row).toBeDefined();
    expect(row!.name).toBe(HINGE_UTRUSTA.name);
    expect(row!.quantity).toBe(cupBores(project.parts));
    expect(row!.unit).toBe('hinge');
  });

  it('reports no handles when none are chosen, which is the default', () => {
    const project = buildProject(defaultParams());
    expect(project.hardware.some((r) => r.kind === 'handle')).toBe(false);
  });

  it('counts handles once a project actually chooses one', () => {
    const p = defaultParams();
    p.hardware.handleId = HANDLE_BAR_128.id;
    const project = buildProject(p);
    const row = project.hardware.find((r) => r.kind === 'handle');
    const expected = doorsWithHandles(project.parts);
    expect(expected).toBeGreaterThan(0);
    expect(row?.quantity).toBe(expected);
    expect(row?.name).toBe(HANDLE_BAR_128.name);
    expect(row?.unit).toBe('handle');
  });

  it('reports shelf pins only for the loose shelf, not a fixed one sharing its role', () => {
    const project = buildProject(defaultParams());
    // Both live on the default project (see hardware.test.ts's own
    // PIN_PANEL comment): a fixed shelf is jointed into the sides, an
    // adjustable one floats free on pins. '-SHELF-ADJ-' is the builder's own
    // naming for the free one — build/builder.ts's "one loose shelf per bay".
    const adjustableShelves = project.parts.filter((p) => p.id.includes('-SHELF-ADJ-')).length;
    const fixedShelves = project.parts.filter(
      (p) => p.role === 'shelf' && !p.id.includes('-SHELF-ADJ-'),
    ).length;
    expect(adjustableShelves).toBeGreaterThan(0);
    expect(fixedShelves).toBeGreaterThan(0);
    const row = project.hardware.find((r) => r.kind === 'shelf-pin');
    expect(row?.name).toBe(PIN_5MM.name);
    // Two rows of pins, one on each side of the bay, front and back.
    expect(row?.quantity).toBe(adjustableShelves * 4);
    expect(row?.unit).toBe('pin');
  });

  it('groups drawer slides by the runner length each drawer was actually cut to', () => {
    const p = defaultParams();
    const stock14 = 'ply14-drawer';
    p.materials.push({
      id: stock14,
      name: '14 mm ply',
      nominalThickness: 14,
      actualThickness: 14,
      sheets: [{ length: 2440, width: 1220 }],
      hasGrain: true,
    });
    p.drawerBoxMaterialId = stock14;
    base(p).bays[0] = {
      shelves: 'none',
      shelfCount: 0,
      shelfGaps: [],
      doors: 'none',
      drawerFrontHeights: [250, 250, 250],
    };
    const project = buildProject(p);
    const slideRows = project.hardware.filter((r) => r.kind === 'slide');
    expect(slideRows.length).toBeGreaterThan(0);
    // One pair of runners per drawer, whatever length each was cut to.
    expect(slideRows.reduce((a, r) => a + r.quantity, 0)).toBe(3);
    for (const row of slideRows) {
      expect(row.name).toBe(SLIDE_BLUM_TANDEM_H.name);
      expect(row.unit).toBe('pair');
      expect(row.detail).toMatch(/^\d+ mm$/);
    }
  });

  it('leaves out any hardware kind a plain box never asks for', () => {
    const p = defaultParams();
    for (const cabinet of p.cabinets) {
      for (const carcass of cabinet.carcasses) {
        carcass.bays = carcass.bays.map(() => ({
          shelves: 'none',
          shelfCount: 0,
          shelfGaps: [],
          doors: 'none',
          drawerFrontHeights: [],
        }));
      }
    }
    const project = buildProject(p);
    expect(project.hardware).toEqual([]);
  });
});
