import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { offeredFixes } from '../fixes';
import { isWorkshopTopic, topicLabel } from '../diagnosticTopics';
import { bucketByTopic, groupDiagnostics, readinessSummary } from '../diagnosticsGrouping';
import { DiagnosticDiagram } from './DiagnosticDiagram';

const MIN_HEIGHT = 160;
const MAX_HEIGHT_MARGIN = 96; // leaves the top bar and a sliver of the cabinet visible

/**
 * Everything the user needs to know before cutting, over the model rather than
 * beside it.
 *
 * Docked along the bottom, the way a build tool docks its problem list: the
 * cabinet stays visible above it rather than being covered by a floating
 * card, and dragging the top edge resizes it. It opens and closes rather than
 * sitting there permanently — the old panel held 26.4% of the window on every
 * tab, and this is the answer to that as much as the layout is.
 *
 * Grouped by topic — machine, nesting, joinery and so on — and within a topic
 * by severity, with repeats collapsed to one line and a count. Anything with
 * a shape gets a small diagram instead of only a sentence: a part against the
 * machine's envelope, a sheet with its seams, a shelf against the span it is
 * safe to.
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
  const [height, setHeight] = useState(340);
  const dragging = useRef<{ startY: number; startHeight: number } | null>(null);
  // Escape closes this panel (see TopBar's shortcut handler) even mid-drag,
  // which unmounts it before a `pointerup` ever reaches `onUp` below — so the
  // listeners it registered on `window` need an unmount-time cleanup too, not
  // only the one `onUp` runs on a normal release.
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  const labelOf = useMemo(() => {
    const byId = new Map(project.parts.map((p) => [p.id, p.label]));
    return (id: string): string | undefined => byId.get(id);
  }, [project.parts]);
  const groups = useMemo(
    () => groupDiagnostics(diagnostics, notes, labelOf),
    [diagnostics, notes, labelOf],
  );
  const sections = useMemo(() => bucketByTopic(groups), [groups]);
  // Off the last finished build rather than the live parameters: each
  // candidate costs a full run of the pipeline, and keying it to `params`
  // would re-run all of them on every keystroke while the list is open.
  const fixes = useMemo(() => offeredFixes(project.params, project), [project]);
  const errors = diagnostics.filter((d) => d.severity === 'error').length;

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = { startY: e.clientY, startHeight: height };
    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      const delta = dragging.current.startY - ev.clientY;
      const max = window.innerHeight - MAX_HEIGHT_MARGIN;
      setHeight(Math.min(max, Math.max(MIN_HEIGHT, dragging.current.startHeight + delta)));
    };
    const onUp = () => {
      dragging.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      stopDrag.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    stopDrag.current = onUp;
  };

  return (
    <div className="diagnostics-sheet" role="dialog" aria-label="Diagnostics" style={{ height }}>
      <div className="diag-resize" onPointerDown={startResize} title="Drag to resize" />
      <header>
        <b>{readinessSummary(diagnostics)}</b>
        <button className="crumb dismiss" aria-label="Close" onClick={() => close(false)}>
          ✕
        </button>
      </header>

      <div className="diag-body">
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

        {sections.map((section) => (
          <section key={section.topic} className="diag-topic">
            <h3>{topicLabel(section.topic)}</h3>
            <ul>
              {section.groups.map((group) => {
                const first = group.entries[0]!;
                const open = expanded === group.key;
                return (
                  <li key={group.key} className={first.partIds?.length ? 'clickable' : ''}>
                    <span className={`tag ${first.severity}`}>{first.severity}</span>
                    <div>
                      <div
                        className="msg"
                        onClick={() => {
                          if (first.partIds?.length)
                            select({ kind: 'part', partId: first.partIds[0]! });
                        }}
                      >
                        {first.message}
                      </div>
                      {first.hint && <div className="fix">{first.hint}</div>}
                      {first.spatial && <DiagnosticDiagram spatial={first.spatial} />}
                      <div className="links">
                        {group.entries.length > 1 && (
                          <button
                            className="link"
                            onClick={() => setExpanded(open ? null : group.key)}
                          >
                            {open ? 'show fewer' : `and ${group.entries.length - 1} more like it`}
                          </button>
                        )}
                        {/* Only where there is something to do about it: an info
                            note that the parts all fit is not a reason to open
                            a drawer. The diagnostic itself stays right here —
                            only the fix moves behind the workshop door. */}
                        {first.severity !== 'info' && isWorkshopTopic(first.topic) && (
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
                              if (d.partIds?.length)
                                select({ kind: 'part', partId: d.partIds[0]! });
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
          </section>
        ))}
      </div>
    </div>
  );
}
