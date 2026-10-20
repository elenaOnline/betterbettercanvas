import { useEffect, useState } from 'preact/hooks';
import { BUILT_IN_LABEL, canvasOrigin, isBuiltIn, SITE_KEY } from './model.ts';

export function Sites() {
  const [origins, setOrigins] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const receive = (r: { origins?: string[]; error?: string } | undefined) => {
    if (!r) throw new Error('Canvas site controls are unavailable.');
    if (r.error) throw new Error(r.error);
    setOrigins(r.origins ?? []);
  };
  useEffect(() => {
    void chrome.runtime.sendMessage({ type: 'b2c:sites:list' }).then(receive).catch(() => setStatus('Canvas site controls are unavailable.'));
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[SITE_KEY]) setOrigins(Array.isArray(changes[SITE_KEY]!.newValue) ? changes[SITE_KEY]!.newValue as string[] : []);
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);
  const add = async () => {
    setStatus('');
    let origin: string;
    try { origin = canvasOrigin(input); } catch (e) { setStatus((e as Error).message); return; }
    if (isBuiltIn(origin) || origins.includes(origin)) { setStatus('This site is already included.'); return; }
    // No async boundary before request: Chrome requires the user's gesture.
    const permission = chrome.permissions.request({ origins: [origin + '/*'] });
    setBusy(true);
    try {
      if (!await permission) { setStatus('Site access was not granted.'); return; }
      receive(await chrome.runtime.sendMessage({ type: 'b2c:sites:add', origin }));
      setInput(''); setStatus('Site added.');
    } catch {
      try { await chrome.permissions.remove({ origins: [origin + '/*'] }); } catch { /* Browser may already have revoked it. */ }
      setStatus('Could not add site. Check site access and try again.');
    }
    finally { setBusy(false); }
  };
  const remove = async (origin: string) => {
    setBusy(true);
    try { receive(await chrome.runtime.sendMessage({ type: 'b2c:sites:remove', origin })); setStatus('Site removed.'); }
    catch { setStatus('Could not remove site. Try again.'); }
    finally { setBusy(false); }
  };
  return <section id="sites" aria-labelledby="sites-title">
    <h2 id="sites-title">Sites</h2>
    <p>The Canvas addresses b²c runs on. Only add sites you use for Canvas.</p>
    <ul><li>{BUILT_IN_LABEL} <span>Included by default</span></li>
      {origins.map(origin => <li key={origin}>{origin} <button disabled={busy} onClick={() => void remove(origin)} aria-label={`Remove ${origin}`}>Remove</button></li>)}
    </ul>
    <form onSubmit={e => { e.preventDefault(); void add(); }}>
      <label for="canvas-origin">Add another Canvas site</label>
      <input id="canvas-origin" type="url" required placeholder="https://yourschool.instructure.com" value={input} onInput={e => setInput(e.currentTarget.value)} disabled={busy} />
      <button type="submit" disabled={busy}>Add site…</button>
    </form>
    <p role="status">{status}</p>
  </section>;
}
