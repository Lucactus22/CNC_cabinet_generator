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
import { useStore } from '../store';
import { CheckField, Group, Hint, NumberField, SelectField } from './Controls';

/** Surfaces worth offering by name, rather than picking a part id. */
const ROLE_TARGETS: Array<{ role: PartRole; label: string }> = [
  { role: 'door', label: 'Doors' },
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

export function EffectsPanel() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const project = useStore((s) => s.project);
  const selected = useStore((s) => s.selectedPartId);

  const effects = params.surfaceEffects ?? [];

  const add = (): void =>
    update((p) => {
      p.surfaceEffects = [
        ...(p.surfaceEffects ?? []),
        {
          id: `fx${Date.now().toString(36)}`,
          enabled: true,
          target: selected
            ? { select: 'part', partId: selected }
            : { select: 'role', role: 'back' },
          face: 'inside',
          effect: newEffect('grooves', p.tool.diameter),
        },
      ];
    });

  const patch = (i: number, fn: (spec: SurfaceEffectSpec) => void): void =>
    update((p) => {
      const list = p.surfaceEffects ?? [];
      if (list[i]) fn(list[i]!);
    });

  const remove = (i: number): void =>
    update((p) => {
      p.surfaceEffects = (p.surfaceEffects ?? []).filter((_, k) => k !== i);
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
    ...(selected ? [{ value: `part:${selected}`, label: `Selected part: ${selected}` }] : []),
    ...ROLE_TARGETS.filter((r) => availableRoles.has(r.role)).flatMap((r) => [
      { value: `role:${r.role}::`, label: `${r.label}, everywhere` },
      ...places.map((place) => ({
        value: `role:${r.role}:${place.cabinetId}:${place.carcassId}`,
        label: `${r.label}, ${place.label}`,
      })),
    ]),
  ];

  return (
    <Group
      title={`Surface effects${effects.length ? ` (${effects.length})` : ''}`}
      open={effects.length > 0}
    >
      {effects.length === 0 && (
        <Hint>
          Decorative machining on a chosen face: vertical grooves on a back panel give the beadboard
          look. Select a panel first to target just that one.
        </Hint>
      )}

      {effects.map((spec, i) => {
        const g = spec.effect;
        const targeted = resolveTarget(project.parts, spec.target);
        return (
          <div
            key={spec.id}
            style={{
              borderTop: '1px solid var(--line)',
              paddingTop: 10,
              marginTop: 4,
              display: 'grid',
              gap: 8,
              opacity: spec.enabled ? 1 : 0.55,
            }}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 12, color: 'var(--muted)' }}>
                Effect {i + 1} · {targeted.length} panel{targeted.length === 1 ? '' : 's'}
              </strong>
              <button onClick={() => remove(i)} title="Remove this effect">
                Remove
              </button>
            </div>

            <CheckField
              label="Enabled"
              value={spec.enabled}
              onChange={(v) =>
                patch(i, (s) => {
                  s.enabled = v;
                })
              }
            />

            <SelectField
              label="Effect"
              value={g.kind}
              options={(Object.keys(EFFECT_LABELS) as EffectKind[]).map((k) => ({
                value: k,
                label: EFFECT_LABELS[k],
              }))}
              onChange={(v) =>
                patch(i, (spec) => {
                  if (spec.effect.kind !== v) spec.effect = newEffect(v, params.tool.diameter);
                })
              }
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
                patch(i, (spec) => {
                  spec.target = parseTargetKey(v);
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
                patch(i, (spec) => {
                  spec.face = v;
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
                    patch(i, (spec) => {
                      (spec.effect as GrooveEffect).direction = v;
                    })
                  }
                />
                <NumberField
                  label="Spacing"
                  value={g.spacing}
                  min={1}
                  onChange={(v) =>
                    patch(i, (spec) => {
                      (spec.effect as GrooveEffect).spacing = v;
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
                    patch(i, (spec) => {
                      (spec.effect as GrooveEffect).fit = v;
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
                patch(i, (spec) => {
                  (spec.effect as GrooveEffect | FrameEffect).margin = v;
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
                patch(i, (spec) => {
                  (spec.effect as GrooveEffect | FrameEffect).width = v;
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
                patch(i, (spec) => {
                  (spec.effect as GrooveEffect | FrameEffect).depth = v;
                })
              }
            />
          </div>
        );
      })}

      <button onClick={add} style={{ marginTop: effects.length ? 10 : 0 }}>
        {selected ? `Add effect to ${selected}` : 'Add effect'}
      </button>
    </Group>
  );
}
