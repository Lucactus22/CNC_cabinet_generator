import { useState } from 'react';
import type { ProjectParams } from '@cabgen/core';
import { useStore } from '../store';
import {
  ActionField,
  CheckField,
  Group,
  Hint,
  NumberField,
  SelectField,
  TextField,
} from './Controls';
import { ChoiceGallery } from '../gallery/Gallery';
import { NEST_STRATEGY } from '../gallery/choices';
import { HardwarePanel } from './HardwarePanel';
import { isWorkshopTopic } from '../diagnosticTopics';

/**
 * The workshop: one spindle, one machine, one stack of sheets, one drawer of
 * hinges.
 *
 * None of it changes between two designs cut in the same shop, and R-16
 * measured it at almost exactly half the old sidebar — 3403 px of 6813 — sat
 * in among the cabinet. Behind a door it stays reachable and stops being in
 * the way, and saving it under a name means a second design starts already
 * knowing the machine.
 */
export function WorkshopDrawer() {
  const setOpen = useStore((s) => s.setWorkshopOpen);
  const errors = useStore(
    // Scoped to what actually lives behind this door: an error about the
    // room or the design would sit here with nothing to fix it, which is
    // its own kind of silent-wrong-badge.
    (s) =>
      s.project.diagnostics.filter((d) => d.severity === 'error' && isWorkshopTopic(d.topic))
        .length,
  );

  return (
    <aside className="workshop" role="dialog" aria-label="Workshop settings">
      <header>
        <b>Workshop</b>
        {errors > 0 && <span className="badge warn">{errors} blocking</span>}
        <button
          className="crumb dismiss"
          aria-label="Close the workshop"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </header>
      <div className="workshop-body">
        <Profiles />
        <Machine />
        <Tooling />
        <Materials />
        <SolidStock />
        <Tape />
        <Nesting />
        <HardwarePanel />
      </div>
    </aside>
  );
}

/**
 * Workshops saved under a name.
 *
 * Applying one is an ordinary parameter update: loud, listed, and undoable. It
 * is never a pointer a project follows — the measured thickness of the sheet a
 * design was cut to sets every groove in it, so a project that silently re-cut
 * itself to whoever opened it would be the worst failure this codebase has.
 */
