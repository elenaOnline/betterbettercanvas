// Modules: GET /courses/:id/modules
// app/views/context_modules/index.html.erb -> _content_next.html.erb -> _context_module_next.html.erb
// -> _module_item_next.html.erb, rendered for a student (@can_view/@can_edit false, @is_student true).
// Server-rendered ERB; then ui/shared/context-modules/jquery (index.jsx updateAssignmentData /
// updateProgressions, utils.jsx updateProgressionState) fills due dates, points, the per-item
// status icons and the module progression classes. Those two requests go to non-API endpoints
// (/courses/:id/modules/items/assignment_info and /courses/:id/modules/progressions) that the mock's
// router does not serve to page modules, so their JSON is embedded and applied after mock_delay
// (approximation of transport only; the resulting DOM follows the jQuery code).
// The newer React "modules rewrite" student view is not used (feature flag off at the pilot school per the
// 2026-10-19 live capture: course home modules are legacy `.context_module` / `.ig-row`).
import {esc} from '../lib/html.mjs'
import {nickname} from '../data/state.mjs'
import {iso} from '../lib/time.mjs'
import {courseCrumbs, courseScripts, courseEnv, lookupCourse, notFoundPage} from './course_home.mjs'

// ContentTag#content_type_class / Context.translated_content_type
const TYPE = {
  Assignment: {cls: 'assignment', ct: 'Assignment', label: 'Assignment', underscore: 'assignment'},
  Quiz: {cls: 'quiz', ct: 'Quizzes::Quiz', label: 'Quiz', underscore: 'quizzes/quiz'},
  Discussion: {cls: 'discussion_topic', ct: 'DiscussionTopic', label: 'Discussion Topic', underscore: 'discussion_topic'},
  Page: {cls: 'wiki_page', ct: 'WikiPage', label: 'Page', underscore: 'wiki_page'},
  ExternalUrl: {cls: 'external_url', ct: 'ExternalUrl', label: 'External Url', underscore: 'external_url'},
  File: {cls: 'attachment', ct: 'Attachment', label: 'File', underscore: 'attachment'},
  SubHeader: {cls: 'context_module_sub_header', ct: 'ContextModuleSubHeader', label: 'Context Module Sub Header', underscore: 'context_module_sub_header'},
}

export function moduleItems(c, mod) {
  return mod.items.map((it, i) => {
    const t = TYPE[it.type] || TYPE.Assignment
    const id = it.id || String(+mod.id * 100 + i + 1)
    const a = it.assignment || null
    const contentId = a ? (it.type === 'Quiz' ? a.quiz_id : it.type === 'Discussion' ? a.discussion_topic_id || a.id : a.id) : it.type === 'Page' ? String(+c.id * 10 + 7) : it.type === 'File' ? it.file_id : '0'
    return {...it, id, t, a, contentId, position: i + 1, graded: !!a}
  })
}

