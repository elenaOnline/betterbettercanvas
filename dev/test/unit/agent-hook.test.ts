import { describe, expect, it } from 'vitest';
import { agentMirror, AGENT_ATTR } from '../../src/core/agent/hook.ts';
import { schema } from '../../src/core/registry.ts';
import { forPath, mergeParts } from '../../src/core/mirror.ts';
import { QUIZ_TAKING } from '../../src/core/canvas/page.ts';

describe('agent hook: §1 pre-paint attribute', () => {
  it('core.agentContract is a bool, default on', () => {
    expect(schema['core.agentContract']).toMatchObject({ kind: 'bool', default: true });
  });

  it('sets data-b2c-agent="1" while on, nothing while off', () => {
    expect(agentMirror({ 'core.agentContract': true })).toEqual({ attrs: { [AGENT_ATTR]: '1' } });
    expect(agentMirror({ 'core.agentContract': false })).toEqual({});
  });

  it('never applies on quiz-taking routes (the quiz subset never carries it)', () => {
    const m = mergeParts([agentMirror({ 'core.agentContract': true })], []);
    const isQuiz = (p: string) => QUIZ_TAKING.test(p);
    expect(forPath(m, '/courses/1/assignments', isQuiz).attrs[AGENT_ATTR]).toBe('1');
    expect(forPath(m, '/courses/1/quizzes/2/take', isQuiz).attrs[AGENT_ATTR]).toBeUndefined();
  });
});
