import type { ProjectParams } from '@cabgen/core';
import { RUN, type Selection } from './selection';

/**
 * Where a parameter lives now that the sidebar is gone.
 *
 * On the bench a parameter belongs to *the thing it is about*, so reaching it
 * means selecting that thing; in the workshop it belongs to a section of the
 * settings drawer.
 */
export type Where =
  | { surface: 'bench'; on: 'run' | 'cabinet' | 'carcass' | 'bay' | 'part'; section: string }
  | { surface: 'workshop'; section: string };

export interface CatalogEntry {
  /**
   * Dotted path into `ProjectParams`, with `[]` for an array index. This is
   * what `catalog.test.ts` walks the real parameters against, so a parameter
   * that loses its control cannot pass unnoticed.
   */
  path: string;
  /** True when this entry stands for everything beneath its path. */
  covers?: boolean;
  label: string;
  /** What it decides, in one sentence. Shown under the name when you search. */
  about: string;
  /**
   * The words a woodworker would type. The field's own label is matched
   * anyway, so these are the ones that are *not* on screen: the trade's names
   * for the same thing, and the names other software gives it.
   */
  words: string[];
  where: Where;
}

const bench = (on: 'run' | 'cabinet' | 'carcass' | 'bay' | 'part', section: string): Where => ({
  surface: 'bench',
  on,
  section,
});
const workshop = (section: string): Where => ({ surface: 'workshop', section });

/**
 * Every parameter the app can reach, and where.
 *
 * This is the inventory R-17 promised not to shrink: 129 controls on the
 * default project, 243 with every branch switched on, plus the eight docs/UX.md
 * found with no control at all. Adding a parameter to the model without adding
 * it here fails the catalogue test rather than quietly disappearing.
 */
