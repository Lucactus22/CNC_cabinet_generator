import {
  EFFECT_LABELS,
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
];

const targetKey = (t: SurfaceTarget): string =>
  t.select === 'part' ? `part:${t.partId}` : `role:${t.role}:${t.carcass}`;

function parseTargetKey(key: string): SurfaceTarget {
  const [kind, a, b] = key.split(':');
  if (kind === 'part') return { select: 'part', partId: a! };
  return { select: 'role', role: a as PartRole, carcass: b as 'base' | 'top' | 'both' };
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
            : { select: 'role', role: 'back', carcass: 'both' },
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

  // Only offer surfaces this cabinet actually has.
  const availableRoles = new Set(project.parts.map((p) => p.role));

  return (
    <Group title={`Surface effects${effects.length ? ` (${effects.length})` : ''}`} open={effects.length > 0}>
      {effects.length === 0 && (
        <Hint>
          Decorative machining on a chosen face: vertical grooves on a back panel give the
          beadboard look. Select a panel first to target just that one.
        </Hint>
      )}

      {effects.map((spec, i) => {
        const g = spec.effect;
        const targeted = project.parts.filter((p) =>
          spec.target.select === 'part'
            ? p.id === spec.target.partId
            : p.role === spec.target.role &&
              (spec.target.carcass === 'both' || p.carcass === spec.target.carcass),
        );
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
              onChange={(v) => patch(i, (s) => { s.enabled = v; })}
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
                ...(selected
                  ? [{ value: `part:${selected}`, label: `Selected part: ${selected}` }]
                  : []),
                ...ROLE_TARGETS.filter((r) => availableRoles.has(r.role)).flatMap((r) => [
                  { value: `role:${r.role}:both`, label: `${r.label}, both carcasses` },
                  { value: `role:${r.role}:base`, label: `${r.label}, base` },
                  { value: `role:${r.role}:top`, label: `${r.label}, upper` },
                ]),
              ]}
              onChange={(v) => patch(i, (spec) => { spec.target = parseTargetKey(v); })}
            />

            <SelectField
              label="Face"
              value={spec.face}
              options={[
                { value: 'inside', label: 'Inside (facing into the cabinet)' },
                { value: 'outside', label: 'Outside' },
              ]}
              onChange={(v) => patch(i, (spec) => { spec.face = v; })}
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
                  onChange={(v) => patch(i, (spec) => { (spec.effect as GrooveEffect).direction = v; })}
                />
                <NumberField
                  label="Spacing"
                  value={g.spacing}
                  min={1}
                  onChange={(v) => patch(i, (spec) => { (spec.effect as GrooveEffect).spacing = v; })}
                />
                <SelectField
                  label="Spacing fit"
                  value={g.fit}
                  options={[
                    { value: 'even', label: 'Even bays (adjusts spacing)' },
                    { value: 'exact', label: 'Exact spacing (centred)' },
                  ]}
                  onChange={(v) => patch(i, (spec) => { (spec.effect as GrooveEffect).fit = v; })}
                />
              </>
            )}

            <NumberField
              label={g.kind === 'frame' ? 'Inset from edge' : 'Edge margin'}
              value={g.margin}
              min={0}
              onChange={(v) => patch(i, (spec) => { (spec.effect as GrooveEffect | FrameEffect).margin = v; })}
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
              onChange={(v) => patch(i, (spec) => { (spec.effect as GrooveEffect | FrameEffect).width = v; })}
              title="Cannot be narrower than the cutter."
            />
            <NumberField
              label="Groove depth"
              value={g.depth}
              step={0.5}
              min={0.1}
              onChange={(v) => patch(i, (spec) => { (spec.effect as GrooveEffect | FrameEffect).depth = v; })}
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
