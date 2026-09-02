import { describe, expect, it } from 'vitest';
import { buildProject, defaultParams, type Part, type ProjectParams } from '@cabgen/core';
import { CATALOG } from '../src/catalog';
import { TOPICS, searchTopics, topicById, topicForPurpose } from '../src/explain/topics';
import { SUGGESTIONS } from '../src/explain/suggestions';
import { machiningOf, sectionThrough } from '../src/explain/features';
import { STARTERS } from '../src/gallery/starters';
import { sampleParams, sampleProject } from '../src/gallery/samples';
import { draw } from '../src/gallery/render';
import { applyWorkshop, workshopOf } from '../src/workshop';

/**
 * The explanations, held to the code and the docs they came from.
 *
 * R-19's hardest acceptance criterion is that no explanation can drift from
 * what the tool does. Three ways it could, and one test each:
 *
 * 1. **The doc it came from is rewritten.** Every topic cites a heading in
 *    `docs/` and the phrases it leans on; if a section is renamed or its
 *    reasoning changes, the sentence in the app fails here rather than going
 *    on being believed.
 * 2. **The picture stops being of the thing.** Every topic that claims a
 *    capability is asserted to actually contain it in the sample it renders.
 *    A tile of a plain box under the heading "Through tab and slot" is worse
 *    than no tile.
 * 3. **The geometry moves and the pointer does not follow.** Every feature
 *    the pipeline produces has to be explicable, every explanation has to
 *    reach a real control, and a section through a joint has to actually cut
 *    it — "it drew something" is not "the groove is in it".
 */

/**
 * The docs themselves, pulled in through Vite rather than read off the disk.
 *
 * The app's tests are typechecked with the app's own `types`, which is
 * `vite/client` and nothing else — deliberately, so nothing in `apps/web` can
 * quietly start using a Node API it will not have in a browser. Vite's raw
 * import gets the same bytes without that.
 */
const DOCS = import.meta.glob('../../../docs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function docText(file: string): string {
  const key = Object.keys(DOCS).find((k) => k.endsWith(`/${file}`));
  if (key === undefined) throw new Error(`no docs/${file}`);
  return DOCS[key]!;
}

