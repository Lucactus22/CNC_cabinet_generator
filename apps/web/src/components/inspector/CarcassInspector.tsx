import { layoutBays, resolveWidths, type Carcass } from '@cabgen/core';
import { useStore } from '../../store';
import {
  ActionField,
  CheckField,
  ChoiceField,
  Group,
  Hint,
  NumberField,
  Reveal,
  SelectField,
  TextField,
} from '../Controls';
import { BayFront, BayInside, emptyBay, useBayPatch } from './BayControls';
import { JoinerySection } from './JoinerySection';

/**
 * One box: its size, its panels, and what is in each bay.
 *
 * The bays are here rather than only behind their own selection because a bay
 * is not a thing you can point at in the model yet — R-20 owns making it one —
 * and because laying a carcass out is one job. Selecting a bay in the run
 * strip narrows to it; this is the same controls with the whole box in view.
 */
export function CarcassInspector({
  cabinetId,
  carcassId,
}: {
  cabinetId: string;
  carcassId: string;
}) {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);

  const cabinetIndex = params.cabinets.findIndex((c) => c.id === cabinetId);
  const cabinet = params.cabinets[cabinetIndex];
  const carcassIndex = cabinet?.carcasses.findIndex((k) => k.id === carcassId) ?? -1;
  const spec = cabinet?.carcasses[carcassIndex];
  if (!cabinet || !spec) return null;

  const below = cabinet.carcasses[carcassIndex - 1];
  const onTheGround = carcassIndex === 0;
  const linked = Boolean(below) && spec.linkWidthToBelow;
  // What this carcass will actually be cut to. A link chains down the stack, so
  // the box below may itself be following the one under it — reading its stored
  // width would show a dimension that is not the one on the sheet.
  const width = resolveWidths(cabinet.carcasses)[carcassIndex]!.width;
  const bayCount = spec.dividerCount + 1;

  const patch = (fn: (c: Carcass) => void): void =>
    update((p) => {
      fn(p.cabinets[cabinetIndex]!.carcasses[carcassIndex]!);
    });

  return (
    <>
      <Group title="Size" open>
        <TextField
          label="Name"
          value={spec.name}
          param="cabinets[].carcasses[].name"
          onChange={(v) => patch((c) => void (c.name = v))}
        />
        {below && (
          <CheckField
            label={`Match ${below.name.toLowerCase()} width`}
            value={spec.linkWidthToBelow}
            param="cabinets[].carcasses[].linkWidthToBelow"
            onChange={(v) => patch((c) => void (c.linkWidthToBelow = v))}
          />
        )}
        {!linked && (
          <NumberField
            label="Width"
            value={spec.width}
            min={100}
            param="cabinets[].carcasses[].width"
            onChange={(v) => patch((c) => void (c.width = v))}
          />
        )}
        <NumberField
          label="Height"
          value={spec.height}
          min={100}
          param="cabinets[].carcasses[].height"
          onChange={(v) => patch((c) => void (c.height = v))}
        />
        <NumberField
          label="Depth"
          value={spec.depth}
          min={100}
          param="cabinets[].carcasses[].depth"
          onChange={(v) => patch((c) => void (c.depth = v))}
          title={
            below
              ? 'Shallower than the carcass below, which is what forms the ledge at the front.'
              : undefined
          }
        />
        <Hint>
          {width.toFixed(0)} × {spec.height.toFixed(0)} × {spec.depth.toFixed(0)} mm
          {below
            ? // Against the box it actually stands on, not the one on the
              // floor: in a stack of three, a middle box can be shallower than
              // the base and still overhang the one carrying it.
              `. Sits on the ${below.name.toLowerCase()}, flush at the wall, stepping back ${Math.max(
                0,
                below.depth - spec.depth,
              ).toFixed(0)} mm at the front.`
            : '.'}
        </Hint>
      </Group>

      <Group title="Bays" open count={bayCount}>
        <NumberField
          label="Bays"
          value={bayCount}
          suffix=""
          min={1}
          max={9}
          param="cabinets[].carcasses[].dividerCount"
          onChange={(v) =>
            patch((c) => {
              const want = Math.min(9, Math.max(1, Math.round(v)));
              c.dividerCount = want - 1;
              while (c.bays.length < want) c.bays.push(emptyBay());
              // Explicit widths are per bay, so a changed count makes the old
              // list meaningless — it would silently fall back to an even
              // split with the stale numbers still on screen.
              if (c.bayWidths.length > 0 && c.bayWidths.length !== want) c.bayWidths = [];
            })
          }
          title="Openings across the front. A full-depth divider stands between each pair."
        />
        <BayWidths cabinetIndex={cabinetIndex} carcassIndex={carcassIndex} />
        {Array.from({ length: bayCount }, (_, i) => (
          <BayCard
            key={i}
            cabinetId={cabinetId}
            carcassId={carcassId}
            bay={i}
            onOpen={() => select({ kind: 'bay', cabinetId, carcassId, bay: i })}
          />
        ))}
      </Group>

      <Group title="Panels">
        <SelectField
          label="Top panel"
          value={spec.topStyle}
          param="cabinets[].carcasses[].topStyle"
          options={[
            { value: 'capped', label: 'Capped over the sides' },
            { value: 'inset', label: 'Inset between the sides' },
          ]}
          onChange={(v) => patch((c) => void (c.topStyle = v))}
          title="Capped lays the top over the side edges, so the surface reads as one panel with no seam showing from above."
        />
        {/* Shown on every carcass, not only the ones that can leave the bottom
            out: a control that does not exist on the box you happen to be
            looking at is a capability nobody finds, and a sentence saying why
            costs a line. */}
        {below ? (
          <>
            <SelectField
              label="Bottom panel"
              value={spec.floor}
              param="cabinets[].carcasses[].floor"
              options={[
                { value: 'own', label: 'Its own panel' },
                { value: 'below', label: `None, stands on the ${below.name.toLowerCase()} top` },
              ]}
              onChange={(v) => patch((c) => void (c.floor = v))}
              title="Leaving it out stands this carcass in shallow dados in the top panel below. One less panel, but that panel then needs machining on both faces."
            />
            {spec.floor === 'below' && (
              <NumberField
                label="Locating dado"
                value={params.joinery.stackDadoDepth}
                step={0.5}
                min={0.5}
                param="joinery.stackDadoDepth"
                onChange={(v) =>
                  update((p) => {
                    p.joinery.stackDadoDepth = v;
                  })
                }
                title="Kept shallow: the panel below is grooved on its underside too, and the two sets of pockets cross."
              />
            )}
          </>
        ) : (
          <Reveal param="cabinets[].carcasses[].floor">
            <Hint>
              This box is on the floor, so it always has its own bottom panel. One standing on
              another can leave it out and stand in shallow dados in the top below it instead.
            </Hint>
          </Reveal>
        )}
        <SelectField
          label="Back panel"
          value={spec.back.style}
          param="cabinets[].carcasses[].back.style"
          options={[
            { value: 'groove', label: 'In a groove' },
            { value: 'rabbet', label: 'In a rabbet' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(v) => patch((c) => void (c.back.style = v))}
          title="A groove hides the back behind a shoulder of solid material. A rabbet opens onto the rear edge instead, so the back and the sides can be scribed flush to a wall that is not flat, in one pass."
        />
        {spec.back.style !== 'none' && (
          <>
            <NumberField
              label="Back inset"
              value={spec.back.inset}
              min={0}
              param="cabinets[].carcasses[].back.inset"
              onChange={(v) => patch((c) => void (c.back.inset = v))}
              title={
                spec.back.style === 'rabbet'
                  ? 'How far the back sits forward of the true rear edge. Zero lands it flush, which is what makes the rabbet worth having.'
                  : 'How far in from the rear edge the back sits, leaving room for scribing to the wall.'
              }
            />
            <SelectField
              label="Back cut from"
              value={spec.back.materialId}
              param="cabinets[].carcasses[].back.materialId"
              options={params.materials.map((m) => ({ value: m.id, label: m.name }))}
              onChange={(v) => patch((c) => void (c.back.materialId = v))}
              title="Usually thinner than the carcass: the back carries no load once the box is square."
            />
          </>
        )}
      </Group>

      <JoinerySection />

      <Group title="Face frame" count={spec.construction === 'face-frame' ? 'on' : undefined}>
        <ChoiceField
          label="Construction"
          value={spec.construction}
          param="cabinets[].carcasses[].construction"
          options={[
            { value: 'frameless', label: 'Frameless', about: 'Doors reference the panels' },
            {
              value: 'face-frame',
              label: 'Face frame',
              about: 'Solid stock across the front; doors reference the frame',
            },
          ]}
          onChange={(v) => patch((c) => void (c.construction = v))}
        />
        {spec.construction === 'face-frame' && (
          <>
            <SelectField
              label="Frame stock"
              value={spec.faceFrame.materialId}
              param="cabinets[].carcasses[].faceFrame.materialId"
              options={params.stockMaterials.map((m) => ({ value: m.id, label: m.name }))}
              onChange={(v) => patch((c) => void (c.faceFrame.materialId = v))}
            />
            <NumberField
              label="Stile width"
              value={spec.faceFrame.stileWidth}
              min={20}
              param="cabinets[].carcasses[].faceFrame.stileWidth"
              onChange={(v) => patch((c) => void (c.faceFrame.stileWidth = v))}
              title="Outer stiles and every mid-stile are all milled to this width."
            />
            <NumberField
              label="Rail width"
              value={spec.faceFrame.railWidth}
              min={20}
              param="cabinets[].carcasses[].faceFrame.railWidth"
              onChange={(v) => patch((c) => void (c.faceFrame.railWidth = v))}
              title="The top and bottom rails, milled to this width."
            />
            <NumberField
              label="Door overlay"
              value={spec.faceFrame.overlay}
              min={0}
              param="cabinets[].carcasses[].faceFrame.overlay"
              onChange={(v) => patch((c) => void (c.faceFrame.overlay = v))}
              title="How far an overlay door reaches onto the surrounding frame member. A modest, consistent reveal is standard — covering the frame edge to edge would hide the reason to have one."
            />
          </>
        )}
      </Group>

      {onTheGround && (
        <Group title="Toe kick" count={spec.toeKick.enabled ? 'on' : undefined}>
          <CheckField
            label="Toe kick"
            value={spec.toeKick.enabled}
            param="cabinets[].carcasses[].toeKick.enabled"
            onChange={(v) => patch((c) => void (c.toeKick.enabled = v))}
            title="Also called a kickboard or plinth: the recess your toes go under."
          />
          {spec.toeKick.enabled && (
            <>
              <NumberField
                label="Height"
                value={spec.toeKick.height}
                min={0}
                param="cabinets[].carcasses[].toeKick.height"
                onChange={(v) => patch((c) => void (c.toeKick.height = v))}
              />
              <NumberField
                label="Setback"
                value={spec.toeKick.setback}
                min={0}
                param="cabinets[].carcasses[].toeKick.setback"
                onChange={(v) => patch((c) => void (c.toeKick.setback = v))}
              />
              <Hint>Cut straight out of the side panels, with a rail across the front.</Hint>
            </>
          )}
        </Group>
      )}

      <Group title="Hanging rail" count={spec.hangingRail.enabled ? 'on' : undefined}>
        <CheckField
          label="Hanging rail"
          value={spec.hangingRail.enabled}
          param="cabinets[].carcasses[].hangingRail.enabled"
          onChange={(v) => patch((c) => void (c.hangingRail.enabled = v))}
          title="A solid rail behind the top, to screw a wall cabinet to the wall through. The back panel alone is too thin to trust with the weight."
        />
        {spec.hangingRail.enabled && (
          <>
            <NumberField
              label="Height"
              value={spec.hangingRail.height}
              min={20}
              param="cabinets[].carcasses[].hangingRail.height"
              onChange={(v) => patch((c) => void (c.hangingRail.height = v))}
            />
            <NumberField
              label="Screw clearance"
              value={spec.hangingRail.screwDiameter}
              min={1}
              param="cabinets[].carcasses[].hangingRail.screwDiameter"
              onChange={(v) => patch((c) => void (c.hangingRail.screwDiameter = v))}
              title="Sized to clear the screw's shank, not grip it."
            />
            <NumberField
              label="Screw spacing"
              value={spec.hangingRail.screwSpacing}
              min={50}
              param="cabinets[].carcasses[].hangingRail.screwSpacing"
              onChange={(v) => patch((c) => void (c.hangingRail.screwSpacing = v))}
              title="Kept under about one stud spacing (16 in = 406 mm) so the rail always lands on at least two."
            />
          </>
        )}
      </Group>

      <ActionField param="cabinets[].carcasses[].id">
        <button
          disabled={cabinet.carcasses.length === 1}
          title={
            cabinet.carcasses.length === 1
              ? 'A cabinet needs at least one carcass.'
              : 'Remove this carcass from the stack'
          }
          onClick={() => {
            const left = cabinet.carcasses.filter((_, i) => i !== carcassIndex);
            const next = left[Math.min(carcassIndex, left.length - 1)];
            update((p) => {
              p.cabinets[cabinetIndex]!.carcasses.splice(carcassIndex, 1);
            });
            // Whatever took its place in the stack, not the cabinet above it.
            select(
              next
                ? { kind: 'carcass', cabinetId, carcassId: next.id }
                : { kind: 'cabinet', cabinetId },
            );
          }}
        >
          Remove this carcass
        </button>
      </ActionField>
    </>
  );
}

/** One bay's choices, in place, with a way through to the rest of them. */
function BayCard({
  cabinetId,
  carcassId,
  bay,
  onOpen,
}: {
  cabinetId: string;
  carcassId: string;
  bay: number;
  onOpen: () => void;
}) {
  const params = useStore((s) => s.params);
  const patch = useBayPatch(cabinetId, carcassId, bay);
  const spec = params.cabinets
    .find((c) => c.id === cabinetId)
    ?.carcasses.find((k) => k.id === carcassId);
  const baySpec = spec?.bays[bay] ?? emptyBay();

  return (
    <div className="bay-card">
      <div className="bay-head">
        <b>Bay {bay + 1}</b>
        <button className="link" onClick={onOpen}>
          more…
        </button>
      </div>
      <BayFront bay={baySpec} patch={patch} compact />
      <BayInside bay={baySpec} patch={patch} compact />
    </div>
  );
}

/**
 * Bays of unequal width.
 *
 * `bayWidths` is one of the eight parameters docs/UX.md found with no control
 * anywhere in the app. Left empty it means "split the interior evenly", which
 * is the common case, so it is a switch rather than a list that always has to
 * be filled in — and turning it on seeds the widths from the even split the
 * carcass already has, so nothing moves until a number is changed.
 */
function BayWidths({ cabinetIndex, carcassIndex }: { cabinetIndex: number; carcassIndex: number }) {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const cabinet = params.cabinets[cabinetIndex]!;
  const spec = cabinet.carcasses[carcassIndex]!;
  const thickness =
    params.materials.find((m) => m.id === params.carcassMaterialId)?.actualThickness ?? 18;
  const width = resolveWidths(cabinet.carcasses)[carcassIndex]!.width;
  const layout = layoutBays({ ...spec, width }, thickness);
  const explicit = spec.bayWidths.length > 0;

  return (
    <Reveal param="cabinets[].carcasses[].bayWidths">
      <CheckField
        label="Unequal bay widths"
        value={explicit}
        onChange={(on) =>
          update((p) => {
            const target = p.cabinets[cabinetIndex]!.carcasses[carcassIndex]!;
            target.bayWidths = on ? layout.bays.map((b) => round(b.x1 - b.x0)) : [];
          })
        }
        title="Off, the interior is split evenly. On, each bay's clear opening is set here."
      />
      {explicit &&
        spec.bayWidths.map((w, i) => (
          <NumberField
            key={i}
            label={`Bay ${i + 1} opening`}
            value={w}
            min={20}
            onChange={(v) =>
              update((p) => {
                const target = p.cabinets[cabinetIndex]!.carcasses[carcassIndex]!;
                target.bayWidths = target.bayWidths.map((x, k) => (k === i ? v : x));
              })
            }
          />
        ))}
      {explicit && layout.fellBackToEven && (
        <Hint>
          These do not add up to the{' '}
          {(width - 2 * thickness - spec.dividerCount * thickness).toFixed(0)} mm of interior left
          between the dividers, so the bays are being split evenly instead.
        </Hint>
      )}
    </Reveal>
  );
}

const round = (n: number): number => Math.round(n * 10) / 10;
