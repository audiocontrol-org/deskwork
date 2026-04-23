import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createWorkflow,
  readWorkflows,
  readWorkflow,
  readHistory,
  readVersions,
  readAnnotations,
  transitionState,
  appendVersion,
  appendAnnotation,
  mintAnnotation,
  listOpen,
  pipelinePath,
  historyPath,
} from '@/lib/review/pipeline.ts';
import { isValidTransition } from '@/lib/review/types.ts';
import type { DeskworkConfig } from '@/lib/config.ts';

function config(journalDir?: string): DeskworkConfig {
  const c: DeskworkConfig = {
    version: 1,
    sites: {
      a: { host: 'a.example', contentDir: 'a/blog', calendarPath: 'a/cal.md' },
      b: { host: 'b.example', contentDir: 'b/blog', calendarPath: 'b/cal.md' },
    },
    defaultSite: 'a',
  };
  if (journalDir !== undefined) c.reviewJournalDir = journalDir;
  return c;
}

describe('review pipeline', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-review-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('createWorkflow', () => {
    it('creates a workflow, writes one pipeline file and two history files (workflow-created + v1)', () => {
      const cfg = config();
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'post-1',
        contentKind: 'longform',
        initialMarkdown: '# Hello',
      });
      expect(w.state).toBe('open');
      expect(w.currentVersion).toBe(1);
      expect(w.site).toBe('a');

      const pipeline = readdirSync(pipelinePath(root, cfg));
      const history = readdirSync(historyPath(root, cfg));
      expect(pipeline).toHaveLength(1);
      expect(history).toHaveLength(2);
    });

    it('is idempotent on the natural key when a non-terminal workflow exists', () => {
      const cfg = config();
      const params = {
        site: 'a',
        slug: 'dup',
        contentKind: 'longform' as const,
        initialMarkdown: 'v1',
      };
      const first = createWorkflow(root, cfg, params);
      const second = createWorkflow(root, cfg, params);
      expect(second.id).toBe(first.id);
      expect(readWorkflows(root, cfg)).toHaveLength(1);
    });

    it('creates a new workflow when the prior one is in a terminal state', () => {
      const cfg = config();
      const params = {
        site: 'a',
        slug: 'again',
        contentKind: 'longform' as const,
        initialMarkdown: 'v1',
      };
      const first = createWorkflow(root, cfg, params);
      transitionState(root, cfg, first.id, 'cancelled');
      const second = createWorkflow(root, cfg, params);
      expect(second.id).not.toBe(first.id);
      expect(readWorkflows(root, cfg)).toHaveLength(2);
    });

    it('honors the natural key per-site + per-slug + per-contentKind', () => {
      const cfg = config();
      createWorkflow(root, cfg, {
        site: 'a',
        slug: 's',
        contentKind: 'longform',
        initialMarkdown: 'x',
      });
      createWorkflow(root, cfg, {
        site: 'b',
        slug: 's',
        contentKind: 'longform',
        initialMarkdown: 'x',
      });
      createWorkflow(root, cfg, {
        site: 'a',
        slug: 's',
        contentKind: 'shortform',
        platform: 'reddit',
        channel: 'r/foo',
        initialMarkdown: 'x',
      });
      expect(readWorkflows(root, cfg)).toHaveLength(3);
    });
  });

  describe('transitionState', () => {
    it('advances state and appends a history entry', () => {
      const cfg = config();
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 's',
        contentKind: 'longform',
        initialMarkdown: 'x',
      });
      const t = transitionState(root, cfg, w.id, 'in-review');
      expect(t.state).toBe('in-review');
      expect(readWorkflow(root, cfg, w.id)?.state).toBe('in-review');
      const history = readHistory(root, cfg);
      expect(history.some((e) => e.kind === 'workflow-state')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      const cfg = config();
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 's',
        contentKind: 'longform',
        initialMarkdown: 'x',
      });
      // open -> approved isn't valid (must go in-review first)
      expect(() => transitionState(root, cfg, w.id, 'approved')).toThrow(
        /Invalid transition/,
      );
    });

    it('rejects transitions on an unknown workflow', () => {
      expect(() =>
        transitionState(root, config(), 'nope', 'in-review'),
      ).toThrow(/Unknown workflow/);
    });
  });

  describe('appendVersion + readVersions', () => {
    it('bumps currentVersion and records each version in history', () => {
      const cfg = config();
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 's',
        contentKind: 'longform',
        initialMarkdown: '# v1',
      });
      appendVersion(root, cfg, w.id, '# v2', 'agent');
      appendVersion(root, cfg, w.id, '# v3', 'operator');
      const vs = readVersions(root, cfg, w.id);
      expect(vs.map((v) => v.version)).toEqual([1, 2, 3]);
      expect(vs[1].originatedBy).toBe('agent');
      expect(vs[2].originatedBy).toBe('operator');
      expect(readWorkflow(root, cfg, w.id)?.currentVersion).toBe(3);
    });
  });

  describe('annotations', () => {
    it('filters by version when requested', () => {
      const cfg = config();
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 's',
        contentKind: 'longform',
        initialMarkdown: '# v1',
      });
      appendVersion(root, cfg, w.id, '# v2', 'agent');
      appendAnnotation(
        root,
        cfg,
        mintAnnotation({
          type: 'comment',
          workflowId: w.id,
          version: 1,
          range: { start: 0, end: 1 },
          text: 'on v1',
        }),
      );
      appendAnnotation(
        root,
        cfg,
        mintAnnotation({
          type: 'comment',
          workflowId: w.id,
          version: 2,
          range: { start: 0, end: 1 },
          text: 'on v2',
        }),
      );
      expect(readAnnotations(root, cfg, w.id, 1)).toHaveLength(1);
      expect(readAnnotations(root, cfg, w.id, 2)).toHaveLength(1);
      expect(readAnnotations(root, cfg, w.id)).toHaveLength(2);
    });

    it('routes edit annotations via beforeVersion', () => {
      const cfg = config();
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 's',
        contentKind: 'longform',
        initialMarkdown: 'x',
      });
      appendAnnotation(
        root,
        cfg,
        mintAnnotation({
          type: 'edit',
          workflowId: w.id,
          beforeVersion: 1,
          afterMarkdown: 'y',
          diff: '-x\n+y\n',
        }),
      );
      expect(readAnnotations(root, cfg, w.id, 1)).toHaveLength(1);
    });
  });

  describe('listOpen', () => {
    it('returns only non-terminal workflows, optionally filtered by site', () => {
      const cfg = config();
      const w1 = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'p1',
        contentKind: 'longform',
        initialMarkdown: '.',
      });
      createWorkflow(root, cfg, {
        site: 'b',
        slug: 'p2',
        contentKind: 'longform',
        initialMarkdown: '.',
      });
      transitionState(root, cfg, w1.id, 'cancelled');
      expect(listOpen(root, cfg).map((w) => w.slug)).toEqual(['p2']);
      expect(listOpen(root, cfg, 'b').map((w) => w.slug)).toEqual(['p2']);
      expect(listOpen(root, cfg, 'a')).toHaveLength(0);
    });
  });

  describe('custom reviewJournalDir', () => {
    it('honors the config field when set', () => {
      const cfg = config('custom-journal');
      createWorkflow(root, cfg, {
        site: 'a',
        slug: 's',
        contentKind: 'longform',
        initialMarkdown: 'x',
      });
      expect(existsSync(join(root, 'custom-journal/pipeline'))).toBe(true);
      expect(existsSync(join(root, '.deskwork/review-journal/pipeline'))).toBe(
        false,
      );
    });
  });
});

describe('isValidTransition', () => {
  it('accepts the full happy path', () => {
    expect(isValidTransition('open', 'in-review')).toBe(true);
    expect(isValidTransition('in-review', 'approved')).toBe(true);
    expect(isValidTransition('approved', 'applied')).toBe(true);
  });

  it('accepts cancellation from every non-terminal state', () => {
    expect(isValidTransition('open', 'cancelled')).toBe(true);
    expect(isValidTransition('in-review', 'cancelled')).toBe(true);
    expect(isValidTransition('iterating', 'cancelled')).toBe(true);
    expect(isValidTransition('approved', 'cancelled')).toBe(true);
  });

  it('rejects jumps and transitions out of terminal states', () => {
    expect(isValidTransition('open', 'applied')).toBe(false);
    expect(isValidTransition('applied', 'open')).toBe(false);
    expect(isValidTransition('cancelled', 'open')).toBe(false);
  });
});
