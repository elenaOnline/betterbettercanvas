// The Studio's Features mode: the settings that aren't Look, as rows from
// layout.ts SECTIONS (each feature's tuning nested under its switch, dimmed
// while it's off; per-row and per-section reset with Undo), plus the platform
// pieces (Backup, Sites, Diagnostics) and first run. Rows with a visible
// effect get a small live preview (studio.md "Features mode").
import { allFeatures } from '../../core/registry.ts';
import { Diagnostics } from '../../features/diagnostics/ui.tsx';
import { SettingsStorage } from '../../features/settings-storage/ui.tsx';
import { Sites } from '../../features/sites/ui.tsx';
import { Icon } from '../shared/controls.tsx';
import { SECTIONS, type RowDef, type SectionDef } from '../shared/layout.ts';
import { keysOf, resetPatch, rowDesc, rowEnabled, rowIsDefault, rowPresent, view } from '../shared/model.ts';
import { rowControl } from '../shared/rows.tsx';
import { schema, store, values } from '../shared/state.ts';
import { applyWithUndo, Toast } from '../shared/toast.tsx';
import { Setup } from './setup.tsx';

const FEATURE_IDS = allFeatures.map(f => f.id);
export const ALL_ROWS = SECTIONS.flatMap(s => s.rows);
export const present = (r: RowDef) => rowPresent(r, schema, ALL_ROWS);

/** The stage part a row changes (hovering the row outlines it). */
export const ROW_PART: Readonly<Record<string, string>> = {
  'card-assignments': 'card', 'card-assignments-count': 'card', 'card-assignments-overdue': 'card', 'card-assignments-types': 'card',
  'grade-impact': 'card', 'card-grades': 'card', 'card-grades-hover': 'card', 'card-look': 'card', 'dashboard-notes': 'notes',
  'better-todo': 'todo', 'better-todo-count': 'todo', 'better-todo-announcements': 'todo', 'better-todo-overdue': 'todo', 'better-todo-colors': 'todo',
  gpa: 'gpa', 'gpa-rounding': 'gpa', 'gpa-scale': 'gpa', 'grade-goals': 'goal', 'hide-logo': 'nav', 'dark-nav': 'nav', dates: 'todo', clock: 'todo',
};

export interface FeatureHooks {
  /** Select a deep-link target on the stage (go-stage rows). */
  go(target: string): void;
  share(): void;
  importTheme(): void;
  /** A row's live preview, as HTML (studio.md: rows with a visible effect). */
  preview(rowId: string): string | null;
}

function Platform({ mount }: { mount: RowDef['mount'] }) {
  if (mount === 'sites') return <Sites />;
  if (mount === 'backup') return <SettingsStorage store={store} />;
  if (mount === 'diagnostics') return <Diagnostics featureIds={FEATURE_IDS} />;
  return null;
}

