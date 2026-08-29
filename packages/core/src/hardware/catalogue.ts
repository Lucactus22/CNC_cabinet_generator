/**
 * The hardware catalogue.
 *
 * A project no longer carries a hinge's dimensions; it carries the *id* of a
 * catalogue entry, and the entry carries both the boring pattern and the rules
 * for when that pattern is allowed to be used. Everything in here is plain
 * data, which is what lets a user's own entry be saved in a project file and
 * checked by exactly the same code as a built-in one.
 */
export type HardwareKind = 'hinge' | 'shelf-pin' | 'handle';

/**
 * A measurement of the job that a piece of hardware can have an opinion about.
 *
 * Deliberately a short closed list rather than a free-form predicate: a
 * requirement has to survive being written to a project file and read back,
 * and a function does not.
 */
export type HardwareMeasure =
  'door thickness' | 'door width' | 'door height' | 'carcass panel thickness';

/**
 * One fitting rule, in the maker's own terms.
 *
 * `why` is the half that matters at the machine: a number on its own tells
 * someone their door is too thin, and the sentence tells them what will happen
 * if they cut it anyway.
 */
export interface Requirement {
  measure: HardwareMeasure;
  min?: number;
  max?: number;
  why: string;
}

/**
 * Boring for a 35 mm cup concealed hinge.
 *
 * It lives here rather than on the project because it describes a *make* of
 * hinge: every number in it is fixed by the hardware in the box, and choosing
 * different hardware is choosing a different set of them.
 */
