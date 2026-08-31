import type { BaySpec, Carcass, DoorStyle, Part, ShelfMode } from '@cabgen/core';
import { useStore } from '../../store';
import { ChoiceField, Hint, NumberField, Reveal, SelectField } from '../Controls';

/** What fronts a bay, as one choice: a bay is doors or drawers, never both. */
export type Fronting = DoorStyle | 'drawers';

/**
 * A new drawer bank starts as three.
 *
 * R-16 measured "drawers in that bay" as the interaction people repeat most,
 * and today it lands one drawer, so a bank of three costs two more presses
 * before anything looks right. Three is what a base unit's drawer bank
 * normally is; the heights are nominal and the pipeline splits the opening
 * evenly between them, which is what the hint under the list says.
 */
const NEW_STACK = [200, 200, 200];

export const frontingOf = (bay: BaySpec): Fronting =>
  bay.drawerFrontHeights.length > 0 ? 'drawers' : bay.doors;

export const emptyBay = (): BaySpec => ({
  shelves: 'none',
  shelfCount: 0,
  doors: 'none',
  drawerFrontHeights: [],
});

/** Edit bay `i` of a carcass, creating it if the divider count outran the list. */
export function useBayPatch(cabinetId: string, carcassId: string, bay: number) {
  const update = useStore((s) => s.update);
  return (fn: (b: BaySpec) => void): void =>
    update((p) => {
      const carcass = p.cabinets
        .find((c) => c.id === cabinetId)
        ?.carcasses.find((k) => k.id === carcassId);
      if (!carcass) return;
      while (carcass.bays.length <= bay) carcass.bays.push(emptyBay());
      fn(carcass.bays[bay]!);
    });
}

const FRONTS: Array<{ value: Fronting; label: string; about?: string }> = [
  { value: 'none', label: 'Open', about: 'Nothing across the front' },
  { value: 'left', label: 'Door, hinged left' },
  { value: 'right', label: 'Door, hinged right' },
  { value: 'double', label: 'Pair of doors' },
  { value: 'drawers', label: 'Drawers', about: 'A bank of three to start with' },
];

/**
 * `compact` is the same choice as a dropdown rather than a row of labelled
 * options: a carcass shows every one of its bays at once, and five explained
 * options per bay is three screens of scrolling to lay out one box. The bay's
 * own inspector — where there is one bay and room to say what each option is —
 * gets the explained version.
 */
export function BayFront({
  bay,
  patch,
  compact = false,
}: {
  bay: BaySpec;
  patch: (fn: (b: BaySpec) => void) => void;
  compact?: boolean;
}) {
  const onChange = (v: Fronting): void =>
    patch((b) => {
      if (v === 'drawers') {
        b.drawerFrontHeights = [...NEW_STACK];
      } else {
        // A bay is doors or drawers; leaving the stack behind would mean a
        // door choice that changes nothing on screen.
        b.drawerFrontHeights = [];
        b.doors = v;
      }
    });

  const param = 'cabinets[].carcasses[].bays[].doors';
  return compact ? (
    <SelectField
      label="Front"
      value={frontingOf(bay)}
      param={param}
      options={FRONTS}
      onChange={onChange}
    />
  ) : (
    <ChoiceField
      label="Front"
      value={frontingOf(bay)}
      param={param}
      options={FRONTS}
      onChange={onChange}
    />
  );
}

const INSIDES: Array<{ value: ShelfMode; label: string; about?: string }> = [
  { value: 'none', label: 'Empty' },
  { value: 'fixed', label: 'Fixed shelves', about: 'Housed in a dado each side' },
  { value: 'adjustable', label: 'Adjustable', about: 'On pins, in a bored ladder' },
];

