import type { ReactNode } from 'react';

export function Group({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="group" open={open}>
      <summary>{title}</summary>
      <div className="body">{children}</div>
    </details>
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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  title?: string;
}) {
  return (
    <div className="field" title={title}>
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
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  title?: string;
}) {
  return (
    <div className="field" title={title}>
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

export function CheckField({
  label,
  value,
  onChange,
  title,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <div className="field" title={title}>
      <label>{label}</label>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field wide">
      <label>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
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
