import {
  CABINET_TYPES,
  type BackStyle,
  type CabinetType,
  type CarcassFloor,
  type CarcassJoint,
  type ConstructionStyle,
  type DoorFit,
  type EffectKind,
  type NestStrategy,
  type ProjectParams,
  type ReliefStyle,
  type ShelfMode,
  type TopStyle,
} from '@cabgen/core';
import { stackOn } from './samples';
import type { View } from './render';

/**
 * Every choice with a visible consequence, as a question and a set of
 * pictures.
 *
 * Two rules hold this file together.
 *
 * **The gallery is titled with the question, not the field.** "How should the
 * boxes go together?" reads to somebody who does not yet know the answer;
 * "Carcass joint" only reads to somebody who does.
 *
 * **`about` is the trade-off, never the label again.** R-16 measured switching
 * from a stopped dado to tab and slot as changing *nothing on screen* — same
 * badge, same 21 parts, same 4 sheets. The cost of a construction choice is
 * invisible in this tool, so this line is not decoration around the picture,
 * it is the only place the consequence is stated at all.
 */

export interface GalleryOption<T extends string> {
  value: T;
  label: string;
  about: string;
  /**
   * Shapes the sample this option is drawn on. Left off, the option is words
   * only — for a choice whose consequence is genuinely not a shape.
   */
  apply?: (p: ProjectParams) => void;
}

export interface Gallery<T extends string> {
  id: string;
  question: string;
  view: View;
  /** Shapes the sample every option in this gallery shares. */
  seed?: (p: ProjectParams) => void;
  options: Array<GalleryOption<T>>;
}

const carcass = (p: ProjectParams) => p.cabinets[0]!.carcasses[0]!;
const bay = (p: ProjectParams) => carcass(p).bays[0]!;

// ------------------------------------------------------------------ joinery

export const CARCASS_JOINT: Gallery<CarcassJoint> = {
  id: 'carcass-joint',
  question: 'How should the boxes go together?',
  // From outside, which is where the difference actually lands: a stopped dado
  // shows nothing and tab and slot shows the tab ends through the side panel.
  // A section would teach the dado better and the tab worse; this way each
  // picture is of the thing its own trade-off line names.
  view: { kind: 'iso', azimuth: 34, elevation: 20 },
  options: [
    {
      value: 'dado',
      label: 'Stopped dado',
      about: 'Nothing shows on the outside. Needs screws and glue, and clamps while it sets.',
      apply: (p) => void (p.joinery.carcassJoint = 'dado'),
    },
    {
      value: 'tabslot',
      label: 'Tab and slot',
      about: 'Knocks together with no screws. The tabs show on the outside face.',
      apply: (p) => void (p.joinery.carcassJoint = 'tabslot'),
    },
  ],
};

export const RELIEF: Gallery<ReliefStyle> = {
  id: 'relief',
  question: 'What should the cutter leave in a square inside corner?',
  // Close in on the corner of a slot in a side panel: relief is a few
  // millimetres across and invisible at any scale that fits a cabinet in.
  // Drawn on a tab-and-slot sample whatever the project uses, because that is
  // the only work in this generator with a square corner to relieve — see the
  // note the joinery section carries when the project is dado-jointed.
  seed: (p) => void (p.joinery.carcassJoint = 'tabslot'),
  view: { kind: 'detail', pick: (part) => part.role === 'side', window: 26 },
  options: [
    {
      value: 'dogbone',
      label: 'Dogbone',
      about: 'A round bite on the diagonal. Least material removed; the bite shows in the corner.',
      apply: (p) => void (p.joinery.reliefStyle = 'dogbone'),
    },
    {
      value: 'tbone',
      label: 'T-bone',
      about: 'The bite goes into one side instead, so a mating tongue hides it.',
      apply: (p) => void (p.joinery.reliefStyle = 'tbone'),
    },
    {
      value: 'none',
      label: 'None',
      about:
        'A clean corner on the drawing, and a joint that will not close: the cutter cannot cut it square.',
      apply: (p) => void (p.joinery.reliefStyle = 'none'),
    },
  ],
};

// ------------------------------------------------------------------- panels

export const TOP_STYLE: Gallery<TopStyle> = {
  id: 'top-style',
  question: 'How should the top meet the sides?',
  view: { kind: 'section', axis: 'y', crop: { at: 'top-left', size: 0.5 } },
  options: [
    {
      value: 'capped',
      label: 'Capped over the sides',
      about: 'One unbroken surface from above. The sides carry the load through their end grain.',
      apply: (p) => void (carcass(p).topStyle = 'capped'),
    },
    {
      value: 'inset',
      label: 'Inset between the sides',
      about: 'The sides run right to the top, so their edges show alongside it.',
      apply: (p) => void (carcass(p).topStyle = 'inset'),
    },
  ],
};

