/**
 * XSS regression coverage for operator-controlled free-text fields that
 * land in rendered HTML — Task 0.45 (closes AUDIT-20260530-70 / cross-
 * model: AUDIT-BARRAGE-claude-P6-2).
 *
 * The lane page renders `name` and `contentDir` into both text and
 * double-quoted attribute contexts:
 *
 *   `<td class="lanes-cell lanes-cell--name">${row.name}</td>`        (text)
 *   `data-current="${row.name}"`                                      (attr)
 *   `value="${row.name}"`                                             (attr)
 *   `data-current="${row.contentDir}"`                                (attr)
 *   `<code>${row.contentDir}</code>`                                  (text)
 *
 * The pipelines page renders `name` and `description` into text
 * context inside the View panel:
 *
 *   `<code>${row.id}</code>: ${row.name}`                             (text)
 *   `<p class="pipelines-view-desc">${row.description}</p>`           (text)
 *
 * Both pages are server-rendered via the `html` tagged-template helper
 * in `packages/studio/src/pages/html.ts`. The helper's `renderValue`
 * runs every interpolated string through `escapeHtml`, which encodes
 * `&` `<` `>` `"` `'`. The whole feature's XSS safety rests on that
 * contract.
 *
 * Pre-this-test, NO test fed hostile payloads through these surfaces.
 * Every assertion in the existing suite uses benign ids/names like
 * `editorial`, `docs`, `mockups`. The audit explicitly named "XSS via
 * lane/pipeline name in rendered markup" as a stated focus area and
 * found it entirely uncovered. This file fills that coverage gap and
 * pins the `html.ts` escape contract those pages silently depend on.
 *
 * Pure integration — boots `createApp` against an on-disk fixture
 * project, walks the real renderer end-to-end. Per
 * `.claude/rules/testing.md`, no filesystem mocks; fixture trees live
 * on disk via `mkdtempSync`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
    },
    defaultSite: 'd',
  };
}

function writeLane(
  root: string,
  id: string,
  name: string,
  pipelineTemplate: string,
  contentDir: string,
): void {
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify({ id, name, pipelineTemplate, contentDir }, null, 2),
    'utf8',
  );
}

function writePipelineOverride(root: string, id: string, body: unknown): void {
  writeFileSync(
    join(root, '.deskwork', 'pipelines', `${id}.json`),
    JSON.stringify(body, null, 2),
    'utf8',
  );
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

/**
 * Assertion helpers — every hostile fragment we ever feed in MUST NOT
 * appear in the rendered HTML in raw structural form. The escaped form
 * (with `&lt;` / `&gt;` / `&quot;` / `&#39;`) is the expected output.
 *
 * We test the literal payload string is absent (a full-fidelity raw
 * echo would mean zero escaping fired) AND test the actual structural
 * vectors that would have to exist for an attack to succeed:
 *
 *   - A raw `<script` or `<img` token (tag would parse as element)
 *   - A `">` literal followed by a tag start (would break attribute
 *     boundary and start a new tag)
 *
 * We do NOT test the literal substring `onerror=` standalone — that
 * sequence appears verbatim inside the escaped form (`&quot;&gt;&lt;img
 * src=x onerror=alert(1)&gt;`), which is benign because the surrounding
 * `<` `>` `"` are escaped. Only the angle-bracket / quote escapes are
 * what disarms the attack; the inner identifier characters are
 * harmless on their own.
 */
function assertNoRawXssVector(html: string, payload: string): void {
  // The literal payload must be absent — a full-fidelity raw echo would
  // mean zero escaping fired.
  expect(html).not.toContain(payload);
  // Specific injected-script bodies — the page legitimately emits
  // `<script type="module" src=".../editorial-studio-client.js">` for
  // its own bundle, so we can't blanket-ban `<script`. Instead, ban
  // the specific injected bodies our test payloads carry. The
  // legitimate `<script type=...>` would never contain
  // `<script>alert(`.
  expect(html).not.toContain('<script>alert(');
  expect(html).not.toContain('<img src=x onerror=');
  // The attribute-break vector: a `">` literal followed by tag start
  // means the helper failed to escape `"` in attribute context, the
  // attribute closed, and an injected tag began. Both `"><script` and
  // `"><img` are the classic shapes; their absence is the load-bearing
  // proof the `"` escape fired.
  expect(html).not.toContain('"><script');
  expect(html).not.toContain('"><img');
}

