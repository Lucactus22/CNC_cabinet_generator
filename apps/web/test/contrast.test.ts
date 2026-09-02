import { describe, expect, it } from 'vitest';
// The stylesheet itself, as text. Imported rather than read off disk so this
// test compiles under the web app's own tsconfig, which has no node types —
// and so it follows the file if it ever moves.
import CSS from '../src/styles.css?raw';

/**
 * Both palettes, checked against WCAG AA.
 *
 * R-23's problem statement is that the interface was dark only, in a tool used
 * in daylight and under workshop lights. Adding a light theme is easy; keeping
 * it *legible* while somebody edits the palette months later is what this
 * exists for. The numbers are read out of `styles.css` itself, so a colour
 * cannot pass here and be different on screen — the same argument the sheet
 * preview makes by rendering the very `DxfDrawing` the exporter writes.
 *
 * Two thresholds, both from WCAG 2.2:
 *   4.5:1  text (SC 1.4.3 AA). This app's smallest type is 10 px, so the
 *          large-text exemption at 3:1 is never claimed.
 *   3:1    the visible boundary of a control, and a line in a drawing that
 *          carries meaning (SC 1.4.11).
 *
 * The failure this is written against is not an ugly screen. It is a woodworker
 * squinting at a pocket line they cannot see, on a sheet they are about to cut.
 */

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

// --------------------------------------------------------------- the palette

type Palette = Record<string, Rgba>;

/**
 * The `:root` block, as two palettes.
 *
 * Every colour in this app is written `light-dark(light, dark)` on one line,
 * which is also what makes it parseable here without a CSS engine. A token
 * with a single value is the same in both themes; a token written `var(--x)`
 * follows whatever `--x` resolved to in that theme.
 */
function palettes(): { light: Palette; dark: Palette; declared: string[] } {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS);
  if (!root) throw new Error('no :root block in styles.css');
  // Prose can hold a semicolon, and the declarations are split on one.
  const body = root[1]!.replace(/\/\*[\s\S]*?\*\//g, '');
  const light: Palette = {};
  const dark: Palette = {};
  const declared: string[] = [];
  for (const declaration of body.split(';')) {
    const m = /(--[a-z0-9-]+)\s*:\s*([\s\S]+)/.exec(declaration);
    if (!m) continue;
    const name = m[1]!;
    const raw = m[2]!.trim();
    declared.push(name);
    const pair = /^light-dark\(\s*(.+?)\s*,\s*(.+?)\s*\)$/.exec(raw);
    const put = (into: Palette, value: string): void => {
      const ref = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(value);
      const colour = ref ? into[ref[1]!] : parse(value);
      if (colour) into[name] = colour;
    };
    if (pair) {
      put(light, pair[1]!);
      put(dark, pair[2]!);
    } else {
      put(light, raw);
      put(dark, raw);
    }
  }
  return { light, dark, declared };
}

function parse(value: string): Rgba | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const h = hex[1]!;
    const wide = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    return {
      r: parseInt(wide.slice(0, 2), 16),
      g: parseInt(wide.slice(2, 4), 16),
      b: parseInt(wide.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)%\s*)?\)$/i.exec(value.trim());
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] === undefined ? 1 : Number(rgb[4]) / 100,
    };
  }
  return null;
}

/** A translucent tint laid over an opaque surface, as the eye actually sees it. */
const over = (top: Rgba, under: Rgba): Rgba => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});

function luminance({ r, g, b }: Rgba): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

// ----------------------------------------------------------------- the pairs

/** Opaque grounds that text is set on, everywhere in the app. */
const SURFACES = ['--bg', '--panel', '--panel-2', '--float'] as const;

/** Every colour the app sets text in. Each has to work on every surface. */
const INK = ['--text', '--muted', '--accent', '--error', '--warn', '--info', '--ok'] as const;

/**
 * A tint over a surface, with what is written on top of it. Composited rather
 * than assumed: a 10% wash moves the ground it sits on, and ink that was
 * legible on the bare surface is not automatically legible on the tinted one.
 */