export const BACK_STYLE: Gallery<BackStyle> = {
  id: 'back-style',
  question: 'How should the back go in?',
  // Looking down on the rear corner: the shoulder a groove leaves behind the
  // back is the whole difference, and it is behind the panel from outside.
  view: { kind: 'section', axis: 'z', crop: { at: 'top-left', size: 0.5 } },
  options: [
    {
      value: 'groove',
      label: 'In a groove',
      about:
        'Captured on all four edges and hidden behind a shoulder. Squares the box up on its own.',
      apply: (p) => void (carcass(p).back.style = 'groove'),
    },
    {
      value: 'rabbet',
      label: 'In a rabbet',
      about:
        'Opens onto the rear edge, so the back and the sides scribe to a bowed wall in one pass.',
      apply: (p) => void (carcass(p).back.style = 'rabbet'),
    },
    {
      value: 'none',
      label: 'None',
      about: 'One less panel, and nothing holding the box square but the joints.',
      apply: (p) => void (carcass(p).back.style = 'none'),
    },
  ],
};

export const FLOOR: Gallery<CarcassFloor> = {
  id: 'floor',
  question: 'Where does this box get its floor?',
  seed: stackOn,
  view: { kind: 'section', axis: 'y', crop: { at: 'left', size: 0.55 } },
  options: [
    {
      value: 'own',
      label: 'Its own panel',
      about: 'A bottom of its own. Two panels meet at the joint between the boxes.',
      apply: (p) => void (p.cabinets[0]!.carcasses[1]!.floor = 'own'),
    },
    {
      value: 'below',
      label: 'Stands on the box below',
      about:
        'One panel fewer, located in shallow dados — but that panel is then machined on both faces.',
      apply: (p) => void (p.cabinets[0]!.carcasses[1]!.floor = 'below'),
    },
  ],
};

export const CONSTRUCTION: Gallery<ConstructionStyle> = {
  id: 'construction',
  question: 'What is across the front of the box?',
  seed: (p) => void (bay(p).doors = 'left'),
  view: { kind: 'iso', azimuth: 22, elevation: 16 },
  options: [
    {
      value: 'frameless',
      label: 'Frameless',
      about:
        'Nothing but the panel edges. Doors reference the carcass; the full opening is usable.',
      apply: (p) => void (carcass(p).construction = 'frameless'),
    },
    {
      value: 'face-frame',
      label: 'Face frame',
      about:
        'Solid stock across the front: stiffer and forgiving of a wavy carcass, at the cost of the opening.',
      apply: (p) => void (carcass(p).construction = 'face-frame'),
    },
  ],
};

/**
 * The cabinet types, as pictures of the cabinets they actually produce.
 *
 * R-16's audit rated this "Weak — four words in a dropdown". A type is a
 * preset rather than a class (see `model/types-library.ts`), so the honest
 * picture of one is the cabinet its own `build()` makes, run through the
 * pipeline like anything else.
 */
export const CABINET_TYPE: Gallery<CabinetType> = {
  id: 'cabinet-type',
  question: 'What kind of cabinet?',
  view: { kind: 'iso', azimuth: 28, elevation: 18 },
  options: CABINET_TYPES.map((type) => ({
    value: type.id,
    label: type.label,
    about: type.description,
    apply: (p: ProjectParams) => {
      p.cabinets = [{ ...type.build(), id: 'S' }];
    },
  })),
};

// -------------------------------------------------------------------- bays

/** What fronts a bay, as one choice: a bay is doors or drawers, never both. */
export type Fronting = 'none' | 'left' | 'right' | 'double' | 'drawers';

export const BAY_FRONT: Gallery<Fronting> = {
  id: 'bay-front',
  question: 'What goes across this bay?',
  view: { kind: 'iso', azimuth: 26, elevation: 18 },
  options: [
    {
      value: 'none',
      label: 'Open',
      about: 'Nothing across the front. Everything inside is on show.',
      apply: () => {},
    },
    {
      value: 'left',
      label: 'Door, hinged left',
      about: 'Opens to the right. Swings into whatever is on that side.',
      apply: (p) => void (bay(p).doors = 'left'),
    },
    {
      value: 'right',
      label: 'Door, hinged right',
      about: 'Opens to the left, for a cabinet at the end of a run or beside a wall.',
      apply: (p) => void (bay(p).doors = 'right'),
    },
    {
      value: 'double',
      label: 'Pair of doors',
      about: 'Half the swing each, twice the hinges, and a joint down the middle to keep straight.',
      apply: (p) => void (bay(p).doors = 'double'),
    },
    {
      value: 'drawers',
      label: 'Drawers',
      about:
        'A bank of three to start with. Boxes, slides and fronts — the most parts of any choice here.',
      apply: (p) => void (bay(p).drawerFrontHeights = [110, 110, 110]),
    },
  ],
};

