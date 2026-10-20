// The settings layout: Design's design/spec/settings.md as data. Sections →
// rows → schema keys, with labels and control types. The popup and the
// settings page both render from this file; nothing else names labels.
//
// Rules (enforced by scripts/check-settings-layout.mjs during the build):
// - every key a row names (key, keys, also[].key, checks options) must be in
//   the schema, or the build fails;
// - rows marked `pending` belong to features that haven't landed yet. Their
//   keys aren't checked, and the row stays hidden until the schema has them;
// - `optional` keys are read and written only when the schema has them (keys
//   whose names are still moving);
// - schema keys that appear nowhere here, and aren't listed in NOT_SHOWN, are
//   printed as a warning (features land over time).
//
// This file must stay pure data with no imports: the build check bundles it on
// its own.

export type OptValue = string | boolean;
export type Opt = readonly [value: OptValue, label: string];

/** Enabled when the key's value equals `is` (or is truthy, without `is`). */
export interface Cond { key: string; is?: OptValue; not?: OptValue }

export type ControlKind =
  | 'switch'       // bool key
  | 'segmented'    // enum (or bool) key, 2–4 one-word options
  | 'select'       // enum key, 5+ options
  | 'stepper'      // int key; range from the schema
  | 'number'       // num key; range from the schema
  | 'text'         // str key
  | 'time-range'   // keys: [start, end]
  | 'checks'       // options: [boolKey, label][]
  | 'code'         // str key, applies on blur; keys: [enabledKey]
  | 'font'         // type.family as one menu ('Canvas default' = off)
  | 'dark-mode'    // Off · On · Match system · Scheduled over mode (+ enabled)
  | 'style-chips'  // dark-mode preset chips
  | 'disclosure'   // a row whose button reveals the rows with `in: <its id>`
  | 'color-wells'  // dark-mode roles (see DARK_ROLES)
  | 'scale'        // gpa-calculator grade scale: preset menu + table
  | 'version'      // About: version and build
  | 'shortcuts'    // About: keyboard shortcuts
  | 'sliders'      // options: [intKey, label][]; each a range with its value and ↺
  | 'hidden-cards' // card-customization.cards entries with hidden: true, each with Unhide
  | 'card-colors'  // "Set all…" palette sheet → card-colors.request
  | 'component'    // a feature lane's own settings component (see `mount`)
  | 'go-stage'     // Studio: a button that selects `target` (a deep-link id) on the stage
  | 'theme-share'  // Studio: Share ▾ and Import… for themes
  | 'platform';    // a mounted platform component (sites, backup, diagnostics)

export interface RowDef {
  /** Stable id: data-row attribute, search, tests. */
  id: string;
  label: string;
  control: ControlKind;
  /** The row's main key. */
  key?: string;
  /** Further keys the row reads and writes. Checked. */
  keys?: readonly string[];
  /** Keys used only when the schema has them. Not checked. */
  optional?: readonly string[];
  /** The row's logical value is mirrored into these keys (shared settings
   *  stored per feature). `map` translates the row's value to that key's. */
  also?: readonly { key: string; map?: Readonly<Record<string, string>> }[];
  options?: readonly Opt[];
  desc?: string;
  /** Description by the current value of `key` (String(value)). */
  descBy?: Readonly<Record<string, string>>;
  depth?: 0 | 1 | 2;
  /** Dimmed and disabled unless every condition holds. */
  when?: readonly Cond[];
  /** Collapsed inside the disclosure row with this id. */
  in?: string;
  keywords?: string;
  pending?: true;
  noReset?: true;
  resetLabel?: string;
  /** Which component a `platform` or `component` row mounts. Component rows
   *  still name their keys, for reset and the build check. */
  mount?: 'sites' | 'backup' | 'diagnostics' | 'themes' | 'font' | 'custom-css' | 'page-width' | 'card-style' | 'card-height' | 'card-overlay';
  /** Label is for screen readers and search only. */
  hideLabel?: true;
  /** go-stage: the Studio deep-link id to select (e.g. 'cards', 'type'). */
  target?: string;
}

export interface SectionDef { id: string; title: string; rows: readonly RowDef[] }

const on = (key: string): Cond[] => [{ key }];
const DARK_ON: Cond[] = [{ key: 'palette.useDark', not: 'off' }];

