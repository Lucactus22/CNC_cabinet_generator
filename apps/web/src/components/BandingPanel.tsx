import type { EdgeBandingSpec, PanelEdge, PartRole } from '@cabgen/core';
import { useStore } from '../store';
import { Group, Hint, NumberField, SelectField } from './Controls';

/**
 * Roles worth offering a banding rule for, each with the edges that are ever
 * real on it — the two directions that line up with a part's own normal axis
 * are its faces, not an edge, so they are left out here rather than offered
 * as a checkbox that can never do anything. (The core still resolves this
 * from each part's actual frame and says so if a hand-edited project file
 * asks for one anyway.)
 */
const BANDABLE_ROLES: Array<{ role: PartRole; label: string; edges: PanelEdge[] }> = [
  { role: 'door', label: 'Doors', edges: ['left', 'right', 'top', 'bottom'] },
  { role: 'drawer-face', label: 'Drawer fronts', edges: ['left', 'right', 'top', 'bottom'] },
  { role: 'side', label: 'Side panels', edges: ['front', 'back', 'top', 'bottom'] },
  { role: 'divider', label: 'Dividers', edges: ['front', 'back', 'top', 'bottom'] },
  { role: 'shelf', label: 'Shelves', edges: ['front', 'back', 'left', 'right'] },
  { role: 'top', label: 'Top', edges: ['front', 'back', 'left', 'right'] },
  { role: 'bottom', label: 'Bottom', edges: ['front', 'back', 'left', 'right'] },
];

const EDGE_LABEL: Record<PanelEdge, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
};

export function BandingPanel() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const project = useStore((s) => s.project);

  const availableRoles = new Set(project.parts.map((p) => p.role));
  const rules = BANDABLE_ROLES.filter((r) => availableRoles.has(r.role));
  const activeCount = rules.filter(
    (r) => (params.edgeBanding[r.role]?.edges.length ?? 0) > 0,
  ).length;

  const setSpec = (role: PartRole, fn: (spec: EdgeBandingSpec) => void): void =>
    update((p) => {
      const spec = p.edgeBanding[role] ?? {
        edges: [],
        materialId: p.bandingMaterials[0]?.id ?? '',
      };
      fn(spec);
      p.edgeBanding[role] = spec;
    });

  const toggleEdge = (role: PartRole, edge: PanelEdge): void =>
    setSpec(role, (spec) => {
      spec.edges = spec.edges.includes(edge)
        ? spec.edges.filter((e) => e !== edge)
        : [...spec.edges, edge];
    });

  return (
    <Group title={`Edge banding${activeCount ? ` (${activeCount})` : ''}`} open={activeCount > 0}>
      <Hint>
        A banded edge is cut this much short, so gluing the tape on afterwards brings the part back
        to the size it was designed at. Pick the visible edges per part, not the ones already buried
        in a joint.
      </Hint>

      {params.bandingMaterials.length === 0 ? (
        <Hint>No banding tape in the project yet — add one to the project file to use this.</Hint>
      ) : (
        <>
          {params.bandingMaterials.map((m, i) => (
            <div key={m.id} style={{ display: 'grid', gap: 8, paddingBottom: 8 }}>
              <strong style={{ fontSize: 12, color: 'var(--muted)' }}>{m.name}</strong>
              <NumberField
                label="Tape thickness"
                value={m.thickness}
                step={0.1}
                min={0.1}
                onChange={(v) =>
                  update((p) => {
                    p.bandingMaterials[i]!.thickness = v;
                  })
                }
                title="Measure the roll. Every edge banded in it is cut this much short."
              />
            </div>
          ))}

          {rules.map(({ role, label, edges: validEdges }) => {
            const spec = params.edgeBanding[role];
            const chosen = spec?.edges ?? [];
            return (
              <div
                key={role}
                style={{
                  borderTop: '1px solid var(--line)',
                  paddingTop: 10,
                  marginTop: 4,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <strong style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</strong>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {validEdges.map((edge) => (
                    <label key={edge} className="pill" style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={chosen.includes(edge)}
                        onChange={() => toggleEdge(role, edge)}
                      />
                      {EDGE_LABEL[edge]}
                    </label>
                  ))}
                </div>
                {chosen.length > 0 && (
                  <SelectField
                    label="Tape"
                    value={spec?.materialId ?? params.bandingMaterials[0]!.id}
                    options={params.bandingMaterials.map((m) => ({ value: m.id, label: m.name }))}
                    onChange={(v) =>
                      setSpec(role, (s) => {
                        s.materialId = v;
                      })
                    }
                  />
                )}
              </div>
            );
          })}
        </>
      )}
    </Group>
  );
}
