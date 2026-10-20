# grade-goals: "what do I need on the rest to reach my goal?"

*Design, draft 1, 2026-10-19. In v1 (the owner: "grade goals is good"). It shares a
grade engine with `grade-impact` and `gpa-calculator`. Research: the engine
follows Canvas's own algorithm (pooled points when the course is unweighted;
group weights renormalised over groups with graded work; drop rules honoured).*

**Acceptance:**
- For any course with a current score, setting a goal shows the average she
  needs on the remaining graded work, or says plainly that the goal is out of
  reach, or already secured.
- The number matches a hand calculation from the grades page.

## Where it lives
1. **The course Grades page** (`/courses/:id/grades`). A "Goal" box at the top
   of Canvas's right column (`#student-grades-right-content`), above Canvas's
   own total. This is the primary home, where she's already thinking about the
   grade.
2. **The card grade chip** (`card-grades`) gets a 2 px progress tick under the
   number toward the goal, with the tooltip "Goal A− (90%): need 84% average on
   remaining work".
3. **On the dashboard,** setting a goal from the card's ⋯ menu ("Set grade
   goal…") opens the same box as a popover.

## The Goal box
```
Goal  [ A− ▾ ]  (90%)
You need an average of 84% on the remaining 140 points.
Remaining: Final exam (100), Problem set 9 (20), Problem set 10 (20)
                                            How is this computed?
```
- **Header:** "Goal" and a **⚙** (the surface gear → Settings → Grades), the
  same as the side-panel sections.
- **Goal picker:** the course's own letters, if it has a scheme, with their
  minimum %. Otherwise a % field.
- **The sentence is the answer,** in plain words, with one of four outcomes:
  - "You need an average of **84%** on the remaining **140 points**."
  - "**Already secured**: even zeros on the rest keep you at or above 90%."
  - "**Out of reach**: full marks on the rest gives 87.2%."
  - "**No remaining graded work** is posted yet." This is shown when nothing
    ungraded has points.
- **Remaining:** the ungraded, unsubmitted items with points that count toward
  the grade, listed with their points. Items that don't count are left out, and
  the status line says so ("2 items don't count toward the grade").
- **How is this computed?** shows the method: weighted or pooled, the group
  weights, drop rules applied, and the assumption that "remaining work = posted
  assignments that aren't graded yet; work the instructor hasn't posted isn't
  included."
- **Hypothetical** is marked as such: the box is labelled "Goal" (never "Grade"),
  uses a dashed left border, and never changes Canvas's own total or what-if
  fields.

## Grading periods
In a course with grading periods, the engine uses the **current period**,
the same as Canvas's default on the Grades page. The box says "Current grading
period (Fall weeks 1–10)" under the sentence. `grade-impact` uses the same
rule, and its tooltip names the period. If the period can't be determined, both
decline with "Grading periods: can't tell which applies", never silently
(Research parity gap #8).

## States
- No current score: "Set a goal once you have a graded assignment."
- The course hides totals: the box isn't drawn.
- Engine disagreement: if b²c's computed current score differs from Canvas's
  shown total by more than 0.05%, the box says "b²c's maths doesn't match
  Canvas's total for this course, so goals are off here," and the health view
  logs it. A wrong number is never shown.
