import { afterEach, describe, expect, it } from 'vitest';
import { actionAttr, anchorAttrs, marksReadFor, regionAttr, setAttrs, clearAttrs } from '../../src/core/agent/anchors.ts';
import { anchorCanvas, collectOnPage, idFromPath, moduleContentId } from '../../src/core/agent/canvas-anchors.ts';
import { createDom } from '../../src/core/dom.ts';
import type { DueOut } from '../../src/core/agent/model.ts';

const due = (id: string, o: Partial<DueOut> = {}): DueOut => ({
  id, courseId: 'course:118200', title: id, type: id.split(':')[0]!, due: '2026-10-24T23:59:00-07:00', posted: null, points: 10,
  state: 'upcoming', doneInB2c: false, url: `${location.origin}/courses/118200/assignments/${id.split(':')[1]}`, marksRead: false, ...o,
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('agent anchors: helpers for b²c widgets', () => {
  it('anchorAttrs', () => {
    expect(anchorAttrs({ id: 'assignment:1', courseId: '118200', due: '2026-10-24T23:59:00-07:00', state: 'late' })).toEqual({
      'data-b2c-id': 'assignment:1', 'data-b2c-course-id': 'course:118200', 'data-b2c-due': '2026-10-24T23:59:00-07:00', 'data-b2c-state': 'late',
    });
    expect(anchorAttrs({ id: 'course:5', courseId: 'course:5', due: null, state: 'weird', marksRead: true })).toEqual({
      'data-b2c-id': 'course:5', 'data-b2c-course-id': 'course:5', 'data-b2c-marks-read': 'true',
    });
    expect(actionAttr('mark-done')).toEqual({ 'data-b2c-action': 'mark-done' });
    expect(regionAttr('todo')).toEqual({ 'data-b2c-region': 'todo' });
  });

  it('marksReadFor: the describe rule for b²c rows', () => {
    expect(marksReadFor(null)).toBe(false);
    expect(marksReadFor('/courses/1/assignments/2')).toBe(false);
    expect(marksReadFor('/courses/1/assignments/2', { mustView: true })).toBe(true);
    expect(marksReadFor('https://x.instructure.com/courses/1/discussion_topics/3')).toBe(true);
    expect(marksReadFor('/courses/1/discussion_topics/3', { unread: true })).toBe(true);
    expect(marksReadFor('/courses/1/discussion_topics/3', { unread: false })).toBe(false);
    expect(marksReadFor('/courses/1/announcements/3', { unread: null })).toBe(true);
  });

  it('setAttrs / clearAttrs', () => {
    const el = document.createElement('li');
    setAttrs(el, { ...anchorAttrs({ id: 'quiz:3' }), ...actionAttr('dismiss') });
    expect(el.getAttribute('data-b2c-id')).toBe('quiz:3');
    clearAttrs(el);
    expect(el.attributes.length).toBe(0);
  });
});

describe('agent anchors: Canvas elements', () => {
  it('idFromPath / moduleContentId', () => {
    expect(idFromPath('/courses/1/assignments/2')).toBe('assignment:2');
    expect(idFromPath('/courses/1/quizzes/5002')).toBe('quiz:5002');
    expect(idFromPath('/courses/1/discussion_topics/9')).toBe('discussion_topic:9');
    expect(idFromPath('/courses/1/assignments')).toBeNull();
    expect(moduleContentId(['context_module_item', 'also_assignment', 'min_score_requirement', 'assignment_11820001'])).toBe('assignment:11820001');
    expect(moduleContentId(['quiz', 'quizzes/quiz_123'])).toBe('quiz:123');
    expect(moduleContentId(['attachment_44'])).toBe('file:44');
    expect(moduleContentId(['external_url_0', 'context_module_sub_header_5'])).toBeNull();
  });

  it('stamps cards, assignment rows, module items, calendar events, to-do rows and marks-read links; stop removes all', () => {
    document.body.innerHTML = `
      <div class="ic-DashboardCard" id="card"><a class="ic-DashboardCard__link" href="/courses/118200">MTH</a>
        <a id="grades" href="/courses/118200/grades">Grades</a></div>
      <div id="assignment_1" class="ig-row" data-item-id="1"><a class="ig-title" href="/courses/118200/assignments/1">A1</a></div>
      <div id="assignment_2" class="ig-row" data-item-id="2"><a class="ig-title" href="/courses/118200/quizzes/5002">Q</a></div>
      <li id="context_module_item_900" class="context_module_item assignment assignment_1"><div class="ig-row"><a id="mi" class="item_link" href="/courses/118200/modules/items/900">A1</a></div></li>
      <a id="ev" class="fc-event group_course_118200" title="assignment:1">x</a>
      <a id="ev2" class="fc-event group_course_118200" title="nobody">x</a>
      <div class="ToDoSidebarItem" id="todo"><a href="/courses/118200/assignments/1">A1</a></div>
      <a id="ann" href="/courses/118200/announcements/3">ann</a><a id="plain" href="/courses/118200/assignments">list</a>`;
    const dom = createDom();
    const stop = anchorCanvas(dom, {
      origin: location.origin,
      page: { kind: 'assignments', courseId: '118200' },
      due: [due('assignment:1', { state: 'overdue' }), due('quiz:5002', { due: null })],
    });
    const $ = (s: string) => document.querySelector(s)!;
    expect($('#card').getAttribute('data-b2c-id')).toBe('course:118200');
    expect($('#card').getAttribute('data-b2c-course-id')).toBe('course:118200');
    expect($('#assignment_1').getAttribute('data-b2c-state')).toBe('overdue');
    expect($('#assignment_1').getAttribute('data-b2c-due')).toBe('2026-10-24T23:59:00-07:00');
    expect($('#assignment_2').getAttribute('data-b2c-id')).toBe('quiz:5002');
    expect($('#assignment_2').hasAttribute('data-b2c-due')).toBe(false);
    expect($('#context_module_item_900').getAttribute('data-b2c-id')).toBe('module_item:900');
    expect($('#context_module_item_900 > .ig-row').getAttribute('data-b2c-id')).toBe('assignment:1');
    expect($('#ev').getAttribute('data-b2c-id')).toBe('assignment:1');
    expect($('#ev2').hasAttribute('data-b2c-id')).toBe(false);
    expect($('#todo').getAttribute('data-b2c-id')).toBe('assignment:1');
    for (const s of ['#grades', '#mi', '#ann']) expect($(s).getAttribute('data-b2c-marks-read'), s).toBe('true');
    expect($('#plain').hasAttribute('data-b2c-marks-read')).toBe(false);

    stop();
    expect(document.querySelectorAll('[data-b2c-id],[data-b2c-marks-read],[data-b2c-state],[data-b2c-due],[data-b2c-course-id]').length).toBe(0);
    dom.stopAll();
  });

  it('marks-read links follow §2 marksRead: open must-view flags an assignment link; a known-read announcement is not flagged', () => {
    document.body.innerHTML = `<a id="mv" href="/courses/118200/assignments/11820003">A3</a><a id="ok" href="/courses/118200/assignments/11820004">A4</a>
      <a id="read" href="/courses/118200/announcements/5">read</a><a id="unread" href="/courses/118200/announcements/6">new</a><a id="g" href="/courses/118200/grades">g</a>`;
    const dom = createDom();
    const stop = anchorCanvas(dom, {
      origin: location.origin, page: { kind: 'course-home', courseId: '118200' }, due: [],
      facts: { mustView: new Set(['/courses/118200/assignments/11820003']), unread: new Map([['/courses/118200/announcements/5', false]]) },
    });
    const flagged = [...document.querySelectorAll('[data-b2c-marks-read="true"]')].map(e => e.id);
    expect(flagged).toEqual(['mv', 'unread', 'g']);
    stop();
    dom.stopAll();
  });

  it('collectOnPage finds ids in the document and in region shadow roots', () => {
    document.body.innerHTML = '<div data-b2c-id="course:1"></div><div data-b2c-id="course:1"></div>';
    const host = document.createElement('b2c-todo');
    setAttrs(host, regionAttr('todo'));
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<li data-b2c-id="assignment:&quot;x"></li>';
    document.body.appendChild(host);
    expect(collectOnPage()).toEqual([
      { id: 'course:1', selector: '[data-b2c-id="course:1"]', shadowHost: null },
      { id: 'assignment:"x', selector: '[data-b2c-id="assignment:\\"x"]', shadowHost: 'b2c-todo' },
    ]);
  });
});
