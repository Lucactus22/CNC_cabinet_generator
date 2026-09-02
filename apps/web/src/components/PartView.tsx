import { useMemo } from 'react';
import { bboxOf, defaultExportOptions, exportPart, partDrawing, type Part } from '@cabgen/core';
import { selectedPartId, useStore } from '../store';
import { saveText } from '../download';
import { DrawingSvg } from './drawing';

/** Every part, with the selected one drawn full size. */
export function PartView() {
  const project = useStore((s) => s.project);
  const selected = useStore(selectedPartId);
  const select = useStore((s) => s.select);

  const part = project.parts.find((p) => p.id === selected) ?? project.parts[0] ?? null;
  // Solid stock is kept off the sheet cut list — see project.ts — but it
  // still belongs here, next to everything else that comes off the machine.
  const rows = project.cutList.concat(project.stockCutList);

  return (
    <>
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
                onClick={() => select({ kind: 'part', partId: row.id })}
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
        {project.banding.length > 0 && (
          <p className="hint" style={{ margin: '8px 0 0' }}>
            Banding to order:{' '}
            {project.banding.map((b) => `${b.length} mm ${b.material}`).join(', ')}
          </p>
        )}
      </div>
    </>
  );
}

/** How far outside the outline a banding mark is drawn, so it reads as tape applied to the edge rather than merging with the OUTLINE stroke. */
const bandOffset = (w: number, h: number): number => Math.max(w, h) * 0.02 + 3;

/** The line a banded edge is marked with, just outside the blank's true edge. */
function bandLine(
  local: 'left' | 'right' | 'top' | 'bottom',
  bb: { minX: number; minY: number; maxX: number; maxY: number },
  off: number,
): { x1: number; y1: number; x2: number; y2: number } {
  switch (local) {
    case 'left':
      return { x1: bb.minX - off, y1: bb.minY, x2: bb.minX - off, y2: bb.maxY };
    case 'right':
      return { x1: bb.maxX + off, y1: bb.minY, x2: bb.maxX + off, y2: bb.maxY };
    case 'bottom':
      return { x1: bb.minX, y1: bb.minY - off, x2: bb.maxX, y2: bb.minY - off };
    case 'top':
      return { x1: bb.minX, y1: bb.maxY + off, x2: bb.maxX, y2: bb.maxY + off };
  }
}

function PartDrawing({ part }: { part: Part }) {
  const params = useStore((s) => s.params);
  const safeNames = useStore((s) => s.safeNames);
  // Never the engraved id: the heading right below already names the part,
  // and drawing it twice would be clutter rather than information.
  const drawing = useMemo(() => partDrawing(part, { safeNames: false }, false), [part]);
  const bb = bboxOf(part.outline);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const pad = Math.max(w, h) * 0.08 + 10;
  const off = bandOffset(w, h);
  const bandingName = (id: string): string =>
    params.bandingMaterials.find((m) => m.id === id)?.name ?? id;

  const download = (): void => {
    // Same safe-names setting the full-project export uses — a part
    // re-downloaded here after ruining the first one has to import into the
    // same CAM setup the rest of the job already did.
    const { file } = exportPart(part, { ...defaultExportOptions(), safeNames });
    saveText(file.dxf, file.name, 'application/dxf');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>
          {part.label}{' '}
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)', fontWeight: 400 }}>
            {part.id} · {w.toFixed(1)} × {h.toFixed(1)} × {part.thickness.toFixed(1)} mm · machined
            face {part.faceASign === '+' ? 'A' : 'A (mirror of its pair)'}
          </span>
        </h3>
        <span className="spacer" />
        <button
          className="link"
          onClick={download}
          title="This one blank's DXF on its own — the answer to a ruined panel, without opening the whole sheet zip."
        >
          Download this part's DXF
        </button>
      </div>
      <svg
        className="sheet-svg"
        style={{ maxHeight: '38vh' }}
        viewBox={`${bb.minX - pad} ${bb.minY - pad} ${w + pad * 2} ${h + pad * 2}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <g transform={`translate(0, ${2 * bb.minY + h}) scale(1, -1)`}>
          <DrawingSvg drawing={drawing} showLabels={false} />
          {part.bandedEdges.map((e, i) => {
            const line = bandLine(e.localEdge, bb, off);
            return (
              <line
                key={i}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="#ec4899"
                strokeWidth={2.4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </g>
      </svg>
      {part.bandedEdges.length > 0 && (
        <p className="hint" style={{ margin: '4px 0 0' }}>
          <span style={{ color: '#ec4899' }}>▬</span> Banded:{' '}
          {part.bandedEdges.map((e) => `${e.edge} (${bandingName(e.materialId)})`).join(', ')}
        </p>
      )}
    </div>
  );
}
