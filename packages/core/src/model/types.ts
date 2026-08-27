import type { Path } from '../geom/index.js';
import type { ReliefStyle } from '../geom/relief.js';

export type Axis = 'x' | 'y' | 'z';
export type Sign = '+' | '-';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned box in assembly space: X = width, Y = depth (0 at the front), Z = height. */
export interface AABB {
  min: Vec3;
  max: Vec3;
}

export interface Material {
  id: string;
  name: string;
  /** What it says on the label. */
  nominalThickness: number;
  /** What your calipers say. Every joint width is derived from this, not the nominal. */
  actualThickness: number;
  sheetLength: number;
  sheetWidth: number;
  /** Directional face grain, so parts marked grain-locked cannot be rotated when nested. */
  hasGrain: boolean;
}

export interface ToolSpec {
  /** Main profiling/pocketing cutter. */
  diameter: number;
  /** Separate bit for shelf pin rows, 5 mm under the 32 mm system. */
  drillDiameter: number;
}

export interface MachineSpec {
  travelX: number;
  travelY: number;
  travelZ: number;
  /** Which axis the stock feeds through when a sheet is longer than the machine. */
  tilingAxis: 'x' | 'y' | 'none';
  /** Safety margin kept between tiles so nothing lands right on a seam. */
  tileOverlap: number;
  registrationHoleDiameter: number;
}

export type CarcassJoint = 'dado' | 'tabslot';
export type BackStyle = 'groove' | 'rabbet' | 'none';

/**
 * Where a stacked carcass gets its floor.
 *
 * 'own' gives it a bottom panel of its own. 'below' leaves it out and stands the
 * carcass in shallow locating dados machined into the top panel of the carcass
 * underneath: one less panel, one less joint line, and gravity does the holding
 * once it is glued. The carcass standing on the ground always has its own.
 */
export type CarcassFloor = 'own' | 'below';

/**
 * How the top panel meets the sides.
 *
 * 'capped' lays it over their top edges so the finished surface is one
 * unbroken panel with no joint line showing from above. 'inset' sets it
 * between them, which puts the sides' edges on show alongside it.
 */
export type TopStyle = 'capped' | 'inset';
export type ShelfMode = 'none' | 'fixed' | 'adjustable';

export interface ShelfPinSpec {
  diameter: number;
  depth: number;
  /** 32 mm under the European system. */
  pitch: number;
  /** Distance from the front edge to the front row of holes: 37 mm is standard. */
  frontOffset: number;
  backOffset: number;
  /** Vertical window the rows occupy, measured from the inside of the bay. */
  startAbove: number;
  endBelow: number;
}

export interface JoinerySettings {
  carcassJoint: CarcassJoint;
  reliefStyle: ReliefStyle;
  /** Added to every slot and groove width so parts actually go together. */
  fitClearance: number;
  /**
   * How deep a groove is cut, in millimetres. Clamped so it never eats more
   * than 60% of the panel receiving it.
   */
  dadoDepth: number;
  /**
   * How far a stopped dado holds back from the front edge, so the joint is
   * invisible on the finished face. Zero gives a through dado.
   */
  dadoStopFront: number;
  screwHoles: boolean;
  /**
   * Clearance hole through the panel that receives the groove, sized to pass
   * the screw's threads freely.
   *
   * It must clear the thread, not grip it: a hole sized to the root diameter
   * would have the screw biting in the outer panel and jacking the joint apart
   * instead of pulling it together.
   */
  screwClearanceDiameter: number;
  screwSpacing: number;
  /** Target width of a single tab in a tab-and-slot joint. */
  tabWidth: number;
  tabMinCount: number;
  /**
   * Depth of the locating dados a stacked carcass stands in when it has no
   * bottom of its own. Kept shallow: the panel below is already grooved on its
   * underside, and the two sets of pockets cross.
   */
  stackDadoDepth: number;
  shelfPin: ShelfPinSpec;
}