/** Dark theme roles in Design's groups. `field` is the role's name in
 *  palette.darkRoles (src/features/palette/palettes.ts ROLES). */
export const DARK_ROLES: readonly { title: string; roles: readonly { role: string; label: string; field: string; keys: readonly string[] }[] }[] = [
  { title: 'Background', roles: [
    { role: 'bg', label: 'Page', field: 'bg', keys: ['palette.darkRoles'] },
    { role: 'surface', label: 'Surface', field: 'surface', keys: ['palette.darkRoles'] },
    { role: 'surface-raised', label: 'Raised', field: 'surfaceRaised', keys: ['palette.darkRoles'] },
    { role: 'border', label: 'Border', field: 'border', keys: ['palette.darkRoles'] },
  ] },
  { title: 'Text', roles: [
    { role: 'text', label: 'Primary', field: 'text', keys: ['palette.darkRoles'] },
    { role: 'text-secondary', label: 'Secondary', field: 'textSecondary', keys: ['palette.darkRoles'] },
    { role: 'text-tertiary', label: 'Tertiary', field: 'textTertiary', keys: ['palette.darkRoles'] },
    { role: 'link', label: 'Link', field: 'link', keys: ['palette.darkRoles'] },
  ] },
  { title: 'Navigation', roles: [
    { role: 'nav', label: 'Background', field: 'nav', keys: ['palette.darkRoles'] },
    { role: 'nav-text', label: 'Text', field: 'navText', keys: ['palette.darkRoles'] },
  ] },
];

/** Theme rows: the popup's dark-mode control and chips, and the Studio's theme
 *  bar, edit these keys (they're not Features rows). */
export const THEME_ROWS: readonly RowDef[] = [
    { id: 'light-theme', key: 'palette.light', label: 'Light theme', control: 'select',
      options: [['canvas', 'Canvas'], ['paper', 'Paper'], ['sepia', 'Sepia'], ['contrast', 'High contrast'], ['custom', 'Custom']],
      keywords: 'theme palette light sepia paper contrast' },
    { id: 'dark-mode', key: 'palette.useDark', label: 'Use dark theme', control: 'dark-mode',
      options: [['off', 'Never'], ['on', 'Always'], ['system', 'Match system'], ['schedule', 'Scheduled']], keywords: 'dark mode theme night' },
    { id: 'dark-schedule', keys: ['palette.start', 'palette.end'], label: 'Schedule', control: 'time-range', depth: 1,
      when: [{ key: 'palette.useDark', is: 'schedule' }], desc: 'Choose Scheduled to use these times', keywords: 'from to time' },
    { id: 'dark-style', key: 'palette.dark', label: 'Dark theme', control: 'style-chips', depth: 1, when: DARK_ON,
      keywords: 'theme preset palette dark gray black warm contrast' },
];

/** Keys the Studio's stage and theme bar edit directly (Look: palette, shape,
 *  type, layout, views), so the build check counts them as shown. */
export const STAGE_KEYS: readonly string[] = [
  'palette.lightRoles', 'palette.darkRoles', 'shape.corner', 'shape.border',
  'type.family', 'type.localFamily', 'type.scale', 'type.density',
  'gradient-cards.enabled', 'condensed-cards.enabled', 'card-overlay.overlay', 'full-width.width',
  'card-customization.cardWidth', 'card-customization.cardGap', 'core.panelSide', 'core.panelSections', 'better-todo.view',
  'themes.saved', 'gpa-calculator.weights',
];

