import { describe, expect, it } from 'vitest';
import {
  bboxOf,
  buildProject,
  copyEntry,
  describeRequirement,
  entriesFor,
  measuresFor,
  defaultParams,
  exportProject,
  HANDLE_BAR_128,
  HANDLE_KNOB,
  HINGE_BLUM_CLIP_TOP,
  HINGE_HETTICH_SENSYS,
  HINGE_UTRUSTA,
  normaliseParams,
  partsNeedingFlip,
  PIN_5MM,
  PIN_QUARTER_INCH,
  resolveHardware,
  type Diagnostic,
  type HingeEntry,
  type ShelfPinEntry,
} from '../src/index.js';
import type { DrillFeature, Part, ProjectParams } from '../src/model/types.js';

const find = (parts: Part[], id: string): Part => parts.find((p) => p.id === id)!;
const drills = (p: Part, purpose: string): DrillFeature[] =>
  p.features.filter((f): f is DrillFeature => f.kind === 'drill' && f.purpose === purpose);
const said = (ds: Diagnostic[], text: string): Diagnostic | undefined =>
  ds.find((d) => d.message.includes(text));

const project = (patch: (p: ProjectParams) => void = () => {}) => {
  const p = defaultParams();
  patch(p);
  return buildProject(p);
};

/** Doors and adjustable shelves both live on the default project already. */
const DOOR = 'C1-B-DOOR-2';
const PIN_PANEL = 'C1-T-SIDE-R';

describe('the catalogue entries themselves', () => {
  it('reproduces the boring the generator shipped with, under the UTRUSTA id', () => {
    // The default project selects this entry, and golden.test.ts compares its
    // DXF byte for byte against files written before there was a catalogue. If
    // any of these drifted, that comparison is the thing that would fail — but
    // it would fail as a wall of hex, so the numbers are pinned here by name.
    expect(HINGE_UTRUSTA.boring).toEqual({
      cupDiameter: 35,
      cupDepth: 13,
      boringDistance: 5,
      dowelDiameter: 8,
      dowelSpacing: 45,
      dowelOffset: 9.5,
      dowelDepth: 12,
      endOffset: 76.2,
      plateHoleDiameter: 5,
      plateHoleDepth: 12,
      plateHoleSpacing: 32,
      plateFrontOffset: 37,
    });
  });

  it('carries what Blum publishes for CLIP top BLUMOTION', () => {
    // From Blum's own 110° sheet: "Boring distance range 3 mm to 7 mm", "All
    // 35 mm and 8 mm holes must be a minimum of 13 mm deep", and a minimum
    // reveal table running from a 16 mm to a 26 mm door.
    expect(HINGE_BLUM_CLIP_TOP.boringDistanceRange).toEqual({ min: 3, max: 7 });
    expect(HINGE_BLUM_CLIP_TOP.boring.cupDepth).toBe(13);
    expect(HINGE_BLUM_CLIP_TOP.boring.dowelDepth).toBe(13);
    const thickness = HINGE_BLUM_CLIP_TOP.requires.find((r) => r.measure === 'door thickness');
    expect(thickness?.min).toBe(16);
    expect(thickness?.max).toBe(26);
  });

  it('carries what Hettich publish for the Sensys 8645i', () => {
    // Their sheet: 35 mm cup bored 12.8 mm deep, TB pattern 45 x 9.5 with
    // 8 x 11 sockets, for a 15-24 mm door.
    expect(HINGE_HETTICH_SENSYS.boring.cupDepth).toBe(12.8);
    expect(HINGE_HETTICH_SENSYS.boring.dowelDepth).toBe(11);
    const thickness = HINGE_HETTICH_SENSYS.requires.find((r) => r.measure === 'door thickness');
    expect(thickness?.min).toBe(15);
    expect(thickness?.max).toBe(24);
  });

  it('keeps every shipped hinge on the one dowel pattern the trade bores', () => {
    // 45 mm centres, 9.5 mm behind the cup centre line. The other two patterns
    // Hettich publish for this very hinge — 48 x 6 and 52 x 5.5 — are why the
    // pattern is data on the entry rather than a constant in the boring code.
    for (const h of [HINGE_UTRUSTA, HINGE_BLUM_CLIP_TOP, HINGE_HETTICH_SENSYS]) {
      expect(h.boring.dowelSpacing).toBe(45);
      expect(h.boring.dowelOffset).toBe(9.5);
      expect(h.boring.cupDiameter).toBe(35);
    }
  });

  it('indexes both shelf pins on the 32 mm pitch, whatever the pin measures', () => {
    expect(PIN_5MM.boring).toEqual({ diameter: 5, depth: 12, pitch: 32 });
    // Kreg's 1/4 in jig steps at the same 1-1/4 in (32 mm) as the 5 mm one, so
    // a US pin does not mean a different ladder.
    expect(PIN_QUARTER_INCH.boring.pitch).toBe(32);
    expect(PIN_QUARTER_INCH.boring.diameter).toBeCloseTo(6.35, 6);
  });

  it('sizes handle centres on the 32 mm system', () => {
    expect(HANDLE_BAR_128.boring.centres % 32).toBe(0);
    expect(HANDLE_BAR_128.boring.screwDiameter).toBe(4.5); // M4 clearance
    expect(HANDLE_KNOB.boring.centres).toBe(0);
  });

  it('says where every number came from', () => {
    // A dimension with no source is one nobody can check, and this generator
    // cuts plywood from these.
    for (const entry of [HINGE_UTRUSTA, HINGE_BLUM_CLIP_TOP, PIN_5MM, HANDLE_BAR_128]) {
      expect(entry.source.length).toBeGreaterThan(20);
    }
  });
});

