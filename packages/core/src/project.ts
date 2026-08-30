import type { ProjectParams, Part } from './model/types.js';
import { generate, partsNeedingFlip } from './joinery/index.js';
import { nestParts, nestStock, type NestResult } from './nest/index.js';
import { checkManufacturability, type Diagnostic } from './machine/check.js';
import {
  bandingSummary,
  buildAssemblyPlan,
  buildCutList,
  buildLabelSheet,
  buildStockCutList,
  cutListCsv,
  defaultExportOptions,
  exportSheet,
  materialSummary,
  slug,
  stockSummary,
  type AssemblyPlan,
  type CutListRow,
  type PartLabel,
  type SheetExportOptions,
  type SheetFile,
} from './export/index.js';

export interface ProjectResult {
  params: ProjectParams;
  /** Every part, sheet goods and solid stock alike. */
  parts: Part[];
  nest: NestResult;
  /** Face-frame stiles and rails, packed along boards rather than nested on sheets. */
  stockNest: NestResult;
  diagnostics: Diagnostic[];
  cutList: CutListRow[];
  /** Kept apart from `cutList`: mixing board feet into a sheet count helps nobody. */
  stockCutList: CutListRow[];
  materials: ReturnType<typeof materialSummary>;
  stockMaterials: ReturnType<typeof stockSummary>;
  /** Total tape length needed per banding material. */
  banding: ReturnType<typeof bandingSummary>;
  /** Step-by-step assembly order, derived from the joint graph. See export/assembly.ts. */
  assembly: AssemblyPlan;
  /** One entry per part, for a printable label sheet. See export/labels.ts. */
  labels: PartLabel[];
  notes: string[];
}

/** A part built from solid stock — a face-frame stile or rail — rather than a sheet good. */
function isStock(params: ProjectParams, part: Part): boolean {
  return params.stockMaterials.some((m) => m.id === part.materialId);
}

/**
 * The whole pipeline: parameters in, machinable parts and a verdict out.
 *
 * Deliberately pure and synchronous. The UI can call it on every keystroke,
 * and a test can call it without any scaffolding.
 */
export function buildProject(params: ProjectParams): ProjectResult {
  const { parts, warnings, notes, joints, hinges, handles, slides, wallMounts } = generate(params);
  const stockParts = parts.filter((p) => isStock(params, p));
  const sheetParts = parts.filter((p) => !isStock(params, p));

  const nest = nestParts(params, sheetParts);
  const stockNest = nestStock(params, stockParts);
  const flips = partsNeedingFlip(parts);
  const diagnostics = checkManufacturability(params, parts, nest, warnings, flips, stockNest);
  const cutList = buildCutList(params, sheetParts, nest);
  const stockCutList = buildStockCutList(params, stockParts, stockNest);
  const materials = materialSummary(params, sheetParts, nest);
  const stockMaterials = stockSummary(params, stockParts, stockNest);
  const banding = bandingSummary(params, parts);
  const assembly = buildAssemblyPlan(params, parts, {
    joints,
    hinges,
    handles,
    slides,
    wallMounts,
  });
  const labels = buildLabelSheet(params, parts);
  return {
    params,
    parts,
    nest,
    stockNest,
    diagnostics,
    cutList,
    stockCutList,
    materials,
    stockMaterials,
    banding,
    assembly,
    labels,
    notes,
  };
}

export interface ExportBundle {
  files: SheetFile[];
  warnings: string[];
}

/** Every file a workshop needs: sheet DXFs, per-tile DXFs and the cut list. */
export function exportProject(
  project: ProjectResult,
  opts: SheetExportOptions = defaultExportOptions(),
): ExportBundle {
  const files: SheetFile[] = [];
  const warnings: string[] = [];
  const stockParts = project.parts.filter((p) => isStock(project.params, p));
  const sheetParts = project.parts.filter((p) => !isStock(project.params, p));

  for (const sheet of project.nest.sheets) {
    const out = exportSheet(project.params, sheetParts, sheet, opts);
    files.push(out.full);
    files.push(...out.tiles);
    warnings.push(...out.warnings);
  }

  for (const board of project.stockNest.sheets) {
    const out = exportSheet(project.params, stockParts, board, opts, 'board');
    files.push(out.full);
    files.push(...out.tiles);
    warnings.push(...out.warnings);
  }

  files.push({
    name: `${slug(project.params.name)}-cutlist.csv`,
    dxf: cutListCsv(project.cutList),
  });
  if (project.stockCutList.length > 0) {
    files.push({
      name: `${slug(project.params.name)}-stock-cutlist.csv`,
      dxf: cutListCsv(project.stockCutList, 'Board'),
    });
  }

  return { files, warnings };
}
