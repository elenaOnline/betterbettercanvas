import type { SettingsShape, Values } from './settings/schema.ts';
import type { Ctx } from './ctx.ts';
import type { PageKind } from './canvas/page.ts';

/** Pre-paint state a feature contributes to the localStorage mirror. */
export interface MirrorPart {
  /** Attributes set on <html> by boot.js before first paint. */
  attrs?: Record<string, string>;
  /** Custom properties (`--b2c-*`) set on :root before first paint. */
  vars?: Record<string, string>;
  /**
   * Attributes that apply only while a condition holds: a daily wall-clock
   * window or a media query. boot.js evaluates them synchronously on load;
   * main.js re-evaluates on a timer and on media changes.
   */
  cond?: CondAttr[];
  /**
   * CSS text applied before first paint (user-authored CSS that can't live in
   * the static sheet). boot.js puts it in `<style data-b2c-sheet="<id>"
   * data-b2c-<id>>`; the feature may adopt that element in start().
   */
  css?: string;
  /** Internal: `css` keyed by feature id (filled in by mirrorOf). */
  sheets?: Record<string, string>;
}

export interface CondAttr {
  attr: string;
  value: string;
  when:
    | { start: string; end: string } // "HH:MM" local; may wrap midnight
    | { media: string };             // e.g. "(prefers-color-scheme: dark)"
}

export interface Instance<V> {
  /** Apply changed settings live. Absent → the feature is restarted. */
  update?(s: V): void;
  stop(): void;
}

export interface FeatureDef<S extends SettingsShape = SettingsShape> {
  /** Shared feature id (Research parity map = Design surface = this folder). */
  id: string;
  settings: S;
  /** Page kinds where start() runs. 'all' = every Canvas page. */
  pages: readonly PageKind[] | 'all';
  /**
   * Pre-paint state. Default when the feature has an `enabled` setting:
   * `data-b2c-<id>` is present while enabled, which gates style.css.
   */
  mirror?(s: Values<S>): MirrorPart;
  /**
   * Allowed on quiz-taking pages (quiz-safe-mode). Only pure colour CSS should
   * ever set this; nothing that starts code or changes layout.
   */
  quizSafe?: boolean;
  /** Set by the build for lazy features: the runtime chunk to import. */
  runtimeChunk?: string;
  /** Named Canvas selectors this feature relies on, for the health view. */
  anchors?: Record<string, string>;
  start?(ctx: Ctx, s: Values<S>): Instance<Values<S>> | void | Promise<Instance<Values<S>> | void>;
}

export type AnyFeature = FeatureDef<SettingsShape>;

export function defineFeature<S extends SettingsShape>(def: FeatureDef<S>): FeatureDef<S> {
  return def;
}

export const settingKey = (featureId: string, key: string) => `${featureId}.${key}`;

/**
 * Lazy runtime (v2 weight budget). A feature whose folder has `run.ts`
 * exporting `start` keeps only its definition (settings, pages, mirror) in
 * main.js; the build emits `run.ts` as its own chunk, loaded on first start —
 * i.e. only on pages where the feature actually runs. Wired by build.mjs.
 */
/** ms to load each lazy runtime chunk (reported by the health probe). */
export const runtimeLoadMs: Record<string, number> = {};
const runtimes = new Map<string, Promise<{ start: NonNullable<AnyFeature['start']> }>>();

/** Start fetching a runtime chunk now (idempotent); `lazyRuntime` reuses it. */
export function preloadRuntime(id: string, chunk: string) {
  let p = runtimes.get(chunk);
  if (!p) {
    const t0 = performance.now();
    p = import(/* @vite-ignore */ chrome.runtime.getURL(chunk)).then(m => {
      runtimeLoadMs[id] = Math.round((performance.now() - t0) * 10) / 10;
      return m as { start: NonNullable<AnyFeature['start']> };
    });
    runtimes.set(chunk, p);
  }
  return p;
}

export function lazyRuntime<F extends AnyFeature>(f: F, chunk: string): F {
  if (f.start) return f; // a feature that still defines start inline wins
  return {
    ...f,
    runtimeChunk: chunk,
    async start(ctx, s) {
      const m = await preloadRuntime(f.id, chunk);
      return m.start(ctx, s);
    },
  };
}

/** Read one feature's settings out of the flat settings map. */
export function featureValues<S extends SettingsShape>(f: FeatureDef<S>, all: Record<string, unknown>): Values<S> {
  const out: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(f.settings)) out[k] = s.kind === 'shared' ? all[s.key] : all[settingKey(f.id, k)];
  return out as Values<S>;
}

/** Every flat key whose change should reach this feature. */
export function featureKeys(f: AnyFeature): string[] {
  return Object.entries(f.settings).map(([k, s]) => (s.kind === 'shared' ? s.key : settingKey(f.id, k)));
}

export function isEnabled(f: AnyFeature, all: Record<string, unknown>): boolean {
  return !('enabled' in f.settings) || all[settingKey(f.id, 'enabled')] === true;
}

export function mirrorOf(f: AnyFeature, all: Record<string, unknown>): MirrorPart {
  if (!isEnabled(f, all)) return {};
  const part = f.mirror?.(featureValues(f, all)) ?? {};
  if ('enabled' in f.settings) part.attrs = { [`data-b2c-${f.id}`]: '', ...part.attrs };
  if (part.css) {
    part.sheets = { [f.id]: part.css };
    delete part.css;
  }
  return part;
}
