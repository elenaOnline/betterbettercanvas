// First run (design/spec/surfaces/first-run.md), at the top of the settings
// page until Done:
//   1. "Where is your school's Canvas?" One field and one browser prompt.
//      *.instructure.com is built in; any other address is normalised to an
//      origin, and b²c asks Chrome for that one site.
//   2. "What b²c can do": the headline features as switches at their
//      defaults, then Done.
// It stays until Done (local `b2c:setup-done`), so a new student sees every
// headline feature once, without a tour.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { isBuiltInHost } from '../../core/hosts.ts';
import { hostDefaults, SCALE_PRESETS, HOST_DEFAULTS } from '../../features/gpa-calculator/gpa.ts';
import { Segmented, Switch } from '../shared/controls.tsx';
import { FIRST_RUN } from '../shared/layout.ts';
import { darkMode, darkPatch, normaliseOrigin, rowOptions, rowPresent, type DarkMode } from '../shared/model.ts';
import { apply, schema, values } from '../shared/state.ts';

export const SETUP_KEY = 'b2c:setup-done';
export const setupDone = signal<boolean | null>(null);

export async function loadSetup() {
  try { setupDone.value = (await chrome.storage.local.get(SETUP_KEY))[SETUP_KEY] === true; }
  catch { setupDone.value = true; }
}

type Msg = { kind: 'ok' | 'err'; text: string; note?: string } | null;

/** "canvas.example.edu uses the thirds GPA scale and truncates", said once, where Research has a source. */
function hostNote(host: string): string | undefined {
  const d = HOST_DEFAULTS[host];
  if (!d) return undefined;
  const label = SCALE_PRESETS[d.preset]?.label.replace(/\s*\(.*\)$/, '') ?? 'its';
  return `${host} uses the ${label} GPA scale and ${hostDefaults(host).rounding === 'truncate' ? 'truncates' : 'rounds'} to two decimals. b²c’s GPA calculator does the same.`;
}

function WhereIsCanvas() {
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const allow = (e: Event) => {
    e.preventDefault();
    let origin: string;
    try { origin = normaliseOrigin(input); } catch (err) { setMsg({ kind: 'err', text: (err as Error).message }); return; }
    const host = new URL(origin).host;
    if (isBuiltInHost(host)) { setMsg({ kind: 'ok', text: `You’re set: b²c already works on ${host}.` }); return; }
    // Called in the submit's own task: Chrome needs the user gesture.
    const asked = chrome.permissions.request({ origins: [`${origin}/*`] });
    setBusy(true);
    void asked.then(async granted => {
      if (!granted) return setMsg({ kind: 'err', text: 'Permission not granted · Try again' });
      const r = (await chrome.runtime.sendMessage({ type: 'b2c:sites:add', origin }).catch(() => null)) as { error?: string } | null;
      if (!r || r.error) return setMsg({ kind: 'err', text: 'b²c couldn’t turn on there. Try again, or add it under Sites.' });
      setMsg({ kind: 'ok', text: `b²c is on for ${host}. Your open Canvas tabs already changed.`, note: hostNote(host) });
      setInput('');
    }, () => setMsg({ kind: 'err', text: 'Permission not granted · Try again' })).finally(() => setBusy(false));
  };
  return <>
    <h2 id="setup-title">Where is your school’s Canvas?</h2>
    <p>Schools whose Canvas address ends in <b>instructure.com</b> work already. If yours has its own address, add it here; Chrome asks you to allow b²c on that site only.</p>
    <form class="setup-form" onSubmit={allow}>
      <input class="field" type="text" inputMode="url" placeholder="canvas.yourschool.edu" aria-label="Your school’s Canvas address" autoComplete="off" spellcheck={false}
        value={input} disabled={busy} onInput={e => setInput(e.currentTarget.value)} />
      <button class="btn primary" type="submit" disabled={busy}>Allow access</button>
    </form>
    <p class={'setup-msg' + (msg ? ` ${msg.kind}` : '')} role="status">{msg?.text ?? ''}</p>
    {msg?.note && <p class="setup-note">{msg.note}</p>}
  </>;
}

function WhatItDoes() {
  const v = values.value;
  const rows = FIRST_RUN.filter(r => rowPresent(r, schema));
  return <>
    <h3 id="setup-what">What b²c can do</h3>
    <div class="setup-rows" role="group" aria-labelledby="setup-what">
      {rows.map(r => {
        const lid = `l-${r.id}`, did = `d-${r.id}`;
        const ctl = r.control === 'dark-mode'
          ? <Segmented labelledBy={lid} describedBy={did} value={darkMode(v, schema)} options={rowOptions(r, schema) as [DarkMode, string][]} onChange={m => void apply(darkPatch(m, schema, v))} />
          : <Switch labelledBy={lid} describedBy={did} checked={!!v[r.key!]} onChange={x => void apply({ [r.key!]: x })} />;
        return (
          <div class={'row' + (r.control === 'switch' ? ' switch-row' : '')} key={r.id} data-row={r.id}
            onClick={r.control === 'switch' ? e => { if (!(e.target as HTMLElement).closest('button')) void apply({ [r.key!]: !v[r.key!] }); } : undefined}>
            <span class="row-text"><span class="row-label" id={lid}>{r.label}</span><span class="row-desc" id={did}>{r.desc}</span></span>
            <span class="ctl">{ctl}</span>
          </div>
        );
      })}
    </div>
  </>;
}

export function Setup() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const focus = () => {
      if (location.hash !== '#start-here') return;
      ref.current?.scrollIntoView({ block: 'start' });
      ref.current?.focus({ preventScroll: true });
    };
    focus();
    addEventListener('hashchange', focus);
    return () => removeEventListener('hashchange', focus);
  }, []);
  if (setupDone.value !== false && location.hash !== '#start-here') return null;
  return (
    <section id="start-here" ref={ref} tabIndex={-1} class="setup" aria-labelledby="setup-title">
      <WhereIsCanvas />
      <WhatItDoes />
      <div class="setup-foot">
        <span class="status">Everything on this page applies instantly; there’s no Save button.</span>
        <button class="btn primary" type="button" onClick={() => {
          setupDone.value = true;
          void chrome.storage.local.set({ [SETUP_KEY]: true });
          if (location.hash === '#start-here') history.replaceState(null, '', location.pathname);
        }}>Done</button>
      </div>
    </section>
  );
}
