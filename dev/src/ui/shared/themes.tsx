// Settings › Backup › Look: export, import (previewed in open Canvas tabs
// before Apply), saved and bundled looks, and Undo. Design: settings.md §6,
// surfaces/themes.md. Model and message contracts: src/features/themes/.
import { useEffect, useRef, useState } from 'preact/hooks';
import { makeColorRequest } from '../../features/card-colors/palettes.ts';
import { changeWithUndo } from '../../features/settings-storage/model.ts';
import {
  ALL_PARTS, bundledThemes, deleteTheme, exportTheme, newThemeId, parseTheme, planParts, previousValid, saveTheme, snapshotFor,
  themeToJson, type Part, type Previous, type SavedTheme, type Theme, type ThemePlan,
} from '../../features/themes/model.ts';
import { apply, schema, store, values } from './state.ts';
import { showToast } from './toast.tsx';

const PART_LABELS: Record<Part, string> = { dark: 'Dark mode colors', cards: 'Card style', cardColors: 'Card colors', font: 'Font', css: 'Custom CSS' };
/** Card colours live in Canvas, not in settings; a look carries them only when imported. */
const EXPORTABLE = ALL_PARTS.filter(p => p !== 'cardColors');

/** Paint (or stop painting) a look in every open Canvas tab, without saving it. */
async function preview(v: Record<string, unknown> | null) {
  const tabs = await chrome.tabs.query({}).catch(() => [] as chrome.tabs.Tab[]);
  await Promise.all(tabs.map(t => (t.id === undefined ? null : chrome.tabs.sendMessage(t.id, { type: 'b2c:themes:preview', values: v }).catch(() => null))));
}

async function applyPlan(plan: ThemePlan) {
  const now = new Date();
  void apply({ 'themes.previous': snapshotFor(plan, values.value, now) });
  const revert = await changeWithUndo(store, { values: plan.values });
  if (plan.cardColors) void apply({ 'card-colors.request': makeColorRequest(plan.cardColors) });
  void preview(null);
  showToast(`${plan.theme.name} applied`, () => void revert());
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ExportPanel() {
  const [parts, setParts] = useState<Part[]>(EXPORTABLE.filter(p => p !== 'css'));
  const [name, setName] = useState('My look');
  const theme = (): Theme => exportTheme(values.value, schema, parts, { name, now: new Date() });
  const slug = () => `b2c-look-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'look'}.json`;
  return <div class="theme-panel">
    <div class="checks" role="group" aria-label="Include">
      {EXPORTABLE.map(p => <label key={p}><input type="checkbox" checked={parts.includes(p)}
        onChange={e => setParts(e.currentTarget.checked ? [...parts, p] : parts.filter(x => x !== p))} />{PART_LABELS[p]}</label>)}
    </div>
    <label class="inline-field">Name<input class="field text" type="text" maxLength={80} value={name} onInput={e => setName(e.currentTarget.value)} /></label>
    <div class="panel-foot">
      <span class="status">JSON, theme version 1</span><span class="spacer" />
      <button class="btn" type="button" disabled={!parts.length} onClick={() => {
        const list = (values.value['themes.saved'] as SavedTheme[]) ?? [];
        void apply({ 'themes.saved': saveTheme(list, theme(), newThemeId(new Date())) });
        showToast(`Saved “${name.trim() || 'My look'}” to your looks`);
      }}>Save to my looks</button>
      <button class="btn" type="button" disabled={!parts.length} onClick={() => void navigator.clipboard.writeText(themeToJson(theme())).then(() => showToast('Look copied as JSON'), () => showToast('Couldn’t copy. Use Save file instead'))}>Copy</button>
      <button class="btn primary" type="button" disabled={!parts.length} onClick={() => { download(slug(), themeToJson(theme())); showToast(`Saved ${slug()}`); }}>Save file…</button>
    </div>
  </div>;
}

function ImportPanel({ onDone }: { onDone(): void }) {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<ThemePlan | null>(null);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => () => void preview(null), []);
  const read = (t: string) => {
    setText(t);
    if (!t.trim()) { setPlan(null); setError(''); void preview(null); return; }
    try {
      const p = parseTheme(t, schema);
      setPlan(p); setError('');
      void preview(p.values);
    } catch (e) { setPlan(null); setError((e as Error).message); void preview(null); }
  };
  return <div class="theme-panel">
    <textarea class="code short" rows={4} spellcheck={false} aria-label="Look to import" placeholder="Paste a look here, or choose a file."
      value={text} onInput={e => read(e.currentTarget.value)} />
    {plan && <p class="status">“{plan.theme.name}” changes {planParts(plan).map(p => PART_LABELS[p].toLowerCase()).join(', ') || 'nothing'}. Previewing in your open Canvas tabs.</p>}
    {plan?.warnings.length ? <ul class="status">{plan.warnings.map(w => <li key={w}>{w}</li>)}</ul> : null}
    {error && <p class="status warn" role="alert">{error}</p>}
    <div class="panel-foot">
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.currentTarget.files?.[0]; if (f) void f.text().then(read); }} />
      <button class="btn" type="button" onClick={() => file.current?.click()}>Choose file…</button>
      <span class="spacer" />
      <button class="btn" type="button" onClick={() => { read(''); onDone(); }}>Cancel</button>
      <button class="btn primary" type="button" disabled={!plan || !Object.keys(plan.values).length && !plan.cardColors}
        onClick={() => { if (plan) { void applyPlan(plan); setText(''); setPlan(null); onDone(); } }}>Apply</button>
    </div>
  </div>;
}

