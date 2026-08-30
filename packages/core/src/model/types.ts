import type { Edge, Path } from '../geom/index.js';
import type { ReliefStyle } from '../geom/relief.js';
import type { OpeningSpec } from './opening.js';
import type { HardwareSelection } from '../hardware/catalogue.js';

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

/**
 * Solid stock: a board with a length and a width, but no fixed sheet size.
 *
 * A face frame's rails and stiles are ripped from boards, not cut from a sheet,
 * so they cannot share `Material` — there is no `sheetWidth` to nest a board
 * against, only a length to cut it to. Kept as a distinct list on the project
 * (`stockMaterials`) so a linear cut list and a sheet cut list never get mixed
 * into one count that means nothing to either supplier.
 */
export interface StockMaterial {
  id: string;
  name: string;
  nominalThickness: number;
  actualThickness: number;
  /** Standard length a board is bought in, e.g. 2440 mm (8 ft). */
  boardLength: number;
  /** Width a board is milled to before ripping it down to a stile or rail width. */
  boardWidth: number;
}

/**
 * A roll of edge tape (or iron-on veneer), applied by hand once the sheet is
 * cut.
 *
 * Not a `Material`: it has no sheet to nest, and a workshop buys and reports
 * it by length, not area.
 */
export interface BandingMaterial {
  id: string;
  name: string;
  /**
   * The blank is cut this much short on every edge banded in this material, so
   * gluing the tape back on returns the part to the size it was designed at.
   */
  thickness: number;
}

/**
 * One of the (up to) four edges around a panel's perimeter, named the way a
 * woodworker points at one rather than by a local axis — a part's local edges
 * flip with its handedness, but 'the front edge' does not.
 *
 * Only the two directions perpendicular to a part's own normal axis are ever
 * real: a door (normal axis Y) has left/right/top/bottom edges and no
 * front/back edge to speak of, a shelf (normal axis Z) the opposite pair. An
 * edge that can never occur on a given role is simply never resolved, rather
 * than being a distinct set of options per role — see `applyBanding`.
 */
export type PanelEdge = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/** Which edges of every part with a given role are banded, and with what. */
export interface EdgeBandingSpec {
  edges: PanelEdge[];
  /** A `BandingMaterial` id. */
  materialId: string;
}

/**
 * Banding actually applied to one part's blank, resolved from
 * `ProjectParams.edgeBanding` against that part's own frame.
 */
export interface BandedEdge {
  /** Which side of the panel, as named in the project's banding rule. */
  edge: PanelEdge;
  /** Which side of the flat blank that turned out to be, for drawing it. */
  localEdge: Edge;
  materialId: string;
  /** Length of tape this edge needs, in mm — the blank's own finished size along it. */
  length: number;
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
 * Frameless has the doors and hinges reference the carcass opening directly.
 * Face-frame adds a frame of solid stock across the front, and everything
 * that used to reference the carcass opening references the frame's opening
 * instead. See `FaceFrameSpec` and `build/faceframe.ts`.
 */
export type ConstructionStyle = 'frameless' | 'face-frame';

/**
 * A frame of solid stock across the front of a carcass: two outer stiles, one
 * mid-stile per divider, and a rail top and bottom, half-lapped where they
 * cross. Only read when `Carcass.construction` is `'face-frame'`, but always
 * present so switching a carcass to face-frame does not need its numbers
 * typed in from nothing.
 */
export interface FaceFrameSpec {
  /** A `StockMaterial` id — solid stock, not a sheet good. */
  materialId: string;
  /** Outer and mid stiles are all milled to this width. */
  stileWidth: number;
  /** Top and bottom rails are milled to this width. */
  railWidth: number;
  /**
   * How far an overlay door extends onto the surrounding frame member.
   *
   * Unlike a frameless carcass — where an overlay door covers a thin side
   * panel edge to edge because there is nothing else to do — a face-frame
   * stile is wide enough that covering it entirely would hide the frame the
   * style exists to show. A modest, consistent reveal on every edge is the
   * standard overlay-hinge convention; this is what "partial overlay"
   * (R-07) means in practice.
   */
  overlay: number;
}

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

/**
 * Where the shelf pin rows go.
 *
 * The pin itself — its diameter, how deep its hole is, what pitch it indexes on
 * — is a catalogue entry, because that is decided by which pins are in the
 * drawer. This is the half that is a layout choice and stays the same whichever
 * pin you buy.
 */
export interface ShelfPinSpec {
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
  /**
   * A stack of drawers fronting this bay instead of doors and shelves, top to
   * bottom, each entry the clear front height of one drawer.
   *
   * Empty means no drawers, which is the default: `doors` and `shelves` decide
   * the bay as before. A bay is one or the other — a drawer stack over a door
   * is real cabinetry but doubles the opening math this item has to get right,
   * so it is out of scope for now; see docs/DRAWERS.md.
   *
   * Explicit heights are used as given when they, plus a reveal between each,
   * add up to the bay's own opening height; otherwise the opening is split
   * evenly among them, the same fallback `bayWidths` uses for a carcass's own
   * bays.
   */
  drawerFrontHeights: number[];
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
  /** Frameless by default. See `ConstructionStyle`. */
  construction: ConstructionStyle;
  /** Read only when `construction` is `'face-frame'`, but always present. */
  faceFrame: FaceFrameSpec;
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
  /** Solid stock for face frames. See `StockMaterial`. */
  stockMaterials: StockMaterial[];
  /** Rolls of edge tape available to the project. See `BandingMaterial`. */
  bandingMaterials: BandingMaterial[];
  /** Which edges of a part role are banded. A role missing from this is not banded at all. */
  edgeBanding: Partial<Record<PartRole, EdgeBandingSpec>>;
  carcassMaterialId: string;
  shelfMaterialId: string;
  /** Sides, sub-front, back and bottom of a drawer box. See `PartRole`. */
  drawerBoxMaterialId: string;
  tool: ToolSpec;
  machine: MachineSpec;
  joinery: JoinerySettings;
  doors: DoorSpec;
  /** Which catalogue entries this project is cut to. See hardware/catalogue.ts. */
  hardware: HardwareSelection;
  /** In the order they stand along the run, left to right. */
  cabinets: Cabinet[];
  /** The measured room the run has to fit into. See model/opening.ts. */
  opening: OpeningSpec;
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
  | 'stretcher'
  /** Scribe strip or filler panel taking up the gap between the run and a wall. */
  | 'scribe'
  /** Face-frame vertical member: outer stiles and one per divider. */
  | 'stile'
  /** Face-frame horizontal member: top and bottom of the frame. */
  | 'rail'
  /** Drawer box left/right side. */
  | 'drawer-side'
  /** Drawer box sub-front: the hidden member the visible drawer face screws to. */
  | 'drawer-front'
  /** Drawer box back, shorter than the sides so it clears the runner. */
  | 'drawer-back'
  /** Drawer box bottom, notched at each rear corner for the slide's locking device. */
  | 'drawer-bottom'
  /** The visible drawer face: same kind of part as a door, and targetable the same way by surface effects. */
  | 'drawer-face';

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
  /** Edges banded on this blank. Empty unless `ProjectParams.edgeBanding` covers this part's role. */
  bandedEdges: BandedEdge[];
}

export interface Assembly {
  params: ProjectParams;
  parts: Part[];
}
