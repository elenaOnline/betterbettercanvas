# first-run

*Decided with direction A, 2026-10-19. Reference: `explore/a-canvas-edited/`
(Prototype strip → "First run").*

**Acceptance:** a new student goes from install to b²c working on their
school's Canvas with one decision (where their Canvas is) and one browser
prompt. Nothing to read beyond a sentence.

- **Install** opens the settings page with one block above everything:
  **Where is your school's Canvas?** [canvas.yourschool.edu] [Allow access]
  - The field accepts any URL or bare host and normalises it to an origin.
    Paste from the address bar works.
  - Addresses on `*.instructure.com` are built in: the block says "You're
    set: b²c works on *.instructure.com" and offers the field only for a
    custom domain.
  - Allow access triggers Chrome's own host-permission prompt. On grant, the
    block says "b²c is on for canvas.example.edu. Your open Canvas tabs already
    changed." On deny: "Permission not granted · Try again".
  - Suggested defaults follow the host where Research has a source (for
    example the GPA scale, `research/school-scales.md`). Each is said once in
    the block ("canvas.example.edu uses the thirds GPA scale").
- **Second step, once a host is granted: "What b²c can do."** One short
  screen with the headline features, each as a row with a one-line description
  and a switch at its default. It sits in the same block on the settings page:
  - Dark mode (Off · On · Match system)
  - Assignments on cards
  - Grades on cards
  - Improved to-do list
  - GPA calculator
  - Grade goals

  A single **Done** collapses the block. Everything else stays in the settings
  page below. This step carries discovery for A, so features that are off are
  seen once without a tour.
- **The other door:** on a Canvas tab whose host isn't granted, the toolbar
  button is grey with a dot. The popup opens to one card, "Use b²c on
  canvas.yourschool.edu" [Allow], which leads to the same prompt.
- **The first popup open** shows one line above the controls, never again:
  "Everything here applies instantly. All settings… has the rest."
- No tour, no welcome page, no changelog popup, no confetti.
