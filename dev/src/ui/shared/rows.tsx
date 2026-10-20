// A layout row's control, wired to settings. Used by the settings page (all
// controls) and the popup (dark mode, chips, switches).
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { presetRoles } from '../../features/palette/palettes.ts';
import { currentRoles, isPreset, StyleChips } from './chips.tsx';
import { CardOverlay } from '../../features/card-overlay/ui.tsx';
import { makeColorRequest, PALETTES as CARD_PALETTES } from '../../features/card-colors/palettes.ts';
import { CardHeight } from '../../features/condensed-cards/ui.tsx';
import { cssError } from '../../features/custom-css/model.ts';
import { CustomCssEditor } from '../../features/custom-css/ui.tsx';
import { FontSettings } from '../../features/type/ui.tsx';
import type { Font } from '../../features/type/index.ts';
import { PageWidth } from '../../features/full-width/ui.tsx';
import { CardStyle } from '../../features/gradient-cards/ui.tsx';
import { hostDefaults, type ScaleRow } from '../../features/gpa-calculator/gpa.ts';
import { isHex, isSchool, readout, SCHOOL } from './contrast.ts';
import { Checks, CodeField, Icon, NumberField, RadioGroup, Segmented, Select, Stepper, Switch, TextField, TimeRange } from './controls.tsx';
import { DARK_ROLES, type OptValue, type RowDef } from './layout.ts';
import { PRESET_KEY, ROLES_KEY, canBeSchool, roleKeys, rolePatch, rowOptions, rowPatch, rowValue, type DarkMode } from './model.ts';
import { apply, schema, values } from './state.ts';
import { Themes } from './themes.tsx';
import { applyWithUndo, showToast } from './toast.tsx';
import { scalePreset, scalePresetPatch, SCALE_OPTIONS, WEIGHTS_KEY } from './gpa-scale.ts';


export interface Ids { labelledBy: string; describedBy?: string; disabled: boolean }

const set = (row: RowDef, v: unknown) => void apply(rowPatch(row, v, schema, values.value));

/** The control a row shows on its right (`ctl`), and an optional full-width `block` below. */
export function rowControl(row: RowDef, ids: Ids): { ctl?: ComponentChildren; block?: ComponentChildren } {
  const v = values.value;
  const val = rowValue(row, v, schema);
  const s = row.key ? schema[row.key] : undefined;
  switch (row.control) {
    case 'switch':
      return { ctl: <Switch {...ids} checked={!!val} onChange={x => set(row, x)} /> };
    case 'segmented':
    case 'dark-mode':
      return { ctl: <Segmented {...ids} value={val as OptValue} options={rowOptions(row, schema)} onChange={x => set(row, x)} /> };
    case 'select':
      return { ctl: <Select {...ids} value={String(val)} options={rowOptions(row, schema).map(([a, b]) => [String(a), b] as const)} onChange={x => set(row, x)} /> };
    case 'font': {
      const opts = s?.kind === 'enum' ? s.values : [];
      const label = (f: string) => (f === 'Canvas default' ? 'Canvas default (Lato)' : f === 'Installed' ? 'A font installed on this computer' : f);
      const face = (f: string) => (f === 'System' ? 'var(--b2c-font-ui)' : f === 'Canvas default' || f === 'Installed' ? undefined : `"${f}"`);
      return { ctl: <Select {...ids} value={String(val)} options={opts.map(f => [f, label(f)] as const)} onChange={x => set(row, x)}
        optionStyle={f => { const x = face(f); return x ? { fontFamily: x } : undefined; }} /> };
    }
    case 'stepper': {
      const r = s && (s.kind === 'int' || s.kind === 'num') ? s : { min: 0, max: 99, step: 1 };
      return { ctl: <Stepper {...ids} value={Number(val)} min={r.min ?? 0} max={r.max ?? 99} step={r.step ?? 1} onChange={x => set(row, x)} /> };
    }
    case 'number': {
      const r: { min?: number; max?: number; step?: number } = s && (s.kind === 'int' || s.kind === 'num') ? s : {};
      return { ctl: <NumberField {...ids} value={Number(val)} min={r.min} max={r.max} step={r.step} onChange={x => set(row, x)} /> };
    }
    case 'text':
      return { ctl: <TextField {...ids} value={String(val ?? '')} maxLength={s?.kind === 'str' ? s.maxLength : undefined} onChange={x => set(row, x)} /> };
    case 'time-range': {
      const [a, b] = row.keys!;
      return { ctl: <TimeRange idBase={`t-${row.id}`} disabled={ids.disabled} start={String(v[a!])} end={String(v[b!])}
        onChange={(k, x) => void apply({ [k === 'start' ? a! : b!]: x })} /> };
    }
    case 'checks':
      return { ctl: <Checks {...ids} items={(row.options ?? []).filter(([k]) => schema[String(k)]).map(([k, l]) => ({ key: String(k), label: l, checked: !!v[String(k)] }))}
        onChange={(k, x) => void apply({ [k]: x })} /> };
    case 'code':
      return { block: <CodeField {...ids} value={String(val ?? '')} onCommit={x => set(row, x)}
        check={css => { const e = cssError(css); return e ? `Line ${e.line}: ${e.message}` : null; }}
        placeholder={'/* Applies to every Canvas page */\n.ic-DashboardCard__header_hero { opacity: .8; }'} /> };
    case 'style-chips':
      return { ctl: <StyleChips {...ids} /> };
    case 'color-wells':
      return { block: <ColorWells disabled={ids.disabled} /> };
    case 'scale':
      return { block: <GradeScale {...ids} row={row} /> };
    case 'sliders':
      return { block: <Sliders row={row} disabled={ids.disabled} /> };
    case 'hidden-cards':
      return { block: <HiddenCards row={row} disabled={ids.disabled} /> };
    case 'card-colors':
      return { ctl: <CardColors {...ids} row={row} /> };
    case 'component':
      return { block: <Mounted row={row} /> };
    default:
      return {};
  }
}