describe('describing an entry to the person choosing it', () => {
  it('reads a fitting rule back as a sentence', () => {
    expect(describeRequirement(HINGE_BLUM_CLIP_TOP.requires[0]!)).toContain(
      'Door thickness: 16 to 26 mm',
    );
    expect(
      describeRequirement({ measure: 'door width', min: 300, why: 'it is a wide handle' }),
    ).toBe('Door width: 300 mm or more — it is a wide handle.');
    expect(
      describeRequirement({
        measure: 'door height',
        max: 2100,
        why: 'two hinges stop being enough',
      }),
    ).toBe('Door height: 2100 mm or less — two hinges stop being enough.');
  });

  it('lists the built-ins of one kind, then the ones the project added', () => {
    const p = defaultParams();
    p.hardware.custom = [{ ...PIN_5MM, id: 'mine', name: 'Mine', custom: true }];
    const ids = entriesFor(p.hardware, 'shelf-pin').map((e) => e.id);
    expect(ids).toEqual(['pin-5mm', 'pin-quarter-inch', 'mine']);
    // And nothing of another kind leaks into the list a picker would show.
    expect(entriesFor(p.hardware, 'handle').every((e) => e.kind === 'handle')).toBe(true);
  });

  it('copies an entry deeply, so editing the copy cannot touch the built-in', () => {
    // A shared reference here would rewrite the shipped hinge for every project
    // opened afterwards in the same session.
    const copy = copyEntry(HINGE_UTRUSTA, []) as HingeEntry;
    copy.boring.cupDepth = 99;
    copy.requires[0]!.min = 99;
    copy.boringDistanceRange.max = 99;
    expect(HINGE_UTRUSTA.boring.cupDepth).toBe(13);
    expect(HINGE_UTRUSTA.requires[0]!.min).toBe(16);
    expect(HINGE_UTRUSTA.boringDistanceRange.max).toBe(6);
  });

  it('gives each copy an id of its own', () => {
    const first = copyEntry(HINGE_UTRUSTA, []);
    const second = copyEntry(HINGE_UTRUSTA, [first]);
    expect(first.id).not.toBe(second.id);
    expect(first.custom).toBe(true);
  });
});

