import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  handleAnnotate,
  handleListAnnotations,
  handleDecision,
  handleGetWorkflow,
  handleCreateVersion,
  handleStartLongform,
  lineDiff,
  applyLineDiff,
} from '../src/review/handlers.ts';
import { createWorkflow } from '../src/review/pipeline.ts';
import { writeCalendar } from '../src/calendar.ts';
import type { DeskworkConfig } from '../src/config.ts';

/**
 * Phase 39c-2b(a): the review handlers resolve the workflow file via the
 * entry's stored `artifactPath` (no slug-template search). Bind an entry
 * — calendar row (slug→uuid) + sidecar (uuid → artifactPath) — so the
 * resolvers have the authoritative path. Returns the entry uuid for
 * `createWorkflow({ entryId })`. Mirrors the flat `{slug}.md` template
 * this suite's config declares.
 */
let bindCounter = 0;
function bindEntry(
  root: string,
  cfg: DeskworkConfig,
  slug: string,
): { entryId: string; artifactPath: string } {
  const entryId = `00000000-0000-4000-8000-${String(++bindCounter).padStart(12, '0')}`;
  const artifactPath = `${cfg.sites.a.contentDir}/${slug}.md`;
  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
  writeCalendar(join(root, '.deskwork', 'calendar.md'), {
    entries: [
      {
        id: entryId,
        slug,
        title: slug,
        description: '',
        stage: 'Drafting',
        targetKeywords: [],
        source: 'manual',
      },
    ],
    distributions: [],
  });
  writeFileSync(
    join(root, '.deskwork', 'entries', `${entryId}.json`),
    JSON.stringify({
      uuid: entryId,
      slug,
      title: slug,
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifactPath,
    }),
    'utf-8',
  );
  return { entryId, artifactPath };
}

function config(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'src/sites/a/content/blog',
        calendarPath: 'docs/cal-a.md',
        blogFilenameTemplate: '{slug}.md',
      },
    },
    defaultSite: 'a',
  };
}

function seedWorkflow(root: string, cfg: DeskworkConfig, slug = 's') {
  return createWorkflow(root, cfg, {
    site: 'a',
    slug,
    contentKind: 'longform',
    initialMarkdown: '# v1\n\nFirst version.',
  });
}

