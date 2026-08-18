import { rect } from '../geom/index.js';
import { mapAxis } from '../joinery/helpers.js';
import type { LocalFrame } from '../model/frame.js';
import type { GrooveEffect, PocketFeature } from '../model/types.js';
import type { EffectApplier, EffectOutput } from './types.js';

/**
 * Evenly spaced grooves across a face.
 *
 * The grooves run along one axis and repeat along the other. Direction is given
 * in terms of the assembled cabinet ("vertical" means vertical on the wall),
 * then resolved against the panel's own frame, so it stays correct however the
 * panel happens to be oriented or nested.
 */
export const applyGrooves: EffectApplier<GrooveEffect> = (effect, ctx): EffectOutput => {
  const warnings: string[] = [];
  const features: PocketFeature[] = [];
  const { part, region, frame, side, params } = ctx;
  const tool = params.tool.diameter;

  if (region.w <= 0 || region.h <= 0) {
    warnings.push(`${part.label}: nothing left to groove once the margin is taken off.`);
    return { features, warnings };
  }

  const runAxis = resolveRunAxis(frame, effect.direction);
  if (!runAxis) {
    warnings.push(`${part.label}: could not work out which way the grooves should run.`);
    return { features, warnings };
  }

  // Grooves run along one local axis and repeat across the other.
  const runsAlongU = runAxis === 'u';
  const span = runsAlongU ? region.h : region.w;
  const runLength = runsAlongU ? region.w : region.h;
  const spanStart = runsAlongU ? region.y : region.x;
  const runStart = runsAlongU ? region.x : region.y;

  if (effect.width < tool - 1e-9) {
    warnings.push(
      `${part.label}: a ${effect.width} mm groove is narrower than the ${tool} mm cutter, so it cannot be cut that fine.`,
    );
  }
  if (effect.depth >= part.thickness - 1e-9) {
    warnings.push(
      `${part.label}: a ${effect.depth} mm groove would cut straight through ${part.thickness.toFixed(1)} mm material.`,
    );
    return { features, warnings };
  }
  if (effect.depth > part.thickness * 0.5) {
    warnings.push(
      `${part.label}: grooving ${effect.depth} mm into ${part.thickness.toFixed(1)} mm material leaves it fragile.`,
    );
  }
  if (effect.spacing <= effect.width) {
    warnings.push(
      `${part.label}: a ${effect.spacing} mm spacing is not more than the ${effect.width} mm groove width, so the grooves would merge.`,
    );
    return { features, warnings };
  }

  const centres = grooveCentres(span, effect);
  if (centres.length === 0) {
    warnings.push(
      `${part.label}: ${effect.spacing} mm spacing does not fit across ${span.toFixed(0)} mm of visible panel.`,
    );
    return { features, warnings };
  }

  for (const c of centres) {
    const at = spanStart + c - effect.width / 2;
    const path = runsAlongU
      ? rect(runStart, at, runLength, effect.width)
      : rect(at, runStart, effect.width, runLength);
    features.push({
      kind: 'pocket',
      path,
      depth: effect.depth,
      side,
      purpose: 'surface-grooves',
    });
  }

  return { features, warnings };
};

/**
 * Where the grooves fall across the span.
 *
 * 'even' divides the panel into a whole number of equal bays and puts a groove
 * on every internal boundary, which is how panelling is normally set out and
 * why the reference photographs look regular. 'exact' honours the spacing
 * literally and centres the run instead.
 */
export function grooveCentres(span: number, effect: GrooveEffect): number[] {
  const { spacing, width, fit } = effect;
  if (spacing <= 0 || span <= width) return [];

  if (fit === 'even') {
    const bays = Math.max(1, Math.round(span / spacing));
    if (bays < 2) return [];
    const pitch = span / bays;
    const out: number[] = [];
    for (let i = 1; i < bays; i++) out.push(pitch * i);
    return out;
  }

  // Exact: step outwards from the middle so the pattern stays symmetric.
  const centre = span / 2;
  const out: number[] = [];
  const half = width / 2;
  const fits = (c: number): boolean => c - half >= -1e-9 && c + half <= span + 1e-9;
  if (fits(centre)) out.push(centre);
  for (let k = 1; ; k++) {
    const lo = centre - k * spacing;
    const hi = centre + k * spacing;
    const any = fits(lo) || fits(hi);
    if (fits(lo)) out.unshift(lo);
    if (fits(hi)) out.push(hi);
    if (!any) break;
  }
  return out;
}

const other = (a: 'u' | 'v'): 'u' | 'v' => (a === 'u' ? 'v' : 'u');

/**
 * Which local axis the grooves run along.
 *
 * On an upright panel, "vertical" is simply whichever local axis carries
 * assembly Z. A panel that lies flat has no vertical axis, so there the
 * direction is read against the cabinet's width instead: horizontal grooves run
 * left to right, vertical ones front to back.
 */
export function resolveRunAxis(
  frame: LocalFrame,
  direction: 'vertical' | 'horizontal',
): 'u' | 'v' | null {
  const z = mapAxis(frame, 'z');
  if (z) return direction === 'vertical' ? z.which : other(z.which);

  const x = mapAxis(frame, 'x');
  if (x) return direction === 'horizontal' ? x.which : other(x.which);
  return null;
}