describe('xss-regression — lane `name` field escaping (Task 0.45 / AUDIT-20260530-70)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-xss-lane-name-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('escapes a quote-break + img/onerror payload in the lane Name cell', async () => {
    const payload = '"><img src=x onerror=alert(1)>';
    writeLane(root, 'attack-lane', payload, 'editorial', 'docs');
    app = createApp({ projectRoot: root, config: makeConfig() });

    const r = await getHtml(app, '/dev/lanes');

    expect(r.status).toBe(200);
    // The escaped form for `"` is `&quot;`, for `<` is `&lt;`, for `>` is
    // `&gt;`. The lane Name text-context cell must contain all three.
    expect(r.html).toContain('&quot;');
    expect(r.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // The raw payload (and dangerous structural tokens) must NOT appear.
    assertNoRawXssVector(r.html, payload);
  });

  it('escapes the same payload in the per-row Edit form value + data-current attributes', async () => {
    const payload = '"><img src=x onerror=alert(1)>';
    writeLane(root, 'attack-lane', payload, 'editorial', 'docs');
    app = createApp({ projectRoot: root, config: makeConfig() });

    const r = await getHtml(app, '/dev/lanes');

    // The edit form's `value="${row.name}"` is the highest-risk attribute
    // context. Confirm the attribute boundary holds — the literal
    // `value="...">` followed by injected content must NOT appear.
    expect(r.html).not.toMatch(/value="">\s*<img\s+src=x/);
    // The escaped attribute must appear (positive proof we're hitting
    // the surface, not just relying on absence).
    expect(r.html).toContain('value="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
    expect(r.html).toContain('data-current="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
    assertNoRawXssVector(r.html, payload);
  });

  it('escapes a script-tag payload in the lane Name cell', async () => {
    const payload = '<script>alert(1)</script>';
    writeLane(root, 'script-lane', payload, 'editorial', 'docs');
    app = createApp({ projectRoot: root, config: makeConfig() });

    const r = await getHtml(app, '/dev/lanes');

    expect(r.status).toBe(200);
    expect(r.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // The raw `<script>` opening tag must not appear anywhere — no
    // legitimate cell carries a `<script>` token, so any hit is a
    // regression.
    assertNoRawXssVector(r.html, payload);
  });

  it('escapes a single-quote attribute-break attempt in the lane Name', async () => {
    // Some renderers handle `"` but not `'`. The `html.ts` helper
    // escapes both (`'` → `&#39;`), so test it explicitly to pin the
    // contract. The bare `onclick=` identifier would survive the
    // escape (only the surrounding `'` characters are encoded) and
    // would be benign because the surrounding quotes are gone — that
    // matches the asymmetric vector rule in `assertNoRawXssVector`.
    const payload = "' onclick='alert(1)";
    writeLane(root, 'quote-lane', payload, 'editorial', 'docs');
    app = createApp({ projectRoot: root, config: makeConfig() });

    const r = await getHtml(app, '/dev/lanes');

    expect(r.status).toBe(200);
    expect(r.html).toContain('&#39; onclick=&#39;alert(1)');
    // The raw payload (with unescaped `'`) must NOT appear — that
    // would be the structural failure.
    expect(r.html).not.toContain("' onclick='");
  });
});

describe('xss-regression — lane `contentDir` field escaping (Task 0.45 / AUDIT-20260530-70)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-xss-lane-cdir-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('escapes a quote-break + script payload in the contentDir text cell + edit attributes', async () => {
    // Sentence-shaped payload to exercise both `"` and `<` in the same
    // string. The lane contentDir lands in `<code>${row.contentDir}</code>`
    // (text), `value="${row.contentDir}"` (attr), and
    // `data-current="${row.contentDir}"` (attr).
    const payload = '"; <script>alert(1)</script>';
    writeLane(root, 'cdir-attack', 'Some Lane', 'editorial', payload);
    app = createApp({ projectRoot: root, config: makeConfig() });

    const r = await getHtml(app, '/dev/lanes');

    expect(r.status).toBe(200);
    // Escaped form present in attribute AND text contexts.
    expect(r.html).toContain('&quot;; &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(r.html).toContain(
      'value="&quot;; &lt;script&gt;alert(1)&lt;/script&gt;"',
    );
    expect(r.html).toContain(
      'data-current="&quot;; &lt;script&gt;alert(1)&lt;/script&gt;"',
    );
    assertNoRawXssVector(r.html, payload);
  });

  it('escapes ampersand to &amp; (prevents entity-injection second-pass attacks)', async () => {
    // A naive escaper that runs `<`/`>`/`"` but skips `&` would let
    // `&lt;script&gt;` survive as an entity that decodes to `<script>`
    // on a second-pass render. Confirm `&` becomes `&amp;` first so
    // pre-encoded entities can't slip through.
    const payload = '&lt;script&gt;alert(1)&lt;/script&gt;';
    writeLane(root, 'amp-lane', 'Some Lane', 'editorial', payload);
    app = createApp({ projectRoot: root, config: makeConfig() });

    const r = await getHtml(app, '/dev/lanes');

    expect(r.status).toBe(200);
    // The `&` is escaped to `&amp;`, so `&lt;` in the payload becomes
    // the literal text `&amp;lt;` — the browser will render it as the
    // 4-char string `&lt;`, NOT as the `<` it would decode to if we
    // emitted `&lt;` verbatim.
    expect(r.html).toContain('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;');
    // The page legitimately ships `<script type="module">` bundle tags
    // + an inline `<script>window.__GLOSSARY__=...</script>`, so we
    // can't blanket-ban `<script`. Ban the injected body specifically.
    expect(r.html).not.toContain('<script>alert(');
  });
});