export function BayInside({
  bay,
  patch,
  compact = false,
}: {
  bay: BaySpec;
  patch: (fn: (b: BaySpec) => void) => void;
  compact?: boolean;
}) {
  if (bay.drawerFrontHeights.length > 0) return null;
  const onChange = (v: ShelfMode): void => patch((b) => void (b.shelves = v));
  const param = 'cabinets[].carcasses[].bays[].shelves';
  return (
    <>
      {compact ? (
        <SelectField
          label="Inside"
          value={bay.shelves}
          param={param}
          options={INSIDES}
          onChange={onChange}
        />
      ) : (
        <ChoiceField
          label="Inside"
          value={bay.shelves}
          param={param}
          options={INSIDES}
          onChange={onChange}
        />
      )}
      {bay.shelves === 'fixed' && (
        <NumberField
          label="How many"
          value={bay.shelfCount}
          suffix=""
          min={0}
          max={20}
          param="cabinets[].carcasses[].bays[].shelfCount"
          onChange={(v) => patch((b) => void (b.shelfCount = Math.max(0, Math.round(v))))}
        />
      )}
    </>
  );
}

/**
 * The drawer stack, with what it is actually being cut to underneath.
 *
 * Front heights that do not add up to the opening are split evenly by the
 * pipeline, so the numbers typed here and the numbers on the sheet can differ.
 * Showing the cut heights is the difference between a stack you can trust and
 * one you find out about at the machine.
 */
export function DrawerStack({
  bay,
  bayIndex,
  carcass,
  cabinetId,
  patch,
}: {
  bay: BaySpec;
  bayIndex: number;
  carcass: Carcass;
  cabinetId: string;
  patch: (fn: (b: BaySpec) => void) => void;
}) {
  const parts = useStore((s) => s.project.parts);
  const doors = useStore((s) => s.params.doors);
  const heights = bay.drawerFrontHeights;
  if (heights.length === 0) return null;

  // What the pipeline gave each drawer, back out of the face it cut: the face
  // is the slice less the reveal (or twice the inset gap), so comparing faces
  // with the numbers typed here would report every overlay stack as wrong.
  const cut = drawerFaceHeights(parts, cabinetId, carcass.id, bayIndex);
  const trim = doors.fit === 'overlay' ? doors.reveal : 2 * doors.insetGap;
  const allocated = cut.map((h) => h + trim);

  return (
    <Reveal className="drawer-list" param="cabinets[].carcasses[].bays[].drawerFrontHeights">
      {heights.map((h, k) => (
        <NumberField
          key={k}
          label={`Drawer ${k + 1}`}
          value={h}
          min={20}
          onChange={(v) =>
            patch((b) => {
              b.drawerFrontHeights = b.drawerFrontHeights.map((x, j) => (j === k ? v : x));
            })
          }
        />
      ))}
      <div className="row">
        <button
          onClick={() =>
            patch((b) => {
              b.drawerFrontHeights = [...b.drawerFrontHeights, 200];
            })
          }
        >
          Add a drawer
        </button>
        <button
          disabled={heights.length <= 1}
          title={
            heights.length <= 1
              ? 'A stack needs at least one drawer; choose another front instead.'
              : 'Remove the bottom drawer'
          }
          onClick={() =>
            patch((b) => {
              b.drawerFrontHeights = b.drawerFrontHeights.slice(0, -1);
            })
          }
        >
          Remove one
        </button>
      </div>
      {cut.length > 0 && (
        <Hint>
          {sameish(allocated, heights)
            ? `Fronts cut at ${cut.map((h) => h.toFixed(0)).join(' · ')} mm.`
            : `Split evenly to fill the ${sum(allocated).toFixed(0)} mm opening: the fronts come out at ${cut
                .map((h) => h.toFixed(0))
                .join(' · ')} mm. Heights that add up to that are used as given.`}
        </Hint>
      )}
    </Reveal>
  );
}

/** The visible face heights this bay's drawers are actually being cut to. */
function drawerFaceHeights(
  parts: Part[],
  cabinetId: string,
  carcassId: string,
  bayIndex: number,
): number[] {
  const prefix = `${cabinetId}-${carcassId}-DRAWER-${bayIndex + 1}-`;
  return parts
    .filter((p) => p.role === 'drawer-face' && p.id.startsWith(prefix))
    .map((p) => p.box.max.z - p.box.min.z);
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Within half a millimetre, which is finer than anything gets cut to. */
const sameish = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) < 0.5);
