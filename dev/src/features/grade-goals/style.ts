// Widget stylesheet (inside the shadow root). Design restyles here.
export const css = `
:host { display: block; margin: 0 0 var(--b2c-space-4, 16px); font-family: var(--b2c-font-canvas, inherit); color: var(--b2c-w-text, #2d3b45); }
* { box-sizing: border-box; }
.goal { background: var(--b2c-w-bg, #fff); border: 1px solid var(--b2c-w-border, #c7cdd1); border-left: 3px dashed var(--b2c-w-border, #c7cdd1); border-radius: var(--b2c-radius-md, 2px); padding: var(--b2c-space-3, 12px); min-height: 84px; font-size: 14px; }
header { display: flex; align-items: center; gap: var(--b2c-space-2, 8px); flex-wrap: wrap; }
h2 { margin: 0; font-size: 16px; font-weight: 600; }
.gear { margin-left: auto; font: inherit; color: var(--b2c-w-text-secondary, #6b7780); background: none; border: 0; padding: 2px 4px; border-radius: var(--b2c-radius-sm, 2px); cursor: pointer; }
.gear:hover { background: var(--b2c-w-hover, rgba(45,59,69,.06)); }
.gear:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); outline-offset: 1px; }
select, input { font: inherit; font-size: 13px; color: var(--b2c-w-text, #2d3b45); background: var(--b2c-w-bg, #fff); border: 1px solid var(--b2c-w-border, #c7cdd1); border-radius: var(--b2c-radius-sm, 2px); padding: 2px 4px; }
input { width: 64px; font-variant-numeric: tabular-nums; }
select:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--b2c-w-link, #0374b5); outline-offset: 1px; }
.hint { color: var(--b2c-w-text-secondary, #6b7780); font-size: 12px; }
p { margin: var(--b2c-space-2, 8px) 0 0; }
.answer strong { font-variant-numeric: tabular-nums; }
.answer .lead { font-weight: 600; }
.warn { color: var(--b2c-w-text-secondary, #6b7780); }
ul { margin: var(--b2c-space-1, 4px) 0 0; padding-left: 18px; font-size: 13px; }
li span { color: var(--b2c-w-text-secondary, #6b7780); font-variant-numeric: tabular-nums; }
.small { font-size: 12px; color: var(--b2c-w-text-secondary, #6b7780); }
details { margin-top: var(--b2c-space-2, 8px); font-size: 12px; }
summary { cursor: pointer; color: var(--b2c-w-link, #0374b5); width: max-content; border-radius: var(--b2c-radius-sm, 2px); }
table { border-collapse: collapse; margin-top: var(--b2c-space-1, 4px); font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 2px 8px 2px 0; }
`;

/** The popover frame (dashboard card menu). The box inside is the same. */
export const popoverCss = `
:host { position: absolute; z-index: 10001; display: block; margin: 0; box-shadow: 0 6px 20px rgba(0,0,0,.18); border-radius: var(--b2c-radius-lg, 3px); }
.goal { border-left-style: solid; }
`;
