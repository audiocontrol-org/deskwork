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
} from '@/lib/review/handlers.ts';
import { createWorkflow } from '@/lib/review/pipeline.ts';
import type { DeskworkConfig } from '@/lib/config.ts';

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
      const r1 = handleAnnotate(root, cfg, {
        type: 'address',
        workflowId: w.id,
        commentId: 'c-1',
        version: 2,
        disposition: 'addressed',
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

    it('returns 400 for an unconfigured site', () => {
      const r = handleGetWorkflow(root, cfg, {
        id: null,
        site: 'nope',
        slug: 's',
        contentKind: 'longform',
        platform: null,
        channel: null,
      });
      expect(r.status).toBe(400);
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

      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug,
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
      const w = seedWorkflow(root, cfg, 'no-file');
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
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug,
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

      const r = handleStartLongform(root, cfg, { site: 'a', slug });
      expect(r.status).toBe(200);
      const body = r.body as { workflow: { slug: string }; existing: boolean };
      expect(body.workflow.slug).toBe(slug);
      expect(body.existing).toBe(false);
    });

    it('returns 404 when the blog file does not exist', () => {
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
