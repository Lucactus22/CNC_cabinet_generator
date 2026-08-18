import type { Path } from '../geom/index.js';
import type { ReliefStyle } from '../geom/relief.js';

export type Units = 'mm' | 'in';
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
  screwPilotDiameter: number;
  screwSpacing: number;
  /** Target width of a single tab in a tab-and-slot joint. */
  tabWidth: number;
  tabMinCount: number;
  shelfPin: ShelfPinSpec;
}

export interface BaySpec {
  shelves: ShelfMode;
  /** Number of fixed shelves; ignored for adjustable and none. */
  shelfCount: number;
}

export interface BackSpec {
  style: BackStyle;
  materialId: string;
  /** How far the back panel sits in from the rear edge of the carcass. */
  inset: number;
}

export interface CarcassSpec {
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

export interface NestingSettings {
  /** Unusable border around the sheet, e.g. where the clamps live. */
  sheetMargin: number;
  /** Extra clearance between parts, on top of the cutter diameter. */
  partGap: number;
  allowRotation: boolean;
}

// ---------------------------------------------------------------------------
// Surface effects
// ---------------------------------------------------------------------------

export type EffectKind = 'grooves';

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

export type SurfaceEffect = GrooveEffect;

/** Which panels an effect lands on. */
export type SurfaceTarget =
  | { select: 'role'; role: PartRole; carcass: 'base' | 'top' | 'both' }
  | { select: 'part'; partId: string };

export interface SurfaceEffectSpec {
  id: string;
  enabled: boolean;
  target: SurfaceTarget;
  /** 'inside' is the face looking into the cabinet, 'outside' the other one. */
  face: 'inside' | 'outside';
  effect: SurfaceEffect;
}

export interface CabinetParams {
  name: string;
  units: Units;
  materials: Material[];
  carcassMaterialId: string;
  shelfMaterialId: string;
  tool: ToolSpec;
  machine: MachineSpec;
  joinery: JoinerySettings;
  base: CarcassSpec & { toeKick: ToeKickSpec };
  top: CarcassSpec & { linkWidthToBase: boolean };
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
  | 'side'
  | 'bottom'
  | 'top'
  | 'divider'
  | 'shelf'
  | 'back'
  | 'toe-rail'
  | 'stretcher';

export type FaceSide = 'A' | 'B';

/** A rectangle in a part's local machining coordinates. */
export interface LocalRect {
  x: number;
  y: number;
  w: number;
  h: number;
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
  carcass: 'base' | 'top';
  materialId: string;
  thickness: number;
  box: AABB;
  normalAxis: Axis;
  faceASign: Sign;
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
  params: CabinetParams;
  parts: Part[];
}