export function Themes() {
  const [panel, setPanel] = useState<'export' | 'import' | null>(null);
  const saved = (values.value['themes.saved'] as SavedTheme[] | undefined) ?? [];
  const prev = values.value['themes.previous'] as Previous | null;
  const looks: { id: string; theme: Theme; saved: boolean }[] = [
    ...bundledThemes().map(t => ({ id: `b-${t.name}`, theme: t, saved: false })),
    ...saved.map(s => ({ id: s.id, theme: s.theme, saved: true })),
  ];
  const toggle = (p: 'export' | 'import') => setPanel(panel === p ? null : p);
  return <div class="themes">
    <div class="themes-head">
      <span class="row-text"><span class="row-label">Look</span><span class="row-desc">Dark mode colors, card style, font and custom CSS, as a file you can share</span></span>
      <span class="ctl">
        <button class="btn" type="button" aria-expanded={panel === 'export'} aria-label="Export look" onClick={() => toggle('export')}>Export…</button>
        <button class="btn" type="button" aria-expanded={panel === 'import'} aria-label="Import look" onClick={() => toggle('import')}>Import…</button>
      </span>
    </div>
    {panel === 'export' && <ExportPanel />}
    {panel === 'import' && <ImportPanel onDone={() => setPanel(null)} />}
    <ul class="looks" aria-label="Looks">
      {looks.map(l => <li key={l.id} class="list-item">
        <span>{l.theme.name}{!l.saved && <small> built in</small>}</span>
        <span>
          <button class="btn quiet" type="button" aria-label={`Apply ${l.theme.name}`} onClick={() => void applyPlan(parseTheme(themeToJson(l.theme), schema))}>Apply</button>
          {l.saved && <button class="btn quiet" type="button" aria-label={`Delete ${l.theme.name}`} onClick={() => {
            const before = saved;
            void apply({ 'themes.saved': deleteTheme(saved, l.id) });
            showToast(`Deleted ${l.theme.name}`, () => void apply({ 'themes.saved': before }));
          }}>Delete</button>}
        </span>
      </li>)}
    </ul>
    {previousValid(prev, new Date()) && <div class="block-foot">
      <button class="btn quiet" type="button" onClick={() => { void apply({ ...prev.values, 'themes.previous': null }); showToast('Look put back'); }}>Put back the look before the last one</button>
    </div>}
  </div>;
}
