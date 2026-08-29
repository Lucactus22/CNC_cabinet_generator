import { useStore } from '../store';
import {
  copyEntry,
  describeRequirement,
  entriesFor,
  KIND_LABELS,
  measuresFor,
  resolveHardware,
  type HandleEntry,
  type HardwareEntry,
  type HardwareKind,
  type HardwareMeasure,
  type HingeEntry,
  type Requirement,
  type ShelfPinEntry,
} from '@cabgen/core';
import { Group, Hint, NumberField, SelectField, TextField } from './Controls';

const MEASURE_LABELS: Record<HardwareMeasure, string> = {
  'door thickness': 'Door thickness',
  'door width': 'Door width',
  'door height': 'Door height',
  'carcass panel thickness': 'Carcass panel thickness',
};

/**
 * Only the measures this kind of hardware is actually bored into.
 *
 * Offering all four would let someone write a rule about door thickness on a
 * shelf pin, which can never fire — and a rule that never fires reads on screen
 * as a guard that is in place.
 */
const measureOptions = (kind: HardwareKind): Array<{ value: HardwareMeasure; label: string }> =>
  measuresFor(kind).map((m) => ({ value: m, label: MEASURE_LABELS[m] }));

/**
 * Picking hardware, and describing hardware the catalogue does not have.
 *
 * A built-in entry is read-only on purpose: it is what its maker publishes, and
 * quietly editing it would leave a project claiming to be cut to a hinge it is
 * not. "Copy and edit" makes the change yours, named, and saved with the file.
 */
