import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  builtInBucketNames,
  loadBucketRegistry,
  resolveBucket,
  resolveQuery,
} from '../triage-issues/buckets.js';

describe('builtInBucketNames', () => {
  it('lists the three documented buckets', () => {
    expect(builtInBucketNames()).toEqual([
      'stale-30d',
      'unlabeled',
      'bug-no-comment-7d',
    ]);
  });
});

describe('resolveQuery', () => {
  const now = new Date('2026-05-28T12:00:00.000Z');

  it('passes through static templates', () => {
    expect(resolveQuery('state:open no:label', now)).toBe('state:open no:label');
  });

  it('substitutes $DATE_30d_AGO with an ISO date', () => {
    const out = resolveQuery('state:open updated:<$DATE_30d_AGO', now);
    // 2026-05-28 minus 30 days → 2026-04-28
    expect(out).toBe('state:open updated:<2026-04-28');
  });

  it('substitutes multiple $DATE placeholders independently', () => {
    const out = resolveQuery(
      'updated:<$DATE_30d_AGO created:>$DATE_7d_AGO',
      now,
    );
    expect(out).toBe('updated:<2026-04-28 created:>2026-05-21');
  });
});

describe('loadBucketRegistry', () => {
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'triage-buckets-'));
  });

  it('returns built-ins when no override file is present', () => {
    const registry = loadBucketRegistry(projectRoot);
    expect(registry.hasProjectOverride).toBe(false);
    expect(registry.templates['stale-30d']).toBe(
      'state:open updated:<$DATE_30d_AGO',
    );
  });

  it('merges YAML overrides on top of built-ins', () => {
    mkdirSync(join(projectRoot, '.dw-lifecycle'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.dw-lifecycle', 'triage-buckets.yaml'),
      [
        'stale-90d: "state:open updated:<$DATE_90d_AGO"',
        'no-milestone: "state:open no:milestone"',
      ].join('\n'),
    );
    const registry = loadBucketRegistry(projectRoot);
    expect(registry.hasProjectOverride).toBe(true);
    expect(registry.templates['stale-30d']).toBe(
      'state:open updated:<$DATE_30d_AGO',
    );
    expect(registry.templates['stale-90d']).toBe(
      'state:open updated:<$DATE_90d_AGO',
    );
    expect(registry.templates['no-milestone']).toBe('state:open no:milestone');
  });

  it('throws when override value is empty', () => {
    mkdirSync(join(projectRoot, '.dw-lifecycle'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.dw-lifecycle', 'triage-buckets.yaml'),
      'broken: ""',
    );
    expect(() => loadBucketRegistry(projectRoot)).toThrow(
      /must be a non-empty query string/,
    );
  });

  it('rejects a YAML override that parses as an array, not a mapping', () => {
    mkdirSync(join(projectRoot, '.dw-lifecycle'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.dw-lifecycle', 'triage-buckets.yaml'),
      '- not-a-mapping\n',
    );
    expect(() => loadBucketRegistry(projectRoot)).toThrow(
      /expected a YAML mapping/,
    );
  });
});

describe('resolveBucket', () => {
  const now = new Date('2026-05-28T12:00:00.000Z');
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'triage-resolve-'));
  });

  it('resolves a built-in bucket', () => {
    const resolved = resolveBucket({ bucket: 'stale-30d', projectRoot, now });
    expect(resolved.name).toBe('stale-30d');
    expect(resolved.query).toBe('state:open updated:<2026-04-28');
    expect(resolved.hasProjectOverride).toBe(false);
  });

  it('throws with a helpful message when the bucket is unknown', () => {
    expect(() => resolveBucket({ bucket: 'banana', projectRoot, now })).toThrow(
      /Unknown bucket: banana/,
    );
  });

  it('lists built-ins in the error message', () => {
    expect(() => resolveBucket({ bucket: 'banana', projectRoot, now })).toThrow(
      /stale-30d, unlabeled, bug-no-comment-7d/,
    );
  });

  it('hints at the override file path in the error message', () => {
    expect(() => resolveBucket({ bucket: 'banana', projectRoot, now })).toThrow(
      /\.dw-lifecycle\/triage-buckets\.yaml/,
    );
  });
});
