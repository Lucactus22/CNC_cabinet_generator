import { useStore } from '../store';
import type { BaySpec, CarcassSpec, ShelfMode } from '@cabgen/core';
import { CheckField, Group, Hint, NumberField, SelectField, TextField } from './Controls';
import { EffectsPanel } from './EffectsPanel';

const SHELF_MODES: Array<{ value: ShelfMode; label: string }> = [
  { value: 'none', label: 'Open, no shelves' },
  { value: 'fixed', label: 'Fixed, in dados' },
  { value: 'adjustable', label: 'Adjustable, on pins' },
];

export function ParamPanel() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const project = useStore((s) => s.project);

  return (
    <aside className="sidebar">
      <Group title="Project" open>
        <TextField label="Name" value={params.name} onChange={(v) => update((p) => { p.name = v; })} />
        <CheckField
          label="Engrave part labels"
          value={params.labelParts}
          onChange={(v) => update((p) => { p.labelParts = v; })}
          title="Writes each part's ID onto the LABEL layer for reference."
        />
      </Group>

      <CarcassGroup which="base" title="Base carcass" open />
      <CarcassGroup which="top" title="Upper carcass" />

      <Group title="Toe kick">
        <CheckField
          label="Enabled"
          value={params.base.toeKick.enabled}
          onChange={(v) => update((p) => { p.base.toeKick.enabled = v; })}
        />
        <NumberField
          label="Height"
          value={params.base.toeKick.height}
          onChange={(v) => update((p) => { p.base.toeKick.height = v; })}
          min={0}
        />
        <NumberField
          label="Setback"
          value={params.base.toeKick.setback}
          onChange={(v) => update((p) => { p.base.toeKick.setback = v; })}
          min={0}
        />
        <Hint>Cut straight out of the side panels, with a rail across the front.</Hint>
      </Group>

      <Group title="Material">
        {params.materials.map((m, i) => (
          <div key={m.id} style={{ display: 'grid', gap: 8, paddingBottom: 8 }}>
            <strong style={{ fontSize: 12, color: 'var(--muted)' }}>{m.name}</strong>
            <NumberField
              label="Measured thickness"
              value={m.actualThickness}
              step={0.1}
              min={1}
              onChange={(v) => update((p) => { p.materials[i]!.actualThickness = v; })}
              title="Measure it. Every groove width comes from this, not the nominal size."
            />
            <NumberField
              label="Sheet length"
              value={m.sheetLength}
              onChange={(v) => update((p) => { p.materials[i]!.sheetLength = v; })}
              min={100}
            />
            <NumberField
              label="Sheet width"
              value={m.sheetWidth}
              onChange={(v) => update((p) => { p.materials[i]!.sheetWidth = v; })}
              min={100}
            />
            <CheckField
              label="Directional grain"
              value={m.hasGrain}
              onChange={(v) => update((p) => { p.materials[i]!.hasGrain = v; })}
              title="Stops the nester turning visible parts against the face grain."
            />
          </div>
        ))}
        <button
          onClick={() =>
            update((p) => {
              for (const m of p.materials) {
                m.sheetLength = p.machine.travelX;
                m.sheetWidth = p.machine.travelY;
              }
            })
          }
          title="Nest into blanks the size of your bed, so nothing needs tiling."
        >
          Set sheets to machine size
        </button>
      </Group>

      <Group title="Joinery">
        <SelectField
          label="Carcass joint"
          value={params.joinery.carcassJoint}
          options={[
            { value: 'dado', label: 'Stopped dado + screws' },
            { value: 'tabslot', label: 'Tab and slot' },
          ]}
          onChange={(v) => update((p) => { p.joinery.carcassJoint = v; })}
        />
        <SelectField
          label="Corner relief"
          value={params.joinery.reliefStyle}
          options={[
            { value: 'dogbone', label: 'Dogbone' },
            { value: 'tbone', label: 'T-bone' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(v) => update((p) => { p.joinery.reliefStyle = v; })}
          title="Without relief, the cutter's radius leaves material where a square corner has to sit."
        />
        <NumberField
          label="Fit clearance"
          value={params.joinery.fitClearance}
          step={0.05}
          min={0}
          onChange={(v) => update((p) => { p.joinery.fitClearance = v; })}
          title="Added to every groove and slot width. Raise it if joints are too tight."
        />
        <NumberField
          label="Dado depth"
          value={params.joinery.dadoDepth}
          step={0.5}
          min={0}
          onChange={(v) => update((p) => { p.joinery.dadoDepth = v; })}
        />
        <NumberField
          label="Dado stop from front"
          value={params.joinery.dadoStopFront}
          min={0}
          onChange={(v) => update((p) => { p.joinery.dadoStopFront = v; })}
          title="Holds the groove back from the front edge so the joint does not show. Zero cuts through."
        />
        {params.joinery.carcassJoint === 'tabslot' && (
          <>
            <NumberField
              label="Tab width"
              value={params.joinery.tabWidth}
              min={5}
              onChange={(v) => update((p) => { p.joinery.tabWidth = v; })}
            />
            <NumberField
              label="Minimum tabs"
              value={params.joinery.tabMinCount}
              suffix=""
              min={1}
              onChange={(v) => update((p) => { p.joinery.tabMinCount = Math.round(v); })}
            />
          </>
        )}
        <CheckField
          label="Screw holes"
          value={params.joinery.screwHoles}
          onChange={(v) => update((p) => { p.joinery.screwHoles = v; })}
          title="Drills clearance holes through the outer panel, on the centreline of every groove, so there is nothing to mark out at assembly."
        />
        {params.joinery.screwHoles && (
          <>
            <NumberField
              label="Screw spacing"
              value={params.joinery.screwSpacing}
              min={20}
              onChange={(v) => update((p) => { p.joinery.screwSpacing = v; })}
            />
            <NumberField
              label="Clearance hole"
              value={params.joinery.screwClearanceDiameter}
              step={0.5}
              min={1}
              onChange={(v) => update((p) => { p.joinery.screwClearanceDiameter = v; })}
              title="Must pass the screw threads freely. Sized to grip instead, the screw jacks the joint apart rather than pulling it together."
            />
            <Hint>
              Holes go through the outer panel on each groove's centreline, drilled from the same
              face as the groove so nothing needs turning over.
            </Hint>
          </>
        )}
      </Group>

      <EffectsPanel />

      <Group title="Shelf pins">
        <NumberField
          label="Hole diameter"
          value={params.joinery.shelfPin.diameter}
          step={0.5}
          min={1}
          onChange={(v) => update((p) => { p.joinery.shelfPin.diameter = v; })}
        />
        <NumberField
          label="Hole depth"
          value={params.joinery.shelfPin.depth}
          min={1}
          onChange={(v) => update((p) => { p.joinery.shelfPin.depth = v; })}
        />
        <NumberField
          label="Pitch"
          value={params.joinery.shelfPin.pitch}
          min={4}
          onChange={(v) => update((p) => { p.joinery.shelfPin.pitch = v; })}
        />
        <NumberField
          label="Row from front"
          value={params.joinery.shelfPin.frontOffset}
          min={5}
          onChange={(v) => update((p) => { p.joinery.shelfPin.frontOffset = v; })}
        />
        <NumberField
          label="Row from back"
          value={params.joinery.shelfPin.backOffset}
          min={5}
          onChange={(v) => update((p) => { p.joinery.shelfPin.backOffset = v; })}
        />
        <Hint>Defaults follow the 32 mm system: 5 mm holes, 32 mm pitch, 37 mm in from each edge.</Hint>
      </Group>

      <Group title="Tooling">
        <NumberField
          label="Cutter diameter"
          value={params.tool.diameter}
          step={0.5}
          min={0.5}
          onChange={(v) => update((p) => { p.tool.diameter = v; })}
          title="Sets relief sizes and the spacing between nested parts."
        />
        <NumberField
          label="Drill diameter"
          value={params.tool.drillDiameter}
          step={0.5}
          min={0.5}
          onChange={(v) => update((p) => { p.tool.drillDiameter = v; })}
        />
      </Group>

      <Group title="Machine" open={project.diagnostics.some((d) => d.severity === 'error')}>
        <NumberField
          label="X travel"
          value={params.machine.travelX}
          onChange={(v) => update((p) => { p.machine.travelX = v; })}
          min={100}
        />
        <NumberField
          label="Y travel"
          value={params.machine.travelY}
          onChange={(v) => update((p) => { p.machine.travelY = v; })}
          min={100}
        />
        <NumberField
          label="Z travel"
          value={params.machine.travelZ}
          onChange={(v) => update((p) => { p.machine.travelZ = v; })}
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
          onChange={(v) => update((p) => { p.machine.tilingAxis = v; })}
          title="The axis the stock slides along between tiles."
        />
        <NumberField
          label="Tile overlap"
          value={params.machine.tileOverlap}
          min={0}
          onChange={(v) => update((p) => { p.machine.tileOverlap = v; })}
          title="Headroom kept at each end of travel. Nothing is machined twice."
        />
        <NumberField
          label="Registration hole"
          value={params.machine.registrationHoleDiameter}
          step={0.5}
          min={1}
          onChange={(v) => update((p) => { p.machine.registrationHoleDiameter = v; })}
        />
      </Group>

      <Group title="Nesting">
        <SelectField
          label="Optimise for"
          value={params.nesting.strategy}
          options={[
            { value: 'tiling', label: 'Fewest setups' },
            { value: 'material', label: 'Least material' },
          ]}
          onChange={(v) => update((p) => { p.nesting.strategy = v; })}
          title="Fewest setups keeps each part inside one machine tile and fills the earliest tile first. Least material packs as tightly as it can and lets parts fall across seams."
        />
        <Hint>
          {params.nesting.strategy === 'tiling'
            ? 'No part is cut across a tile seam unless it is larger than the machine itself.'
            : 'Tightest packing, but parts will be cut across tile seams.'}
        </Hint>
        <NumberField
          label="Sheet margin"
          value={params.nesting.sheetMargin}
          min={0}
          onChange={(v) => update((p) => { p.nesting.sheetMargin = v; })}
        />
        <NumberField
          label="Gap between parts"
          value={params.nesting.partGap}
          min={0}
          onChange={(v) => update((p) => { p.nesting.partGap = v; })}
          title="On top of the cutter diameter, which is always allowed for."
        />
        <CheckField
          label="Allow rotation"
          value={params.nesting.allowRotation}
          onChange={(v) => update((p) => { p.nesting.allowRotation = v; })}
        />
      </Group>
    </aside>
  );
}

function CarcassGroup({
  which,
  title,
  open = false,
}: {
  which: 'base' | 'top';
  title: string;
  open?: boolean;
}) {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const spec = params[which] as CarcassSpec;
  const isTop = which === 'top';

  const setBay = (i: number, patch: Partial<BaySpec>): void =>
    update((p) => {
      const target = p[which] as CarcassSpec;
      while (target.bays.length <= i) target.bays.push({ shelves: 'none', shelfCount: 0 });
      target.bays[i] = { ...target.bays[i]!, ...patch };
    });

  const bayCount = spec.dividerCount + 1;

  return (
    <Group title={title} open={open}>
      {isTop ? (
        <>
          <CheckField
            label="Match base width"
            value={params.top.linkWidthToBase}
            onChange={(v) => update((p) => { p.top.linkWidthToBase = v; })}
          />
          {!params.top.linkWidthToBase && (
            <NumberField
              label="Width"
              value={spec.width}
              min={100}
              onChange={(v) => update((p) => { p.top.width = v; })}
            />
          )}
        </>
      ) : (
        <NumberField
          label="Width"
          value={spec.width}
          min={100}
          onChange={(v) => update((p) => { p.base.width = v; })}
        />
      )}
      <NumberField
        label="Height"
        value={spec.height}
        min={100}
        onChange={(v) => update((p) => { (p[which] as CarcassSpec).height = v; })}
      />
      <NumberField
        label="Depth"
        value={spec.depth}
        min={100}
        onChange={(v) => update((p) => { (p[which] as CarcassSpec).depth = v; })}
        title={isTop ? 'Shallower than the base, which is what forms the ledge at the front.' : undefined}
      />
      {isTop && (
        <Hint>
          Sits on the base, flush at the wall. Steps back{' '}
          {Math.max(0, params.base.depth - params.top.depth).toFixed(0)} mm at the front.
        </Hint>
      )}
      {isTop && (
        <>
          <SelectField
            label="Bottom panel"
            value={params.top.floor}
            options={[
              { value: 'own', label: 'Its own panel' },
              { value: 'base-top', label: 'None, stands on the base top' },
            ]}
            onChange={(v) => update((p) => { p.top.floor = v; })}
            title="Leaving it out stands the upper carcass in shallow dados in the base's top panel. One less panel, but that panel then needs machining on both faces."
          />
          {params.top.floor === 'base-top' && (
            <>
              <NumberField
                label="Locating dado"
                value={params.joinery.stackDadoDepth}
                step={0.5}
                min={0.5}
                onChange={(v) => update((p) => { p.joinery.stackDadoDepth = v; })}
                title="Kept shallow: the base's top panel is grooved on its underside too, and the two sets of pockets cross."
              />
              <Hint>
                The upper's sides, dividers and back all stand in the base's top panel. Glue them
                in; gravity does the rest.
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
        onChange={(v) => update((p) => { (p[which] as CarcassSpec).topStyle = v; })}
        title="Capped lays the top over the side edges, so the surface reads as one panel with no seam showing from above."
      />
      <NumberField
        label="Dividers"
        value={spec.dividerCount}
        suffix=""
        min={0}
        max={8}
        onChange={(v) =>
          update((p) => { (p[which] as CarcassSpec).dividerCount = Math.max(0, Math.round(v)); })
        }
      />
      <SelectField
        label="Back panel"
        value={spec.back.style}
        options={[
          { value: 'groove', label: 'In a groove' },
          { value: 'rabbet', label: 'In a rabbet' },
          { value: 'none', label: 'None' },
        ]}
        onChange={(v) => update((p) => { (p[which] as CarcassSpec).back.style = v; })}
      />
      {spec.back.style !== 'none' && (
        <NumberField
          label="Back inset"
          value={spec.back.inset}
          min={0}
          onChange={(v) => update((p) => { (p[which] as CarcassSpec).back.inset = v; })}
          title="How far in from the rear edge the back sits, leaving room for scribing to the wall."
        />
      )}

      {Array.from({ length: bayCount }, (_, i) => {
        const bay = spec.bays[i] ?? { shelves: 'none' as ShelfMode, shelfCount: 0 };
        return (
          <div key={i} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
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
          </div>
        );
      })}
    </Group>
  );
}