// ── Colour wells, grouped, with contrast readouts ──
/** Editing a role makes the look Custom, starting from the preset in use. */
function editRole(field: string, value: string): Record<string, unknown> {
  const p = String(values.value[PRESET_KEY]);
  const seed: Record<string, string> = isPreset(p) ? presetRoles(p) : { ...presetRoles('dark'), ...((values.value[ROLES_KEY] as Record<string, string> | null) ?? {}) };
  return rolePatch(field, value, seed, schema);
}
function ColorWells({ disabled }: { disabled: boolean }) {
  const roles = roleKeys(schema);
  const colors = currentRoles();
  return (
    <div class="wells">
      {DARK_ROLES.map(g => {
        const mine = roles.filter(r => r.group === g.title);
        if (!mine.length) return null;
        const gid = `wg-${g.title.toLowerCase()}`;
        return (
          <div role="group" aria-labelledby={gid} key={g.title}>
            <h3 id={gid}>{g.title}</h3>
            {mine.map(r => <Well key={r.field} role={r.role} label={r.label} group={g.title} k={r.field} value={colors[r.role] ?? ''} colors={colors} disabled={disabled} />)}
          </div>
        );
      })}
    </div>
  );
}

function Well({ role, label, group, k, value, colors, disabled }: { role: string; label: string; group: string; k: string; value: string; colors: Record<string, string>; disabled: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const canSchool = role in SCHOOL && canBeSchool(k);
  const school = canSchool && isSchool(value);
  const shown = school ? '' : value;
  const swatch = isHex(value) ? value : SCHOOL[role] ?? '#000000';
  const r = readout(role, colors);
  const commit = (x: string) => void apply(editRole(k, x.toLowerCase()));
  const lid = `wl-${k}`, rid = `wr-${k}`;
  return (
    <div class="well">
      <input type="color" aria-label={`${group} ${label.toLowerCase()} color`} value={swatch} disabled={disabled} onInput={e => commit(e.currentTarget.value)} />
      <span class="well-name"><span id={lid}>{label}</span>
        {r && <span id={rid} class={'readout' + (r.low ? ' low' : '')} title={r.title}>{r.text}{r.low && <span class="warn">{r.low}</span>}</span>}
      </span>
      <input class="hex" type="text" maxLength={7} spellcheck={false} autoComplete="off" aria-labelledby={lid} aria-describedby={r ? rid : undefined}
        aria-invalid={bad} placeholder={canSchool ? 'School' : undefined} disabled={disabled} value={draft ?? shown}
        onInput={e => {
          const raw = e.currentTarget.value; setDraft(raw);
          const x = raw.trim().replace(/^#?/, '#');
          const ok = /^#[0-9a-f]{6}$/i.test(x);
          setBad(!ok && raw.length >= 6);
          if (ok) commit(x);
        }}
        onBlur={() => { setDraft(null); setBad(false); }} />
      {canSchool && <button class="icon-btn" type="button" hidden={school} disabled={disabled} aria-label={`Use the school’s ${label.toLowerCase()} color`} title="Use school color"
        onClick={() => applyWithUndo(`${group} ${label.toLowerCase()} uses the school color`, editRole(k, ''))}><Icon.reset /></button>}
    </div>
  );
}

/** A strip of the 10 role colours, beside "Customize colors". */
export function ColorStrip() {
  const c = currentRoles();
  return <span class="strip" aria-hidden="true">{roleKeys(schema).map(r => <span key={r.field} style={{ background: isHex(c[r.role]) ? c[r.role] : SCHOOL[r.role] }} />)}</span>;
}

// ── GPA grade scale: preset menu + table editor ──
function GradeScale({ row, labelledBy, disabled }: Ids & { row: RowDef }) {
  const key = row.key!;
  const stored = values.value[key] as ScaleRow[] | null;
  const auto = hostDefaults('');
  const scale = stored ?? auto.scale;
  const preset = scalePreset(stored, values.value[WEIGHTS_KEY]);
  const opts = SCALE_OPTIONS(true);
  const put = (rows: ScaleRow[] | null) => void apply({ [key]: rows });
  const edit = (i: number, patch: Partial<ScaleRow>) => put(scale.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const [focusLast, setFocusLast] = useState(false);
  useEffect(() => {
    if (!focusLast) return;
    setFocusLast(false);
    (document.querySelector(`[data-row="${row.id}"] tbody tr:last-child input`) as HTMLInputElement | null)?.focus();
  });
  return (
    <div class="scale-editor">
      <Select labelledBy={labelledBy} disabled={disabled} value={preset} options={opts}
        onChange={p => void apply(scalePresetPatch(p, scale, !!schema[WEIGHTS_KEY]))} />
      <table class="scale" aria-labelledby={labelledBy}>
        <thead><tr><th scope="col">Letter</th><th scope="col">Minimum %</th><th scope="col">Points</th><th><span class="vh">Remove</span></th></tr></thead>
        <tbody>
          {scale.map((r, i) => {
            const name = r.letter || `row ${i + 1}`;
            return (
              <tr key={i}>
                <td><input class="field letter" aria-label={`Letter, row ${i + 1}`} disabled={disabled} value={r.letter} onChange={e => edit(i, { letter: e.currentTarget.value.trim() })} /></td>
                <td><input class="field num" type="number" min={0} max={100} step={0.5} aria-label={`Minimum percent for ${name}`} disabled={disabled} value={r.min}
                  onChange={e => edit(i, { min: Number(e.currentTarget.value) })} /></td>
                <td><input class="field num" type="number" min={0} max={5} step={0.01} aria-label={`Points for ${name}`} disabled={disabled} value={r.points.toFixed(2)}
                  onChange={e => edit(i, { points: Number(e.currentTarget.value) })} /></td>
                <td><button class="icon-btn" type="button" aria-label={`Remove ${name}`} disabled={disabled}
                  onClick={() => applyWithUndo(`Removed ${name}`, { [key]: scale.filter((_, j) => j !== i) })}><Icon.remove /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div class="block-foot">
        <button class="btn quiet" type="button" disabled={disabled} onClick={() => { put([...scale, { letter: '', points: 0, min: 0 }]); setFocusLast(true); }}><Icon.plus />Add grade</button>
      </div>
    </div>
  );
}

export type { DarkMode };

// ── Feature lanes' own settings components (dev/.scratch/look2/REQUESTS.md) ──
function Mounted({ row }: { row: RowDef }) {
  const v = values.value;
  const b = (k: string) => !!v[k];
  switch (row.mount) {
    case 'font':
      return <FontSettings family={(v['type.family'] ?? 'Canvas default') as Font} localFamily={String(v['type.localFamily'] ?? '')}
        onChange={(family, localFamily) => void apply({ 'type.family': family, 'type.localFamily': localFamily })} />;
    case 'custom-css':
      return <CustomCssEditor value={String(v['custom-css.css'] ?? '')} onCommit={css => set(row, css)} />;
    case 'page-width':
      return <PageWidth value={v['full-width.width'] as 'standard' | 'wide' | 'full'} onChange={x => void apply({ 'full-width.width': x })} />;
    case 'card-style':
      return <CardStyle value={b('gradient-cards.enabled')} onChange={x => void apply({ 'gradient-cards.enabled': x })} />;
    case 'card-height':
      return <CardHeight value={b('condensed-cards.enabled')} onChange={x => void apply({ 'condensed-cards.enabled': x })} />;
    case 'themes':
      return <Themes />;
    case 'card-overlay':
      return <CardOverlay value={b('card-overlay.overlay')} onChange={x => void apply({ 'card-overlay.overlay': x })} />;
    default:
      return null;
  }
}

// ── Card colors: "Set all…" opens a palette sheet. The request applies in
//    whichever open dashboard sees it first (card-colors feature). ──
function CardColors({ row, describedBy, disabled }: Ids & { row: RowDef }) {
  const ref = useRef<HTMLDialogElement>(null);
  const request = (r: Parameters<typeof makeColorRequest>[0], msg: string) => {
    ref.current?.close();
    void apply({ [row.key!]: makeColorRequest(r) });
    showToast(msg, r.mode === 'revert' ? null : () => void apply({ [row.key!]: makeColorRequest({ mode: 'revert' }) }));
  };
  return <>
    <button class="btn" type="button" aria-label="Set all card colors" aria-describedby={describedBy} disabled={disabled}
      onClick={e => ((e.currentTarget.nextElementSibling as HTMLDialogElement).showModal())}>Set all…</button>
    <dialog ref={ref} aria-labelledby="pd-title" onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
      <h3 id="pd-title">Set all card colors</h3>
      <div class="palettes">
        {Object.entries(CARD_PALETTES).map(([name, cols]) => (
          <button key={name} class="palette" type="button" onClick={() => request({ mode: 'palette', palette: name }, `Card colors set to ${name}. Open your dashboard to see them`)}>
            <span>{name}</span>
            <span class="strip" aria-hidden="true">{cols.slice(0, 8).map(c => <span key={c} style={{ background: c }} />)}</span>
          </button>
        ))}
      </div>
      <div class="panel-foot">
        {values.value['card-colors.previous'] != null && <button class="btn quiet" type="button" onClick={() => request({ mode: 'revert' }, 'Card colors put back')}>Put back previous colors</button>}
        <span class="spacer" />
        <button class="btn" type="button" onClick={() => ref.current?.close()}>Cancel</button>
      </div>
    </dialog>
  </>;
}

// ── Sliders: one range per int key, live value, own ↺ ──
function Sliders({ row, disabled }: { row: RowDef; disabled: boolean }) {
  const v = values.value;
  return (
    <div class="sliders">
      {(row.options ?? []).map(([k, label]) => {
        const key = String(k), s = schema[key];
        if (!s || s.kind !== 'int') return null;
        const val = Number(v[key]), nd = val !== s.default, id = `sl-${key}`;
        return (
          <div key={key} class={'slider' + (nd ? ' nondefault' : '')}>
            <label for={id}>{label}</label>
            <input type="range" id={id} min={s.min} max={s.max} step={s.step ?? 1} value={val} disabled={disabled}
              aria-valuetext={`${val} pixels${nd ? '' : ', Canvas default'}`} onInput={e => void apply({ [key]: Number(e.currentTarget.value) })} />
            <output for={id}>{val} px</output>
            <button class="reset" type="button" tabIndex={nd ? 0 : -1} disabled={disabled} aria-label={`Reset ${label.toLowerCase()}`} title="Reset to default"
              onClick={() => applyWithUndo(`Reset ${label.toLowerCase()}`, { [key]: s.default })}><Icon.reset /></button>
          </div>
        );
      })}
    </div>
  );
}

// ── Hidden cards: hide is done on the card; unhide from here too ──
function HiddenCards({ row, disabled }: { row: RowDef; disabled: boolean }) {
  const key = row.key!;
  const cards = (values.value[key] ?? {}) as Record<string, { hidden?: boolean; label?: string }>;
  const hidden = Object.entries(cards).filter(([, c]) => c.hidden);
  if (!hidden.length) return <span class="status">None. Hide a card from its menu on the dashboard.</span>;
  return (
    <div class="list">
      {hidden.map(([id, c]) => {
        const name = c.label || `Course ${id}`;
        return (
          <div class="list-item" key={id}>
            <span>{name}</span>
            <button class="btn quiet" type="button" disabled={disabled} aria-label={`Unhide ${name}`} onClick={() => {
              const { hidden: _h, ...rest } = cards[id]!;
              applyWithUndo(`${name} is back on the dashboard`, { [key]: { ...cards, [id]: rest } });
            }}>Unhide</button>
          </div>
        );
      })}
    </div>
  );
}
