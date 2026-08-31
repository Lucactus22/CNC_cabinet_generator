import type { AssemblyStep, PartLabel } from '@cabgen/core';
import { useStore } from '../store';

/**
 * The printable pack R-10 asks for: a label sheet to stick on each blank as
 * it comes off the machine, and the order to put them together in — derived
 * from the joint graph the builder produced for *this* project, never a
 * fixed sequence written for the default cabinet.
 */
export function BuildGuide() {
  const project = useStore((s) => s.project);
  const { labels, assembly } = project;

  return (
    <>
      <p className="hint">
        {labels.length} labels · {assembly.steps.length} assembly steps · use your browser's print
        dialogue to save the pack as a PDF.
      </p>

      <section className="guide-section">
        <h2>Label sheet</h2>
        <div className="label-grid">
          {labels.map((l) => (
            <LabelCard key={l.id} label={l} />
          ))}
        </div>
      </section>

      <section className="guide-section">
        <h2>Assembly steps</h2>
        <ol className="steps">
          {assembly.steps.map((step, i) => (
            <StepCard key={i} step={step} labels={labels} />
          ))}
        </ol>
      </section>
    </>
  );
}

function LabelCard({ label }: { label: PartLabel }) {
  return (
    <div className="label-card">
      <div className="label-id">{label.id}</div>
      <div className="label-desc">{label.description}</div>
      <div className="label-meta">
        {label.length} × {label.width} × {label.thickness} mm · {label.material}
      </div>
      <div className="label-face">
        {label.faceUp === 'either' ? 'Either face up' : `Face ${label.faceUp} up`}
        {label.flipped ? ' · flipped mid-job' : ''}
      </div>
    </div>
  );
}

function StepCard({ step, labels }: { step: AssemblyStep; labels: PartLabel[] }) {
  const name = (id: string): string => labels.find((l) => l.id === id)?.description ?? id;
  return (
    <li className="step">
      <div className="step-title">{step.title}</div>
      <div className="step-row">
        <span className="step-tag">Parts</span>
        {step.partIds.map((id) => `${id} — ${name(id)}`).join('; ')}
      </div>
      {step.ontoIds.length > 0 && (
        <div className="step-row">
          <span className="step-tag">Onto</span>
          {step.ontoIds.map((id) => name(id)).join(', ')}
        </div>
      )}
      {step.hardware.length > 0 && (
        <div className="step-row">
          <span className="step-tag">Hardware</span>
          {step.hardware.join('; ')}
        </div>
      )}
      {step.fixings.length > 0 && (
        <div className="step-row">
          <span className="step-tag">Fixings</span>
          {step.fixings.join('; ')}
        </div>
      )}
    </li>
  );
}