export const CATALOG: CatalogEntry[] = [
  // ---------------------------------------------------------------- project
  {
    path: 'name',
    label: 'Project name',
    about: 'What this design is called, and the stem of every exported file name.',
    words: ['title', 'job', 'file name'],
    where: bench('run', 'project'),
  },
  {
    path: 'labelParts',
    label: 'Engrave part labels',
    about:
      "Writes each part's ID onto the LABEL layer, so a blank off the machine says what it is.",
    words: ['engrave', 'marking', 'label layer', 'part numbers'],
    where: bench('run', 'project'),
  },

  // ---------------------------------------------------------------- the room
  {
    path: 'opening.enabled',
    label: 'Fit to a measured opening',
    about:
      'Fits the run to a real room. The carcasses stay square; scribe strips take up the difference.',
    words: ['room', 'alcove', 'recess', 'wall to wall', 'opening', 'crooked'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.widthAtTop',
    label: 'Width at the top',
    about: 'Clear width between the walls, level with the top of the run.',
    words: ['room width', 'span', 'wall to wall'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.widthAtBottom',
    label: 'Width at the floor',
    about: 'The same width down at the floor. A leaning wall makes the two differ.',
    words: ['room width', 'floor width', 'lean', 'plumb'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.heightAtLeft',
    label: 'Height at the left',
    about: 'Floor to whatever stops the run, at the left-hand end.',
    words: ['ceiling', 'soffit', 'headroom'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.heightAtRight',
    label: 'Height at the right',
    about: 'The same height at the right-hand end. A difference is read as a sloping floor.',
    words: ['ceiling', 'soffit', 'headroom', 'sloping floor'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.left',
    label: 'Left end of the run',
    about: 'Whether the left end finishes against a wall or stops in the open.',
    words: ['return wall', 'open end'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.right',
    label: 'Right end of the run',
    about: 'Whether the right end finishes against a wall or stops in the open.',
    words: ['return wall', 'open end'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.cornerAngleLeft',
    label: 'Left corner',
    about: 'Measured off three tape readings, never typed: the fillers get cut to this angle.',
    words: ['corner', 'angle', 'square', 'out of square', 'three four five'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.cornerAngleRight',
    label: 'Right corner',
    about: 'Measured off three tape readings, never typed: the fillers get cut to this angle.',
    words: ['corner', 'angle', 'square', 'out of square', 'three four five'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.cornerTriangleLeft',
    covers: true,
    label: 'Left corner, as measured',
    about: 'The three tape readings the left corner angle is worked out from.',
    words: ['triangle', 'diagonal', 'three four five', 'measure corner'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.cornerTriangleRight',
    covers: true,
    label: 'Right corner, as measured',
    about: 'The three tape readings the right corner angle is worked out from.',
    words: ['triangle', 'diagonal', 'three four five', 'measure corner'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.wallBow',
    label: 'Wall bow',
    about: 'Worst gap under a straightedge held against the wall. The scribe has to cover it.',
    words: ['bellied', 'bowed wall', 'straightedge', 'flatness'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.scribe.width',
    label: 'Scribe allowance',
    about: 'Material left on the outer edge to plane back to the plaster.',
    words: ['scribe', 'filler', 'planing allowance', 'packer'],
    where: bench('run', 'room'),
  },
  {
    path: 'opening.scribe.materialId',
    label: 'Scribe material',
    about: 'Which sheet the scribe strips and fillers are cut from.',
    words: ['scribe', 'filler', 'packer'],
    where: bench('run', 'room'),
  },

  // ------------------------------------------------------------- the cabinet
  {
    path: 'cabinets[].name',
    label: 'Cabinet name',
    about: 'What this unit is called on screen and in the cut list.',
    words: ['unit', 'box', 'cabinet'],
    where: bench('cabinet', 'cabinet'),
  },
  {
    path: 'cabinets[].id',
    label: 'Cabinet order along the run',
    about: 'Cabinets stand in list order, so moving one up the list moves it left along the wall.',
    words: ['reorder', 'move', 'position', 'left', 'right', 'add cabinet', 'remove cabinet'],
    where: bench('cabinet', 'cabinet'),
  },
  {
    path: 'cabinets[].carcasses[].id',
    label: 'Carcass in the stack',
    about: 'Carcasses stand on each other from the floor up. Add and remove them here.',
    words: ['stack', 'box', 'upper', 'base', 'add carcass', 'remove carcass'],
    where: bench('carcass', 'carcass'),
  },
  {
    path: 'cabinets[].carcasses[].name',
    label: 'Carcass name',
    about: 'What this box is called on screen and on its part labels.',
    words: ['box', 'carcase', 'upper', 'base'],
    where: bench('carcass', 'carcass'),
  },
  {
    path: 'cabinets[].carcasses[].width',
    label: 'Width',
    about: 'Outside width of the box, across the front.',
    words: ['size', 'wide'],
    where: bench('carcass', 'size'),
  },
  {
    path: 'cabinets[].carcasses[].height',
    label: 'Height',
    about: 'Outside height of the box, floor to top.',
    words: ['size', 'tall'],
    where: bench('carcass', 'size'),
  },
  {
    path: 'cabinets[].carcasses[].depth',
    label: 'Depth',
    about: 'Front to back. A shallower box on top steps back at the front.',
    words: ['size', 'deep', 'front to back'],
    where: bench('carcass', 'size'),
  },
  {
    path: 'cabinets[].carcasses[].linkWidthToBelow',
    label: 'Match the width below',
    about: 'Keeps a stack flush down its sides when the box on the floor is resized.',
    words: ['flush', 'align', 'stack', 'same width'],
    where: bench('carcass', 'size'),
  },
  {
    path: 'cabinets[].carcasses[].topStyle',
    label: 'Top panel',
    about:
      'Capped lays the top over the side edges so the surface reads as one panel. Inset sets it between them.',
    words: ['worktop', 'lid', 'capped', 'inset', 'over the sides'],
    where: bench('carcass', 'panels'),
  },
  {
    path: 'cabinets[].carcasses[].floor',
    label: 'Bottom panel',
    about: 'A stacked box can have its own bottom, or stand in shallow dados in the top below it.',
    words: ['bottom', 'floor', 'bottomless', 'stands on'],
    where: bench('carcass', 'panels'),
  },
  {
    path: 'cabinets[].carcasses[].back.style',
    label: 'Back panel',
    about:
      'A groove hides the back behind a shoulder. A rabbet opens onto the rear edge so back and sides scribe flush in one pass.',
    words: ['rebate', 'rabbet', 'groove', 'back', 'no back'],
    where: bench('carcass', 'panels'),
  },
  {
    path: 'cabinets[].carcasses[].back.inset',
    label: 'Back inset',
    about: 'How far the back sits in from the rear edge, leaving room to scribe to the wall.',
    words: ['rebate depth', 'setback', 'back'],
    where: bench('carcass', 'panels'),
  },
  {
    path: 'cabinets[].carcasses[].back.materialId',
    label: 'Back material',
    about: 'Which sheet this carcass’s back panel is cut from.',
    words: ['back', 'ply', 'thin sheet', 'hardboard'],
    where: bench('carcass', 'panels'),
  },
  {
    path: 'cabinets[].carcasses[].dividerCount',
    label: 'Bays',
    about: 'How many openings across the front. Each divider between them is a full-depth panel.',
    words: ['divider', 'partition', 'mullion', 'openings', 'compartments'],
    where: bench('carcass', 'bays'),
  },
  {
    path: 'cabinets[].carcasses[].bayWidths',
    covers: true,
    label: 'Unequal bay widths',
    about: 'Clear opening of each bay. Left empty, the interior is split evenly.',
    words: ['bay width', 'uneven', 'unequal', 'opening width'],
    where: bench('carcass', 'bays'),
  },
  {
    path: 'cabinets[].carcasses[].construction',
    label: 'Construction',
    about:
      'A face frame stands solid stock across the front, and doors then reference the frame’s opening.',
    words: ['face frame', 'frameless', 'euro', 'american', 'stiles'],
    where: bench('carcass', 'frame'),
  },
  {
    path: 'cabinets[].carcasses[].faceFrame.materialId',
    label: 'Frame stock',
    about: 'Which board the stiles and rails are milled from.',
    words: ['face frame', 'hardwood', 'solid'],
    where: bench('carcass', 'frame'),
  },
  {
    path: 'cabinets[].carcasses[].faceFrame.stileWidth',
    label: 'Stile width',
    about: 'Outer stiles and every mid-stile are milled to this width.',
    words: ['face frame', 'upright', 'vertical'],
    where: bench('carcass', 'frame'),
  },
  {
    path: 'cabinets[].carcasses[].faceFrame.railWidth',
    label: 'Rail width',
    about: 'Top and bottom rails, milled to this width.',
    words: ['face frame', 'horizontal', 'cross member'],
    where: bench('carcass', 'frame'),
  },
  {
    path: 'cabinets[].carcasses[].faceFrame.overlay',
    label: 'Door overlay onto the frame',
    about: 'How far an overlay door reaches onto the surrounding frame member.',
    words: ['partial overlay', 'reveal', 'face frame'],
    where: bench('carcass', 'frame'),
  },
  {
    path: 'cabinets[].carcasses[].toeKick.enabled',
    label: 'Toe kick',
    about: 'Cuts the recess straight out of the side panels, with a rail across the front.',
    words: ['kickboard', 'plinth', 'toe space', 'kicker'],
    where: bench('carcass', 'toekick'),
  },
  {
    path: 'cabinets[].carcasses[].toeKick.height',
    label: 'Toe kick height',
    about: 'How far up from the floor the recess reaches.',
    words: ['kickboard', 'plinth'],
    where: bench('carcass', 'toekick'),
  },
  {
    path: 'cabinets[].carcasses[].toeKick.setback',
    label: 'Toe kick setback',
    about: 'How far the toe kick face is recessed from the front of the carcass.',
    words: ['kickboard', 'plinth', 'recess'],
    where: bench('carcass', 'toekick'),
  },
  {
    path: 'cabinets[].carcasses[].hangingRail.enabled',
    label: 'Hanging rail',
    about: 'A solid rail behind the top to screw a wall cabinet to the wall through.',
    words: ['french cleat', 'wall fixing', 'mounting rail', 'hanging strip'],
    where: bench('carcass', 'hanging'),
  },
  {
    path: 'cabinets[].carcasses[].hangingRail.height',
    label: 'Hanging rail height',
    about: 'Solid material top to bottom; guides rip these to about 100 mm.',
    words: ['wall fixing', 'mounting rail'],
    where: bench('carcass', 'hanging'),
  },
  {
    path: 'cabinets[].carcasses[].hangingRail.screwDiameter',
    label: 'Wall screw clearance',
    about: 'Sized to clear the screw’s shank, not grip it.',
    words: ['wall fixing', 'screw hole'],
    where: bench('carcass', 'hanging'),
  },
  {
    path: 'cabinets[].carcasses[].hangingRail.screwSpacing',
    label: 'Wall screw spacing',
    about: 'Kept under one stud spacing so the rail always lands on at least two.',
    words: ['wall fixing', 'studs', 'noggin'],
    where: bench('carcass', 'hanging'),
  },

  // ------------------------------------------------------------------- bays
  {
    path: 'cabinets[].carcasses[].bays[].shelves',
    label: 'Shelves',
    about: 'Open, fixed in dados, or adjustable on pins.',
    words: ['shelf', 'adjustable', 'fixed', 'pins', 'shelving'],
    where: bench('bay', 'inside'),
  },
  {
    path: 'cabinets[].carcasses[].bays[].shelfCount',
    label: 'Number of fixed shelves',
    about: 'Spaced evenly up the bay, each housed in a dado both sides.',
    words: ['shelf', 'how many'],
    where: bench('bay', 'inside'),
  },
  {
    path: 'cabinets[].carcasses[].bays[].shelfGaps',
    covers: true,
    label: 'Shelf heights',
    about: 'Clear height under each fixed shelf. Left empty, they are spaced evenly.',
    words: ['shelf height', 'shelf spacing', 'uneven shelves', 'gap', 'headroom'],
    where: bench('bay', 'inside'),
  },
  {
    path: 'cabinets[].carcasses[].bays[].doors',
    label: 'Door',
    about: 'Open, a single door hinged left or right, or a pair.',
    words: ['door', 'hinged', 'pair', 'double', 'front'],
    where: bench('bay', 'front'),
  },
  {
    path: 'cabinets[].carcasses[].bays[].drawerFrontHeights',
    covers: true,
    label: 'Drawers',
    about: 'A stack of drawers fronting this bay instead of doors and shelves.',
    words: ['drawer', 'bank of drawers', 'runners', 'slides'],
    where: bench('bay', 'front'),
  },
  {
    path: 'joinery.shelfPin.frontOffset',
    label: 'Pin row from the front',
    about: 'Where the front ladder of shelf-pin holes runs; 37 mm is the 32 mm system standard.',
    words: ['shelf pin', 'system 32', 'line boring', 'holes'],
    where: bench('bay', 'inside'),
  },
  {
    path: 'joinery.shelfPin.backOffset',
    label: 'Pin row from the back',
    about: 'Where the back ladder of shelf-pin holes runs.',
    words: ['shelf pin', 'system 32', 'line boring', 'holes'],
    where: bench('bay', 'inside'),
  },
  {
    path: 'joinery.shelfPin.startAbove',
    label: 'Pin ladder starts above',
    about: 'How far up from the bottom of the bay the first hole is bored.',
    words: ['shelf pin', 'ladder', 'first hole', 'system 32'],
    where: bench('bay', 'inside'),
  },
  {
    path: 'joinery.shelfPin.endBelow',
    label: 'Pin ladder stops below',
    about: 'How far down from the top of the bay the last hole is bored.',
    words: ['shelf pin', 'ladder', 'last hole', 'system 32'],
    where: bench('bay', 'inside'),
  },
  {
    path: 'doors.fit',
    label: 'Door fit',
    about: 'Overlay sits in front of the carcass; inset sits flush in the opening.',
    words: ['overlay', 'inset', 'flush', 'proud', 'lay on'],
    where: bench('bay', 'front'),
  },
  {
    path: 'doors.reveal',
    label: 'Door reveal',
    about: 'Gap between neighbouring doors, and around the outside of an overlay run.',
    words: ['gap', 'shadow line', 'margin', 'overlay'],
    where: bench('bay', 'front'),
  },
  {
    path: 'doors.insetGap',
    label: 'Inset clearance',
    about: 'Clearance all round an inset door so it swings without binding.',
    words: ['gap', 'clearance', 'inset', 'flush'],
    where: bench('bay', 'front'),
  },
  {
    path: 'doors.materialId',
    label: 'Door material',
    about: 'Which sheet the doors and drawer faces are cut from.',
    words: ['door', 'front', 'faced ply', 'mdf'],
    where: bench('bay', 'front'),
  },

  // --------------------------------------------------------------- joinery
  {
    path: 'joinery.carcassJoint',
    label: 'How the boxes go together',
    about:
      'A stopped dado glued and screwed, or tab and slot, which needs no screws and shows on the outside.',
    words: ['joint', 'dado', 'housing', 'tab and slot', 'knock down', 'flat pack', 'no screws'],
    where: bench('carcass', 'joinery'),
  },
  {
    path: 'joinery.reliefStyle',
    label: 'Corner relief',
    about: 'Without relief, the cutter’s radius leaves material where a square corner has to sit.',
    words: ['dogbone', 't-bone', 'corner', 'radius', 'overcut'],
    where: bench('carcass', 'joinery'),
  },
  {
    path: 'joinery.fitClearance',
    label: 'Fit clearance',
    about: 'Added to every groove and slot width. Raise it if joints are too tight.',
    words: ['tolerance', 'slop', 'tight', 'loose', 'allowance'],
    where: bench('carcass', 'joinery'),
  },
  {
    path: 'joinery.dadoDepth',
    label: 'Dado depth',
    about: 'How deep a groove is cut into the panel receiving it.',
    words: ['housing', 'groove', 'trench', 'depth'],
    where: bench('carcass', 'joinery'),
  },
  {
    path: 'joinery.dadoStopFront',
    label: 'Dado stop from the front',
    about:
      'Holds the groove back from the front edge so the joint does not show. Zero cuts through.',
    words: ['stopped housing', 'blind dado', 'groove', 'hidden joint'],
    where: bench('carcass', 'joinery'),
  },
  {
    path: 'joinery.screwHoles',
    label: 'Screw holes',
    about:
      'Drills clearance holes on every groove’s centreline, so there is nothing to mark out at assembly.',
    words: ['screws', 'pilot', 'fixings', 'clearance'],
    where: bench('carcass', 'joinery'),
  },
  {
    path: 'joinery.screwSpacing',
    label: 'Screw spacing',
    about: 'Centre to centre along each joint.',
    words: ['screws', 'pitch', 'fixings'],
    where: bench('carcass', 'joinery'),
  },
  {
    path: 'joinery.screwClearanceDiameter',
    label: 'Screw clearance hole',
    about:
      'Must pass the screw threads freely. Sized to grip instead, the screw jacks the joint apart.',
    words: ['screws', 'clearance', 'shank', 'fixings'],
    where: bench('carcass', 'joinery'),
  },
  {
    path: 'joinery.tabWidth',
    label: 'Tab width',
    about: 'Target width of a single tab in a tab-and-slot joint.',
    words: ['tab and slot', 'knock down', 'finger joint', 'comb'],
    where: bench('carcass', 'joinery'),
  },
  {
    path: 'joinery.tabMinCount',
    label: 'Minimum tabs',
    about: 'Fewest tabs a joint is allowed, however short it is.',
    words: ['tab and slot', 'knock down', 'finger joint'],
    where: bench('carcass', 'joinery'),
  },
  {
    path: 'joinery.stackDadoDepth',
    label: 'Locating dado for a stacked box',
    about: 'Kept shallow: the panel below is grooved on its underside too, and the two sets cross.',
    words: ['stack', 'locating', 'shallow groove', 'bottomless'],
    where: bench('carcass', 'panels'),
  },

  // -------------------------------------------------- banding and effects
  {
    path: 'edgeBanding[].edges',
    covers: true,
    label: 'Banded edges',
    about:
      'Which edges of this kind of part get tape. The blank is cut short so the tape brings it back to size.',
    words: ['edge banding', 'edging', 'lipping', 'tape', 'iron on', 'veneer edge'],
    where: bench('part', 'banding'),
  },
  {
    path: 'edgeBanding[].materialId',
    label: 'Which tape',
    about: 'Which roll of edge tape this part’s banded edges are cut for.',
    words: ['edge banding', 'edging', 'lipping', 'tape'],
    where: bench('part', 'banding'),
  },
  {
    path: 'surfaceEffects',
    covers: true,
    label: 'Surface effects',
    about: 'Decorative machining on a chosen face: beadboard grooves, or a shaker frame line.',
    words: [
      'beadboard',
      'panelling',
      'fluting',
      'reeding',
      'shaker',
      'grooves',
      'v groove',
      'decoration',
      'moulding',
    ],
    // Reached from the run, where every effect in the project is listed: a
    // part target needs a panel picked first, and a search does not know
    // which one you meant. A selected panel still offers them in place.
    where: bench('run', 'effects'),
  },

  // -------------------------------------------------------------- workshop
  {
    path: 'materials[].name',
    label: 'Material name',
    about: 'What this sheet good is called on the cut list.',
    words: ['ply', 'plywood', 'mdf', 'sheet', 'board'],
    where: workshop('materials'),
  },
  {
    path: 'materials[].actualThickness',
    label: 'Measured thickness',
    about: 'Measure it. Every groove width comes from this, not the nominal size.',
    words: ['calipers', 'ply', 'sheet', 'undersized', 'real thickness'],
    where: workshop('materials'),
  },
  {
    path: 'materials[].nominalThickness',
    label: 'Nominal thickness',
    about: 'What it says on the label. Never used for geometry, which is the point of measuring.',
    words: ['label', 'nominal', 'sheet'],
    where: workshop('materials'),
  },
  {
    path: 'materials[].hasGrain',
    label: 'Directional grain',
    about: 'Stops the nester turning visible parts against the face grain.',
    words: ['grain', 'veneer', 'figure', 'direction'],
    where: workshop('materials'),
  },
  {
    path: 'materials[].sheets[].length',
    label: 'Sheet length',
    about: 'The long side of a sheet as it is bought.',
    words: ['sheet size', '2440', '8x4', 'panel'],
    where: workshop('materials'),
  },
  {
    path: 'materials[].sheets[].width',
    label: 'Sheet width',
    about:
      'The short side. This is the one that has to clear the machine across the feed direction.',
    words: ['sheet size', '1220', '8x4', 'panel', 'rip'],
    where: workshop('materials'),
  },
  {
    path: 'materials[].sheets[].quantity',
    label: 'Remnant on hand',
    about: 'A part sheet already on the shelf: only as many as you have, nested into first.',
    words: ['offcut', 'remnant', 'drop', 'part sheet', 'stock on hand'],
    where: workshop('materials'),
  },
  {
    path: 'materials[].id',
    label: 'Material, added or removed',
    about: 'Which sheet goods this project can be cut from.',
    words: ['add material', 'remove material', 'sheet good'],
    where: workshop('materials'),
  },
  {
    path: 'carcassMaterialId',
    label: 'Carcasses are cut from',
    about: 'Which sheet the sides, tops, bottoms and dividers come out of.',
    words: ['carcass material', 'box material', 'ply'],
    where: workshop('materials'),
  },
  {
    path: 'shelfMaterialId',
    label: 'Shelves are cut from',
    about: 'Which sheet the shelves come out of.',
    words: ['shelf material', 'ply'],
    where: workshop('materials'),
  },
  {
    path: 'drawerBoxMaterialId',
    label: 'Drawer boxes are cut from',
    about:
      'Which sheet the drawer sides, backs, sub-fronts and bottoms come out of. Undermount slides have a minimum.',
    words: ['drawer material', 'box material', 'slide thickness'],
    where: workshop('materials'),
  },
  {
    path: 'stockMaterials[].name',
    label: 'Solid stock name',
    about: 'What this board is called on the linear cut list.',
    words: ['hardwood', 'timber', 'lumber', 'board'],
    where: workshop('stock'),
  },
  {
    path: 'stockMaterials[].actualThickness',
    label: 'Board thickness',
    about: 'Measure it. Every half lap where a stile crosses a rail is cut to half of this.',
    words: ['hardwood', 'timber', 'lumber', 'face frame'],
    where: workshop('stock'),
  },
  {
    path: 'stockMaterials[].nominalThickness',
    label: 'Nominal board thickness',
    about: 'What the merchant calls it — 3/4 in, 19 mm. Never used for geometry.',
    words: ['hardwood', 'timber', 'four quarter'],
    where: workshop('stock'),
  },
  {
    path: 'stockMaterials[].boardLength',
    label: 'Board length',
    about: 'Standard length a board is bought in, to cut the stiles and rails from.',
    words: ['hardwood', 'timber', 'lumber', 'length'],
    where: workshop('stock'),
  },
  {
    path: 'stockMaterials[].boardWidth',
    label: 'Board width',
    about: 'Width a board is milled to before ripping it down to a stile or rail.',
    words: ['hardwood', 'timber', 'rip width'],
    where: workshop('stock'),
  },
  {
    path: 'stockMaterials[].id',
    label: 'Solid stock, added or removed',
    about: 'Which boards a face frame can be milled from.',
    words: ['add board', 'remove board', 'hardwood'],
    where: workshop('stock'),
  },
  {
    path: 'bandingMaterials[].name',
    label: 'Edge tape name',
    about: 'What this roll of tape is called on the ordering list.',
    words: ['edge banding', 'edging', 'lipping', 'tape'],
    where: workshop('tape'),
  },
  {
    path: 'bandingMaterials[].thickness',
    label: 'Tape thickness',
    about: 'Measure the roll. Every edge banded in it is cut this much short.',
    words: ['edge banding', 'edging', 'lipping', 'tape', 'pvc'],
    where: workshop('tape'),
  },
  {
    path: 'bandingMaterials[].id',
    label: 'Edge tape, added or removed',
    about: 'Which rolls of tape this project can be banded with.',
    words: ['add tape', 'remove tape', 'edging'],
    where: workshop('tape'),
  },
  {
    path: 'tool.diameter',
    label: 'Cutter diameter',
    about: 'Sets relief sizes and the spacing between nested parts.',
    words: ['bit', 'endmill', 'router bit', 'spindle', 'tooling'],
    where: workshop('tooling'),
  },
  {
    path: 'tool.drillDiameter',
    label: 'Drill diameter',
    about: 'The separate bit for shelf-pin rows: 5 mm under the 32 mm system.',
    words: ['bit', 'boring', 'shelf pin', 'drill'],
    where: workshop('tooling'),
  },
  {
    path: 'machine.travelX',
    label: 'X travel',
    about: 'How far the machine reaches along the bed.',
    words: ['bed size', 'work area', 'gantry', 'cnc'],
    where: workshop('machine'),
  },
  {
    path: 'machine.travelY',
    label: 'Y travel',
    about:
      'How far the machine reaches across the bed. A sheet wider than this cannot be cut at all.',
    words: ['bed size', 'work area', 'gantry', 'cnc'],
    where: workshop('machine'),
  },
  {
    path: 'machine.travelZ',
    label: 'Z travel',
    about: 'How far the spindle can drop.',
    words: ['bed size', 'work area', 'spindle', 'cnc'],
    where: workshop('machine'),
  },
  {
    path: 'machine.tilingAxis',
    label: 'Feed-through axis',
    about:
      'The axis the stock slides along between tiles, when a sheet is longer than the machine.',
    words: ['tiling', 'indexing', 'pass through', 'setups'],
    where: workshop('machine'),
  },
  {
    path: 'machine.tileOverlap',
    label: 'Tile overlap',
    about: 'Headroom kept at each end of travel. Nothing is machined twice.',
    words: ['tiling', 'indexing', 'setups', 'margin'],
    where: workshop('machine'),
  },
  {
    path: 'machine.registrationHoleDiameter',
    label: 'Registration hole',
    about: 'The dowel hole that lines the sheet back up after it is fed through.',
    words: ['tiling', 'index pin', 'dowel', 'alignment'],
    where: workshop('machine'),
  },
  {
    path: 'nesting.strategy',
    label: 'Nest for',
    about: 'Fewest setups, least material, or guillotine cuts a panel saw can actually follow.',
    words: ['nesting', 'yield', 'panel saw', 'guillotine', 'setups', 'optimise'],
    where: workshop('nesting'),
  },
  {
    path: 'nesting.sheetMargin',
    label: 'Sheet margin',
    about: 'Unusable border around the sheet, e.g. where the clamps live.',
    words: ['nesting', 'clamps', 'edge margin'],
    where: workshop('nesting'),
  },
  {
    path: 'nesting.partGap',
    label: 'Gap between parts',
    about: 'On top of the cutter diameter, which is always allowed for.',
    words: ['nesting', 'spacing', 'kerf', 'clearance'],
    where: workshop('nesting'),
  },
  {
    path: 'nesting.allowRotation',
    label: 'Allow rotation',
    about: 'Lets the nester turn parts that are not grain-locked.',
    words: ['nesting', 'rotate', 'grain'],
    where: workshop('nesting'),
  },
  {
    path: 'nesting.remnantThreshold',
    label: 'Remnant threshold',
    about: 'How big a leftover has to be before it is worth writing down as a remnant.',
    words: ['nesting', 'offcut', 'drop', 'scrap'],
    where: workshop('nesting'),
  },
  {
    path: 'hardware.hingeId',
    label: 'Hinges',
    about: 'Every cup, dowel and plate hole comes from this catalogue entry.',
    words: ['hinge', 'blum', 'cup', '35mm', 'euro hinge', 'concealed'],
    where: workshop('hardware'),
  },
  {
    path: 'hardware.shelfPinId',
    label: 'Shelf pins',
    about: 'What the pin ladders are bored for: diameter, depth and pitch.',
    words: ['shelf pin', 'stud', 'support', 'system 32'],
    where: workshop('hardware'),
  },
  {
    path: 'hardware.slideId',
    label: 'Drawer slides',
    about: 'Which runner the drawer boxes are sized to.',
    words: ['runner', 'slide', 'undermount', 'blum', 'tandem'],
    where: workshop('hardware'),
  },
  {
    path: 'hardware.handleId',
    label: 'Handles',
    about: 'Which pull the doors and drawer faces are drilled for.',
    words: ['handle', 'pull', 'knob', 'bar handle', 'centres'],
    where: workshop('hardware'),
  },
  {
    path: 'hardware.handlePlacement',
    covers: true,
    label: 'Where the handle sits',
    about: 'Which way a bar handle runs, and how far in from the door’s opening edge and its end.',
    words: ['handle position', 'pull', 'knob', 'centres', 'drilling'],
    where: workshop('hardware'),
  },
  {
    path: 'hardware.custom',
    covers: true,
    label: 'Hardware you described yourself',
    about: 'Copy a catalogue entry and edit it, so a project says exactly what it was cut to.',
    words: ['custom hinge', 'custom slide', 'my hardware', 'copy and edit'],
    where: workshop('hardware'),
  },
];

/**
 * Which parameters deliberately have no control, and why.
 *
 * Kept as data rather than as a silence, because "there is no control for
 * this" and "somebody forgot" look identical from outside.
 */
export const NOT_A_CONTROL: Array<{ path: string; why: string }> = [
  {
    path: 'opening.scribe.standoff',
    why: 'Derived from the wall bow: the gap the carcass has to be held off a bulging wall.',
  },
];

/**
 * Turn `materials[0].sheets[1].width` into the shape a catalogue path is
 * written in.
 *
 * `edgeBanding` is keyed by part role rather than indexed, but it is the same
 * kind of thing — one rule per role, one control per role — so its keys are
 * levelled the same way. Without that, adding a banding rule for a new role
 * would read as a parameter nobody has a control for.
 */
export const normalisePath = (path: string): string =>
  path.replace(/\[\d+\]/g, '[]').replace(/^edgeBanding\.[^.]+/, 'edgeBanding[]');

export interface Match {
  entry: CatalogEntry;
  score: number;
}

/**
 * Compare on the words alone.
 *
 * Nobody agrees on the punctuation: knock-down, knock down and knockdown are
 * one thing, and a search that only matched the spelling written here would
 * miss two of the three.
 */
const loose = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Find by name, over labels, trade words and the sentence that explains each.
 *
 * Ranked so an exact label wins over a word that only appears in the
 * explanation — typing "dado" should land on the joint, not on everything that
 * mentions a groove in passing.
 */
export function search(query: string): Match[] {
  const q = loose(query);
  if (!q) return [];
  const out: Match[] = [];
  for (const entry of CATALOG) {
    const label = loose(entry.label);
    const words = entry.words.map(loose);
    let score = 0;
    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (words.some((w) => w === q)) score = 70;
    else if (label.includes(q)) score = 55;
    else if (words.some((w) => w.startsWith(q))) score = 50;
    else if (words.some((w) => w.includes(q))) score = 35;
    else if (loose(entry.about).includes(q)) score = 20;
    if (score > 0) out.push({ entry, score });
  }
  return out.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));
}

/**
 * The selection that puts a parameter on screen.
 *
 * Whatever is selected already is kept where it can be: someone searching for
 * "depth" while looking at the upper carcass means that one, not the first in
 * the run.
 */
export function selectionFor(
  where: Where,
  params: ProjectParams,
  current: Selection,
): Selection | undefined {
  if (where.surface !== 'bench') return undefined;
  if (where.on === 'run') return RUN;

  const cabinet =
    params.cabinets.find(
      (c) => c.id === (current.kind !== 'run' && current.kind !== 'part' ? current.cabinetId : ''),
    ) ?? params.cabinets[0];
  if (!cabinet) return RUN;
  if (where.on === 'cabinet') return { kind: 'cabinet', cabinetId: cabinet.id };

  const carcass =
    cabinet.carcasses.find(
      (k) =>
        k.id === (current.kind === 'carcass' || current.kind === 'bay' ? current.carcassId : ''),
    ) ?? cabinet.carcasses[0];
  if (!carcass) return { kind: 'cabinet', cabinetId: cabinet.id };
  if (where.on === 'carcass')
    return { kind: 'carcass', cabinetId: cabinet.id, carcassId: carcass.id };

  if (where.on === 'bay') {
    const bay = current.kind === 'bay' ? current.bay : 0;
    return { kind: 'bay', cabinetId: cabinet.id, carcassId: carcass.id, bay };
  }
  // A part has to exist to be selected, and the caller knows which parts there
  // are; leaving it undefined keeps the current selection rather than jumping
  // to an arbitrary panel.
  return undefined;
}
