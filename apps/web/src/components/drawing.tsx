import { tessellate, type DxfDrawing, type Path } from '@cabgen/core';

/**
 * Line colour by layer, matching the DXF colour indices.
 *
 * The colours themselves live in `styles.css` rather than here, as
 * `light-dark()` pairs: a sheet drawing is one of the things this app is
 * *read* from, so it has to follow the theme, and R-23's contrast test checks
 * both halves of every one of these against the ground they are drawn on and
 * against paper. They are handed out as `var()` and applied through `style`,
 * which is the form a custom property is guaranteed to substitute into —
 * browsers do also substitute one written as a presentation attribute, but
 * every themed drawing in this app uses the same form so there is nothing to
 * remember.
 */
export function layerStyle(layer: string): { stroke: string; width: number; dash?: string } {
  if (layer.startsWith('OUTLINE')) return { stroke: 'var(--layer-outline)', width: 1.6 };
  if (layer.startsWith('THROUGH')) return { stroke: 'var(--layer-through)', width: 1.3 };
  if (layer.startsWith('POCKET')) return { stroke: 'var(--layer-pocket)', width: 1.1 };
  if (layer.startsWith('DRILL')) return { stroke: 'var(--layer-drill)', width: 1.1 };
  if (layer.startsWith('TILE_REG')) return { stroke: 'var(--layer-tile)', width: 1.3 };
  if (layer.startsWith('TILE')) return { stroke: 'var(--layer-tile)', width: 1, dash: '8 6' };
  if (layer.startsWith('SHEET')) return { stroke: 'var(--layer-sheet)', width: 1, dash: '6 6' };
  if (layer.startsWith('LABEL')) return { stroke: 'var(--layer-label)', width: 0.8 };
  return { stroke: 'var(--layer-label)', width: 1 };
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
            style={{ stroke: s.stroke }}
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
            style={{ stroke: s.stroke }}
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
            transform={`translate(0, ${2 * t.y}) scale(1, -1)`}
            style={{ fill: 'var(--layer-label)', fontFamily: 'ui-monospace, monospace' }}
          >
            {t.text}
          </text>
        ))}
    </>
  );
}
