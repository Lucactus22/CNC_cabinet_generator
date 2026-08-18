import type { Path, Vertex } from '../geom/index.js';
import { layerColour, sanitiseLayer } from './layers.js';

export interface DxfCircle {
  layer: string;
  x: number;
  y: number;
  radius: number;
}

export interface DxfText {
  layer: string;
  x: number;
  y: number;
  height: number;
  text: string;
}

export interface DxfPath {
  layer: string;
  path: Path;
}

export interface DxfDrawing {
  paths: DxfPath[];
  circles: DxfCircle[];
  texts: DxfText[];
}

export const emptyDrawing = (): DxfDrawing => ({ paths: [], circles: [], texts: [] });

/**
 * Write DXF R12 (AC1009).
 *
 * R12 is the most widely readable flavour: arcs ride on POLYLINE bulges, which
 * every CAM package understands, and there are no object handles or class
 * tables to get wrong. Written by hand so the layer structure is exactly what
 * the workshop needs, with no library between us and the file.
 */
export function writeDxf(d: DxfDrawing): string {
  const out: string[] = [];
  const w = (code: number, value: string | number): void => {
    out.push(String(code));
    out.push(typeof value === 'number' ? fmt(value) : value);
  };

  const layers = collectLayers(d);

  w(0, 'SECTION');
  w(2, 'HEADER');
  w(9, '$ACADVER');
  w(1, 'AC1009');
  w(9, '$INSUNITS');
  w(70, 4); // millimetres
  w(9, '$MEASUREMENT');
  w(70, 1); // metric
  w(0, 'ENDSEC');

  w(0, 'SECTION');
  w(2, 'TABLES');
  w(0, 'TABLE');
  w(2, 'LAYER');
  w(70, layers.length);
  for (const name of layers) {
    w(0, 'LAYER');
    w(2, name);
    w(70, 0);
    w(62, layerColour(name));
    w(6, 'CONTINUOUS');
  }
  w(0, 'ENDTAB');
  w(0, 'ENDSEC');

  w(0, 'SECTION');
  w(2, 'ENTITIES');
  for (const p of d.paths) writePolyline(w, sanitiseLayer(p.layer), p.path);
  for (const c of d.circles) {
    w(0, 'CIRCLE');
    w(8, sanitiseLayer(c.layer));
    w(10, c.x);
    w(20, c.y);
    w(30, 0);
    w(40, c.radius);
  }
  for (const t of d.texts) {
    w(0, 'TEXT');
    w(8, sanitiseLayer(t.layer));
    w(10, t.x);
    w(20, t.y);
    w(30, 0);
    w(40, t.height);
    w(1, t.text);
  }
  w(0, 'ENDSEC');
  w(0, 'EOF');

  return out.join('\r\n') + '\r\n';
}

function writePolyline(
  w: (code: number, value: string | number) => void,
  layer: string,
  path: Path,
): void {
  if (path.pts.length < 2) return;
  w(0, 'POLYLINE');
  w(8, layer);
  w(66, 1); // vertices follow
  w(70, path.closed ? 1 : 0);
  w(10, 0);
  w(20, 0);
  w(30, 0);
  for (const v of path.pts) writeVertex(w, layer, v);
  w(0, 'SEQEND');
  w(8, layer);
}

function writeVertex(
  w: (code: number, value: string | number) => void,
  layer: string,
  v: Vertex,
): void {
  w(0, 'VERTEX');
  w(8, layer);
  w(10, v.x);
  w(20, v.y);
  w(30, 0);
  if (v.bulge) w(42, v.bulge);
}

function collectLayers(d: DxfDrawing): string[] {
  const set = new Set<string>();
  for (const p of d.paths) set.add(sanitiseLayer(p.layer));
  for (const c of d.circles) set.add(sanitiseLayer(c.layer));
  for (const t of d.texts) set.add(sanitiseLayer(t.layer));
  set.delete('0');
  return [...set].sort();
}

/** Fixed notation: exponent form is valid DXF but trips up some CAM importers. */
function fmt(n: number): string {
  if (!isFinite(n)) return '0.0';
  const s = n.toFixed(6);
  return s === '-0.000000' ? '0.000000' : s;
}