function itemHtml(c, mod, item) {
  const {t, a} = item
  const criterion = item.req ? {id: item.id, type: item.req} : null
  const sub = t.cls === 'context_module_sub_header'
  const href = `/courses/${c.id}/modules/items/${item.id}`
  const title = esc(item.title)
  const cls = [
    'context_module_item',
    'student-view',
    a && t.cls === 'assignment' ? 'show_assignment_menu' : '',
    t.cls,
    item.graded ? 'also_assignment' : '',
    'indent_0',
    criterion ? 'progression_requirement' : '',
    `${criterion ? criterion.type : ''}_requirement`,
    `${t.underscore}_${item.contentId}`,
  ].filter(Boolean)
  const linkPart = sub
    ? ''
    : item.type === 'ExternalUrl'
      ? `            <a
              title="${title}"
              class="title external_url_link"
              target="_blank"
              href="${esc(item.external_url)}"
              data-item-href="/courses/${c.id}/modules/items/${item.id}"
            >
              ${title}
            </a>`
      : `            <a
              title="${title}"
              class="ig-title title item_link"
              href="${href}"
              aria-describedby="module-item-${item.id}-details"
            >
              ${title}
            </a>`
  return `<li
  id="context_module_item_${item.id}"
  style=""
  class="
    ${cls.join('\n    ')}
  "
>
  <div class="ig-row ${criterion ? 'with-completion-requirements' : ''} ig-published student-view no-estimated-duration">

    <span class="type_icon" title="${t.label}" role="none">
      <span class="screenreader-only">${t.label}</span>
      <span class="ig-type-icon" aria-hidden="true">
        <i class="icon-document"></i>
        <i class="icon-paperclip"></i>
        <i class="icon-discussion"></i>
        <i class="icon-assignment"></i>
        <i class="icon-quiz"></i>
        <i class="icon-quiz icon-Solid"></i>
        <i class="icon-link"></i>
        <img id="mc_icon" loading="lazy" src="/images/icons/mc-assignment-pub-v2.svg"
            alt="Mastery Connect" style="display: none; width: 1rem; height: 1rem;"/>
      </span>
    </span>

    <div class="ig-info">

      <${sub ? 'h3' : 'div'} class="module-item-title">
        <span class="item_name">
${linkPart}

          <span title="${title}" class="title locked_title">${title}</span>
          <span class="points_possible" style="display: none;">${a ? a.points_possible : '&nbsp;'}</span>
          <span class="requirement" style="display: none;">&nbsp;</span>
          <span class="completion_requirement" style="display: none;">&nbsp;</span>
          <span class="position" style="display: none;">${item.position}</span>
          <span class="url" style="display: none;"></span>
          <span class="new_tab" style="display: none;"></span>
          <span class="estimated_duration_minutes" style="display: none;"></span>
          <span class="can_set_estimated_duration" style="display: none;"></span>
        </span>
      </div>

      <div class="module_item_icons nobr">
        <!-- dead code? -->
        <span class="criterion ${criterion ? 'defined' : ''}">
          <span class="min_score" style="display: none;">&nbsp;</span>
          <span class="min_percentage" style="display: none;">&nbsp;</span>
          <span class="criterion_type" style="display: none;">${criterion ? criterion.type : '&nbsp;'}</span>
        </span>
        <!-- /dead code -->
        <span class="type" style="display: none;">${t.cls}</span>
        <span class="id" style="display: none;">${item.id}</span>
        <span class="graded" style="display: none;">${item.graded ? '1' : '0'}</span>
      </div>

      <div id="module-item-${item.id}-details" class="ig-details">
          <div id="module-item-${item.id}-due-date" class="due_date_display ig-details__item"></div>
${item.graded ? `            <div id="module-item-${item.id}-points" class="points_possible_display ig-details__item"></div>\n` : ''}        <div id="module-item-${item.id}-requirement" class="requirement-description ig-details__item">
          <span class="completion_requirement">
            <span class="requirement_type min_score_requirement">
              <span class="unfulfilled">
                Score at least <span class="min_score">&nbsp;</span>
                <span class="screenreader-only">Must score at least <span class="min_score">&nbsp;</span> to complete this module item</span>
              </span>
              <span class="fulfilled">
                Scored at least <span class="min_score">&nbsp;</span>
                <span class="screenreader-only">Module item has been completed by scoring at least <span class="min_score">&nbsp;</span></span>
              </span>
            </span>
            <span class="requirement_type must_view_requirement">
              <span class="unfulfilled">
                View
                <span class="screenreader-only">Must view in order to complete this module item</span>
              </span>
              <span class="fulfilled">
                Viewed
                <span class="screenreader-only">Module item has been viewed and is complete</span>
              </span>
            </span>
            <span class="requirement_type must_mark_done_requirement">
              <span class="unfulfilled">
                Mark done
                <span class="screenreader-only">Must mark this module item done in order to complete</span>
              </span>
              <span class="fulfilled">
                Marked done
                <span class="screenreader-only">Module item marked as done and is complete</span>
              </span>
            </span>
            <span class="requirement_type must_contribute_requirement">
              <span class="unfulfilled">
                Contribute
                <span class="screenreader-only">Must contribute to this module item to complete it</span>
              </span>
              <span class="fulfilled">
                Contributed
                <span class="screenreader-only">Contributed to this module item and is complete</span>
              </span>
            </span>
            <span class="requirement_type must_submit_requirement">
              <span class="unfulfilled">
                Submit
                <span class="screenreader-only">Must submit this module item to complete it</span>
              </span>
              <span class="fulfilled">
                Submitted
                <span class="screenreader-only">Module item submitted and is complete</span>
              </span>
            </span>
          </span>
        </div> <!-- requirement description end -->
        <div class="estimated_duration_display ig-details__item"></div>
        <div class="mc_objectives ig-details__item"></div>
      </div>
      </${sub ? 'h3' : 'div'}>
      <div class="module-item-status-icon"></div>
  </div>
</li>
`
}

