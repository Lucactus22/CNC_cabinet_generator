import type {
  CabinetParams,
  EffectKind,
  Feature,
  LocalRect,
  Part,
  SurfaceEffect,
} from '../model/types.js';
import type { LocalFrame } from '../model/frame.js';

/** Everything an effect needs to know about the surface it is decorating. */
export interface EffectContext {
  part: Part;
  frame: LocalFrame;
  /** Area still visible once assembled, already inset by the effect's margin. */
  region: LocalRect;
  /** Which machined face the effect lands on. */
  side: 'A' | 'B';
  params: CabinetParams;
}

export interface EffectOutput {
  features: Feature[];
  warnings: string[];
}

/**
 * An effect turns a region of a face into machining.
 *
 * Adding a new one means writing a function of this shape and registering it;
 * nothing in the builder, the joinery or the exporter needs to change, because
 * effects only ever emit ordinary features.
 */
export type EffectApplier<E extends SurfaceEffect = SurfaceEffect> = (
  effect: E,
  ctx: EffectContext,
) => EffectOutput;

export type EffectRegistry = { [K in EffectKind]: EffectApplier<Extract<SurfaceEffect, { kind: K }>> };

/** Human-readable name, for the UI's effect picker. */
export const EFFECT_LABELS: Record<EffectKind, string> = {
  grooves: 'Grooves (beadboard / panelling)',
  frame: 'Frame (shaker line)',
};