describe('xss-regression — pipeline `name` field escaping (Task 0.45 / AUDIT-20260530-70)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-xss-pipe-name-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('escapes a quote-break + script payload in the pipeline View panel heading', async () => {
    // A project-override template can carry an arbitrary `name` string.
    // The view-panel.ts renderer puts it in `<h3>: ${row.name}</h3>`
    // (text context). The id field is regex-gated and must stay
    // benign; only `name`/`description` are free-text operator input.
    const payload = '"><script>alert(1)</script>';
    writePipelineOverride(root, 'evil-pipe', {
      id: 'evil-pipe',
      name: payload,
      description: 'benign description',
      linearStages: ['Idea', 'Done'],
      offPipelineStages: ['Cancelled'],
    });
    app = createApp({ projectRoot: root, config: makeConfig() });

    const r = await getHtml(app, '/dev/pipelines');

    expect(r.status).toBe(200);
    expect(r.html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    assertNoRawXssVector(r.html, payload);
  });

  it('escapes a quote-break + img/onerror payload in the pipeline View panel description', async () => {
    const payload = '"><img src=x onerror=alert(1)>';
    writePipelineOverride(root, 'evil-desc-pipe', {
      id: 'evil-desc-pipe',
      name: 'Benign Name',
      description: payload,
      linearStages: ['Idea', 'Done'],
      offPipelineStages: ['Cancelled'],
    });
    app = createApp({ projectRoot: root, config: makeConfig() });

    const r = await getHtml(app, '/dev/pipelines');

    expect(r.status).toBe(200);
    expect(r.html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    assertNoRawXssVector(r.html, payload);
  });
});

describe('xss-regression — html.ts contract (Task 0.45 / AUDIT-20260530-70)', () => {
  /**
   * Direct contract pin on the `html` helper itself. The lane + pipeline
   * page tests above prove the surface escapes; this block proves the
   * underlying helper does, so a refactor that swaps the helper without
   * changing the page renderers can't quietly drop the contract.
   */
  it('escapes &, <, >, ", and \' in interpolated string values', async () => {
    const { html, escapeHtml } = await import('../../src/pages/html.ts');

    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );

    const payload = '"><img src=x onerror=alert(1)>';
    const out = html`<div attr="${payload}">${payload}</div>`;
    // The `value` between the quotes must be entirely escaped — no raw
    // `"` to break the attribute boundary, no raw `<` to start a tag.
    expect(out).toContain('attr="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
    // The structural attack vectors must NOT appear: `"><img` (quote-
    // break + tag start) and the raw payload itself. The bare
    // `onerror=` substring inside an escaped attribute value is benign
    // (no surrounding `<` to make a tag) — its presence in the
    // ESCAPED form is expected.
    expect(out).not.toContain('"><img');
    expect(out).not.toContain(payload);
  });
});