function Profiles() {
  const profiles = useStore((s) => s.profiles);
  const saveWorkshop = useStore((s) => s.saveWorkshop);
  const applyProfile = useStore((s) => s.applyProfile);
  const deleteProfile = useStore((s) => s.deleteProfile);
  const notes = useStore((s) => s.workshopNotes);
  const dismiss = useStore((s) => s.dismissWorkshopNotes);
  const [name, setName] = useState('');

  return (
    <Group title="This workshop" open count={profiles.length || undefined}>
      <div className="menu-save">
        <input
          aria-label="Name this workshop"
          placeholder="Name this workshop…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              saveWorkshop(name);
              setName('');
            }
          }}
        />
        <button
          disabled={!name.trim()}
          onClick={() => {
            saveWorkshop(name);
            setName('');
          }}
        >
          Save
        </button>
      </div>
      {profiles.length === 0 ? (
        <Hint>
          Save the machine, the tooling, the sheets and the hardware under a name, and the next
          design starts knowing them. Kept in this browser, so it does not follow you to another
          device.
        </Hint>
      ) : (
        <ul className="menu-list">
          {profiles.map((p) => (
            <li key={p.id}>
              <button
                className="menu-item"
                title={`Saved ${new Date(p.savedAt).toLocaleString()}. Applying it changes this project's settings; undo puts them back.`}
                onClick={() => applyProfile(p.id)}
              >
                Apply “{p.name}”
              </button>
              <button
                className="menu-delete"
                title={`Forget "${p.name}"`}
                onClick={() => {
                  if (confirm(`Forget the "${p.name}" workshop?`)) deleteProfile(p.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <div className="applied">
          {notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
          <button onClick={dismiss}>Got it</button>
        </div>
      )}
    </Group>
  );
}

function Machine() {
  const machine = useStore((s) => s.params.machine);
  const update = useStore((s) => s.update);
  const set = (fn: (m: ProjectParams['machine']) => void) =>
    update((p) => {
      fn(p.machine);
    });

  return (
    <Group title="Machine" open>
      <NumberField
        label="X travel"
        value={machine.travelX}
        min={100}
        param="machine.travelX"
        onChange={(v) => set((m) => void (m.travelX = v))}
      />
      <NumberField
        label="Y travel"
        value={machine.travelY}
        min={100}
        param="machine.travelY"
        onChange={(v) => set((m) => void (m.travelY = v))}
      />
      <NumberField
        label="Z travel"
        value={machine.travelZ}
        min={10}
        param="machine.travelZ"
        onChange={(v) => set((m) => void (m.travelZ = v))}
      />
      <SelectField
        label="Feed-through axis"
        value={machine.tilingAxis}
        param="machine.tilingAxis"
        options={[
          { value: 'x', label: 'X' },
          { value: 'y', label: 'Y' },
          { value: 'none', label: 'No tiling' },
        ]}
        onChange={(v) => set((m) => void (m.tilingAxis = v))}
        title="The axis the stock slides along between tiles. The other one never moves, so a sheet has to fit it."
      />
      <NumberField
        label="Tile overlap"
        value={machine.tileOverlap}
        min={0}
        param="machine.tileOverlap"
        onChange={(v) => set((m) => void (m.tileOverlap = v))}
        title="Headroom kept at each end of travel. Nothing is machined twice."
      />
      <NumberField
        label="Registration hole"
        value={machine.registrationHoleDiameter}
        step={0.5}
        min={1}
        param="machine.registrationHoleDiameter"
        onChange={(v) => set((m) => void (m.registrationHoleDiameter = v))}
        title="The dowel hole that lines the sheet back up after it is fed through."
      />
    </Group>
  );
}

function Tooling() {
  const tool = useStore((s) => s.params.tool);
  const update = useStore((s) => s.update);
  return (
    <Group title="Tooling">
      <NumberField
        label="Cutter diameter"
        value={tool.diameter}
        step={0.5}
        min={0.5}
        param="tool.diameter"
        onChange={(v) =>
          update((p) => {
            p.tool.diameter = v;
          })
        }
        title="Sets relief sizes and the spacing between nested parts."
      />
      <NumberField
        label="Drill diameter"
        value={tool.drillDiameter}
        step={0.5}
        min={0.5}
        param="tool.drillDiameter"
        onChange={(v) =>
          update((p) => {
            p.tool.drillDiameter = v;
          })
        }
        title="The separate bit for shelf-pin rows: 5 mm under the 32 mm system."
      />
    </Group>
  );
}

/** Which sheet goods the shop stocks, and which part of a cabinet each is for. */
function Materials() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const usedBy = sheetUsers(params);

  return (
    <Group title="Sheet materials" open count={params.materials.length}>
      {params.materials.map((m, i) => (
        <div key={m.id} className="stack-block">
          <TextField
            label="Name"
            value={m.name}
            param="materials[].name"
            onChange={(v) =>
              update((p) => {
                p.materials[i]!.name = v;
              })
            }
          />
          <NumberField
            label="Measured thickness"
            value={m.actualThickness}
            step={0.1}
            min={1}
            param="materials[].actualThickness"
            onChange={(v) =>
              update((p) => {
                p.materials[i]!.actualThickness = v;
              })
            }
            title="Measure it. Every groove width comes from this, not the nominal size."
          />
          <NumberField
            label="Nominal thickness"
            value={m.nominalThickness}
            step={0.5}
            min={1}
            param="materials[].nominalThickness"
            onChange={(v) =>
              update((p) => {
                p.materials[i]!.nominalThickness = v;
              })
            }
            title="What it says on the label. Nothing is cut to it — it is here so the cut list names the sheet the way the merchant does."
          />
          <CheckField
            label="Directional grain"
            value={m.hasGrain}
            param="materials[].hasGrain"
            onChange={(v) =>
              update((p) => {
                p.materials[i]!.hasGrain = v;
              })
            }
            title="Stops the nester turning visible parts against the face grain."
          />
          <Hint>Sizes it comes in — the standard sheet, and any remnants on hand.</Hint>
          {m.sheets.map((size, k) => (
            <div key={k} className="sheet-size">
              <NumberField
                label="Length"
                value={size.length}
                min={100}
                param="materials[].sheets[].length"
                onChange={(v) =>
                  update((p) => {
                    p.materials[i]!.sheets[k]!.length = v;
                  })
                }
              />
              <NumberField
                label="Width"
                value={size.width}
                min={100}
                param="materials[].sheets[].width"
                onChange={(v) =>
                  update((p) => {
                    p.materials[i]!.sheets[k]!.width = v;
                  })
                }
                title="The cross-feed dimension: the machine's travel on the axis that never moves has to clear this."
              />
              <CheckField
                label="Remnant, limited quantity"
                value={size.quantity !== undefined}
                param="materials[].sheets[].quantity"
                onChange={(v) =>
                  update((p) => {
                    p.materials[i]!.sheets[k]!.quantity = v ? 1 : undefined;
                  })
                }
                title="Off: a standard size, ordered as needed. On: only as many as you actually have, nested into first."
              />
              {size.quantity !== undefined && (
                <NumberField
                  label="On hand"
                  value={size.quantity}
                  min={1}
                  step={1}
                  suffix=""
                  onChange={(v) =>
                    update((p) => {
                      p.materials[i]!.sheets[k]!.quantity = Math.max(1, Math.round(v));
                    })
                  }
                />
              )}
              <button
                disabled={m.sheets.length <= 1}
                title={
                  m.sheets.length <= 1 ? 'A material needs at least one size' : 'Remove this size'
                }
                onClick={() =>
                  update((p) => {
                    p.materials[i]!.sheets.splice(k, 1);
                  })
                }
              >
                Remove this size
              </button>
            </div>
          ))}
          <ActionField param="materials[].id">
            <button
              onClick={() =>
                update((p) => {
                  const sheets = p.materials[i]!.sheets;
                  const last = sheets[sheets.length - 1];
                  sheets.push({ length: last?.length ?? 2440, width: last?.width ?? 1220 });
                })
              }
            >
              Add a size
            </button>
            <button
              disabled={params.materials.length <= 1 || usedBy.has(m.id)}
              title={
                params.materials.length <= 1
                  ? 'A project needs at least one sheet material'
                  : usedBy.has(m.id)
                    ? `Still cut from: ${[...(usedBy.get(m.id) ?? [])].join(', ')}`
                    : 'Remove this material from the project'
              }
              onClick={() =>
                update((p) => {
                  p.materials.splice(i, 1);
                })
              }
            >
              Remove material
            </button>
          </ActionField>
        </div>
      ))}
      <ActionField>
        <button
          onClick={() =>
            update((p) => {
              const n = p.materials.length + 1;
              p.materials.push({
                id: `sheet${n}-${Date.now().toString(36)}`,
                name: `Sheet material ${n}`,
                nominalThickness: 18,
                actualThickness: 18,
                sheets: [{ length: 2440, width: 1220 }],
                hasGrain: false,
              });
            })
          }
        >
          Add a sheet material
        </button>
      </ActionField>

      <div className="roles">
        <strong>What is cut from what</strong>
        <SelectField
          label="Carcasses"
          value={params.carcassMaterialId}
          param="carcassMaterialId"
          options={params.materials.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(v) =>
            update((p) => {
              p.carcassMaterialId = v;
            })
          }
        />
        <SelectField
          label="Shelves"
          value={params.shelfMaterialId}
          param="shelfMaterialId"
          options={params.materials.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(v) =>
            update((p) => {
              p.shelfMaterialId = v;
            })
          }
        />
        <SelectField
          label="Drawer boxes"
          value={params.drawerBoxMaterialId}
          param="drawerBoxMaterialId"
          options={params.materials.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(v) =>
            update((p) => {
              p.drawerBoxMaterialId = v;
            })
          }
          title="Undermount slides publish a minimum side thickness — a box under it will not hold the runner."
        />
        <Hint>
          Doors and drawer fronts are set on a bay; a carcass's back is set on the carcass, because
          a stack can mix them.
        </Hint>
      </div>
    </Group>
  );
}

/** Every material id something in the project is still cut from, and what. */
function sheetUsers(params: ProjectParams): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const note = (id: string, what: string): void => {
    const set = out.get(id) ?? new Set<string>();
    set.add(what);
    out.set(id, set);
  };
  note(params.carcassMaterialId, 'the carcasses');
  note(params.shelfMaterialId, 'the shelves');
  note(params.drawerBoxMaterialId, 'the drawer boxes');
  note(params.doors.materialId, 'the doors');
  // Counted whether or not the option is currently switched on: a project
  // keeps its back's material through `back.style: 'none'` and its frame
  // stock through `frameless`, so deleting a material nothing is cut from
  // *today* leaves a dangling id that only bites when the option goes back on.
  note(params.opening.scribe.materialId, 'the scribe strips');
  for (const cabinet of params.cabinets) {
    for (const carcass of cabinet.carcasses) {
      note(carcass.back.materialId, `${cabinet.id}-${carcass.id}'s back`);
    }
  }
  return out;
}

function SolidStock() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  // Every carcass, not only the face-framed ones: a frameless carcass still
  // holds the board its frame would be milled from, and switching it back on
  // after that board was deleted is the same dangling reference.
  const framed = new Set(
    params.cabinets.flatMap((c) => c.carcasses.map((k) => k.faceFrame.materialId)),
  );

  return (
    <Group title="Solid stock" count={params.stockMaterials.length}>
      <Hint>For face frames: a board with a length to cut it to, not a sheet to nest across.</Hint>
      {params.stockMaterials.map((m, i) => (
        <div key={m.id} className="stack-block">
          <TextField
            label="Name"
            value={m.name}
            param="stockMaterials[].name"
            onChange={(v) =>
              update((p) => {
                p.stockMaterials[i]!.name = v;
              })
            }
          />
          <NumberField
            label="Measured thickness"
            value={m.actualThickness}
            step={0.1}
            min={1}
            param="stockMaterials[].actualThickness"
            onChange={(v) =>
              update((p) => {
                p.stockMaterials[i]!.actualThickness = v;
              })
            }
            title="Measure it. The half lap at every stile and rail crossing is cut to half of this."
          />
          <NumberField
            label="Nominal thickness"
            value={m.nominalThickness}
            step={0.5}
            min={1}
            param="stockMaterials[].nominalThickness"
            onChange={(v) =>
              update((p) => {
                p.stockMaterials[i]!.nominalThickness = v;
              })
            }
            title="What the merchant calls it — 3/4 in, 19 mm. Nothing is cut to it."
          />
          <NumberField
            label="Board length"
            value={m.boardLength}
            min={100}
            param="stockMaterials[].boardLength"
            onChange={(v) =>
              update((p) => {
                p.stockMaterials[i]!.boardLength = v;
              })
            }
          />
          <NumberField
            label="Board width"
            value={m.boardWidth}
            min={20}
            param="stockMaterials[].boardWidth"
            onChange={(v) =>
              update((p) => {
                p.stockMaterials[i]!.boardWidth = v;
              })
            }
            title="Before ripping it down to a stile or rail width."
          />
          <ActionField param="stockMaterials[].id">
            <button
              disabled={framed.has(m.id)}
              title={
                framed.has(m.id)
                  ? 'A face frame in this project is milled from it'
                  : 'Remove this board'
              }
              onClick={() =>
                update((p) => {
                  p.stockMaterials.splice(i, 1);
                })
              }
            >
              Remove board
            </button>
          </ActionField>
        </div>
      ))}
      <ActionField>
        <button
          onClick={() =>
            update((p) => {
              const n = p.stockMaterials.length + 1;
              p.stockMaterials.push({
                id: `stock${n}-${Date.now().toString(36)}`,
                name: `Solid stock ${n}`,
                nominalThickness: 19,
                actualThickness: 19,
                boardLength: 2440,
                boardWidth: 140,
              });
            })
          }
        >
          Add a board
        </button>
      </ActionField>
    </Group>
  );
}

function Tape() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const inUse = new Set(
    Object.values(params.edgeBanding).flatMap((s) => (s ? [s.materialId] : [])),
  );

  return (
    <Group title="Edge tape" count={params.bandingMaterials.length}>
      <Hint>
        Which edges get taped is a design choice, on the panel. This is the roll: its measured
        thickness is what every banded blank is cut short by.
      </Hint>
      {params.bandingMaterials.map((m, i) => (
        <div key={m.id} className="stack-block">
          <TextField
            label="Name"
            value={m.name}
            param="bandingMaterials[].name"
            onChange={(v) =>
              update((p) => {
                p.bandingMaterials[i]!.name = v;
              })
            }
          />
          <NumberField
            label="Tape thickness"
            value={m.thickness}
            step={0.1}
            min={0.1}
            param="bandingMaterials[].thickness"
            onChange={(v) =>
              update((p) => {
                p.bandingMaterials[i]!.thickness = v;
              })
            }
            title="Measure the roll. Every edge banded in it is cut this much short."
          />
          <ActionField param="bandingMaterials[].id">
            <button
              disabled={inUse.has(m.id)}
              title={
                inUse.has(m.id) ? 'Edges in this project are banded with it' : 'Remove this tape'
              }
              onClick={() =>
                update((p) => {
                  p.bandingMaterials.splice(i, 1);
                })
              }
            >
              Remove tape
            </button>
          </ActionField>
        </div>
      ))}
      <ActionField>
        <button
          onClick={() =>
            update((p) => {
              const n = p.bandingMaterials.length + 1;
              p.bandingMaterials.push({
                id: `tape${n}-${Date.now().toString(36)}`,
                name: `Edge tape ${n}`,
                thickness: 0.4,
              });
            })
          }
        >
          Add a roll of tape
        </button>
      </ActionField>
    </Group>
  );
}

function Nesting() {
  const nesting = useStore((s) => s.params.nesting);
  const update = useStore((s) => s.update);
  const set = (fn: (n: ProjectParams['nesting']) => void) =>
    update((p) => {
      fn(p.nesting);
    });

  return (
    <Group title="Nesting">
      {/* The one gallery with no pictures. What a strategy produces is a
          packing of *your* parts on *your* sheets, so a rendered sample would
          be a picture of some other project — see NEST_STRATEGY. */}
      <ChoiceGallery
        gallery={NEST_STRATEGY}
        value={nesting.strategy}
        param="nesting.strategy"
        set={(p, v) => {
          p.nesting.strategy = v;
        }}
      />
      <NumberField
        label="Sheet margin"
        value={nesting.sheetMargin}
        min={0}
        param="nesting.sheetMargin"
        onChange={(v) => set((n) => void (n.sheetMargin = v))}
        title="Unusable border around the sheet, e.g. where the clamps live."
      />
      <NumberField
        label="Gap between parts"
        value={nesting.partGap}
        min={0}
        param="nesting.partGap"
        onChange={(v) => set((n) => void (n.partGap = v))}
        title="On top of the cutter diameter, which is always allowed for."
      />
      <CheckField
        label="Allow rotation"
        value={nesting.allowRotation}
        param="nesting.allowRotation"
        onChange={(v) => set((n) => void (n.allowRotation = v))}
      />
      <NumberField
        label="Remnant threshold"
        value={nesting.remnantThreshold}
        min={0}
        param="nesting.remnantThreshold"
        onChange={(v) => set((n) => void (n.remnantThreshold = v))}
        title="The shorter side a sheet's leftover space needs to clear before it is reported as a usable remnant rather than scrap."
      />
    </Group>
  );
}
