// Setting descriptors. Features declare their settings with these helpers; the
// build turns them into dev/schema.json (keys, types, defaults) for Design.

export type Area = 'sync' | 'local';

interface Base<K extends string, T> {
  kind: K;
  default: T;
  /** chrome.storage area. Small values sync; big ones stay local. */
  area: Area;
}

export interface BoolSetting extends Base<'bool', boolean> {}
export interface IntSetting extends Base<'int', number> { min?: number; max?: number; step?: number }
export interface NumSetting extends Base<'num', number> { min?: number; max?: number; step?: number }
export interface StrSetting extends Base<'str', string> { maxLength?: number; multiline?: boolean }
export interface EnumSetting<V extends string = string> extends Base<'enum', V> { values: readonly V[] }
export interface ColorSetting extends Base<'color', string> {}
/** Wall-clock time "HH:MM", 24h. */
export interface TimeSetting extends Base<'time', string> {}
export interface JsonSetting<T = unknown> extends Base<'json', T> {
  /** Optional validator; return false to fall back to the default. */
  check?: (v: unknown) => boolean;
}

export type Setting =
  | BoolSetting | IntSetting | NumSetting | StrSetting | EnumSetting
  | ColorSetting | TimeSetting | JsonSetting;

/**
 * A feature's view of a setting owned by core (one setting shared by several
 * features, e.g. planner sync). Not part of the feature's own schema; the
 * feature reads `all[key]` and is updated live when it changes.
 */
export interface SharedRef<T = unknown> {
  kind: 'shared';
  key: string;
  /** Type witness only. */
  default: T;
}

export type SettingsShape = Record<string, Setting | SharedRef>;

export type ValueOf<S extends Setting | SharedRef> =
  S extends SharedRef<infer T> ? T :
  S extends BoolSetting ? boolean :
  S extends IntSetting | NumSetting ? number :
  S extends EnumSetting<infer V> ? V :
  S extends JsonSetting<infer T> ? T :
  string;

export type Values<S extends SettingsShape> = { readonly [K in keyof S]: ValueOf<S[K]> };

type Opts<S extends Setting> = Partial<Omit<S, 'kind' | 'default'>>;

export const bool = (d: boolean, o: Opts<BoolSetting> = {}): BoolSetting =>
  ({ kind: 'bool', default: d, area: 'sync', ...o });
export const int = (d: number, o: Opts<IntSetting> = {}): IntSetting =>
  ({ kind: 'int', default: d, area: 'sync', ...o });
export const num = (d: number, o: Opts<NumSetting> = {}): NumSetting =>
  ({ kind: 'num', default: d, area: 'sync', ...o });
export const str = (d: string, o: Opts<StrSetting> = {}): StrSetting =>
  ({ kind: 'str', default: d, area: 'sync', ...o });
export const oneOf = <const V extends string>(values: readonly V[], d: V, o: Opts<EnumSetting<V>> = {}): EnumSetting<V> =>
  ({ kind: 'enum', default: d, values, area: 'sync', ...o });
export const color = (d: string, o: Opts<ColorSetting> = {}): ColorSetting =>
  ({ kind: 'color', default: d, area: 'sync', ...o });
export const time = (d: string, o: Opts<TimeSetting> = {}): TimeSetting =>
  ({ kind: 'time', default: d, area: 'sync', ...o });
export const json = <T>(d: T, o: Opts<JsonSetting<T>> = {}): JsonSetting<T> =>
  ({ kind: 'json', default: d, area: 'local', ...o });

const HEX = /^#[0-9a-f]{3,8}$/i;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Coerce a stored value to the setting's type; invalid → default. */
export function coerce(s: Setting, v: unknown): unknown {
  if (v === undefined) return s.default;
  switch (s.kind) {
    case 'bool': return typeof v === 'boolean' ? v : s.default;
    case 'int':
    case 'num': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return s.default;
      let n = s.kind === 'int' ? Math.round(v) : v;
      if (s.min !== undefined) n = Math.max(s.min, n);
      if (s.max !== undefined) n = Math.min(s.max, n);
      return n;
    }
    case 'str':
      if (typeof v !== 'string') return s.default;
      return s.maxLength !== undefined ? v.slice(0, s.maxLength) : v;
    case 'enum': return typeof v === 'string' && s.values.includes(v) ? v : s.default;
    case 'color': return typeof v === 'string' && HEX.test(v) ? v : s.default;
    case 'time': return typeof v === 'string' && HHMM.test(v) ? v : s.default;
    case 'json': return s.check && !s.check(v) ? s.default : v;
  }
}

/** JSON-safe description of a setting, for schema.json. */
export function describe(s: Setting): Record<string, unknown> {
  const { check: _check, ...rest } = s as JsonSetting;
  return rest;
}
