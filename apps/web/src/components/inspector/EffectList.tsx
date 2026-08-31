import {
  describeTarget,
  EFFECT_LABELS,
  resolveTarget,
  type EffectKind,
  type FrameEffect,
  type GrooveEffect,
  type PartRole,
  type SurfaceEffect,
  type SurfaceEffectSpec,
  type SurfaceTarget,
} from '@cabgen/core';
import { useStore } from '../../store';
import { CheckField, Hint, NumberField, Reveal, SelectField } from '../Controls';
import { ChoiceGallery } from '../../gallery/Gallery';
import { EFFECT_KIND } from '../../gallery/choices';

/** Surfaces worth offering by name, rather than picking a part id. */
const ROLE_TARGETS: Array<{ role: PartRole; label: string }> = [
  { role: 'door', label: 'Doors' },
  { role: 'drawer-face', label: 'Drawer fronts' },
  { role: 'back', label: 'Back panel' },
  { role: 'side', label: 'Side panels' },
  { role: 'divider', label: 'Dividers' },
  { role: 'shelf', label: 'Shelves' },
  { role: 'bottom', label: 'Bottom' },
  { role: 'top', label: 'Top' },
  { role: 'toe-rail', label: 'Toe kick rail' },
  { role: 'hanging-rail', label: 'Hanging rail' },
  { role: 'scribe', label: 'Scribe strips and fillers' },
];

/**
 * A role target as one select value: role, then the cabinet and carcass it is
 * held to, with an empty field meaning 'every one of them'.
 */
const targetKey = (t: SurfaceTarget): string =>
  t.select === 'part'
    ? `part:${t.partId}`
    : `role:${t.role}:${t.cabinetId ?? ''}:${t.carcassId ?? ''}`;

function parseTargetKey(key: string): SurfaceTarget {
  const [kind, role, cabinetId, carcassId] = key.split(':');
  if (kind === 'part') return { select: 'part', partId: role! };
  return {
    select: 'role',
    role: role as PartRole,
    ...(cabinetId ? { cabinetId } : {}),
    ...(carcassId ? { carcassId } : {}),
  };
}

/** A sensible starting point for each kind, sized to the cutter in the spindle. */
function newEffect(kind: EffectKind, toolDiameter: number): SurfaceEffect {
  if (kind === 'frame') {
    return { kind: 'frame', margin: 60, width: Math.max(toolDiameter, 8), depth: 4 };
  }
  return {
    kind: 'grooves',
    direction: 'vertical',
    spacing: 60,
    // A narrower bit gives a finer bead, but default to what you have.
    width: toolDiameter,
    depth: 3,
    margin: 0,
    fit: 'even',
  };
}

/**
 * Decorative machining, listed and edited.
 *
 * Shown twice: on the run, where every effect in the project is, and on a
 * selected panel, where only the ones landing on that panel are and a new one
 * targets it by default. An effect only ever *adds* features, which is why it
 * can be pointed at a role across the whole run without anything else in the
 * pipeline needing to know.
 */
