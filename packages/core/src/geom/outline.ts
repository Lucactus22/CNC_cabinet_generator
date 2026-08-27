import { Path, Vertex } from './types.js';

export type Corner = 'll' | 'lr' | 'ur' | 'ul';
export type Edge = 'bottom' | 'right' | 'top' | 'left';

/** A square bite taken out of a corner, used to clear a stopped dado. */
export interface CornerNotch {
  corner: Corner;
  /** Along the horizontal edge. */
  dx: number;
  /** Along the vertical edge. */
  dy: number;
}

/** A tenon sticking out of an edge. */
export interface EdgeTab {
  edge: Edge;
  /** Start of the tab in local coordinates, along the edge's own axis. */
  at: number;
  width: number;
  /** How far it protrudes beyond the edge. */
  depth: number;
}

/**
 * One vertical edge cut back at one end, making the blank a trapezoid.
 *
 * The only thing that needs it is a filler scribed to a wall that leans, so the
 * extension is deliberately this narrow rather than a general polygon: exactly
 * one of the four corners moves, and everything else about the blank is still a
 * rectangle. Widening it is what turns a robust composition into a boolean
 * engine nobody asked for.
 */
export interface Taper {
  edge: 'left' | 'right';
  /** The end of that edge where the blank is narrower. */
  at: 'top' | 'bottom';
  /** How much narrower, measured along the horizontal axis. */
  by: number;
}

export interface OutlineSpec {
  x0: number;
  y0: number;
  w: number;
  h: number;
  notches?: CornerNotch[];
  tabs?: EdgeTab[];
  taper?: Taper;
}

/**
 * Build a panel outline: a rectangle, optionally with corner notches bitten out
 * and tabs pushed out along its edges. Always counter-clockwise.
 *
 * Everything this generator produces is a rectangle with local modifications,
 * so composing the polygon directly is both simpler and more robust than
 * running general boolean operations over paths.
 */
export function buildOutline(spec: OutlineSpec): Path {
  const { x0, y0, w, h, taper } = spec;
  const notches = spec.notches ?? [];
  const tabs = spec.tabs ?? [];
  const x1 = x0 + w;
  const y1 = y0 + h;

  /**
   * Where a vertical edge sits at a given height.
   *
   * Everything that touches the left or the right edge asks through here, so a
   * notch or a tab on a sloping edge lands on the slope rather than on the
   * rectangle the slope replaced.
   */
  const xOn = (side: 'left' | 'right', y: number): number => {
    const base = side === 'left' ? x0 : x1;
    if (!taper || taper.edge !== side || h <= 1e-9) return base;
    const f = (y - y0) / h;
    const cut = taper.by * (taper.at === 'top' ? f : 1 - f);
    return side === 'left' ? base + cut : base - cut;
  };

  const notchOf = (c: Corner): CornerNotch | undefined => notches.find((n) => n.corner === c);
  const pts: Vertex[] = [];
  const push = (x: number, y: number): void => {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - x) < 1e-9 && Math.abs(last.y - y) < 1e-9) return;
    pts.push({ x, y });
  };

  // Walk counter-clockwise: LL, bottom edge, LR, right edge, UR, top, UL, left.
  emitCorner('ll');
  emitEdge('bottom');
  emitCorner('lr');
  emitEdge('right');
  emitCorner('ur');
  emitEdge('top');
  emitCorner('ul');
  emitEdge('left');

  // The walk can close back onto its own first point.
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) pts.pop();

  return { pts, closed: true };

  function emitCorner(c: Corner): void {
    const n = notchOf(c);
    if (!n) {
      if (c === 'll') push(xOn('left', y0), y0);
      else if (c === 'lr') push(xOn('right', y0), y0);
      else if (c === 'ur') push(xOn('right', y1), y1);
      else push(xOn('left', y1), y1);
      return;
    }
    const { dx, dy } = n;
    // Each notch is entered along the incoming edge and left along the outgoing
    // one, so it contributes three points in walking order.
    if (c === 'll') {
      push(xOn('left', y0 + dy), y0 + dy);
      push(xOn('left', y0 + dy) + dx, y0 + dy);
      push(xOn('left', y0) + dx, y0);
    } else if (c === 'lr') {
      push(xOn('right', y0) - dx, y0);
      push(xOn('right', y0 + dy) - dx, y0 + dy);
      push(xOn('right', y0 + dy), y0 + dy);
    } else if (c === 'ur') {
      push(xOn('right', y1 - dy), y1 - dy);
      push(xOn('right', y1 - dy) - dx, y1 - dy);
      push(xOn('right', y1) - dx, y1);
    } else {
      push(xOn('left', y1) + dx, y1);
      push(xOn('left', y1 - dy) + dx, y1 - dy);
      push(xOn('left', y1 - dy), y1 - dy);
    }
  }

  function emitEdge(e: Edge): void {
    const on = tabs.filter((t) => t.edge === e && t.width > 0 && t.depth > 0);
    if (on.length === 0) return;
    // Tabs are listed in local coordinates; emit them in the walking direction.
    const forward = e === 'bottom' || e === 'right';
    on.sort((a, b) => (forward ? a.at - b.at : b.at - a.at));

    for (const t of on) {
      const a = t.at;
      const b = t.at + t.width;
      if (e === 'bottom') {
        push(a, y0);
        push(a, y0 - t.depth);
        push(b, y0 - t.depth);
        push(b, y0);
      } else if (e === 'right') {
        push(xOn('right', a), a);
        push(xOn('right', a) + t.depth, a);
        push(xOn('right', b) + t.depth, b);
        push(xOn('right', b), b);
      } else if (e === 'top') {
        push(b, y1);
        push(b, y1 + t.depth);
        push(a, y1 + t.depth);
        push(a, y1);
      } else {
        push(xOn('left', b), b);
        push(xOn('left', b) - t.depth, b);
        push(xOn('left', a) - t.depth, a);
        push(xOn('left', a), a);
      }
    }
  }
}
