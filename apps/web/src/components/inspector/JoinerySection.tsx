import { useStore } from '../../store';
import { CheckField, ChoiceField, Group, Hint, NumberField, SelectField } from '../Controls';

/**
 * How the boxes go together.
 *
 * Project-wide rather than per carcass — one set of grooves that all have to
 * fit each other — but shown on the carcass, because that is the thing it is
 * about and the only place anyone would look for it. R-16 measured this
 * dropdown 3550 px down a closed group with no explanation at all, and named
 * it as the capability nobody finds.
 */
export function JoinerySection() {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const j = params.joinery;

  return (
    <Group
      title="How it goes together"
      count={j.carcassJoint === 'tabslot' ? 'tab & slot' : undefined}
    >
      <ChoiceField
        label="Carcass joint"
        value={j.carcassJoint}
        param="joinery.carcassJoint"
        options={[
          {
            value: 'dado',
            label: 'Stopped dado',
            about: 'Housed and screwed. Nothing shows on the outside; needs screws and glue.',
          },
          {
            value: 'tabslot',
            label: 'Tab and slot',
            about: 'Knock-down. No screws needed; the tabs show on the outside face.',
          },
        ]}
        onChange={(v) =>
          update((p) => {
            p.joinery.carcassJoint = v;
          })
        }
      />
      <Hint>
        Applies to every carcass in the project — one set of grooves that all have to fit.
      </Hint>
      <SelectField
        label="Corner relief"
        value={j.reliefStyle}
        param="joinery.reliefStyle"
        options={[
          { value: 'dogbone', label: 'Dogbone' },
          { value: 'tbone', label: 'T-bone' },
          { value: 'none', label: 'None' },
        ]}
        onChange={(v) =>
          update((p) => {
            p.joinery.reliefStyle = v;
          })
        }
        title="Without relief, the cutter's radius leaves material where a square corner has to sit."
      />
      <NumberField
        label="Fit clearance"
        value={j.fitClearance}
        step={0.05}
        min={0}
        param="joinery.fitClearance"
        onChange={(v) =>
          update((p) => {
            p.joinery.fitClearance = v;
          })
        }
        title="Added to every groove and slot width. Raise it if joints are too tight."
      />
      <NumberField
        label="Dado depth"
        value={j.dadoDepth}
        step={0.5}
        min={0}
        param="joinery.dadoDepth"
        onChange={(v) =>
          update((p) => {
            p.joinery.dadoDepth = v;
          })
        }
      />
      <NumberField
        label="Dado stop from front"
        value={j.dadoStopFront}
        min={0}
        param="joinery.dadoStopFront"
        onChange={(v) =>
          update((p) => {
            p.joinery.dadoStopFront = v;
          })
        }
        title="Holds the groove back from the front edge so the joint does not show. Zero cuts through."
      />
      {j.carcassJoint === 'tabslot' && (
        <>
          <NumberField
            label="Tab width"
            value={j.tabWidth}
            min={5}
            param="joinery.tabWidth"
            onChange={(v) =>
              update((p) => {
                p.joinery.tabWidth = v;
              })
            }
          />
          <NumberField
            label="Minimum tabs"
            value={j.tabMinCount}
            suffix=""
            min={1}
            param="joinery.tabMinCount"
            onChange={(v) =>
              update((p) => {
                p.joinery.tabMinCount = Math.round(v);
              })
            }
          />
        </>
      )}
      <CheckField
        label="Screw holes"
        value={j.screwHoles}
        param="joinery.screwHoles"
        onChange={(v) =>
          update((p) => {
            p.joinery.screwHoles = v;
          })
        }
        title="Drills clearance holes through the outer panel, on the centreline of every groove, so there is nothing to mark out at assembly."
      />
      {j.screwHoles && (
        <>
          <NumberField
            label="Screw spacing"
            value={j.screwSpacing}
            min={20}
            param="joinery.screwSpacing"
            onChange={(v) =>
              update((p) => {
                p.joinery.screwSpacing = v;
              })
            }
          />
          <NumberField
            label="Clearance hole"
            value={j.screwClearanceDiameter}
            step={0.5}
            min={1}
            param="joinery.screwClearanceDiameter"
            onChange={(v) =>
              update((p) => {
                p.joinery.screwClearanceDiameter = v;
              })
            }
            title="Must pass the screw threads freely. Sized to grip instead, the screw jacks the joint apart rather than pulling it together."
          />
        </>
      )}
    </Group>
  );
}
