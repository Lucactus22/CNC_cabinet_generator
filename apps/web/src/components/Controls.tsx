import { useEffect, useRef, type ReactNode } from 'react';
import { useStore } from '../store';

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
  return (
    <details className="group" open={open}>
      <summary>
        {title}
        {count !== undefined && count !== 0 && <span className="count">{count}</span>}
      </summary>
      <div className="body">{children}</div>
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
    host.current.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    host.current.classList.add('found');
    const t = setTimeout(() => {
      host.current?.classList.remove('found');
      clear();
    }, 1400);
    return () => clearTimeout(t);
  }, [param, focusParam, clear]);

  return host;
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
      <label>{label}</label>
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
      <label>{label}</label>
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
      <label>{label}</label>
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
