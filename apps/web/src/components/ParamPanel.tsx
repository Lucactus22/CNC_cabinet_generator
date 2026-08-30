import { useState } from 'react';
import { useStore } from '../store';
import {
  CABINET_TYPES,
  cabinetPositions,
  describeFit,
  duplicateCabinet,
  fitOpening,
  newCabinetOfType,
  newCarcass,
  resolveWidths,
  runSize,
  type BaySpec,
  type Cabinet,
  type CabinetType,
  type Carcass,
  type DoorStyle,
  type OpeningSpec,
  type ShelfMode,
} from '@cabgen/core';
import { CheckField, Group, Hint, NumberField, SelectField, TextField } from './Controls';
import { HardwarePanel } from './HardwarePanel';
import { MeasureWizard } from './MeasureWizard';
import { EffectsPanel } from './EffectsPanel';
import { BandingPanel } from './BandingPanel';

const SHELF_MODES: Array<{ value: ShelfMode; label: string }> = [
  { value: 'none', label: 'Open, no shelves' },
  { value: 'fixed', label: 'Fixed, in dados' },
  { value: 'adjustable', label: 'Adjustable, on pins' },
];

export function ParamPanel() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const project = useStore((s) => s.project);
  const hasDoors = project.parts.some((p) => p.role === 'door');

  return (
    <aside className="sidebar">
      <Group title="Project" open>
        <TextField
          label="Name"
          value={params.name}
          onChange={(v) =>
            update((p) => {
              p.name = v;
            })
          }
        />
        <CheckField
          label="Engrave part labels"
          value={params.labelParts}
          onChange={(v) =>
            update((p) => {
              p.labelParts = v;
            })
          }
          title="Writes each part's ID onto the LABEL layer for reference."
        />
      </Group>

      <CabinetList />
      <CarcassGroups />
      <OpeningGroup />

      <Group title="Material">
        {params.materials.map((m, i) => (
          <div key={m.id} style={{ display: 'grid', gap: 8, paddingBottom: 12 }}>
            <strong style={{ fontSize: 12, color: 'var(--muted)' }}>{m.name}</strong>
            <NumberField
              label="Measured thickness"
              value={m.actualThickness}
              step={0.1}
              min={1}
              onChange={(v) =>
                update((p) => {
                  p.materials[i]!.actualThickness = v;
                })
              }
              title="Measure it. Every groove width comes from this, not the nominal size."
            />
            <CheckField
              label="Directional grain"
              value={m.hasGrain}
              onChange={(v) =>
                update((p) => {
                  p.materials[i]!.hasGrain = v;
                })
              }
              title="Stops the nester turning visible parts against the face grain."
            />
            <Hint>Sizes this material comes in — the standard sheet, and any remnants on hand.</Hint>
            {m.sheets.map((size, k) => (
              <div
                key={k}
                style={{
                  display: 'grid',
                  gap: 6,
                  padding: '8px 0',
                  borderTop: '1px solid var(--line)',
                }}
              >
                <NumberField
                  label="Length"
                  value={size.length}
                  min={100}
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
                  onChange={(v) =>
                    update((p) => {
                      p.materials[i]!.sheets[k]!.width = v;
                    })
                  }
                />
                <CheckField
                  label="Remnant, limited quantity"
                  value={size.quantity !== undefined}
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
                  onClick={() =>
                    update((p) => {
                      p.materials[i]!.sheets.splice(k, 1);
                    })
                  }
                  disabled={m.sheets.length <= 1}
                  title={
                    m.sheets.length <= 1
                      ? 'A material needs at least one size'
                      : 'Remove this size'
                  }
                >
                  Remove size
                </button>
              </div>
            ))}
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
          </div>
        ))}
        <button
          onClick={() =>
            update((p) => {
              for (const m of p.materials) {
                // A remnant's quantity is what you actually own — resizing it
                // in place would quietly turn "I have one of these" into a
                // different sheet nobody owns. Resize the first standard size
                // instead, or add one if every size on this material happens
                // to be a remnant.
                const standard = m.sheets.find((s) => s.quantity === undefined);
                if (standard) {
                  standard.length = p.machine.travelX;
                  standard.width = p.machine.travelY;
                } else {
                  m.sheets.push({ length: p.machine.travelX, width: p.machine.travelY });
                }
              }
            })
          }
          title="Resizes each material's standard sheet to your bed, so nothing needs tiling. Remnants are left alone."
        >
          Set sheets to machine size
        </button>
      </Group>

      <Group title="Solid stock">
        <Hint>
          For face frames: a board with a length to cut it to, not a sheet to nest across.
        </Hint>
        {params.stockMaterials.map((m, i) => (
          <div key={m.id} style={{ display: 'grid', gap: 8, paddingBottom: 8 }}>
            <strong style={{ fontSize: 12, color: 'var(--muted)' }}>{m.name}</strong>
            <NumberField
              label="Measured thickness"
              value={m.actualThickness}
              step={0.1}
              min={1}
              onChange={(v) =>
                update((p) => {
                  p.stockMaterials[i]!.actualThickness = v;
                })
              }
              title="Measure it. The half lap at every stile and rail crossing is cut to half of this."
            />
            <NumberField
              label="Board length"
              value={m.boardLength}
              min={100}
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
              onChange={(v) =>
                update((p) => {
                  p.stockMaterials[i]!.boardWidth = v;
                })
              }
              title="Before ripping it down to a stile or rail width."
            />
          </div>
        ))}
      </Group>

      <Group title="Joinery">
        <SelectField
          label="Carcass joint"
          value={params.joinery.carcassJoint}
          options={[
            { value: 'dado', label: 'Stopped dado + screws' },
            { value: 'tabslot', label: 'Tab and slot' },
          ]}
          onChange={(v) =>
            update((p) => {
              p.joinery.carcassJoint = v;
            })
          }
        />
        <SelectField
          label="Corner relief"
          value={params.joinery.reliefStyle}
          options={[
            { value: 'dogbone', label: 'Dogbone' },
            { value: 'tbone', label: 'T-bone' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(v) =>
            update((p) => {
              p.joinery.reliefStyle = v;
            })
          }
          title="Without relief, the cutter's radius leaves material where a square corner has to sit."
        />
        <NumberField
          label="Fit clearance"
          value={params.joinery.fitClearance}
          step={0.05}
          min={0}
          onChange={(v) =>
            update((p) => {
              p.joinery.fitClearance = v;
            })
          }
          title="Added to every groove and slot width. Raise it if joints are too tight."
        />
        <NumberField
          label="Dado depth"
          value={params.joinery.dadoDepth}
          step={0.5}
          min={0}
          onChange={(v) =>
            update((p) => {
              p.joinery.dadoDepth = v;
            })
          }
        />
        <NumberField
          label="Dado stop from front"
          value={params.joinery.dadoStopFront}
          min={0}
          onChange={(v) =>
            update((p) => {
              p.joinery.dadoStopFront = v;
            })
          }
          title="Holds the groove back from the front edge so the joint does not show. Zero cuts through."
        />
        {params.joinery.carcassJoint === 'tabslot' && (
          <>
            <NumberField
              label="Tab width"
              value={params.joinery.tabWidth}
              min={5}
              onChange={(v) =>
                update((p) => {
                  p.joinery.tabWidth = v;
                })
              }
            />
            <NumberField
              label="Minimum tabs"
              value={params.joinery.tabMinCount}
              suffix=""
              min={1}
              onChange={(v) =>
                update((p) => {
                  p.joinery.tabMinCount = Math.round(v);
                })
              }
            />
          </>
        )}
        <CheckField
          label="Screw holes"
          value={params.joinery.screwHoles}
          onChange={(v) =>
            update((p) => {
              p.joinery.screwHoles = v;
            })
          }
          title="Drills clearance holes through the outer panel, on the centreline of every groove, so there is nothing to mark out at assembly."
        />
        {params.joinery.screwHoles && (
          <>
            <NumberField
              label="Screw spacing"
              value={params.joinery.screwSpacing}
              min={20}
              onChange={(v) =>
                update((p) => {
                  p.joinery.screwSpacing = v;
                })
              }
            />
            <NumberField
              label="Clearance hole"
              value={params.joinery.screwClearanceDiameter}
              step={0.5}
              min={1}
              onChange={(v) =>
                update((p) => {
                  p.joinery.screwClearanceDiameter = v;
                })
              }
              title="Must pass the screw threads freely. Sized to grip instead, the screw jacks the joint apart rather than pulling it together."
            />
            <Hint>
              Holes go through the outer panel on each groove's centreline, drilled from the same
              face as the groove so nothing needs turning over.
            </Hint>
          </>
        )}
      </Group>

      <Group title="Doors" open={hasDoors}>
        <SelectField
          label="Fit"
          value={params.doors.fit}
          options={[
            { value: 'overlay', label: 'Overlay, in front of the carcass' },
            { value: 'inset', label: 'Inset, flush in the opening' },
          ]}
          onChange={(v) =>
            update((p) => {
              p.doors.fit = v;
            })
          }
        />
        <NumberField
          label={params.doors.fit === 'overlay' ? 'Reveal' : 'Clearance'}
          value={params.doors.fit === 'overlay' ? params.doors.reveal : params.doors.insetGap}
          step={0.5}
          min={0}
          onChange={(v) =>
            update((p) => {
              if (p.doors.fit === 'overlay') p.doors.reveal = v;
              else p.doors.insetGap = v;
            })
          }
          title="Gap between neighbouring doors, and around the outside of the run."
        />
        <Hint>Turn doors on per bay, under each carcass.</Hint>
      </Group>

      <HardwarePanel />

      <EffectsPanel />

      <BandingPanel />

      <Group title="Shelf pin rows">
        <NumberField
          label="Row from front"
          value={params.joinery.shelfPin.frontOffset}
          min={5}
          onChange={(v) =>
            update((p) => {
              p.joinery.shelfPin.frontOffset = v;
            })
          }
        />
        <NumberField
          label="Row from back"
          value={params.joinery.shelfPin.backOffset}
          min={5}
          onChange={(v) =>
            update((p) => {
              p.joinery.shelfPin.backOffset = v;
            })
          }
        />
        <Hint>
          Where the ladders go. Which pin they are bored for — its diameter, depth and pitch — is
          under Hardware.
        </Hint>
      </Group>

      <Group title="Tooling">
        <NumberField
          label="Cutter diameter"
          value={params.tool.diameter}
          step={0.5}
          min={0.5}
          onChange={(v) =>
            update((p) => {
              p.tool.diameter = v;
            })
          }
          title="Sets relief sizes and the spacing between nested parts."
        />
        <NumberField
          label="Drill diameter"
          value={params.tool.drillDiameter}
          step={0.5}
          min={0.5}
          onChange={(v) =>
            update((p) => {
              p.tool.drillDiameter = v;
            })
          }
        />
      </Group>

      <Group title="Machine" open={project.diagnostics.some((d) => d.severity === 'error')}>
        <NumberField
          label="X travel"
          value={params.machine.travelX}
          onChange={(v) =>
            update((p) => {
              p.machine.travelX = v;
            })
          }
          min={100}
        />
        <NumberField
          label="Y travel"
          value={params.machine.travelY}
          onChange={(v) =>
            update((p) => {
              p.machine.travelY = v;
            })
          }
          min={100}
        />
        <NumberField
          label="Z travel"
          value={params.machine.travelZ}
          onChange={(v) =>
            update((p) => {
              p.machine.travelZ = v;
            })
          }
          min={10}
        />
        <SelectField
          label="Feed-through axis"
          value={params.machine.tilingAxis}
          options={[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'none', label: 'No tiling' },
          ]}
          onChange={(v) =>
            update((p) => {
              p.machine.tilingAxis = v;
            })
          }
          title="The axis the stock slides along between tiles."
        />
        <NumberField
          label="Tile overlap"
          value={params.machine.tileOverlap}
          min={0}
          onChange={(v) =>
            update((p) => {
              p.machine.tileOverlap = v;
            })
          }
          title="Headroom kept at each end of travel. Nothing is machined twice."
        />
        <NumberField
          label="Registration hole"
          value={params.machine.registrationHoleDiameter}
          step={0.5}
          min={1}
          onChange={(v) =>
            update((p) => {
              p.machine.registrationHoleDiameter = v;
            })
          }
        />
      </Group>

      <Group title="Nesting">
        <SelectField
          label="Optimise for"
          value={params.nesting.strategy}
          options={[
            { value: 'tiling', label: 'Fewest setups' },
            { value: 'material', label: 'Least material' },
            { value: 'guillotine', label: 'Guillotine (panel saw)' },
          ]}
          onChange={(v) =>
            update((p) => {
              p.nesting.strategy = v;
            })
          }
          title="Fewest setups keeps each part inside one machine tile and fills the earliest tile first. Least material packs as tightly as it can and lets parts fall across seams. Guillotine restricts every layout to straight end-to-end cuts, for a panel saw rather than a router."
        />
        <Hint>
          {params.nesting.strategy === 'tiling'
            ? 'No part is cut across a tile seam unless it is larger than the machine itself.'
            : params.nesting.strategy === 'guillotine'
              ? 'Every part can be freed with straight cuts across the full sheet, at some cost in yield.'
              : 'Tightest packing, but parts will be cut across tile seams.'}
        </Hint>
        <NumberField
          label="Sheet margin"
          value={params.nesting.sheetMargin}
          min={0}
          onChange={(v) =>
            update((p) => {
              p.nesting.sheetMargin = v;
            })
          }
        />
        <NumberField
          label="Gap between parts"
          value={params.nesting.partGap}
          min={0}
          onChange={(v) =>
            update((p) => {
              p.nesting.partGap = v;
            })
          }
          title="On top of the cutter diameter, which is always allowed for."
        />
        <CheckField
          label="Allow rotation"
          value={params.nesting.allowRotation}
          onChange={(v) =>
            update((p) => {
              p.nesting.allowRotation = v;
            })
          }
        />
        <NumberField
          label="Remnant threshold"
          value={params.nesting.remnantThreshold}
          min={0}
          onChange={(v) =>
            update((p) => {
              p.nesting.remnantThreshold = v;
            })
          }
          title="The shorter side a sheet's leftover space needs to clear before it is reported as a usable remnant rather than scrap."
        />
      </Group>
    </aside>
  );
}