/** How a bay is fronted. */
export type DoorStyle = 'none' | 'left' | 'right' | 'double';

export interface BaySpec {
  shelves: ShelfMode;
  /** Number of fixed shelves; ignored for adjustable and none. */
  shelfCount: number;
  /** 'left' and 'right' name the side the hinges go on. */
  doors: DoorStyle;
}

/** How doors sit relative to the carcass. */
export type DoorFit = 'overlay' | 'inset';

export interface DoorSpec {
  fit: DoorFit;
  materialId: string;
  /** Gap between neighbouring doors, and around the outside of an overlay run. */
  reveal: number;
  /** Clearance all round an inset door. */
  insetGap: number;
}

/**
 * Boring for a 35 mm cup concealed hinge.
 *
 * Defaults are the IKEA UTRUSTA pattern, which is Blum's: a 35 mm cup with two
 * 8 mm press-fit dowels 45 mm apart, sitting 9.5 mm behind the cup's centre
 * line. Blum's own published boring distance is 3-6 mm from the door edge to
 * the *edge* of the cup, so the centre lands 17.5 mm further in.
 */
export interface HingeSpec {
  cupDiameter: number;
  cupDepth: number;
  /** Door edge to the near edge of the cup. Blum publishes 3-6 mm. */
  boringDistance: number;
  dowelDiameter: number;
  /** Centre to centre, along the door edge. */
  dowelSpacing: number;
  /** How far the dowels sit behind the cup's centre line, away from the edge. */
  dowelOffset: number;
  dowelDepth: number;
  /** Cup centre to the end of the door, top and bottom. 76.2 mm is 3 inches. */
  endOffset: number;
  /** Mounting plate holes in the carcass: 32 mm system, 37 mm from the front. */
  plateHoleDiameter: number;
  plateHoleDepth: number;
  plateHoleSpacing: number;
  plateFrontOffset: number;
}

export interface BackSpec {
  style: BackStyle;
  materialId: string;
  /** How far the back panel sits in from the rear edge of the carcass. */
  inset: number;
}

export interface CarcassSpec {
  topStyle: TopStyle;
  width: number;
  height: number;
  depth: number;
  /** Vertical dividers. Bay count is dividerCount + 1. */
  dividerCount: number;
  /** Explicit bay widths (clear openings). Empty means split the carcass evenly. */
  bayWidths: number[];
  bays: BaySpec[];
  back: BackSpec;
}

export interface ToeKickSpec {
  enabled: boolean;
  height: number;
  /** How far the toe kick face is recessed from the front of the carcass. */
  setback: number;
}

/**
 * A solid rail captured between the sides near the top back, for a wall
 * cabinet to be screwed to the wall through.
 *
 * A wall cabinet's own back panel is thin (12 mm by default) and cannot be
 * trusted to carry the cabinet's weight and contents on its own screws. Ripping
 * a strip of full carcass-thickness material in behind it — the same fix
 * cabinetmaking guides use — gives the screw something to bite into. See
 * JOINERY.md.
 */
export interface HangingRailSpec {
  enabled: boolean;
  /** Solid material top to bottom. Guides rip these to about 4 in (100 mm). */
  height: number;
  /** Clearance hole for the screw driven through the rail into the wall. */
  screwDiameter: number;
  /** Centre-to-centre pitch, kept under about one stud spacing (16 in = 406 mm) so the run always lands on at least two. */
  screwSpacing: number;
}

/**
 * One box, in a stack of them.
 *
 * A cabinet is a column of these standing on each other, so everything that
 * used to be special about the upper carcass — following the width below it,
 * borrowing the panel below for a floor — is a setting every carcass carries.
 */