function Row({ row, first, hooks, flash }: { row: RowDef; first: boolean; hooks: FeatureHooks; flash: boolean }) {
  const v = view(values.value, schema);
  const enabled = rowEnabled(row, v);
  const nondefault = !row.noReset && !rowIsDefault(row, values.value, schema, ALL_ROWS);
  const labelId = `l-${row.id}`;
  const desc = row.control === 'shortcuts' ? '⌘Z undo · ⇧⌘Z redo · / search · Esc closes · arrows move a focused handle (Shift ×10)' : rowDesc(row, v);
  const descId = desc ? `d-${row.id}` : undefined;
  const ids = { labelledBy: labelId, describedBy: descId, disabled: !enabled };
  let { ctl, block } = rowControl(row, ids);
  const isSwitch = row.control === 'switch';
  if (row.control === 'version') ctl = <span class="value">{chrome.runtime.getManifest().version} <small>({__B2C_BUILD_ID__})</small></span>;
  if (row.control === 'shortcuts') ctl = <button class="btn" type="button" aria-describedby={labelId} onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>Change…</button>;
  if (row.control === 'platform') block = <Platform mount={row.mount} />;
  if (row.control === 'go-stage') ctl = <button class="btn" type="button" aria-describedby={descId} onClick={() => hooks.go(row.target ?? 'page')}>Edit on the stage</button>;
  if (row.control === 'theme-share') ctl = <>
    <button class="btn" type="button" onClick={hooks.share}>Share ▾</button>
    <button class="btn" type="button" onClick={hooks.importTheme}>Import…</button>
  </>;
  const pv = hooks.preview(row.id);
  const name = row.resetLabel ?? row.label.toLowerCase();
  const cls = ['row', isSwitch && 'switch-row', !enabled && 'is-disabled', nondefault && 'nondefault', first && 'first', row.hideLabel && 'bare', row.control === 'platform' && 'platform', flash && 'flash']
    .filter(Boolean).join(' ');
  return (
    <div class={cls} data-row={row.id} data-depth={row.depth ?? 0} data-ph={ROW_PART[row.id]}
      onClick={isSwitch && enabled ? e => {
        if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
        ((e.currentTarget as HTMLElement).querySelector('[role="switch"]') as HTMLButtonElement | null)?.click();
      } : undefined}>
      <div class="row-text"><span class={'row-label' + (row.hideLabel ? ' vh' : '')} id={labelId}>{row.label}</span>{desc && <span class="row-desc" id={descId}>{desc}</span>}</div>
      {row.noReset ? <span /> : (
        <button class="reset" type="button" tabIndex={nondefault ? 0 : -1} aria-label={`Reset ${name}`} title="Reset to default"
          onClick={() => applyWithUndo(`Reset ${name}`, resetPatch(keysOf(row, schema, ALL_ROWS), schema))}><Icon.reset /></button>
      )}
      <div class="ctl">{ctl}</div>
      {block && <div class="block">{block}</div>}
      {pv && <div class="block pv" dangerouslySetInnerHTML={{ __html: pv }} />}
    </div>
  );
}

function Section({ s, hooks, flash }: { s: SectionDef; hooks: FeatureHooks; flash: string | null }) {
  const rows = s.rows.filter(present);
  if (!rows.length) return null;
  const resettable = rows.filter(r => !r.noReset);
  const nondefault = resettable.some(r => !rowIsDefault(r, values.value, schema, ALL_ROWS));
  return (
    <section id={`fs-${s.id}`} aria-labelledby={`fh-${s.id}`} data-section={s.id}>
      <div class={'sec-head' + (nondefault ? ' nondefault' : '')}>
        <h2 id={`fh-${s.id}`} tabIndex={-1}>{s.title}</h2>
        {resettable.length > 0 && <button class="btn quiet" type="button" aria-label={`Reset ${s.title} to defaults`} tabIndex={nondefault ? 0 : -1}
          onClick={() => applyWithUndo(`${s.title} reset to defaults`, resetPatch(resettable.flatMap(r => keysOf(r, schema, ALL_ROWS)), schema))}>Reset section</button>}
      </div>
      <div class="group">
        {rows.map((r, i) => <Row key={r.id} row={r} first={i === 0} hooks={hooks} flash={flash === r.id} />)}
      </div>
    </section>
  );
}

export function FeaturesPanel({ hooks, extra, flash = null }: { hooks: FeatureHooks; extra: Record<string, () => string>; flash?: string | null }) {
  return (
    <div class="settings">
      <Setup />
      {SECTIONS.map(s => <Section key={s.id} s={s} hooks={hooks} flash={flash} />)}
      {Object.entries(extra).map(([id, html]) => (
        <section key={id} id={`fs-${id}`} data-section={id} aria-labelledby={`fh-${id}`}>
          <div class="sec-head"><h2 id={`fh-${id}`} tabIndex={-1}>{id === 'popup' ? 'Toolbar popup' : id}</h2></div>
          <div class="group extra" dangerouslySetInnerHTML={{ __html: html() }} />
        </section>
      ))}
      <Toast />
    </div>
  );
}
