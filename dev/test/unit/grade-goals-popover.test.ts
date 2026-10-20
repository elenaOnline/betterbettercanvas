import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openGoalPopover } from '../../src/features/grade-goals/popover.ts';

const GROUPS = [{ id: '1', name: 'HW', group_weight: 0, assignments: [
  { id: 'a', name: 'PS1', points_possible: 100, submission: { score: 80 } },
  { id: 'b', name: 'PS2', points_possible: 100, submission: null },
] }];
const COURSES = [{ id: '7', name: 'X', course_code: 'X', enrollments: [{ type: 'student', computed_current_score: 80 }] }];

let store: Record<string, unknown>;
let listeners: Array<(c: Record<string, unknown>, a: string) => void>;
const sent: unknown[] = [];

function ctx() {
  return {
    env: async () => null,
    set: async (v: Record<string, unknown>) => {
      for (const [k, x] of Object.entries(v)) {
        listeners.forEach(l => l({ [k]: { newValue: x } }, 'local'));
        store[k] = x;
      }
    },
    data: {
      courses: async (cb: (c: unknown, fresh: boolean) => void) => { cb(COURSES, true); return COURSES; },
      assignmentGroups: async (_id: string, cb: (g: unknown, fresh: boolean) => void) => { cb(GROUPS, true); return GROUPS; },
    },
  } as never;
}

beforeEach(() => {
  store = {};
  listeners = [];
  sent.length = 0;
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: { get: async (k: string) => ({ [k]: store[k] }) },
      onChanged: { addListener: (l: never) => listeners.push(l), removeListener: (l: never) => { listeners = listeners.filter(x => x !== l); } },
    },
    runtime: { sendMessage: async (m: unknown) => { sent.push(m); } },
  };
  document.body.innerHTML = '<button id="menu">⋮</button>';
});
afterEach(() => { document.body.innerHTML = ''; });

const flush = () => new Promise(r => setTimeout(r, 0));
const pop = () => document.querySelector('b2c-grade-goal-popover') as HTMLElement | null;

describe('openGoalPopover', () => {
  it('opens a dialog under the anchor with the Goal box, and returns a closer', async () => {
    const anchor = document.getElementById('menu')!;
    const close = openGoalPopover(ctx(), '7', anchor);
    await flush();
    expect(pop()).not.toBeNull();
    expect(pop()!.getAttribute('role')).toBe('dialog');
    expect(pop()!.shadowRoot!.querySelector('h2')!.textContent).toBe('Goal');
    close();
    expect(pop()).toBeNull();
  });

  it('only one popover at a time', async () => {
    const a = document.getElementById('menu')!;
    openGoalPopover(ctx(), '7', a);
    openGoalPopover(ctx(), '7', a);
    expect(document.querySelectorAll('b2c-grade-goal-popover')).toHaveLength(1);
  });

  it('closes on Escape (focus back to the anchor) and on an outside click, not on an inside click', async () => {
    const a = document.getElementById('menu')!;
    openGoalPopover(ctx(), '7', a);
    await flush();
    pop()!.shadowRoot!.querySelector('h2')!.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(pop()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(pop()).toBeNull();
    openGoalPopover(ctx(), '7', a);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(pop()).toBeNull();
  });

  it('shows the answer for a stored goal and writes a new goal back to the setting', async () => {
    store['grade-goals.goals'] = { '7': { pct: 90 } };
    openGoalPopover(ctx(), '7', document.getElementById('menu')!);
    await flush(); await flush();
    const root = pop()!.shadowRoot!;
    expect(root.querySelector('.answer')!.textContent).toContain('You need an average of 100%');
    const input = root.querySelector('input[aria-label="Goal percent"]') as HTMLInputElement;
    input.value = '85';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(store['grade-goals.goals']).toEqual({ '7': { pct: 85 } });
  });

  it('the gear opens the Goal settings', async () => {
    openGoalPopover(ctx(), '7', document.getElementById('menu')!);
    await flush();
    (pop()!.shadowRoot!.querySelector('.gear') as HTMLElement).click();
    expect(sent).toEqual([{ type: 'b2c:open-settings', target: 'grade-goals' }]);
  });

  it('removes its listeners when closed', async () => {
    const close = openGoalPopover(ctx(), '7', document.getElementById('menu')!);
    expect(listeners).toHaveLength(1);
    close();
    expect(listeners).toHaveLength(0);
  });
});
