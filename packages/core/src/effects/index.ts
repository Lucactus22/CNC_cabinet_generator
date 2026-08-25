import { frameOf } from '../model/frame.js';
import { forcesFace } from '../joinery/index.js';
import type { CabinetParams, LocalRect, Part, SurfaceTarget } from '../model/types.js';
import { applyFrame } from './frame.js';
import { applyGrooves } from './grooves.js';
import type { EffectContext, EffectRegistry } from './types.js';

export * from './types.js';
export * from './grooves.js';
export * from './frame.js';

/** Add a new effect by writing an applier and listing it here. */
export const EFFECTS: EffectRegistry = {
  grooves: applyGrooves,
  frame: applyFrame,
};

export interface EffectResult {
  warnings: string[];
}

/**
 * Apply every enabled surface effect.
 *
 * Effects run after joinery, so they know the finished blank and, crucially,
 * which part of it is still on show. They only ever add features, never change
 * an outline, which is what keeps them independent of the joint strategies.
 */
export function applyEffects(params: CabinetParams, parts: Part[]): EffectResult {
  const warnings: string[] = [];
  if (!params.surfaceEffects?.length) return { warnings };

  const centroid = assemblyCentroid(parts);

  for (const spec of params.surfaceEffects) {
    if (!spec.enabled) continue;
    const targets = resolveTarget(parts, spec.target);
    if (targets.length === 0) {
      warnings.push(`Surface effect "${describeTarget(spec.target)}" matches no panel.`);
      continue;
    }

    for (const part of targets) {
      const frame = frameOf(part);
      const side = faceSideFor(part, centroid, spec.face);

      // Anything already on the other face means this panel has to be turned
      // over, which is worth saying out loud rather than discovering at the
      // machine.
      const otherSide = side === 'A' ? 'B' : 'A';
      const clashes = part.features.some((f) => forcesFace(f) && f.side === otherSide);

      const region = insetRegion(part.exposed, spec.effect.margin);
      const applier = EFFECTS[spec.effect.kind];
      const out = applier(spec.effect as never, {
        part,
        frame,
        region,
        side,
        params,
      } satisfies EffectContext);

      part.features.push(...out.features);
      warnings.push(...out.warnings);

      if (clashes && out.features.length > 0) {
        // A door is meant to be worked on both faces: the hinge cups go on the
        // back and the design on the front, so the flip is the price of the
        // job rather than something to design around.
        warnings.push(
          part.role === 'door'
            ? `${part.label}: hinge boring on the back and the ${spec.effect.kind} design on the front means this door is machined on both faces. Cut the front, turn the sheet over left to right, then cut the _FLIP layers.`
            : `${part.label}: the ${spec.effect.kind} effect is on the ${spec.face} face, but the panel is already machined on the other one, so it now has to be turned over on the bed. Putting the effect on the other face would avoid that.`,
        );
      }
    }
  }

  return { warnings };
}

/** Panels an effect applies to. */
export function resolveTarget(parts: Part[], target: SurfaceTarget): Part[] {
  if (target.select === 'part') return parts.filter((p) => p.id === target.partId);
  return parts.filter(
    (p) => p.role === target.role && (target.carcass === 'both' || p.carcass === target.carcass),
  );
}

export function describeTarget(target: SurfaceTarget): string {
  if (target.select === 'part') return target.partId;
  const where = target.carcass === 'both' ? 'both carcasses' : `${target.carcass} carcass`;
  return `${target.role} in ${where}`;
}

/**
 * Turn 'inside' or 'outside' into a machined face.
 *
 * Face A is not reliably the inner one across every part, so this is decided
 * geometrically: whichever face looks towards the middle of the cabinet is the
 * inside.
 */
export function faceSideFor(
  part: Part,
  centroid: { x: number; y: number; z: number },
  face: 'inside' | 'outside',
): 'A' | 'B' {
  const frame = frameOf(part);
  const mid = {
    x: (part.box.min.x + part.box.max.x) / 2,
    y: (part.box.min.y + part.box.max.y) / 2,
    z: (part.box.min.z + part.box.max.z) / 2,
  };
  const toCentre = { x: centroid.x - mid.x, y: centroid.y - mid.y, z: centroid.z - mid.z };
  const faceALooksInward =
    frame.n.x * toCentre.x + frame.n.y * toCentre.y + frame.n.z * toCentre.z > 0;
  const inside: 'A' | 'B' = faceALooksInward ? 'A' : 'B';
  return face === 'inside' ? inside : inside === 'A' ? 'B' : 'A';
}

function assemblyCentroid(parts: Part[]): { x: number; y: number; z: number } {
  if (parts.length === 0) return { x: 0, y: 0, z: 0 };
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of parts) {
    x += (p.box.min.x + p.box.max.x) / 2;
    y += (p.box.min.y + p.box.max.y) / 2;
    z += (p.box.min.z + p.box.max.z) / 2;
  }
  return { x: x / parts.length, y: y / parts.length, z: z / parts.length };
}

export function insetRegion(r: LocalRect, margin: number): LocalRect {
  return {
    x: r.x + margin,
    y: r.y + margin,
    w: r.w - 2 * margin,
    h: r.h - 2 * margin,
  };
}
