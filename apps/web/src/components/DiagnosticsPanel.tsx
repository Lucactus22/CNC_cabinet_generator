import { useMemo, useState } from 'react';
import type { Diagnostic } from '@cabgen/core';
import { severityRank, useStore } from '../store';
import { offeredFixes } from '../fixes';

/**
 * Everything the user needs to know before cutting, over the model rather than
 * beside it.
 *
 * The old panel held 26.4% of the window permanently, on every tab, and showed
 * a fresh project fourteen entries — eight of them members of two families
 * that differ only in which sheet or part they name. Here it is a chip in the
 * top bar that opens a list; repeats collapse to one line with a count; and
 * anything that names a part selects it.
 */
export function DiagnosticsPanel() {
  const diagnostics = useStore((s) => s.project.diagnostics);
  const notes = useStore((s) => s.project.notes);
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);
  const reveal = useStore((s) => s.reveal);
  const update = useStore((s) => s.update);
  const close = useStore((s) => s.setDiagnosticsOpen);
  const [expanded, setExpanded] = useState<string | null>(null);

  const labelOf = useMemo(() => {
    const byId = new Map(project.parts.map((p) => [p.id, p.label]));
    return (id: string): string | undefined => byId.get(id);
  }, [project.parts]);
  const groups = useMemo(
    () => groupDiagnostics(diagnostics, notes, labelOf),
    [diagnostics, notes, labelOf],
  );
  // Off the last finished build rather than the live parameters: each
  // candidate costs a full run of the pipeline, and keying it to `params`
  // would re-run all of them on every keystroke while the list is open.
  const fixes = useMemo(() => offeredFixes(project.params, project), [project]);
  const errors = diagnostics.filter((d) => d.severity === 'error').length;

  return (
    <div className="diagnostics-sheet" role="dialog" aria-label="Diagnostics">
      <header>
        <b>{summarise(diagnostics)}</b>
        <button className="crumb dismiss" aria-label="Close" onClick={() => close(false)}>
          ✕
        </button>
      </header>

      {errors > 0 && (
        <div className="fixes">
          <strong>What would make this cuttable</strong>
          {fixes.length === 0 ? (
            <p className="hint">
              Nothing this app can change on its own clears these without causing something worse.
              The design itself has to give.
            </p>
          ) : (
            fixes.map((fix) => (
              <button
                key={fix.id}
                className="fix-button"
                onClick={() => update((p) => fix.apply(p))}
              >
                <b>{fix.label}</b>
                <span>
                  {fix.errorsAfter === 0
                    ? 'Clears everything blocking export'
                    : `Leaves ${fix.errorsAfter} blocking`}
                  {fix.cost ? ` · costs ${fix.cost}` : ' · costs nothing'}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <ul>
        {groups.map((group) => {
          const first = group.entries[0]!;
          const open = expanded === group.key;
          return (
            <li key={group.key} className={first.partIds?.length ? 'clickable' : ''}>
              <span className={`tag ${first.severity}`}>{first.severity}</span>
              <div>
                <div
                  className="msg"
                  onClick={() => {
                    if (first.partIds?.length) select({ kind: 'part', partId: first.partIds[0]! });
                  }}
                >
                  {first.message}
                </div>
                {first.hint && <div className="fix">{first.hint}</div>}
                <div className="links">
                  {group.entries.length > 1 && (
                    <button className="link" onClick={() => setExpanded(open ? null : group.key)}>
                      {open ? 'show fewer' : `and ${group.entries.length - 1} more like it`}
                    </button>
                  )}
                  {/* Only where there is something to do about it: an info note
                      that the parts all fit is not a reason to open a drawer. */}
                  {first.severity !== 'info' &&
                    (first.topic === 'machine' || first.topic === 'nesting') && (
                      <button
                        className="link"
                        onClick={() => reveal({ workshop: true, surface: 'bench' })}
                      >
                        open the workshop
                      </button>
                    )}
                </div>
                {open &&
                  group.entries.slice(1).map((d, i) => (
                    <div
                      key={i}
                      className="msg repeat"
                      onClick={() => {
                        if (d.partIds?.length) select({ kind: 'part', partId: d.partIds[0]! });
                      }}
                    >
                      {d.message}
                    </div>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function summarise(diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  if (errors > 0) return `${errors} blocking`;
  if (warnings > 0) return `${warnings} to check`;
  return 'ready to cut';
}

interface Group {
  key: string;
  entries: Diagnostic[];
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
function groupDiagnostics(
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
