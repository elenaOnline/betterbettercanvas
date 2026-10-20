// Attribute and message names shared by the definition (index.ts), the lazy
// runtime (run.ts) and tests. Kept tiny so the runtime chunk doesn't pull the
// definition in.
export const MSG = 'b2c:dark:original';
/** The engine is painting (any theme, light or dark). Gate for every palette rule. */
export const THEME_ATTR = 'data-b2c-theme';
/** "light" | "dark": the scheme of the theme in effect (dark-only judgement calls). */
export const SCHEME_ATTR = 'data-b2c-scheme';
/** "l" | "d": which slot's vars (--b2c-pl-l-* / --b2c-pl-d-*) feed --b2c-dm-*. */
export const SLOT_ATTR = 'data-b2c-slot';
/** v1 gate, kept as an alias while the engine paints until Design re-gates dark-mode.css. */
export const DARK_ATTR = 'data-b2c-dark';
export const ENGINE_ATTRS = [THEME_ATTR, SCHEME_ATTR, SLOT_ATTR, DARK_ATTR] as const;
/** Messages to the DocViewer frame (docs.ts). */
export const DOCS_MSG = 'b2c:docs';
