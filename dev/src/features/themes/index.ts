// themes: looks as portable JSON, saved locally (design/spec/surfaces/themes.md).
//
// Setting keys:
//   themes.saved     json SavedTheme[]  (chrome.storage.local)  default []
//   themes.previous  json {at, values} | null (local): the look before the
//                    last Apply, for "Undo theme" within 24 h.
//
// The model (model.ts) is for the settings UI. In Canvas tabs this feature only
// answers previews: the UI sends
//   chrome.tabs.sendMessage(tabId, { type: 'b2c:themes:preview', values: Flat | null })
// and the tab paints the pre-paint state (dark palette, card look attributes,
// font) as if those settings applied, without writing anything. `values: null`
// ends the preview. Apply = write the settings (settings-storage's
// changeWithUndo) plus a card-colors request for the cardColors part.

import { defineFeature, mirrorOf } from '../../core/feature.ts';
import { applyMirror, forPath, mergeParts, readMirror } from '../../core/mirror.ts';
import { QUIZ_TAKING } from '../../core/canvas/page.ts';
import { allFeatures, schema } from '../../core/registry.ts';
import { json } from '../../core/settings/schema.ts';
import { createStore, type Flat } from '../../core/settings/store.ts';
import { isPrevious, isSavedList, type Previous, type SavedTheme } from './model.ts';

export const PREVIEW_MSG = 'b2c:themes:preview';

export default defineFeature({
  id: 'themes',
  settings: {
    saved: json<SavedTheme[]>([], { check: isSavedList }),
    previous: json<Previous | null>(null, { check: isPrevious }),
  },
  pages: 'all',

  start(ctx) {
    const isQuiz = (p: string) => QUIZ_TAKING.test(p);
    const here = () => location.pathname;
    let previewing = false;
    const restore = () => {
      const m = readMirror();
      if (m) applyMirror(forPath(m, here(), isQuiz), ctx.now());
      previewing = false;
    };
    const onMessage = (msg: { type?: string; values?: Flat | null }, _s: unknown, reply: (r: unknown) => void) => {
      if (msg?.type !== PREVIEW_MSG) return;
      if (!msg.values) {
        restore();
        reply({ previewing: false });
        return;
      }
      void createStore(schema)
        .load()
        .then(base => {
          const all = { ...base, ...msg.values };
          const quiz = all['core.quizSafe'] === 'colours' ? allFeatures.filter(f => f.quizSafe) : [];
          const m = mergeParts(allFeatures.map(f => mirrorOf(f, all)), quiz.map(f => mirrorOf(f, all)));
          applyMirror(forPath(m, here(), isQuiz), ctx.now());
          previewing = true;
          reply({ previewing: true });
        })
        .catch(() => reply({ previewing: false }));
      return true; // async reply
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return {
      update() {},
      stop() {
        chrome.runtime.onMessage.removeListener(onMessage);
        if (previewing) restore();
      },
    };
  },
});