describe('choosing hardware by id', () => {
  it('cuts to the entry the project names, not to a default', () => {
    const blum = project((p) => {
      p.hardware.hingeId = HINGE_BLUM_CLIP_TOP.id;
    });
    // Blum bores its dowels as deep as the cup; UTRUSTA does not.
    for (const d of drills(find(blum.parts, DOOR), 'hinge-dowel')) expect(d.depth).toBe(13);
    expect(drills(find(project().parts, DOOR), 'hinge-dowel')[0]!.depth).toBe(12);
  });

  it('changes the shelf pin ladder when a different pin is chosen', () => {
    const us = project((p) => {
      p.hardware.shelfPinId = PIN_QUARTER_INCH.id;
    });
    const holes = drills(find(us.parts, PIN_PANEL), 'shelf-pin');
    expect(holes.length).toBeGreaterThan(20);
    for (const h of holes) expect(h.diameter).toBeCloseTo(6.35, 6);
  });

  it('uses a custom entry over a built-in of the same id, and says it is doing so', () => {
    // Whichever way this went silently would be wrong: preferring the built-in
    // throws away numbers somebody typed, preferring the project's makes a
    // shadowed entry look like the shipped one.
    const shadow = project((p) => {
      p.hardware.custom = [
        {
          ...HINGE_UTRUSTA,
          custom: true,
          boring: { ...HINGE_UTRUSTA.boring, cupDepth: 11 },
        } satisfies HingeEntry,
      ];
    });
    const cup = find(shadow.parts, DOOR).features.find((f) => f.kind === 'pocket');
    expect(cup?.kind === 'pocket' && cup.depth).toBe(11);
    expect(said(shadow.diagnostics, 'also the id of a built-in')?.severity).toBe('warning');
  });

  it('survives being saved and opened again', () => {
    const mine: ShelfPinEntry = {
      ...PIN_5MM,
      id: 'my-pin',
      name: 'The pins in my drawer',
      custom: true,
      boring: { diameter: 5, depth: 10, pitch: 32 },
    };
    const p = defaultParams();
    p.hardware.custom = [mine];
    p.hardware.shelfPinId = 'my-pin';

    // A requirement has to survive a round trip through a file, which is the
    // whole reason it is data rather than a predicate.
    const reopened = normaliseParams(JSON.parse(JSON.stringify(p)));
    expect(resolveHardware(reopened.hardware).shelfPin.boring.depth).toBe(10);
    expect(resolveHardware(reopened.hardware).shelfPin.requires[0]?.measure).toBe(
      'carcass panel thickness',
    );
  });
});

describe('opening a project written before the catalogue', () => {
  it('selects the built-in when the numbers are the ones it shipped with', () => {
    const old = { ...defaultParams(), hinge: { ...HINGE_UTRUSTA.boring } } as unknown;
    delete (old as Record<string, unknown>).hardware;
    expect(normaliseParams(old).hardware.hingeId).toBe('utrusta');
    expect(normaliseParams(old).hardware.custom).toHaveLength(0);
  });

  it('keeps a hinge somebody had dialled in, as an entry of the project', () => {
    // Snapping this back to the default would quietly re-bore their doors 2 mm
    // further from the edge than the ones already hanging in their kitchen.
    const old = {
      ...defaultParams(),
      hinge: { ...HINGE_UTRUSTA.boring, boringDistance: 3 },
    } as unknown;
    delete (old as Record<string, unknown>).hardware;
    const back = normaliseParams(old);
    expect(back.hardware.hingeId).toBe('project-hinge');
    expect(resolveHardware(back.hardware).hinge.boring.boringDistance).toBe(3);
    // And the holes still land where that project's did: 3 mm to the edge of
    // the cup, so 20.5 mm to its centre.
    const door = find(buildProject(back).parts, DOOR);
    const cup = door.features.find((f) => f.kind === 'pocket' && f.purpose === 'hinge-cup');
    expect(cup?.kind === 'pocket' && bboxOf(cup.path)).toMatchObject({ minX: 3 });
  });

  it('gives the migrated entry rules of its own, never the built-in objects', () => {
    // The migrated entry is editable. A shared rule object would let editing it
    // rewrite the shipped hinge for every project opened after it in the same
    // process, and the warning that would go missing is the one saying the cup
    // bottoms out.
    const old = {
      ...defaultParams(),
      hinge: { ...HINGE_UTRUSTA.boring, boringDistance: 3 },
    } as unknown;
    delete (old as Record<string, unknown>).hardware;
    const mine = normaliseParams(old).hardware.custom[0]!;
    expect(mine.requires[0]).not.toBe(HINGE_UTRUSTA.requires[0]);
    mine.requires[0]!.min = 999;
    expect(HINGE_UTRUSTA.requires[0]!.min).toBe(16);
  });

  it('carries a hand-tuned shelf pin across the same way', () => {
    const old = {
      ...defaultParams(),
      joinery: {
        ...defaultParams().joinery,
        shelfPin: {
          diameter: 6,
          depth: 12,
          pitch: 32,
          frontOffset: 37,
          backOffset: 37,
          startAbove: 100,
          endBelow: 100,
        },
      },
    } as unknown;
    delete (old as Record<string, unknown>).hardware;
    const back = normaliseParams(old);
    expect(resolveHardware(back.hardware).shelfPin.boring.diameter).toBe(6);
    // The layout half stays where it always was, in the joinery settings.
    expect(back.joinery.shelfPin.frontOffset).toBe(37);
  });

  it('cuts a legacy file byte for byte the way it used to be cut', () => {
    // The strongest form of the promise this migration makes: someone opens a
    // project from before the catalogue, exports it, and gets the same file.
    const legacy = JSON.parse(JSON.stringify(defaultParams()));
    delete legacy.hardware;
    legacy.hinge = { ...HINGE_UTRUSTA.boring };
    legacy.joinery.shelfPin = {
      diameter: 5,
      depth: 12,
      pitch: 32,
      frontOffset: 37,
      backOffset: 37,
      startAbove: 100,
      endBelow: 100,
    };
    const bytes = (x: ProjectParams): string =>
      exportProject(buildProject(x))
        .files.map((f) => f.dxf)
        .join('\n');
    expect(bytes(normaliseParams(legacy))).toBe(bytes(defaultParams()));
  });

  it('leaves a file that already names its hardware alone', () => {
    const p = defaultParams();
    p.hardware.hingeId = HINGE_HETTICH_SENSYS.id;
    const raw = {
      ...JSON.parse(JSON.stringify(p)),
      hinge: { ...HINGE_UTRUSTA.boring, cupDepth: 2 },
    };
    expect(normaliseParams(raw).hardware.hingeId).toBe(HINGE_HETTICH_SENSYS.id);
    expect(normaliseParams(raw).hardware.custom).toHaveLength(0);
  });
});

