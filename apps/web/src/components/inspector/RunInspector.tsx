import { useState } from 'react';
import { cabinetPositions, describeFit, fitOpening, runSize, type OpeningSpec } from '@cabgen/core';
import { useStore } from '../../store';
import { CheckField, Group, Hint, NumberField, Reveal, SelectField, TextField } from '../Controls';
import { MeasureWizard } from '../MeasureWizard';
import { EffectList } from './EffectList';

/**
 * The project itself: what it is called, the room it has to fit, and what the
 * run adds up to.
 *
 * This is what is on screen when nothing narrower is selected, so it is also
 * the shell's resting state — kept deliberately short. Everything the old
 * sidebar showed here now belongs to the thing it is about and appears when
 * that thing is selected.
 */
export function RunInspector() {
  const params = useStore((s) => s.params);
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.update);

  const positions = cabinetPositions(params.cabinets);
  const total = positions.reduce((a, c) => a + c.w, 0);

  return (
    <>
      <Group title="Project" open>
        <TextField
          label="Name"
          value={params.name}
          param="name"
          onChange={(v) =>
            update((p) => {
              p.name = v;
            })
          }
        />
        <Hint>
          {params.cabinets.length} cabinet{params.cabinets.length === 1 ? '' : 's'} ·{' '}
          {total.toFixed(0)} mm along the wall · {project.parts.length} parts. Click a box below to
          work on it.
        </Hint>
      </Group>

      <TheRoom />

      <Group title="Surface effects" count={params.surfaceEffects.length}>
        <EffectList />
      </Group>

      <Group title="Output">
        <CheckField
          label="Engrave part labels"
          value={params.labelParts}
          param="labelParts"
          onChange={(v) =>
            update((p) => {
              p.labelParts = v;
            })
          }
          title="Writes each part's ID onto the LABEL layer for reference."
        />
      </Group>
    </>
  );
}

/**
 * The room, as measured with a tape.
 *
 * One thing here is deliberately not editable: the corner angles. Every other
 * field is a tape reading; an angle is not, because nobody owns a protractor
 * that fits a room corner. R-16 measured the by-hand route as twelve
 * interactions cheaper than the walkthrough *and* silently accepting a guess,
 * which is the one place in the app where the fast route produced wrong parts.
 * So the angle is shown, with where it came from, and changed only through the
 * walkthrough — which derives it from three tape readings, or takes an
 * instrument reading under its own heading. See docs/OPENING.md.
 */
/**
 * The measured opening, and the strips cut to take up the gap between the run
 * and the walls. Exported so clicking a scribe strip in the model can offer
 * the thing that decides it.
 */