describe('review handlers', () => {
  let root: string;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-review-h-'));
    cfg = config();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('handleAnnotate', () => {
    it('accepts a comment with range + text and returns the minted annotation', () => {
      const w = seedWorkflow(root, cfg);
      const r = handleAnnotate(root, cfg, {
        type: 'comment',
        workflowId: w.id,
        version: 1,
        range: { start: 2, end: 7 },
        text: 'tighten',
      });
      expect(r.status).toBe(200);
      const body = r.body as { annotation: { id: string; createdAt: string } };
      expect(body.annotation.id).toMatch(/./);
      expect(body.annotation.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('rejects a comment without required fields with 400', () => {
      const w = seedWorkflow(root, cfg);
      const r = handleAnnotate(root, cfg, {
        type: 'comment',
        workflowId: w.id,
        version: 1,
        // missing range + text
      });
      expect(r.status).toBe(400);
    });

    it('returns 404 for an unknown workflow', () => {
      const r = handleAnnotate(root, cfg, {
        type: 'approve',
        workflowId: 'nope',
        version: 1,
      });
      expect(r.status).toBe(404);
    });

    it('accepts address disposition values and rejects others', () => {
      const w = seedWorkflow(root, cfg);
      // Phase 8 Step 8.1.2 (Part 2) — `addressed` disposition now
      // requires a non-empty `reason`. Test updated to supply one.
      const r1 = handleAnnotate(root, cfg, {
        type: 'address',
        workflowId: w.id,
        commentId: 'c-1',
        version: 2,
        disposition: 'addressed',
        reason: 'addressed by adding section X at line 42',
      });
      expect(r1.status).toBe(200);
      const r2 = handleAnnotate(root, cfg, {
        type: 'address',
        workflowId: w.id,
        commentId: 'c-1',
        version: 2,
        disposition: 'whatever',
      });
      expect(r2.status).toBe(400);
    });

    it("rejects an `addressed` disposition without `reason` (Phase 8 Step 8.1.2 contract)", () => {
      const w = seedWorkflow(root, cfg);
      const r = handleAnnotate(root, cfg, {
        type: 'address',
        workflowId: w.id,
        commentId: 'c-1',
        version: 2,
        disposition: 'addressed',
        // no reason field
      });
      expect(r.status).toBe(400);
      if (r.status === 400) {
        expect(JSON.stringify(r.body)).toContain('reason is required');
      }
    });

    it("rejects an `addressed` disposition with empty-string `reason` (Phase 8 Step 8.1.2 contract)", () => {
      const w = seedWorkflow(root, cfg);
      const r = handleAnnotate(root, cfg, {
        type: 'address',
        workflowId: w.id,
        commentId: 'c-1',
        version: 2,
        disposition: 'addressed',
        reason: '',
      });
      expect(r.status).toBe(400);
      if (r.status === 400) {
        expect(JSON.stringify(r.body)).toContain('reason is required');
      }
    });

    it("accepts a `deferred` disposition without `reason` (contract scoped to `addressed`)", () => {
      const w = seedWorkflow(root, cfg);
      const r = handleAnnotate(root, cfg, {
        type: 'address',
        workflowId: w.id,
        commentId: 'c-1',
        version: 2,
        disposition: 'deferred',
        // no reason field
      });
      expect(r.status).toBe(200);
    });
  });

  describe('handleListAnnotations', () => {
    it('filters by workflowId', () => {
      const w = seedWorkflow(root, cfg);
      handleAnnotate(root, cfg, {
        type: 'comment',
        workflowId: w.id,
        version: 1,
        range: { start: 0, end: 1 },
        text: 'a',
      });
      const r = handleListAnnotations(root, cfg, {
        workflowId: w.id,
        version: null,
      });
      expect(r.status).toBe(200);
      const body = r.body as { annotations: unknown[] };
      expect(body.annotations).toHaveLength(1);
    });
  });

  describe('handleDecision', () => {
    it('advances the workflow on a valid transition', () => {
      const w = seedWorkflow(root, cfg);
      const r = handleDecision(root, cfg, { workflowId: w.id, to: 'in-review' });
      expect(r.status).toBe(200);
      expect((r.body as { workflow: { state: string } }).workflow.state).toBe(
        'in-review',
      );
    });

    it('returns 409 on invalid transitions', () => {
      const w = seedWorkflow(root, cfg);
      const r = handleDecision(root, cfg, { workflowId: w.id, to: 'approved' });
      expect(r.status).toBe(409);
    });
  });

  describe('handleGetWorkflow', () => {
    it('looks up by (site, slug) and returns workflow + versions', () => {
      const w = seedWorkflow(root, cfg, 'my-post');
      const r = handleGetWorkflow(root, cfg, {
        id: null,
        site: 'a',
        slug: 'my-post',
        contentKind: 'longform',
        platform: null,
        channel: null,
      });
      expect(r.status).toBe(200);
      const body = r.body as { workflow: { id: string }; versions: unknown[] };
      expect(body.workflow.id).toBe(w.id);
      expect(body.versions).toHaveLength(1);
    });

    it('prefers an active workflow over a cancelled one for the same (site, slug)', () => {
      const first = seedWorkflow(root, cfg, 'dup');
      handleDecision(root, cfg, { workflowId: first.id, to: 'cancelled' });
      const second = seedWorkflow(root, cfg, 'dup');
      const r = handleGetWorkflow(root, cfg, {
        id: null,
        site: 'a',
        slug: 'dup',
        contentKind: 'longform',
        platform: null,
        channel: null,
      });
      expect(r.status).toBe(200);
      const body = r.body as { workflow: { id: string } };
      expect(body.workflow.id).toBe(second.id);
    });

    // Phase 39c c3 (Decision #22): `site` is no longer validated against
    // config.sites — there are no sites to validate against. An unknown
    // site for which no entry resolves surfaces as the existing 404, NOT a
    // site-membership 400.
    it('returns 404 (not 400) for an unrecognized site with no matching entry', () => {
      const r = handleGetWorkflow(root, cfg, {
        id: null,
        site: 'nope',
        slug: 's',
        contentKind: 'longform',
        platform: null,
        channel: null,
      });
      expect(r.status).toBe(404);
    });

    // An existing workflow resolves regardless of the `site` label — the
    // entry-lookup path governs, the site field is opaque metadata.
    it('resolves a workflow under an opaque (unconfigured) site label', () => {
      const w = createWorkflow(root, cfg, {
        site: 'unregistered-label',
        slug: 'opaque',
        contentKind: 'longform',
        initialMarkdown: '# v1',
      });
      const r = handleGetWorkflow(root, cfg, {
        id: null,
        site: 'unregistered-label',
        slug: 'opaque',
        contentKind: 'longform',
        platform: null,
        channel: null,
      });
      expect(r.status).toBe(200);
      const body = r.body as { workflow: { id: string } };
      expect(body.workflow.id).toBe(w.id);
    });
  });

  describe('handleCreateVersion', () => {
    it('writes disk first then records an operator version + edit annotation', () => {
      const slug = 'writeable-post';
      const blogFile = join(
        root,
        'src/sites/a/content/blog',
        `${slug}.md`,
      );
      mkdirSync(dirname(blogFile), { recursive: true });
      writeFileSync(blogFile, '# v1\n', 'utf-8');
      const { entryId } = bindEntry(root, cfg, slug);

      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug,
        entryId,
        contentKind: 'longform',
        initialMarkdown: '# v1\n',
      });

      const r = handleCreateVersion(root, cfg, {
        workflowId: w.id,
        beforeVersion: 1,
        afterMarkdown: '# v1\n\nNew paragraph.\n',
      });
      expect(r.status).toBe(200);
      const body = r.body as {
        version: { version: number; originatedBy: string };
      };
      expect(body.version.version).toBe(2);
      expect(body.version.originatedBy).toBe('operator');
      expect(readFileSync(blogFile, 'utf-8')).toBe(
        '# v1\n\nNew paragraph.\n',
      );
    });

    it('returns 500 when the blog file is missing for a longform workflow', () => {
      // Entry is bound (sidecar + artifactPath) but the file itself was
      // never written — resolution succeeds, existence check fails → 500.
      const { entryId } = bindEntry(root, cfg, 'no-file');
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'no-file',
        entryId,
        contentKind: 'longform',
        initialMarkdown: '# v1\n',
      });
      const r = handleCreateVersion(root, cfg, {
        workflowId: w.id,
        beforeVersion: 1,
        afterMarkdown: '# changed\n',
      });
      expect(r.status).toBe(500);
    });

    it('rejects a no-op edit with 400', () => {
      const slug = 'noop-post';
      const blogFile = join(root, 'src/sites/a/content/blog', `${slug}.md`);
      mkdirSync(dirname(blogFile), { recursive: true });
      writeFileSync(blogFile, 'x', 'utf-8');
      const { entryId } = bindEntry(root, cfg, slug);
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug,
        entryId,
        contentKind: 'longform',
        initialMarkdown: 'x',
      });
      const r = handleCreateVersion(root, cfg, {
        workflowId: w.id,
        beforeVersion: 1,
        afterMarkdown: 'x',
      });
      expect(r.status).toBe(400);
    });
  });

  describe('handleStartLongform', () => {
    it('enqueues a longform workflow from the blog file', () => {
      const slug = 'start-me';
      const blogFile = join(root, 'src/sites/a/content/blog', `${slug}.md`);
      mkdirSync(dirname(blogFile), { recursive: true });
      writeFileSync(blogFile, '# Draft body', 'utf-8');
      bindEntry(root, cfg, slug);

      const r = handleStartLongform(root, cfg, { site: 'a', slug });
      expect(r.status).toBe(200);
      const body = r.body as { workflow: { slug: string }; existing: boolean };
      expect(body.workflow.slug).toBe(slug);
      expect(body.existing).toBe(false);
    });

    it('returns 404 when the blog file does not exist', () => {
      // Entry is bound (sidecar + artifactPath) but the file is absent —
      // resolution succeeds, the existence check 404s.
      bindEntry(root, cfg, 'missing');
      const r = handleStartLongform(root, cfg, { site: 'a', slug: 'missing' });
      expect(r.status).toBe(404);
    });

    it('returns 400 for a bad slug shape', () => {
      const r = handleStartLongform(root, cfg, {
        site: 'a',
        slug: '../escape',
      });
      expect(r.status).toBe(400);
    });

    // Phase 39c c3 (Decision #22): no `site in config.sites` validation.
    // An unknown site no longer 400s on membership; the entry-lookup path
    // governs. With no entry/file bound, resolution still surfaces a 404
    // (file not found) — NOT a site-membership 400.
    it('does not 400 on site membership for an unconfigured site', () => {
      const slug = 'unconfigured-start';
      const blogFile = join(root, 'somewhere', `${slug}.md`);
      mkdirSync(dirname(blogFile), { recursive: true });
      writeFileSync(blogFile, '# body', 'utf-8');
      // Bind the entry under an unregistered site label; artifactPath is
      // opaque to the (now-removed) site validation.
      const entryId = `00000000-0000-4000-8000-${String(++bindCounter).padStart(12, '0')}`;
      mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
      writeCalendar(join(root, '.deskwork', 'calendar.md'), {
        entries: [
          {
            id: entryId,
            slug,
            title: slug,
            description: '',
            stage: 'Drafting',
            targetKeywords: [],
            source: 'manual',
          },
        ],
        distributions: [],
      });
      writeFileSync(
        join(root, '.deskwork', 'entries', `${entryId}.json`),
        JSON.stringify({
          uuid: entryId,
          slug,
          title: slug,
          keywords: [],
          source: 'manual',
          currentStage: 'Drafting',
          iterationByStage: {},
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          artifactPath: `somewhere/${slug}.md`,
        }),
        'utf-8',
      );
      const r = handleStartLongform(root, cfg, {
        site: 'totally-unconfigured',
        slug,
        entryId,
      });
      expect(r.status).toBe(200);
    });
  });

  // Phase 39c c3 (Decision #22): a single entry owns BOTH a longform and a
  // shortform workflow simultaneously. createWorkflow's dedup MUST keep the
  // kind/channel discriminator — creating the shortform must NOT return the
  // pre-existing longform (and vice-versa).
  describe('matchesKey discriminator survives the entryId rekey', () => {
    it('keeps longform and shortform workflows distinct for the same entryId', () => {
      const entryId = '00000000-0000-4000-8000-aaaaaaaaaaaa';
      const longform = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'same-entry',
        entryId,
        contentKind: 'longform',
        initialMarkdown: '# long',
      });
      const shortform = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'same-entry',
        entryId,
        contentKind: 'shortform',
        platform: 'linkedin',
        initialMarkdown: 'short',
      });
      expect(shortform.id).not.toBe(longform.id);

      // Re-issuing each returns its OWN workflow (idempotent per kind),
      // never the co-resident sibling.
      const longformAgain = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'same-entry',
        entryId,
        contentKind: 'longform',
        initialMarkdown: '# long',
      });
      const shortformAgain = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'same-entry',
        entryId,
        contentKind: 'shortform',
        platform: 'linkedin',
        initialMarkdown: 'short',
      });
      expect(longformAgain.id).toBe(longform.id);
      expect(shortformAgain.id).toBe(shortform.id);
    });

    it('keeps two shortform workflows distinct by platform for the same entryId', () => {
      const entryId = '00000000-0000-4000-8000-bbbbbbbbbbbb';
      const linkedin = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'same-entry',
        entryId,
        contentKind: 'shortform',
        platform: 'linkedin',
        initialMarkdown: 'li',
      });
      const reddit = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'same-entry',
        entryId,
        contentKind: 'shortform',
        platform: 'reddit',
        initialMarkdown: 'rd',
      });
      expect(reddit.id).not.toBe(linkedin.id);
    });
  });
});

describe('lineDiff / applyLineDiff', () => {
  it('produces = / + / - prefixed output and round-trips', () => {
    const before = 'a\nb\nc\n';
    const after = 'a\nB\nc\nd\n';
    const diff = lineDiff(before, after);
    expect(diff).toContain('= a');
    expect(diff).toContain('- b');
    expect(diff).toContain('+ B');
    expect(diff).toContain('+ d');
    expect(applyLineDiff(diff)).toBe(after);
  });
});
