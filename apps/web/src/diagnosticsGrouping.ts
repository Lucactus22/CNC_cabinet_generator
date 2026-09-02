import { severityRank, type Diagnostic } from '@cabgen/core';
import { topicLabel } from './diagnosticTopics';

/**
 * Turning a flat diagnostics list into what the panel actually shows: repeats
 * collapsed to a count, grouped by topic, worst severity first. Kept apart
 * from `DiagnosticsPanel.tsx` so the grouping itself — the part R-21 has to
 * get right — is testable without rendering anything.
 */

export interface Group {
  key: string;
  entries: Diagnostic[];
}

export interface TopicSection {
  topic: string;
  groups: Group[];
}

/**
 * Collapse diagnostics that differ only in which sheet or part they name.
 *
 * A fresh project raises four tiling warnings that differ in a sheet number
 * and four tile-span notes that differ in a part label — eight of its fourteen
 * entries saying two things. Keying on the message with its numbers and its
 * own part's name taken out is what makes those one line each; anything that
 * really is a different sentence keeps its own.
 */
export function groupDiagnostics(
  diagnostics: Diagnostic[],
  notes: string[],
  labelOf: (id: string) => string | undefined,
): Group[] {
  const all: Diagnostic[] = [
    ...diagnostics,
    ...notes.map<Diagnostic>((n) => ({ severity: 'info', topic: 'model', message: n })),
  ].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const groups = new Map<string, Group>();
  for (const d of all) {
    const key = `${d.severity}|${d.topic}|${skeleton(d, labelOf)}`;
    const existing = groups.get(key);
    if (existing) existing.entries.push(d);
    else groups.set(key, { key, entries: [d] });
  }
  return [...groups.values()];
}

function skeleton(d: Diagnostic, labelOf: (id: string) => string | undefined): string {
  let text = d.message;
  // A diagnostic names its part in words ("Upper side, left is 1100 mm long"),
  // and only carries the id, so both have to come out before the numbers do —
  // otherwise four notes about four panels stay four notes.
  for (const id of d.partIds ?? []) {
    text = text.split(id).join('#');
    const label = labelOf(id);
    if (label) text = text.split(label).join('#');
  }
  return text.replace(/\d+(\.\d+)?/g, '#');
}

/**
 * Sections the collapsed groups by topic, worst severity first.
 *
 * `groupDiagnostics` already sorts its input by severity, so a topic that
 * mixes an error with an info note keeps that order within its own section —
 * this only decides which section comes first.
 */
export function bucketByTopic(groups: Group[]): TopicSection[] {
  const buckets = new Map<string, Group[]>();
  for (const g of groups) {
    const topic = g.entries[0]!.topic;
    const list = buckets.get(topic);
    if (list) list.push(g);
    else buckets.set(topic, [g]);
  }
  const worstOf = (list: Group[]): number =>
    Math.min(...list.map((g) => severityRank[g.entries[0]!.severity]));
  return [...buckets.entries()]
    .map(([topic, groups]) => ({ topic, groups }))
    .sort(
      (a, b) =>
        worstOf(a.groups) - worstOf(b.groups) ||
        topicLabel(a.topic).localeCompare(topicLabel(b.topic)),
    );
}

/** The chip in the top bar: as short as a badge gets. */
export function summarise(diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  if (errors > 0) return `${errors} blocking`;
  if (warnings > 0) return `${warnings} to check`;
  return 'ready to cut';
}

/**
 * The panel's own header: a full sentence answering "can this be cut", in
 * words rather than the colour of a dot.
 */
export function readinessSummary(diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  if (errors > 0) {
    return `Not ready to cut — ${errors} blocking${warnings > 0 ? `, ${warnings} to check` : ''}.`;
  }
  if (warnings > 0) return `Ready to cut — ${warnings} to check.`;
  return 'Ready to cut.';
}
