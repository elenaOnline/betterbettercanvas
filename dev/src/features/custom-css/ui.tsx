import { useEffect, useRef, useState } from 'preact/hooks';
import { cssError, type CssError } from './model.ts';

export function CustomCssEditor({ value, onCommit }: { value: string; onCommit(css: string): void }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<CssError | null>(null);
  const latest = useRef(value);
  const saved = useRef(value);
  useEffect(() => {
    // A save acknowledgement must not overwrite typing that happened after
    // that save, before this effect ran.
    if (latest.current === saved.current) { latest.current = value; setDraft(value); setError(null); }
    saved.current = value;
  }, [value]);
  const commit = () => {
    const css = latest.current;
    const issue = cssError(css);
    setError(issue);
    if (!issue && css !== value) { saved.current = css; onCommit(css); }
  };
  return <details class="b2c-custom-css-editor"><summary>Advanced</summary>
    <label for="b2c-custom-css-input">Custom CSS</label>
    <p id="b2c-custom-css-help">Advanced. Applies to every Canvas page.</p>
    <textarea id="b2c-custom-css-input" rows={8} spellcheck={false} value={draft}
      aria-describedby="b2c-custom-css-help b2c-custom-css-error" aria-invalid={!!error}
      onInput={e => { latest.current = e.currentTarget.value; setDraft(latest.current); }} onBlur={commit}
      onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); commit(); } }} />
    <p id="b2c-custom-css-error" role="status">{error ? `Line ${error.line}: ${error.message}` : ''}</p>
  </details>;
}
