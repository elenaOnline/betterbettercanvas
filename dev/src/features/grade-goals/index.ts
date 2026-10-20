import { defineFeature } from '../../core/feature.ts';
import { bool, json } from '../../core/settings/schema.ts';
import { ANCHORS } from './anchors.ts';
import { isGoalMap, type GoalMap } from './model.ts';

export { ANCHORS } from './anchors.ts';

// Runtime (start) lives in run.ts, loaded only on the Grades page. The card
// menu's "Set grade goal…" popover (popover.ts) is runtime too: the cards lane
// imports it from there, not from this definition.
export default defineFeature({
  id: 'grade-goals',
  settings: {
    enabled: bool(true),
    /** Goal per course, keyed by Canvas course id. */
    goals: json({} as GoalMap, { check: isGoalMap }),
  },
  pages: ['course-grades'],
  anchors: ANCHORS,
});
