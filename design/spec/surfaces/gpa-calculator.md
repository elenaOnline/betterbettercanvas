# gpa-calculator: GPA section of the side panel

*Design, draft 1, 2026-10-19. The frame is `_dashboard.md` §5. Behaviour
reference is `research/features.md` G1 (the pilot school scale verified). Targets are from
`study/comparables.md` §5.*

**Acceptance:**
- Every figure says what it is (Term or Cumulative, projected or actual) and
  what it's computed from.
- The maths is auditable on demand.
- With the pilot school's scale, the figures are truncated to two decimals, exactly as the pilot school
  computes them.

## The section
```
GPA                                              [Edit]
Term GPA (projected)        3.66    from 12 credits
Cumulative GPA (projected)  3.51    from 76 credits
3 of 4 courses included · HST 201 needs credits
```
- **Two figures at most.** Term is always shown. Cumulative shows only when
  "Include previous terms" has values. Each figure is a label, the number
  (20/600, tabular), and its credit base. "(projected)" is always there,
  because current-term grades aren't final. It's Canvas's current score
  standing in for a final grade, and the label says so.
- A **status line** underneath says what's in and what isn't, in plain words.
  A course without credits is never guessed at (bc defaulted to 1). It's
  listed as needing credits, and clicking that opens Edit at that course.
- **"How is this computed?"** (a disclosure) shows the table: course, letter,
  points, credits, and quality points, then the sum ÷ credits = GPA. When the
  scale says so, it adds "Truncated to 2 decimals (the pilot school policy)".

## Edit (in place, inside the section; not a modal)
One row per current-term course:
```
MTH-252  Calculus II   A−  (Canvas)   3.67   [4] credits   [✓] include
CHEM-101   General Chemistry          B+  (from 88.1%) 3.33 [4] credits   [✓] include
```
- **Letter:** taken from Canvas when the course has a grading scheme, labelled
  "(Canvas)". Otherwise it's derived from the current % through the scale's
  fallback cutoffs, labelled "(from 88.1%)". She can override it with a menu of
  the scale's letters, labelled "(set by you)" with ↺.
- **Credits:** a required number field (0–12, step 0.5). It's remembered per
  course across terms.
- **Include:** a checkbox. Non-credit and concluded courses start excluded.
- **Weight** (Honors/AP) is hidden unless the scale enables weighting. That's off
  for the the pilot school scale, because colleges don't weight.
- Changes recompute live. "Done" collapses back.

## Grade scale presets (general product)
b²c is for any school, so the scale is a **preset menu** with no single default:
- **4.0, plus/minus in thirds:** A 4.00, A− 3.67, B+ 3.33 … D− 0.67. This is
  the pilot school's scale and the most common US college scale.
- **4.0, plus/minus in tenths:** A 4.0, A− 3.7, B+ 3.3 …
- **4.0 with A+ 4.33** (thirds)
- **4.0, no plus/minus**
- **High school 4.0, weighted** (Honors +0.5, AP/IB +1.0, set per course).
  This shows the per-course **Weight** column and a second figure, "Weighted
  GPA (projected)", next to the unweighted one (Research parity gap #2)
- **Custom:** the table editor

Each preset has a **Rounding** setting: Truncate or Round, to two decimals.
Truncate is the the pilot school default. For a known host the preset is suggested once,
e.g. "canvas.example.edu uses the thirds scale and truncates (the pilot school bulletin)",
from a small host→preset table Research maintains. Otherwise the first-run
default is "4.0, thirds; Round".

## Settings (Grades section)
Grade scale (preset menu + table editor), Rounding (Truncate · Round), Courses (credits and include, the same
data as Edit), Include previous terms (prior GPA and prior credits fields), and
"Show GPA above cards" (bc's "Move to top"), which moves the section from the
panel into a full-width strip above the grid.

## Not in v1
Weighted (high-school) scales as a default, saved scenarios, and per-term
history.