export const BAY_INSIDE: Gallery<ShelfMode> = {
  id: 'bay-inside',
  question: 'What is inside this bay?',
  view: { kind: 'section', axis: 'y' },
  options: [
    {
      value: 'none',
      label: 'Empty',
      about: 'Nothing to machine and nothing in the way.',
      apply: () => {},
    },
    {
      value: 'fixed',
      label: 'Fixed shelves',
      about:
        'Housed in a dado each side, so they stiffen the box. Set once, at the height you choose.',
      apply: (p) => {
        bay(p).shelves = 'fixed';
        bay(p).shelfCount = 1;
      },
    },
    {
      value: 'adjustable',
      label: 'Adjustable',
      about:
        'A bored ladder each side and a loose shelf. Moves later; the holes are there for good.',
      apply: (p) => void (bay(p).shelves = 'adjustable'),
    },
  ],
};

export const DOOR_FIT: Gallery<DoorFit> = {
  id: 'door-fit',
  question: 'How should the fronts sit on the box?',
  seed: (p) => void (bay(p).doors = 'left'),
  // Looking down on the front corner: overlay lands the door in front of the
  // side, inset lands it between the sides. Neither reads from the front.
  view: { kind: 'section', axis: 'z', crop: { at: 'bottom-left', size: 0.3 } },
  options: [
    {
      value: 'overlay',
      label: 'Overlay, in front',
      about:
        'Covers the carcass edges, so a wide panel hides an untidy one. Forgiving of a box out of square.',
      apply: (p) => void (p.doors.fit = 'overlay'),
    },
    {
      value: 'inset',
      label: 'Inset, flush in the opening',
      about:
        'Flush with the front, and every gap on show. The box has to be square and stay square.',
      apply: (p) => void (p.doors.fit = 'inset'),
    },
  ],
};

// ---------------------------------------------------------------- surfaces

export const EFFECT_KIND: Gallery<EffectKind> = {
  id: 'effect-kind',
  question: 'What should be cut into the face?',
  seed: (p) => void (bay(p).doors = 'left'),
  view: { kind: 'detail', pick: (part) => part.role === 'door' },
  options: [
    {
      value: 'grooves',
      label: 'Grooves',
      about: 'Beadboard, panelling or fluting: parallel cuts across the visible part of the face.',
      apply: (p) => {
        p.surfaceEffects = [
          {
            id: 'fx',
            enabled: true,
            target: { select: 'role', role: 'door' },
            face: 'outside',
            effect: {
              kind: 'grooves',
              direction: 'vertical',
              spacing: 45,
              width: Math.max(4, p.tool.diameter),
              depth: 3,
              margin: 0,
              fit: 'even',
            },
          },
        ];
      },
    },
    {
      value: 'frame',
      label: 'Frame line',
      about: 'One rectangle inset from the edges, for a shaker front without making a real frame.',
      apply: (p) => {
        p.surfaceEffects = [
          {
            id: 'fx',
            enabled: true,
            target: { select: 'role', role: 'door' },
            face: 'outside',
            effect: { kind: 'frame', margin: 50, width: Math.max(6, p.tool.diameter), depth: 4 },
          },
        ];
      },
    },
  ],
};

// ---------------------------------------------------------------- workshop

/**
 * The text-only case, and the reason it is text.
 *
 * A nesting strategy has no shape of its own: what it produces is a packing of
 * *your* parts onto *your* sheets, so a thumbnail would be a picture of one
 * particular project rather than of the choice. R-18 asks for a fallback for
 * exactly this, and a rendered sheet here would be the drift it exists to
 * prevent.
 */
export const NEST_STRATEGY: Gallery<NestStrategy> = {
  id: 'nest-strategy',
  question: 'What should the nesting optimise for?',
  view: { kind: 'iso' },
  options: [
    {
      value: 'tiling',
      label: 'Fewest setups',
      about: 'No part crosses a tile seam unless it is bigger than the machine. Costs some yield.',
    },
    {
      value: 'material',
      label: 'Least material',
      about: 'Tightest packing. Parts will land across tile seams and need re-registering.',
    },
    {
      value: 'guillotine',
      label: 'Guillotine (panel saw)',
      about: 'Every part freed by straight cuts across the full sheet. For a saw, not a router.',
    },
  ],
};
