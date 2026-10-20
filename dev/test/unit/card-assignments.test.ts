import { describe, expect, it } from 'vitest';
import type { PlannerItem } from '../../src/core/canvas/data.ts';
import { byCourse, counts, dayDiff, dueInfo, dueText, fullDate, itemKey, pick, pruneDone, type DateOpts, type PickOpts } from '../../src/features/card-assignments/logic.ts';
import { cardCourseId, cardSelectorFor, toHex } from '../../src/features/card-assignments/anchors.ts';

const TZ = 'America/Los_Angeles';
const NOW = new Date('2026-10-21T10:00:00-07:00'); // Wednesday

let seq = 0;
function item(due: string | null, o: Partial<PlannerItem> & { submitted?: boolean; done?: boolean } = {}): PlannerItem {
  const id = String(++seq);
  const { submitted, done, ...rest } = o;
  return {
    course_id: '1',
    plannable_id: id,
    plannable_type: 'assignment',
    plannable_date: due ?? '',
    plannable: { id, title: `Item ${id}`, due_at: due },
    planner_override: done ? { id: 'o' + id, plannable_type: 'assignment', plannable_id: id, marked_complete: true, dismissed: false } : null,
    submissions: { submitted: !!submitted, excused: false, graded: false, late: false, missing: false, needs_grading: false, has_feedback: false },
    new_activity: false,
    html_url: `/courses/1/assignments/${id}`,
    ...rest,
  };
}

const opts = (o: Partial<PickOpts> = {}): PickOpts => ({
  count: 4,
  overdue: true,
  showCompleted: false,
  types: new Set(['assignment', 'quiz', 'discussion_topic']),
  done: new Set(),
  ...o,
});

describe('pick', () => {
  it('puts overdue first (oldest first), then upcoming soonest first', () => {
    const a = item('2026-10-25T23:59:00-07:00');
    const b = item('2026-10-19T23:59:00-07:00'); // overdue
    const c = item('2026-10-22T23:59:00-07:00');
    const d = item('2026-10-15T23:59:00-07:00'); // overdue, older
    const r = pick([a, b, c, d], opts(), NOW);
    expect(r.rows.map(x => x.item)).toEqual([d, b, c, a]);
    expect(r.rows.map(x => x.overdue)).toEqual([true, true, false, false]);
    expect(r.total).toBe(4);
    expect(r.more).toBe(0);
  });

  it('drops overdue when the setting is off, and submitted overdue always', () => {
    const late = item('2026-10-19T23:59:00-07:00');
    const lateDone = item('2026-10-19T23:59:00-07:00', { submitted: true });
    expect(pick([late, lateDone], opts({ overdue: false }), NOW).rows).toEqual([]);
    expect(pick([late, lateDone], opts(), NOW).rows.map(r => r.item)).toEqual([late]);
  });

  it('hides submitted upcoming work unless showCompleted', () => {
    const sub = item('2026-10-23T23:59:00-07:00', { submitted: true });
    expect(pick([sub], opts(), NOW).rows).toEqual([]);
    const r = pick([sub], opts({ showCompleted: true }), NOW);
    expect(r.rows[0]?.completed).toBe(true);
  });

  it('never shows done items (Canvas override or b²c mark)', () => {
    const a = item('2026-10-23T23:59:00-07:00', { done: true });
    const b = item('2026-10-24T23:59:00-07:00');
    expect(pick([a, b], opts(), NOW).rows.map(r => r.item)).toEqual([b]);
    expect(pick([a, b], opts({ done: new Set([itemKey(b)]) }), NOW).rows).toEqual([]);
  });

  it('filters by type and skips undated items', () => {
    const q = item('2026-10-23T23:59:00-07:00', { plannable_type: 'quiz' });
    const n = item('2026-10-23T23:59:00-07:00', { plannable_type: 'planner_note' });
    const x = item(null);
    // Planner notes (custom to-do items) always show for their course; type filters don't hide them.
    expect(pick([q, n, x], opts({ types: new Set(['assignment']) }), NOW).rows.map(r => r.item)).toEqual([n]);
    expect(pick([q, n, x], opts(), NOW).rows.map(r => r.item)).toEqual([n, q]); // same due: by key
  });

  it('turns the last row into "+N more" when items overflow', () => {
    const list = Array.from({ length: 7 }, (_, i) => item(`2026-10-${22 + i}T12:00:00-07:00`));
    const r = pick(list, opts({ count: 4 }), NOW);
    expect(r.rows).toHaveLength(3);
    expect(r.more).toBe(4);
    expect(r.total).toBe(7);
    const one = pick(list, opts({ count: 1 }), NOW);
    expect(one.rows).toHaveLength(1);
    expect(one.more).toBe(6);
  });

  it('groups by course id as strings', () => {
    const a = item('2026-10-23T23:59:00-07:00', { course_id: 7 as unknown as string });
    const b = item('2026-10-23T23:59:00-07:00', { course_id: '8' });
    const g = byCourse([a, b]);
    expect(g.get('7')).toEqual([a]);
    expect(g.get('8')).toEqual([b]);
  });
});

