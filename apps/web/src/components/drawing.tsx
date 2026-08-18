import { tessellate, type DxfDrawing, type Path } from '@cabgen/core';

/** Line colour by layer, matching the DXF colour indices. */
export function layerStyle(layer: string): { stroke: string; width: number; dash?: string } {
  if (layer.startsWith('OUTLINE')) return { stroke: '#f0a04b', width: 1.6 };
  if (layer.startsWith('THROUGH')) return { stroke: '#ef6b6b', width: 1.3 };
  if (layer.startsWith('POCKET')) return { stroke: '#6fc48a', width: 1.1 };
  if (layer.startsWith('DRILL')) return { stroke: '#6ba8ef', width: 1.1 };
  if (layer.startsWith('TILE_REG')) return { stroke: '#c778dd', width: 1.3 };
  if (layer.startsWith('TILE')) return { stroke: '#c778dd', width: 1, dash: '8 6' };
  if (layer.startsWith('SHEET')) return { stroke: '#3a4150', width: 1, dash: '6 6' };
  if (layer.startsWith('LABEL')) return { stroke: '#98a1b3', width: 0.8 };
  return { stroke: '#98a1b3', width: 1 };
}

export const toPolyline = (path: Path, sagitta = 0.15): string =>
  tessellate(path, sagitta)
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');

/**
 * Render a composed drawing as SVG.
 *
 * This is the same DxfDrawing the exporter writes, so what appears on screen is
 * literally what lands in the file: there is no second rendering path to drift.
 */
export function DrawingSvg({
  drawing,
  showLabels = true,
}: {
  drawing: DxfDrawing;
  showLabels?: boolean;
}) {
  return (
    <>
      {drawing.paths.map((p, i) => {
        const s = layerStyle(p.layer);
        const pts = toPolyline(p.path);
        if (!pts) return null;
        const Tag = p.path.closed ? 'polygon' : 'polyline';
        return (
          <Tag
            key={`p${i}`}
            points={pts}
            fill="none"
            stroke={s.stroke}
            strokeWidth={s.width}
            strokeDasharray={s.dash}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {drawing.circles.map((c, i) => {
        const s = layerStyle(c.layer);
        return (
          <circle
            key={`c${i}`}
            cx={c.x}
            cy={c.y}
            r={c.radius}
            fill="none"
            stroke={s.stroke}
            strokeWidth={s.width}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {showLabels &&
        drawing.texts.map((t, i) => (
          <text
            key={`t${i}`}
            x={t.x}
            y={t.y}
            fontSize={t.height * 1.6}
            fill="#98a1b3"
            transform={`translate(0, ${2 * t.y}) scale(1, -1)`}
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            {t.text}
          </text>
        ))}
    </>
  );
}
