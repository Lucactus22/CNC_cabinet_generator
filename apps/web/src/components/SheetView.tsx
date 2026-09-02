import { selectedPartId, useStore } from '../store';
import { useSheetViews } from '../sheetViews';
import { DrawingSvg } from './drawing';

/**
 * The nested sheets, drawn from the very geometry that gets exported.
 */
export function SheetView() {
  const project = useStore((s) => s.project);
  const selected = useStore(selectedPartId);
  const select = useStore((s) => s.select);

  const sheets = useSheetViews(project);

  if (sheets.length === 0) {
    return <div className="empty">Nothing to nest yet.</div>;
  }

  return (
    <>
      <div className="legend">
        <span>
          <i className="swatch" style={{ background: 'var(--layer-outline)' }} />
          Profile
        </span>
        <span>
          <i className="swatch" style={{ background: 'var(--layer-pocket)' }} />
          Pocket
        </span>
        <span>
          <i className="swatch" style={{ background: 'var(--layer-through)' }} />
          Through cut
        </span>
        <span>
          <i className="swatch" style={{ background: 'var(--layer-drill)' }} />
          Drilling
        </span>
        <span>
          <i className="swatch" style={{ background: 'var(--layer-tile)' }} />
          Tile seam and pins
        </span>
      </div>

      {sheets.map(({ sheet, label, drawing, tiles, material }) => (
        <div className="sheet-card" key={`${label}-${sheet.index}`}>
          <h3>
            {label} {sheet.index + 1}
            <span className="meta">
              {material ?? sheet.materialId} · {sheet.length} × {sheet.width} mm ·{' '}
              {sheet.parts.length} parts · {(sheet.yield * 100).toFixed(0)}% used
              {tiles ? ` · ${tiles.tiles.length} setups` : ' · one setup'}
            </span>
          </h3>
          <svg
            className="sheet-svg"
            viewBox={`-10 -10 ${sheet.length + 20} ${sheet.width + 20}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* DXF has Y running up, SVG has it running down. */}
            <g transform={`translate(0, ${sheet.width}) scale(1, -1)`}>
              <rect
                x={0}
                y={0}
                width={sheet.length}
                height={sheet.width}
                style={{ fill: 'var(--pic-bg)' }}
              />
              {tiles?.tiles.slice(0, -1).map((t) => (
                <line
                  key={t.index}
                  x1={tiles.axis === 'x' ? t.to : 0}
                  y1={tiles.axis === 'x' ? 0 : t.to}
                  x2={tiles.axis === 'x' ? t.to : sheet.length}
                  y2={tiles.axis === 'x' ? sheet.width : t.to}
                  style={{ stroke: 'var(--layer-tile)' }}
                  strokeWidth={1}
                  strokeDasharray="10 8"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {sheet.parts.map((p) => (
                <rect
                  key={p.partId}
                  x={p.x}
                  y={p.y}
                  width={p.w}
                  height={p.h}
                  stroke="none"
                  onClick={() => select({ kind: 'part', partId: p.partId })}
                  style={{
                    fill: selected === p.partId ? 'var(--wash-accent-strong)' : 'transparent',
                    cursor: 'pointer',
                  }}
                />
              ))}
              <DrawingSvg drawing={drawing} />
            </g>
          </svg>
        </div>
      ))}
    </>
  );
}