describe('a project file with something wrong in it', () => {
  it('drops a custom entry with no boring numbers, rather than taking the pipeline down', () => {
    // Straight from a hand-edited file. Reaching the boring code with no cup
    // depth threw, which in the app is a blank screen and no diagnostic at all.
    const raw = JSON.parse(JSON.stringify(defaultParams()));
    raw.hardware.custom = [{ id: 'broken', kind: 'hinge', name: 'Broken' }];
    raw.hardware.hingeId = 'broken';
    const p = buildProject(normaliseParams(raw));
    expect(said(p.diagnostics, '"broken"')?.severity).toBe('warning');
    expect(said(p.diagnostics, '"broken"')?.message).toContain(HINGE_UTRUSTA.name);
    // And it still produces a cuttable door rather than nothing.
    expect(
      find(p.parts, DOOR).features.some((f) => 'purpose' in f && f.purpose === 'hinge-cup'),
    ).toBe(true);
  });

  it('keeps an entry that is only missing its fitting rules', () => {
    // Nothing is machined from a rule, so losing the whole hinge over one is
    // throwing away numbers somebody measured.
    const raw = JSON.parse(JSON.stringify(defaultParams()));
    raw.hardware.custom = [
      { ...JSON.parse(JSON.stringify(HINGE_UTRUSTA)), id: 'norules', requires: undefined },
    ];
    raw.hardware.hingeId = 'norules';
    const back = normaliseParams(raw);
    expect(resolveHardware(back.hardware).hinge.id).toBe('norules');
    expect(resolveHardware(back.hardware).hinge.requires).toEqual([]);
    expect(buildProject(back).diagnostics.filter((d) => d.topic === 'hardware')).toHaveLength(0);
  });

  it('drops a rule naming a measure this version has never heard of', () => {
    const raw = JSON.parse(JSON.stringify(defaultParams()));
    raw.hardware.custom = [
      {
        ...JSON.parse(JSON.stringify(PIN_5MM)),
        id: 'from-the-future',
        requires: [{ measure: 'drawer box width', min: 100, why: 'a later version knew' }],
      },
    ];
    raw.hardware.shelfPinId = 'from-the-future';
    const back = normaliseParams(raw);
    expect(resolveHardware(back.hardware).shelfPin.requires).toEqual([]);
  });

  it('bores no handle at all when the handle id names nothing', () => {
    // The one place falling back to a default is wrong: it would put holes
    // through the front of a finished door for hardware nobody chose.
    const p = project((x) => {
      x.hardware.handleId = 'a-handle-from-a-colleague';
    });
    for (const part of p.parts) expect(drills(part, 'handle')).toHaveLength(0);
    expect(said(p.diagnostics, 'No handles are being bored')?.severity).toBe('warning');
  });
});

