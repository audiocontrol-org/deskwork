/**
 * Unit coverage for the ingest discovery primitive.
 *
 * Each test builds a real on-disk fixture under tmpdir() (no fs mocks)
 * and exercises a single derivation rule or filter behavior. Tests run
 * sequentially per project to avoid stomping on shared cwd.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverIngestCandidates,
  candidateToEntry,
  type IngestOptions,
} from '../src/ingest.ts';
import type { EditorialCalendar } from '../src/types.ts';

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'deskwork-ingest-'));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function write(path: string, contents: string): string {
  const abs = join(project, path);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, contents, 'utf-8');
  return abs;
}

function setMtime(abs: string, iso: string): void {
  const t = new Date(iso);
  utimesSync(abs, t, t);
}

function baseOpts(overrides?: Partial<IngestOptions>): IngestOptions {
  return {
    projectRoot: project,
    ...overrides,
  };
}

describe('discoverIngestCandidates — slug derivation', () => {
  it('uses parent dir name for <slug>/index.md', () => {
    write(
      'src/content/essays/whats-in-a-name/index.md',
      '---\ntitle: Whats In A Name\nstate: published\ndatePublished: 2020-10-01\n---\n\nbody',
    );
    const r = discoverIngestCandidates(
      [join(project, 'src/content/essays/whats-in-a-name/index.md')],
      baseOpts(),
    );
    expect(r.skips).toEqual([]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].derivedSlug).toBe('whats-in-a-name');
    expect(r.candidates[0].slugSource).toBe('path');
  });

  it('uses parent dir name for <slug>/README.md', () => {
    write(
      'content/posts/hello/README.md',
      '---\ntitle: Hello\n---\n\nhi',
    );
    const r = discoverIngestCandidates(
      [join(project, 'content/posts/hello/README.md')],
      baseOpts(),
    );
    expect(r.candidates[0].derivedSlug).toBe('hello');
  });

  it('recognizes Jekyll YYYY-MM-DD-<slug>.md', () => {
    write(
      '_posts/2024-01-15-hello-world.md',
      '---\ntitle: Hello World\n---\n\nbody',
    );
    const r = discoverIngestCandidates(
      [join(project, '_posts/2024-01-15-hello-world.md')],
      baseOpts(),
    );
    expect(r.candidates[0].derivedSlug).toBe('hello-world');
    expect(r.candidates[0].slugSource).toBe('path');
  });

  it('uses filename minus extension for flat <slug>.md', () => {
    write('posts/foo.md', '---\ntitle: Foo\n---\n\n');
    const r = discoverIngestCandidates(
      [join(project, 'posts/foo.md')],
      baseOpts(),
    );
    expect(r.candidates[0].derivedSlug).toBe('foo');
  });

  it('produces hierarchical slugs only when ancestors are content nodes (have own index.md)', () => {
    // the-outbound and characters both have their own index.md — they're
    // tracked content nodes, so their names prefix child slugs.
    write(
      'src/content/the-outbound/index.md',
      '---\ntitle: The Outbound\n---\nbody',
    );
    write(
      'src/content/the-outbound/characters/index.md',
      '---\ntitle: Characters\n---\nbody',
    );
    write(
      'src/content/the-outbound/characters/strivers/index.md',
      '---\ntitle: Strivers\n---\nbody',
    );
    write(
      'src/content/the-outbound/characters/dreamers/index.md',
      '---\ntitle: Dreamers\n---\nbody',
    );
    write(
      'src/content/the-outbound/structure/index.md',
      '---\ntitle: Structure\n---\nbody',
    );
    const r = discoverIngestCandidates(
      [join(project, 'src/content/the-outbound')],
      baseOpts(),
    );
    expect(r.skips).toEqual([]);
    const slugs = r.candidates.map((c) => c.derivedSlug).sort();
    // the-outbound/index.md → slug "the-outbound" (relative to root, just leaf)
    // characters/index.md → "characters" (parent the-outbound has own index, prefixes)
    // strivers → prefixed via characters → "the-outbound/characters/strivers"
    expect(slugs).toEqual([
      'the-outbound',
      'the-outbound/characters',
      'the-outbound/characters/dreamers',
      'the-outbound/characters/strivers',
      'the-outbound/structure',
    ]);
  });

  it('does NOT prefix collection root onto child slugs when root has no own index.md', () => {
    // essays/ has no essays/index.md → it's a collection container,
    // not a content node. Children get unprefixed slugs.
    write(
      'src/content/essays/foo/index.md',
      '---\ntitle: Foo\n---\nbody',
    );
    write(
      'src/content/essays/bar/index.md',
      '---\ntitle: Bar\n---\nbody',
    );
    const r = discoverIngestCandidates(
      [join(project, 'src/content/essays')],
      baseOpts(),
    );
    const slugs = r.candidates.map((c) => c.derivedSlug).sort();
    expect(slugs).toEqual(['bar', 'foo']);
  });

  it('honors --slug-from frontmatter', () => {
    write(
      'src/content/posts/anything.md',
      '---\nslug: my-real-slug\ntitle: Whatever\n---\nbody',
    );
    const r = discoverIngestCandidates(
      [join(project, 'src/content/posts/anything.md')],
      baseOpts({ slugFrom: 'frontmatter' }),
    );
    expect(r.candidates[0].derivedSlug).toBe('my-real-slug');
    expect(r.candidates[0].slugSource).toBe('frontmatter');
  });

  it('falls back to path when --slug-from frontmatter has no slug field', () => {
    write(
      'src/content/posts/file-name-here.md',
      '---\ntitle: Whatever\n---\nbody',
    );
    const r = discoverIngestCandidates(
      [join(project, 'src/content/posts/file-name-here.md')],
      baseOpts({ slugFrom: 'frontmatter' }),
    );
    expect(r.candidates[0].derivedSlug).toBe('file-name-here');
    expect(r.candidates[0].slugSource).toBe('path');
  });

  it('supports custom slug-field name', () => {
    write(
      'src/posts/x.md',
      '---\npermalink: special-slug\ntitle: X\n---\n',
    );
    const r = discoverIngestCandidates(
      [join(project, 'src/posts/x.md')],
      baseOpts({
        slugFrom: 'frontmatter',
        fieldNames: { slug: 'permalink' },
      }),
    );
    expect(r.candidates[0].derivedSlug).toBe('special-slug');
  });

  it('explicit slug overrides everything for single-file ingest', () => {
    write('src/posts/x.md', '---\nslug: ignored\ntitle: X\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'src/posts/x.md')],
      baseOpts({ explicitSlug: 'manual-override' }),
    );
    expect(r.candidates[0].derivedSlug).toBe('manual-override');
    expect(r.candidates[0].slugSource).toBe('explicit');
  });

  it('rejects --slug when more than one file matches', () => {
    write('a/x.md', '---\ntitle: x\n---\n');
    write('a/y.md', '---\ntitle: y\n---\n');
    expect(() =>
      discoverIngestCandidates([join(project, 'a')], baseOpts({ explicitSlug: 'foo' })),
    ).toThrow(/exactly one matched file/);
  });

  it('skips files with malformed kebab-case derived slug', () => {
    write('posts/Bad_Name!.md', '---\ntitle: Bad\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'posts/Bad_Name!.md')],
      baseOpts(),
    );
    expect(r.candidates).toEqual([]);
    expect(r.skips).toHaveLength(1);
    expect(r.skips[0].reason).toMatch(/not valid kebab-case/);
  });
});

describe('discoverIngestCandidates — state derivation', () => {
  it('reads `state: published` from frontmatter', () => {
    write(
      'p.md',
      '---\ntitle: P\nstate: published\n---\n',
    );
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].derivedState).toBe('Published');
    expect(r.candidates[0].stateSource).toBe('frontmatter');
  });

  it('maps `state: draft` → Drafting', () => {
    write('p.md', '---\ntitle: P\nstate: draft\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].derivedState).toBe('Drafting');
  });

  it('maps `state: outline` → Outlining', () => {
    write('p.md', '---\ntitle: P\nstate: outline\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].derivedState).toBe('Outlining');
  });

  it('maps `state: planned` → Planned', () => {
    write('p.md', '---\ntitle: P\nstate: planned\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].derivedState).toBe('Planned');
  });

  it('reports ambiguous state for unrecognized values', () => {
    write('p.md', '---\ntitle: P\nstate: published-elsewhere\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].derivedState).toBeNull();
    expect(r.candidates[0].rawState).toBe('published-elsewhere');
  });

  it('defaults to Drafting when no state field is present (#206)', () => {
    // /deskwork:ingest is for existing content with body text; the
    // semantic distinction with /deskwork:add (which captures new
    // ideas) means an ingested file with no explicit state belongs in
    // Drafting, not Ideas. Pre-#206 default was Ideas.
    write('p.md', '---\ntitle: P\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].derivedState).toBe('Drafting');
    // The value did not come from the file; provenance must reflect
    // that (#23). Was previously labeled 'frontmatter' (a lie).
    expect(r.candidates[0].stateSource).toBe('default');
  });

  it('labels state source as `default` when --state-from datePublished has no datePublished (#206)', () => {
    // No datePublished + stateFrom datePublished → defaults to
    // Drafting per #206. The audit trail must say `default`, not
    // `frontmatter` (#23).
    write('p.md', '---\ntitle: P\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'p.md')],
      baseOpts({ stateFrom: 'datePublished' }),
    );
    expect(r.candidates[0].derivedState).toBe('Drafting');
    expect(r.candidates[0].stateSource).toBe('default');
  });

  it('explicit --state Ideas overrides the new Drafting default (#206)', () => {
    // The default flipped to Drafting; explicit --state still wins.
    // Operators who want an ingested file in Ideas can pass --state.
    write('p.md', '---\ntitle: P\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'p.md')],
      baseOpts({ explicitState: 'Ideas' }),
    );
    expect(r.candidates[0].derivedState).toBe('Ideas');
    expect(r.candidates[0].stateSource).toBe('explicit');
  });

  it('frontmatter state: ideas wins over the new Drafting default (#206)', () => {
    // Default flipped to Drafting, but frontmatter still wins. A file
    // that explicitly carries `state: ideas` lands in Ideas.
    write('p.md', '---\ntitle: P\nstate: ideas\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].derivedState).toBe('Ideas');
    expect(r.candidates[0].stateSource).toBe('frontmatter');
  });

  it('keeps state source as `frontmatter` when frontmatter has a real `state:` field', () => {
    // Regression: only the fallback path should be `default`. Files
    // that actually carry a state field still report `frontmatter`.
    write('p.md', '---\ntitle: P\nstate: drafting\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].derivedState).toBe('Drafting');
    expect(r.candidates[0].stateSource).toBe('frontmatter');
  });

  it('--state-from datePublished + past date → Published', () => {
    write(
      'p.md',
      '---\ntitle: P\ndatePublished: 2020-01-15\n---\n',
    );
    const r = discoverIngestCandidates(
      [join(project, 'p.md')],
      baseOpts({ stateFrom: 'datePublished', now: new Date('2026-04-01') }),
    );
    expect(r.candidates[0].derivedState).toBe('Published');
  });

  it('--state-from datePublished + future date → Drafting', () => {
    write(
      'p.md',
      '---\ntitle: P\ndatePublished: 2099-01-15\n---\n',
    );
    const r = discoverIngestCandidates(
      [join(project, 'p.md')],
      baseOpts({ stateFrom: 'datePublished', now: new Date('2026-04-01') }),
    );
    expect(r.candidates[0].derivedState).toBe('Drafting');
  });

  it('explicit --state wins over derivation', () => {
    write('p.md', '---\ntitle: P\nstate: published\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'p.md')],
      baseOpts({ explicitState: 'Drafting' }),
    );
    expect(r.candidates[0].derivedState).toBe('Drafting');
    expect(r.candidates[0].stateSource).toBe('explicit');
  });

  it('honors custom state-field name', () => {
    write('p.md', '---\ntitle: P\nstatus: draft\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'p.md')],
      baseOpts({ fieldNames: { state: 'status' } }),
    );
    expect(r.candidates[0].derivedState).toBe('Drafting');
  });
});

describe('discoverIngestCandidates — date derivation', () => {
  it('reads ISO datePublished from frontmatter', () => {
    write(
      'p.md',
      '---\ntitle: P\ndatePublished: 2020-10-01\n---\n',
    );
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].derivedDate).toBe('2020-10-01');
    expect(r.candidates[0].dateSource).toBe('frontmatter');
  });

  it('falls back to `date` field when datePublished is absent', () => {
    write('p.md', '---\ntitle: P\ndate: 2019-05-04\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].derivedDate).toBe('2019-05-04');
  });

  it('honors custom date-field name', () => {
    write('p.md', '---\ntitle: P\nshippedOn: 2018-03-03\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'p.md')],
      baseOpts({ fieldNames: { date: 'shippedOn' } }),
    );
    expect(r.candidates[0].derivedDate).toBe('2018-03-03');
  });

  it('falls back to mtime when no date in frontmatter', () => {
    const abs = write('p.md', '---\ntitle: P\n---\n');
    setMtime(abs, '2017-07-07T00:00:00Z');
    const r = discoverIngestCandidates([abs], baseOpts());
    expect(r.candidates[0].derivedDate).toBe('2017-07-07');
    expect(r.candidates[0].dateSource).toBe('mtime');
  });

  it('explicit --date wins', () => {
    write('p.md', '---\ntitle: P\ndatePublished: 2020-01-01\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'p.md')],
      baseOpts({ explicitDate: '1999-12-31' }),
    );
    expect(r.candidates[0].derivedDate).toBe('1999-12-31');
    expect(r.candidates[0].dateSource).toBe('explicit');
  });

  it('parses YAML-native Date values (unquoted YYYY-MM-DD)', () => {
    // unquoted YYYY-MM-DD parses to a JS Date in `yaml`; verify the
    // reader normalizes that back to ISO string form.
    write(
      'p.md',
      '---\ntitle: P\ndatePublished: 2021-06-15\n---\n',
    );
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].derivedDate).toBe('2021-06-15');
  });
});

describe('discoverIngestCandidates — idempotency', () => {
  function calendarWith(slug: string): EditorialCalendar {
    return {
      entries: [
        {
          id: 'fake-id',
          slug,
          title: 'existing',
          description: '',
          stage: 'Published',
          targetKeywords: [],
          source: 'manual',
        },
      ],
      distributions: [],
    };
  }

  it('skips candidates whose slug already exists', () => {
    write('posts/foo.md', '---\ntitle: Foo\nstate: published\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'posts/foo.md')],
      baseOpts({ calendar: calendarWith('foo') }),
    );
    expect(r.candidates).toEqual([]);
    expect(r.skips).toHaveLength(1);
    expect(r.skips[0].slug).toBe('foo');
    expect(r.skips[0].reason).toMatch(/already has an entry/);
  });

  it('--force bypasses the duplicate skip', () => {
    write('posts/foo.md', '---\ntitle: Foo\nstate: published\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'posts/foo.md')],
      baseOpts({ calendar: calendarWith('foo'), force: true }),
    );
    expect(r.skips).toEqual([]);
    expect(r.candidates).toHaveLength(1);
  });
});

describe('discoverIngestCandidates — discovery', () => {
  it('walks a directory recursively for markdown files', () => {
    write('a/x.md', '---\ntitle: x\n---\n');
    write('a/b/y.md', '---\ntitle: y\n---\n');
    write('a/b/c/z.md', '---\ntitle: z\n---\n');
    write('a/ignore.txt', 'not markdown');
    const r = discoverIngestCandidates([join(project, 'a')], baseOpts());
    // Directories (a/, b/, c/) have no own index.md → slugs aren't
    // prefixed by their names.
    const slugs = r.candidates.map((c) => c.derivedSlug).sort();
    expect(slugs).toEqual(['x', 'y', 'z']);
  });

  it('expands glob patterns', () => {
    write('content/posts/2024/a.md', '---\ntitle: a\n---\n');
    write('content/posts/2025/b.md', '---\ntitle: b\n---\n');
    write('content/notes/c.md', '---\ntitle: c\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'content/posts/**/*.md')],
      baseOpts(),
    );
    // Glob's static prefix is `content/posts/`. 2024/ and 2025/ have
    // no own index.md, so they don't prefix slugs.
    const slugs = r.candidates.map((c) => c.derivedSlug).sort();
    expect(slugs).toEqual(['a', 'b']);
  });

  it('accepts a single file directly', () => {
    write('p.md', '---\ntitle: Pee\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates).toHaveLength(1);
  });

  it('throws on nonexistent paths', () => {
    expect(() =>
      discoverIngestCandidates([join(project, 'nope.md')], baseOpts()),
    ).toThrow(/does not exist/);
  });

  it('throws on a non-markdown file path', () => {
    write('foo.txt', 'hello');
    expect(() =>
      discoverIngestCandidates([join(project, 'foo.txt')], baseOpts()),
    ).toThrow(/not a markdown file/);
  });

  it('skips files under scrapbook roots', () => {
    write('content/posts/x.md', '---\ntitle: x\n---\n');
    write('content/scrapbook/secret/y.md', '---\ntitle: y\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'content')],
      baseOpts({ scrapbookRoots: [join(project, 'content/scrapbook')] }),
    );
    expect(r.candidates.map((c) => c.derivedSlug)).toEqual(['x']);
    expect(r.skips).toHaveLength(1);
    expect(r.skips[0].reason).toMatch(/scrapbook/);
  });

  it('skips files under nested scrapbook dirs at any depth (#20)', () => {
    // Two scrapbook dirs at different depths in a hierarchical tree,
    // both containing a same-named markdown file. Without the path-
    // segment-aware predicate, the deeper scrapbook leaks through and
    // produces a duplicate calendar row. Both must be skipped.
    write('content/the-outbound/index.md', '---\ntitle: outbound\n---\n');
    write('content/the-outbound/scrapbook/archetypes.md', '---\ntitle: a\n---\n');
    write('content/the-outbound/characters/index.md', '---\ntitle: chars\n---\n');
    write(
      'content/the-outbound/characters/scrapbook/archetypes.md',
      '---\ntitle: a\n---\n',
    );
    const r = discoverIngestCandidates(
      [join(project, 'content')],
      // Note: scrapbookRoots intentionally NOT supplied — the predicate
      // must match by path segment alone. The CLI still threads
      // `<contentDir>/scrapbook` for backward compat but the deeper
      // `<...>/characters/scrapbook/` was never on that list.
      baseOpts(),
    );
    const slugs = r.candidates.map((c) => c.derivedSlug).sort();
    // Only the two real content nodes ingest — neither archetypes.md.
    expect(slugs).toEqual([
      'the-outbound',
      'the-outbound/characters',
    ]);
    expect(r.skips.filter((s) => /scrapbook/.test(s.reason))).toHaveLength(2);
  });

  it('does not false-positive on directory names containing "scrapbook"', () => {
    // A directory literally named `scrapbookery/` is NOT a scrapbook
    // dir — only an exact segment match of `scrapbook` should skip.
    write('content/scrapbookery/post.md', '---\ntitle: p\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'content')],
      baseOpts(),
    );
    // Whatever slug derivation produces, the file must NOT be filtered
    // out as a scrapbook entry — the predicate is what's under test.
    expect(r.candidates).toHaveLength(1);
    expect(r.skips.filter((s) => /scrapbook/.test(s.reason))).toHaveLength(0);
  });

  it('handles a malformed-frontmatter file as a skip, not a throw', () => {
    write('bad.md', '---\nthis is: not: parseable: YAML:\n---\nbody');
    write('good.md', '---\ntitle: Good\n---\nbody');
    const r = discoverIngestCandidates(
      [join(project, 'bad.md'), join(project, 'good.md')],
      baseOpts(),
    );
    expect(r.candidates.map((c) => c.derivedSlug)).toEqual(['good']);
    expect(r.skips).toHaveLength(1);
    expect(r.skips[0].reason).toMatch(/frontmatter parse failed/);
  });

  it('deduplicates files matched by multiple paths', () => {
    write('a/x.md', '---\ntitle: x\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'a/x.md'), join(project, 'a')],
      baseOpts(),
    );
    expect(r.candidates).toHaveLength(1);
  });

  it('throws when no paths supplied', () => {
    expect(() => discoverIngestCandidates([], baseOpts())).toThrow(/at least one path/);
  });

  it('requires absolute projectRoot', () => {
    write('p.md', '---\ntitle: p\n---\n');
    expect(() =>
      discoverIngestCandidates([join(project, 'p.md')], { projectRoot: 'rel/path' }),
    ).toThrow(/absolute path/);
  });
});

