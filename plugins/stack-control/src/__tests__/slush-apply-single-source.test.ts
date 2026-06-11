// specs/014 US4 (TASK-2 / AUDIT-20260609-19): slush-findings apply must
// consume the SAME single source of truth as the dry-run report — the
// dampener decision (res.flips, which already carries each finding's
// located status line) — instead of re-deriving the set via an
// independent findFindingsByStatus walk with independent keying.
//
// The recorded divergence class: the same canonical AUDIT-id open in
// TWO barrage sections. The dampener (scope: latest) decides the LATEST
// section's entry; the apply re-walk matched entries by canonical id
// across ALL sections in document order, so the EARLIER entry got
// migrated and the dampener-decided one was skipped by ref-idempotency
// — left silently `open` after an exit-0 apply.
//
// Contract (cli-contracts §slush-findings; research R4; data-model
// §Dampener decision): applied set ≡ flips set; dry-run N ⇒ apply N;
// a flip that cannot be located at apply time fails the verb loudly
// naming the finding ID (never an exit-0 shortfall).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './_run-helpers.js';
import { createBacklogBackend } from '../backlog/backend.js';
import { migrateFindings } from '../backlog/slush-migrate.js';
import { tmpBacklog } from '../../tests/backlog/helpers.js';

function entry(opts: {
  heading: string;
  findingId: string;
  sev: 'high' | 'medium' | 'low';
  status?: string;
}): string {
  return (
    `### ${opts.heading}\n\n` +
    `Finding-ID: ${opts.findingId}\nStatus:     ${opts.status ?? 'open'}\nSeverity:   ${opts.sev}\n` +
    `Surface:    spec.md:1\n\nBody.\n`
  );
}

function section(runId: string, entries: string[]): string {
  return `## 2026-06-07 — audit-barrage lift (${runId})\n\n${entries.join('\n')}`;
}

function makeRepo(slug: string, sections: string[]): string {
  const repo = mkdtempSync(join(tmpdir(), 'slush-single-source-'));
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audit-log.md'), `# Audit Log\n\n${sections.join('\n')}`, 'utf8');
  return repo;
}

function logText(repo: string, slug: string): string {
  return readFileSync(join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug, 'audit-log.md'), 'utf8');
}

/** The divergence fixture: the same canonical id open in two sections. */
function divergenceRepo(): string {
  return makeRepo('s', [
    section('20260607T100000000Z-s-after_clarify', [
      entry({
        heading: 'Earlier sighting of the keying bug',
        findingId: 'AUDIT-20260607-19',
        sev: 'low',
      }),
    ]),
    section('20260607T110000000Z-s-after_clarify', [
      entry({
        heading: 'Keying divergence drops findings',
        findingId: 'AUDIT-20260607-19',
        sev: 'low',
      }),
    ]),
  ]);
}