function moduleHtml(c, mod) {
  const items = moduleItems(c, mod)
  const hasReq = items.some(i => i.req)
  const name = esc(mod.name)
  return `<div
  class="item-group-condensed context_module
    ${hasReq ? 'has_requirements' : ''}
    "
    aria-label="${name}"
    data-workflow-state="active"
    data-module-url="/courses/${c.id}/modules/${mod.id}"
    data-module-id="${mod.id}"
    id="context_module_${mod.id}"
    style=""
>
  <a id="module_${mod.id}"></a>
  <div class="ig-header header" id="${mod.id}">
    <span
      class="sortable-handle reorder_module_link"
      title="Drag to reorder modules"
      style="display: none;"
    >
      <i aria-hidden="true" class="icon-drag-handle"></i>
    </span>
    <h2 class='screenreader-only'>${name}</h2>
    <span
      role="button"
      tabindex="0"
      href="/courses/${c.id}/modules/${mod.id}/collapse"
      class="ig-header-title collapse_module_link ellipsis"
      aria-controls="context_module_content_${mod.id}"
      aria-expanded="true"
      aria-label="${name} toggle module visibility"
      title="${name}"
    >
      <i class="icon-mini-arrow-down"></i>
      <span class="name">${name}</span>
    </span>
    <span
      role="button"
      tabindex="0"
      href="/courses/${c.id}/modules/${mod.id}/collapse"
      class="ig-header-title expand_module_link ellipsis"
      aria-controls="context_module_content_${mod.id}"
      aria-expanded="false"
      aria-label="${name} toggle module visibility"
      title="${name}"
    >
      <i class="icon-mini-arrow-right"></i>
      <span class="name ellipsis">${name}</span>
    </span>
    <div class="prerequisites">
    </div>
    <div class="module_header_items">
      <div class="ig-header-admin">

        <div class="requirements_message" data-requirement-type="all">
${hasReq ? `            <ul class="pill">
              <li aria-label="Complete All Items" data-requirement-count="">
                Complete All Items
              </li>
            </ul>
` : ''}        </div>

            <div class="completion_status">
              <i class="icon-check complete_icon"
                data-tooltip
                title="Completed"
              >
                <span class="screenreader-only">Module Completed</span>
              </i>
              <i class="icon-minimize in_progress_icon"
                data-tooltip
                title="In Progress"
              >
                <span class="screenreader-only">Module In Progress</span>
              </i>
              <i class="icon-lock locked_icon"
                data-tooltip
                title="Locked"
              >
                <span class="screenreader-only">Module Locked</span>
              </i>
            </div>

        <span style="display: none;">
          <span class="name">${name}</span>
          <span class="id">${mod.id}</span>
          <span class="publish_final_grade">&nbsp;</span>
          <span class="require_sequential_progress">${mod.require_sequential_progress ? 'true' : ''}</span>
        </span>
      </div>
    </div>
  </div>

  <div class="content" id="context_module_content_${mod.id}">
      <ul class="ig-list items context_module_items ">
${items.map(i => itemHtml(c, mod, i)).join('')}
      </ul>

    <div class="footer">
      <div class="progression_container">
        <a href="#" class="progression_details_link" title="See Student Progress for this Module" style="display: none;">
          <span class="progression_started"><span class="progression_started_count">0</span> In Progress</span> <span class="progression_complete"><span class="progression_complete_count">0</span> Complete</span>
        </a>
        <div class="unlock_details" style="display: none;">
          <div class="unlock_at" style="display: none;"></div>
          Will unlock <span class="displayed_unlock_at">&nbsp;</span>
        </div>
      </div><!-- progression_container -->
    </div><!-- footer -->
  </div>
</div>
`
}

