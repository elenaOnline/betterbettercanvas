// The Studio's sample page: a fictional student (Avery Student, the mock
// Canvas's persona) with neutral courses, items and grades. Nothing here is
// anyone's real data and nothing is fetched: the stage is a preview of tokens,
// not a render of Canvas. (Course ids are opaque keys.)

export const NOW = new Date(2026, 9, 19, 16, 12); // Mon Oct 19 2026, 4:12 PM
const D = (m: number, d: number, h = 23, mi = 59) => new Date(2026, m - 1, d, h, mi);
export const due = D;

export interface Course { id: string; name: string; short: string; code: string; credits: number | null; pct: number | null; unread: { ann: number; disc: number } }
export const PERSONA = 'Avery Student';
export const COURSES: readonly Course[] = [
  { id: 'bio', name: 'Introduction to Ecology 001 Fall 2026', short: 'BIO 140', code: 'BIO-140-001 Fall 2026', credits: 4, pct: 92.5, unread: { ann: 0, disc: 2 } },
  { id: 'math', name: 'Linear Algebra 002 Fall 2026', short: 'MATH 261', code: 'MATH-261-002 Fall 2026', credits: 4, pct: null, unread: { ann: 1, disc: 0 } },
  { id: 'hist', name: 'World History I 001 Fall 2026', short: 'HIST 101', code: 'HIST-101-001 Fall 2026', credits: null, pct: 87.73, unread: { ann: 0, disc: 0 } },
  { id: 'eng', name: 'Creative Writing Workshop 012 Fall 2026', short: 'ENG 205', code: 'ENG-205-012 Fall 2026', credits: 6, pct: 95.2, unread: { ann: 2, disc: 1 } },
];
export const course = (id: string) => COURSES.find(c => c.id === id)!;

export interface Item { id: string; cid: string; title: string; type: string; due: Date; pts: number }
export const ITEMS: readonly Item[] = ([
  ['a0', 'hist', 'Reading response 4', 'assignment', D(10, 16), 10],
  ['c1', 'bio', 'Field notes 4', 'assignment', D(10, 19), 50],
  ['a1', 'hist', 'Source analysis 2', 'assignment', D(10, 20), 20],
  ['m1', 'math', 'Homework 5', 'assignment', D(10, 21), 20],
  ['c7', 'bio', 'Pre-lab quiz 3', 'quiz', D(10, 21, 9, 0), 5],
  ['c2', 'bio', 'Lab 3 report', 'assignment', D(10, 22, 17, 0), 100],
  ['u1', 'eng', 'Workshop reflection 3', 'discussion', D(10, 22), 10],
  ['a2', 'hist', 'Discussion: trade routes', 'discussion', D(10, 22), 5],
  ['a3', 'hist', 'Quiz 3', 'quiz', D(10, 23, 13, 0), 20],
  ['m2', 'math', 'Quiz 2', 'quiz', D(10, 23, 17, 0), 20],
  ['u2', 'eng', 'Short story draft', 'assignment', D(10, 24), 15],
  ['m3', 'math', 'Proof-writing reflection', 'discussion', D(10, 25), 10],
  ['c3', 'bio', 'Reading quiz 6', 'quiz', D(10, 26, 9, 0), 10],
  ['a4', 'hist', 'Reading response 5', 'assignment', D(10, 27), 20],
  ['c4', 'bio', 'Field notes 5', 'assignment', D(10, 28), 50],
  ['m4', 'math', 'Homework 6', 'assignment', D(10, 28), 20],
  ['a5', 'hist', 'Midterm 1', 'quiz', D(10, 29, 10, 0), 100],
  ['u3', 'eng', 'Portfolio draft', 'assignment', D(10, 30), 30],
] as const).map(([id, cid, title, type, d, pts]) => ({ id, cid, title, type, due: d, pts }));

