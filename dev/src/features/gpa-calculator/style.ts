// Widget stylesheet (lives inside the shadow root). Design restyles here.
// Tokens only: --b2c-w-* (Canvas-light, or dark-mode roles) and the shared scales.
export const css = `
:host { display: block; margin: 0 0 var(--b2c-space-4, 16px); font-family: var(--b2c-font-canvas, inherit); color: var(--b2c-w-text, #2d3b45); }
* { box-sizing: border-box; }
.gpa { background: var(--b2c-w-bg, #fff); border: 1px solid var(--b2c-w-border, #c7cdd1); border-radius: var(--b2c-radius-md, 2px); padding: var(--b2c-space-3, 12px); min-height: 92px; }
header { display: flex; align-items: center; gap: var(--b2c-space-2, 8px); }
h2 { margin: 0; font-size: 16px; font-weight: 600; flex: 1; }
button { font: inherit; color: var(--b2c-w-link, #0374b5); background: none; border: 0; padding: 2px 4px; border-radius: var(--b2c-radius-sm, 2px); cursor: pointer; }
button:hover { background: var(--b2c-w-hover, rgba(45,59,69,.06)); }
button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); outline-offset: 1px; }
.gear { color: var(--b2c-w-text-secondary, #6b7780); }
.chev { color: var(--b2c-w-text-secondary, #6b7780); width: 20px; transition: transform var(--b2c-dur-fast, 120ms); }
.chev[aria-expanded="false"] { transform: rotate(-90deg); }
dl { margin: var(--b2c-space-2, 8px) 0 0; }
dt { font-size: 13px; color: var(--b2c-w-text-secondary, #6b7780); }
dd { margin: 0 0 var(--b2c-space-2, 8px); font-size: 13px; color: var(--b2c-w-text-secondary, #6b7780); }
dd b { font-size: 20px; font-weight: 600; color: var(--b2c-w-text, #2d3b45); font-variant-numeric: tabular-nums; margin-right: var(--b2c-space-2, 8px); }
.reason { font-size: 13px; color: var(--b2c-w-text-secondary, #6b7780); font-style: italic; }
.none { font-size: 14px; color: var(--b2c-w-text-secondary, #6b7780); margin: var(--b2c-space-2, 8px) 0 0; }
.status { font-size: 12px; color: var(--b2c-w-text-secondary, #6b7780); margin: var(--b2c-space-2, 8px) 0 0; }
.status button { font-size: 12px; padding: 0 2px; }
details { margin-top: var(--b2c-space-2, 8px); font-size: 12px; }
summary { cursor: pointer; color: var(--b2c-w-link, #0374b5); width: max-content; border-radius: var(--b2c-radius-sm, 2px); }
table { width: 100%; border-collapse: collapse; margin-top: var(--b2c-space-1, 4px); font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 2px 4px; border-bottom: 1px solid var(--b2c-w-border, #c7cdd1); }
th:first-child, td:first-child { text-align: left; }
tfoot td { border-bottom: 0; font-weight: 600; }
.note { color: var(--b2c-w-text-secondary, #6b7780); margin: var(--b2c-space-1, 4px) 0 0; }
.edit { margin-top: var(--b2c-space-3, 12px); border-top: 1px solid var(--b2c-w-border, #c7cdd1); padding-top: var(--b2c-space-2, 8px); display: grid; gap: var(--b2c-space-2, 8px); }
.row { display: grid; grid-template-columns: 1fr auto; gap: var(--b2c-space-1, 4px) var(--b2c-space-2, 8px); align-items: center; font-size: 13px; }
.row.off { color: var(--b2c-w-text-secondary, #6b7780); }
.row .name { grid-column: 1 / -1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .name span { font-weight: 400; color: var(--b2c-w-text-secondary, #6b7780); }
.controls { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: var(--b2c-space-2, 8px); align-items: center; }
.src { font-size: 12px; color: var(--b2c-w-text-secondary, #6b7780); }
input[type="number"], select { font: inherit; font-size: 13px; color: var(--b2c-w-text, #2d3b45); background: var(--b2c-w-bg, #fff); border: 1px solid var(--b2c-w-border, #c7cdd1); border-radius: var(--b2c-radius-sm, 2px); padding: 2px 4px; }
input[type="number"] { width: 64px; font-variant-numeric: tabular-nums; }
input.bad { border-color: var(--b2c-w-danger, #e0061f); }
label { display: inline-flex; gap: 4px; align-items: center; }
.need input { border-color: var(--b2c-w-danger, #e0061f); }
.opts { display: grid; gap: var(--b2c-space-1, 4px); font-size: 13px; }
@media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
`;
