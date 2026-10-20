// GET /conversations — the React inbox (ui/features/inbox). In production
// ConversationsController#index renders `html: ""` inside the layout (css_bundle :canvas_inbox,
// js_bundle :inbox) and ui/features/inbox/index.tsx renders <CanvasInboxApp/> into #content.
// pages/client/conversations.js builds the post-hydration DOM of CanvasInbox.tsx
// (MessageListActionContainer, ConversationListContainer/ConversationListItem,
// NoSelectedConversation, MessageDetailContainer) and, on Compose, ComposeModalContainer
// (#compose-message-modal: Modal.Header / HeaderInputs / ModalBody / ComposeActionButtons).
// Data comes from /api/v1/conversations (production uses GraphQL; the REST shapes carry the same fields).
// InstUI emotion classes are emitted as stable stand-ins (css-mock-<hash>-<label>, the label part
// matching InstUI's own: modalHeader, modalFooter, baseButton__content, textInput__facade, ...);
// their CSS is injected into <head> as a <style data-emotion="css"> by the client, as emotion does.
import fs from 'node:fs'
import path from 'node:path'
import {ROOT, json, instIcon} from '../lib/html.mjs'
import {dashboardCourses} from '../data/state.mjs'

const CLIENT_JS = () => fs.readFileSync(path.join(ROOT, 'pages/client/conversations.js'), 'utf8')
let EMPTY_SVG = null

// Icons the inbox uses that vendor-built/icons.json does not carry; paths copied from
// @instructure/ui-icons svg/Line/*.svg (MIT). Rendered with the same wrapper as lib/html.mjs instIcon.
const EXTRA_ICONS = {
  'reply-all-2': '<path d="m1030.975 188 81.249 81.249-429.228 429.228h300.747c516.223 0 936.257 420.034 936.257 936.257v98.028h-114.92v-98.028c0-452.901-368.436-821.337-821.337-821.337H682.996l429.228 429.229-81.25 81.248-567.936-567.937L1030.975 188Zm-463.038.011 81.249 81.25-486.688 486.688 486.688 486.688-81.249 81.249L0 755.949 567.937 188.01Z" fill-rule="evenodd"/>',
  'collection-save': '<path d="M1510.854 1779.583H409.146L81.255 1451.576 0 1532.946l361.566 361.566h1196.868L1920 1532.946l-81.14-81.37-328.006 328.007Zm-548.52-347.05L462.047 932.248l81.14-81.37 361.68 361.681V25h114.815v1187.559l361.795-361.68 81.14 81.369-500.285 500.285Z" fill-rule="evenodd"/>',
  'attach-media': '<path d="M101.002 1230.637V377.955c557.71-147.638 1076.312-35.47 1214.45 0v395.924l101.053-30.316V302.165l-35.671-11.014c-26.274-8.287-651.588-197.154-1349.154 1.313L-.05 305.197v1001.23l35.671 10.913c17.28 5.457 295.781 89.533 682.206 89.533 122.173 0 255.866-10.004 394.712-31.933v-101.255c-476.362 77.811-890.476-12.025-1011.537-43.048M1919.91 789.31v693.524c-.101 103.074-82.257 186.846-183.31 186.846-91.856 0-167.343-69.524-180.58-159.46-1.415-9.095-2.729-18.19-2.729-27.689 0-103.074 82.156-187.048 183.31-187.048 16.673 0 32.539 2.93 47.899 7.275 12.025 3.234 23.545 7.882 34.357 13.541V924.62l-39.814 11.824-362.577 107.317-27.89 8.186v579.94c0 2.83-.708 5.458-.81 8.186-4.243 99.234-84.176 178.964-182.601 178.964-101.154 0-183.31-83.975-183.31-187.15 0-68.513 36.682-128.033 90.645-160.572 27.385-16.471 58.711-26.577 92.665-26.577 29.81 0 57.499 7.983 82.358 20.817V976.46l27.89-8.185 101.053-29.911 360.96-106.813 142.484-42.24ZM527.515 480.635l560.842 329.835-560.842 329.735v-659.57Zm101.053 176.64v306.29L888.98 810.47 628.568 657.275ZM1736.6 1568.628c-38.097 0-68.817-27.689-78.114-64.674-1.82-6.973-4.143-13.743-4.143-21.423 0-47.394 36.884-85.996 82.257-85.996 18.896 0 35.671 7.781 49.515 19.1 19.504 15.763 32.741 39.309 32.741 66.896 0 47.495-36.884 86.097-82.256 86.097Zm-531.436 149.356c-45.373 0-82.257-38.603-82.257-86.097 0-47.495 36.884-86.097 82.257-86.097 45.372 0 82.358 38.602 82.358 86.097 0 47.494-36.986 86.097-82.358 86.097Z" fill-rule="evenodd"/>',
  'arrow-start': '<path d="M615.177 345 0 960.292l615.177 615.177 81.25-81.25-476.467-476.466H1920V902.83H219.96l476.467-476.58z" fill-rule="evenodd"/>',
  'remove-from-collection': '<path d="M0 1920h1242.353V677.647H0V1920ZM1129.412 790.588v1016.47H112.942V790.589h1016.47Zm451.764-451.764v1242.352h-225.882v-112.94h112.941V451.764H451.765v112.94H338.824V338.825h1242.352ZM1920.034-.011v1242.353h-225.882V1129.4h112.94V112.93H790.623v112.94H677.681V-.01h1242.353ZM338.824 1355.294h564.705v-112.941H338.824v112.941Z" fill-rule="evenodd"/>',
}
function icon(name, variant = 'Line') {
  const got = instIcon(name, {variant})
  if (got || !EXTRA_ICONS[name]) return got
  const pascal = 'Icon' + name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')
  return `<svg name="${pascal}" viewBox="0 0 1920 1920" rotate="0" width="1em" height="1em" aria-hidden="true" role="presentation" focusable="false" class="css-1uh2md0-inlineSVG-svgIcon" style="width: 1em; height: 1em;"><g role="presentation">${EXTRA_ICONS[name]}</g></svg>`
}

