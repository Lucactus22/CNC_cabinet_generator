import type { EdgeBandingSpec, PanelEdge, PartRole } from '@cabgen/core';
import { useStore } from '../../store';
import { Group, Hint, Reveal, SelectField } from '../Controls';
import { EffectList } from './EffectList';

/**
 * Roles worth offering a banding rule for, each with the edges that are ever
 * real on it — the two directions that line up with a part's own normal axis
 * are its faces, not an edge, so they are left out here rather than offered
 * as a checkbox that can never do anything. (The core still resolves this
 * from each part's actual frame and says so if a hand-edited project file
 * asks for one anyway.)
 */
const BANDABLE: Partial<Record<PartRole, { label: string; edges: PanelEdge[] }>> = {
  door: { label: 'doors', edges: ['left', 'right', 'top', 'bottom'] },
  'drawer-face': { label: 'drawer fronts', edges: ['left', 'right', 'top', 'bottom'] },
  side: { label: 'side panels', edges: ['front', 'back', 'top', 'bottom'] },
  divider: { label: 'dividers', edges: ['front', 'back', 'top', 'bottom'] },
  shelf: { label: 'shelves', edges: ['front', 'back', 'left', 'right'] },
  top: { label: 'tops', edges: ['front', 'back', 'left', 'right'] },
  bottom: { label: 'bottoms', edges: ['front', 'back', 'left', 'right'] },
};

const EDGE_LABEL: Record<PanelEdge, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
};

/**
 * One blank: what it is, where it comes from, and what is done to its faces
 * and edges.
 *
 * R-16's measured answer to clicking a panel was fourteen characters of
 * sidebar, 5224 px down. This is what that click is supposed to bring up.
 */
export function PartInspector({ partId }: { partId: string }) {
  const project = useStore((s) => s.project);
  const params = useStore((s) => s.params);

  const part = project.parts.find((p) => p.id === partId);
  if (!part) return null;

  const material =
    params.materials.find((m) => m.id === part.materialId)?.name ??
    params.stockMaterials.find((m) => m.id === part.materialId)?.name ??
    part.materialId;
  const sheet = project.nest.sheets.find((s) => s.parts.some((p) => p.partId === partId));
  const board = project.stockNest.sheets.find((s) => s.parts.some((p) => p.partId === partId));
  const pockets = part.features.filter((f) => f.kind === 'pocket').length;
  const through = part.features.filter((f) => f.kind === 'through').length;
  const holes = part.features.filter((f) => f.kind === 'drill').length;
  // The assembly plan is derived from the joint graph, so the step this panel
  // appears in is the honest answer to "what does this meet".
  const step = project.assembly.steps.find((s) => s.partIds.includes(partId));

  return (
    <>
      <Group title="This panel" open>
        <Hint>
          <b>{part.label}</b>
          <br />
          <code>{part.id}</code> · {part.width.toFixed(1)} × {part.height.toFixed(1)} ×{' '}
          {part.thickness.toFixed(1)} mm · {material}
          <br />
          {[
            pockets ? `${pockets} pocket${pockets > 1 ? 's' : ''}` : '',
            through ? `${through} through cut${through > 1 ? 's' : ''}` : '',
            holes ? `${holes} hole${holes > 1 ? 's' : ''}` : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'no machining'}
          <br />
          {sheet
            ? `Nested on sheet ${sheet.index + 1}.`
            : board
              ? `Cut from board ${board.index + 1}.`
              : 'Not nested — check the diagnostics.'}
        </Hint>
        {step && (
          <Hint>
            Assembly step: {step.title}
            {step.ontoIds.length > 0 ? ` — onto ${step.ontoIds.join(', ')}.` : '.'}
            {step.fixings.length > 0 ? ` ${step.fixings.join('; ')}` : ''}
          </Hint>
        )}
      </Group>

      <Banding role={part.role} />

      <Group
        title="Surface effects"
        count={
          params.surfaceEffects.filter((s) =>
            s.target.select === 'part' ? s.target.partId === partId : s.target.role === part.role,
          ).length
        }
      >
        <EffectList onlyPartId={partId} />
      </Group>
    </>
  );
}

/**
 * Which edges of this kind of part get tape.
 *
 * The rule is per role, not per part — a workshop bands "the shelves", not
 * "this shelf" — so the heading says which. The tape's own measured thickness
 * is a workshop setting; which edges get it is a design one, which is the
 * split docs/UX.md argues for.
 */
function Banding({ role }: { role: PartRole }) {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const entry = BANDABLE[role];
  const spec = params.edgeBanding[role];
  const chosen = spec?.edges ?? [];

  if (!entry) {
    return (
      <Group title="Edge banding">
        <Hint>
          Nothing on this kind of part is banded: every edge of it is either buried in a joint or
          never seen.
        </Hint>
      </Group>
    );
  }

  const setSpec = (fn: (spec: EdgeBandingSpec) => void): void =>
    update((p) => {
      const target = p.edgeBanding[role] ?? {
        edges: [],
        materialId: p.bandingMaterials[0]?.id ?? '',
      };
      fn(target);
      p.edgeBanding[role] = target;
    });

  return (
    <Group title="Edge banding" count={chosen.length || undefined}>
      <Hint>
        A banded edge is cut this much short, so gluing the tape on afterwards brings the part back
        to the size it was designed at. Applies to every one of the {entry.label}.
      </Hint>
      {params.bandingMaterials.length === 0 ? (
        <Hint>No edge tape in this project — add a roll under Workshop.</Hint>
      ) : (
        <>
          <Reveal className="row" param="edgeBanding[].edges">
            {entry.edges.map((edge) => (
              <label key={edge} className="pill toggle">
                <input
                  type="checkbox"
                  checked={chosen.includes(edge)}
                  onChange={() =>
                    setSpec((s) => {
                      s.edges = s.edges.includes(edge)
                        ? s.edges.filter((e) => e !== edge)
                        : [...s.edges, edge];
                    })
                  }
                />
                {EDGE_LABEL[edge]}
              </label>
            ))}
          </Reveal>
          {chosen.length > 0 && (
            <SelectField
              label="Tape"
              value={spec?.materialId ?? params.bandingMaterials[0]!.id}
              param="edgeBanding[].materialId"
              options={params.bandingMaterials.map((m) => ({ value: m.id, label: m.name }))}
              onChange={(v) =>
                setSpec((s) => {
                  s.materialId = v;
                })
              }
            />
          )}
        </>
      )}
    </Group>
  );
}