export function EffectList({ onlyPartId }: { onlyPartId?: string } = {}) {
  const params = useStore((s) => s.params);
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.update);

  const effects = params.surfaceEffects;
  // Index into the real list, so removing the second effect landing on a panel
  // removes that one and not the second effect in the project.
  const shown = effects
    .map((spec, index) => ({ spec, index }))
    .filter(
      ({ spec }) =>
        onlyPartId === undefined ||
        resolveTarget(project.parts, spec.target).some((p) => p.id === onlyPartId),
    );

  const add = (): void =>
    update((p) => {
      p.surfaceEffects = [
        ...p.surfaceEffects,
        {
          id: `fx${Date.now().toString(36)}`,
          enabled: true,
          target: onlyPartId
            ? { select: 'part', partId: onlyPartId }
            : { select: 'role', role: 'back' },
          face: 'inside',
          effect: newEffect('grooves', p.tool.diameter),
        },
      ];
    });

  const patch = (i: number, fn: (spec: SurfaceEffectSpec) => void): void =>
    update((p) => {
      if (p.surfaceEffects[i]) fn(p.surfaceEffects[i]!);
    });

  const remove = (i: number): void =>
    update((p) => {
      p.surfaceEffects = p.surfaceEffects.filter((_, k) => k !== i);
    });

  // Only offer surfaces this project actually has.
  const availableRoles = new Set(project.parts.map((p) => p.role));

  // Every carcass in the run, by name, so an effect can be held to one box
  // without having to know what its parts are called.
  const places = params.cabinets.flatMap((cabinet) =>
    cabinet.carcasses.map((carcass) => ({
      cabinetId: cabinet.id,
      carcassId: carcass.id,
      label:
        params.cabinets.length > 1
          ? `${cabinet.name} · ${carcass.name.toLowerCase()}`
          : carcass.name.toLowerCase(),
    })),
  );

  const surfaceOptions = [
    ...(onlyPartId ? [{ value: `part:${onlyPartId}`, label: `This panel: ${onlyPartId}` }] : []),
    ...ROLE_TARGETS.filter((r) => availableRoles.has(r.role)).flatMap((r) => [
      { value: `role:${r.role}::`, label: `${r.label}, everywhere` },
      ...places.map((place) => ({
        value: `role:${r.role}:${place.cabinetId}:${place.carcassId}`,
        label: `${r.label}, ${place.label}`,
      })),
    ]),
  ];

  return (
    <Reveal param="surfaceEffects">
      {shown.length === 0 && (
        <Hint>
          Grooves for beadboard, panelling or fluting, and a frame line for a shaker front — cut
          into a face you choose, inside the area that stays visible once it is assembled.
        </Hint>
      )}

      {shown.map(({ spec, index }) => {
        const g = spec.effect;
        const targeted = resolveTarget(project.parts, spec.target);
        return (
          <div key={spec.id} className={spec.enabled ? 'effect' : 'effect off'}>
            <div className="effect-head">
              <strong>
                {EFFECT_LABELS[g.kind]} · {targeted.length} panel{targeted.length === 1 ? '' : 's'}
              </strong>
              <button onClick={() => remove(index)} title="Remove this effect">
                Remove
              </button>
            </div>

            <CheckField
              label="Enabled"
              value={spec.enabled}
              onChange={(v) =>
                patch(index, (s) => {
                  s.enabled = v;
                })
              }
            />

            {/* No `param`: the whole list is already claimed by the Reveal
                around it, and two controls answering to one catalogue path
                would fight over find-by-name's scroll. */}
            <ChoiceGallery
              gallery={EFFECT_KIND}
              value={g.kind}
              set={(p, v) => {
                const target = p.surfaceEffects[index];
                if (target && target.effect.kind !== v) {
                  target.effect = newEffect(v, p.tool.diameter);
                }
              }}
            />

            <SelectField
              label="Surface"
              value={targetKey(spec.target)}
              options={[
                // A stored target the list does not offer — a part that has
                // since been removed, or a scope from an older file — would
                // otherwise render as a blank select that silently rewrites
                // itself the moment anything else is touched.
                ...(surfaceOptions.some((o) => o.value === targetKey(spec.target))
                  ? []
                  : [
                      {
                        value: targetKey(spec.target),
                        label: `${describeTarget(spec.target)} (not in this project)`,
                      },
                    ]),
                ...surfaceOptions,
              ]}
              onChange={(v) =>
                patch(index, (s) => {
                  s.target = parseTargetKey(v);
                })
              }
            />

            <SelectField
              label="Face"
              value={spec.face}
              options={[
                { value: 'inside', label: 'Inside (facing into the cabinet)' },
                { value: 'outside', label: 'Outside' },
              ]}
              onChange={(v) =>
                patch(index, (s) => {
                  s.face = v;
                })
              }
              title="Pick the face already being machined where you can. A door is the exception: its design belongs on the front, and the hinge boring is on the back either way."
            />

            {g.kind === 'grooves' && (
              <>
                <SelectField
                  label="Direction"
                  value={g.direction}
                  options={[
                    { value: 'vertical', label: 'Vertical' },
                    { value: 'horizontal', label: 'Horizontal' },
                  ]}
                  onChange={(v) =>
                    patch(index, (s) => {
                      (s.effect as GrooveEffect).direction = v;
                    })
                  }
                />
                <NumberField
                  label="Spacing"
                  value={g.spacing}
                  min={1}
                  onChange={(v) =>
                    patch(index, (s) => {
                      (s.effect as GrooveEffect).spacing = v;
                    })
                  }
                />
                <SelectField
                  label="Spacing fit"
                  value={g.fit}
                  options={[
                    { value: 'even', label: 'Even bays (adjusts spacing)' },
                    { value: 'exact', label: 'Exact spacing (centred)' },
                  ]}
                  onChange={(v) =>
                    patch(index, (s) => {
                      (s.effect as GrooveEffect).fit = v;
                    })
                  }
                />
              </>
            )}

            <NumberField
              label={g.kind === 'frame' ? 'Inset from edge' : 'Edge margin'}
              value={g.margin}
              min={0}
              onChange={(v) =>
                patch(index, (s) => {
                  (s.effect as GrooveEffect | FrameEffect).margin = v;
                })
              }
              title={
                g.kind === 'frame'
                  ? 'Panel edge to the outside of the frame line.'
                  : 'Held in from the visible area, which already excludes anything buried in a groove.'
              }
            />
            <NumberField
              label="Groove width"
              value={g.width}
              step={0.5}
              min={0.5}
              onChange={(v) =>
                patch(index, (s) => {
                  (s.effect as GrooveEffect | FrameEffect).width = v;
                })
              }
              title="Cannot be narrower than the cutter."
            />
            <NumberField
              label="Groove depth"
              value={g.depth}
              step={0.5}
              min={0.1}
              onChange={(v) =>
                patch(index, (s) => {
                  (s.effect as GrooveEffect | FrameEffect).depth = v;
                })
              }
            />
          </div>
        );
      })}

      <button onClick={add}>{onlyPartId ? 'Add an effect to this panel' : 'Add an effect'}</button>
    </Reveal>
  );
}