export function HardwarePanel() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const hw = params.hardware;
  const bored = resolveHardware(hw);

  const pick = (kind: HardwareKind, id: string): void =>
    update((p) => {
      if (kind === 'hinge') p.hardware.hingeId = id;
      else if (kind === 'shelf-pin') p.hardware.shelfPinId = id;
      else p.hardware.handleId = id;
    });

  const copy = (entry: HardwareEntry): void =>
    update((p) => {
      const made = copyEntry(entry, p.hardware.custom);
      p.hardware.custom.push(made);
      if (made.kind === 'hinge') p.hardware.hingeId = made.id;
      else if (made.kind === 'shelf-pin') p.hardware.shelfPinId = made.id;
      else p.hardware.handleId = made.id;
    });

  const remove = (entry: HardwareEntry, fallbackId: string): void =>
    update((p) => {
      p.hardware.custom = p.hardware.custom.filter((e) => e.id !== entry.id);
      if (entry.kind === 'hinge') p.hardware.hingeId = fallbackId;
      else if (entry.kind === 'shelf-pin') p.hardware.shelfPinId = fallbackId;
      else p.hardware.handleId = '';
    });

  /** Edit the selected custom entry in place, by id rather than by reference. */
  const edit = <E extends HardwareEntry>(id: string, fn: (e: E) => void): void =>
    update((p) => {
      const target = p.hardware.custom.find((e) => e.id === id);
      if (target) fn(target as E);
    });

  const options = (kind: HardwareKind): Array<{ value: string; label: string }> =>
    entriesFor(hw, kind).map((e) => ({
      value: e.id,
      label: e.custom ? `${e.name} — yours` : e.name,
    }));

  const hinge = bored.hinge;
  const pin = bored.shelfPin;
  const handle = bored.handle;

  return (
    <Group title="Hardware">
      <SelectField
        label="Hinges"
        value={hw.hingeId}
        options={options('hinge')}
        wide
        onChange={(v) => pick('hinge', v)}
        title="Every hinge dimension comes from this entry."
      />
      <About entry={hinge} onCopy={() => copy(hinge)} onRemove={() => remove(hinge, 'utrusta')} />
      {hinge.custom && (
        <Group title={`Editing ${hinge.name}`} open>
          <Named
            entry={hinge}
            onName={(v) => edit<HingeEntry>(hinge.id, (e) => void (e.name = v))}
          />
          <NumberField
            label="Cup diameter"
            value={hinge.boring.cupDiameter}
            step={0.5}
            min={10}
            onChange={(v) => edit<HingeEntry>(hinge.id, (e) => void (e.boring.cupDiameter = v))}
          />
          <NumberField
            label="Cup depth"
            value={hinge.boring.cupDepth}
            step={0.5}
            min={1}
            onChange={(v) => edit<HingeEntry>(hinge.id, (e) => void (e.boring.cupDepth = v))}
          />
          <NumberField
            label="Boring distance"
            value={hinge.boring.boringDistance}
            step={0.5}
            min={0}
            onChange={(v) => edit<HingeEntry>(hinge.id, (e) => void (e.boring.boringDistance = v))}
            title="Door edge to the near edge of the cup. The cup centre lands one radius further in."
          />
          <NumberField
            label="Allowed from"
            value={hinge.boringDistanceRange.min}
            step={0.5}
            min={0}
            onChange={(v) =>
              edit<HingeEntry>(hinge.id, (e) => void (e.boringDistanceRange.min = v))
            }
            title="The range the maker publishes for the boring distance."
          />
          <NumberField
            label="Allowed to"
            value={hinge.boringDistanceRange.max}
            step={0.5}
            min={0}
            onChange={(v) =>
              edit<HingeEntry>(hinge.id, (e) => void (e.boringDistanceRange.max = v))
            }
          />
          <NumberField
            label="Dowel diameter"
            value={hinge.boring.dowelDiameter}
            step={0.5}
            min={1}
            onChange={(v) => edit<HingeEntry>(hinge.id, (e) => void (e.boring.dowelDiameter = v))}
          />
          <NumberField
            label="Dowel spacing"
            value={hinge.boring.dowelSpacing}
            min={10}
            onChange={(v) => edit<HingeEntry>(hinge.id, (e) => void (e.boring.dowelSpacing = v))}
            title="45 mm on most hinges; 48 and 52 mm patterns also exist."
          />
          <NumberField
            label="Dowel offset"
            value={hinge.boring.dowelOffset}
            step={0.5}
            min={0}
            onChange={(v) => edit<HingeEntry>(hinge.id, (e) => void (e.boring.dowelOffset = v))}
            title="How far the dowels sit behind the cup's centre line."
          />
          <NumberField
            label="Dowel depth"
            value={hinge.boring.dowelDepth}
            min={1}
            onChange={(v) => edit<HingeEntry>(hinge.id, (e) => void (e.boring.dowelDepth = v))}
          />
          <NumberField
            label="Cup from door end"
            value={hinge.boring.endOffset}
            step={0.1}
            min={20}
            onChange={(v) => edit<HingeEntry>(hinge.id, (e) => void (e.boring.endOffset = v))}
          />
          <NumberField
            label="Plate hole diameter"
            value={hinge.boring.plateHoleDiameter}
            step={0.5}
            min={1}
            onChange={(v) =>
              edit<HingeEntry>(hinge.id, (e) => void (e.boring.plateHoleDiameter = v))
            }
          />
          <NumberField
            label="Plate hole depth"
            value={hinge.boring.plateHoleDepth}
            min={1}
            onChange={(v) => edit<HingeEntry>(hinge.id, (e) => void (e.boring.plateHoleDepth = v))}
          />
          <NumberField
            label="Plate hole spacing"
            value={hinge.boring.plateHoleSpacing}
            min={4}
            onChange={(v) =>
              edit<HingeEntry>(hinge.id, (e) => void (e.boring.plateHoleSpacing = v))
            }
          />
          <NumberField
            label="Plate from front"
            value={hinge.boring.plateFrontOffset}
            min={5}
            onChange={(v) =>
              edit<HingeEntry>(hinge.id, (e) => void (e.boring.plateFrontOffset = v))
            }
          />
          <Rules entry={hinge} onEdit={(fn) => edit<HingeEntry>(hinge.id, fn)} />
        </Group>
      )}

      <SelectField
        label="Shelf pins"
        value={hw.shelfPinId}
        options={options('shelf-pin')}
        wide
        onChange={(v) => pick('shelf-pin', v)}
      />
      <About entry={pin} onCopy={() => copy(pin)} onRemove={() => remove(pin, 'pin-5mm')} />
      {pin.custom && (
        <Group title={`Editing ${pin.name}`} open>
          <Named
            entry={pin}
            onName={(v) => edit<ShelfPinEntry>(pin.id, (e) => void (e.name = v))}
          />
          <NumberField
            label="Hole diameter"
            value={pin.boring.diameter}
            step={0.05}
            min={1}
            onChange={(v) => edit<ShelfPinEntry>(pin.id, (e) => void (e.boring.diameter = v))}
          />
          <NumberField
            label="Hole depth"
            value={pin.boring.depth}
            step={0.1}
            min={1}
            onChange={(v) => edit<ShelfPinEntry>(pin.id, (e) => void (e.boring.depth = v))}
          />
          <NumberField
            label="Pitch"
            value={pin.boring.pitch}
            min={4}
            onChange={(v) => edit<ShelfPinEntry>(pin.id, (e) => void (e.boring.pitch = v))}
            title="32 mm under the European system, and on the imperial jigs too."
          />
          <Rules entry={pin} onEdit={(fn) => edit<ShelfPinEntry>(pin.id, fn)} />
        </Group>
      )}

      <SelectField
        label="Handles"
        value={hw.handleId}
        options={[{ value: '', label: 'None — no holes bored' }, ...options('handle')]}
        wide
        onChange={(v) => pick('handle', v)}
        title="Fixing holes go right through the door, so nothing is bored until one is chosen."
      />
      {!handle && <Hint>No handle chosen, so no holes are drilled through any door face.</Hint>}
      {handle && (
        <>
          <About entry={handle} onCopy={() => copy(handle)} onRemove={() => remove(handle, '')} />
          <SelectField
            label="Runs"
            value={hw.handlePlacement.orientation}
            options={[
              { value: 'vertical', label: 'Up the door' },
              { value: 'horizontal', label: 'Across the door' },
            ]}
            onChange={(v) =>
              update((p) => {
                p.hardware.handlePlacement.orientation = v;
              })
            }
          />
          <SelectField
            label="Sits at the"
            value={hw.handlePlacement.from}
            options={[
              { value: 'top', label: 'Top of the door' },
              { value: 'bottom', label: 'Bottom of the door' },
              { value: 'centre', label: 'Middle of the door' },
            ]}
            onChange={(v) =>
              update((p) => {
                p.hardware.handlePlacement.from = v;
              })
            }
          />
          {hw.handlePlacement.from !== 'centre' && (
            <NumberField
              label="From that end"
              value={hw.handlePlacement.endOffset}
              min={0}
              onChange={(v) =>
                update((p) => {
                  p.hardware.handlePlacement.endOffset = v;
                })
              }
              title="That end of the door to the nearest fixing screw."
            />
          )}
          {hw.handlePlacement.orientation === 'vertical' && (
            <NumberField
              label="From the edge"
              value={hw.handlePlacement.edgeOffset}
              min={0}
              onChange={(v) =>
                update((p) => {
                  p.hardware.handlePlacement.edgeOffset = v;
                })
              }
              title="The opening edge — the one away from the hinges — to the screw line."
            />
          )}
          {handle.custom && (
            <Group title={`Editing ${handle.name}`} open>
              <Named
                entry={handle}
                onName={(v) => edit<HandleEntry>(handle.id, (e) => void (e.name = v))}
              />
              <SelectField
                label="Style"
                wide
                value={handle.boring.style}
                options={[
                  { value: 'bar', label: 'Bar — two screws' },
                  { value: 'knob', label: 'Knob — one screw' },
                ]}
                onChange={(v) =>
                  edit<HandleEntry>(handle.id, (e) => {
                    e.boring.style = v;
                    // A knob has no centres; a bar with none drills one hole
                    // where its two screws go, so it does not keep the zero.
                    if (v === 'knob') e.boring.centres = 0;
                    else if (e.boring.centres <= 0) e.boring.centres = 128;
                  })
                }
              />
              {handle.boring.style === 'bar' && (
                <NumberField
                  label="Fixing centres"
                  value={handle.boring.centres}
                  min={1}
                  onChange={(v) => edit<HandleEntry>(handle.id, (e) => void (e.boring.centres = v))}
                />
              )}
              <NumberField
                label="Screw clearance"
                value={handle.boring.screwDiameter}
                step={0.5}
                min={1}
                onChange={(v) =>
                  edit<HandleEntry>(handle.id, (e) => void (e.boring.screwDiameter = v))
                }
                title="4.5 mm passes the M4 screws cabinet handles are supplied with."
              />
              <NumberField
                label="Overall size"
                value={handle.boring.length}
                min={1}
                onChange={(v) => edit<HandleEntry>(handle.id, (e) => void (e.boring.length = v))}
                title="A bar's whole length, or a knob's base diameter: what has to fit on the door."
              />
              <Rules entry={handle} onEdit={(fn) => edit<HandleEntry>(handle.id, fn)} />
            </Group>
          )}
        </>
      )}
    </Group>
  );
}