/** context_modules/_content_next.html.erb for a student */
export function modulesContent(S, c, {courseHome = false} = {}) {
  const heading = courseHome
    ? `  <div class="screenreader-only">${esc(c.name)}</div>
  <h2 class="context-modules-title screenreader-only">Course Modules</h2>`
    : `  <h1 class="context-modules-title screenreader-only">Course Modules</h1>`
  return `
${heading}

<div class="header-bar">
  <div class="header-bar-right header-bar__module-layout">
    <div class="header-bar-right__buttons">
      <button class="btn" id="expand_collapse_all" aria-expanded="true" data-expand="false" data-url="/courses/${c.id}/collapse_all_modules" aria-label="Collapse All Modules">Collapse All</button>
    </div>
  </div>
</div>

<div id="external-tool-mount-point"></div>
<div id="direct-share-mount-point"></div>
<div id="differentiated-modules-mount-point"></div>
<div id="vdd_tooltip_mount"></div>
<div class="item-group-container" id="context_modules_sortable_container">
  <div class="module-selector-container">
  </div>

  <div id="no_context_modules_message" style="display:none;">
      <p>No modules have been defined for this course.</p>
  </div>
  <div
    id="context_modules"
    aria-label="Course Modules"
    class="ig-list "
  >
${c.modules.map(m => moduleHtml(c, m)).join('')}
  </div>

</div>

<div style="display: none;">
  <a href="/courses/${c.id}/modules/progressions" class="progression_list_url">&nbsp;</a>
  <select id="module_list" aria-label="Select prerequisite module">
    <option value="">[ Select Module ]</option>
${c.modules.map(m => `      <option value="${m.id}" class="context_module_option context_module_${m.id}">${esc(m.name)}</option>`).join('\n')}
  </select>
</div>
<div id="current_user_progression_list" class="user_${S.user.id}" style="display: none;">
  <div class="progression progression_blank">
    <div class="context_module_id">&nbsp;</div>
    <div class="workflow_state">&nbsp;</div>
    <div class="requirements_met">&nbsp;</div>
    <div class="current_position">&nbsp;</div>
    <div class="collapsed">&nbsp;</div>
  </div>
</div>
`
}

/** data the context-modules jQuery would fetch, embedded (see header) */
export function modulesClientData(S, c) {
  const info = {}
  const progressions = []
  for (const mod of c.modules) {
    const items = moduleItems(c, mod)
    const met = [], incomplete = []
    for (const it of items) {
      if (it.a) {
        const s = c.submissions.get(it.a.id)
        const submitted = !!s?.submitted_at || s?.excused || (s?.workflow_state === 'graded' && s.score != null && !s.missing)
        info[it.id] = {
          points_possible: it.a.points_possible,
          due_date: iso(it.a.due_at),
          ...(it.a.due_at && it.a.due_at < S.now && !submitted ? {past_due: 'true'} : {}),
        }
      } else {
        info[it.id] = {points_possible: null, due_date: null}
      }
      if (it.req) {
        if (it.completed) met.push({id: +it.id, type: it.req})
        else if (it.a && c.submissions.get(it.a.id)?.submitted_at) incomplete.push({id: +it.id, type: it.req, score: null})
      }
    }
    const allMet = items.filter(i => i.req).every(i => i.completed)
    const state = items.some(i => i.req) ? (allMet ? 'completed' : met.length ? 'started' : 'unlocked') : mod.state
    progressions.push({context_module_progression: {id: +mod.id + 9000, context_module_id: +mod.id, user_id: +S.user.id, requirements_met: met, incomplete_requirements: incomplete, workflow_state: state, completed_at: state === 'completed' ? iso(S.now) : null, current_position: null, collapsed: false}})
  }
  return {
    env: {
      COLLAPSED_MODULES: [], IS_STUDENT: true, COURSE_ID: c.id, NO_MODULE_PROGRESSIONS: false, FEATURE_MODULES_PERF: false, EXPANDED_MODULES: [],
      CONTEXT_MODULE_ASSIGNMENT_INFO_URL: `/courses/${c.id}/modules/items/assignment_info`,
    },
    cfg: {assignmentInfo: info, progressions},
  }
}

export default function render(S, ctx, params) {
  const c = lookupCourse(S, params)
  if (!c) return notFoundPage(S, 'course')
  const data = modulesClientData(S, c)
  return {
    title: `Course Modules: ${nickname(S, c)}`,
    content: modulesContent(S, c, {courseHome: false}),
    rightSide: '', // provide_blank :right_side
    course: c,
    activeTab: 'modules',
    crumbs: courseCrumbs(S, c, [['Modules', `/courses/${c.id}/modules`]]),
    cssBundles: ['context_modules2'],
    env: courseEnv(S, c, data.env),
    scripts: courseScripts(S, c, {modules: data.cfg}, 'modules'),
  }
}