/** The body of one `##`/`###` section, so a phrase is checked where it belongs. */
function section(file: string, heading: string): string | null {
  const lines = docText(file).split('\n');
  const start = lines.findIndex(
    (l) => /^#{2,4} /.test(l) && l.replace(/^#+ /, '').trim() === heading,
  );
  if (start === -1) return null;
  const level = (lines[start]!.match(/^#+/) ?? ['##'])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i]!.match(/^(#{1,6}) /);
    if (m && m[1]!.length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/**
 * A shop that can cut anything, so a sample's diagnostics are the design's own
 * doing rather than the shipped 1000 mm bed's. Same reasoning as gallery.test.
 */
function roomy(): ProjectParams {
  const p = defaultParams();
  p.machine = { ...p.machine, travelX: 3000, travelY: 1600 };
  return p;
}

describe('every explanation is answerable to a doc', () => {
  it.each(TOPICS.map((t) => [t.id, t]))('%s cites a section that exists', (_id, entry) => {
    const topic = entry as (typeof TOPICS)[number];
    const body = section(topic.source.doc, topic.source.heading);
    expect(
      body,
      `docs/${topic.source.doc} has no section "${topic.source.heading}"`,
    ).not.toBeNull();
  });

  it.each(TOPICS.map((t) => [t.id, t]))(
    '%s still stands on what that section says',
    (_id, entry) => {
      const topic = entry as (typeof TOPICS)[number];
      const body = section(topic.source.doc, topic.source.heading) ?? '';
      // Markdown hard-wraps its paragraphs and the app does not, so a phrase
      // that is one sentence in both is two lines in one of them. Apostrophes
      // differ the same way: typographic in the app's prose, straight in the
      // docs.
      const flat = (s: string): string => s.replace(/[’']/g, "'").replace(/\s+/g, ' ');
      for (const phrase of topic.grounds) {
        expect(
          flat(body).includes(flat(phrase)),
          `${topic.id}: docs/${topic.source.doc} › ${topic.source.heading} no longer says "${phrase}"`,
        ).toBe(true);
      }
      expect(topic.grounds.length, `${topic.id} stands on nothing`).toBeGreaterThan(0);
    },
  );

  // A number written into a sentence is a copy of a number that lives
  // somewhere else, and copies rot: a hinge cup centre typed here would still
  // read 52.5 mm after somebody chose a different hinge. Anything with a
  // dimension in it goes through `measures`, off the live project.
  it('never writes a dimension into a sentence', () => {
    for (const topic of TOPICS) {
      const prose = `${topic.what} ${topic.why}`;
      const dimensions = prose.match(/\b\d+(\.\d+)?\s?mm\b/g) ?? [];
      // 32 mm and 35 mm are the names of standards rather than measurements
      // this tool decides — the "32 mm system", a "35 mm cup" — and appear as
      // such in the docs they are cited from.
      const decided = dimensions.filter((d) => !/^(32|35)\s?mm$/.test(d));
      expect(decided, `${topic.id} states a dimension instead of measuring it`).toEqual([]);
    }
  });

  it('points every topic at a control that exists', () => {
    const paths = new Set(CATALOG.map((e) => e.path));
    for (const topic of TOPICS) {
      if (topic.param === undefined) continue;
      expect(
        paths.has(topic.param),
        `${topic.id} points at "${topic.param}", which no control claims`,
      ).toBe(true);
    }
  });

  // "There is nothing worth drawing" and "nobody drew it" look the same from
  // outside. Only one of them is honest, so the honest one has to say so.
  it('says why, wherever there is no picture', () => {
    for (const topic of TOPICS) {
      if (topic.picture) continue;
      expect(topic.insteadOfAPicture, `${topic.id} has no picture and no reason`).toBeDefined();
      expect(topic.insteadOfAPicture!.length).toBeGreaterThan(40);
    }
  });

  it('asks a question in the title and answers it underneath', () => {
    for (const topic of TOPICS) {
      expect(topic.what.length, `${topic.id}`).toBeGreaterThan(40);
      expect(topic.why.length, `${topic.id}`).toBeGreaterThan(40);
      expect(topic.what).not.toBe(topic.why);
    }
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
  });
});

describe('every picture is of the thing it names', () => {
  const withPictures = TOPICS.filter((t) => t.picture);

  it.each(withPictures.map((t) => [t.id, t]))('%s builds and draws', (_id, entry) => {
    const topic = entry as (typeof TOPICS)[number];
    const project = sampleProject(roomy(), topic.picture!.seed);
    expect(project.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message)).toEqual(
      [],
    );
    const drawing = draw(project, topic.picture!.view);
    expect(drawing.shapes.length, `${topic.id} drew nothing`).toBeGreaterThan(0);
  });

  // The one that catches an explanation of something that is not in the
  // picture. Every topic that knows how to recognise itself has to find
  // itself in its own sample.
  it.each(withPictures.filter((t) => t.present).map((t) => [t.id, t]))(
    '%s really contains what it explains',
    (_id, entry) => {
      const topic = entry as (typeof TOPICS)[number];
      const params = sampleParams(roomy(), topic.picture!.seed);
      const project = buildProject(params);
      expect(topic.present!(project, params), `${topic.id}'s own sample does not contain it`).toBe(
        true,
      );
    },
  );
});

describe('what a starter demonstrates', () => {
  it.each(STARTERS.map((s) => [s.id, s]))('%s claims capabilities that exist', (_id, entry) => {
    const starter = entry as (typeof STARTERS)[number];
    expect(starter.demonstrates.length, `${starter.id} demonstrates nothing`).toBeGreaterThan(0);
    for (const id of starter.demonstrates) {
      expect(topicById(id), `${starter.id} names "${id}", which is not a topic`).toBeDefined();
    }
  });

  // A lesson that stopped being true is worse than no lesson, because
  // somebody loaded the design to look at the thing it promised.
  it.each(STARTERS.map((s) => [s.id, s]))('%s really is cut that way', (_id, entry) => {
    const starter = entry as (typeof STARTERS)[number];
    const design = starter.build();
    applyWorkshop(design, workshopOf(roomy()));
    const project = buildProject(design);
    for (const id of starter.demonstrates) {
      const topic = topicById(id)!;
      if (!topic.present) continue;
      expect(
        topic.present(project, design),
        `${starter.id} says it shows "${topic.title}" and does not`,
      ).toBe(true);
    }
  });
});

describe('a suggestion is about something real', () => {
  it('names a topic and a control that exist', () => {
    const paths = new Set(CATALOG.map((e) => e.path));
    for (const s of SUGGESTIONS) {
      expect(topicById(s.topicId), `${s.id} points at topic "${s.topicId}"`).toBeDefined();
      expect(paths.has(s.param), `${s.id} points at "${s.param}", which no control claims`).toBe(
        true,
      );
      // A suggestion is a sentence somebody would say, not a label.
      expect(s.says.length, s.id).toBeGreaterThan(60);
      expect(s.says.trim().endsWith('.'), `${s.id} is not a sentence`).toBe(true);
    }
    expect(new Set(SUGGESTIONS.map((s) => s.id)).size).toBe(SUGGESTIONS.length);
  });

  // The default project is what a first-time user has in front of them, and
  // it is the one place a suggestion must not fire on nothing.
  it('offers the toe kick only where there is not one already', () => {
    const params = defaultParams();
    const project = buildProject(params);
    const toeKick = SUGGESTIONS.find((s) => s.id === 'toe-kick')!;
    const cabinet = params.cabinets[0]!;
    const base = cabinet.carcasses[0]!;
    const at = { kind: 'carcass' as const, cabinetId: cabinet.id, carcassId: base.id };

    base.toeKick.enabled = true;
    expect(toeKick.applies({ params, project, selection: at })).toBe(false);
    base.toeKick.enabled = false;
    expect(toeKick.applies({ params, project, selection: at })).toBe(true);

    // Never on a box that is not on the floor: up there the same notch is a
    // recess cut into the panel carrying it, which is why the builder refuses.
    const upper = cabinet.carcasses[1];
    if (upper) {
      upper.toeKick.enabled = false;
      expect(
        toeKick.applies({
          params,
          project,
          selection: { kind: 'carcass', cabinetId: cabinet.id, carcassId: upper.id },
        }),
      ).toBe(false);
    }
  });
});

describe('machining explains itself', () => {
  /**
   * A project with every branch this generator has switched on, so the walk
   * reaches the purposes that only exist under an option — the face frame's
   * laps, the drawer box, the slide holes, the handle.
   */
  function everything(): ProjectParams {
    const p = roomy();
    const base = p.cabinets[0]!.carcasses[0]!;
    base.construction = 'face-frame';
    base.dividerCount = 1;
    base.bays = [
      {
        shelves: 'adjustable',
        shelfCount: 0,
        shelfGaps: [],
        doors: 'left',
        drawerFrontHeights: [],
      },
      {
        shelves: 'none',
        shelfCount: 0,
        shelfGaps: [],
        doors: 'none',
        drawerFrontHeights: [180, 180],
      },
    ];
    base.hangingRail.enabled = true;
    p.hardware.handleId = 'bar-128';
    p.joinery.screwHoles = true;
    p.surfaceEffects = [
      {
        id: 'fx',
        enabled: true,
        target: { select: 'role', role: 'door' },
        face: 'outside',
        effect: { kind: 'frame', margin: 50, width: 6, depth: 4 },
      },
    ];
    return p;
  }

  it('has a name for every purpose the pipeline produces', () => {
    const project = buildProject(everything());
    const unnamed = new Set<string>();
    for (const part of project.parts) {
      for (const group of machiningOf(part)) {
        // The label falls back to the raw purpose, which is what an
        // unwritten-up joint looks like on screen.
        if (group.label === group.purpose) unnamed.add(group.purpose);
      }
    }
    expect([...unnamed], 'machining with no name a woodworker would use').toEqual([]);
  });

  it('explains the joints, and says so plainly where it cannot', () => {
    const project = buildProject(everything());
    const purposes = new Set<string>();
    for (const part of project.parts) {
      for (const group of machiningOf(part)) purposes.add(group.purpose);
    }
    // Every purpose that is a *joint or a fitting* has an explanation. The
    // list is asserted rather than filtered so that a new purpose arriving
    // with no topic is a failing test, not a silent blank in the app.
    const explained = [...purposes].filter((p) => topicForPurpose(p) !== undefined);
    expect(explained.length, 'nothing at all is explained').toBeGreaterThan(6);
    expect([...purposes].filter((p) => !topicForPurpose(p))).toEqual([]);
  });

  /**
   * The section has to cut the joint, not stand beside it.
   *
   * A plane that lands along a panel's own face draws it as an outline behind
   * the cut, and a plane inside another panel shows that panel's face — both
   * of which draw *something*, which is why this asserts the panel in question
   * is genuinely sliced.
   */
  it('cuts through the very feature it is explaining', () => {
    const project = buildProject(everything());
    let checked = 0;
    for (const part of project.parts) {
      for (const group of machiningOf(part)) {
        const feature = group.features[0]!;
        const view = sectionThrough(project, part, feature);
        expect(view, `${part.id}: no section plane for ${group.purpose}`).not.toBeNull();
        expect(crossesTheFeature(part, view!.axis, view!.at!, feature)).toBe(true);
        const drawing = draw(project, view!);
        expect(drawing.shapes.length, `${part.id}/${group.purpose} drew nothing`).toBeGreaterThan(
          0,
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe('finding an explanation by name', () => {
  it.each([
    ['dogbone', 'corner-relief'],
    ['scribe', 'scribe'],
    ['half lap', 'half-lap'],
    ['toe kick', 'toe-kick'],
    ['hinge', 'hinge-boring'],
    ['banding', 'edge-banding'],
  ])('"%s" finds %s', (query, id) => {
    expect(searchTopics(query).map((m) => m.topic.id)).toContain(id);
  });
});

/** Whether the plane really passes through the feature's own extent. */
function crossesTheFeature(
  part: Part,
  axis: 'x' | 'y' | 'z',
  at: number,
  feature: Part['features'][number],
): boolean {
  const f = part.frame;
  const pts =
    feature.kind === 'drill'
      ? [
          { x: feature.x - feature.diameter / 2, y: feature.y },
          { x: feature.x + feature.diameter / 2, y: feature.y },
          { x: feature.x, y: feature.y - feature.diameter / 2 },
          { x: feature.x, y: feature.y + feature.diameter / 2 },
        ]
      : feature.kind === 'engrave'
        ? []
        : feature.path.pts.map((p) => ({ x: p.x, y: p.y }));
  const along = pts.map((p) => f.origin[axis] + f.u[axis] * p.x + f.v[axis] * p.y);
  if (along.length === 0) return false;
  const lo = Math.min(...along);
  const hi = Math.max(...along);
  return at >= lo - 1e-6 && at <= hi + 1e-6;
}
