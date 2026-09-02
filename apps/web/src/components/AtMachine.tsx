import { useMemo, useState } from 'react';
import { bboxOf, partDrawing, type CutListRow, type Part, type ProjectResult } from '@cabgen/core';
import { activeMachineProgress, useStore } from '../store';
import { DrawingSvg } from './drawing';

type Tab = 'cutting' | 'assembly';

/**
 * The workshop view: large type, high contrast, meant to be read standing at
 * the machine with sawdust on your hands, not scrolled through on a form —
 * R-22. Two jobs, not a responsive reflow of the output pack: check parts off
 * as they come off the saw, then step through assembly one join at a time
 * with pictures instead of part numbers.
 *
 * Progress — which step, which parts are cut — is `machineProgress` in the
 * store, persisted to `localStorage` and revalidated against the current cut
 * list's own signature on every read, so a stale record from a different job
 * is set aside rather than silently misapplied. See machineProgress.ts.
 */
export function AtMachine() {
  const [tab, setTab] = useState<Tab>('cutting');
  const project = useStore((s) => s.project);
  const machineProgress = useStore((s) => s.machineProgress);
  const setAtMachine = useStore((s) => s.setAtMachine);
  const resetMachineProgress = useStore((s) => s.resetMachineProgress);
  // Computed here, not passed to `useStore` directly: `activeMachineProgress`
  // allocates a fresh object every call, which `useSyncExternalStore` reads
  // as an ever-changing snapshot and loops on (React error #185). `useMemo`
  // keeps it to one allocation per actual change in either input.
  const progress = useMemo(
    () => activeMachineProgress({ project, machineProgress }),
    [project, machineProgress],
  );

  const totalParts = project.cutList.length + project.stockCutList.length;

  return (
    <div className="scrim" role="presentation">
      <section className="at-machine" aria-label="At the machine">
        <header>
          <h2>At the machine</h2>
          <nav className="at-machine-tabs">
            <button
              aria-pressed={tab === 'cutting'}
              className={tab === 'cutting' ? 'on' : undefined}
              onClick={() => setTab('cutting')}
            >
              Cutting
            </button>
            <button
              aria-pressed={tab === 'assembly'}
              className={tab === 'assembly' ? 'on' : undefined}
              onClick={() => setTab('assembly')}
            >
              Assembly
            </button>
          </nav>
          <span className="spacer" />
          <button
            className="link"
            onClick={() => {
              if (progress.cutIds.length === 0 && progress.step === 0) return;
              if (confirm('Clear cutting checkmarks and go back to the first assembly step?')) {
                resetMachineProgress();
              }
            }}
          >
            Start a fresh job
          </button>
          <button className="crumb dismiss" aria-label="Close" onClick={() => setAtMachine(false)}>
            ✕
          </button>
        </header>

        {tab === 'cutting' ? (
          <Cutting project={project} cutIds={progress.cutIds} totalParts={totalParts} />
        ) : (
          <Assembly project={project} step={progress.step} />
        )}
      </section>
    </div>
  );
}

function groupBySheet(
  rows: CutListRow[],
  label: string,
): Array<{ heading: string; rows: CutListRow[] }> {
  const bySheet = new Map<number | '', CutListRow[]>();
  for (const row of rows) {
    const list = bySheet.get(row.sheet) ?? [];
    list.push(row);
    bySheet.set(row.sheet, list);
  }
  return [...bySheet.entries()]
    .sort((a, b) => {
      if (a[0] === '' || b[0] === '') return a[0] === b[0] ? 0 : a[0] === '' ? 1 : -1;
      return a[0] - b[0];
    })
    .map(([sheet, sheetRows]) => ({
      heading: sheet === '' ? label : `${label} ${sheet}`,
      rows: sheetRows,
    }));
}

function Cutting({
  project,
  cutIds,
  totalParts,
}: {
  project: ProjectResult;
  cutIds: string[];
  totalParts: number;
}) {
  const toggleMachineCut = useStore((s) => s.toggleMachineCut);
  const cut = useMemo(() => new Set(cutIds), [cutIds]);
  const groups = [
    ...groupBySheet(project.cutList, 'Sheet'),
    ...groupBySheet(project.stockCutList, 'Board'),
  ];

  if (totalParts === 0) {
    return <p className="hint">Nothing to cut yet.</p>;
  }

  return (
    <div className="at-machine-body">
      <p className="at-machine-progress">
        {cutIds.length} of {totalParts} parts cut
      </p>
      {groups.map((g) => (
        <section key={g.heading} className="at-machine-sheet">
          <h3>{g.heading}</h3>
          <ul className="at-machine-checklist">
            {g.rows.map((row) => (
              <li key={row.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={cut.has(row.id)}
                    onChange={() => toggleMachineCut(row.id)}
                  />
                  <span className="at-machine-part-id">{row.id}</span>
                  <span>{row.label}</span>
                  <span className="hint">
                    {row.length} × {row.width} × {row.thickness} mm
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Assembly({ project, step: currentStep }: { project: ProjectResult; step: number }) {
  const setMachineStep = useStore((s) => s.setMachineStep);
  const steps = project.assembly.steps;
  const partsById = useMemo(() => new Map(project.parts.map((p) => [p.id, p])), [project.parts]);
  const labelOf = (id: string): string => partsById.get(id)?.label ?? id;

  if (steps.length === 0) {
    return <p className="hint">Nothing to assemble yet.</p>;
  }

  const index = Math.min(Math.max(currentStep, 0), steps.length - 1);
  const step = steps[index]!;

  return (
    <div className="at-machine-body">
      <div className="at-machine-step-nav">
        <button disabled={index === 0} onClick={() => setMachineStep(index - 1)}>
          ← Previous
        </button>
        <span>
          Step {index + 1} of {steps.length}
        </span>
        <button disabled={index === steps.length - 1} onClick={() => setMachineStep(index + 1)}>
          Next →
        </button>
      </div>

      <h3 className="at-machine-step-title">{step.title}</h3>

      <div className="at-machine-step-parts">
        {step.partIds.map((id) => {
          const part = partsById.get(id);
          return (
            <figure key={id} className="at-machine-part-pic">
              {part ? <PartPicture part={part} /> : <div className="at-machine-pic-missing" />}
              <figcaption>{labelOf(id)}</figcaption>
            </figure>
          );
        })}
      </div>

      {step.ontoIds.length > 0 && (
        <p className="at-machine-step-row">
          <b>Onto</b> {step.ontoIds.map(labelOf).join(', ')}
        </p>
      )}
      {step.hardware.length > 0 && (
        <p className="at-machine-step-row">
          <b>Hardware</b> {step.hardware.join('; ')}
        </p>
      )}
      {step.fixings.length > 0 && (
        <p className="at-machine-step-row">
          <b>Fixings</b> {step.fixings.join('; ')}
        </p>
      )}
    </div>
  );
}

function PartPicture({ part }: { part: Part }) {
  const drawing = useMemo(() => partDrawing(part, { safeNames: false }, false), [part]);
  const bb = bboxOf(part.outline);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const pad = Math.max(w, h) * 0.08 + 6;
  return (
    <svg viewBox={`${bb.minX - pad} ${bb.minY - pad} ${w + pad * 2} ${h + pad * 2}`}>
      <g transform={`translate(0, ${2 * bb.minY + h}) scale(1, -1)`}>
        <DrawingSvg drawing={drawing} showLabels={false} />
      </g>
    </svg>
  );
}