/** Where an entry's numbers came from, what it needs, and how to make it yours. */
function About({
  entry,
  onCopy,
  onRemove,
}: {
  entry: HardwareEntry;
  onCopy: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      <Hint>{entry.source}</Hint>
      {entry.requires.map((r, i) => (
        <Hint key={i}>{describeRequirement(r)}</Hint>
      ))}
      <div className="row">
        <button onClick={onCopy}>Copy and edit…</button>
        {entry.custom && <button onClick={onRemove}>Remove</button>}
      </div>
    </>
  );
}

function Named({ entry, onName }: { entry: HardwareEntry; onName: (v: string) => void }) {
  return (
    <TextField label={`${KIND_LABELS[entry.kind]} name`} value={entry.name} onChange={onName} />
  );
}

/**
 * The fitting rules, as editable data.
 *
 * A rule is what stops the diagnostics guessing: without one, a hinge for
 * 16 mm doors and a hinge for 26 mm ones look identical to the checker.
 */
function Rules<E extends HardwareEntry>({
  entry,
  onEdit,
}: {
  entry: E;
  onEdit: (fn: (e: E) => void) => void;
}) {
  const set = (i: number, fn: (r: Requirement) => void): void =>
    onEdit((e) => {
      const r = e.requires[i];
      if (r) fn(r);
    });

  return (
    <>
      <Hint>
        What this needs of the panels it goes into. Leave a limit blank by setting it to 0.
      </Hint>
      {entry.requires.map((r, i) => (
        <div key={i}>
          <SelectField
            label="Rule"
            value={r.measure}
            options={measureOptions(entry.kind)}
            wide
            onChange={(v) => set(i, (x) => void (x.measure = v))}
          />
          <NumberField
            label="At least"
            value={r.min ?? 0}
            step={0.5}
            min={0}
            onChange={(v) => set(i, (x) => void (x.min = v > 0 ? v : undefined))}
          />
          <NumberField
            label="At most"
            value={r.max ?? 0}
            step={0.5}
            min={0}
            onChange={(v) => set(i, (x) => void (x.max = v > 0 ? v : undefined))}
          />
          <TextField
            label="Because"
            value={r.why}
            onChange={(v) => set(i, (x) => void (x.why = v))}
          />
          <div className="row">
            <button
              onClick={() =>
                onEdit((e) => {
                  e.requires = e.requires.filter((_, k) => k !== i);
                })
              }
            >
              Remove rule
            </button>
          </div>
        </div>
      ))}
      <div className="row">
        <button
          onClick={() =>
            onEdit((e) => {
              e.requires = [
                ...e.requires,
                {
                  measure: measuresFor(e.kind)[0]!,
                  min: 16,
                  why: 'it is what this hardware is made for',
                },
              ];
            })
          }
        >
          Add a rule
        </button>
      </div>
    </>
  );
}