export const ANN = [
  { cid: 'math', title: 'Office hours moved to Thursday', when: '2h ago' },
  { cid: 'bio', title: 'Exam 1 room change', when: 'Yesterday' },
];
export const GRADED_441: readonly [string, number, number, string][] = [
  ['Reading response 1', 18, 20, 'Sep 29'], ['Map quiz', 9.5, 10, 'Oct 1'], ['Quiz 1', 16, 20, 'Oct 2'],
  ['Reading response 2', 17, 20, 'Oct 6'], ['Quiz 2', 17, 20, 'Oct 9'], ['Reading response 3', 19, 20, 'Oct 13'],
];

const svg = (s: string) => 'data:image/svg+xml,' + encodeURIComponent(s);
export const SAMPLE_IMG: Record<string, string> = {
  bio: svg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc7d9"/><stop offset="1" stop-color="#3d6e7d"/></linearGradient></defs><rect width="400" height="200" fill="url(#g)"/><path d="M0 140 Q60 120 120 138 T240 132 T400 128 V200 H0z" fill="#2c4f3a"/><path d="M0 160 Q80 150 160 165 T400 158 V200 H0z" fill="#5c8fa3" opacity=".8"/></svg>'),
  math: svg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#f3efe6"/><g stroke="#c9bfa8" stroke-width="1">' + Array.from({ length: 20 }, (_, i) => `<path d="M${i * 20} 0V200"/>`).join('') + Array.from({ length: 10 }, (_, i) => `<path d="M0 ${i * 20}H400"/>`).join('') + '</g><path d="M20 180 C120 180 140 40 380 30" stroke="#8b5e3c" stroke-width="3" fill="none"/></svg>'),
  hist: svg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#26323d"/><g stroke="#8fb3d9" stroke-width="2" fill="none" opacity=".7"><path d="M0 150 Q100 40 200 120 T400 60"/><path d="M0 170 Q100 60 200 140 T400 80"/><path d="M0 190 Q100 80 200 160 T400 100"/></g></svg>'),
};

/** The sample's course colours: from Canvas's own colour picker, in card order. */
export const CC_DEFAULT: Record<string, string> = { bio: '#009688', math: '#65499D', hist: '#1770AB', eng: '#D97900' };
/** The sample school's brand: Canvas's default branding, so "School colour" roles resolve to it. */
export const SCHOOL = { name: 'your school', light: { link: '#0374b5', accent: '#0374b5', nav: '#394b58' }, dark: { link: '#7dc8f3', accent: '#2b6fa8', nav: '#394b58' } } as const;

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export { WD, MO };
export const dayDiff = (a: Date, b: Date) => Math.round((+new Date(a.getFullYear(), a.getMonth(), a.getDate()) - +new Date(b.getFullYear(), b.getMonth(), b.getDate())) / 864e5);

export interface Clock { dates: string; clock: string }
export function fmtTime(d: Date, c: Clock): string {
  if (c.clock === '24') return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}
export function fmtDue(d: Date, c: Clock): string {
  const dd = dayDiff(d, NOW), t = fmtTime(d, c);
  if (c.dates === 'absolute') return `${MO[d.getMonth()]} ${d.getDate()} at ${t}`;
  if (dd === 0) return `Today at ${t}`;
  if (dd === 1) return `Tomorrow at ${t}`;
  if (dd === -1) return `Yesterday at ${t}`;
  if (dd > 1 && dd < 7) return `${WD[d.getDay()]} at ${t}`;
  return `${MO[d.getMonth()]} ${d.getDate()} at ${t}`;
}

/** A plain 4.0 scale with plus/minus in thirds, for the sample GPA. */
export const SAMPLE_SCALE: readonly [string, number, number][] = [
  ['A', 93, 4], ['A−', 90, 3.67], ['B+', 87, 3.33], ['B', 83, 3], ['B−', 80, 2.67], ['C+', 77, 2.33],
  ['C', 73, 2], ['C−', 70, 1.67], ['D+', 67, 1.33], ['D', 63, 1], ['D−', 60, 0.67], ['F', 0, 0],
];
export const letter = (pct: number) => SAMPLE_SCALE.find(l => pct >= l[1])!;
/** Old name, kept until studio.ts stops importing it. */
