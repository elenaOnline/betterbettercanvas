// minimal DOM shim: a fake b2c answers out of order to prove ids don't cross
const L = {}; const document = { addEventListener(t, f) { (L[t] ??= new Set()).add(f) }, removeEventListener(t, f) { L[t]?.delete(f) },
  dispatchEvent(e) { for (const f of [...(L[e.type] ?? [])]) f(e) } };
class CustomEvent { constructor(type, o) { this.type = type; this.detail = o?.detail } }
const window = {}; globalThis.document = document; globalThis.CustomEvent = CustomEvent; globalThis.window = window;
const fs = await import('node:fs'); eval(fs.readFileSync(new URL("./describe-wrapper.js", import.meta.url), 'utf8'));
const pending = []; document.addEventListener('b2c:describe', e => pending.push(JSON.parse(e.detail)));
const a = window.b2cAgent.describe({ from: '2026-10-01' }), b = window.b2cAgent.describe({ id: 'mine' });
for (const r of pending.reverse()) document.dispatchEvent(new CustomEvent('b2c:described', { detail: JSON.stringify({ $b2c: 'describe', v: 1, id: r.id, echo: r.from ?? null }) }));
const [ra, rb] = await Promise.all([a, b]);
console.log(ra.echo === '2026-10-01' && rb.id === 'mine' && rb.echo === null ? 'PASS out-of-order answers matched' : 'FAIL', ra.id, rb.id);
const lone = window.b2cAgent.describe(); const t0 = Date.now();
await lone.then(() => console.log('FAIL resolved'), e => console.log('PASS timeout', e.message, Date.now() - t0, 'ms'));
console.log('listeners left:', L['b2c:described']?.size ?? 0);