describe('crossed-off rows', () => {
  it('keeps a done row in place, struck, when it was crossed this session', () => {
    const a = item('2026-10-22T23:59:00-07:00');
    const b = item('2026-10-23T23:59:00-07:00', { done: true });
    const c = item('2026-10-24T23:59:00-07:00');
    const r = pick([a, b, c], opts({ crossed: new Set([itemKey(b)]) }), NOW);
    expect(r.rows.map(x => [x.item, x.done])).toEqual([[a, false], [b, true], [c, false]]);
    expect(r.total).toBe(2); // the header counts what's left
    // Without the session mark (next load) it drops out.
    expect(pick([a, b, c], opts(), NOW).rows.map(x => x.item)).toEqual([a, c]);
  });
  it('a crossed overdue row is not styled overdue', () => {
    const late = item('2026-10-19T23:59:00-07:00', { done: true });
    const r = pick([late], opts({ crossed: new Set([itemKey(late)]) }), NOW);
    expect(r.rows[0]).toMatchObject({ done: true, overdue: false });
  });
});

describe('count view', () => {
  it('counts overdue, this week and total', () => {
    const list = [
      item('2026-10-19T23:59:00-07:00'),
      item('2026-10-22T23:59:00-07:00'),
      item('2026-10-26T23:59:00-07:00'),
      item('2026-11-10T23:59:00-07:00'),
      item('2026-10-23T23:59:00-07:00', { done: true }),
    ];
    expect(counts(list, opts(), NOW, TZ)).toEqual({ overdue: 1, week: 2, total: 4 });
  });
});

