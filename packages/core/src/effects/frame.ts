import { rect } from '../geom/index.js';
import type { FrameEffect, PocketFeature } from '../model/types.js';
import type { EffectApplier, EffectOutput } from './types.js';

/**
 * A rectangular groove run round a panel: the shaker line on the doors in the
 * reference photographs.
 *
 * The groove is a closed loop rather than a filled recess, so it cuts in one
 * pass round the perimeter instead of clearing the whole field.
 */
export const applyFrame: EffectApplier<FrameEffect> = (effect, ctx): EffectOutput => {
  const warnings: string[] = [];
  const features: PocketFeature[] = [];
  const { part, region, side, params } = ctx;
  const tool = params.tool.diameter;

  if (effect.width < tool - 1e-9) {
    warnings.push(
      `${part.label}: a ${effect.width} mm frame groove is narrower than the ${tool} mm cutter.`,
    );
  }
  if (effect.depth >= part.thickness - 1e-9) {
    warnings.push(
      `${part.label}: a ${effect.depth} mm frame groove would cut through ${part.thickness.toFixed(1)} mm material.`,
    );
    return { features, warnings };
  }

  // The region has already had the effect's own margin taken off, so what is
  // left is the outside of the groove.
  const w = region.w - effect.width;
  const h = region.h - effect.width;
  if (w <= 0 || h <= 0) {
    warnings.push(
      `${part.label}: the frame margin leaves no room for a groove on a ${region.w.toFixed(0)} x ${region.h.toFixed(0)} mm face.`,
    );
    return { features, warnings };
  }

  // Four straight runs rather than one loop path: each is a plain rectangular
  // pocket, which any CAM will clear without needing to understand the corner.
  const x0 = region.x;
  const y0 = region.y;
  const t = effect.width;
  const spans: Array<[number, number, number, number]> = [
    [x0, y0, region.w, t], // bottom
    [x0, y0 + region.h - t, region.w, t], // top
    [x0, y0 + t, t, region.h - 2 * t], // left
    [x0 + region.w - t, y0 + t, t, region.h - 2 * t], // right
  ];

  for (const [x, y, sw, sh] of spans) {
    if (sw <= 0 || sh <= 0) continue;
    features.push({
      kind: 'pocket',
      path: rect(x, y, sw, sh),
      depth: effect.depth,
      side,
      purpose: 'surface-frame',
    });
  }

  return { features, warnings };
};
