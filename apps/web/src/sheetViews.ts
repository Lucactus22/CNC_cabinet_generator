import { useMemo } from 'react';
import {
  composeSheet,
  defaultExportOptions,
  planTiles,
  type DxfDrawing,
  type NestedSheet,
  type ProjectResult,
  type TilePlan,
} from '@cabgen/core';

export interface SheetViewItem {
  sheet: NestedSheet;
  label: 'Sheet' | 'Board';
  drawing: DxfDrawing;
  tiles: TilePlan | null;
  material: string | undefined;
}

/**
 * One entry per nested sheet and per solid-stock board, drawn from the very
 * geometry `exportProject` writes — so the export preview's thumbnails and
 * the output pack's full sheet cards can never show something different from
 * what lands in the file. See ARCHITECTURE.md: "there is deliberately no
 * second rendering path."
 */
export function useSheetViews(project: ProjectResult): SheetViewItem[] {
  const { params, parts, nest, stockNest } = project;
  return useMemo(() => {
    const opts = defaultExportOptions();
    const tilesFor = (sheet: NestedSheet): TilePlan | null =>
      planTiles(sheet.contentLength, sheet.width, params.machine, params.nesting.sheetMargin);
    return [
      ...nest.sheets.map((sheet): SheetViewItem => ({
        sheet,
        label: 'Sheet',
        drawing: composeSheet(params, parts, sheet, opts).drawing,
        tiles: tilesFor(sheet),
        material: params.materials.find((m) => m.id === sheet.materialId)?.name,
      })),
      // Boards, drawn the same way: `composeSheet` only ever asks a sheet for
      // its size and its parts, so a board is nothing but a sheet with its
      // parts in a single row.
      ...stockNest.sheets.map((sheet): SheetViewItem => ({
        sheet,
        label: 'Board',
        drawing: composeSheet(params, parts, sheet, opts).drawing,
        tiles: tilesFor(sheet),
        material: params.stockMaterials.find((m) => m.id === sheet.materialId)?.name,
      })),
    ];
  }, [params, parts, nest, stockNest]);
}
