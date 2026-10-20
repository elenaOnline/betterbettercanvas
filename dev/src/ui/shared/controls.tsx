// Controls shared by the popup and the settings page, ported from Design's
// prototypes (design/spec/surfaces/popup.html, settings-page.html). Each is
// presentational: it gets a value and an onChange, and knows nothing about
// storage. Class names match the prototypes so Design's CSS ports as-is.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { OptValue } from './layout.ts';

export const Icon = {
  chevron: () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" /></svg>,
  down: () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5L6 7.5l3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" /></svg>,
  reset: () => <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6.5A5 5 0 1 1 3 9.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" /><path d="M3 2.5v4h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" /></svg>,
  minus: () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" /></svg>,
  plus: () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7M6 2.5v7" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" /></svg>,
  remove: () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" /></svg>,
  search: () => <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" /></svg>,
};

interface Labelled { labelledBy?: string; describedBy?: string; label?: string; disabled?: boolean }

export function Switch({ checked, onChange, labelledBy, describedBy, label, disabled }: Labelled & { checked: boolean; onChange(v: boolean): void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-labelledby={labelledBy} aria-describedby={describedBy}
    aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />;
}

/** Radio group with a roving tabindex: arrows move and select, like native radios. */
export function RadioGroup<T extends OptValue>({ value, options, onChange, class: cls, labelledBy, label, disabled, render }: Labelled & {
  value: T; options: readonly (readonly [T, string])[]; onChange(v: T): void; class: string;
  render?: (v: T, label: string, checked: boolean) => ComponentChildren; itemClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const live = options.some(([v]) => v === value);
  const onKey = (e: KeyboardEvent) => {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = options.findIndex(([v]) => v === value);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (Math.max(i, 0) + step! + options.length) % options.length;
    onChange(options[n]![0]);
    requestAnimationFrame(() => (ref.current?.children[n] as HTMLElement | undefined)?.focus());
  };
  return (
    <div ref={ref} class={cls} role="radiogroup" aria-labelledby={labelledBy} aria-label={label} aria-disabled={disabled || undefined} onKeyDown={onKey}>
      {options.map(([v, l], i) => {
        const on = v === value;
        return <button key={String(v)} type="button" role="radio" aria-checked={on} tabIndex={on || (!live && i === 0) ? 0 : -1}
          class={render ? 'chip' : undefined} disabled={disabled} onClick={() => onChange(v)}>{render ? render(v, l, on) : l}</button>;
      })}
    </div>
  );
}

export const Segmented = <T extends OptValue>(p: Labelled & { value: T; options: readonly (readonly [T, string])[]; onChange(v: T): void }) =>
  <RadioGroup {...p} class="seg" />;

export function Select({ value, options, onChange, labelledBy, disabled, optionStyle }: Labelled & {
  value: string; options: readonly (readonly [string, string])[]; onChange(v: string): void;
  optionStyle?: (v: string) => Record<string, string> | undefined;
}) {
  return (
    <span class="select">
      <select aria-labelledby={labelledBy} disabled={disabled} value={value} onChange={e => onChange(e.currentTarget.value)}>
        {options.map(([v, l]) => <option key={v} value={v} style={optionStyle?.(v)}>{l}</option>)}
      </select>
      <Icon.down />
    </span>
  );
}

/** − value +, typeable, arrow keys (role=spinbutton). */
export function Stepper({ value, min, max, step = 1, onChange, labelledBy, disabled }: Labelled & {
  value: number; min: number; max: number; step?: number; onChange(v: number): void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const [draft, setDraft] = useState<string | null>(null);
  const onKey = (e: KeyboardEvent) => {
    const d = ({ ArrowUp: step, ArrowDown: -step, PageUp: 5 * step, PageDown: -5 * step } as Record<string, number>)[e.key];
    if (d) { e.preventDefault(); onChange(clamp(value + d)); }
    else if (e.key === 'Home') { e.preventDefault(); onChange(min); }
    else if (e.key === 'End') { e.preventDefault(); onChange(max); }
    else if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
  };
  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    setDraft(null);
    if (!Number.isNaN(n) && clamp(n) !== value) onChange(clamp(n));
  };
  return (
    <span class="stepper">
      <button type="button" tabIndex={-1} aria-label="Decrease" disabled={disabled || value <= min} onClick={() => onChange(clamp(value - step))}><Icon.minus /></button>
      <input type="text" inputMode="numeric" role="spinbutton" aria-labelledby={labelledBy} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
        disabled={disabled} value={draft ?? String(value)} onInput={e => setDraft(e.currentTarget.value)} onBlur={commit} onKeyDown={onKey} />
      <button type="button" tabIndex={-1} aria-label="Increase" disabled={disabled || value >= max} onClick={() => onChange(clamp(value + step))}><Icon.plus /></button>
    </span>
  );
}

export function NumberField({ value, min, max, step, onChange, labelledBy, disabled }: Labelled & {
  value: number; min?: number; max?: number; step?: number; onChange(v: number): void;
}) {
  return <input class="field num" type="number" min={min} max={max} step={step ?? 'any'} aria-labelledby={labelledBy} disabled={disabled}
    value={value} onChange={e => { const n = Number(e.currentTarget.value); if (Number.isFinite(n)) onChange(n); }} />;
}

export function TextField({ value, onChange, labelledBy, describedBy, disabled, maxLength, placeholder }: Labelled & {
  value: string; onChange(v: string): void; maxLength?: number; placeholder?: string;
}) {
  return <input class="field text" type="text" spellcheck={false} autoComplete="off" aria-labelledby={labelledBy} aria-describedby={describedBy}
    disabled={disabled} maxLength={maxLength} placeholder={placeholder} value={value} onChange={e => onChange(e.currentTarget.value)} />;
}

export function TimeRange({ start, end, onChange, disabled, idBase }: { start: string; end: string; onChange(k: 'start' | 'end', v: string): void; disabled?: boolean; idBase: string }) {
  return <>
    <label class="time-label" for={`${idBase}-from`}>From</label>
    <input class="field" type="time" step={60} id={`${idBase}-from`} disabled={disabled} value={start} onChange={e => e.currentTarget.value && onChange('start', e.currentTarget.value)} />
    <label class="time-label" for={`${idBase}-to`}>To</label>
    <input class="field" type="time" step={60} id={`${idBase}-to`} disabled={disabled} value={end} onChange={e => e.currentTarget.value && onChange('end', e.currentTarget.value)} />
  </>;
}

export function Checks({ items, onChange, labelledBy, disabled }: Labelled & {
  items: readonly { key: string; label: string; checked: boolean }[]; onChange(key: string, v: boolean): void;
}) {
  return (
    <div class="inline-checks" role="group" aria-labelledby={labelledBy}>
      {items.map(i => <label key={i.key}><input type="checkbox" checked={i.checked} disabled={disabled} onChange={e => onChange(i.key, e.currentTarget.checked)} />{i.label}</label>)}
    </div>
  );
}

/** Code field: applies on blur (or ⌘S), never per keystroke. */
export function CodeField({ value, onCommit, check, labelledBy, describedBy, disabled, placeholder }: Labelled & {
  value: string; onCommit(v: string): void; check?: (v: string) => string | null; placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);
  const commit = () => {
    const issue = check?.(draft) ?? null;
    setError(issue);
    if (!issue && draft !== value) onCommit(draft);
  };
  return <>
    <textarea class="code" rows={8} spellcheck={false} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={!!error}
      disabled={disabled} placeholder={placeholder} value={draft}
      onFocus={() => (focused.current = true)}
      onInput={e => setDraft(e.currentTarget.value)}
      onBlur={() => { focused.current = false; commit(); }}
      onKeyDown={e => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); commit(); }
        if (e.key === 'Tab' && e.altKey && !e.shiftKey) { e.preventDefault(); e.currentTarget.setRangeText('  ', e.currentTarget.selectionStart, e.currentTarget.selectionEnd, 'end'); setDraft(e.currentTarget.value); }
      }} />
    <p class={'code-status' + (error ? ' low' : '')} role="status">{error ?? ''}</p>
  </>;
}

/** Search text with the match marked. */
export function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}
