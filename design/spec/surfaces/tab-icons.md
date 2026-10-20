# tab-icons

**Acceptance:** with several course tabs open, each tab's favicon is a solid course-coloured version of Canvas's icon, so tabs can be told apart at a glance.

- On any page under `/courses/:id`, the favicon is replaced with an SVG: Canvas's mark in white on a 16 px square (radius 2) of the course colour (Canvas's colour, so it matches the card).
- Pages outside a course keep the school's favicon.
- The icon is updated when the course colour changes (live).
