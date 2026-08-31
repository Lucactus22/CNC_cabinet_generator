import { useId, useMemo } from 'react';
import type { ProjectResult } from '@cabgen/core';
import { draw, type Drawing, type View } from './render';

/**
 * One picture, drawn from a built project.
 *
 * Cached against the project *object* the sample cache handed out, so the
 * same option under the same workshop is projected once and then reused for
 * the life of the page. `View`s are module constants in `choices.ts`, which is
 * what makes them usable as the inner key.
 */
const DRAWN = new WeakMap<ProjectResult, Map<View, Drawing>>();

function drawing(project: ProjectResult, view: View): Drawing {
  let byView = DRAWN.get(project);
  if (!byView) {
    byView = new Map();
    DRAWN.set(project, byView);
  }
  const hit = byView.get(view);
  if (hit) return hit;
  const made = draw(project, view);
  byView.set(view, made);
  return made;
}

/**
 * Strokes are given in millimetres so they mean something in the model, but a
 * hairline on a 2100 mm pantry squeezed into 76 pixels would disappear. They
 * are drawn at a constant width on screen instead, at roughly the millimetre
 * figure the geometry asked for.
 */
const STROKE_SCALE = 1.6;

export function Thumbnail({
  project,
  view,
  className,
}: {
  project: ProjectResult;
  view: View;
  className?: string;
}) {
  const d = useMemo(() => drawing(project, view), [project, view]);
  const clipId = `thumb-clip-${useId()}`;
  const paths = d.shapes.map((s, i) => (
    <path
      key={i}
      d={s.d}
      fill={s.fill ?? 'none'}
      stroke={s.stroke ?? 'none'}
      strokeWidth={(s.width ?? 0.5) * STROKE_SCALE}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  ));
  return (
    <svg
      className={className}
      viewBox={d.viewBox}
      preserveAspectRatio="xMidYMid meet"
      fillRule="evenodd"
      aria-hidden="true"
      focusable="false"
    >
      {d.clip === undefined ? (
        paths
      ) : (
        <>
          <defs>
            <clipPath id={clipId}>
              <path d={d.clip} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>{paths}</g>
        </>
      )}
    </svg>
  );
}
