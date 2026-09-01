import { useStore } from '../../store';
import { Group, Hint, NumberField, SelectField } from '../Controls';
import { ChoiceGallery } from '../../gallery/Gallery';
import { DOOR_FIT } from '../../gallery/choices';
import {
  BayFront,
  BayInside,
  DrawerStack,
  ShelfHeights,
  emptyBay,
  useBayPatch,
} from './BayControls';

/**
 * One opening in a carcass, and everything that fills it.
 *
 * A bay is the unit people return to most — R-16 called "drawers in that bay"
 * the single interaction that most justifies the rebuild — and it is the one
 * level of the model with no geometry of its own to click on, which is why the
 * run strip draws it. Selecting one here narrows the inspector to it alone.
 */
export function BayInspector({
  cabinetId,
  carcassId,
  bay,
}: {
  cabinetId: string;
  carcassId: string;
  bay: number;
}) {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const volume = useStore((s) =>
    s.project.bays.find(
      (b) => b.cabinetId === cabinetId && b.carcassId === carcassId && b.index === bay,
    ),
  );
  const patch = useBayPatch(cabinetId, carcassId, bay);

  const cabinet = params.cabinets.find((c) => c.id === cabinetId);
  const carcass = cabinet?.carcasses.find((k) => k.id === carcassId);
  if (!carcass) return null;
  const spec = carcass.bays[bay] ?? emptyBay();
  const drawers = spec.drawerFrontHeights.length > 0;
  const pin = params.joinery.shelfPin;

  return (
    <>
      <Group title={`Bay ${bay + 1}`} open>
        <BayFront bay={spec} at={{ cabinetId, carcassId, bay }} patch={patch} />
        <BayInside bay={spec} at={{ cabinetId, carcassId, bay }} patch={patch} />
        <ShelfHeights bay={spec} volume={volume} patch={patch} />
        <DrawerStack
          bay={spec}
          bayIndex={bay}
          carcass={carcass}
          cabinetId={cabinetId}
          patch={patch}
        />
      </Group>

      {(spec.doors !== 'none' || drawers) && (
        <Group title={drawers ? 'How the fronts sit' : 'How the doors sit'} open>
          <ChoiceGallery
            gallery={DOOR_FIT}
            value={params.doors.fit}
            param="doors.fit"
            set={(p, v) => {
              p.doors.fit = v;
            }}
          />
          <NumberField
            label={params.doors.fit === 'overlay' ? 'Reveal' : 'Clearance'}
            value={params.doors.fit === 'overlay' ? params.doors.reveal : params.doors.insetGap}
            step={0.5}
            min={0}
            param={params.doors.fit === 'overlay' ? 'doors.reveal' : 'doors.insetGap'}
            onChange={(v) =>
              update((p) => {
                if (p.doors.fit === 'overlay') p.doors.reveal = v;
                else p.doors.insetGap = v;
              })
            }
            title="Gap between neighbouring doors, and around the outside of the run."
          />
          <SelectField
            label="Cut from"
            value={params.doors.materialId}
            param="doors.materialId"
            options={params.materials.map((m) => ({ value: m.id, label: m.name }))}
            onChange={(v) =>
              update((p) => {
                p.doors.materialId = v;
              })
            }
          />
          <Hint>
            These apply to every door and drawer face in the project, so a run keeps one reveal
            across all of it.
          </Hint>
        </Group>
      )}

      {spec.shelves === 'adjustable' && (
        <Group title="The pin ladder" open>
          <NumberField
            label="Row from the front"
            value={pin.frontOffset}
            min={5}
            param="joinery.shelfPin.frontOffset"
            onChange={(v) =>
              update((p) => {
                p.joinery.shelfPin.frontOffset = v;
              })
            }
            title="37 mm is the 32 mm system's standard."
          />
          <NumberField
            label="Row from the back"
            value={pin.backOffset}
            min={5}
            param="joinery.shelfPin.backOffset"
            onChange={(v) =>
              update((p) => {
                p.joinery.shelfPin.backOffset = v;
              })
            }
          />
          <NumberField
            label="Starts above"
            value={pin.startAbove}
            min={0}
            param="joinery.shelfPin.startAbove"
            onChange={(v) =>
              update((p) => {
                p.joinery.shelfPin.startAbove = v;
              })
            }
            title="How far up from the bottom of the bay the first hole is bored. Nobody puts a shelf on the floor of the box."
          />
          <NumberField
            label="Stops below"
            value={pin.endBelow}
            min={0}
            param="joinery.shelfPin.endBelow"
            onChange={(v) =>
              update((p) => {
                p.joinery.shelfPin.endBelow = v;
              })
            }
            title="How far down from the top of the bay the last hole is bored."
          />
          <Hint>
            Which pin they are bored for — its diameter, depth and pitch — is a catalogue entry,
            under Workshop.
          </Hint>
        </Group>
      )}
    </>
  );
}