export interface Carcass extends CarcassSpec {
  /**
   * Short token naming this carcass inside its cabinet, and the middle field of
   * every part ID it produces. 'B' for the base, 'T' for the upper, as a
   * woodworker would write them on the panels themselves.
   */
  id: string;
  /** What the carcass is called on screen and in the cut list. */
  name: string;
  /**
   * Take the width of the carcass below rather than the one set here, so a
   * stack stays flush down its sides when the bottom box is resized.
   */
  linkWidthToBelow: boolean;
  floor: CarcassFloor;
  /**
   * Only the carcass standing on the ground can have one: above that there is
   * no floor to recess from, and the locating dados it would stand in are
   * exactly where the notch would be cut.
   */
  toeKick: ToeKickSpec;
  /** A mounting rail for hanging this carcass on a wall. See HangingRailSpec. */
  hangingRail: HangingRailSpec;
}

/**
 * One unit in the run: a column of carcasses standing on each other, sharing a
 * position along the wall.
 */
export interface Cabinet {
  /** First field of every part ID this cabinet produces, e.g. 'C1'. */
  id: string;
  name: string;
  /** From the ground up. The first stands on the floor. */
  carcasses: Carcass[];
}

/**
 * What the nester optimises for.
 *
 * 'material' packs as tightly as it can and ignores where the machine's tile
 * seams fall. 'tiling' keeps each part inside a single tile and fills the
 * earliest tile first, so a sheet needs as few setups as possible and nothing
 * is cut across a seam unless the part is itself larger than the machine.
 */
export type NestStrategy = 'material' | 'tiling';

export interface NestingSettings {
  strategy: NestStrategy;
  /** Unusable border around the sheet, e.g. where the clamps live. */
  sheetMargin: number;
  /** Extra clearance between parts, on top of the cutter diameter. */
  partGap: number;
  allowRotation: boolean;
}

// ---------------------------------------------------------------------------
// Surface effects
// ---------------------------------------------------------------------------

export type EffectKind = 'grooves' | 'frame';

/**
 * Evenly spaced grooves across a face: beadboard, panelling, fluting, reeding.
 * The look in the reference photographs.
 */
export interface GrooveEffect {
  kind: 'grooves';
  /** Which way the grooves run, in the assembled cabinet. */
  direction: 'vertical' | 'horizontal';
  /** Centre-to-centre spacing. */
  spacing: number;
  width: number;
  depth: number;
  /** Held in from the edges of the visible area. */
  margin: number;
  /**
   * 'even' nudges the spacing so a whole number of equal bays fits edge to
   * edge, the way panelling is normally set out. 'exact' keeps the spacing as
   * given and centres the run, letting the end margins fall where they may.
   */
  fit: 'even' | 'exact';
}

/**
 * A rectangular groove run round a panel, the shaker-style line on the doors in
 * the reference photographs.
 */
export interface FrameEffect {
  kind: 'frame';
  /** Panel edge to the outside of the groove. */
  margin: number;
  width: number;
  depth: number;
}

export type SurfaceEffect = GrooveEffect | FrameEffect;

/**
 * Which panels an effect lands on.
 *
 * On a role target, an absent `cabinetId` or `carcassId` means every one of
 * them: 'the back panels' reaches the whole run, 'the back panels of C2' just
 * that unit.
 */
export type SurfaceTarget =
  | { select: 'role'; role: PartRole; cabinetId?: string; carcassId?: string }
  | { select: 'part'; partId: string };

export interface SurfaceEffectSpec {
  id: string;
  enabled: boolean;
  target: SurfaceTarget;
  /** 'inside' is the face looking into the cabinet, 'outside' the other one. */
  face: 'inside' | 'outside';
  effect: SurfaceEffect;
}

/**
 * Everything a project is: the run of cabinets, and the settings shared by all
 * of them.
 *
 * Materials, tooling, the machine and the joinery are project-wide because they
 * describe the workshop rather than the furniture — one spindle, one stack of
 * sheets, one set of grooves that have to fit each other.
 */
