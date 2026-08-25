import { useMemo } from 'react';
import { composeSheet, defaultExportOptions, planTiles } from '@cabgen/core';
import { useStore } from '../store';
import { DrawingSvg } from './drawing';

/**
 * The nested sheets, drawn from the very geometry that gets exported.
 */
export function SheetView() {
  const { params, parts, nest } = useStore((s) => s.project);
  const selected = useStore((s) => s.selectedPartId);
  const select = useStore((s) => s.select);

  const sheets = useMemo(
    () =>
      nest.sheets.map((sheet) => ({
        sheet,
        drawing: composeSheet(params, parts, sheet, defaultExportOptions()).drawing,
        // Setups follow how far the parts actually reach, matching the export.
        tiles: planTiles(
          sheet.contentLength,
          sheet.width,
          params.machine,
          params.nesting.sheetMargin,
        ),
        material: params.materials.find((m) => m.id === sheet.materialId),
      })),
    [params, parts, nest],
  );

  if (sheets.length === 0) {
    return (
      <div className="viewport">
        <div className="empty">Nothing to nest yet.</div>
      </div>
    );
  }

  return (
    <div className="viewport">
      <div className="scroller">
        <div className="legend">
          <span>
            <i className="swatch" style={{ background: '#f0a04b' }} />
            Profile
          </span>
          <span>
            <i className="swatch" style={{ background: '#6fc48a' }} />
            Pocket
          </span>
          <span>
            <i className="swatch" style={{ background: '#ef6b6b' }} />
            Through cut
          </span>
          <span>
            <i className="swatch" style={{ background: '#6ba8ef' }} />
            Drilling
          </span>
          <span>
            <i className="swatch" style={{ background: '#c778dd' }} />
            Tile seam and pins
          </span>
        </div>

        {sheets.map(({ sheet, drawing, tiles, material }) => (
          <div className="sheet-card" key={sheet.index}>
            <h3>
              Sheet {sheet.index + 1}
              <span className="meta">
                {material?.name ?? sheet.materialId} · {sheet.length} × {sheet.width} mm ·{' '}
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
                <rect x={0} y={0} width={sheet.length} height={sheet.width} fill="#1b1e24" />
                {tiles?.tiles.slice(0, -1).map((t) => (
                  <line
                    key={t.index}
                    x1={tiles.axis === 'x' ? t.to : 0}
                    y1={tiles.axis === 'x' ? 0 : t.to}
                    x2={tiles.axis === 'x' ? t.to : sheet.length}
                    y2={tiles.axis === 'x' ? sheet.width : t.to}
                    stroke="#c778dd"
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
                    fill={selected === p.partId ? 'rgba(240,160,75,0.20)' : 'transparent'}
                    stroke="none"
                    onClick={() => select(p.partId)}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
                <DrawingSvg drawing={drawing} />
              </g>
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}
