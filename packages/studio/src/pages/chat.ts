/**
 * Full-page chat surface — `/dev/chat`.
 *
 * Renders the standard layout shell with a single mount node; the
 * client bootstrap (chat-page.ts) creates a ChatPanel into it. The
 * server emits `data-project-root` on `<body>` so the client's draft
 * persistence can namespace localStorage keys per worktree.
 */

import type { StudioContext } from '../routes/api.ts';
import { html } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';

export function renderChatPage(ctx: StudioContext): string {
  const body = html`
    ${renderEditorialFolio('index', 'agent chat')}
    <main class="chat-page">
      <div id="chat-root" class="chat-root"></div>
    </main>`;
  const escapedRoot = ctx.projectRoot
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return layout({
    title: 'Agent chat — dev',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/chat.css',
    ],
    bodyAttrs: `data-review-ui="chat" data-project-root="${escapedRoot}"`,
    bodyHtml: body,
    scriptModules: ['chat-page'],
  });
}