/** The Studio's Features: the settings that aren't Look, by section (studio.md). */
export const SECTIONS: readonly SectionDef[] = [
  { id: 'dashboard', title: 'Dashboard', rows: [
    { id: 'card-assignments', key: 'card-assignments.enabled', label: 'Show assignments on cards', control: 'switch' },
    { id: 'card-due-view', key: 'card-assignments.view', label: 'Due list', control: 'segmented', depth: 1, when: on('card-assignments.enabled'),
      options: [['rows', 'Rows'], ['next', 'Next only'], ['count', 'Count']],
      descBy: { rows: 'The next few items, one per row', next: 'Only the next thing due', count: 'How many are overdue, due this week, and in all' },
      keywords: 'view rows next count' },
    { id: 'card-assignments-count', key: 'card-assignments.count', label: 'Number shown', control: 'stepper', depth: 1,
      when: [{ key: 'card-assignments.enabled' }, { key: 'card-assignments.view', is: 'rows' }] },
    { id: 'card-assignments-overdue', key: 'card-assignments.overdue', label: 'Include overdue', control: 'switch', depth: 1, when: on('card-assignments.enabled') },
    { id: 'card-assignments-completed', key: 'card-assignments.showCompleted', label: 'Show completed', control: 'switch', depth: 1, when: on('card-assignments.enabled') },
    { id: 'card-assignments-types', label: 'Types', control: 'checks', depth: 1, when: on('card-assignments.enabled'),
      options: [['card-assignments.assignments', 'Assignments'], ['card-assignments.quizzes', 'Quizzes'], ['card-assignments.discussions', 'Discussions']],
      keywords: 'assignments quizzes discussions' },
    { id: 'grade-impact', key: 'grade-impact.enabled', label: 'Show grade impact', control: 'switch', depth: 1, when: on('card-assignments.enabled'),
      desc: 'Adds “−4.2 / +1.8” to each item: how far the course score moves at zero or full marks' },
    { id: 'card-grades', key: 'card-grades.enabled', label: 'Show grade on cards', control: 'switch' },
    { id: 'card-grades-hover', key: 'card-grades.hoverOnly', label: 'Only on hover', control: 'switch', depth: 1, when: on('card-grades.enabled') },
    { id: 'card-colors', key: 'card-colors.request', label: 'Card colors', control: 'card-colors', noReset: true,
      desc: 'To color one card, use that card’s menu', keywords: 'palette colour course color' },
    { id: 'card-customization', key: 'card-customization.enabled', label: 'Customize cards', control: 'switch',
      desc: 'Edit a card’s image and links, or hide it, on the card itself' },
    { id: 'card-rename', key: 'card-customization.renameVia', label: 'Renaming a card', control: 'segmented', depth: 1,
      when: on('card-customization.enabled'), options: [['canvas', 'Canvas nickname (shows everywhere)'], ['b2c', 'b²c label (this card only)']],
      descBy: { canvas: 'Use Nickname in the card’s ⋮ menu. It shows everywhere, including the Canvas apps',
                b2c: 'Rename… on the card sets a name only b²c shows' }, keywords: 'nickname name' },
    { id: 'card-layout', label: 'Card layout', control: 'sliders', depth: 1, when: on('card-customization.enabled'),
      options: [['card-customization.cardWidth', 'Width'], ['card-customization.cardGap', 'Gap'], ['card-customization.cardRadius', 'Corner radius']],
      keywords: 'width gap corner radius size' },
    { id: 'hidden-cards', key: 'card-customization.cards', label: 'Hidden cards', control: 'hidden-cards', depth: 1, when: on('card-customization.enabled'),
      noReset: true, keywords: 'unhide hide' },
    { id: 'card-look', label: 'Card look', control: 'go-stage', target: 'cards', noReset: true,
      desc: 'Width, gap, corner, face, height and colors are under Look', keywords: 'card layout size style gradient condensed overlay page width' },
    { id: 'dashboard-notes', key: 'dashboard-notes.enabled', label: 'Notes', control: 'switch', desc: 'A notes panel on the dashboard' },
    { id: 'hide-recent-feedback', key: 'hide-recent-feedback.enabled', label: 'Hide Recent Feedback', control: 'switch' },
  ] },
  { id: 'todo', title: 'To-do', rows: [
    { id: 'better-todo', key: 'better-todo.enabled', label: 'Improved to-do list', control: 'switch', desc: 'Replaces To Do in the dashboard sidebar' },
    { id: 'better-todo-count', key: 'better-todo.count', label: 'Number shown', control: 'stepper', depth: 1, when: on('better-todo.enabled') },
    { id: 'better-todo-announcements', key: 'better-todo.announcements', label: 'Show announcements', control: 'switch', depth: 1, when: on('better-todo.enabled') },
    { id: 'better-todo-overdue', key: 'better-todo.showOverdue', label: 'Show overdue', control: 'switch', depth: 1, when: on('better-todo.enabled') },
    { id: 'better-todo-hide-completed', key: 'better-todo.hideCompleted', label: 'Hide completed', control: 'switch', depth: 1, when: on('better-todo.enabled') },
    { id: 'better-todo-colors', key: 'better-todo.courseColors', label: 'Use course colors', control: 'switch', depth: 1, when: on('better-todo.enabled') },
    { id: 'better-todo-preview', key: 'better-todo.hoverPreview', label: 'Preview on hover', control: 'switch', depth: 1, when: on('better-todo.enabled'),
      desc: 'Shows the description after a short pause' },
    { id: 'planner-sync', key: 'core.plannerSync', label: 'Sync with Canvas planner', control: 'switch',
      descBy: { true: 'Also marks items done or dismissed in Canvas’s planner, so it shows in the Canvas apps too',
                false: 'Done and removed items are b²c only. Canvas’s planner doesn’t change' },
      keywords: 'done dismiss mobile app' },
  ] },
  { id: 'grades', title: 'Grades', rows: [
    { id: 'gpa', key: 'gpa-calculator.enabled', label: 'GPA calculator', control: 'switch', desc: 'A GPA panel on the dashboard, marked hypothetical' },
    { id: 'gpa-scale', key: 'gpa-calculator.scale', label: 'Grade scale', control: 'scale', depth: 1, when: on('gpa-calculator.enabled'), resetLabel: 'grade scale',
      desc: 'Points per letter. Percent cutoffs apply only when a course has no Canvas letter grade', keywords: 'letter points preset thirds tenths' },
    { id: 'gpa-rounding', key: 'gpa-calculator.rounding', label: 'Rounding', control: 'segmented', depth: 1, when: on('gpa-calculator.enabled'),
      options: [['auto', 'School rule'], ['truncate', 'Truncate'], ['round', 'Round']],
      descBy: { auto: 'Uses your school’s rule where b²c knows it, else rounds', truncate: '3.678 shows as 3.67', round: '3.678 shows as 3.68' },
      keywords: 'truncate decimals' },
    { id: 'gpa-previous', key: 'gpa-calculator.includePrevious', label: 'Include previous terms', control: 'switch', depth: 1, when: on('gpa-calculator.enabled'),
      descBy: { true: 'The panel shows Cumulative GPA', false: 'The panel shows Term GPA' }, keywords: 'cumulative' },
    { id: 'gpa-prior-gpa', key: 'gpa-calculator.priorGpa', label: 'Previous GPA', control: 'number', depth: 2,
      when: [{ key: 'gpa-calculator.enabled' }, { key: 'gpa-calculator.includePrevious' }] },
    { id: 'gpa-prior-credits', key: 'gpa-calculator.priorCredits', label: 'Previous credits', control: 'number', depth: 2,
      when: [{ key: 'gpa-calculator.enabled' }, { key: 'gpa-calculator.includePrevious' }] },
    { id: 'gpa-above', key: 'gpa-calculator.aboveCards', label: 'Show GPA above cards', control: 'switch', depth: 1, when: on('gpa-calculator.enabled'),
      desc: 'A full-width strip above the course cards instead of the side panel' },
    { id: 'grade-goals', key: 'grade-goals.enabled', label: 'Grade goals', control: 'switch',
      desc: 'Set a goal on a course’s Grades page to see the average you need on the rest', keywords: 'target' },
  ] },
  { id: 'pages', title: 'Pages', rows: [
    { id: 'quiz', key: 'core.quizSafe', label: 'Quiz pages', control: 'segmented',
      options: [['nothing', 'Leave untouched'], ['colours', 'Colors only']],
      descBy: { nothing: 'b²c doesn’t run while you take a quiz', colours: 'While you take a quiz, only theme colors apply' }, keywords: 'exam test safe' },
    { id: 'dark-nav', key: 'palette.navStyle', label: 'Navigation bar', control: 'segmented',
      options: [['school', 'School color'], ['theme', 'Theme color']],
      descBy: { school: 'Keeps your school’s color in the left bar', theme: 'The left bar takes the theme’s surface color' } },
    { id: 'dark-documents', key: 'palette.documents', label: 'Documents in the dark theme', control: 'segmented',
      options: [['light', 'Light'], ['dimmed', 'Dimmed'], ['dark', 'Dark']],
      descBy: { light: 'PDFs and files you preview stay as printed', dimmed: 'Previews a little darker', dark: 'Previews inverted to dark' } },
    { id: 'dark-images', key: 'palette.dimImages', label: 'Dim images in the dark theme', control: 'switch',
      desc: 'Course images and pictures in pages, a little darker', keywords: 'photos' },
    { id: 'hide-logo', key: 'hide-logo.enabled', label: 'Hide institution logo', control: 'switch', keywords: 'logo nav' },
    { id: 'tab-icons', key: 'tab-icons.enabled', label: 'Color course tab icons', control: 'switch', desc: 'Tints each course’s tab icon with its card color', keywords: 'favicon' },
    { id: 'look-link', label: 'Font, colors and shapes', control: 'go-stage', target: 'type', noReset: true, desc: 'Under Look', keywords: 'theme font' },
  ] },
  { id: 'dates', title: 'Dates and time', rows: [
    { id: 'dates', key: 'core.dates', label: 'Dates', control: 'segmented',
      options: [['relative', 'Relative'], ['absolute', 'Absolute']],
      descBy: { relative: 'On cards and in the to-do list: “Due tomorrow at 11:59 PM”', absolute: 'On cards and in the to-do list: “Due Oct 21 at 11:59 PM”' } },
    { id: 'date-order', key: 'core.dateOrder', label: 'Date order', control: 'segmented',
      options: [['auto', 'Auto'], ['md', 'Month/day'], ['dm', 'Day/month']],
      descBy: { auto: 'As your computer writes dates', md: 'Oct 21', dm: '21 Oct' }, keywords: 'day month order format' },
    { id: 'clock', key: 'core.clock', label: 'Time format', control: 'segmented', options: [['system', 'System'], ['12', '12-hour'], ['24', '24-hour']],
      descBy: { system: 'As your computer shows times', 12: '11:59 PM', 24: '23:59' }, keywords: 'clock' },
  ] },
  { id: 'navigation', title: 'Navigation', rows: [
    { id: 'pins', key: 'pins.enabled', label: 'Pins', control: 'switch', desc: 'Week-aware bookmarks', keywords: 'bookmarks this week dock' },
    { id: 'pins-dashboard', key: 'pins.dashboard', label: 'Show on the dashboard', control: 'switch', depth: 1, when: on('pins.enabled') },
    { id: 'pins-course-nav', key: 'pins.courseNav', label: 'Show under the course menu', control: 'switch', depth: 1, when: on('pins.enabled') },
    { id: 'pins-scope', key: 'pins.scope', label: 'In a course, show', control: 'segmented', depth: 1, when: on('pins.enabled'),
      options: [['course', 'This course’s pins'], ['all', 'All pins']] },
    { id: 'pins-upcoming', key: 'pins.upcomingFrom', label: 'Show next week’s from', control: 'segmented', depth: 1, when: on('pins.enabled'),
      options: [['thu', 'Thursday'], ['fri', 'Friday'], ['never', 'Never']], desc: 'When “this week” pins also preview next week' },
    { id: 'global-search', key: 'global-search.enabled', label: 'Search (⌘K)', control: 'switch',
      desc: 'Search your courses, modules, files and pages from any Canvas page. It stays on this computer', keywords: 'find command palette k' },
  ] },
  { id: 'css', title: 'Custom CSS', rows: [
    { id: 'custom-css', key: 'custom-css.css', keys: ['custom-css.enabled'], label: 'Custom CSS', control: 'component', mount: 'custom-css',
      hideLabel: true, keywords: 'advanced stylesheet code style rice' },
  ] },
  { id: 'advanced', title: 'Advanced', rows: [
    { id: 'agent-access', key: 'core.agentContract', label: 'Let AI agents read this page’s b²c facts', control: 'switch',
      descBy: { true: 'Tools you run, like an AI assistant in this browser, can read what b²c shows on a Canvas page and its settings',
                false: 'b²c doesn’t describe pages to tools you run' }, keywords: 'agent ai assistant automation describe contract' },
  ] },
  { id: 'backup', title: 'Backup', rows: [
    { id: 'theme-share', label: 'Share or import a theme', control: 'theme-share', noReset: true,
      desc: 'A theme as a code or a file. Full rice adds your custom CSS', keywords: 'theme look export import share json rice saved' },
    { id: 'backup', label: 'Backup', hideLabel: true, control: 'platform', mount: 'backup', noReset: true,
      keywords: 'export import restore json reset better canvas bc theme' },
  ] },
  { id: 'sites', title: 'Sites', rows: [
    { id: 'sites', label: 'Sites', hideLabel: true, control: 'platform', mount: 'sites', noReset: true, keywords: 'canvas address domain host url school' },
  ] },
  { id: 'about', title: 'About', rows: [
    { id: 'version', label: 'Version', control: 'version', noReset: true, keywords: 'build' },
    { id: 'shortcuts', label: 'Keyboard shortcuts', control: 'shortcuts', noReset: true, keywords: 'keys hotkey' },
    { id: 'auto-update', key: 'core.autoUpdate', label: 'Install new builds automatically', control: 'switch',
      desc: 'When off, the b²c icon shows ↑ and the popup offers Reload', keywords: 'update reload' },
    { id: 'paused', key: 'core.paused', label: 'Pause b²c on all sites', control: 'switch',
      descBy: { true: 'Paused. Canvas looks as it does without b²c', false: 'Canvas looks as it does without b²c until you turn this off' } },
    { id: 'diagnostics', label: 'Diagnostics', hideLabel: true, control: 'platform', mount: 'diagnostics', noReset: true, keywords: 'errors log report' },
  ] },
];