const TINTED: Array<{ wash: string; on: string; ink: string[]; what: string }> = [
  {
    wash: '--wash-accent',
    on: '--float',
    ink: ['--text', '--muted'],
    what: 'the gallery option in force, and the selected row in the cut list',
  },
  {
    wash: '--wash-accent-strong',
    on: '--panel-2',
    ink: ['--text'],
    what: 'the selected bay in the run strip',
  },
  { wash: '--wash-error', on: '--float', ink: ['--error'], what: 'the ERROR tag' },
  { wash: '--wash-warn', on: '--float', ink: ['--warn'], what: 'the WARNING tag' },
  { wash: '--wash-info', on: '--float', ink: ['--info'], what: 'the INFO tag' },
  {
    wash: '--wash-ok',
    on: '--float',
    ink: ['--text', '--muted'],
    what: 'a part ticked off at the machine',
  },
  {
    wash: '--overlay-bg',
    on: '--bg',
    ink: ['--text', '--muted'],
    what: 'the readouts floating over the 3D scene',
  },
];

/** Filled chips: the ink is chosen for the fill, not for a surface. */
const FILLED: Array<{ fill: string; ink: string; what: string }> = [
  { fill: '--accent', ink: '--on-accent', what: 'the Export DXF button' },
  { fill: '--error', ink: '--on-error', what: "the workshop door's error count" },
];

/**
 * The lines a drawing is read from. Every one carries meaning — which layer a
 * cut belongs to, which line is the wall — so 3:1 is the floor, on screen and
 * on paper.
 */
const LAYERS = [
  '--layer-outline',
  '--layer-through',
  '--layer-pocket',
  '--layer-drill',
  '--layer-tile',
  '--layer-sheet',
  '--layer-label',
  '--layer-band',
  '--measure-wall',
  '--measure-run',
] as const;

/** The boundary of a control, and the ring that says where the keyboard is. */
const BOUNDARIES = ['--edge', '--accent', '--accent-dim'] as const;

/**
 * Declarations in `:root` that are not colours at all: the type, space and
 * radius scales, the two font stacks, the shadow, and the three heights
 * `docs/UX.md` measures the window's share against. Named rather than
 * inferred, because the alternative is a colour this file cannot parse —
 * `oklch()`, `color-mix()`, an `#rrggbbaa` — quietly counting as "not a
 * colour" and slipping past every check below.
 */
const NOT_A_COLOUR = new Set([
  '--text-2xs',
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-md',
  '--text-lg',
  '--text-xl',
  '--text-2xl',
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-7',
  '--space-8',
  '--radius-xs',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-pill',
  '--shadow',
  '--mono',
  '--sans',
  '--topbar-h',
  '--strip-h',
  '--inspector-w',
]);

/**
 * Colours that are never a foreground and never a ground behind one, with the
 * reason. Listed rather than skipped, so the completeness check below can fail
 * on a *new* colour nobody has thought about — the same device `catalog.ts`
 * uses for a parameter with no control.
 */
const NOT_CHECKED: Record<string, string> = {
  '--line': 'a rule between regions: decoration, and exempt under SC 1.4.11',
  '--shadow-color': 'a drop shadow, never behind text',
  '--scrim': 'dims the room behind a modal; nothing is read through it',
  '--scrim-strong': 'the same, for the measurement walkthrough',
  '--pic-bg': 'a ground, checked below as one rather than as a foreground',
  '--focus': 'an alias of --accent, checked with the other boundaries',
};

const { light, dark, declared } = palettes();

function need(palette: Palette, name: string): Rgba {
  const colour = palette[name];
  if (!colour) throw new Error(`${name} is missing from the palette`);
  return colour;
}