describe('what the hardware says about the job it is put on', () => {
  const thinDoors = (thickness: number) => (p: ProjectParams) => {
    p.materials.push({
      ...p.materials[0]!,
      id: 'door-stock',
      name: `${thickness} mm door stock`,
      actualThickness: thickness,
    });
    p.doors.materialId = 'door-stock';
  };

  it('warns when the door is thinner than the hinge is made for', () => {
    const p = project(thinDoors(15.5));
    const thin = p.diagnostics.filter((d) => d.message.includes('needs at least 16 mm'));
    // Named panel by panel, so the previews can point at the doors in question
    // rather than the user hunting for which one is wrong.
    expect(thin.map((d) => d.partIds?.[0]).sort()).toEqual(['C1-B-DOOR-1', 'C1-B-DOOR-2']);
    expect(thin[0]?.severity).toBe('warning');
    expect(thin[0]?.message).toContain('bottoms out');
  });

  it('warns when the door is thicker than the hinge is made for', () => {
    const p = project((x) => {
      thinDoors(25)(x);
      x.hardware.hingeId = HINGE_UTRUSTA.id; // published to 24 mm
    });
    expect(said(p.diagnostics, 'no more than 24 mm')?.severity).toBe('warning');
  });

  it('accepts the same door once a hinge published for it is chosen', () => {
    const p = project((x) => {
      thinDoors(25)(x);
      x.hardware.hingeId = HINGE_BLUM_CLIP_TOP.id; // published to 26 mm
    });
    expect(said(p.diagnostics, 'no more than')).toBeUndefined();
  });

  it('calls a cup deeper than the door an error, not a warning', () => {
    // This one is not a fitting rule, it is arithmetic: the cutter comes out
    // the front of the door.
    const p = project(thinDoors(11.9));
    expect(said(p.diagnostics, 'straight through')?.severity).toBe('error');
  });

  it('warns when there is barely any material left behind the cup', () => {
    const p = project(thinDoors(15.5));
    expect(said(p.diagnostics, 'leaves only 2.5 mm')?.severity).toBe('warning');
  });

  it('reports plate holes that would show on the outside of the cabinet', () => {
    const p = project((x) => {
      x.hardware.custom = [
        {
          ...HINGE_UTRUSTA,
          id: 'long-screws',
          custom: true,
          boring: { ...HINGE_UTRUSTA.boring, plateHoleDepth: 20 },
        },
      ];
      x.hardware.hingeId = 'long-screws';
    });
    expect(said(p.diagnostics, 'mounting plate holes')?.severity).toBe('error');
  });

  it('warns about a shelf pin the carcass is too thin for', () => {
    const p = project((x) => {
      x.materials[0]!.actualThickness = 14;
      x.hardware.shelfPinId = PIN_QUARTER_INCH.id; // published minimum 16 mm
    });
    const d = said(p.diagnostics, 'shows on the outside of the cabinet');
    expect(d?.severity).toBe('warning');
    expect(d?.partIds?.[0]).toContain('SIDE');
  });

  it('says nothing about hardware the project does not use', () => {
    // The requirements only fire against panels the holes were actually cut
    // in, so a project with no doors hears nothing about hinges.
    const p = project((x) => {
      for (const carcass of x.cabinets[0]!.carcasses) {
        for (const bay of carcass.bays) bay.doors = 'none';
      }
      x.materials.push({ ...x.materials[0]!, id: 'thin-door', actualThickness: 6 });
      x.doors.materialId = 'thin-door';
    });
    expect(p.diagnostics.filter((d) => d.topic === 'hardware')).toHaveLength(0);
  });
});