const Q = {
  assignments: { id: 'q-card-assignments', key: 'card-assignments.enabled', label: 'Assignments on cards', control: 'switch' },
  grades: { id: 'q-card-grades', key: 'card-grades.enabled', label: 'Grades on cards', control: 'switch' },
  todo: { id: 'q-better-todo', key: 'better-todo.enabled', label: 'Improved to-do list', control: 'switch' },
  gpa: { id: 'q-gpa', key: 'gpa-calculator.enabled', label: 'GPA calculator', control: 'switch' },
  goals: { id: 'q-grade-goals', key: 'grade-goals.enabled', label: 'Grade goals', control: 'switch' },
  tabIcons: { id: 'q-tab-icons', key: 'tab-icons.enabled', label: 'Color course tab icons', control: 'switch' },
} satisfies Record<string, RowDef>;

/** Popup "On this page": up to 4 switches for the features that act on the
 *  active tab's page kind (settings.md §Popup). Kinds not listed: none. */
export const POPUP_ON_PAGE: Readonly<Record<string, readonly RowDef[]>> = {
  dashboard: [Q.assignments, Q.grades, Q.todo, Q.gpa],
  'course-grades': [Q.goals, Q.gpa],
  'course-home': [Q.tabIcons], assignment: [Q.tabIcons], assignments: [Q.tabIcons], modules: [Q.tabIcons], 'course-other': [Q.tabIcons],
};
/** Every popup switch, for the build check. */
export const POPUP_SWITCHES: readonly RowDef[] = Object.values(Q);

