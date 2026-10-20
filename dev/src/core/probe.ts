// The popup's "Copy report": structural facts about the current Canvas page,
// so production DOM drift the mock can't catch shows up in the owner's hands-on
// pass. Selectors and flags only. Never page text, names, or ids beyond kind.

import type { AnyFeature } from './feature.ts';
import type { Page } from './canvas/page.ts';
import { ENV_ATTR } from './ctx.ts';

/** Known Canvas anchors (research/canvas-surface.md) checked on every page. */
const CANVAS_ANCHORS: Record<string, string> = {
  globalNav: '#header, .ic-app-header',
  logo: '.ic-app-header__logomark-container',
  wrapper: '#wrapper',
  content: '#content',
  leftSide: '#left-side',
  sectionTabs: '#section-tabs',
  rightSide: '#right-side',
  dashboardHeader: '#dashboard_header_container',
  cardContainer: '#DashboardCard_Container',
  card: '.ic-DashboardCard',
  cardHero: '.ic-DashboardCard__header_hero',
  planner: '#dashboard-planner',
  todoSidebar: '.Sidebar__TodoListContainer',
  recentFeedback: '.recent_feedback',
  gradesSummary: '#grades_summary',
  widgetDarkMode: '#widget-dashboard-dark-mode',
  tinymce: '.tox',
  coursesTab: '[data-testid="courses-tab-content"]',
};

/**
 * Other Canvas extensions decorating the same page (Copy report 1: BetterCampus
 * 9.9.1 ran alongside b²c: two due lists, two to-do panels, fighting themes).
 */
const OTHER_EXTENSIONS: Record<string, string> = {
  bettercampus: 'bettercampus-components, #darkcss, [class^="bettercanvas-"], [class*=" bettercanvas-"], bettercampus-todo-list',
};

export function otherExtensions(): string[] {
  return Object.entries(OTHER_EXTENSIONS).filter(([, sel]) => document.querySelector(sel)).map(([name]) => name);
}

export interface ProbeReport {
  b2c: string;
  page: Page['kind'];
  dashboard: 'cards' | 'planner' | 'activity' | 'widget' | 'n/a';
  flags: Record<string, unknown>;
  canvasAnchors: Record<string, number>;
  featureAnchors: Record<string, Record<string, boolean>>;
  running: string[];
  bodyClasses: string[];
  canvasBundles: string[];
  /** Other Canvas extensions seen on this page (e.g. 'bettercampus'). */
  otherExtensions: string[];
}

export function probe(page: Page, features: readonly AnyFeature[], running: string[], buildId: string): ProbeReport {
  const count = (sel: string) => document.querySelectorAll(sel).length;
  let flags: Record<string, unknown> = {};
  try {
    const env = JSON.parse(document.documentElement.getAttribute(ENV_ATTR) ?? '{}');
    flags = env.probe ?? {};
  } catch {
    /* no env */
  }
  const dashboard: ProbeReport['dashboard'] =
    page.kind !== 'dashboard' ? 'n/a'
    : flags.widgetDashboard ? 'widget'
    : document.body.classList.contains('dashboard-is-planner') ? 'planner'
    : count('#DashboardCard_Container') ? 'cards'
    : 'activity';

  const canvasAnchors: Record<string, number> = {};
  for (const [k, sel] of Object.entries(CANVAS_ANCHORS)) canvasAnchors[k] = count(sel);
  const featureAnchors: Record<string, Record<string, boolean>> = {};
  for (const f of features) {
    if (!f.anchors) continue;
    featureAnchors[f.id] = Object.fromEntries(Object.entries(f.anchors).map(([n, sel]) => [n, count(sel) > 0]));
  }
  const canvasBundles = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet]'))
    .map(l => l.href.match(/\/(?:bundles|brandable_css)\/.*?([\w-]+?)(?:-[0-9a-f]{8,})?\.css/)?.[1])
    .filter((x): x is string => !!x);
  return {
    b2c: buildId,
    page: page.kind,
    dashboard,
    flags,
    canvasAnchors,
    featureAnchors,
    running,
    bodyClasses: Array.from(document.body.classList).filter(c => !/\d{3,}/.test(c)),
    canvasBundles,
    otherExtensions: otherExtensions(),
  };
}