describe('a rule that could never fire', () => {
  it('says so when the measure is one this kind of hardware never touches', () => {
    // Reachable from the panel before it filtered the list, and from any file.
    // Silence here reads as "the rule is satisfied" when it was never run.
    const p = project((x) => {
      x.hardware.custom = [
        {
          ...PIN_5MM,
          id: 'confused',
          name: 'A confused pin',
          custom: true,
          requires: [{ measure: 'door thickness', min: 40, why: 'someone meant the panel' }],
        },
      ];
      x.hardware.shelfPinId = 'confused';
    });
    const d = said(p.diagnostics, 'never fitted to');
    expect(d?.severity).toBe('warning');
    expect(d?.message).toContain('door thickness');
  });

  it('says so when the rule has neither a minimum nor a maximum', () => {
    const p = project((x) => {
      x.hardware.custom = [
        {
          ...HINGE_UTRUSTA,
          id: 'blank-rule',
          name: 'A hinge with a blank rule',
          custom: true,
          requires: [{ measure: 'door thickness', why: 'both limits were cleared' }],
        },
      ];
      x.hardware.hingeId = 'blank-rule';
    });
    expect(said(p.diagnostics, 'neither a minimum nor a maximum')?.severity).toBe('warning');
  });

  it('offers only the measures a kind is bored into', () => {
    expect(measuresFor('shelf-pin')).toEqual(['carcass panel thickness']);
    expect(measuresFor('handle')).not.toContain('carcass panel thickness');
    // A hinge is the one that touches both a door and the panel it hangs from.
    expect(measuresFor('hinge')).toContain('door thickness');
    expect(measuresFor('hinge')).toContain('carcass panel thickness');
  });

  it('reads a limitless rule back as one that checks nothing', () => {
    expect(describeRequirement({ measure: 'door thickness', why: 'both were cleared' })).toBe(
      'Door thickness: no limit set, so nothing is checked — both were cleared.',
    );
  });
});

describe('diagnostics that must not cry wolf', () => {
  it('says nothing about a boring distance when no hinge is bored', () => {
    const p = project((x) => {
      for (const carcass of x.cabinets[0]!.carcasses)
        for (const bay of carcass.bays) bay.doors = 'none';
      x.hardware.custom = [
        {
          ...HINGE_UTRUSTA,
          id: 'wild',
          custom: true,
          boring: { ...HINGE_UTRUSTA.boring, boringDistance: 20 },
        },
      ];
      x.hardware.hingeId = 'wild';
    });
    expect(said(p.diagnostics, 'outside the')).toBeUndefined();
  });

  it('only claims a shadowed entry is being cut when it actually is', () => {
    const p = project((x) => {
      x.hardware.custom = [
        { ...PIN_5MM, custom: true, name: 'Not selected', boring: { ...PIN_5MM.boring, depth: 9 } },
      ];
      x.hardware.shelfPinId = PIN_QUARTER_INCH.id;
    });
    // The 5 mm entry is shadowed but nothing is being cut to it, and the holes
    // really are 6.35 mm. Saying otherwise is a diagnostic that is itself wrong.
    expect(said(p.diagnostics, 'also the id of a built-in')).toBeUndefined();
    expect(drills(find(p.parts, PIN_PANEL), 'shelf-pin')[0]!.diameter).toBeCloseTo(6.35, 6);
  });

  it('resolves an id to the entry of the right kind, not merely the right name', () => {
    // A custom handle carrying a hinge's id used to shadow it, sending the
    // hinge to a fallback while the warning claimed the id was in neither list.
    const p = project((x) => {
      x.hardware.custom = [
        { ...HANDLE_BAR_128, id: HINGE_BLUM_CLIP_TOP.id, name: 'Oddly named handle', custom: true },
      ];
      x.hardware.hingeId = HINGE_BLUM_CLIP_TOP.id;
    });
    // Blum bores its dowels 13 mm deep; the fallback would have bored 12.
    expect(drills(find(p.parts, DOOR), 'hinge-dowel')[0]!.depth).toBe(13);
    expect(said(p.diagnostics, 'not in the catalogue')).toBeUndefined();
  });

  it('catches a bar handle with no fixing centres', () => {
    // Only one of its two holes can be drilled, and every other handle check
    // steps over the single-hole case.
    const p = project((x) => {
      x.hardware.custom = [
        {
          ...HANDLE_BAR_128,
          id: 'no-centres',
          name: 'A bar with no centres',
          custom: true,
          boring: { ...HANDLE_BAR_128.boring, centres: 0 },
        },
      ];
      x.hardware.handleId = 'no-centres';
    });
    expect(said(p.diagnostics, 'no fixing centres')?.severity).toBe('error');
  });
});

