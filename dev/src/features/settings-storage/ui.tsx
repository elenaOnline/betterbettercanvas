import { useEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../../core/settings/store.ts';
import { changeWithUndo, exportSettings, importBetterCanvas, importSettings, MAX_IMPORT_BYTES, type ImportPlan } from './model.ts';

export function SettingsStorage({ store }: { store: Store }) {
  const [text, setText] = useState('');
  const [source, setSource] = useState('b2c');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [status, setStatus] = useState('');
  const [feature, setFeature] = useState('');
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<(() => Promise<boolean>) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const undoable = async (op: Parameters<typeof changeWithUndo>[1], message: string) => {
    setBusy(true);
    try {
      const revert = await changeWithUndo(store, op);
      clearTimeout(timer.current); setUndo(() => revert);
      timer.current = setTimeout(() => setUndo(null), 10_000);
      setStatus(message); setPlan(null);
    } catch { setStatus('Settings could not be saved. Try again.'); }
    finally { setBusy(false); }
  };
  const preview = () => {
    try { setPlan(source === 'bc' ? importBetterCanvas(text, store.schema) : importSettings(text, store.schema)); setStatus('Review the settings below, then apply.'); }
    catch (e) { setPlan(null); setStatus(e instanceof SyntaxError ? 'This is not valid JSON.' : (e as Error).message); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const blob = new Blob([exportSettings(await store.load(), store.schema)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'b2c-settings.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Settings exported.');
    } catch { setStatus('Settings could not be exported. Try again.'); }
    finally { setBusy(false); }
  };
  return <section id="backup" aria-labelledby="backup-title">
    <h2 id="backup-title">Backup</h2>
    <p>Small settings sync with your browser. Notes, images and other large values stay on this device. A full backup includes all declared settings.</p>
    <button disabled={busy} onClick={() => void save()}>Export all settings</button>
    <label for="import-source">Import from</label>
    <select id="import-source" value={source} disabled={busy} onChange={e => { setSource(e.currentTarget.value); setPlan(null); }}>
      <option value="b2c">b²c settings backup</option><option value="bc">Better Canvas</option>
    </select>
    {source === 'bc' && <p>In Better Canvas, open its extension popup → Report issue → Storage Dump → Go. Copy the output and paste it below. b²c cannot read another extension’s storage. Settings without an equivalent are listed for review.</p>}
    <label for="settings-file">Choose a JSON file</label>
    <input id="settings-file" type="file" accept=".json,application/json" disabled={busy} onChange={e => {
      const file = e.currentTarget.files?.[0]; setPlan(null);
      if (!file) return;
      if (file.size > MAX_IMPORT_BYTES) { setStatus('The settings file is too large (maximum 10 MB).'); return; }
      setBusy(true);
      void file.text().then(value => { setText(value); setStatus('File loaded. Preview it before applying.'); }, () => setStatus('Could not read the settings file.')).finally(() => setBusy(false));
    }} />
    <label for="settings-json">Paste settings JSON</label>
    <textarea id="settings-json" rows={8} value={text} disabled={busy} onInput={e => { setText(e.currentTarget.value); setPlan(null); }} />
    <button disabled={busy || !text.trim()} onClick={preview}>Preview import</button>
    {plan && <div aria-label="Import preview">
      <p>{Object.keys(plan.values).length} settings ready to import. Other settings keep their current values.</p>
      <ul>{Object.entries(plan.values).map(([key, value]) => <li key={key}>{key}: {JSON.stringify(value)?.slice(0, 160)}</li>)}</ul>
      {plan.unknown.length > 0 && <p>Unknown keys: {plan.unknown.join(', ')}</p>}
      {plan.invalid.length > 0 && <p>Invalid values (not imported): {plan.invalid.join(', ')}</p>}
      {plan.unsupported.length > 0 && <ul aria-label="Unsupported settings">{plan.unsupported.map(item => <li key={item}>{item}</li>)}</ul>}
      <button disabled={busy || !Object.keys(plan.values).length} onClick={() => void undoable({ values: plan.values }, 'Settings imported. Undo is available for 10 seconds.')}>Apply import</button>
    </div>}
    <h3>Reset settings</h3>
    <label for="reset-feature">Feature</label>
    <select id="reset-feature" value={feature} disabled={busy} onChange={e => setFeature(e.currentTarget.value)}>
      <option value="">Choose a feature</option>
      {[...new Set(Object.keys(store.schema).map(key => key.split('.')[0]!))].map(id => <option key={id} value={id}>{id}</option>)}
    </select>
    <button disabled={busy || !feature} onClick={() => void undoable({ feature }, 'Feature reset. Undo is available for 10 seconds.')}>Reset feature</button>
    <button disabled={busy} onClick={() => void undoable({}, 'All settings reset. Undo is available for 10 seconds.')}>Reset all settings</button>
    <p role="status">{status}</p>
    <button class={undo ? '' : 'undo-unavailable'} disabled={busy || !undo} aria-hidden={!undo} tabIndex={undo ? 0 : -1} onClick={async () => {
      setBusy(true);
      try { setStatus(undo && await undo() ? 'Settings restored.' : 'Undo has expired.'); setUndo(null); }
      catch { setStatus('Settings could not be restored. Try again.'); }
      finally { setBusy(false); }
    }}>Undo</button>
  </section>;
}
