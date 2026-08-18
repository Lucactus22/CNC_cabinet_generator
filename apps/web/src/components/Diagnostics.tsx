import { useMemo, useState } from 'react';
import type { Diagnostic } from '@cabgen/core';
import { severityRank, useStore } from '../store';

export function Diagnostics() {
  const diagnostics = useStore((s) => s.project.diagnostics);
  const notes = useStore((s) => s.project.notes);
  const select = useStore((s) => s.select);
  const setTab = useStore((s) => s.setTab);
  const [open, setOpen] = useState(true);

  const all = useMemo<Diagnostic[]>(
    () =>
      [
        ...diagnostics,
        ...notes.map<Diagnostic>((n) => ({ severity: 'info', topic: 'model', message: n })),
      ].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
    [diagnostics, notes],
  );

  const errors = all.filter((d) => d.severity === 'error').length;
  const warnings = all.filter((d) => d.severity === 'warning').length;

  return (
    <section className="diagnostics">
      <header onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'} Diagnostics</span>
        <span className="pill">
          <i className={`dot ${errors ? 'error' : warnings ? 'warning' : 'ok'}`} />
          {errors > 0
            ? `${errors} blocking`
            : warnings > 0
              ? `${warnings} to check`
              : 'ready to cut'}
        </span>
      </header>
      {open && (
        <ul>
          {all.map((d, i) => {
            const clickable = Boolean(d.partIds?.length);
            return (
              <li
                key={i}
                className={clickable ? 'clickable' : ''}
                onClick={() => {
                  if (!d.partIds?.length) return;
                  select(d.partIds[0]!);
                  setTab('parts');
                }}
              >
                <span className={`tag ${d.severity}`}>{d.severity}</span>
                <div>
                  <div className="msg">{d.message}</div>
                  {d.hint && <div className="fix">{d.hint}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
