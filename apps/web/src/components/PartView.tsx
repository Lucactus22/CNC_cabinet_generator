import { useMemo } from 'react';
import {
  bboxOf,
  defaultExportOptions,
  drillLayer,
  emptyDrawing,
  LAYER,
  pocketLayer,
  type DxfDrawing,
  type Part,
} from '@cabgen/core';
import { useStore } from '../store';
import { DrawingSvg } from './drawing';

/** Every part, with the selected one drawn full size. */
export function PartView() {
  const project = useStore((s) => s.project);
  const selected = useStore((s) => s.selectedPartId);
  const select = useStore((s) => s.select);

  const part = project.parts.find((p) => p.id === selected) ?? project.parts[0] ?? null;
  // Solid stock is kept off the sheet cut list — see project.ts — but it
  // still belongs here, next to everything else that comes off the machine.
  const rows = project.cutList.concat(project.stockCutList);

  return (
    <div className="viewport">
      <div className="scroller" style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 18 }}>
        {part && <PartDrawing part={part} />}
        <div>
          <table className="parts">
            <thead>
              <tr>
                <th>ID</th>
                <th>Description</th>
                <th>Length</th>
                <th>Width</th>
                <th>Thick</th>
                <th>Sheet</th>
                <th>Grain</th>
                <th>Pockets</th>
                <th>Holes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={row.id === part?.id ? 'selected' : ''}
                  onClick={() => select(row.id)}
                >
                  <td>{row.id}</td>
                  <td>{row.label}</td>
                  <td>{row.length}</td>
                  <td>{row.width}</td>
                  <td>{row.thickness}</td>
                  <td>{row.sheet}</td>
                  <td>{row.grain}</td>
                  <td>{row.pockets}</td>
                  <td>{row.holes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PartDrawing({ part }: { part: Part }) {
  const drawing = useMemo(() => partDrawing(part), [part]);
  const bb = bboxOf(part.outline);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const pad = Math.max(w, h) * 0.08 + 10;

  return (
    <div>
      <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>
        {part.label}{' '}
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)', fontWeight: 400 }}>
          {part.id} · {w.toFixed(1)} × {h.toFixed(1)} × {part.thickness.toFixed(1)} mm · machined
          face {part.faceASign === '+' ? 'A' : 'A (mirror of its pair)'}
        </span>
      </h3>
      <svg
        className="sheet-svg"
        style={{ maxHeight: '38vh' }}
        viewBox={`${bb.minX - pad} ${bb.minY - pad} ${w + pad * 2} ${h + pad * 2}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <g transform={`translate(0, ${2 * bb.minY + h}) scale(1, -1)`}>
          <DrawingSvg drawing={drawing} showLabels={false} />
        </g>
      </svg>
    </div>
  );
}

/** Compose one part on its own, in its local machining coordinates. */
function partDrawing(part: Part): DxfDrawing {
  const opts = defaultExportOptions();
  const d = emptyDrawing();
  d.paths.push({ layer: LAYER.outline, path: part.outline });
  for (const f of part.features) {
    if (f.kind === 'pocket') {
      d.paths.push({ layer: pocketLayer(f.depth, opts), path: f.path });
    } else if (f.kind === 'through') {
      d.paths.push({ layer: LAYER.through, path: f.path });
    } else if (f.kind === 'drill') {
      d.circles.push({
        layer: drillLayer(f.diameter, f.depth, opts),
        x: f.x,
        y: f.y,
        radius: f.diameter / 2,
      });
    }
  }
  return d;
}
