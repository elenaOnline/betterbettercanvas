import { useEffect, useState } from 'preact/hooks';
import { LOG_KEY, readRing, reportText, type Diagnostic } from './model.ts';

const NO_FEATURES: readonly string[] = [];

export function Diagnostics({ featureIds = NO_FEATURES }: { featureIds?: readonly string[] }) {
  const [rows, setRows] = useState<Diagnostic[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = () => {
      void chrome.runtime.sendMessage({ type: 'b2c:diagnostics:list' }).then(r => {
        if (!r?.ok) throw new Error();
        setRows(readRing(r.result, featureIds));
      }).catch(() => setStatus('Diagnostics are unavailable.'));
    };
    load();
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[LOG_KEY]) load();
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, [featureIds]);
  return <section id="diagnostics" aria-labelledby="diagnostics-title">
    <h2 id="diagnostics-title">Diagnostics</h2>
    <p>The last 50 errors on this device. Reports contain feature, error type, page kind and time. No page text, addresses or personal data.</p>
    <div class="diagnostics-log">{rows.length ? <ol>{rows.map((row, i) => <li key={i}><time dateTime={new Date(row.time).toISOString()}>{new Date(row.time).toLocaleString()}</time> · {row.feature} · {row.page} · {row.message}</li>)}</ol> : <p>No errors recorded.</p>}</div>
    <button disabled={busy} onClick={async () => {
      setBusy(true);
      try { await navigator.clipboard.writeText(reportText(rows, chrome.runtime.getManifest().version)); setStatus('Report copied.'); }
      catch { setStatus('The report could not be copied. Try again.'); }
      finally { setBusy(false); }
    }}>Copy report</button>
    <button disabled={busy || !rows.length} onClick={async () => {
      setBusy(true);
      try {
        const r = await chrome.runtime.sendMessage({ type: 'b2c:diagnostics:clear' });
        if (!r?.ok) throw new Error();
        setRows([]); setStatus('Error log cleared.');
      } catch { setStatus('The error log could not be cleared. Try again.'); }
      finally { setBusy(false); }
    }}>Clear</button>
    <p role="status">{status}</p>
  </section>;
}