/**
 * The room, as measured with a tape.
 *
 * Everything here is something a person reads off a tape rather than decides,
 * which is why it is four measurements and two angles rather than a model of a
 * room. The derivation is shown underneath in full: that is the number someone
 * checks against the wall before they cut a sheet, and it has to be visible
 * without opening the diagnostics.
 */
function OpeningGroup() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const opening = params.opening;
  const run = runSize(params.cabinets);
  const fit = fitOpening(opening, run);
  const [measuring, setMeasuring] = useState(false);

  const patch = (fn: (o: OpeningSpec) => void): void =>
    update((p) => {
      fn(p.opening);
    });

  return (
    <Group title="Opening" open={opening.enabled}>
      {measuring && <MeasureWizard onClose={() => setMeasuring(false)} />}
      <button onClick={() => setMeasuring(true)} title="Six measurements, about ten minutes.">
        Measure the room…
      </button>
      <Hint>
        Walks you through what to hold a tape across, and works the corner angles out from it.
      </Hint>
      <CheckField
        label="Fit to a measured opening"
        value={opening.enabled}
        onChange={(v) => patch((o) => void (o.enabled = v))}
        title="The carcasses stay square whatever the room does. What comes out of this is the scribe strips and fillers that take up the difference."
      />
      {opening.enabled && (
        <>
          <NumberField
            label="Width at the top"
            value={opening.widthAtTop}
            min={0}
            onChange={(v) => patch((o) => void (o.widthAtTop = v))}
            title="Clear width between the walls, measured level with the top of the run."
          />
          <NumberField
            label="Width at the floor"
            value={opening.widthAtBottom}
            min={0}
            onChange={(v) => patch((o) => void (o.widthAtBottom = v))}
            title="The same measurement at the floor. A leaning wall makes the two differ."
          />
          <NumberField
            label="Height at the left"
            value={opening.heightAtLeft}
            min={0}
            onChange={(v) => patch((o) => void (o.heightAtLeft = v))}
            title="Floor to the head of the opening. A difference between the ends is read as a sloping floor."
          />
          <NumberField
            label="Height at the right"
            value={opening.heightAtRight}
            min={0}
            onChange={(v) => patch((o) => void (o.heightAtRight = v))}
          />
          <SelectField
            label="Left end"
            value={opening.left}
            options={[
              { value: 'wall', label: 'Against a wall' },
              { value: 'open', label: 'Open' },
            ]}
            onChange={(v) => patch((o) => void (o.left = v))}
            title="An open end has nothing to scribe to, so no strip is made for it."
          />
          {opening.left === 'wall' && (
            <NumberField
              label="Corner angle, left"
              value={opening.cornerAngleLeft}
              suffix="°"
              step={0.5}
              min={45}
              max={135}
              onChange={(v) =>
                patch((o) => {
                  o.cornerAngleLeft = v;
                  // The stored triangle records what was measured. Once the
                  // angle is typed it no longer does, so it goes rather than
                  // sitting there disagreeing with the number in use.
                  o.cornerTriangleLeft = undefined;
                })
              }
              title="Between the back wall and the return wall, in plan. 90 is square; less closes in towards the front. Easier measured than guessed: use 'Measure the room…'."
            />
          )}
          <SelectField
            label="Right end"
            value={opening.right}
            options={[
              { value: 'wall', label: 'Against a wall' },
              { value: 'open', label: 'Open' },
            ]}
            onChange={(v) => patch((o) => void (o.right = v))}
          />
          {opening.right === 'wall' && (
            <NumberField
              label="Corner angle, right"
              value={opening.cornerAngleRight}
              suffix="°"
              step={0.5}
              min={45}
              max={135}
              onChange={(v) =>
                patch((o) => {
                  o.cornerAngleRight = v;
                  o.cornerTriangleRight = undefined;
                })
              }
            />
          )}
          <NumberField
            label="Wall bow"
            value={opening.wallBow}
            min={0}
            step={0.5}
            onChange={(v) => patch((o) => void (o.wallBow = v))}
            title="Worst gap under a straightedge held against the wall. Two width measurements say nothing about what the wall does between them."
          />
          <NumberField
            label="Scribe allowance"
            value={opening.scribe.width}
            min={0}
            onChange={(v) => patch((o) => void (o.scribe.width = v))}
            title="Material left on the outer edge to plane back to the plaster. It has to be at least as wide as the bow."
          />
          <SelectField
            label="Scribe material"
            value={opening.scribe.materialId}
            options={params.materials.map((m) => ({ value: m.id, label: m.name }))}
            onChange={(v) => patch((o) => void (o.scribe.materialId = v))}
          />
          {describeFit(opening, fit, run).map((sentence, i) => (
            <Hint key={i}>{sentence}</Hint>
          ))}
        </>
      )}
    </Group>
  );
}

