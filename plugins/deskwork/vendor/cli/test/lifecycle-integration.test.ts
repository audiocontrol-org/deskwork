/**
 * End-to-end integration tests for the four lifecycle helpers.
 *
 * Each test spawns the real bin/ script against a tmp-directory project
 * that has been bootstrapped with deskwork-install. Asserts the final
 * calendar state on disk, not just the script's JSON output.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCalendar } from '@deskwork/core/calendar';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  json?: unknown;
}

function run(script: string, args: string[]): RunResult {
  // Accept legacy "deskwork-X" names; strip the prefix so the
  // dispatcher receives "X" as the subcommand.
  const subcommand = script.replace(/^deskwork-/, '');
  const r = spawnSync(deskworkBin, [subcommand, ...args], { encoding: 'utf-8' });
  const stdout = r.stdout ?? '';
  let json: unknown;
  try {
    json = stdout.trim().length > 0 ? JSON.parse(stdout) : undefined;
  } catch {
    // leave json undefined on parse failure; tests that care will fail on the assertion
  }
  return {
    code: r.status ?? -1,
    stdout,
    stderr: r.stderr ?? '',
    ...(json !== undefined ? { json } : {}),
  };
}

function bootstrapProject(
  options: { withAuthor?: boolean; withBlogLayout?: boolean } = {},
): string {
  const { withAuthor = true, withBlogLayout = true } = options;
  const project = mkdtempSync(join(tmpdir(), 'deskwork-lifecycle-'));
  const configDir = mkdtempSync(join(tmpdir(), 'deskwork-lifecycle-cfg-'));
  const site: Record<string, unknown> = {
    host: 'example.com',
    contentDir: 'src/sites/main/pages/blog',
    calendarPath: 'docs/calendar.md',
  };
  if (withBlogLayout) site.blogLayout = '../../../layouts/BlogLayout.astro';

  const config: Record<string, unknown> = {
    version: 1,
    sites: { main: site },
  };
  if (withAuthor) config.author = 'Test Author';

  const cfgFile = join(configDir, 'config.json');
  writeFileSync(cfgFile, JSON.stringify(config), 'utf-8');

  const installRes = run('deskwork-install', [project, cfgFile]);
  if (installRes.code !== 0) {
    rmSync(project, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
    throw new Error(`install failed: ${installRes.stderr || installRes.stdout}`);
  }
  rmSync(configDir, { recursive: true, force: true });
  return project;
}

function readProjectCalendar(project: string) {
  const raw = readFileSync(join(project, 'docs/calendar.md'), 'utf-8');
  return parseCalendar(raw);
}

describe('deskwork-add', () => {
  let project: string;
  beforeEach(() => {
    project = bootstrapProject();
  });

  it('adds an Ideas entry and writes the calendar', () => {
    const res = run('deskwork-add', [project, 'My First Post', 'short desc']);
    expect(res.code).toBe(0);
    expect(res.json).toMatchObject({
      slug: 'my-first-post',
      stage: 'Ideas',
      description: 'short desc',
      site: 'main',
    });

    const cal = readProjectCalendar(project);
    expect(cal.entries).toHaveLength(1);
    expect(cal.entries[0].slug).toBe('my-first-post');
    rmSync(project, { recursive: true, force: true });
  });

  it('accepts --type and --content-url for a youtube entry', () => {
    const res = run('deskwork-add', [
      project,
      '--type',
      'youtube',
      '--content-url',
      'https://youtu.be/abc',
      'Cool Video',
    ]);
    expect(res.code).toBe(0);
    expect(res.json).toMatchObject({
      slug: 'cool-video',
      contentType: 'youtube',
      contentUrl: 'https://youtu.be/abc',
    });
    rmSync(project, { recursive: true, force: true });
  });

  it('rejects an invalid --type', () => {
    const res = run('deskwork-add', [project, '--type', 'podcast', 'X']);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid --type/);
    rmSync(project, { recursive: true, force: true });
  });

  it('refuses a duplicate slug', () => {
    run('deskwork-add', [project, 'Dup']);
    const res = run('deskwork-add', [project, 'Dup']);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/already exists/);
    rmSync(project, { recursive: true, force: true });
  });
});

describe('deskwork-plan', () => {
  it('moves Ideas → Planned with keywords and topics', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'Topic Piece']);
      const res = run('deskwork-plan', [
        project,
        '--topics',
        'synthdiy,vintage',
        'topic-piece',
        'one',
        'two,three',
      ]);
      expect(res.code).toBe(0);
      expect(res.json).toMatchObject({
        slug: 'topic-piece',
        stage: 'Planned',
        targetKeywords: ['one', 'two', 'three'],
        topics: ['synthdiy', 'vintage'],
      });

      const cal = readProjectCalendar(project);
      const entry = cal.entries.find((e) => e.slug === 'topic-piece')!;
      expect(entry.stage).toBe('Planned');
      expect(entry.targetKeywords).toEqual(['one', 'two', 'three']);
      expect(entry.topics).toEqual(['synthdiy', 'vintage']);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('errors when the entry is not in Ideas', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'Planned Already']);
      run('deskwork-plan', [project, 'planned-already', 'kw']);
      const res = run('deskwork-plan', [project, 'planned-already', 'kw']);
      expect(res.code).not.toBe(0);
      expect(res.stderr).toMatch(/must be in Ideas/);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

describe('deskwork-outline', () => {
  it('scaffolds a blog post and moves entry to Outlining', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'Outline Me']);
      run('deskwork-plan', [project, 'outline-me', 'keyword']);

      const res = run('deskwork-outline', [project, 'outline-me']);
      expect(res.code).toBe(0);
      expect(res.json).toMatchObject({
        slug: 'outline-me',
        stage: 'Outlining',
        contentType: 'blog',
      });
      const scaffolded = (res.json as { scaffolded?: { filePath: string } })
        .scaffolded;
      expect(scaffolded).toBeDefined();
      expect(existsSync(scaffolded!.filePath)).toBe(true);

      const body = readFileSync(scaffolded!.filePath, 'utf-8');
      expect(body).toContain('title: Outline Me');
      expect(body).toContain('author: Test Author');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('does NOT scaffold a file for a youtube entry (but still flips stage)', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [
        project,
        '--type',
        'youtube',
        '--content-url',
        'https://youtu.be/abc',
        'YouTube Idea',
      ]);
      run('deskwork-plan', [project, 'youtube-idea']);

      const res = run('deskwork-outline', [project, 'youtube-idea']);
      expect(res.code).toBe(0);
      expect(res.json).toMatchObject({
        stage: 'Outlining',
        contentType: 'youtube',
        scaffolded: null,
      });

      const blogFile = join(
        project,
        'src/sites/main/pages/blog/youtube-idea/index.md',
      );
      expect(existsSync(blogFile)).toBe(false);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('errors when the entry is not in Planned', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'Just Ideas']);
      const res = run('deskwork-outline', [project, 'just-ideas']);
      expect(res.code).not.toBe(0);
      expect(res.stderr).toMatch(/must be in Planned/);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

describe('deskwork-draft', () => {
  it('moves Outlining to Drafting and records issue number', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'Draft Me']);
      run('deskwork-plan', [project, 'draft-me', 'keyword']);
      run('deskwork-outline', [project, 'draft-me']);

      const res = run('deskwork-draft', [project, '--issue', '42', 'draft-me']);
      expect(res.code).toBe(0);
      expect(res.json).toMatchObject({
        slug: 'draft-me',
        stage: 'Drafting',
        contentType: 'blog',
        issueNumber: 42,
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('errors when the entry is not in Outlining', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'Fresh Idea']);
      run('deskwork-plan', [project, 'fresh-idea', 'kw']);
      const res = run('deskwork-draft', [project, 'fresh-idea']);
      expect(res.code).not.toBe(0);
      expect(res.stderr).toMatch(/must be in Outlining/);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

describe('deskwork-publish', () => {
  it('publishes a blog entry after the file has been written', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'To Publish']);
      run('deskwork-plan', [project, 'to-publish', 'kw']);
      run('deskwork-outline', [project, 'to-publish']);
      run('deskwork-draft', [project, 'to-publish']);

      const res = run('deskwork-publish', [project, 'to-publish']);
      expect(res.code).toBe(0);
      expect(res.json).toMatchObject({
        slug: 'to-publish',
        stage: 'Published',
        contentType: 'blog',
      });
      expect(
        (res.json as { datePublished?: string }).datePublished,
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('refuses to publish a blog entry if the file is missing', () => {
    const project = bootstrapProject();
    try {
      // Draft then delete the blog file to simulate a missing source.
      run('deskwork-add', [project, 'Missing File']);
      run('deskwork-plan', [project, 'missing-file', 'kw']);
      const outlineRes = run('deskwork-outline', [project, 'missing-file']);
      const scaffolded = (
        outlineRes.json as { scaffolded: { filePath: string } }
      ).scaffolded;
      run('deskwork-draft', [project, 'missing-file']);
      rmSync(dirname(scaffolded.filePath), { recursive: true });

      const res = run('deskwork-publish', [project, 'missing-file']);
      expect(res.code).not.toBe(0);
      expect(res.stderr).toMatch(/no file at/);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('requires --content-url for a youtube entry when not already set', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, '--type', 'youtube', 'YT One']);
      run('deskwork-plan', [project, 'yt-one', 'kw']);
      run('deskwork-outline', [project, 'yt-one']);
      run('deskwork-draft', [project, 'yt-one']);

      const missing = run('deskwork-publish', [project, 'yt-one']);
      expect(missing.code).not.toBe(0);
      expect(missing.stderr).toMatch(/contentUrl/);

      const ok = run('deskwork-publish', [
        project,
        '--content-url',
        'https://youtu.be/xyz',
        'yt-one',
      ]);
      expect(ok.code).toBe(0);
      expect(ok.json).toMatchObject({
        contentUrl: 'https://youtu.be/xyz',
        stage: 'Published',
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('accepts an explicit --date', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'Dated']);
      run('deskwork-plan', [project, 'dated', 'kw']);
      run('deskwork-outline', [project, 'dated']);
      run('deskwork-draft', [project, 'dated']);

      const res = run('deskwork-publish', [project, '--date', '2020-01-15', 'dated']);
      expect(res.code).toBe(0);
      expect(res.json).toMatchObject({ datePublished: '2020-01-15' });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('refuses to re-publish an already-Published entry', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'Already Pub']);
      run('deskwork-plan', [project, 'already-pub', 'kw']);
      run('deskwork-outline', [project, 'already-pub']);
      run('deskwork-draft', [project, 'already-pub']);
      run('deskwork-publish', [project, 'already-pub']);

      const res = run('deskwork-publish', [project, 'already-pub']);
      expect(res.code).not.toBe(0);
      expect(res.stderr).toMatch(/already Published/);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

describe('hierarchical slugs', () => {
  let project: string;
  beforeEach(() => {
    project = bootstrapProject();
  });

  it('add --slug accepts a /-separated path and stores it', () => {
    const res = run('deskwork-add', [
      project,
      '--slug',
      'the-outbound/characters/strivers',
      'Strivers',
      'A character study',
    ]);
    expect(res.code).toBe(0);
    const cal = readProjectCalendar(project);
    expect(cal.entries).toHaveLength(1);
    expect(cal.entries[0].slug).toBe('the-outbound/characters/strivers');
    expect(cal.entries[0].title).toBe('Strivers');
  });

  it('add --slug rejects malformed paths', () => {
    const res = run('deskwork-add', [
      project,
      '--slug',
      'BadCase/here',
      'X',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--slug must be/);
  });

  it('plan + outline accept hierarchical slug positional', () => {
    run('deskwork-add', [
      project,
      '--slug',
      'a/b/c',
      'C piece',
    ]);
    const planRes = run('deskwork-plan', [project, 'a/b/c', 'kw']);
    expect(planRes.code).toBe(0);
    const outlineRes = run('deskwork-outline', [project, 'a/b/c']);
    expect(outlineRes.code).toBe(0);
    const cal = readProjectCalendar(project);
    expect(cal.entries[0].stage).toBe('Outlining');
    // default layout (no --layout) -> template-derived path on disk
    expect(existsSync(join(project, 'src/sites/main/pages/blog/a/b/c/index.md')))
      .toBe(true);
  });

  it('outline --layout flat writes <slug>.md (Phase 19a: filePath no longer stored on calendar)', () => {
    run('deskwork-add', [project, '--slug', 'parent/leaf', 'Leaf']);
    run('deskwork-plan', [project, 'parent/leaf', 'kw']);
    const res = run('deskwork-outline', [
      project,
      '--layout',
      'flat',
      'parent/leaf',
    ]);
    expect(res.code).toBe(0);
    expect(
      existsSync(join(project, 'src/sites/main/pages/blog/parent/leaf.md')),
    ).toBe(true);
    // The scaffolder still reports contentRelativePath in its JSON
    // result for operator visibility, but the calendar no longer
    // stores it (Phase 19c will rebind via frontmatter id + content
    // index instead).
    const scaffolded = (
      res.json as { scaffolded?: { contentRelativePath?: string } }
    ).scaffolded;
    expect(scaffolded?.contentRelativePath).toBe('parent/leaf.md');
  });

  it('outline --layout readme writes <slug>/README.md', () => {
    run('deskwork-add', [project, '--slug', 'p/q/r', 'R']);
    run('deskwork-plan', [project, 'p/q/r', 'kw']);
    const res = run('deskwork-outline', [
      project,
      '--layout',
      'readme',
      'p/q/r',
    ]);
    expect(res.code).toBe(0);
    expect(
      existsSync(join(project, 'src/sites/main/pages/blog/p/q/r/README.md')),
    ).toBe(true);
    const scaffolded = (
      res.json as { scaffolded?: { contentRelativePath?: string } }
    ).scaffolded;
    expect(scaffolded?.contentRelativePath).toBe('p/q/r/README.md');
  });

  it('outline rejects an unknown --layout value', () => {
    run('deskwork-add', [project, '--slug', 'x/y', 'Y']);
    run('deskwork-plan', [project, 'x/y', 'kw']);
    const res = run('deskwork-outline', [
      project,
      '--layout',
      'sideways',
      'x/y',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--layout must be/);
  });
});

describe('deskwork-pause / deskwork-resume (#27)', () => {
  it('pauses an Outlining entry and resumes it back to Outlining', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'Pause Test']);
      run('deskwork-plan', [project, 'pause-test', 'kw']);
      run('deskwork-outline', [project, 'pause-test']);

      const pauseRes = run('deskwork-pause', [project, 'pause-test']);
      expect(pauseRes.code).toBe(0);
      expect(pauseRes.json).toMatchObject({
        slug: 'pause-test',
        stage: 'Paused',
        pausedFrom: 'Outlining',
      });

      // Verify the on-disk calendar
      let cal = readProjectCalendar(project);
      expect(cal.entries[0].stage).toBe('Paused');
      expect(cal.entries[0].pausedFrom).toBe('Outlining');

      const resumeRes = run('deskwork-resume', [project, 'pause-test']);
      expect(resumeRes.code).toBe(0);
      expect(resumeRes.json).toMatchObject({
        slug: 'pause-test',
        stage: 'Outlining',
      });

      cal = readProjectCalendar(project);
      expect(cal.entries[0].stage).toBe('Outlining');
      expect(cal.entries[0].pausedFrom).toBeUndefined();
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('refuses to pause a Published entry', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'Already Shipped']);
      run('deskwork-plan', [project, 'already-shipped', 'kw']);
      run('deskwork-outline', [project, 'already-shipped']);
      run('deskwork-draft', [project, 'already-shipped']);
      run('deskwork-publish', [project, 'already-shipped']);

      const res = run('deskwork-pause', [project, 'already-shipped']);
      expect(res.code).not.toBe(0);
      expect(res.stderr).toMatch(/non-terminal/);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('refuses to resume a non-Paused entry', () => {
    const project = bootstrapProject();
    try {
      run('deskwork-add', [project, 'Idle Idea']);
      const res = run('deskwork-resume', [project, 'idle-idea']);
      expect(res.code).not.toBe(0);
      expect(res.stderr).toMatch(/only Paused/);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

// Suppress the unused mkdirSync import warning — kept for symmetry if tests grow.
void mkdirSync;
