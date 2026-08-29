import { bboxOf, pathLength } from '../geom/index.js';
import type { ProjectParams, Part } from '../model/types.js';
import { blankSize } from '../nest/index.js';
import type { NestResult } from '../nest/index.js';

const nameLookups = (
  params: ProjectParams,
): { cabinet: Map<string, string>; carcass: Map<string, string> } => ({
  cabinet: new Map(params.cabinets.map((c) => [c.id, c.name])),
  carcass: new Map(
    params.cabinets.flatMap((c) => c.carcasses.map((k) => [`${c.id}/${k.id}`, k.name] as const)),
  ),
});

export interface CutListRow {
  id: string;
  label: string;
  /** Which unit in the run, so a kitchen's worth of panels can be sorted back into piles. */
  cabinet: string;
  carcass: string;
  role: string;
  material: string;
  thickness: number;
  /** Blank size as it will be cut. */
  length: number;
  width: number;
  quantity: number;
  sheet: number | '';
  grain: string;
  pockets: number;
  holes: number;
  /** Total profile length, for estimating run time. */
  cutLength: number;
}

/** One row per part, in the order they appear on the sheets. */
export function buildCutList(params: ProjectParams, parts: Part[], nest: NestResult): CutListRow[] {
  const sheetOf = new Map<string, number>();
  for (const s of nest.sheets) for (const p of s.parts) sheetOf.set(p.partId, s.index + 1);

  const { cabinet: cabinetName, carcass: carcassName } = nameLookups(params);

  return parts.map((part) => {
    const material = params.materials.find((m) => m.id === part.materialId);
    const size = material ? blankSize(part, material) : { w: part.width, h: part.height };
    const bb = bboxOf(part.outline);
    let cutLength = pathLength(part.outline);
    let pockets = 0;
    let holes = 0;
    for (const f of part.features) {
      if (f.kind === 'pocket') {
        pockets++;
        cutLength += pathLength(f.path);
      } else if (f.kind === 'through') {
        cutLength += pathLength(f.path);
      } else if (f.kind === 'drill') {
        holes++;
      }
    }
    void bb;
    return {
      id: part.id,
      label: part.label,
      cabinet: cabinetName.get(part.cabinetId) ?? part.cabinetId,
      carcass: carcassName.get(`${part.cabinetId}/${part.carcassId}`) ?? part.carcassId,
      role: part.role,
      material: material?.name ?? part.materialId,
      thickness: round(part.thickness),
      length: round(Math.max(size.w, size.h)),
      width: round(Math.min(size.w, size.h)),
      quantity: 1,
      sheet: sheetOf.get(part.id) ?? '',
      grain: part.grainAxis === 'free' ? 'any' : 'fixed',
      pockets,
      holes,
      cutLength: round(cutLength),
    };
  });
}

/**
 * Solid-stock parts — face-frame stiles and rails — in the same row shape as
 * the sheet cut list, but sized from `stockMaterials` and read off boards
 * rather than sheets. Kept as its own list rather than merged into
 * `buildCutList`: mixing board feet into a sheet count would help nobody
 * totting up what to buy.
 */
export function buildStockCutList(
  params: ProjectParams,
  parts: Part[],
  nest: NestResult,
): CutListRow[] {
  const boardOf = new Map<string, number>();
  for (const b of nest.sheets) for (const p of b.parts) boardOf.set(p.partId, b.index + 1);

  const { cabinet: cabinetName, carcass: carcassName } = nameLookups(params);

  return parts.map((part) => {
    const material = params.stockMaterials.find((m) => m.id === part.materialId);
    const bb = bboxOf(part.outline);
    let cutLength = pathLength(part.outline);
    let pockets = 0;
    let holes = 0;
    for (const f of part.features) {
      if (f.kind === 'pocket') {
        pockets++;
        cutLength += pathLength(f.path);
      } else if (f.kind === 'through') {
        cutLength += pathLength(f.path);
      } else if (f.kind === 'drill') {
        holes++;
      }
    }
    return {
      id: part.id,
      label: part.label,
      cabinet: cabinetName.get(part.cabinetId) ?? part.cabinetId,
      carcass: carcassName.get(`${part.cabinetId}/${part.carcassId}`) ?? part.carcassId,
      role: part.role,
      material: material?.name ?? part.materialId,
      thickness: round(part.thickness),
      length: round(Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY)),
      width: round(Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY)),
      quantity: 1,
      sheet: boardOf.get(part.id) ?? '',
      // Solid stock is always cut with the grain running along its length.
      grain: 'fixed',
      pockets,
      holes,
      cutLength: round(cutLength),
    };
  });
}

export function cutListCsv(rows: CutListRow[], sheetLabel = 'Sheet'): string {
  const headers = [
    'Part ID',
    'Description',
    'Cabinet',
    'Carcass',
    'Role',
    'Material',
    'Thickness (mm)',
    'Length (mm)',
    'Width (mm)',
    'Qty',
    sheetLabel,
    'Grain',
    'Pockets',
    'Holes',
    'Cut length (mm)',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.label,
        r.cabinet,
        r.carcass,
        r.role,
        r.material,
        r.thickness,
        r.length,
        r.width,
        r.quantity,
        r.sheet,
        r.grain,
        r.pockets,
        r.holes,
        r.cutLength,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/** Summary by material, for ordering sheets. */
export function materialSummary(
  params: ProjectParams,
  parts: Part[],
  nest: NestResult,
): Array<{ material: string; sheets: number; parts: number; area: number }> {
  return params.materials
    .map((m) => {
      const mine = parts.filter((p) => p.materialId === m.id);
      const sheets = nest.sheets.filter((s) => s.materialId === m.id);
      const area = mine.reduce((a, p) => {
        const s = blankSize(p, m);
        return a + (s.w * s.h) / 1e6;
      }, 0);
      return { material: m.name, sheets: sheets.length, parts: mine.length, area: round(area) };
    })
    .filter((x) => x.parts > 0);
}

/** Summary by stock material, for ordering boards. Length stands in for `materialSummary`'s area. */
export function stockSummary(
  params: ProjectParams,
  parts: Part[],
  nest: NestResult,
): Array<{ material: string; boards: number; parts: number; length: number }> {
  return params.stockMaterials
    .map((m) => {
      const mine = parts.filter((p) => p.materialId === m.id);
      const boards = nest.sheets.filter((s) => s.materialId === m.id);
      const length = mine.reduce((a, p) => {
        const bb = bboxOf(p.outline);
        return a + Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
      }, 0);
      return { material: m.name, boards: boards.length, parts: mine.length, length: round(length) };
    })
    .filter((x) => x.parts > 0);
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const round = (n: number): number => Math.round(n * 10) / 10;