function lastSection(text: string): string {
  const parts = text.split(/^##\s+/m);
  return parts[parts.length - 1] ?? '';
}

function firstSection(text: string): string {
  const parts = text.split(/^##\s+/m);
  // parts[0] is the preamble; parts[1] is the earliest barrage section.
  return parts[1] ?? '';
}

describe('US4 — apply consumes the dampener flips (single source of truth)', () => {
  it('divergence fixture: apply migrates the dampener-decided (latest) entry, not an earlier same-id entry', () => {
    const repo = divergenceRepo();
    const backlog = tmpBacklog();
    try {
      const r = runCli(
        ['slush-findings', '--feature', 's', '--repo-root', repo, '--slush-date', '2026-06-07', '--apply'],
        { env: { STACKCTL_BACKLOG_DIR: backlog } },
      );
      expect(r.status).toBe(0);
      const t = logText(repo, 's');
      // The dampener-decided entry (latest section) is migrated...
      expect(lastSection(t)).toMatch(/Status:\s+migrated-to-backlog TASK-\d+/);
      expect(lastSection(t)).not.toMatch(/Status:\s+open/);
      // ...and the earlier same-id entry — which the dampener did NOT
      // decide (scope: latest) — is untouched.
      expect(firstSection(t)).toMatch(/Status:\s+open/);
      expect(firstSection(t)).not.toMatch(/migrated-to-backlog/);
      // Exactly one backlog item for the one decided flip.
      expect(createBacklogBackend({ cwd: backlog }).list()).toHaveLength(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('dry-run N ⇒ apply N on the divergence fixture, and no decided flip remains open after an exit-0 apply (SC-004)', () => {
    const repo = divergenceRepo();
    const backlog = tmpBacklog();
    try {
      const dry = runCli(
        ['slush-findings', '--feature', 's', '--repo-root', repo, '--slush-date', '2026-06-07'],
        { env: { STACKCTL_BACKLOG_DIR: backlog } },
      );
      expect(dry.status).toBe(0);
      const dryMatch = /would migrate (\d+) finding/.exec(dry.stdout);
      expect(dryMatch?.[1]).toBe('1');

      const applied = runCli(
        ['slush-findings', '--feature', 's', '--repo-root', repo, '--slush-date', '2026-06-07', '--apply'],
        { env: { STACKCTL_BACKLOG_DIR: backlog } },
      );
      expect(applied.status).toBe(0);
      const appliedMatch = /migrated (\d+) finding/.exec(applied.stdout);
      expect(appliedMatch?.[1]).toBe('1');

      // The decided flip (latest section) must not remain open.
      expect(lastSection(logText(repo, 's'))).not.toMatch(/Status:\s+open/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('US4 — unlocatable flips fail loud (migrateFindings location guard)', () => {
  const AUDIT_LOG = [
    '# Audit Log',
    '',
    '## 2026-06-07 — audit-barrage lift (20260607T100000000Z-s-after_clarify)',
    '',
    '### A finding',
    '',
    'Finding-ID: AUDIT-20260607-19',
    'Status:     open',
    'Severity:   low',
    'Surface:    spec.md:1',
    '',
    'Body.',
    '',
  ].join('\n');

  it('a flip whose recorded location is not a matching status line throws naming the finding ID and creates nothing', () => {
    const backlog = tmpBacklog();
    const backend = createBacklogBackend({ cwd: backlog });
    expect(() =>
      migrateFindings({
        auditLogText: AUDIT_LOG,
        findings: [
          {
            findingId: 'AUDIT-20260607-19',
            fullFindingId: 'AUDIT-20260607-19',
            severity: 'low',
            // Deliberately wrong: points at the body line, not the Status line.
            statusLineIndex: 11,
            title: 'A finding',
          },
        ],
        backend,
        featureSlug: 's',
        expectedStatusRe: /^Status:\s*open\b/i,
      }),
    ).toThrow(/AUDIT-20260607-19/);
    expect(backend.list()).toHaveLength(0);
  });

  it('audit-log changed between flip computation and apply (hand-edit shifting lines) fails loud, never misapplies', () => {
    const backlog = tmpBacklog();
    const backend = createBacklogBackend({ cwd: backlog });
    // Simulate the staleness edge: a line was inserted above the entry
    // after the flip's location was recorded, shifting every index.
    const edited = AUDIT_LOG.replace('### A finding', '(operator note)\n\n### A finding');
    expect(() =>
      migrateFindings({
        auditLogText: edited,
        findings: [
          {
            findingId: 'AUDIT-20260607-19',
            fullFindingId: 'AUDIT-20260607-19',
            severity: 'low',
            statusLineIndex: 7, // valid against AUDIT_LOG, stale against `edited`
            title: 'A finding',
          },
        ],
        backend,
        featureSlug: 's',
        expectedStatusRe: /^Status:\s*open\b/i,
      }),
    ).toThrow(/AUDIT-20260607-19/);
    expect(backend.list()).toHaveLength(0);
  });
});
