import type { ReactNode } from 'react';
import { selectedPartId, useStore } from '../store';
import { useSheetViews } from '../sheetViews';
import { DrawingSvg } from './drawing';
import { partsTurnedOver, splitPasses, turnOverSteps, turnedFootprint } from '../turnOver';

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

      {sheets.map(({ sheet, label, drawing, tiles, material }) => {
        const passes = splitPasses(drawing);
        const turned = passes.second ? partsTurnedOver(sheet, project.parts) : new Set<string>();
        const frame = (title: string, children: ReactNode, ghosts: ReactNode = null) => (
          <svg
            role="img"
            aria-label={`${label} ${sheet.index + 1}, ${title}`}
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
              {ghosts}
              {children}
            </g>
          </svg>
        );
        return (
          <div className="sheet-card" key={`${label}-${sheet.index}`}>
            <h3>
              {label} {sheet.index + 1}
              <span className="meta">
                {material ?? sheet.materialId} · {sheet.length} × {sheet.width} mm ·{' '}
                {sheet.parts.length} parts · {(sheet.yield * 100).toFixed(0)}% used
                {tiles ? ` · ${tiles.tiles.length} setups` : ' · one setup'}
                {passes.second ? ' · turned over once' : ''}
              </span>
            </h3>
            {passes.second && (
              <details className="turn-over" open>
                <summary>
                  How to turn this {label.toLowerCase()} over —{' '}
                  {turned.size === 1 ? 'one part has' : `${turned.size} parts have`} work on the
                  second face
                </summary>
                <ol>
                  {turnOverSteps(sheet, tiles).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            )}
            {passes.second && <p className="pass-title">Pass 1 — the sheet as it lies</p>}
            {frame(
              'pass 1',
              <>
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
                <DrawingSvg drawing={passes.first} />
              </>,
            )}
            {passes.second && (
              <>
                <p className="pass-title">
                  Pass 2 — turned over left to right. Dotted boxes are where each part now lies; the
                  part with work on its second face is solid.
                </p>
                {frame(
                  'pass 2, turned over',
                  <DrawingSvg drawing={passes.second} />,
                  sheet.parts.map((p) => {
                    const f = turnedFootprint(sheet, p);
                    const mine = turned.has(p.partId);
                    return (
                      <rect
                        key={p.partId}
                        x={f.x}
                        y={f.y}
                        width={f.w}
                        height={f.h}
                        fill={mine ? 'var(--wash-accent-strong)' : 'none'}
                        style={{ stroke: 'var(--layer-outline)' }}
                        strokeWidth={mine ? 1.6 : 1}
                        strokeDasharray={mine ? undefined : '3 5'}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  }),
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
