// mock-canvas: the context-modules jQuery's post-load work for a student
// (ui/shared/context-modules/jquery/index.jsx updateAssignmentData + updateProgressions,
// utils.jsx updateProgressionState/addIcon/criterionMessage). Data is embedded (see pages/modules.mjs).
(function () {
  var C = window.__mockC, CFG = C.cfg.modules
  if (!CFG) return

  function addIcon(container, cls, msg) {
    if (!container) return
    var i = document.createElement('i')
    i.setAttribute('data-tooltip', '')
    i.className = cls
    i.setAttribute('title', msg)
    i.setAttribute('aria-label', msg)
    container.replaceChildren(i)
  }
  function criterionMessage(li) {
    if (li.classList.contains('must_submit_requirement')) return 'Must submit the assignment'
    if (li.classList.contains('must_mark_done_requirement')) return 'Must mark as done'
    if (li.classList.contains('must_view_requirement')) return 'Must view the page'
    if (li.classList.contains('min_contribute_requirement')) return 'Must contribute to the page'
    if (li.classList.contains('min_score_requirement')) return 'Must score at least a ' + (li.querySelector('.min_score') || {}).textContent
    return 'Not yet completed'
  }

  function updateAssignmentData() {
    Object.keys(CFG.assignmentInfo).forEach(function (id) {
      var info = CFG.assignmentInfo[id]
      var li = document.getElementById('context_module_item_' + id)
      if (!li) return
      var due = li.querySelector('.due_date_display'), pts = li.querySelector('.points_possible_display')
      if (info.points_possible != null && pts) pts.innerHTML = info.points_possible + ' pts'
      if (info.due_date != null) {
        if (info.past_due != null) li.setAttribute('data-mock-past-due', 'true'), li.__pastDue = true
        if (due) due.textContent = C.dateStr(info.due_date)
      } else if (due) due.remove()
      if (info.points_possible === null && pts) pts.remove()
      var mc = li.querySelector('.mc_objectives')
      if (mc) mc.remove()
    })
  }

  function updateProgressions() {
    var list = document.getElementById('current_user_progression_list')
    CFG.progressions.forEach(function (d) {
      var p = d.context_module_progression
      var mod = document.getElementById('context_module_' + p.context_module_id)
      if (!mod) return
      if (list) {
        var blank = list.querySelector('.progression_blank')
        var row = blank.cloneNode(true)
        row.classList.remove('progression_blank')
        row.classList.add('progression_' + p.context_module_id)
        row.querySelector('.context_module_id').textContent = p.context_module_id
        row.querySelector('.workflow_state').textContent = p.workflow_state
        row.querySelector('.collapsed').textContent = String(p.collapsed)
        list.appendChild(row)
      }
      var state = p.workflow_state
      mod.classList.add(state)
      var vis = mod.querySelector('.completion_status i.' + ({completed: 'complete_icon', started: 'in_progress_icon', locked: 'locked_icon'}[state] || 'none'))
      if (vis && state !== 'locked' && state !== 'unlocked') vis.setAttribute('title', state === 'completed' ? 'Completed' : 'Started')
      if (state === 'completed' && !mod.querySelector('.progression_requirement')) state = ''
      mod.querySelectorAll('.context_module_item').forEach(function (li) {
        var icon = li.querySelector('.module-item-status-icon')
        var id = +li.querySelector('.module_item_icons .id').textContent
        var done = p.requirements_met.some(function (r) { return r.id === id && li.classList.contains(r.type + '_requirement') })
        if (done) { li.classList.add('completed_item'); addIcon(icon, 'icon-check', 'Completed'); return }
        if (state === 'completed') { if (li.classList.contains('progression_requirement')) addIcon(icon, 'no-icon', 'Not completed'); return }
        if (li.__pastDue) { addIcon(icon, 'icon-minimize', 'This assignment is overdue'); return }
        var inc = p.incomplete_requirements.filter(function (r) { return r.id === id })[0]
        if (inc) {
          if (inc.score != null) addIcon(icon, 'icon-minimize', 'You scored a ' + inc.score + '. ' + criterionMessage(li) + '.')
          else addIcon(icon, 'icon-info', 'Your submission has not been graded yet')
        } else if (li.classList.contains('progression_requirement')) {
          addIcon(icon, 'icon-mark-as-read', criterionMessage(li))
        }
      })
    })
  }

  // collapse/expand (utils.jsx toggleModuleCollapse; persisted via POST .../collapse in Canvas)
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.collapse_module_link, .expand_module_link, #expand_collapse_all')
    if (!t) return
    e.preventDefault()
    if (t.id === 'expand_collapse_all') {
      var collapse = t.getAttribute('data-expand') !== 'true'
      document.querySelectorAll('#context_modules .context_module').forEach(function (m) { setCollapsed(m, collapse) })
      t.setAttribute('data-expand', collapse ? 'true' : 'false')
      t.setAttribute('aria-expanded', collapse ? 'false' : 'true')
      t.textContent = collapse ? 'Expand All' : 'Collapse All'
      t.setAttribute('aria-label', collapse ? 'Expand All Modules' : 'Collapse All Modules')
      return
    }
    var mod = t.closest('.context_module')
    setCollapsed(mod, t.classList.contains('collapse_module_link'))
  })
  function setCollapsed(mod, collapsed) {
    mod.classList.toggle('collapsed_module', collapsed)
    var content = mod.querySelector('.content')
    if (content) content.style.display = collapsed ? 'none' : ''
  }

  window.__mockLater(function () {
    updateAssignmentData()
    updateProgressions()
  })
})()
