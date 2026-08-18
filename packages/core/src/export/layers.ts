/**
 * Layer naming.
 *
 * CAM packages can pick both the toolpath strategy and the cut depth straight
 * out of the layer name, so the depth is encoded in it. Everything is upper
 * case because DXF R12 does not carry lower case layer names.
 */
export interface LayerOptions {
  /**
   * Replace the decimal point with a P, giving POCKET_D6P35 instead of
   * POCKET_D6.35, for importers that dislike dots in layer names.
   */
  safeNames: boolean;
}

export const LAYER = {
  outline: 'OUTLINE',
  through: 'THROUGH',
  label: 'LABEL',
  sheet: 'SHEET',
  tileGuide: 'TILE_GUIDE',
  tileReg: 'TILE_REG',
} as const;

/** Suffix marking geometry that is machined after the sheet is turned over. */
export const FLIP_SUFFIX = '_FLIP';

export function num(value: number, opts: LayerOptions): string {
  // Two decimals is finer than any router positions to, and trailing zeros
  // just make the layer list harder to read.
  const s = value
    .toFixed(2)
    .replace(/\.?0+$/, '')
    .replace('-', 'NEG');
  return opts.safeNames ? s.replace('.', 'P') : s;
}

export const pocketLayer = (depth: number, opts: LayerOptions): string =>
  `POCKET_D${num(depth, opts)}`;

export const drillLayer = (
  diameter: number,
  depth: number | 'thru',
  opts: LayerOptions,
): string =>
  depth === 'thru'
    ? `DRILL_${num(diameter, opts)}_THRU`
    : `DRILL_${num(diameter, opts)}_D${num(depth, opts)}`;

/** Strip anything AutoCAD will not accept in a layer name. */
export function sanitiseLayer(name: string): string {
  return name
    .toUpperCase()
    .replace(/[<>/\\":;?*|='`,]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 31);
}

/** Readable colours in CAM, by AutoCAD colour index. */
export function layerColour(name: string): number {
  if (name.startsWith('OUTLINE')) return 7;
  if (name.startsWith('THROUGH')) return 1;
  if (name.startsWith('POCKET')) return 3;
  if (name.startsWith('DRILL')) return 5;
  if (name.startsWith('TILE')) return 6;
  if (name.startsWith('LABEL')) return 8;
  return 8;
}
