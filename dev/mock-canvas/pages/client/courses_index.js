// mock-canvas: /courses star toggles, after ui/features/course_list/index.jsx.
// Production calls success(target) immediately (it passes the result, not a callback, to
// $.ajaxJSON), so the star flips before the request returns. Reproduced here.
(function () {
  function success(target) {
    var name = target.dataset.courseName
    var favTip = 'Click to remove ' + name + ' from the courses menu.'
    var nonFavTip = 'Click to add ' + name + ' to the courses menu.'
    var notFavTip = name + ' cannot be added to the courses menu unless the course is active.'
    var sr = target.querySelector(':scope > .screenreader-only')
    var icon = target.querySelector(':scope > .course-list-favorite-icon')
    if (target.classList.contains('course-list-favorite-course')) {
      target.classList.remove('course-list-favorite-course')
      if (target.classList.contains('course-list-not-favoritable')) {
        target.removeAttribute('data-favorite-url')
        target.setAttribute('title', notFavTip)
        if (sr) sr.textContent = notFavTip
        target.style.display = 'none'
        return
      }
      target.setAttribute('title', nonFavTip)
      if (sr) sr.textContent = nonFavTip
    } else {
      target.classList.add('course-list-favorite-course')
      target.setAttribute('title', favTip)
      if (sr) sr.textContent = favTip
    }
    if (icon) { icon.classList.toggle('icon-star'); icon.classList.toggle('icon-star-light') }
  }

  function onActivate(event) {
    var target = event.currentTarget
    if (!target.hasAttribute('data-favorite-url')) return
    event.preventDefault()
    var url = target.getAttribute('data-favorite-url')
    try { url = new URL(url, location.href).pathname } catch (e) {}
    var method = target.classList.contains('course-list-favorite-course') ? 'DELETE' : 'POST'
    success(target)
    window.__mockApi(url, {method: method, headers: {'Content-Type': 'application/json'}, body: '{}'})
  }

  document.querySelectorAll('[data-favorite-url]').forEach(function (el) {
    el.addEventListener('click', onActivate)
    // jQuery "keyclick": Enter/Space on a role=button element
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') onActivate(e)
    })
  })
})()
