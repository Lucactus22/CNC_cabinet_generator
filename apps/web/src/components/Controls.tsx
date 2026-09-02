import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';

/**
 * Whether the section a control sits in is actually open.
 *
 * A closed `details` still renders its children — the browser only hides
 * them — which cost nothing while every control was an input. It costs real
 * work now that a section can hold a gallery of rendered geometry, so a
 * picture waits until somebody can see it. Nested sections carry their
 * parent's answer as well as their own.
 */
const SectionOpen = createContext(true);

export const useSectionOpen = (): boolean => useContext(SectionOpen);

/**
 * A collapsible run of controls inside the inspector or the workshop.
 *
 * The old sidebar's `details` did the same job; what is different is that
 * nothing here is a top-level heading over the whole project, so a closed
 * section hides one aspect of one selected thing rather than a whole
 * capability nobody can find.
 */
export function Group({
  title,
  children,
  open = false,
  count,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
  /** Shown beside the title when the section holds something switched on. */
  count?: number | string;
}) {
  const parentOpen = useSectionOpen();
  const [showing, setShowing] = useState(open);
  return (
    <details className="group" open={open} onToggle={(e) => setShowing(e.currentTarget.open)}>
      <summary>
        {title}
        {count !== undefined && count !== 0 && <span className="count">{count}</span>}
      </summary>
      <SectionOpen.Provider value={parentOpen && showing}>
        <div className="body">{children}</div>
      </SectionOpen.Provider>
    </details>
  );
}

/**
 * Wraps a control so find-by-name can bring it to the surface.
 *
 * The palette sets `focusParam` to a catalogue path; whichever field carries
 * that path scrolls itself in and takes focus. Without this the palette could
 * only get you to the right panel and leave you hunting inside it, which is
 * the failure it exists to fix.
 */
function useReveal(param: string | undefined) {
  const focusParam = useStore((s) => s.focusParam);
  const clear = useStore((s) => s.clearFocusParam);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!param || focusParam !== param || !host.current) return;
    // A section that is closed still has its controls in the page, just
    // hidden — so find-by-name has to open every one above what it found, or
    // it lands you on a heading and calls that an answer. Set on the element
    // rather than through state: React only writes `open` when its own prop
    // changes, so an imperative open survives until the section is toggled.
    for (
      let section = host.current.closest('details');
      section;
      section = section.parentElement?.closest('details') ?? null
    ) {
      section.open = true;
    }
    host.current.scrollIntoView({ block: 'center' });
    // The option already in force, where there is one: landing on a gallery
    // and focusing its *first* tile would preview a choice nobody asked for,
    // and read as though that were the current answer.
    const chosen = host.current.querySelector<HTMLElement>('[aria-pressed="true"]');
    // Never the info button, which sits *before* the field in the DOM because
    // it belongs to the label: `querySelector` answers in document order, so
    // searching "kickboard" used to land the keyboard on "What this does"
    // rather than on the toe kick itself. Found by walking R-23's keyboard
    // pass; it has been true since the infotips landed in R-22.
    const first = host.current.querySelector<HTMLElement>(
      'input, select, textarea, button:not(.infotip-btn)',
    );
    (chosen ?? first)?.focus();
    host.current.classList.add('found');
    const t = setTimeout(() => {
      host.current?.classList.remove('found');
      clear();
    }, 1400);
    return () => clearTimeout(t);
  }, [param, focusParam, clear]);

  return host;
}

/**
 * The explanation a `title` attribute carries, reachable without a mouse.
 *
 * A hover tooltip is invisible to a tablet at the machine (nothing to hover
 * with) and to a keyboard user tabbing through (nothing fires on focus). This
 * puts the same sentence behind a small button instead, which opens on a
 * click or on Enter/Space the way any button does — and keeps the native
 * `title` too, so a mouse still gets it for free on hover. See R-22, F-10.
 */
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="infotip">
      <button
        type="button"
        className="infotip-btn"
        aria-label="What this does"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      {open && (
        <span className="infotip-bubble" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  suffix = 'mm',
  step = 1,
  min,
  max,
  title,
  param,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  title?: string;
  param?: string;
}) {
  const host = useReveal(param);
  return (
    <div className="field" title={title} ref={host} data-param={param}>
      <label>
        {label}
        {title && <InfoTip text={title} />}
      </label>
      <div className="unit">
        <input
          type="number"
          value={Number.isFinite(value) ? round(value) : ''}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onChange(clamp(next, min, max));
          }}
        />
        <span className="suffix">{suffix}</span>
      </div>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  title,
  wide = false,
  param,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  title?: string;
  /** Stack the label above the control, for options whose names are the point. */
  wide?: boolean;
  param?: string;
}) {
  const host = useReveal(param);
  return (
    <div className={wide ? 'field wide' : 'field'} title={title} ref={host} data-param={param}>
      <label>
        {label}
        {title && <InfoTip text={title} />}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The same choice as a select, laid flat with what each option costs.
 *
 * Used where the option names are jargon and the consequence is the thing
 * somebody actually needs — a dropdown of "Stopped dado + screws" against
 * "Tab and slot" tells a newcomer nothing. R-18 replaces the words with
 * rendered pictures; this is the same shape, ready for them.
 */
export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  param,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; about?: string }>;
  onChange: (v: T) => void;
  param?: string;
}) {
  const host = useReveal(param);
  return (
    <div className="choice" ref={host} data-param={param}>
      <label>{label}</label>
      <div className="choice-options">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={o.value === value ? 'choice-option on' : 'choice-option'}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            <b>{o.label}</b>
            {o.about && <span>{o.about}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CheckField({
  label,
  value,
  onChange,
  title,
  param,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  title?: string;
  param?: string;
}) {
  const host = useReveal(param);
  return (
    <div className="field" title={title} ref={host} data-param={param}>
      <label>
        {label}
        {title && <InfoTip text={title} />}
      </label>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  param,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  param?: string;
}) {
  const host = useReveal(param);
  return (
    <div className="field wide" ref={host} data-param={param}>
      <label>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * Anything that is a parameter's control but is not one of the fields above —
 * a list of drawer heights, a row of edge pills, a read-out with no field at
 * all. Wrapping it is what lets find-by-name open its section and point at it.
 */
export function Reveal({
  children,
  param,
  className,
}: {
  children: ReactNode;
  param: string;
  className?: string;
}) {
  const host = useReveal(param);
  return (
    <div className={className} ref={host} data-param={param}>
      {children}
    </div>
  );
}

/** A button that is itself a parameter's control — adding a cabinet, removing a carcass. */
export function ActionField({
  children,
  param,
  className,
}: {
  children: ReactNode;
  param?: string;
  className?: string;
}) {
  const host = useReveal(param);
  return (
    <div className={className ? `actions ${className}` : 'actions'} ref={host} data-param={param}>
      {children}
    </div>
  );
}

export const Hint = ({ children }: { children: ReactNode }) => <p className="hint">{children}</p>;

const round = (n: number): number => Math.round(n * 1000) / 1000;

function clamp(v: number, min?: number, max?: number): number {
  if (min !== undefined && v < min) return min;
  if (max !== undefined && v > max) return max;
  return v;
}