export interface HingeSpec {
  cupDiameter: number;
  cupDepth: number;
  /** Door edge to the near edge of the cup. */
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

export interface EntryBase {
  id: string;
  name: string;
  /** Where the numbers came from, so the next person can check them. */
  source: string;
  requires: Requirement[];
  /** Absent on the built-ins; true on anything the user made. */
  custom?: boolean;
}

export interface HingeEntry extends EntryBase {
  kind: 'hinge';
  boring: HingeSpec;
  /**
   * The maker's published range for the door edge to the near edge of the cup.
   *
   * It is a property of the hinge rather than a taste: outside it the arm
   * geometry cannot reach its own mounting plate, so the door will not shut.
   */
  boringDistanceRange: { min: number; max: number };
}

/**
 * A shelf support and the hole it lives in.
 *
 * Only the three numbers the *pin* decides are here. Where the rows go — how
 * far in from the front, how far short of the top and bottom of the bay — is a
 * layout choice that stays in the joinery settings, because it is the same
 * choice whichever pin you buy.
 */
export interface ShelfPinBoring {
  diameter: number;
  depth: number;
  /** 32 mm under the European system, and on the imperial jigs too. */
  pitch: number;
}

export interface ShelfPinEntry extends EntryBase {
  kind: 'shelf-pin';
  boring: ShelfPinBoring;
}

/**
 * A pull, and the clearance holes that fix it.
 *
 * The fixing screws pass right through the door into the back of the handle,
 * so these are through holes and can be cut from whichever face the door is
 * already on the bed for.
 */
export interface HandleBoring {
  /** A bar takes two screws at its fixing centres; a knob takes one. */
  style: 'bar' | 'knob';
  /** Centre to centre of the two fixing screws. Zero for a knob. */
  centres: number;
  /** Clearance hole through the door. M4 is the cabinet-hardware standard. */
  screwDiameter: number;
  /**
   * How much room the handle takes on the door: a bar's overall length, a
   * knob's base diameter. It is what has to fit, rather than the centres, and
   * the difference is what makes a 320 mm bar overhang a 300 mm drawer front.
   */
  length: number;
}

export interface HandleEntry extends EntryBase {
  kind: 'handle';
  boring: HandleBoring;
}

export type HardwareEntry = HingeEntry | ShelfPinEntry | HandleEntry;

// ---------------------------------------------------------------------------
// The built-in entries
// ---------------------------------------------------------------------------

/**
 * The 35 mm cup family all share one boring pattern: a 35 mm cup with two 8 mm
 * dowels 45 mm apart, sitting 9.5 mm behind the cup's centre line. Two other
 * dowel patterns exist in the wild — 48 x 6.3 and 52 x 5.5 — which is exactly
 * why the pattern is data on the entry and not a constant in the boring code.
 */
const EURO_DOWELS = {
  dowelDiameter: 8,
  dowelSpacing: 45,
  dowelOffset: 9.5,
} as const;

/** Mounting plates on the 32 mm system, 37 mm in from the front edge. */
const EURO_PLATE = {
  plateHoleDiameter: 5,
  plateHoleDepth: 12,
  plateHoleSpacing: 32,
  plateFrontOffset: 37,
} as const;

export const HINGE_UTRUSTA: HingeEntry = {
  kind: 'hinge',
  id: 'utrusta',
  name: 'IKEA UTRUSTA 110°',
  source:
    'Measured from the hinge and cross-checked against Blum, whose pattern IKEA uses. See docs/DOORS.md.',
  boring: {
    cupDiameter: 35,
    cupDepth: 13,
    boringDistance: 5,
    ...EURO_DOWELS,
    dowelDepth: 12,
    endOffset: 76.2,
    ...EURO_PLATE,
  },
  boringDistanceRange: { min: 3, max: 6 },
  requires: [
    {
      measure: 'door thickness',
      min: 16,
      max: 24,
      why: 'the cup bottoms out in a thinner door, and a thicker one fouls the carcass before it opens',
    },
  ],
};

export const HINGE_BLUM_CLIP_TOP: HingeEntry = {
  kind: 'hinge',
  id: 'blum-clip-top-blumotion',
  name: 'Blum CLIP top BLUMOTION 110° (71B35xx)',
  source:
    "Blum's own CLIP top BLUMOTION 110° sheet: boring distance range 3-7 mm, all 35 mm and 8 mm holes at least 13 mm deep, minimum-reveal table running from a 16 mm to a 26 mm door.",
  boring: {
    cupDiameter: 35,
    cupDepth: 13,
    boringDistance: 5,
    ...EURO_DOWELS,
    // Blum's note is explicit that the dowel holes go as deep as the cup.
    dowelDepth: 13,
    endOffset: 76.2,
    ...EURO_PLATE,
  },
  boringDistanceRange: { min: 3, max: 7 },
  requires: [
    {
      measure: 'door thickness',
      min: 16,
      max: 26,
      why: "Blum's minimum-reveal table stops at 26 mm, and past that they ask for a trial fit rather than publishing a number",
    },
  ],
};

export const HINGE_HETTICH_SENSYS: HingeEntry = {
  kind: 'hinge',
  id: 'hettich-sensys-8645i',
  name: 'Hettich Sensys 8645i 110° (TB 45 x 9.5)',
  source:
    "Hettich's own Sensys 8645i sheet: 35 mm cup bored 12.8 mm deep, TB drilling pattern 45 x 9.5 mm with 8 x 11 mm expanding sockets, for a 15-24 mm door.",
  boring: {
    cupDiameter: 35,
    cupDepth: 12.8,
    boringDistance: 5,
    ...EURO_DOWELS,
    dowelDepth: 11,
    endOffset: 76.2,
    ...EURO_PLATE,
  },
  // Hettich publish the drilling pattern and the cup depth but not a boring
  // distance range on the product sheet, so this is the range the 110° overlay
  // family is commonly set out to. It only ever produces a warning, never a
  // hole, so a conservative assumption here cannot cut anything wrong.
  boringDistanceRange: { min: 3, max: 6 },
  requires: [
    {
      measure: 'door thickness',
      min: 15,
      max: 24,
      why: 'Hettich publish this hinge for 15 to 24 mm doors, and the arm runs out of adjustment either side of that',
    },
  ],
};

export const PIN_5MM: ShelfPinEntry = {
  kind: 'shelf-pin',
  id: 'pin-5mm',
  name: '5 mm shelf pin',
  source: 'The European 32 mm system, which is what the carcass joinery is already set out on.',
  boring: { diameter: 5, depth: 12, pitch: 32 },
  requires: [
    {
      measure: 'carcass panel thickness',
      min: 15,
      why: 'a 12 mm hole needs material behind it, or the pin shows on the outside of the cabinet',
    },
  ],
};

export const PIN_QUARTER_INCH: ShelfPinEntry = {
  kind: 'shelf-pin',
  id: 'pin-quarter-inch',
  name: '1/4 in shelf pin',
  source:
    "The North American pin. Kreg's 1/4 in shelf pin jig indexes on the same 1-1/4 in (32 mm) pitch as the 5 mm one.",
  boring: { diameter: 6.35, depth: 12.7, pitch: 32 },
  requires: [
    {
      measure: 'carcass panel thickness',
      min: 16,
      why: 'a 12.7 mm hole needs material behind it, or the pin shows on the outside of the cabinet',
    },
  ],
};

/**
 * Handle centres are multiples of the 32 mm system: 96 is three pitches, 128
 * four, 160 five, 320 ten. That is why those four sizes are the ones every
 * maker stocks.
 */
function bar(id: string, centres: number): HandleEntry {
  return {
    kind: 'handle',
    id,
    name: `${centres} mm bar handle`,
    source:
      'Fixing centres are multiples of the 32 mm system; cabinet handles are fixed with M4 machine screws, which take a 4.5 mm clearance hole. Overall length is NOT fixed by the centres — 128 mm centres is sold at 136, 178 and 192 mm overall — so it is a typical T-bar (Top Knobs quote 178 mm over 128 mm centres) and should be set to the handle in hand.',
    // Overall length decides nothing that is cut. It is only what the overhang
    // warning is measured against, so a typical figure that the user corrects
    // is better than pretending there is a standard one.
    boring: { style: 'bar', centres, screwDiameter: 4.5, length: centres + 50 },
    requires: [
      {
        measure: 'door thickness',
        min: 12,
        max: 25,
        why: 'the M4 screws handles are supplied with are 25 mm long, and a thinner door gives the head nothing to pull against',
      },
    ],
  };
}

export const HANDLE_BAR_96 = bar('bar-96', 96);
export const HANDLE_BAR_128 = bar('bar-128', 128);
export const HANDLE_BAR_160 = bar('bar-160', 160);
export const HANDLE_BAR_320 = bar('bar-320', 320);

export const HANDLE_KNOB: HandleEntry = {
  kind: 'handle',
  id: 'knob',
  name: 'Knob, single screw',
  source:
    'One M4 machine screw, which takes a 4.5 mm clearance hole. The 30 mm is a typical base diameter — knobs run from about 25 to 40 mm — and should be set to the knob in hand.',
  boring: { style: 'knob', centres: 0, screwDiameter: 4.5, length: 30 },
  requires: [
    {
      measure: 'door thickness',
      min: 12,
      max: 25,
      why: 'the M4 screw a knob is supplied with is 25 mm long, and a thinner door gives the head nothing to pull against',
    },
  ],
};

/** Add a make by writing an entry and listing it here. */
export const CATALOGUE: HardwareEntry[] = [
  HINGE_UTRUSTA,
  HINGE_BLUM_CLIP_TOP,
  HINGE_HETTICH_SENSYS,
  PIN_5MM,
  PIN_QUARTER_INCH,
  HANDLE_BAR_96,
  HANDLE_BAR_128,
  HANDLE_BAR_160,
  HANDLE_BAR_320,
  HANDLE_KNOB,
];

/** What a project falls back to, and what a new project starts with. */
export const DEFAULT_HINGE_ID = HINGE_UTRUSTA.id;
export const DEFAULT_SHELF_PIN_ID = PIN_5MM.id;

export const KIND_LABELS: Record<HardwareKind, string> = {
  hinge: 'Hinge',
  'shelf-pin': 'Shelf pin',
  handle: 'Handle',
};

// ---------------------------------------------------------------------------
// Selection and lookup
// ---------------------------------------------------------------------------

/**
 * What a project builds to, and the entries it brought with it.
 *
 * The custom list is part of the project rather than a workshop-wide library
 * because the file has to open on someone else's machine and still cut the same
 * holes. A project that names hardware nobody else has is a project that
 * silently reverts to the default.
 */
export interface HardwareSelection {
  hingeId: string;
  shelfPinId: string;
  /** Empty means no handles are bored, which is the default. */
  handleId: string;
  /** Entries the user added, saved with the project. */
  custom: HardwareEntry[];
  /** Where a handle sits on the door it is fixed to. */
  handlePlacement: HandlePlacement;
}

/**
 * Where a handle goes on a door.
 *
 * There is no right answer to this — it is the one hardware decision that is
 * taste rather than specification — so it is a setting with a conventional
 * default, and the diagnostics report the holes it produced in millimetres so
 * they can be checked against a door somebody likes.
 */
export interface HandlePlacement {
  /** Which way a bar handle runs on a door. */
  orientation: 'vertical' | 'horizontal';
  /** Opening edge of the door — the one away from the hinges — to the screw line. */
  edgeOffset: number;
  /** Which end of the door the handle sits at. */
  from: 'top' | 'bottom' | 'centre';
  /** That end of the door to the nearest screw. Ignored when centred. */
  endOffset: number;
}

export function defaultHandlePlacement(): HandlePlacement {
  return { orientation: 'vertical', edgeOffset: 35, from: 'top', endOffset: 50 };
}

export function defaultHardware(): HardwareSelection {
  return {
    hingeId: DEFAULT_HINGE_ID,
    shelfPinId: DEFAULT_SHELF_PIN_ID,
    // Off until asked for: a hole through the face of a finished door is not
    // something to produce by default.
    handleId: '',
    custom: [],
    handlePlacement: defaultHandlePlacement(),
  };
}

/** Every entry a project can choose from: the built-ins plus its own. */
export function entriesFor(selection: HardwareSelection, kind: HardwareKind): HardwareEntry[] {
  const custom = selection.custom.filter((e) => e.kind === kind);
  return [...CATALOGUE.filter((e) => e.kind === kind), ...custom];
}

/**
 * The entry an id names, optionally of one kind.
 *
 * The project's own entries win, so a custom entry that shadows a built-in id
 * is the one that gets cut rather than the one that happens to ship. Passing a
 * kind matters: without it, a custom *handle* called `blum-clip-top-blumotion`
 * would shadow the hinge of that name and send the hinge to a fallback, while
 * the diagnostic said the id was in neither list.
 */
export function findEntry(
  selection: HardwareSelection,
  id: string,
  kind?: HardwareKind,
): HardwareEntry | undefined {
  const ofKind = (e: HardwareEntry): boolean => kind === undefined || e.kind === kind;
  return (
    selection.custom.find((e) => e.id === id && ofKind(e)) ??
    CATALOGUE.find((e) => e.id === id && ofKind(e))
  );
}

/** One fitting rule, as a sentence rather than a pair of numbers. */
export function describeRequirement(req: Requirement): string {
  const measure = req.measure[0]!.toUpperCase() + req.measure.slice(1);
  // A rule with neither limit checks nothing. Saying so is the point: printing
  // "undefined mm or less" would read as a guard that is in place.
  const range =
    req.min !== undefined && req.max !== undefined
      ? `${req.min} to ${req.max} mm`
      : req.min !== undefined
        ? `${req.min} mm or more`
        : req.max !== undefined
          ? `${req.max} mm or less`
          : 'no limit set, so nothing is checked';
  return `${measure}: ${range} — ${req.why}.`;
}

/**
 * A copy of an entry, for the project to own and edit.
 *
 * Copying rather than editing in place is the whole shape of the catalogue: a
 * built-in stays what its maker publishes, and what you dialled in is yours,
 * saved with the project, and cut on whoever opens it next.
 *
 * Copied field by field rather than through a host clone, because the core
 * leans on no globals — and because these are exactly the nested objects a
 * shared reference would quietly corrupt.
 */
export function copyEntry(source: HardwareEntry, existing: HardwareEntry[]): HardwareEntry {
  const taken = new Set([...CATALOGUE.map((e) => e.id), ...existing.map((e) => e.id)]);
  let id = `${source.id}-mine`;
  for (let n = 2; taken.has(id); n++) id = `${source.id}-mine-${n}`;

  const head = {
    id,
    name: `${source.name} (mine)`,
    source: `Copied from ${source.name} and edited in this project.`,
    requires: source.requires.map((r) => ({ ...r })),
    custom: true,
  };
  if (source.kind === 'hinge') {
    return {
      ...head,
      kind: 'hinge',
      boring: { ...source.boring },
      boringDistanceRange: { ...source.boringDistanceRange },
    };
  }
  if (source.kind === 'shelf-pin')
    return { ...head, kind: 'shelf-pin', boring: { ...source.boring } };
  return { ...head, kind: 'handle', boring: { ...source.boring } };
}

export interface ResolvedHardware {
  hinge: HingeEntry;
  shelfPin: ShelfPinEntry;
  /** Null when no handle is selected, which is the default. */
  handle: HandleEntry | null;
  placement: HandlePlacement;
  /**
   * Ids that named nothing. Falling back silently would cut a project to
   * hardware its author never chose, so this is reported.
   */
  missing: Array<{ kind: HardwareKind; id: string; outcome: string }>;
}

/**
 * Turn the project's ids into the entries the pipeline machines to.
 *
 * An id that matches nothing falls back to the built-in default *and* is
 * reported: a hand-edited file, or one saved by someone who had a custom hinge
 * the recipient does not, would otherwise be cut to the wrong pattern with
 * nothing on screen to say so.
 */
export function resolveHardware(selection: HardwareSelection): ResolvedHardware {
  const missing: ResolvedHardware['missing'] = [];

  const pick = <E extends HardwareEntry>(
    id: string,
    kind: HardwareKind,
    fallback: E | null,
  ): E | null => {
    const found = findEntry(selection, id, kind);
    if (found) return found as E;
    missing.push({
      kind,
      id,
      outcome: fallback
        ? `It is being cut to ${fallback.name} instead.`
        : 'No handles are being bored.',
    });
    return fallback;
  };

  return {
    // A cabinet cannot be built without a hinge pattern and a shelf pin, so
    // those fall back to the default. A handle can: falling back there would
    // drill holes through the front of a finished door for hardware nobody
    // chose, which is worse than boring nothing and saying so.
    hinge: pick<HingeEntry>(selection.hingeId, 'hinge', HINGE_UTRUSTA)!,
    shelfPin: pick<ShelfPinEntry>(selection.shelfPinId, 'shelf-pin', PIN_5MM)!,
    handle: selection.handleId ? pick<HandleEntry>(selection.handleId, 'handle', null) : null,
    placement: selection.handlePlacement,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Reading entries back out of a project file
// ---------------------------------------------------------------------------

const HINGE_KEYS = [
  'cupDiameter',
  'cupDepth',
  'boringDistance',
  'dowelDiameter',
  'dowelSpacing',
  'dowelOffset',
  'dowelDepth',
  'endOffset',
  'plateHoleDiameter',
  'plateHoleDepth',
  'plateHoleSpacing',
  'plateFrontOffset',
] as const;
const PIN_KEYS = ['diameter', 'depth', 'pitch'] as const;
const HANDLE_KEYS = ['centres', 'screwDiameter', 'length'] as const;

const ALL_MEASURES: HardwareMeasure[] = [
  'door thickness',
  'door width',
  'door height',
  'carcass panel thickness',
];

/**
 * One entry as it comes back out of a project file.
 *
 * A project file is JSON somebody can hand-edit, and one written by a later
 * version may carry a kind this one has never heard of. An entry missing any of
 * the numbers its boring is made of is **dropped**, not patched: there is no
 * honest way to guess a hinge's cup depth, and a guess would be what the doors
 * got cut to. The id then names nothing, and the missing-entry diagnostic says
 * so out loud.
 *
 * Fields that only describe — the fitting rules, the range a boring distance is
 * allowed in — are filled in instead, because nothing is machined from them.
 */
export function readEntry(raw: unknown): HardwareEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || e.id === '') return null;

  const head = {
    id: e.id,
    name: typeof e.name === 'string' && e.name !== '' ? e.name : e.id,
    source: typeof e.source === 'string' ? e.source : 'Described in this project.',
    requires: Array.isArray(e.requires) ? e.requires.filter(isRequirement) : [],
    custom: true,
  };
  const boring = e.boring as Record<string, unknown> | undefined;

  if (e.kind === 'hinge' && hasNumbers(boring, HINGE_KEYS)) {
    const range = e.boringDistanceRange as { min?: unknown; max?: unknown } | undefined;
    return {
      ...head,
      kind: 'hinge',
      boring: boring as unknown as HingeSpec,
      // 3-8 mm is what this generator accepted before entries carried a range
      // of their own, so it is the safe thing to assume of one that does not.
      boringDistanceRange: {
        min: typeof range?.min === 'number' ? range.min : 3,
        max: typeof range?.max === 'number' ? range.max : 8,
      },
    };
  }
  if (e.kind === 'shelf-pin' && hasNumbers(boring, PIN_KEYS)) {
    return { ...head, kind: 'shelf-pin', boring: boring as unknown as ShelfPinBoring };
  }
  if (
    boring &&
    e.kind === 'handle' &&
    hasNumbers(boring, HANDLE_KEYS) &&
    (boring.style === 'bar' || boring.style === 'knob')
  ) {
    return { ...head, kind: 'handle', boring: boring as unknown as HandleBoring };
  }
  return null;
}

function hasNumbers(o: Record<string, unknown> | undefined, keys: readonly string[]): boolean {
  return !!o && keys.every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]));
}

function isRequirement(raw: unknown): raw is Requirement {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  if (!ALL_MEASURES.includes(r.measure as HardwareMeasure)) return false;
  if (r.min !== undefined && typeof r.min !== 'number') return false;
  if (r.max !== undefined && typeof r.max !== 'number') return false;
  return typeof r.why === 'string';
}