export interface ProjectParams {
  name: string;
  materials: Material[];
  carcassMaterialId: string;
  shelfMaterialId: string;
  tool: ToolSpec;
  machine: MachineSpec;
  joinery: JoinerySettings;
  doors: DoorSpec;
  hinge: HingeSpec;
  /** In the order they stand along the run, left to right. */
  cabinets: Cabinet[];
  nesting: NestingSettings;
  /** Decorative machining applied to chosen faces. */
  surfaceEffects: SurfaceEffectSpec[];
  /** Emit engraved part labels on the DXF LABEL layer. */
  labelParts: boolean;
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

export type PartRole =
  | 'door'
  | 'side'
  | 'bottom'
  | 'top'
  | 'divider'
  | 'shelf'
  | 'back'
  | 'toe-rail'
  | 'hanging-rail'
  | 'stretcher';

export type FaceSide = 'A' | 'B';

/** A rectangle in a part's local machining coordinates. */
export interface LocalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How a panel's flat machining coordinates sit in the assembly.
 *
 * This is fixed when the part is built and never recomputed. Joinery grows a
 * captured panel's box into its grooves afterwards, so deriving the frame from
 * the box a second time would move the origin and shift every feature by one
 * dado depth.
 */
export interface LocalFrame {
  /** Assembly-space direction of local +u. */
  u: Vec3;
  /** Assembly-space direction of local +v. */
  v: Vec3;
  /** Outward normal of face A. Material lies along -n from the face. */
  n: Vec3;
  /** Assembly point that maps to local (0, 0). */
  origin: Vec3;
}
export type GrainAxis = 'u' | 'v' | 'free';

export interface PocketFeature {
  kind: 'pocket';
  path: Path;
  depth: number;
  side: FaceSide;
  /** What produced this, for diagnostics and layer grouping. */
  purpose: string;
}

export interface ThroughFeature {
  kind: 'through';
  path: Path;
  purpose: string;
}

export interface DrillFeature {
  kind: 'drill';
  x: number;
  y: number;
  diameter: number;
  /** Blind depth, or 'thru' for a clearance hole. */
  depth: number | 'thru';
  side: FaceSide;
  purpose: string;
}

export interface EngraveFeature {
  kind: 'engrave';
  x: number;
  y: number;
  text: string;
  height: number;
  side: FaceSide;
}

export type Feature = PocketFeature | ThroughFeature | DrillFeature | EngraveFeature;

/**
 * A panel, in both worlds at once: `box` places it in the assembly, `outline`
 * and `features` describe what the machine has to do to a flat blank.
 *
 * Local 2D coordinates run (u, v) across face A, with the frame chosen so that
 * (u, v, normal) is right-handed. That is what stops a right-hand side panel
 * coming out of the machine mirrored, with its dados on the wrong face.
 */
export interface Part {
  id: string;
  label: string;
  role: PartRole;
  /** Which cabinet in the run this came out of. */
  cabinetId: string;
  /** Which carcass of that cabinet. */
  carcassId: string;
  materialId: string;
  thickness: number;
  box: AABB;
  normalAxis: Axis;
  faceASign: Sign;
  /** Fixed at build time; see LocalFrame. */
  frame: LocalFrame;
  /** Local size of the blank: u by v. */
  width: number;
  height: number;
  /**
   * The part of the blank still visible once assembled, in local coordinates.
   *
   * A captured panel grows into its grooves, so its blank is larger than the
   * face you actually see. Surface effects work inside this region, which is
   * what stops beading being cut across a tongue that is buried in a groove.
   */
  exposed: LocalRect;
  outline: Path;
  features: Feature[];
  /**
   * Which local axis the sheet's face grain should run along. 'free' lets the
   * nester rotate the part for a better yield; anything else pins its
   * orientation, which is what veneered ply on a visible face needs.
   */
  grainAxis: GrainAxis;
}

export interface Assembly {
  params: ProjectParams;
  parts: Part[];
}