const short = (n: number): string => n.toFixed(2);

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('the %s palette', (_theme, palette) => {
  it('sets every ink legibly on every surface', () => {
    const failures: string[] = [];
    for (const surface of SURFACES) {
      for (const ink of INK) {
        const r = ratio(need(palette, ink), need(palette, surface));
        if (r < 4.5) failures.push(`${ink} on ${surface} is ${short(r)}:1, needs 4.5`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps text legible on the tints laid over those surfaces', () => {
    const failures: string[] = [];
    for (const { wash, on, ink, what } of TINTED) {
      const ground = over(need(palette, wash), need(palette, on));
      for (const name of ink) {
        const r = ratio(need(palette, name), ground);
        if (r < 4.5) failures.push(`${name} on ${wash} over ${on} (${what}) is ${short(r)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('sets legible text on a filled chip', () => {
    const failures: string[] = [];
    for (const { fill, ink, what } of FILLED) {
      const r = ratio(need(palette, ink), need(palette, fill));
      if (r < 4.5) failures.push(`${ink} on ${fill} (${what}) is ${short(r)}:1`);
    }
    expect(failures).toEqual([]);
  });

  // SC 1.4.11: a control identified by its outline needs that outline to be
  // visible. Before R-23 the border measured 1.29–1.47:1 against the surfaces
  // it sat on — a field you could only find by clicking where you remembered
  // one being.
  it('draws a control boundary and a focus ring you can see', () => {
    const failures: string[] = [];
    for (const surface of SURFACES) {
      for (const name of BOUNDARIES) {
        const r = ratio(need(palette, name), need(palette, surface));
        if (r < 3) failures.push(`${name} on ${surface} is ${short(r)}:1, needs 3`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('draws every drawing layer on the picture ground', () => {
    const failures: string[] = [];
    for (const layer of LAYERS) {
      const r = ratio(need(palette, layer), need(palette, '--pic-bg'));
      if (r < 3) failures.push(`${layer} on --pic-bg is ${short(r)}:1, needs 3`);
    }
    expect(failures).toEqual([]);
  });
});

// The pack prints on white whatever the screen is doing, so only the light
// half of each layer colour ever meets paper. Before R-23 it did not: the
// print rules turned the sheet white and left the strokes at their dark-theme
// brightness, which is a 1.9:1 orange outline on a printed cutting sheet.
it('prints every drawing layer legibly on white paper', () => {
  const failures: string[] = [];
  for (const layer of LAYERS) {
    const r = ratio(need(light, layer), WHITE);
    if (r < 3) failures.push(`${layer} on paper is ${short(r)}:1, needs 3`);
  }
  expect(failures).toEqual([]);
});

// Without this, a colour written in a syntax `parse()` does not understand is
// dropped from both palettes, and every assertion above passes by having
// nothing to check — the silent kind of green this repo cares about.
it('reads every declaration in the palette as either a colour or a scale', () => {
  const unread = declared.filter((name) => !dark[name] && !NOT_A_COLOUR.has(name));
  expect(unread).toEqual([]);
  // And the other way: a scale entry that has started parsing as a colour is
  // a sign this file is reading the wrong thing.
  expect(declared.filter((name) => dark[name] && NOT_A_COLOUR.has(name))).toEqual([]);
});

it('accounts for every colour in the palette', () => {
  const covered = new Set<string>([
    ...SURFACES,
    ...INK,
    ...LAYERS,
    ...BOUNDARIES,
    ...TINTED.map((t) => t.wash),
    ...FILLED.flatMap((f) => [f.fill, f.ink]),
    ...Object.keys(NOT_CHECKED),
  ]);
  expect(Object.keys(dark).filter((name) => !covered.has(name))).toEqual([]);
});

it('gives every colour a value in both themes', () => {
  // A colour that came out identical in both themes is one that was written
  // for the dark palette and never given a light half — the silent version of
  // this item's own problem statement.
  const identical = Object.keys(dark).filter(
    (name) => JSON.stringify(light[name]) === JSON.stringify(dark[name]),
  );
  expect({ missingFromLight: Object.keys(dark).filter((n) => !light[n]), identical }).toEqual({
    missingFromLight: [],
    identical: [],
  });
});