/**
 * The run, as a list you can reorder.
 *
 * Cabinets are placed along the wall in this order, each starting where the one
 * before it ends, so the list is not just presentation: moving a cabinet up
 * moves it left in the kitchen. The measured position is shown against each one
 * so that is obvious rather than something to work out.
 */
function CabinetList() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const selectedId = useStore((s) => s.selectedCabinetId);
  const selectCabinet = useStore((s) => s.selectCabinet);
  const positions = cabinetPositions(params.cabinets);
  const [typeToAdd, setTypeToAdd] = useState<CabinetType>('base');

  const move = (index: number, by: number): void => {
    const to = index + by;
    if (to < 0 || to >= params.cabinets.length) return;
    update((p) => {
      const [moved] = p.cabinets.splice(index, 1);
      p.cabinets.splice(to, 0, moved!);
    });
  };

  const add = (): void =>
    update((p) => {
      const cabinet = newCabinetOfType(typeToAdd, p.cabinets);
      p.cabinets.push(cabinet);
      selectCabinet(cabinet.id);
    });

  const duplicate = (index: number): void =>
    update((p) => {
      const copy = duplicateCabinet(p.cabinets[index]!, p.cabinets);
      p.cabinets.splice(index + 1, 0, copy);
      selectCabinet(copy.id);
    });

  const remove = (index: number): void =>
    update((p) => {
      p.cabinets.splice(index, 1);
    });

  const total = positions.reduce((a, c) => a + c.w, 0);

  return (
    <Group title={`Run (${params.cabinets.length})`} open>
      {params.cabinets.map((cabinet, i) => {
        const at = positions[i]!;
        const selected = cabinet.id === selectedId;
        return (
          <div
            key={cabinet.id}
            style={{
              display: 'grid',
              gap: 6,
              padding: '6px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--line)',
            }}
          >
            <button
              onClick={() => selectCabinet(cabinet.id)}
              aria-pressed={selected}
              title="Edit this cabinet's carcasses"
              style={{
                textAlign: 'left',
                borderColor: selected ? 'var(--accent)' : undefined,
                color: selected ? 'var(--accent)' : undefined,
              }}
            >
              {cabinet.id} · {cabinet.name}
            </button>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                title="Move left along the run"
                aria-label={`Move ${cabinet.name} left along the run`}
              >
                ↑
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === params.cabinets.length - 1}
                title="Move right along the run"
                aria-label={`Move ${cabinet.name} right along the run`}
              >
                ↓
              </button>
              <button
                onClick={() => duplicate(i)}
                title="Copy this cabinet into the run"
                style={{ flex: 1 }}
              >
                Copy
              </button>
              <button
                onClick={() => remove(i)}
                disabled={params.cabinets.length === 1}
                style={{ flex: 1 }}
                title={
                  params.cabinets.length === 1
                    ? 'A project needs at least one cabinet.'
                    : 'Remove this cabinet from the run'
                }
              >
                Remove
              </button>
            </div>
            {selected && (
              <TextField
                label="Name"
                value={cabinet.name}
                onChange={(v) =>
                  update((p) => {
                    p.cabinets[i]!.name = v;
                  })
                }
              />
            )}
            <Hint>
              {at.w.toFixed(0)} mm wide, standing {at.x.toFixed(0)} mm along the run ·{' '}
              {cabinet.carcasses.length} carcass{cabinet.carcasses.length === 1 ? '' : 'es'}
            </Hint>
          </div>
        );
      })}
      <SelectField
        label="Type to add"
        value={typeToAdd}
        options={CABINET_TYPES.map((t) => ({ value: t.id, label: t.label }))}
        onChange={setTypeToAdd}
        title={CABINET_TYPES.find((t) => t.id === typeToAdd)?.description}
      />
      <button onClick={add}>Add cabinet</button>
      {params.cabinets.length > 1 && (
        <Hint>The run measures {total.toFixed(0)} mm end to end.</Hint>
      )}
    </Group>
  );
}

