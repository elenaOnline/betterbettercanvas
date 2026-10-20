// Settings owned by core and shared by several features, so one control in
// the UI drives every feature that uses it (Design's key map: "one setting,
// one state"). Features opt in with e.g. `plannerSync: shared.plannerSync`.
import { bool, json, oneOf, type SharedRef } from './schema.ts';

/** b²c-local item state (used when planner sync is off, and as optimistic echo). */
export type TodoMarks = Record<string /* "type:id" */, { done?: boolean; removed?: boolean; at: number; until?: number }>;
const isMarks = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);

export const sharedSettings = {
  /** Done/remove write Canvas planner overrides (the owner: a toggle, default on). */
  'core.plannerSync': bool(true),
  /** How due dates read everywhere. */
  'core.dates': oneOf(['relative', 'absolute'], 'relative'),
  /** 12/24-hour times everywhere; system follows the OS locale. */
  'core.clock': oneOf(['system', '12', '24'], 'system'),
  /** Absolute date order; auto follows Canvas's locale (en-GB → day first). */
  'core.dateOrder': oneOf(['auto', 'md', 'dm'], 'auto'),
  /** Done/removed marks shared by cards and to-do (local; never synced). */
  'core.todoMarks': json<TodoMarks>({}, { check: isMarks }),
};

const ref = <T,>(key: keyof typeof sharedSettings): SharedRef<T> => ({ kind: 'shared', key, default: sharedSettings[key].default as T });

export const shared = {
  plannerSync: ref<boolean>('core.plannerSync'),
  dates: ref<'relative' | 'absolute'>('core.dates'),
  clock: ref<'system' | '12' | '24'>('core.clock'),
  dateOrder: ref<'auto' | 'md' | 'dm'>('core.dateOrder'),
  todoMarks: ref<TodoMarks>('core.todoMarks'),
};
