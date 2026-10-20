// Built-in ⌘K commands: dark mode, settings deep links, pause, rebuild index.
// Registered through ctx.commands like any feature's commands. Registered
// when the runtime loads (first ⌘K), so they cost nothing on page load.

import type { Command } from '../../core/commands.ts';
import type { Ctx } from '../../core/ctx.ts';
import { openSettings } from '../../core/settings-link.ts';
import { SECTIONS, THEME_ROWS } from '../../ui/shared/layout.ts';

/** Feature ids in this build (lane builds carry a subset). */
const built = () => (typeof __B2C_FEATURE_IDS__ !== 'undefined' ? __B2C_FEATURE_IDS__ : []);
const hasKey = (key: string) => key.startsWith('core.') || built().includes(key.split('.')[0]!);

export interface BuiltinState {
  darkMode?: string;
}

/** Settings commands, one per section and one per top-level row. Pure (unit-tested). */
export function settingsCommands(open: (target: string) => void, present: (key: string) => boolean = hasKey): Command[] {
  const out: Command[] = [
    { id: 'settings.open', title: 'Open b²c settings', keywords: ['settings', 'preferences', 'options', 'b2c'], run: () => open('') },
  ];
  for (const s of SECTIONS) {
    const rows = s.rows.filter(r => !r.pending && (!r.key || present(r.key)) && (r.depth ?? 0) === 0 && !r.in);
    if (!rows.length) continue;
    out.push({ id: `settings.${s.id}`, title: `Settings: ${s.title}`, keywords: ['settings', 'section'], run: () => open(s.id) });
    for (const r of rows) {
      if (r.label === s.title) continue;
      out.push({
        id: `settings.${s.id}.${r.id}`,
        title: `Settings: ${r.label}`,
        keywords: ['settings', s.title.toLowerCase(), ...(r.keywords?.split(/\s+/) ?? [])],
        run: () => open(r.id),
      });
    }
  }
  // Theme rows (Use dark theme, Light/Dark theme) live in the Studio's theme bar, not a section.
  for (const r of THEME_ROWS) {
    if (r.pending || (r.key && !present(r.key)) || (r.depth ?? 0) !== 0) continue;
    out.push({ id: `settings.theme.${r.id}`, title: `Settings: ${r.label}`, keywords: ['settings', 'theme', ...(r.keywords?.split(/\s+/) ?? [])], run: () => open(r.id) });
  }
  return out;
}

export function builtinCommands(ctx: Ctx, opts: { rebuild(): void; state: BuiltinState }): Command[] {
  const out: Command[] = [];
  if (hasKey('palette.useDark')) {
    // palette.useDark: never | always | system | schedule ("Use dark theme").
    const dark = (mode: string, title: string, words: string[]): Command => ({
      id: `palette.useDark.${mode}`,
      title,
      keywords: ['dark', 'mode', 'theme', 'night', ...words],
      get hint() {
        return opts.state.darkMode === mode ? 'Current' : undefined;
      },
      run: () => ctx.set({ 'palette.useDark': mode }),
    });
    out.push(
      dark('always', 'Dark mode: On', ['enable', 'turn on']),
      dark('never', 'Dark mode: Off', ['light', 'disable', 'turn off']),
      dark('system', 'Dark mode: Match system', ['auto', 'system', 'device']),
    );
  }
  out.push(
    ...settingsCommands(t => openSettings(t)),
    {
      id: 'core.pause',
      title: 'Pause b²c',
      keywords: ['pause', 'disable', 'off', 'plain', 'canvas', 'original', 'b2c'],
      hint: 'Resume from the b²c button',
      run: () => ctx.set({ 'core.paused': true }),
    },
    {
      id: 'global-search.rebuild',
      title: 'Rebuild search index',
      keywords: ['search', 'index', 'refresh', 'reload', 'update'],
      run: () => opts.rebuild(),
    },
  );
  return out;
}
