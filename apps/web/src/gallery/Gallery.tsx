import type { ProjectParams, ProjectResult } from '@cabgen/core';
import { Reveal, useSectionOpen } from '../components/Controls';
import { useStore } from '../store';
import type { Gallery } from './choices';
import { sampleProject } from './samples';
import { Thumbnail } from './Thumbnail';

/**
 * A choice made by looking at the consequence.
 *
 * Three things this is not: it is not a dropdown of jargon, it is not titled
 * with the parameter's name, and it does not hide the options that do not
 * apply. R-16's discovery audit rated tab-and-slot joinery, stopped dados and
 * dogbone relief **Bad** — three of nineteen dropdowns, 3550 px down a closed
 * group, explained by nothing at all. An option nobody can see is an option
 * nobody learns exists, so an unavailable one is shown greyed with the reason
 * instead of being dropped from the list.
 *
 * Hovering builds the whole project as that option would make it and puts it
 * on the model, with what it costs underneath. That is the answer to the worst
 * of R-16's findings about this milestone: changing the carcass joint used to
 * change nothing on screen at all.
 */
export function ChoiceGallery<T extends string>({
  gallery,
  value,
  param,
  set,
  onPick,
  unavailable,
  wide = false,
}: {
  gallery: Gallery<T>;
  /** Which option is in force. Left off where the gallery is an action rather than a setting. */
  value?: T;
  /**
   * The catalogue path this gallery is the control for, so find-by-name can
   * land on it. Left off only where something outside already claims the path
   * — two controls answering to one name would fight over the scroll.
   */
  param?: string;
  /** Apply the option to a project. Used for the preview, and to commit unless `onPick` says otherwise. */
  set: (draft: ProjectParams, value: T) => void;
  /**
   * What a click does, when it is not simply the change `set` describes —
   * adding a cabinet needs an id nothing else has claimed and a selection
   * moved onto it, neither of which a draft mutation can do on its own.
   */
  onPick?: (value: T) => void;
  /** Why an option cannot be used here, if it cannot. */
  unavailable?: (value: T) => string | undefined;
  /** Lay the tiles out as a grid of larger pictures, for a full-width surface. */
  wide?: boolean;
}) {
  const params = useStore((s) => s.params);
  const update = useStore((s) => s.update);
  const previewChange = useStore((s) => s.previewChange);
  const clearPreview = useStore((s) => s.clearPreview);
  // A closed section still renders; a picture in one would be geometry built
  // and projected for nobody.
  const open = useSectionOpen();

  const body = (
    <>
      <p className="gallery-question">{gallery.question}</p>
      <div className="gallery-options">
        {gallery.options.map((option) => {
          const why = unavailable?.(option.value);
          const chosen = option.value === value;
          const tag = `${gallery.id}:${option.value}`;
          const consider = (): void => {
            if (!why && !chosen) previewChange(tag, (draft) => set(draft, option.value));
          };
          return (
            <button
              key={option.value}
              type="button"
              // Greyed rather than disabled: a disabled button is skipped by
              // the keyboard, and this one is here to be read.
              className={`gallery-option${option.apply ? '' : ' words'}${chosen ? ' on' : ''}${
                why ? ' unavailable' : ''
              }`}
              aria-pressed={chosen}
              aria-disabled={why ? true : undefined}
              onClick={() => {
                if (why) return;
                clearPreview();
                if (onPick) onPick(option.value);
                else update((draft) => set(draft, option.value));
              }}
              onPointerEnter={consider}
              onPointerLeave={clearPreview}
              onFocus={consider}
              onBlur={clearPreview}
            >
              {option.apply && (
                <span className="gallery-pic">
                  {open && (
                    <Thumbnail
                      project={sampleProject(params, (p) => {
                        gallery.seed?.(p);
                        option.apply?.(p);
                      })}
                      view={gallery.view}
                    />
                  )}
                </span>
              )}
              <span className="gallery-text">
                <b>{option.label}</b>
                <span>{option.about}</span>
                {why && <em>{why}</em>}
              </span>
            </button>
          );
        })}
      </div>
      <Cost gallery={gallery as Gallery<string>} />
    </>
  );

  const className = wide ? 'gallery wide' : 'gallery';
  return param === undefined ? (
    <div className={className}>{body}</div>
  ) : (
    <Reveal param={param} className={className}>
      {body}
    </Reveal>
  );
}

interface Measure {
  parts: number;
  sheets: number;
  cuts: number;
  errors: number;
  warnings: number;
}

const measure = (p: ProjectResult): Measure => ({
  parts: p.parts.length,
  sheets: p.nest.sheets.length,
  // Everything the spindle has to go and do. This is the number that moves
  // when a construction choice moves and nothing else does.
  cuts: p.parts.reduce(
    (a, part) => a + part.features.filter((f) => f.kind !== 'engrave').length,
    0,
  ),
  errors: p.diagnostics.filter((d) => d.severity === 'error').length,
  warnings: p.diagnostics.filter((d) => d.severity === 'warning').length,
});

/**
 * What the option under the pointer would cost, before it is committed.
 *
 * The counts come off the same build the model is showing, so the sentence and
 * the picture cannot disagree.
 */
function Cost({ gallery }: { gallery: Gallery<string> }) {
  const preview = useStore((s) => s.preview);
  const project = useStore((s) => s.project);
  if (!preview || !preview.tag.startsWith(`${gallery.id}:`)) return null;
  const option = gallery.options.find((o) => `${gallery.id}:${o.value}` === preview.tag);
  const name = option?.label ?? 'that';
  if (!preview.project) return <p className="gallery-cost">Working out what {name} costs…</p>;

  const before = measure(project);
  const after = measure(preview.project);
  return (
    <p className="gallery-cost">
      <b>{name}:</b> <Delta from={before.parts} to={after.parts} unit="parts" /> ·{' '}
      <Delta from={before.sheets} to={after.sheets} unit="sheets" /> ·{' '}
      <Delta from={before.cuts} to={after.cuts} unit="cuts" />
      {verdict(before, after)}
    </p>
  );
}

function Delta({ from, to, unit }: { from: number; to: number; unit: string }) {
  const moved = to - from;
  return (
    <span className={moved === 0 ? 'metric' : 'metric moved'}>
      {to} {unit}
      {moved !== 0 && ` (${moved > 0 ? '+' : ''}${moved})`}
    </span>
  );
}

function verdict(before: Measure, after: Measure): string {
  const errors = after.errors - before.errors;
  if (errors > 0) return `. It would block export: ${count(errors, 'more error')}.`;
  if (errors < 0) return `. It clears ${count(-errors, 'error')}.`;
  const warnings = after.warnings - before.warnings;
  if (warnings > 0) return `. ${count(warnings, 'more warning')} to read.`;
  if (warnings < 0) return `. ${count(-warnings, 'warning')} fewer.`;
  return '.';
}

const count = (n: number, thing: string): string => `${n} ${thing}${n === 1 ? '' : 's'}`;