describe('due text', () => {
  const rel: DateOpts = { timeZone: TZ, clock: '12', mode: 'relative' };
  const at = (s: string) => new Date(s);

  it('reads relative within 7 days', () => {
    expect(dueText(at('2026-10-21T17:00:00-07:00'), NOW, rel)).toBe('Today 5:00 PM');
    expect(dueText(at('2026-10-22T23:59:00-07:00'), NOW, rel)).toBe('Tomorrow 11:59 PM');
    expect(dueText(at('2026-10-23T23:59:00-07:00'), NOW, rel)).toBe('Fri 11:59 PM');
    expect(dueText(at('2026-10-27T23:59:00-07:00'), NOW, rel)).toBe('Tue 11:59 PM');
    expect(dueText(at('2026-10-28T23:59:00-07:00'), NOW, rel)).toBe('Oct 28');
  });

  it('uses the Canvas time zone for day boundaries', () => {
    // 01:00 UTC Oct 22 is still Oct 21 in Los Angeles.
    expect(dueText(at('2026-10-22T01:00:00Z'), NOW, rel)).toBe('Today 6:00 PM');
    expect(dayDiff(at('2026-10-22T01:00:00Z'), NOW, 'Asia/Tokyo')).toBe(0);
  });

  it('reads overdue with the age', () => {
    expect(dueText(at('2026-10-21T09:30:00-07:00'), NOW, rel)).toBe('Overdue 30m');
    expect(dueText(at('2026-10-21T05:00:00-07:00'), NOW, rel)).toBe('Overdue 5h');
    expect(dueText(at('2026-10-19T10:00:00-07:00'), NOW, rel)).toBe('Overdue 2d');
  });

  it('absolute and 24-hour', () => {
    expect(dueText(at('2026-10-22T23:59:00-07:00'), NOW, { ...rel, mode: 'absolute' })).toBe('Oct 22 11:59 PM');
    expect(dueText(at('2026-10-22T23:59:00-07:00'), NOW, { ...rel, clock: '24' })).toBe('Tomorrow 23:59');
    expect(dueText(at('2027-01-05T09:00:00-08:00'), NOW, { ...rel, mode: 'absolute' })).toBe('Jan 5, 2027 9:00 AM');
  });

  it('due soon: emphasised within 24 h, counting down under 3 h', () => {
    expect(dueInfo(at('2026-10-21T12:10:00-07:00'), NOW, rel)).toEqual({ text: 'Due in 2h 10m', soon: true, overdue: false });
    expect(dueInfo(at('2026-10-21T10:45:00-07:00'), NOW, rel)).toEqual({ text: 'Due in 45m', soon: true, overdue: false });
    expect(dueInfo(at('2026-10-21T23:59:00-07:00'), NOW, rel)).toEqual({ text: 'Today 11:59 PM', soon: true, overdue: false });
    expect(dueInfo(at('2026-10-22T09:00:00-07:00'), NOW, rel).soon).toBe(true);
    expect(dueInfo(at('2026-10-22T23:59:00-07:00'), NOW, rel).soon).toBe(false);
    expect(dueInfo(at('2026-10-20T23:59:00-07:00'), NOW, rel)).toMatchObject({ overdue: true, soon: false });
  });

  it('date order: month/day, day/month, or the Canvas locale', () => {
    const far = at('2026-10-28T23:59:00-07:00');
    expect(dueText(far, NOW, { ...rel, order: 'md' })).toBe('Oct 28');
    expect(dueText(far, NOW, { ...rel, order: 'dm' })).toBe('28 Oct');
    expect(dueText(far, NOW, { ...rel, order: 'auto', locale: 'en-GB' })).toBe('28 Oct');
    expect(dueText(far, NOW, { ...rel, order: 'auto', locale: 'en-US' })).toBe('Oct 28');
    expect(dueText(far, NOW, { ...rel, mode: 'absolute', order: 'dm' })).toBe('28 Oct 11:59 PM');
    expect(dueText(at('2027-01-05T09:00:00-08:00'), NOW, { ...rel, mode: 'absolute', order: 'dm' })).toBe('5 Jan, 2027 9:00 AM');
  });

  it('full date tooltip', () => {
    expect(fullDate(at('2026-10-22T23:59:00-07:00'), rel)).toBe('Thursday, October 22, 2026 at 11:59 PM');
  });
});

describe('done marks', () => {
  it('prunes expired and junk entries', () => {
    expect(pruneDone({ a: 10, b: 30, c: 'x' as unknown as number }, 20)).toEqual({ b: 30 });
  });
});

describe('anchors', () => {
  it('reads the course id from the card link, skipping placeholders', () => {
    document.body.innerHTML = `
      <div class="ic-DashboardCard"><svg></svg></div>
      <div class="ic-DashboardCard"><div class="ic-DashboardCard__header"><a class="ic-DashboardCard__link" href="/courses/112"></a></div></div>
      <div class="ic-DashboardCard"><div class="ic-DashboardCard__header"><a class="ic-DashboardCard__link" href="/courses/12"></a></div></div>`;
    const cards = Array.from(document.querySelectorAll('.ic-DashboardCard'));
    expect(cards.map(cardCourseId)).toEqual([null, '112', '12']);
    expect(cardSelectorFor('12')).toContain('[href$="/courses/');
  });

  it('normalises colours to hex', () => {
    expect(toHex('rgb(18, 52, 86)')).toBe('#123456');
    expect(toHex('#ABC')).toBe('#aabbcc');
    expect(toHex('blue')).toBeNull();
  });
});