const ICONS = ['compose', 'reply', 'reply-all-2', 'collection-save', 'trash', 'more', 'search', 'x', 'star', 'star-light', 'empty', 'email', 'paperclip', 'attach-media', 'arrow-open-down', 'arrow-start', 'remove-from-collection', 'add-folder', 'check']

export default function render(S) {
  if (EMPTY_SVG == null) {
    const f = path.join(ROOT, '.vendor/canvas-lms/ui/features/inbox/svg/inbox-empty.svg')
    EMPTY_SVG = fs.existsSync(f) ? 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64') : ''
  }
  const icons = {}
  for (const n of ICONS) {
    icons[n] = icon(n)
    icons[n + ':Solid'] = icon(n, 'Solid')
  }
  const favs = dashboardCourses(S).map(c => ({id: c.id, name: S.nicknames[c.id] || c.name, assetString: `course_${c.id}`}))
  const env = {
    CONVERSATIONS: {
      ATTACHMENTS_FOLDER_ID: '9900001',
      ACCOUNT_CONTEXT_CODE: 'account_1',
      CAN_MESSAGE_ACCOUNT_CONTEXT: false,
      MAX_GROUP_CONVERSATION_SIZE: 100,
      INBOX_SIGNATURE_BLOCK_ENABLED: false,
      INBOX_AUTO_RESPONSE_ENABLED: false,
    },
    apollo_caching: false,
    conversation_cache_key: 'bW9jaw==\n',
    react_inbox_labels: false,
    inbox_sis_id_for_duplicates: false,
    inbox_translation_languages: [],
    inbox_translation_enabled: false,
    cedar_translation: true,
  }
  const cfg = {userId: S.user.id, userName: S.user.short_name, icons, favoriteCourses: favs, emptySvg: EMPTY_SVG}
  return {
    title: 'Inbox',
    content: '',
    cssBundles: ['canvas_inbox'],
    env,
    crumbs: [],
    scripts: [`window.__mockInbox = ${json(cfg)};\n${CLIENT_JS()}`],
  }
}
