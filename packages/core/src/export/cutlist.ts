import { bboxOf, pathLength } from '../geom/index.js';
import type { CabinetParams, Part } from '../model/types.js';
import { blankSize } from '../nest/index.js';
import type { NestResult } from '../nest/index.js';

export interface CutListRow {
  id: string;
  label: string;
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
export function buildCutList(params: CabinetParams, parts: Part[], nest: NestResult): CutListRow[] {
  const sheetOf = new Map<string, number>();
  for (const s of nest.sheets) for (const p of s.parts) sheetOf.set(p.partId, s.index + 1);

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
      carcass: part.carcass === 'base' ? 'Base' : 'Upper',
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

export function cutListCsv(rows: CutListRow[]): string {
  const headers = [
    'Part ID',
    'Description',
    'Carcass',
    'Role',
    'Material',
    'Thickness (mm)',
    'Length (mm)',
    'Width (mm)',
    'Qty',
    'Sheet',
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
  params: CabinetParams,
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

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const round = (n: number): number => Math.round(n * 10) / 10;
