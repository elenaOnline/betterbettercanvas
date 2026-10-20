import { BUILT_IN_MATCHES, isBuiltInHost } from '../../core/hosts.ts';

/** Instructure-hosted Canvas is matched by the manifest; nothing to add. */
export const BUILT_IN_LABEL = 'Any school at *.instructure.com';
export { BUILT_IN_MATCHES };
export const isBuiltIn = (origin: string) => isBuiltInHost(new URL(origin).hostname);
export const SITE_KEY = 'b2c:sites';
export const SCRIPT_IDS = ['b2c-sites-isolated', 'b2c-sites-main', 'b2c-sites-runtime', 'b2c-sites-dark-instui'];

/** Accept an exact HTTPS origin, never a path, wildcard or credential. */
export function canvasOrigin(input: string): string {
  const value = input.trim();
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a Canvas address such as https://yourschool.instructure.com.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash || /[*\s\[\]]/.test(url.hostname) || !url.hostname) {
    throw new Error('Use an exact HTTPS origin, without a path, port, wildcard or sign-in details.');
  }
  return url.origin;
}

export function siteScripts(origins: readonly string[]): chrome.scripting.RegisteredContentScript[] {
  const matches = [...new Set(origins.map(canvasOrigin))].filter(o => !isBuiltIn(o)).map(o => `${o}/*`);
  if (!matches.length) return [];
  return [
    // Mirrors the manifest's content_scripts (keep them in step).
    { id: SCRIPT_IDS[0]!, matches, js: ['boot.js'], css: ['content.css'], runAt: 'document_start', world: 'ISOLATED', allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true },
    { id: SCRIPT_IDS[2]!, matches, js: ['main.js'], runAt: 'document_start', world: 'ISOLATED', persistAcrossSessions: true },
    { id: SCRIPT_IDS[1]!, matches, js: ['env-main.js'], runAt: 'document_end', world: 'MAIN', persistAcrossSessions: true },
    { id: SCRIPT_IDS[3]!, matches, js: ['dark-instui.js'], runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true },
  ];
}