describe('discoverIngestCandidates — title and description', () => {
  it('reads title from frontmatter', () => {
    write('p.md', '---\ntitle: My Real Title\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].title).toBe('My Real Title');
  });

  it('humanizes the slug leaf when no title field is set', () => {
    write('the-outbound/characters/strivers/index.md', '---\nstate: planned\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'the-outbound/characters/strivers/index.md')],
      baseOpts(),
    );
    // Single-file argument → root is the file's parent
    // (`.../strivers`) → slug is `strivers`. Title humanizes to "Strivers".
    expect(r.candidates[0].title).toBe('Strivers');
  });

  it('reads description from frontmatter', () => {
    write('p.md', '---\ntitle: P\ndescription: a great post\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    expect(r.candidates[0].description).toBe('a great post');
  });

  it('honors custom title-field name', () => {
    write('p.md', '---\nheading: Heading As Title\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'p.md')],
      baseOpts({ fieldNames: { title: 'heading' } }),
    );
    expect(r.candidates[0].title).toBe('Heading As Title');
  });
});

describe('discoverIngestCandidates — README.md without frontmatter (#23)', () => {
  it('skips README.md with no frontmatter as organizational, not pipeline', () => {
    write(
      'src/content/projects/the-outbound/characters/README.md',
      'Just a folder description.\nNo frontmatter at all.\n',
    );
    const r = discoverIngestCandidates(
      [join(project, 'src/content/projects/the-outbound/characters/README.md')],
      baseOpts(),
    );
    expect(r.candidates).toEqual([]);
    expect(r.skips).toHaveLength(1);
    expect(r.skips[0].reason).toBe(
      'README.md without frontmatter (organizational, not pipeline)',
    );
  });

  it('still ingests README.md WITH frontmatter (Phase 13 --layout readme)', () => {
    write(
      'content/posts/hello/README.md',
      '---\ntitle: Hello\nstate: drafting\n---\n\nbody',
    );
    const r = discoverIngestCandidates(
      [join(project, 'content/posts/hello/README.md')],
      baseOpts(),
    );
    expect(r.skips).toEqual([]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].derivedSlug).toBe('hello');
    expect(r.candidates[0].derivedState).toBe('Drafting');
  });

  it('still ingests index.md with no frontmatter (default-to-Drafting per #206)', () => {
    // The README rule is README-specific. index.md keeps its existing
    // behavior — it ingests, defaulting state to Drafting (was Ideas
    // pre-#206; flipped per the add/ingest semantic distinction).
    // Provenance labels that default honestly.
    write('content/posts/hello/index.md', 'no frontmatter here\n');
    const r = discoverIngestCandidates(
      [join(project, 'content/posts/hello/index.md')],
      baseOpts(),
    );
    expect(r.skips).toEqual([]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].derivedSlug).toBe('hello');
    expect(r.candidates[0].derivedState).toBe('Drafting');
    expect(r.candidates[0].stateSource).toBe('default');
  });

  it('treats README detection as case-insensitive across .md extensions', () => {
    // `Readme.md`, `readme.md`, `README.MD`, `README.mdx`, `README.markdown`
    // are all README-shaped — none ingest when frontmatter is absent.
    // We layer them under different parent dirs to keep slug-derivation
    // collisions from confounding the assertion.
    write('a/Readme.md', 'plain prose\n');
    write('b/readme.md', 'plain prose\n');
    write('c/README.MD', 'plain prose\n');
    write('d/README.mdx', 'plain prose\n');
    write('e/README.markdown', 'plain prose\n');
    const r = discoverIngestCandidates([join(project)], baseOpts());
    expect(r.candidates).toEqual([]);
    expect(r.skips).toHaveLength(5);
    for (const skip of r.skips) {
      expect(skip.reason).toBe(
        'README.md without frontmatter (organizational, not pipeline)',
      );
    }
  });

  it('regression: writingcontrol.org `the-outbound` shape produces 2 entries, not 7 (#23)', () => {
    // Mirrors the operator's repro from issue #23. Pre-fix this
    // produced 7 calendar entries (2 real + 5 README organizational
    // nodes that polluted Ideas). Post-fix, only the index.md files
    // ingest — the READMEs are correctly skipped.
    write(
      'src/content/projects/the-outbound/index.md',
      '---\ntitle: The Outbound\nstate: published\ndatePublished: 2026-04-26\n---\nbody',
    );
    write(
      'src/content/projects/the-outbound/characters/README.md',
      'Folder describing characters.\n',
    );
    write(
      'src/content/projects/the-outbound/characters/strivers/README.md',
      'Strivers folder.\n',
    );
    write(
      'src/content/projects/the-outbound/settings/README.md',
      'Settings folder.\n',
    );
    write(
      'src/content/projects/the-outbound/settings/libertardistan/README.md',
      'Libertardistan folder.\n',
    );
    write(
      'src/content/projects/the-outbound/structure/README.md',
      'Structure folder.\n',
    );
    // A neighbor `field-notes` index.md to match the operator's plan
    // output (Published, with frontmatter date).
    write(
      'src/content/projects/field-notes/index.md',
      '---\ntitle: Field Notes\nstate: published\ndatePublished: 2026-04-10\n---\nbody',
    );
    const r = discoverIngestCandidates(
      [join(project, 'src/content/projects')],
      baseOpts(),
    );
    const slugs = r.candidates.map((c) => c.derivedSlug).sort();
    expect(slugs).toEqual(['field-notes', 'the-outbound']);
    // Every README skip should carry the organizational-rationale
    // reason — exactly 5 of them (one per folder README).
    const readmeSkips = r.skips.filter((s) =>
      /README\.md without frontmatter/.test(s.reason),
    );
    expect(readmeSkips).toHaveLength(5);
  });

  it('does not skip a README.md that has frontmatter even if frontmatter is sparse', () => {
    // Sparse but non-empty frontmatter (a single `title:` field) is
    // still a deliberate signal from the operator that this README is
    // a content node — keep ingesting it.
    write('content/posts/sparse/README.md', '---\ntitle: Sparse\n---\n');
    const r = discoverIngestCandidates(
      [join(project, 'content/posts/sparse/README.md')],
      baseOpts(),
    );
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].derivedSlug).toBe('sparse');
  });
});

describe('candidateToEntry', () => {
  it('builds a CalendarEntry shape from a candidate', () => {
    write(
      'p.md',
      '---\ntitle: T\ndescription: D\nstate: published\ndatePublished: 2020-01-01\n---\n',
    );
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    const entry = candidateToEntry(r.candidates[0], 'Published');
    expect(entry).toMatchObject({
      slug: 'p',
      title: 'T',
      description: 'D',
      stage: 'Published',
      datePublished: '2020-01-01',
      source: 'manual',
    });
  });

  it('omits datePublished for non-Published lanes', () => {
    write('p.md', '---\ntitle: T\ndatePublished: 2020-01-01\n---\n');
    const r = discoverIngestCandidates([join(project, 'p.md')], baseOpts());
    const entry = candidateToEntry(r.candidates[0], 'Drafting');
    expect(entry.datePublished).toBeUndefined();
  });
});
