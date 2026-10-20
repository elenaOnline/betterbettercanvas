// Canvas hosts b²c runs on out of the box: every Instructure-hosted school.
// Schools on their own domain (e.g. canvas.example.edu) are granted at runtime by
// the user (optional host permission + registered content scripts; see
// features/sites). Nothing school-specific is hard-coded.
export const BUILT_IN_MATCHES = ['https://*.instructure.com/*'] as const;
export const isBuiltInHost = (hostname: string) => hostname === 'instructure.com' || hostname.endsWith('.instructure.com');
/** @deprecated use BUILT_IN_MATCHES (kept for the popup until the ui lane lands). */
export const CANVAS_MATCHES = BUILT_IN_MATCHES;

/**
 * New Quizzes hosts (quiz-lti / quiz-api / *.quiz.*instructure.com): quiz-safe
 * means nothing of b²c there, not even inert CSS. Mirrors QUIZ_FRAME_GLOBS in
 * build.mjs (the manifest's exclude_globs); keep the two in step.
 */
export const isQuizHost = (origin: string) => /quiz-lti|quiz-api/.test(origin) || /\.quiz\.[^/]*instructure\.com(?::\d+)?$/.test(origin);
