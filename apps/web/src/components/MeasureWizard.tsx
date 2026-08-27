import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LEG_BACK,
  DEFAULT_LEG_RETURN,
  checkCornerTriangle,
  checkMeasurements,
  cornerAngleFrom,
  describeCorner,
  diagonalFor,
  describeFit,
  fitOpening,
  runSize,
  squareDiagonal,
  type CornerTriangle,
  type OpeningSpec,
} from '@cabgen/core';
import { useStore } from '../store';
import { NumberField, SelectField } from './Controls';

/**
 * A walkthrough for measuring the room, with a tape in one hand.
 *
 * The reason this exists rather than a panel of six numbers: one of those
 * numbers cannot be measured. Nobody owns a protractor that fits a room corner,
 * so asking for an angle gets a guess, and a guessed angle is worse than none —
 * the fillers are cut to it. Here the corner is three tape readings and the
 * angle is derived, which is how the trade has always done it.
 *
 * Nothing is written to the project until Apply, so a walkthrough abandoned
 * halfway leaves the run exactly as it was.
 */
export function MeasureWizard({ onClose }: { onClose: () => void }) {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const run = useMemo(() => runSize(params.cabinets), [params.cabinets]);

  const [draft, setDraft] = useState<OpeningSpec>(() => ({ ...params.opening, enabled: true }));
  const [step, setStep] = useState(0);
  const patch = (fn: (o: OpeningSpec) => void): void =>
    setDraft((prev) => {
      const next: OpeningSpec = { ...prev, scribe: { ...prev.scribe } };
      fn(next);
      return next;
    });

  const steps = useMemo(() => stepsFor(draft), [draft]);
  // Turning an end from a wall into an open one drops a step; without this the
  // walkthrough can end up parked past its own last page.
  const at = Math.min(step, steps.length - 1);
  const current = steps[at]!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const apply = (): void => {
    update((p) => {
      p.opening = { ...draft, enabled: true };
    });
    onClose();
  };

  return (
    <div className="wizard-backdrop" onClick={onClose} role="presentation">
      <div
        className="wizard"
        role="dialog"
        aria-modal="true"
        aria-label="Measure the opening"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <strong>{current.title}</strong>
            <span className="wizard-count">
              Step {at + 1} of {steps.length}
            </span>
          </div>
          <button onClick={onClose} aria-label="Close the walkthrough">
            ✕
          </button>
        </header>

        <div className="wizard-body">{current.render({ draft, patch, run })}</div>

        <footer>
          <button onClick={onClose}>Cancel</button>
          <span className="spacer" />
          <button onClick={() => setStep(at - 1)} disabled={at === 0}>
            Back
          </button>
          {at === steps.length - 1 ? (
            <button className="primary" onClick={apply}>
              Use these measurements
            </button>
          ) : (
            <button className="primary" onClick={() => setStep(at + 1)}>
              Next
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

interface StepProps {
  draft: OpeningSpec;
  patch: (fn: (o: OpeningSpec) => void) => void;
  run: { width: number; height: number; depth: number };
}

interface Step {
  title: string;
  render: (p: StepProps) => JSX.Element;
}

/**
 * The walkthrough, in the order someone would actually work round a room:
 * decide what the run meets, then the two big dimensions, then a corner at a
 * time, then the wall itself.
 */
function stepsFor(draft: OpeningSpec): Step[] {
  const steps: Step[] = [
    { title: 'Before you start', render: WhatYouNeed },
    { title: 'Where the run meets the room', render: Ends },
    { title: 'The width, twice', render: Width },
    { title: 'The height, at each end', render: Height },
  ];
  if (draft.left === 'wall') {
    steps.push({ title: 'Is the left-hand corner square?', render: cornerStep('left') });
  }
  if (draft.right === 'wall') {
    steps.push({ title: 'Is the right-hand corner square?', render: cornerStep('right') });
  }
  if (draft.left === 'wall' || draft.right === 'wall') {
    steps.push({ title: 'How flat is the wall?', render: Bow });
  }
  steps.push({ title: 'What that gives you', render: Review });
  return steps;
}

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------

function WhatYouNeed(): JSX.Element {
  return (
    <>
      <p>
        Six measurements, about ten minutes. The cabinets themselves stay square whatever the room
        does — what comes out of this is the strips that take up the difference.
      </p>
      <ul className="wizard-list">
        <li>A tape measure, and someone to hold the other end of it.</li>
        <li>A pencil, for marking the floor.</li>
        <li>
          A straight batten, a spirit level on its edge, or a taut string line — anything you trust
          to be straight over a metre or so.
        </li>
      </ul>
      <p className="wizard-aside">
        Measure into the corner, not to the skirting: take the skirting off first, or the cabinets
        will stand proud of it. Write every reading down before you type it in, and measure anything
        that surprises you a second time.
      </p>
    </>
  );
}

function Ends({ draft, patch }: StepProps): JSX.Element {
  return (
    <>
      <p>
        Which ends of the run finish against a wall? Those are the ones that have to be scribed to
        it. An end that stops in the open needs nothing.
      </p>
      <PlanDiagram left={draft.left === 'wall'} right={draft.right === 'wall'} />
      <SelectField
        label="Left end"
        value={draft.left}
        options={[
          { value: 'wall', label: 'Against a wall' },
          { value: 'open', label: 'Open' },
        ]}
        onChange={(v) => patch((o) => void (o.left = v))}
      />
      <SelectField
        label="Right end"
        value={draft.right}
        options={[
          { value: 'wall', label: 'Against a wall' },
          { value: 'open', label: 'Open' },
        ]}
        onChange={(v) => patch((o) => void (o.right = v))}
      />
    </>
  );
}

function Width({ draft, patch, run }: StepProps): JSX.Element {
  const lean = draft.widthAtTop - draft.widthAtBottom;
  return (
    <>
      <p>
        Measure the clear width across the opening <strong>at the back wall</strong>, twice: once
        level with the top of the run — about {run.height.toFixed(0)} mm up — and once down at the
        floor. Hold the tape level, and push it right into both corners.
      </p>
      <WidthDiagram />
      <NumberField
        label="Width at the top"
        value={draft.widthAtTop}
        min={0}
        onChange={(v) => patch((o) => void (o.widthAtTop = v))}
      />
      <NumberField
        label="Width at the floor"
        value={draft.widthAtBottom}
        min={0}
        onChange={(v) => patch((o) => void (o.widthAtBottom = v))}
      />
      <Readout>
        {Math.abs(lean) < 0.5
          ? 'The walls are plumb, or near enough that nothing tapers.'
          : `${Math.abs(lean).toFixed(0)} mm narrower at the ${lean > 0 ? 'floor' : 'top'}. The fillers are cut to that taper.`}
      </Readout>
    </>
  );
}

function Height({ draft, patch }: StepProps): JSX.Element {
  const slope = draft.heightAtLeft - draft.heightAtRight;
  return (
    <>
      <p>
        Measure from the floor up to whatever stops the run — a ceiling, a soffit, the underside of
        a worktop — once at each end. If there is nothing above it, measure to the height you want
        the run to reach.
      </p>
      <HeightDiagram />
      <NumberField
        label="Height at the left"
        value={draft.heightAtLeft}
        min={0}
        onChange={(v) => patch((o) => void (o.heightAtLeft = v))}
      />
      <NumberField
        label="Height at the right"
        value={draft.heightAtRight}
        min={0}
        onChange={(v) => patch((o) => void (o.heightAtRight = v))}
      />
      <Readout>
        {Math.abs(slope) < 0.5
          ? 'The floor is level across the run.'
          : `${Math.abs(slope).toFixed(0)} mm more headroom at the ${slope > 0 ? 'left' : 'right'}, which means the floor is that much higher at the ${slope > 0 ? 'right' : 'left'}. Stand the run level on the high end and pack it down at the other.`}
      </Readout>
    </>
  );
}

/**
 * The corner, as a triangle rather than an angle.
 *
 * The 3-4-5 rule: step 600 mm out along one wall and 800 mm along the other,
 * and a square corner reads exactly 1000 mm between the marks. Any two legs
 * work — the arithmetic is the law of cosines, and 3-4-5 is just the case
 * somebody memorised.
 */
function cornerStep(end: 'left' | 'right'): (p: StepProps) => JSX.Element {
  return function Corner({ draft, patch, run }: StepProps): JSX.Element {
    const key = end === 'left' ? 'cornerTriangleLeft' : 'cornerTriangleRight';
    const angleKey = end === 'left' ? 'cornerAngleLeft' : 'cornerAngleRight';
    const stored = draft[key];
    // With nothing stored, the page opens on the angle already in effect rather
    // than on a square corner: saying 'dead square' about a corner the project
    // is being cut to 85 degrees for is worse than asking again.
    const triangle: CornerTriangle = stored ?? {
      alongBack: DEFAULT_LEG_BACK,
      alongReturn: DEFAULT_LEG_RETURN,
      diagonal: diagonalFor(DEFAULT_LEG_BACK, DEFAULT_LEG_RETURN, draft[angleKey]),
    };
    const problem = checkCornerTriangle(triangle);
    const said = describeCorner(triangle, run.depth);

    const setLeg = (field: keyof CornerTriangle, value: number): void =>
      patch((o) => {
        const next = { ...triangle, [field]: value };
        o[key] = next;
        const angle = cornerAngleFrom(next);
        // A reading that cannot be a triangle leaves the angle where it was
        // rather than replacing it with a NaN the geometry would run on.
        if (angle !== null) o[angleKey] = angle;
      });

    return (
      <>
        <p>
          Mark the floor a measured distance out from the {end}-hand corner along each wall, then
          measure between the two marks. A square corner reads{' '}
          {squareDiagonal(triangle.alongBack, triangle.alongReturn).toFixed(0)} mm across the marks
          below — anything else is the amount it is out.
        </p>
        <CornerDiagram end={end} />
        <NumberField
          label="Out along the back wall"
          value={triangle.alongBack}
          min={0}
          onChange={(v) => setLeg('alongBack', v)}
          title="Any distance you can reach and mark accurately. 600 mm is roughly a base cabinet's depth, so the mark lands where the carcass will stand."
        />
        <NumberField
          label="Out along the side wall"
          value={triangle.alongReturn}
          min={0}
          onChange={(v) => setLeg('alongReturn', v)}
        />
        <NumberField
          label="Between the two marks"
          value={triangle.diagonal}
          min={0}
          onChange={(v) => setLeg('diagonal', v)}
        />
        {problem ? <Readout bad>{problem}</Readout> : <Readout>{said}</Readout>}
        <details className="wizard-escape">
          <summary>I have an angle finder</summary>
          <NumberField
            label="Corner angle"
            value={draft[angleKey]}
            suffix="°"
            step={0.1}
            min={45}
            max={135}
            onChange={(v) =>
              patch((o) => {
                o[angleKey] = v;
                // The stored triangle is a record of what was measured. Once the
                // angle is typed it is no longer that, so it goes.
                o[key] = undefined;
              })
            }
          />
        </details>
      </>
    );
  };
}

function Bow({ draft, patch }: StepProps): JSX.Element {
  return (
    <>
      <p>
        Two width measurements say nothing about what the wall does between them. Hold your batten
        flat against each wall the run meets, slide it up and down, and measure the widest gap you
        can find behind it. Use the worst of the two walls.
      </p>
      <BowDiagram />
      <NumberField
        label="Worst gap behind the straightedge"
        value={draft.wallBow}
        min={0}
        step={0.5}
        onChange={(v) => patch((o) => void (o.wallBow = v))}
      />
      <Readout>
        {draft.wallBow < 0.5
          ? 'A dead flat wall. The cabinets can sit against it, and a strip is only made if there is a gap to fill.'
          : `The carcass is held ${draft.wallBow.toFixed(0)} mm off the wall so it clears the bulge, and the strip carries that much more material to plane away.`}
      </Readout>
    </>
  );
}

function Review({ draft, run }: StepProps): JSX.Element {
  const fit = fitOpening(draft, run);
  const problems = checkMeasurements(draft);
  return (
    <>
      <p>Here is what those readings work out to. Check them against the room before you cut.</p>
      <table className="wizard-table">
        <tbody>
          <tr>
            <th>Width</th>
            <td>
              {draft.widthAtTop.toFixed(0)} mm at the top, {draft.widthAtBottom.toFixed(0)} mm at
              the floor
            </td>
          </tr>
          <tr>
            <th>Height</th>
            <td>
              {draft.heightAtLeft.toFixed(0)} mm left, {draft.heightAtRight.toFixed(0)} mm right
            </td>
          </tr>
          {draft.left === 'wall' && (
            <tr>
              <th>Left corner</th>
              <td>{draft.cornerAngleLeft.toFixed(1)}°</td>
            </tr>
          )}
          {draft.right === 'wall' && (
            <tr>
              <th>Right corner</th>
              <td>{draft.cornerAngleRight.toFixed(1)}°</td>
            </tr>
          )}
          <tr>
            <th>Wall bow</th>
            <td>{draft.wallBow.toFixed(1)} mm</td>
          </tr>
        </tbody>
      </table>

      {problems.map((p, i) => (
        <Readout key={i} bad>
          {p.message} {p.hint}
        </Readout>
      ))}

      {describeFit(draft, fit, run).map((sentence, i) => (
        <p key={i} className="wizard-derived">
          {sentence}
        </p>
      ))}
    </>
  );
}

function Readout({ children, bad = false }: { children: React.ReactNode; bad?: boolean }) {
  return <p className={bad ? 'wizard-readout bad' : 'wizard-readout'}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Diagrams
//
// Plain inline SVG, drawn from above or from the front the way the instruction
// reads. A sketch of the measurement is worth more here than any amount of
// prose about which corner is which.
// ---------------------------------------------------------------------------

const WALL = '#6f93bb';
const RUN = '#c8a578';
const TAPE = '#f0a04b';
const LABEL = '#98a1b3';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg className="wizard-svg" viewBox="0 0 340 170" role="img">
      {children}
    </svg>
  );
}

/** Plan view: the run between whichever walls it actually meets. */
function PlanDiagram({ left, right }: { left: boolean; right: boolean }) {
  return (
    <Frame>
      <line x1="60" y1="40" x2="280" y2="40" stroke={WALL} strokeWidth="5" />
      <text x="170" y="30" fill={LABEL} fontSize="11" textAnchor="middle">
        back wall
      </text>
      {left && <line x1="60" y1="40" x2="60" y2="130" stroke={WALL} strokeWidth="5" />}
      {right && <line x1="280" y1="40" x2="280" y2="130" stroke={WALL} strokeWidth="5" />}
      <rect x="72" y="44" width="196" height="62" fill={RUN} opacity="0.35" stroke={RUN} />
      <text x="170" y="82" fill={LABEL} fontSize="11" textAnchor="middle">
        the run
      </text>
      <text x="40" y="150" fill={LABEL} fontSize="11" textAnchor="middle">
        {left ? 'wall' : 'open'}
      </text>
      <text x="300" y="150" fill={LABEL} fontSize="11" textAnchor="middle">
        {right ? 'wall' : 'open'}
      </text>
    </Frame>
  );
}

/** Elevation: the two width readings, at the top of the run and at the floor. */
function WidthDiagram() {
  return (
    <Frame>
      <path d="M70 20 L70 140 L282 140 L272 20 Z" fill="none" stroke={WALL} strokeWidth="3" />
      <line x1="60" y1="140" x2="300" y2="140" stroke={WALL} strokeWidth="3" />
      <Tape x1="70" x2="273" y="42" label="at the top of the run" />
      <Tape x1="70" x2="282" y="128" label="at the floor" />
    </Frame>
  );
}

/** Elevation: floor to head, taken at each end. */
function HeightDiagram() {
  return (
    <Frame>
      <line x1="60" y1="24" x2="300" y2="24" stroke={WALL} strokeWidth="3" />
      <line x1="60" y1="136" x2="300" y2="146" stroke={WALL} strokeWidth="3" />
      <text x="180" y="16" fill={LABEL} fontSize="11" textAnchor="middle">
        ceiling, soffit or worktop
      </text>
      <VTape y1="24" y2="136" x="96" label="left" />
      <VTape y1="24" y2="146" x="264" label="right" />
      <text x="180" y="163" fill={LABEL} fontSize="11" textAnchor="middle">
        floor
      </text>
    </Frame>
  );
}

/**
 * Plan view of one corner, with the two legs marked out and the diagonal to read.
 *
 * Mirrored by construction for the right-hand corner rather than with a CSS
 * transform: a transform flips the labels too, and counter-flipping them leaves
 * every one of them sitting where the *other* corner's wall used to be.
 */
function CornerDiagram({ end }: { end: 'left' | 'right' }) {
  const flip = end === 'right';
  const X = (x: number): number => (flip ? 340 - x : x);
  return (
    <Frame>
      <line x1={X(70)} y1="34" x2={X(290)} y2="34" stroke={WALL} strokeWidth="5" />
      <line x1={X(70)} y1="34" x2={X(70)} y2="150" stroke={WALL} strokeWidth="5" />
      <line x1={X(70)} y1="34" x2={X(196)} y2="34" stroke={TAPE} strokeWidth="3" />
      <line x1={X(70)} y1="34" x2={X(70)} y2="122" stroke={TAPE} strokeWidth="3" />
      <line
        x1={X(196)}
        y1="34"
        x2={X(70)}
        y2="122"
        stroke={TAPE}
        strokeWidth="2"
        strokeDasharray="6 4"
      />
      <circle cx={X(196)} cy="34" r="4" fill={TAPE} />
      <circle cx={X(70)} cy="122" r="4" fill={TAPE} />
      <text x={X(133)} y="22" fill={LABEL} fontSize="11" textAnchor="middle">
        back wall
      </text>
      <text x={X(114)} y="144" fill={LABEL} fontSize="11" textAnchor="middle">
        side wall
      </text>
      <text x={X(185)} y="116" fill={TAPE} fontSize="12" textAnchor="middle">
        measure this
      </text>
    </Frame>
  );
}

/** Plan view of a bowed wall with a straightedge held across it. */
function BowDiagram() {
  return (
    <Frame>
      <path d="M60 60 Q170 108 300 62" fill="none" stroke={WALL} strokeWidth="5" />
      <line x1="70" y1="61" x2="292" y2="61" stroke={RUN} strokeWidth="4" />
      <text x="181" y="46" fill={LABEL} fontSize="11" textAnchor="middle">
        straightedge held against the wall
      </text>
      <line x1="176" y1="63" x2="176" y2="92" stroke={TAPE} strokeWidth="2" />
      <text x="192" y="112" fill={TAPE} fontSize="12" textAnchor="start">
        the widest gap behind it
      </text>
      <text x="181" y="138" fill={LABEL} fontSize="11" textAnchor="middle">
        wall, seen from above
      </text>
    </Frame>
  );
}

function Tape({ x1, x2, y, label }: { x1: string; x2: string; y: string; label: string }) {
  return (
    <>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={TAPE} strokeWidth="2" />
      <text
        x={(Number(x1) + Number(x2)) / 2}
        y={Number(y) - 6}
        fill={TAPE}
        fontSize="11"
        textAnchor="middle"
      >
        {label}
      </text>
    </>
  );
}

function VTape({ x, y1, y2, label }: { x: string; y1: string; y2: string; label: string }) {
  return (
    <>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={TAPE} strokeWidth="2" />
      <text x={Number(x) + 8} y={(Number(y1) + Number(y2)) / 2} fill={TAPE} fontSize="11">
        {label}
      </text>
    </>
  );
}
