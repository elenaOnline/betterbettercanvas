import { describe, expect, it } from 'vitest';
import { inWindow, mergeParts, resolveAttrs } from '../../src/core/mirror.ts';
import { detectPage } from '../../src/core/canvas/page.ts';
import { csrfToken, nextLink } from '../../src/core/canvas/api.ts';
import { coerce, int, color, time, oneOf } from '../../src/core/settings/schema.ts';
import { buildSchema } from '../../src/core/registry.ts';
// @ts-expect-error build.mjs is plain JS
import { lintGating } from '../../build.mjs';

const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m);

describe('mirror', () => {
  it('handles windows that wrap midnight', () => {
    expect(inWindow('20:00', '08:00', at(23))).toBe(true);
    expect(inWindow('20:00', '08:00', at(7, 59))).toBe(true);
    expect(inWindow('20:00', '08:00', at(8))).toBe(false);
    expect(inWindow('09:00', '17:00', at(12))).toBe(true);
    expect(inWindow('09:00', '17:00', at(17))).toBe(false);
    expect(inWindow('09:00', '09:00', at(9))).toBe(false);
  });
  it('resolves conditional attrs over plain ones', () => {
    const m = mergeParts([{ attrs: { 'data-b2c-x': '' } }, { cond: [{ attr: 'data-b2c-dark', value: 'on', when: { start: '20:00', end: '08:00' } }] }]);
    expect(resolveAttrs(m, at(21))).toEqual({ 'data-b2c-x': '', 'data-b2c-dark': 'on' });
    expect(resolveAttrs(m, at(12))).toEqual({ 'data-b2c-x': '' });
  });
});

describe('page detection', () => {
  it.each([
    ['/', 'dashboard'],
    ['/courses', 'courses'],
    ['/courses/123', 'course-home'],
    ['/courses/123/grades', 'course-grades'],
    ['/courses/123/assignments', 'assignments'],
    ['/courses/123/assignments/syllabus', 'assignments'],
    ['/courses/123/assignments/9', 'assignment'],
    ['/courses/123/pages/x', 'course-other'],
    ['/calendar', 'calendar'],
    ['/conversations', 'inbox'],
    ['/accounts/1', 'other'],
  ])('%s → %s', (p, kind) => expect(detectPage(p).kind).toBe(kind));
});

describe('api helpers', () => {
  it('parses Link next', () => {
    const link = '<https://c/api/v1/x?page=1>; rel="current",<https://c/api/v1/x?page=2>; rel="next",<https://c/api/v1/x?page=9>; rel="last"';
    expect(nextLink(link)).toBe('https://c/api/v1/x?page=2');
    expect(nextLink('<https://c/x>; rel="last"')).toBeNull();
  });
  it('reads the CSRF cookie', () => {
    expect(csrfToken('a=1; _csrf_token=ab%2Bc%3D%3D; b=2')).toBe('ab+c==');
    expect(csrfToken('a=1')).toBeNull();
  });
});

describe('settings', () => {
  it('coerces bad values to defaults and clamps', () => {
    expect(coerce(int(4, { min: 1, max: 10 }), 99)).toBe(10);
    expect(coerce(int(4), 'x')).toBe(4);
    expect(coerce(color('#000000'), 'red')).toBe('#000000');
    expect(coerce(time('20:00'), '25:00')).toBe('20:00');
    expect(coerce(oneOf(['a', 'b'] as const, 'a'), 'c')).toBe('a');
  });
  it('rejects bad and duplicate feature ids', () => {
    const f = { id: 'x', settings: {}, pages: 'all' as const };
    expect(() => buildSchema([f, f])).toThrow(/duplicate/);
    expect(() => buildSchema([{ ...f, id: 'Bad_Id' }])).toThrow(/bad feature id/);
  });
});

describe('CSS gating lint', () => {
  it('accepts gated rules, media blocks and keyframes', () => {
    const css = `html[data-b2c-x] a, html[data-b2c-dark="on"] b { color: red }
      @media (max-width: 600px) { html[data-b2c-x] c { color: blue } }
      @keyframes spin { from { opacity: 0 } to { opacity: 1 } }`;
    expect(lintGating(css, 't')).toEqual([]);
  });
  it('flags ungated rules, including inside @media', () => {
    expect(lintGating('.ic-DashboardCard { color: red }', 't')).toHaveLength(1);
    expect(lintGating('@media print { body { color: red } }', 't')).toHaveLength(1);
  });
});

describe('quiz-safe-mode routes', () => {
  it.each([
    ['/courses/1/quizzes/2/take', 'quiz-taking'],
    ['/courses/1/quizzes/2/take/questions/9', 'quiz-taking'],
    ['/courses/1/quizzes/2', 'course-other'],
    ['/courses/1/quizzes/2/takeover', 'course-other'],
  ])('%s → %s', (p, kind) => expect(detectPage(p).kind).toBe(kind));
});

describe('CSS gating lint: selector lists', () => {
  it('does not split inside :is() or attribute strings', () => {
    const css = `html[data-b2c-dark="on"] :is(a, b) [style*="rgb(0, 0, 0)"], html[data-b2c-dark="on"] c { color: red }`;
    expect(lintGating(css, 't')).toEqual([]);
  });
});

describe('shared settings', () => {
  it('a feature reads a core-owned key through shared refs, and reacts to its changes', async () => {
    const { shared } = await import('../../src/core/settings/shared.ts');
    const { featureValues, featureKeys } = await import('../../src/core/feature.ts');
    const f = { id: 'x', settings: { enabled: { kind: 'bool', default: false, area: 'sync' }, sync: shared.plannerSync }, pages: 'all' as const };
    expect(featureValues(f as never, { 'x.enabled': true, 'core.plannerSync': false })).toEqual({ enabled: true, sync: false });
    expect(featureKeys(f as never)).toEqual(['x.enabled', 'core.plannerSync']);
    expect(buildSchema([f as never])['x.sync']).toBeUndefined();
    expect(() => buildSchema([{ ...f, settings: { s: { kind: 'shared', key: 'core.nope', default: 1 } } } as never])).toThrow(/unknown shared/);
  });
});

describe('sharded Canvas ids (parity audit #9)', () => {
  it.each([
    ['/courses/1234~5678/quizzes/9~10/take', 'quiz-taking'],
    ['/courses/1234~5678/grades', 'course-grades'],
  ])('%s → %s', (p, kind) => expect(detectPage(p).kind).toBe(kind));
  it('keeps the shard-qualified course id', () => expect(detectPage('/courses/1234~5678').courseId).toBe('1234~5678'));
});

describe('CSS gating lint: nesting', () => {
  it('accepts rules nested inside a gated rule, still flags an ungated parent', () => {
    expect(lintGating(`html[data-b2c-theme="on"] { .ic-app { color: red } & a, & b { color: blue } @media (x) { c { d: e } } }`, 't')).toEqual([]);
    expect(lintGating(`.ic-app { html[data-b2c-x] & { color: red } }`, 't')).toHaveLength(1);
  });
});

describe('reserved feature ids', () => {
  it('rejects ids that would collide with agent-contract or core attributes', () => {
    for (const id of ['state', 'region', 'agent', 'theme']) expect(() => buildSchema([{ id, settings: {}, pages: 'all' }])).toThrow(/reserved/);
  });
});
