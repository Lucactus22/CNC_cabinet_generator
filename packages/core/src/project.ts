import type { CabinetParams, Part } from './model/types.js';
import { generate, partsNeedingFlip } from './joinery/index.js';
import { nestParts, type NestResult } from './nest/index.js';
import { checkManufacturability, type Diagnostic } from './machine/check.js';
import {
  buildCutList,
  cutListCsv,
  defaultExportOptions,
  exportSheet,
  materialSummary,
  slug,
  type CutListRow,
  type SheetExportOptions,
  type SheetFile,
} from './export/index.js';

export interface ProjectResult {
  params: CabinetParams;
  parts: Part[];
  nest: NestResult;
  diagnostics: Diagnostic[];
  cutList: CutListRow[];
  materials: ReturnType<typeof materialSummary>;
  notes: string[];
}

/**
 * The whole pipeline: parameters in, machinable parts and a verdict out.
 *
 * Deliberately pure and synchronous. The UI can call it on every keystroke,
 * and a test can call it without any scaffolding.
 */
export function buildProject(params: CabinetParams): ProjectResult {
  const { parts, warnings, notes } = generate(params);
  const nest = nestParts(params, parts);
  const flips = partsNeedingFlip(parts);
  const diagnostics = checkManufacturability(params, parts, nest, warnings, flips);
  const cutList = buildCutList(params, parts, nest);
  const materials = materialSummary(params, parts, nest);
  return { params, parts, nest, diagnostics, cutList, materials, notes };
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

  for (const sheet of project.nest.sheets) {
    const out = exportSheet(project.params, project.parts, sheet, opts);
    files.push(out.full);
    files.push(...out.tiles);
    warnings.push(...out.warnings);
  }

  files.push({
    name: `${slug(project.params.name)}-cutlist.csv`,
    dxf: cutListCsv(project.cutList),
  });

  return { files, warnings };
}
