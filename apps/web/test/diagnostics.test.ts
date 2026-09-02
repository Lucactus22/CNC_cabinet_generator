import { describe, expect, it } from 'vitest';
import { buildProject, defaultParams, type Diagnostic } from '@cabgen/core';
import {
  bucketByTopic,
  groupDiagnostics,
  readinessSummary,
  summarise,
} from '../src/diagnosticsGrouping';
import { isWorkshopTopic, topicLabel } from '../src/diagnosticTopics';
import { offeredFixes } from '../src/fixes';

const noLabel = (): undefined => undefined;

/**
 * R-21: grouped by topic, sorted by severity, repeats collapsed with a count.
 *
 * The default project is the fixture R-16 measured — 2 errors, 4 warnings and
 * 8 info notes, 14 entries total, eight of them two families that differ only
 * in a sheet number or a part label (F-8). These pin that the panel actually
 * gets the shape the item asks for, not just that it renders something.
 */
describe('grouping diagnostics', () => {
  it('collapses repeats that differ only in a sheet or part label', () => {
    const project = buildProject(defaultParams());
    // The real lookup the panel itself uses: the "spans more than one tile"
    // family differs by the part's own label ("Upper side, left" vs "Upper
    // back"), not only by a number, so collapsing it needs the label out too.
    const byId = new Map(project.parts.map((p) => [p.id, p.label]));
    const labelOf = (id: string): string | undefined => byId.get(id);
    const groups = groupDiagnostics(project.diagnostics, project.notes, labelOf);
    // Four "needs N setups" warnings and four "spans more than one tile"
    // notes each collapse to one group — the eight entries F-8 named.
    const tilingGroup = groups.find((g) => g.entries[0]!.message.includes('needs'));
    const spanGroup = groups.find((g) =>
      g.entries[0]!.message.includes('spans more than one tile'),
    );
    expect(tilingGroup?.entries.length).toBe(4);
    expect(spanGroup?.entries.length).toBe(4);
  });

  it('sections groups by topic, the topic with the worst severity first', () => {
    const project = buildProject(defaultParams());
    const groups = groupDiagnostics(project.diagnostics, project.notes, noLabel);
    const sections = bucketByTopic(groups);

    // The default project's only errors are topic 'machine' — that section
    // has to lead, ahead of any topic that only ever reaches warning or info.
    expect(sections[0]!.topic).toBe('machine');
    expect(sections[0]!.groups.some((g) => g.entries[0]!.severity === 'error')).toBe(true);

    // No topic appears twice, and no group is dropped or duplicated on the
    // way into its section — the easiest way to fail this silently.
    const topics = sections.map((s) => s.topic);
    expect(new Set(topics).size).toBe(topics.length);
    const regrouped = sections.flatMap((s) => s.groups);
    expect(regrouped.length).toBe(groups.length);
  });

  it('keeps a topic bucket internally sorted worst severity first', () => {
    // A synthetic mix, rather than hunting for a real project that happens to
    // put an info note before a warning under the same topic.
    const diagnostics: Diagnostic[] = [
      { severity: 'info', topic: 'joinery', message: 'a note' },
      { severity: 'warning', topic: 'joinery', message: 'a warning' },
    ];
    const groups = groupDiagnostics(diagnostics, [], noLabel);
    const [section] = bucketByTopic(groups);
    expect(section!.groups.map((g) => g.entries[0]!.severity)).toEqual(['warning', 'info']);
  });
});

describe('readiness in words', () => {
  it('answers "can this be cut" for each state', () => {
    const blocking: Diagnostic[] = [
      { severity: 'error', topic: 'machine', message: 'x' },
      { severity: 'warning', topic: 'machine', message: 'y' },
    ];
    const toCheck: Diagnostic[] = [{ severity: 'warning', topic: 'machine', message: 'y' }];
    const ready: Diagnostic[] = [{ severity: 'info', topic: 'machine', message: 'z' }];

    expect(readinessSummary(blocking)).toBe('Not ready to cut — 1 blocking, 1 to check.');
    expect(readinessSummary(toCheck)).toBe('Ready to cut — 1 to check.');
    expect(readinessSummary(ready)).toBe('Ready to cut.');

    // The top-bar chip stays terse; the panel's own header is the full
    // sentence. Both have to agree on which state they are describing.
    expect(summarise(blocking)).toBe('1 blocking');
    expect(summarise(toCheck)).toBe('1 to check');
    expect(summarise(ready)).toBe('ready to cut');
  });
});

describe('workshop-topic routing', () => {
  it('claims exactly the topics the workshop drawer can actually fix', () => {
    expect(isWorkshopTopic('machine')).toBe(true);
    expect(isWorkshopTopic('nesting')).toBe(true);
    expect(isWorkshopTopic('hardware')).toBe(true);
    // An opening (the room) or a structural warning is a design problem —
    // routing its badge to the workshop door would send the user through a
    // door with nothing behind it that fixes it.
    expect(isWorkshopTopic('opening')).toBe(false);
    expect(isWorkshopTopic('structure')).toBe(false);
    expect(isWorkshopTopic('joinery')).toBe(false);
  });

  it('labels every topic checkManufacturability actually emits', () => {
    const project = buildProject(defaultParams());
    for (const d of project.diagnostics) {
      expect(topicLabel(d.topic)).not.toBe('');
    }
  });
});

/**
 * F-1 / J6: the default project's own suggested fix must not trade its two
 * blocking errors for a different blocking error. R-16 found exactly that
 * bug in the pattern this mechanism replaced — a candidate is only offered
 * once it has actually been built and shown to help, so this pins the fix
 * that works, and that it is the one offered first (R-17 measured this at
 * two interactions: open the list, press the top button).
 */
describe('the default project reaches an exportable state in two interactions', () => {
  it('offers ripping the sheets first, and it clears every blocking error', () => {
    const params = defaultParams();
    const project = buildProject(params);
    const errorsBefore = project.diagnostics.filter((d) => d.severity === 'error').length;
    expect(errorsBefore).toBeGreaterThan(0);

    const fixes = offeredFixes(params, project);
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0]!.errorsAfter).toBe(0);

    const next = structuredClone(params);
    fixes[0]!.apply(next);
    const after = buildProject(next);
    expect(after.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('never offers a fix that raises a new error, or one that changes nothing', () => {
    const params = defaultParams();
    const project = buildProject(params);
    for (const fix of offeredFixes(params, project)) {
      const next = structuredClone(params);
      fix.apply(next);
      expect(next).not.toEqual(params);
      const after = buildProject(next);
      const afterErrors = after.diagnostics.filter((d) => d.severity === 'error').length;
      expect(afterErrors).toBeLessThan(fix.errorsBefore);
      expect(afterErrors).toBe(fix.errorsAfter);
    }
  });
});
