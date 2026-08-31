import {
  CABINET_TYPES,
  cabinetPositions,
  duplicateCabinet,
  newCarcass,
  resolveWidths,
} from '@cabgen/core';
import { useStore } from '../../store';
import { ActionField, Group, Hint, TextField } from '../Controls';

/**
 * One unit in the run: what it is called, where it stands, and the stack of
 * boxes inside it.
 *
 * There is no stored position — cabinets are placed in list order — so moving
 * one along the wall is moving it in the list, and the measured position is
 * shown so that is obvious rather than something to work out.
 */
export function CabinetInspector({ cabinetId }: { cabinetId: string }) {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);

  const index = params.cabinets.findIndex((c) => c.id === cabinetId);
  const cabinet = params.cabinets[index];
  if (!cabinet) return null;
  const at = cabinetPositions(params.cabinets)[index]!;
  const widths = resolveWidths(cabinet.carcasses);

  const move = (by: number): void => {
    const to = index + by;
    if (to < 0 || to >= params.cabinets.length) return;
    update((p) => {
      const [moved] = p.cabinets.splice(index, 1);
      p.cabinets.splice(to, 0, moved!);
    });
  };

  return (
    <>
      <Group title="Cabinet" open>
        <TextField
          label="Name"
          value={cabinet.name}
          param="cabinets[].name"
          onChange={(v) =>
            update((p) => {
              p.cabinets[index]!.name = v;
            })
          }
        />
        <Hint>
          {at.w.toFixed(0)} mm wide, standing {at.x.toFixed(0)} mm along the run. Part IDs start{' '}
          <code>{cabinet.id}-</code>.
        </Hint>
        <ActionField param="cabinets[].id">
          <button onClick={() => move(-1)} disabled={index === 0} title="Move left along the run">
            ← Left
          </button>
          <button
            onClick={() => move(1)}
            disabled={index === params.cabinets.length - 1}
            title="Move right along the run"
          >
            Right →
          </button>
          <button
            title="Copy this cabinet into the run"
            onClick={() => {
              // Made outside the draft so `select` can find it: see RunStrip.
              const copy = duplicateCabinet(cabinet, params.cabinets);
              update((p) => {
                p.cabinets.splice(index + 1, 0, copy);
              });
              select({ kind: 'cabinet', cabinetId: copy.id });
            }}
          >
            Duplicate
          </button>
          <button
            disabled={params.cabinets.length === 1}
            title={
              params.cabinets.length === 1
                ? 'A project needs at least one cabinet.'
                : 'Remove this cabinet from the run'
            }
            onClick={() => {
              const left = params.cabinets.filter((_, i) => i !== index);
              const next = left[Math.min(index, left.length - 1)];
              update((p) => {
                p.cabinets.splice(index, 1);
              });
              if (next) select({ kind: 'cabinet', cabinetId: next.id });
            }}
          >
            Remove
          </button>
        </ActionField>
      </Group>

      <Group title="The stack" open>
        <Hint>
          Carcasses stand on each other from the floor up, flush at the wall. Only the one on the
          ground can have a toe kick.
        </Hint>
        <ul className="stack-list">
          {[...cabinet.carcasses].reverse().map((carcass) => {
            const k = cabinet.carcasses.indexOf(carcass);
            return (
              <li key={carcass.id}>
                <button
                  className="stack-item"
                  onClick={() =>
                    select({ kind: 'carcass', cabinetId: cabinet.id, carcassId: carcass.id })
                  }
                >
                  <b>{carcass.name}</b>
                  <span>
                    {widths[k]!.width.toFixed(0)} × {carcass.height.toFixed(0)} ×{' '}
                    {carcass.depth.toFixed(0)} mm
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <ActionField param="cabinets[].carcasses[].id">
          <button
            onClick={() => {
              const made = newCarcass(cabinet.carcasses);
              update((p) => {
                p.cabinets[index]!.carcasses.push(made);
              });
              select({ kind: 'carcass', cabinetId: cabinet.id, carcassId: made.id });
            }}
          >
            Add a carcass on top
          </button>
        </ActionField>
      </Group>

      <Group title="What this started as">
        <Hint>
          {CABINET_TYPES.map((t) => `${t.label}: ${t.description}`).join(' ')} A type is a starting
          point, not a class — change anything afterwards and it stays whatever you made it.
        </Hint>
      </Group>
    </>
  );
}
