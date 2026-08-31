import { useState } from 'react';
import { cabinetPositions, layoutBays, newCabinetOfType, resolveWidths } from '@cabgen/core';
import { useStore } from '../store';
import { ChoiceGallery } from '../gallery/Gallery';
import { CABINET_TYPE } from '../gallery/choices';
import { sameSelection, type Selection } from '../selection';

/**
 * The run, drawn to scale along the bottom of the bench.
 *
 * This is the project's structure panel and a picture of the project at once.
 * It is not a tree, because the structure is not one: it is three nested
 * *linear* orders that each correspond to a direction in the room — cabinets
 * left to right along the wall, carcasses bottom to top up the stack, bays
 * left to right across the front. A generic tree widget would redraw that
 * hierarchy with less information than the model already carries, and teach a
 * vocabulary nobody needs. See docs/UX.md, question 2.
 *
 * It is also the only thing that makes a **bay** addressable. Bays are not
 * parts and have no geometry to raycast against — making them clickable in the
 * model itself is R-20's work — so drawing them here is what takes "drawers in
 * that bay" down to pointing at the bay and saying drawers.
 */
export function RunStrip() {
  const params = useStore((s) => s.params);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const update = useStore((s) => s.update);
  const parts = useStore((s) => s.project.parts);

  const [adding, setAdding] = useState(false);
  const [hoverCarcass, setHoverCarcass] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const positions = cabinetPositions(params.cabinets);
  const runHeight =
    Math.max(1, ...params.cabinets.map((c) => c.carcasses.reduce((a, k) => a + k.height, 0))) || 1;
  const thickness =
    params.materials.find((m) => m.id === params.carcassMaterialId)?.actualThickness ?? 18;

  const on = (sel: Selection): boolean => sameSelection(selection, sel);
  // A part is selected by clicking the model, and it belongs to a carcass —
  // so the strip shows where you are even then.
  const partOf =
    selection.kind === 'part' ? parts.find((p) => p.id === selection.partId) : undefined;

  const move = (from: number, to: number): void => {
    if (from === to || to < 0 || to >= params.cabinets.length) return;
    update((p) => {
      const [moved] = p.cabinets.splice(from, 1);
      p.cabinets.splice(to, 0, moved!);
    });
  };

  return (
    <div className="runstrip no-print" aria-label="The run">
      <div className="run-scale">
        {params.cabinets.map((cabinet, ci) => {
          const widths = resolveWidths(cabinet.carcasses);
          const cabWidth = positions[ci]!.w || 1;
          const selectedCabinet =
            on({ kind: 'cabinet', cabinetId: cabinet.id }) || partOf?.cabinetId === cabinet.id;
          return (
            <div
              key={cabinet.id}
              className={selectedCabinet ? 'cab on' : 'cab'}
              style={{ flexGrow: cabWidth, flexBasis: 0 }}
              draggable
              onDragStart={() => setDragFrom(ci)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom !== null) move(dragFrom, ci);
                setDragFrom(null);
              }}
            >
              <div
                className="cab-stack"
                style={{ height: `${(stackHeight(cabinet) / runHeight) * 100}%` }}
              >
                {[...cabinet.carcasses]
                  .map((carcass, k) => ({ carcass, k }))
                  .reverse()
                  .map(({ carcass, k }) => {
                    const width = widths[k]!.width;
                    const bays = layoutBays({ ...carcass, width }, thickness).bays;
                    const carcassSel: Selection = {
                      kind: 'carcass',
                      cabinetId: cabinet.id,
                      carcassId: carcass.id,
                    };
                    const here =
                      on(carcassSel) ||
                      (partOf?.cabinetId === cabinet.id && partOf.carcassId === carcass.id);
                    const key = `${cabinet.id}-${carcass.id}`;
                    return (
                      <div
                        key={carcass.id}
                        className={here ? 'carc on' : 'carc'}
                        style={{
                          flexGrow: carcass.height,
                          flexBasis: 0,
                          width: `${(width / cabWidth) * 100}%`,
                        }}
                        onMouseEnter={() => setHoverCarcass(key)}
                        onMouseLeave={() => setHoverCarcass((h) => (h === key ? null : h))}
                      >
                        <button
                          className="carc-tab"
                          title={`${carcass.name}: ${width.toFixed(0)} × ${carcass.height.toFixed(0)} × ${carcass.depth.toFixed(0)} mm`}
                          onClick={() => select(carcassSel)}
                        >
                          {carcass.name}
                        </button>
                        <div className="bays">
                          {bays.map((b, i) => {
                            const baySel: Selection = {
                              kind: 'bay',
                              cabinetId: cabinet.id,
                              carcassId: carcass.id,
                              bay: i,
                            };
                            const spec = carcass.bays[i];
                            return (
                              <button
                                key={i}
                                className={on(baySel) ? 'bay on' : 'bay'}
                                style={{ flexGrow: b.x1 - b.x0, flexBasis: 0 }}
                                title={`Bay ${i + 1}: ${describeBay(spec)}`}
                                aria-label={`${carcass.name}, bay ${i + 1}`}
                                onClick={() => select(baySel)}
                              >
                                <span className="bay-mark">{markOf(spec)}</span>
                              </button>
                            );
                          })}
                        </div>
                        {/* Only on the box under the pointer: a delete on every
                            carcass at once is clutter, and the inspector keeps
                            the same action reachable without a mouse. */}
                        {hoverCarcass === key && cabinet.carcasses.length > 1 && (
                          <button
                            className="carc-remove"
                            title={`Remove ${carcass.name} from the stack`}
                            aria-label={`Remove ${carcass.name}`}
                            onClick={() => {
                              update((p) => {
                                p.cabinets[ci]!.carcasses.splice(k, 1);
                              });
                              select(neighbourCarcass(cabinet, k));
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
              <button
                className="cab-head"
                onClick={() => select({ kind: 'cabinet', cabinetId: cabinet.id })}
                title={`${cabinet.name} — ${positions[ci]!.w.toFixed(0)} mm wide, ${positions[ci]!.x.toFixed(0)} mm along the run. Drag to move it along the wall.`}
              >
                {cabinet.name}
              </button>
            </div>
          );
        })}
      </div>

      <div className="run-add">
        <button
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          title="Add a cabinet to the end of the run"
        >
          +
        </button>
        {adding && (
          <div className="run-add-menu">
            {/* Hovering one puts that cabinet on the end of the real run, at
                your own dimensions, before it is added — which is a better
                answer to "what is a tall unit" than four words in a menu. */}
            <ChoiceGallery
              gallery={CABINET_TYPE}
              param="cabinets[].name"
              wide
              set={(draft, type) => {
                draft.cabinets.push(newCabinetOfType(type, draft.cabinets));
              }}
              onPick={(type) => {
                setAdding(false);
                // Built before the update so its id is known outside the
                // draft: `select` settles against the store's parameters,
                // which do not have the new cabinet in them until `update`
                // has returned — selecting from inside would resolve to the
                // run instead of to what was just added.
                const made = newCabinetOfType(type, params.cabinets);
                update((p) => {
                  p.cabinets.push(made);
                });
                select({ kind: 'cabinet', cabinetId: made.id });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * What to look at once a carcass is gone: the box that took its place in the
 * stack, not the cabinet above it. Removing one thing leaves you working on
 * the next, which is what every list behaves like and what keeps a stack of
 * two down to a single act when one of them was never wanted.
 */
function neighbourCarcass(
  cabinet: { id: string; carcasses: Array<{ id: string }> },
  removed: number,
): Selection {
  const left = cabinet.carcasses.filter((_, i) => i !== removed);
  const next = left[Math.min(removed, left.length - 1)];
  return next
    ? { kind: 'carcass', cabinetId: cabinet.id, carcassId: next.id }
    : { kind: 'cabinet', cabinetId: cabinet.id };
}

const stackHeight = (cabinet: { carcasses: Array<{ height: number }> }): number =>
  Math.max(
    1,
    cabinet.carcasses.reduce((a, k) => a + k.height, 0),
  );

/** A glyph for what fronts a bay, so the strip reads as an elevation. */
function markOf(
  spec: { doors: string; drawerFrontHeights: number[]; shelves: string } | undefined,
): string {
  if (!spec) return '';
  if (spec.drawerFrontHeights.length > 0) return '▤';
  if (spec.doors === 'double') return '◫';
  if (spec.doors === 'left' || spec.doors === 'right') return '◧';
  if (spec.shelves !== 'none') return '☰';
  return '';
}

function describeBay(
  spec:
    | { doors: string; drawerFrontHeights: number[]; shelves: string; shelfCount: number }
    | undefined,
): string {
  if (!spec) return 'open';
  if (spec.drawerFrontHeights.length > 0) {
    return `${spec.drawerFrontHeights.length} drawer${spec.drawerFrontHeights.length === 1 ? '' : 's'}`;
  }
  const front =
    spec.doors === 'double'
      ? 'a pair of doors'
      : spec.doors === 'none'
        ? 'open'
        : `a door hinged ${spec.doors}`;
  const inside =
    spec.shelves === 'adjustable'
      ? ', adjustable shelves'
      : spec.shelves === 'fixed'
        ? `, ${spec.shelfCount} fixed shelf${spec.shelfCount === 1 ? '' : 'ves'}`
        : '';
  return front + inside;
}