export function TheRoom() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const opening = params.opening;
  const run = runSize(params.cabinets);
  const fit = fitOpening(opening, run);
  const [measuring, setMeasuring] = useState(false);

  const patch = (fn: (o: OpeningSpec) => void): void =>
    update((p) => {
      fn(p.opening);
    });

  // Open at rest, unlike every other section: fitting a run to a crooked room
  // is the journey the old sidebar hid best, and the walkthrough is the only
  // route that does not accept a guessed corner angle.
  return (
    <Group title="The room" open count={opening.enabled ? 'fitted' : undefined}>
      {measuring && <MeasureWizard onClose={() => setMeasuring(false)} />}
      <CheckField
        label="Fit to a measured opening"
        value={opening.enabled}
        param="opening.enabled"
        onChange={(v) => patch((o) => void (o.enabled = v))}
        title="The carcasses stay square whatever the room does. What comes out of this is the scribe strips and fillers that take up the difference."
      />
      <button
        onClick={() => setMeasuring(true)}
        title="Eleven readings off a tape, about ten minutes."
      >
        Measure the room…
      </button>
      {opening.enabled && (
        <>
          <NumberField
            label="Width at the top"
            value={opening.widthAtTop}
            min={0}
            param="opening.widthAtTop"
            onChange={(v) => patch((o) => void (o.widthAtTop = v))}
            title="Clear width between the walls, measured level with the top of the run."
          />
          <NumberField
            label="Width at the floor"
            value={opening.widthAtBottom}
            min={0}
            param="opening.widthAtBottom"
            onChange={(v) => patch((o) => void (o.widthAtBottom = v))}
            title="The same measurement at the floor. A leaning wall makes the two differ."
          />
          <NumberField
            label="Height at the left"
            value={opening.heightAtLeft}
            min={0}
            param="opening.heightAtLeft"
            onChange={(v) => patch((o) => void (o.heightAtLeft = v))}
            title="Floor to the head of the opening. A difference between the ends is read as a sloping floor."
          />
          <NumberField
            label="Height at the right"
            value={opening.heightAtRight}
            min={0}
            param="opening.heightAtRight"
            onChange={(v) => patch((o) => void (o.heightAtRight = v))}
          />
          <SelectField
            label="Left end"
            value={opening.left}
            param="opening.left"
            options={[
              { value: 'wall', label: 'Against a wall' },
              { value: 'open', label: 'Open' },
            ]}
            onChange={(v) => patch((o) => void (o.left = v))}
            title="An open end has nothing to scribe to, so no strip is made for it."
          />
          <SelectField
            label="Right end"
            value={opening.right}
            param="opening.right"
            options={[
              { value: 'wall', label: 'Against a wall' },
              { value: 'open', label: 'Open' },
            ]}
            onChange={(v) => patch((o) => void (o.right = v))}
          />
          {opening.left === 'wall' && <Corner end="left" onMeasure={() => setMeasuring(true)} />}
          {opening.right === 'wall' && <Corner end="right" onMeasure={() => setMeasuring(true)} />}
          <NumberField
            label="Wall bow"
            value={opening.wallBow}
            min={0}
            step={0.5}
            param="opening.wallBow"
            onChange={(v) => patch((o) => void (o.wallBow = v))}
            title="Worst gap under a straightedge held against the wall. Two width measurements say nothing about what the wall does between them."
          />
          <NumberField
            label="Scribe allowance"
            value={opening.scribe.width}
            min={0}
            param="opening.scribe.width"
            onChange={(v) => patch((o) => void (o.scribe.width = v))}
            title="Material left on the outer edge to plane back to the plaster. It has to be at least as wide as the bow."
          />
          <SelectField
            label="Scribe material"
            value={opening.scribe.materialId}
            param="opening.scribe.materialId"
            options={params.materials.map((m) => ({ value: m.id, label: m.name }))}
            onChange={(v) => patch((o) => void (o.scribe.materialId = v))}
          />
          {describeFit(opening, fit, run).map((sentence, i) => (
            <Hint key={i}>{sentence}</Hint>
          ))}
        </>
      )}
    </Group>
  );
}

/**
 * A corner angle, and where it came from.
 *
 * A stored triangle means three tape readings; no triangle and a square angle
 * means nobody has measured it yet; no triangle and anything else means the
 * walkthrough's angle-finder page, which is an instrument reading rather than
 * a guess. There is no field, because there is no reading a person can take
 * that would fill one honestly.
 */
function Corner({ end, onMeasure }: { end: 'left' | 'right'; onMeasure: () => void }) {
  const opening = useStore((s) => s.params.opening);
  const angle = end === 'left' ? opening.cornerAngleLeft : opening.cornerAngleRight;
  const triangle = end === 'left' ? opening.cornerTriangleLeft : opening.cornerTriangleRight;
  const square = Math.abs(angle - 90) < 0.05;

  const source = triangle
    ? `measured across ${triangle.alongBack.toFixed(0)} and ${triangle.alongReturn.toFixed(0)} mm marks`
    : square
      ? 'assumed square — not measured yet'
      : 'read off an angle finder';

  return (
    <Reveal
      className="derived"
      param={end === 'left' ? 'opening.cornerAngleLeft' : 'opening.cornerAngleRight'}
    >
      <div className="derived-row">
        <span>{end === 'left' ? 'Left corner' : 'Right corner'}</span>
        <b className={triangle ? '' : square ? 'unmeasured' : ''}>{angle.toFixed(1)}°</b>
      </div>
      {/* The three tape readings the angle came from are set in the
          walkthrough, so this is where a search for them lands: the reading
          in use, and the way back to taking it again. */}
      <Reveal param={end === 'left' ? 'opening.cornerTriangleLeft' : 'opening.cornerTriangleRight'}>
        <Hint>
          {source}.{' '}
          <button className="link" onClick={onMeasure}>
            Measure it…
          </button>
        </Hint>
      </Reveal>
    </Reveal>
  );
}
