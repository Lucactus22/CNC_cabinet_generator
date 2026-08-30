import { bboxOf } from '../geom/index.js';
import type { ProjectParams, Part } from '../model/types.js';
import type { NestedSheet, NestResult } from './index.js';

/**
 * Lay solid-stock parts — face-frame stiles and rails — end to end along
 * boards, one run per stock material.
 *
 * Sheet goods pack in two dimensions because the offcut left over is worth
 * keeping. A board is bought to a fixed width and is only ever cut to length,
 * so this packs length alone, first-fit-decreasing along whichever boards are
 * already open before starting a new one. It returns the same `NestResult`
 * shape sheet goods do — a board is nothing but a one-row sheet — so the DXF
 * writer in `export/sheet.ts` needs no changes to draw one.
 */
export function nestStock(params: ProjectParams, parts: Part[]): NestResult {
  const gap = params.tool.diameter + params.nesting.partGap;
  const sheets: NestedSheet[] = [];
  const unplaced: string[] = [];

  const byMaterial = new Map<string, Part[]>();
  for (const p of parts) {
    const list = byMaterial.get(p.materialId) ?? [];
    list.push(p);
    byMaterial.set(p.materialId, list);
  }

  for (const [materialId, group] of byMaterial) {
    const material = params.stockMaterials.find((m) => m.id === materialId);
    if (!material) {
      unplaced.push(...group.map((p) => p.id));
      continue;
    }

    // Longest first, same heuristic the sheet nester uses, so a board's
    // leftover length is whatever the shortest offcuts can still use.
    const ordered = [...group].sort(
      (a, b) => lengthOf(b) - lengthOf(a) || a.id.localeCompare(b.id),
    );

    const boards: NestedSheet[] = [];
    for (const part of ordered) {
      const len = lengthOf(part);
      const width = widthOf(part);
      if (len > material.boardLength + 1e-6 || width > material.boardWidth + 1e-6) {
        unplaced.push(part.id);
        continue;
      }
      let board = boards.find((b) => b.contentLength + gap + len <= material.boardLength + 1e-6);
      if (!board) {
        board = {
          index: sheets.length,
          materialId,
          contentLength: 0,
          length: material.boardLength,
          width: material.boardWidth,
          parts: [],
          yield: 0,
          // A board is packed in one dimension only; there is no rectangular
          // leftover to speak of; see nest/index.ts for the sheet-goods case.
          remnants: [],
        };
        boards.push(board);
        sheets.push(board);
      }
      const x = board.parts.length === 0 ? 0 : board.contentLength + gap;
      board.parts.push({ partId: part.id, x, y: 0, rotated: false, w: len, h: width });
      board.contentLength = x + len;
    }
  }

  for (const board of sheets) {
    const usable = board.length * board.width;
    const used = board.parts.reduce((a, p) => a + p.w * p.h, 0);
    board.yield = usable > 0 ? used / usable : 0;
  }

  return { sheets, unplaced };
}

const lengthOf = (p: Part): number => {
  const bb = bboxOf(p.outline);
  return Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
};
const widthOf = (p: Part): number => {
  const bb = bboxOf(p.outline);
  return Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY);
};
