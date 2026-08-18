/** 2D point. All lengths are millimetres throughout the core. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * A path vertex. `bulge` describes the arc leaving this vertex towards the next
 * one, using the DXF definition: bulge = tan(includedAngle / 4), positive for a
 * counter-clockwise sweep. Storing arcs this way means paths map 1:1 onto DXF
 * POLYLINE entities with no lossy conversion at export time.
 */
export interface Vertex extends Vec2 {
  bulge?: number;
}

export interface Path {
  pts: Vertex[];
  closed: boolean;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const EPS = 1e-9;

export const v = (x: number, y: number, bulge?: number): Vertex =>
  bulge === undefined || bulge === 0 ? { x, y } : { x, y, bulge };

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function norm(a: Vec2): Vec2 {
  const l = len(a);
  if (l < EPS) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}

/** Signed z of the 2D cross product. Positive when b turns left of a. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