describe('handles', () => {
  const withHandles = (patch: (p: ProjectParams) => void = () => {}) =>
    project((p) => {
      p.hardware.handleId = HANDLE_BAR_128.id;
      patch(p);
    });

  it('bores nothing at all until a handle is chosen', () => {
    for (const part of project().parts) {
      expect(drills(part, 'handle')).toHaveLength(0);
    }
  });

  it('drills two clearance holes at the handle centres', () => {
    const door = find(withHandles().parts, DOOR);
    const screws = drills(door, 'handle');
    expect(screws).toHaveLength(2);
    for (const s of screws) {
      expect(s.diameter).toBe(4.5);
      expect(s.depth).toBe('thru'); // the screw goes into the back of the handle
    }
    expect(Math.abs(screws[0]!.y - screws[1]!.y)).toBeCloseTo(128, 6);
  });

  it('puts the handle on the opening edge, on whichever side the hinges are not', () => {
    const p = withHandles();
    // DOOR-2 is hinged on its right, which is local x zero; DOOR-1 the other
    // way about. Both handles must end up on the edge a hand reaches for.
    const two = find(p.parts, DOOR);
    const one = find(p.parts, 'C1-B-DOOR-1');
    expect(drills(two, 'handle')[0]!.x).toBeCloseTo(two.width - 35, 6);
    expect(drills(one, 'handle')[0]!.x).toBeCloseTo(35, 6);
  });

  it('measures the offset from the end of the door the handle sits at', () => {
    const door = find(withHandles().parts, DOOR);
    const ys = drills(door, 'handle')
      .map((s) => s.y)
      .sort((a, b) => a - b);
    expect(ys[1]).toBeCloseTo(door.height - 50, 6);
    expect(ys[0]).toBeCloseTo(door.height - 50 - 128, 6);
  });

  it('drills one hole for a knob, centred when asked', () => {
    const door = find(
      withHandles((p) => {
        p.hardware.handleId = HANDLE_KNOB.id;
        p.hardware.handlePlacement.from = 'centre';
      }).parts,
      DOOR,
    );
    const screws = drills(door, 'handle');
    expect(screws).toHaveLength(1);
    expect(screws[0]!.y).toBeCloseTo(door.height / 2, 6);
  });

  it('centres a horizontal handle across the door', () => {
    const door = find(
      withHandles((p) => {
        p.hardware.handlePlacement.orientation = 'horizontal';
      }).parts,
      DOOR,
    );
    const xs = drills(door, 'handle').map((s) => s.x);
    expect((xs[0]! + xs[1]!) / 2).toBeCloseTo(door.width / 2, 6);
    expect(Math.abs(xs[0]! - xs[1]!)).toBeCloseTo(128, 6);
  });

  it('does not turn a door into a two-sided part', () => {
    // A through hole can be cut from either face, so a handle must not cost an
    // extra setup on a door that would otherwise need only one.
    const p = withHandles();
    const flipped = partsNeedingFlip(p.parts).map((x) => x.id);
    expect(flipped).not.toContain(DOOR);
  });

  it('warns when the handle stands past the end of the door', () => {
    const p = withHandles((x) => {
      x.hardware.handlePlacement.endOffset = 10;
    });
    // A 128 mm bar is taken as 178 mm overall, so 25 mm of it sits above the
    // top screw and 15 mm of that is past the top of the door.
    const d = said(p.diagnostics, 'past the edge of the door');
    expect(d?.severity).toBe('warning');
    expect(d?.message).toContain('15.0 mm');
  });

  it('calls a fixing hole off the blank an error', () => {
    const p = withHandles((x) => {
      x.hardware.handlePlacement.endOffset = 0;
    });
    expect(said(p.diagnostics, 'off the edge of the blank')?.severity).toBe('error');
  });

  it('reports where the holes ended up, since they go through a finished face', () => {
    const info = said(withHandles().diagnostics, 'drilled for a');
    expect(info?.severity).toBe('info');
    expect(info?.message).toContain('35 mm in from the opening edge');
    expect(info?.message).toContain('50 mm from the top');
  });
});