/** First run, step 2 "What b²c can do": the headline features at their defaults. */
export const FIRST_RUN: readonly RowDef[] = [
  { id: 'fr-dark', key: 'palette.useDark', label: 'Use dark theme', control: 'dark-mode', desc: 'Canvas in dark colors, before the page draws',
    options: [['off', 'Never'], ['on', 'Always'], ['system', 'Match system']] },
  { id: 'fr-assignments', key: 'card-assignments.enabled', label: 'Assignments on cards', control: 'switch', desc: 'What’s due next, on each course card' },
  { id: 'fr-grades', key: 'card-grades.enabled', label: 'Grades on cards', control: 'switch', desc: 'Each course’s current grade on its card' },
  { id: 'fr-todo', key: 'better-todo.enabled', label: 'Improved to-do list', control: 'switch', desc: 'Mark done, hide, and see what’s overdue' },
  { id: 'fr-gpa', key: 'gpa-calculator.enabled', label: 'GPA calculator', control: 'switch', desc: 'A GPA panel on the dashboard, marked hypothetical' },
  { id: 'fr-goals', key: 'grade-goals.enabled', label: 'Grade goals', control: 'switch', desc: 'What you need on the rest to reach a grade' },
];

/** Schema keys deliberately not shown as settings: data and UI state edited
 *  where they live (on the dashboard, on a card), or not user-facing. */
export const NOT_SHOWN: readonly string[] = [
  'better-todo.marks', 'better-todo.labels', 'better-todo.custom', 'better-todo.ui',
  'card-assignments.done', 'gpa-calculator.courses', 'gpa-calculator.collapsed', 'grade-goals.goals',
  'card-customization.cards', 'card-customization.order', 'dashboard-notes.text', 'dashboard-notes.at', 'dashboard-notes.collapsed', 'card-colors.request', 'card-colors.applied', 'card-colors.previous', 'core.todoMarks',
  'themes.previous', 'pins.list',
];
