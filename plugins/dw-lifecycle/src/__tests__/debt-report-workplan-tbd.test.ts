import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '../config.js';
import { scanWorkplanTbds } from '../debt-report/workplan-tbd.js';

const tmpRoots: string[] = [];

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-debt-wp-'));
  tmpRoots.push(root);
  return root;
}

function writeWorkplan(
  root: string,
  version: string,
  slug: string,
  body: string,
): string {
  const dir = join(root, 'docs', version, '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'workplan.md');
  writeFileSync(path, body, 'utf8');
  return path;
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('scanWorkplanTbds', () => {
  it('returns empty totals when no in-progress workplans exist', () => {
    const root = createProjectRoot();
    const cfg = defaultConfig();
    const report = scanWorkplanTbds({ projectRoot: root, config: cfg });
    expect(report.total).toBe(0);
    expect(report.features).toEqual([]);
  });

  it('counts TBD / defer / follow-up / out of scope per feature', () => {
    const root = createProjectRoot();
    const cfg = defaultConfig();
    cfg.docs.knownVersions = ['1.0'];
    writeWorkplan(
      root,
      '1.0',
      'feature-alpha',
      [
        '# Workplan',
        '- TBD: investigate edge case',
        '- defer thumbnail rebuild',
        '- follow-up: wire telemetry',
        '- out of scope for this phase',
        '- normal line nothing to see',
      ].join('\n'),
    );

    const report = scanWorkplanTbds({ projectRoot: root, config: cfg });
    expect(report.total).toBe(4);
    expect(report.features).toHaveLength(1);
    const feat = report.features[0];
    if (!feat) throw new Error('expected feature');
    expect(feat.slug).toBe('feature-alpha');
    expect(feat.target_version).toBe('1.0');
    expect(feat.counts.tbd).toBe(1);
    expect(feat.counts.defer).toBe(1);
    expect(feat.counts.follow_up).toBe(1);
    expect(feat.counts.out_of_scope).toBe(1);
    expect(feat.counts.total).toBe(4);
  });

  it('emits per-marker samples in line order with lineNumber + markerKey + text', () => {
    const root = createProjectRoot();
    const cfg = defaultConfig();
    cfg.docs.knownVersions = ['1.0'];
    writeWorkplan(
      root,
      '1.0',
      'feature-samples',
      [
        '# Workplan', // line 1
        '', // line 2
        '- TBD: investigate edge case', // line 3
        '- normal text', // line 4
        '- defer thumbnail rebuild', // line 5
        '- follow-up: wire telemetry', // line 6
        '- out of scope for this phase', // line 7
      ].join('\n'),
    );
    const report = scanWorkplanTbds({ projectRoot: root, config: cfg });
    const feat = report.features[0];
    if (!feat) throw new Error('expected feature');
    expect(feat.samples).toHaveLength(4);
    // Samples are emitted in source-line order so Phase 3 can edit the
    // workplan in a single forward pass.
    expect(feat.samples.map((s) => s.lineNumber)).toEqual([3, 5, 6, 7]);
    expect(feat.samples.map((s) => s.markerKey)).toEqual([
      'tbd',
      'defer',
      'follow_up',
      'out_of_scope',
    ]);
    expect(feat.samples[0]?.text).toBe('- TBD: investigate edge case');
  });

  it('caps per-feature samples at MAX_SAMPLES_PER_FEATURE while keeping count authoritative', () => {
    const root = createProjectRoot();
    const cfg = defaultConfig();
    cfg.docs.knownVersions = ['1.0'];
    // 25 TBD markers — exceeds the documented cap of 20.
    const lines = Array.from({ length: 25 }, (_, i) => `- TBD: item ${i}`);
    writeWorkplan(root, '1.0', 'feature-bulk', lines.join('\n'));
    const report = scanWorkplanTbds({ projectRoot: root, config: cfg });
    const feat = report.features[0];
    if (!feat) throw new Error('expected feature');
    // Count is unaffected — every marker still contributes to totals.
    expect(feat.counts.tbd).toBe(25);
    expect(feat.counts.total).toBe(25);
    // Samples truncate at 20 so the JSON payload stays bounded.
    expect(feat.samples).toHaveLength(20);
    expect(feat.samples[0]?.lineNumber).toBe(1);
    expect(feat.samples[19]?.lineNumber).toBe(20);
  });

  it('matches markers case-insensitively', () => {
    const root = createProjectRoot();
    const cfg = defaultConfig();
    cfg.docs.knownVersions = ['1.0'];
    writeWorkplan(
      root,
      '1.0',
      'feature-case',
      [
        '- tbd: lowercase',
        '- TBD: uppercase',
        '- Tbd: title',
        '- DEFER all the things',
        '- FoLLow-Up: weird casing',
        '- Out Of Scope for now (matches by phrase, not deferral)',
      ].join('\n'),
    );
    const report = scanWorkplanTbds({ projectRoot: root, config: cfg });
    const feat = report.features[0];
    if (!feat) throw new Error('expected feature');
    expect(feat.counts.tbd).toBe(3);
    expect(feat.counts.defer).toBe(1);
    expect(feat.counts.follow_up).toBe(1);
    expect(feat.counts.out_of_scope).toBe(1);
  });

  it('skips lines already annotated with [debt: #NNN]', () => {
    const root = createProjectRoot();
    const cfg = defaultConfig();
    cfg.docs.knownVersions = ['1.0'];
    writeWorkplan(
      root,
      '1.0',
      'feature-annotated',
      [
        '- TBD: bare line counts',
        '- defer thing [debt: #123] — already promoted, should NOT count',
        '- follow-up: bare counts',
        '- out of scope here [debt: #456]',
      ].join('\n'),
    );
    const report = scanWorkplanTbds({ projectRoot: root, config: cfg });
    expect(report.total).toBe(2);
    const feat = report.features[0];
    if (!feat) throw new Error('expected feature');
    expect(feat.counts.tbd).toBe(1);
    expect(feat.counts.defer).toBe(0);
    expect(feat.counts.follow_up).toBe(1);
    expect(feat.counts.out_of_scope).toBe(0);
  });

  it('aggregates across multiple in-progress features', () => {
    const root = createProjectRoot();
    const cfg = defaultConfig();
    cfg.docs.knownVersions = ['1.0'];
    writeWorkplan(root, '1.0', 'feat-a', '- TBD: a1\n- TBD: a2\n');
    writeWorkplan(root, '1.0', 'feat-b', '- defer one\n');
    const report = scanWorkplanTbds({ projectRoot: root, config: cfg });
    expect(report.total).toBe(3);
    expect(report.features).toHaveLength(2);
    const slugs = report.features.map((f) => f.slug).sort();
    expect(slugs).toEqual(['feat-a', 'feat-b']);
  });

  it('walks every version subdirectory under docs/ (auto-discovery)', () => {
    // Even when knownVersions is empty, the scanner enumerates every
    // version directory that has the configured in-progress stage dir.
    const root = createProjectRoot();
    const cfg = defaultConfig();
    cfg.docs.knownVersions = []; // empty on purpose
    writeWorkplan(root, '1.0', 'feat-old', '- TBD: old\n');
    writeWorkplan(root, '2.0', 'feat-new', '- TBD: new\n');
    const report = scanWorkplanTbds({ projectRoot: root, config: cfg });
    expect(report.total).toBe(2);
    const byVersion = report.features.map((f) => ({
      slug: f.slug,
      v: f.target_version,
    }));
    expect(byVersion).toEqual(
      expect.arrayContaining([
        { slug: 'feat-old', v: '1.0' },
        { slug: 'feat-new', v: '2.0' },
      ]),
    );
  });

  it('ignores features without a workplan.md (e.g. mid-setup)', () => {
    const root = createProjectRoot();
    const cfg = defaultConfig();
    cfg.docs.knownVersions = ['1.0'];
    const partial = join(root, 'docs/1.0/001-IN-PROGRESS', 'no-workplan');
    mkdirSync(partial, { recursive: true });
    writeFileSync(join(partial, 'README.md'), '# stub\n', 'utf8');
    writeWorkplan(root, '1.0', 'has-workplan', '- TBD: x\n');
    const report = scanWorkplanTbds({ projectRoot: root, config: cfg });
    expect(report.total).toBe(1);
    expect(report.features.map((f) => f.slug)).toEqual(['has-workplan']);
  });
});