/** The stack inside the selected cabinet, from the floor up. */
function CarcassGroups() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const selectedId = useStore((s) => s.selectedCabinetId);

  const cabinetIndex = params.cabinets.findIndex((c) => c.id === selectedId);
  const cabinet = params.cabinets[cabinetIndex];
  if (!cabinet) return null;

  const addCarcass = (): void =>
    update((p) => {
      const stack = p.cabinets[cabinetIndex]!.carcasses;
      stack.push(newCarcass(stack));
    });

  return (
    <>
      {cabinet.carcasses.map((carcass, k) => (
        <CarcassGroup
          key={carcass.id}
          cabinet={cabinet}
          cabinetIndex={cabinetIndex}
          carcassIndex={k}
          open={k === 0}
        />
      ))}
      <Group title="Stack" open={cabinet.carcasses.length === 0}>
        <Hint>
          Carcasses stand on each other from the floor up. Only the one on the ground can have a toe
          kick.
        </Hint>
        <button onClick={addCarcass}>Add a carcass on top</button>
      </Group>
    </>
  );
}

function CarcassGroup({
  cabinet,
  cabinetIndex,
  carcassIndex,
  open = false,
}: {
  cabinet: Cabinet;
  cabinetIndex: number;
  carcassIndex: number;
  open?: boolean;
}) {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const spec = cabinet.carcasses[carcassIndex]!;
  const below = cabinet.carcasses[carcassIndex - 1];
  const onTheGround = carcassIndex === 0;

  /** Edit this carcass in place, wherever it has ended up in the list. */
  const patch = (fn: (c: Carcass) => void): void =>
    update((p) => {
      fn(p.cabinets[cabinetIndex]!.carcasses[carcassIndex]!);
    });

  const setBay = (i: number, patchBay: Partial<BaySpec>): void =>
    patch((target) => {
      while (target.bays.length <= i) {
        target.bays.push({ shelves: 'none', shelfCount: 0, doors: 'none', drawerFrontHeights: [] });
      }
      target.bays[i] = { ...target.bays[i]!, ...patchBay };
    });

  const bayCount = spec.dividerCount + 1;
  const linked = Boolean(below) && spec.linkWidthToBelow;
  // What this carcass will actually be cut to. A link chains down the stack, so
  // the box below may itself be following the one under it — reading its stored
  // width would show a dimension that is not the one on the sheet.
  const width = resolveWidths(cabinet.carcasses)[carcassIndex]!.width;

  return (
    <Group title={`${cabinet.id}-${spec.id} · ${spec.name}`} open={open}>
      <TextField label="Name" value={spec.name} onChange={(v) => patch((c) => (c.name = v))} />
      {below && (
        <CheckField
          label={`Match ${below.name.toLowerCase()} width`}
          value={spec.linkWidthToBelow}
          onChange={(v) => patch((c) => (c.linkWidthToBelow = v))}
        />
      )}
      {!linked && (
        <NumberField
          label="Width"
          value={spec.width}
          min={100}
          onChange={(v) => patch((c) => (c.width = v))}
        />
      )}
      <NumberField
        label="Height"
        value={spec.height}
        min={100}
        onChange={(v) => patch((c) => (c.height = v))}
      />
      <NumberField
        label="Depth"
        value={spec.depth}
        min={100}
        onChange={(v) => patch((c) => (c.depth = v))}
        title={
          below
            ? 'Shallower than the carcass below, which is what forms the ledge at the front.'
            : undefined
        }
      />
      {below && (
        <Hint>
          Sits on the {below.name.toLowerCase()}, flush at the wall. Steps back{' '}
          {Math.max(0, cabinet.carcasses[0]!.depth - spec.depth).toFixed(0)} mm at the front.
        </Hint>
      )}
      {below && (
        <>
          <SelectField
            label="Bottom panel"
            value={spec.floor}
            options={[
              { value: 'own', label: 'Its own panel' },
              { value: 'below', label: `None, stands on the ${below.name.toLowerCase()} top` },
            ]}
            onChange={(v) => patch((c) => (c.floor = v))}
            title="Leaving it out stands this carcass in shallow dados in the top panel below. One less panel, but that panel then needs machining on both faces."
          />
          {spec.floor === 'below' && (
            <>
              <NumberField
                label="Locating dado"
                value={params.joinery.stackDadoDepth}
                step={0.5}
                min={0.5}
                onChange={(v) =>
                  update((p) => {
                    p.joinery.stackDadoDepth = v;
                  })
                }
                title="Kept shallow: the panel below is grooved on its underside too, and the two sets of pockets cross."
              />
              <Hint>
                This carcass's sides, dividers and back all stand in the {below.name.toLowerCase()}{' '}
                top. Glue them in; gravity does the rest.
              </Hint>
            </>
          )}
        </>
      )}
      <SelectField
        label="Top panel"
        value={spec.topStyle}
        options={[
          { value: 'capped', label: 'Capped over the sides' },
          { value: 'inset', label: 'Inset between the sides' },
        ]}
        onChange={(v) => patch((c) => (c.topStyle = v))}
        title="Capped lays the top over the side edges, so the surface reads as one panel with no seam showing from above."
      />
      <NumberField
        label="Dividers"
        value={spec.dividerCount}
        suffix=""
        min={0}
        max={8}
        onChange={(v) => patch((c) => (c.dividerCount = Math.max(0, Math.round(v))))}
      />
      <SelectField
        label="Back panel"
        value={spec.back.style}
        options={[
          { value: 'groove', label: 'In a groove' },
          { value: 'rabbet', label: 'In a rabbet' },
          { value: 'none', label: 'None' },
        ]}
        onChange={(v) => patch((c) => (c.back.style = v))}
        title="A groove hides the back behind a shoulder of solid material. A rabbet opens onto the rear edge instead, so the back and the sides can be scribed flush to a wall that is not flat, in one pass."
      />
      {spec.back.style !== 'none' && (
        <NumberField
          label="Back inset"
          value={spec.back.inset}
          min={0}
          onChange={(v) => patch((c) => (c.back.inset = v))}
          title={
            spec.back.style === 'rabbet'
              ? 'How far the back sits forward of the true rear edge. Zero lands it flush, which is what makes the rabbet worth having.'
              : 'How far in from the rear edge the back sits, leaving room for scribing to the wall.'
          }
        />
      )}

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        <SelectField
          label="Construction"
          value={spec.construction}
          options={[
            { value: 'frameless', label: 'Frameless' },
            { value: 'face-frame', label: 'Face frame' },
          ]}
          onChange={(v) => patch((c) => (c.construction = v))}
          title="A face frame stands solid stock across the front. Doors and hinges then reference the frame's own opening, not the carcass panels behind it."
        />
        {spec.construction === 'face-frame' && (
          <>
            <SelectField
              label="Frame stock"
              value={spec.faceFrame.materialId}
              options={params.stockMaterials.map((m) => ({ value: m.id, label: m.name }))}
              onChange={(v) => patch((c) => (c.faceFrame.materialId = v))}
            />
            <NumberField
              label="Stile width"
              value={spec.faceFrame.stileWidth}
              min={20}
              onChange={(v) => patch((c) => (c.faceFrame.stileWidth = v))}
              title="Outer stiles and every mid-stile are all milled to this width."
            />
            <NumberField
              label="Rail width"
              value={spec.faceFrame.railWidth}
              min={20}
              onChange={(v) => patch((c) => (c.faceFrame.railWidth = v))}
              title="The top and bottom rails, milled to this width."
            />
            <NumberField
              label="Door overlay"
              value={spec.faceFrame.overlay}
              min={0}
              onChange={(v) => patch((c) => (c.faceFrame.overlay = v))}
              title="How far an overlay door reaches onto the surrounding frame member. A modest, consistent reveal is standard — covering the frame edge to edge would hide the reason to have one."
            />
          </>
        )}
      </div>

      {onTheGround && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <CheckField
            label="Toe kick"
            value={spec.toeKick.enabled}
            onChange={(v) => patch((c) => (c.toeKick.enabled = v))}
          />
          {spec.toeKick.enabled && (
            <>
              <NumberField
                label="Height"
                value={spec.toeKick.height}
                min={0}
                onChange={(v) => patch((c) => (c.toeKick.height = v))}
              />
              <NumberField
                label="Setback"
                value={spec.toeKick.setback}
                min={0}
                onChange={(v) => patch((c) => (c.toeKick.setback = v))}
              />
              <Hint>Cut straight out of the side panels, with a rail across the front.</Hint>
            </>
          )}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        <CheckField
          label="Hanging rail"
          value={spec.hangingRail.enabled}
          onChange={(v) => patch((c) => (c.hangingRail.enabled = v))}
          title="A solid rail behind the top, to screw a wall cabinet to the wall through. The back panel alone is too thin to trust with the weight."
        />
        {spec.hangingRail.enabled && (
          <>
            <NumberField
              label="Height"
              value={spec.hangingRail.height}
              min={20}
              onChange={(v) => patch((c) => (c.hangingRail.height = v))}
            />
            <NumberField
              label="Screw clearance"
              value={spec.hangingRail.screwDiameter}
              min={1}
              onChange={(v) => patch((c) => (c.hangingRail.screwDiameter = v))}
              title="Sized to clear the screw's shank, not grip it."
            />
            <NumberField
              label="Screw spacing"
              value={spec.hangingRail.screwSpacing}
              min={50}
              onChange={(v) => patch((c) => (c.hangingRail.screwSpacing = v))}
              title="Kept under about one stud spacing (16 in = 406 mm) so the rail always lands on at least two."
            />
          </>
        )}
      </div>

      {Array.from({ length: bayCount }, (_, i) => {
        const bay = spec.bays[i] ?? {
          shelves: 'none' as ShelfMode,
          shelfCount: 0,
          doors: 'none' as DoorStyle,
          drawerFrontHeights: [],
        };
        const drawers = bay.drawerFrontHeights ?? [];
        const isDrawers = drawers.length > 0;
        return (
          <div key={i} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <CheckField
              label={`Bay ${i + 1}: drawers`}
              value={isDrawers}
              onChange={(v) => setBay(i, { drawerFrontHeights: v ? [200] : [] })}
              title="A stack of drawers instead of doors and shelves. A bay is one or the other."
            />
            {isDrawers ? (
              <>
                {drawers.map((h, k) => (
                  <NumberField
                    key={k}
                    label={`Drawer ${k + 1} front`}
                    value={h}
                    min={20}
                    onChange={(v) =>
                      setBay(i, { drawerFrontHeights: drawers.map((x, j) => (j === k ? v : x)) })
                    }
                  />
                ))}
                <div className="row">
                  <button onClick={() => setBay(i, { drawerFrontHeights: [...drawers, 200] })}>
                    Add a drawer
                  </button>
                  <button
                    onClick={() => setBay(i, { drawerFrontHeights: drawers.slice(0, -1) })}
                    disabled={drawers.length <= 1}
                    title={
                      drawers.length <= 1
                        ? 'A drawer stack needs at least one drawer; switch the checkbox off instead.'
                        : 'Remove the bottom drawer'
                    }
                  >
                    Remove a drawer
                  </button>
                </div>
                <Hint>
                  Front heights that do not add up to the opening, with a reveal between each, are
                  split evenly instead.
                </Hint>
              </>
            ) : (
              <>
                <SelectField
                  label={`Bay ${i + 1}`}
                  value={bay.shelves}
                  options={SHELF_MODES}
                  onChange={(v) => setBay(i, { shelves: v })}
                />
                {bay.shelves === 'fixed' && (
                  <NumberField
                    label="Shelves"
                    value={bay.shelfCount}
                    suffix=""
                    min={0}
                    max={20}
                    onChange={(v) => setBay(i, { shelfCount: Math.max(0, Math.round(v)) })}
                  />
                )}
                <SelectField
                  label="Door"
                  value={bay.doors ?? 'none'}
                  options={[
                    { value: 'none', label: 'Open, no door' },
                    { value: 'left', label: 'Single, hinged left' },
                    { value: 'right', label: 'Single, hinged right' },
                    { value: 'double', label: 'Pair of doors' },
                  ]}
                  onChange={(v) => setBay(i, { doors: v })}
                />
              </>
            )}
          </div>
        );
      })}

      <div className="row" style={{ paddingTop: 8 }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>
          {width.toFixed(0)} × {spec.height.toFixed(0)} × {spec.depth.toFixed(0)} mm
        </span>
        <button
          onClick={() =>
            update((p) => {
              p.cabinets[cabinetIndex]!.carcasses.splice(carcassIndex, 1);
            })
          }
          disabled={cabinet.carcasses.length === 1}
          title={
            cabinet.carcasses.length === 1
              ? 'A cabinet needs at least one carcass.'
              : 'Remove this carcass from the stack'
          }
        >
          Remove carcass
        </button>
      </div>
    </Group>
  );
}
