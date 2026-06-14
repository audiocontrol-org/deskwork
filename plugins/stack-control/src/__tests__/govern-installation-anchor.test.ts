// US3 — governance anchors at the installation (specs/installation-isolation;
// research R3/R4; contracts §govern).
//
// The payload assembler invokes git AT the installation with relative
// output: the committed arm covers the installation subtree with
// installation-relative paths; the untracked fold enumerates only the
// installation subtree; when the resolved feature root lies OUTSIDE the
// installation (the transitional cross-tree layout), the payload folds the
// feature root in as an explicit, labeled second diff arm and announces the
// cross-tree anchor once (R4) — spec artifacts are never silently absent.
// `--repo-root` / `GOVERN_REPO_ROOT` are retired on govern (R2): the flag
// hits the unknown-flag usage error; the env var is refused loudly naming
// the replacement. The backlog-store payload exclusion resolves from the
// installation record, never the cwd (TASK-40 / AUDIT-20260611-13).

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleImplementPayload } from '../govern/payload-implement.js';
import { resolveTsx, CLI } from './_run-helpers.js';
import { gitIn, makeNestedFixture } from './_isolation-harness.js';

const CROSS_TREE_LABEL = 'cross-tree feature arm';
const ANNOUNCEMENT = 'feature anchor outside the installation';

function collectWarn(): { lines: string[]; warn: (m: string) => void } {
  const lines: string[] = [];
  return { lines, warn: (m) => lines.push(m) };
}

describe('US3 — implement payload anchors at the installation (R3)', () => {
  it('committed arm is installation-scoped with installation-relative paths', () => {
    const fixture = makeNestedFixture();
    try {
      // One commit touching BOTH an outer file and an installation file.
      fixture.writeOuter('outer-change.txt', 'outer changed\n');
      fixture.writeInstallation('src/inner.ts', 'export const inner = 1;\n');
      gitIn(fixture.outerRoot, ['add', '.']);
      gitIn(fixture.outerRoot, ['commit', '-q', '-m', 'change both trees']);
      // AUDIT-20260611-09: a SECOND in-range commit touching ONLY the outer
      // tree. Its subject must NOT ship in commitSubjects — a subject line
      // with zero corresponding hunks baits spurious "missing surface"
      // findings and leaks outer-repo commit messages off-box.
      fixture.writeOuter('outer-only.txt', 'outer only\n');
      gitIn(fixture.outerRoot, ['add', '.']);
      gitIn(fixture.outerRoot, ['commit', '-q', '-m', 'OUTER-ONLY-SUBJECT-CANARY']);

      const payload = assembleImplementPayload({
        installationRoot: fixture.installationRoot,
        base: 'HEAD~2',
      });
      // Installation-relative path (not prefixed by the outer-tree dir).
      expect(payload.diff).toContain('a/src/inner.ts');
      expect(payload.diff).not.toContain(`a/${fixture.installationRel}/src/inner.ts`);
      // The outer tree's committed change is NOT part of the audited unit.
      expect(payload.diff).not.toContain('outer-change.txt');
      // AUDIT-20260611-09: commit-subjects metadata is installation-scoped
      // like the diff — subjects and hunks stay joined.
      expect(payload.commitSubjects).toContain('change both trees');
      expect(payload.commitSubjects).not.toContain('OUTER-ONLY-SUBJECT-CANARY');
    } finally {
      fixture.cleanup();
    }
  });

  it('untracked fold enumerates only the installation subtree', () => {
    const fixture = makeNestedFixture();
    try {
      fixture.writeOuter('u-outer.ts', 'export const leak = 1;\n');
      fixture.writeInstallation('u-inner.ts', 'export const folded = 1;\n');

      const payload = assembleImplementPayload({
        installationRoot: fixture.installationRoot,
        base: 'HEAD',
      });
      expect(payload.diff).toContain('u-inner.ts');
      expect(payload.diff).not.toContain('u-outer.ts');
      // AUDIT-20260611-01: the fold's diff headers must be
      // installation-relative — `git diff --no-index` echoes its operands
      // verbatim, so the fold must hand git the repo-relative path, not the
      // absolute one. No absolute installation path may appear ANYWHERE in
      // the payload (it would break the installation-relative promise, leak
      // the operator's filesystem layout off-box, and produce anchors that
      // don't join with the committed arm's relative paths). macOS caveat:
      // child processes may see the realpath spelling (/private/var vs
      // /var), so assert absence of BOTH spellings.
      expect(payload.diff).toMatch(/diff --git a\/u-inner\.ts b\/u-inner\.ts/);
      expect(payload.diff).not.toContain(fixture.installationRoot);
      expect(payload.diff).not.toContain(realpathSync(fixture.installationRoot));
    } finally {
      fixture.cleanup();
    }
  });

  it('cross-tree feature root folds in as a labeled arm with the R4 announcement; its audit-log stays excluded', () => {
    const fixture = makeNestedFixture();
    try {
      // Feature root OUTSIDE the installation (transitional layout), with
      // an in-range committed spec change + an in-range audit-log change.
      fixture.writeOuter('specs/feat/spec.md', 'The spec promise under audit.\n');
      fixture.writeOuter('specs/feat/audit-log.md', 'SELF-REFERENCE-CANARY\n');
      gitIn(fixture.outerRoot, ['add', '.']);
      gitIn(fixture.outerRoot, ['commit', '-q', '-m', 'spec artifacts']);
      // UNTRACKED spec artifact under the feature root — exercises the
      // cross-tree arm's untracked fold (AUDIT-20260611-01).
      fixture.writeOuter('specs/feat/notes.md', 'untracked spec note\n');

      const { lines, warn } = collectWarn();
      const payload = assembleImplementPayload({
        installationRoot: fixture.installationRoot,
        base: 'HEAD~1',
        featureRoot: join(fixture.outerRoot, 'specs', 'feat'),
        warn,
      });
      expect(payload.diff).toContain(CROSS_TREE_LABEL);
      expect(payload.diff).toContain('The spec promise under audit.');
      expect(payload.diff).not.toContain('SELF-REFERENCE-CANARY');
      expect(lines.join('\n')).toContain(ANNOUNCEMENT);
      // AUDIT-20260611-01: the cross-tree arm's untracked fold renders the
      // note with toplevel-relative diff headers. The arm's LABEL names the
      // absolute featureRoot by design, so the absence assertion targets the
      // `diff --git a<abs>` header shape (both macOS path spellings).
      expect(payload.diff).toContain('untracked spec note');
      expect(payload.diff).toMatch(
        /diff --git a\/specs\/feat\/notes\.md b\/specs\/feat\/notes\.md/,
      );
      expect(payload.diff).not.toContain(`a${fixture.outerRoot}`);
      expect(payload.diff).not.toContain(`a${realpathSync(fixture.outerRoot)}`);
      // AUDIT-20260611-09: the cross-tree feature arm's commits KEEP their
      // subjects — the arm ships their hunks, so subjects and hunks stay
      // joined (guards against an over-narrow installation-only log fix).
      expect(payload.commitSubjects).toContain('spec artifacts');
    } finally {
      fixture.cleanup();
    }
  });

  it('cross-tree untracked fold applies the soft byte budget: over-budget files are skipped with a warning, smaller files still fold (AUDIT-20260611-03)', () => {
    const fixture = makeNestedFixture();
    try {
      // Committed spec.md so the cross-tree arm exists (same shape as the
      // labeled-arm test above).
      fixture.writeOuter('specs/feat/spec.md', 'The spec promise under audit.\n');
      gitIn(fixture.outerRoot, ['add', '.']);
      gitIn(fixture.outerRoot, ['commit', '-q', '-m', 'spec artifacts']);
      // A LARGE untracked text file under the feature root (well over the
      // 1000-byte budget passed below) plus a SMALL one. ls-files sorts
      // 'large-blob.md' before 'small-note.md', so this also exercises the
      // AUDIT-20260605-12 continue-not-break semantics: the over-budget
      // file is skipped WITHOUT consuming budget, and the later small file
      // still folds.
      const largeLines = ['LARGE-BLOB-CANARY', ...Array.from({ length: 50 }, () => 'x'.repeat(60))];
      fixture.writeOuter('specs/feat/large-blob.md', `${largeLines.join('\n')}\n`);
      fixture.writeOuter('specs/feat/small-note.md', 'SMALL-NOTE-CANARY\n');

      const { lines, warn } = collectWarn();
      const payload = assembleImplementPayload({
        installationRoot: fixture.installationRoot,
        base: 'HEAD~1',
        featureRoot: join(fixture.outerRoot, 'specs', 'feat'),
        budgetBytes: 1000,
        warn,
      });
      // The small untracked file folds in full.
      expect(payload.diff).toContain('SMALL-NOTE-CANARY');
      // The over-budget file does NOT fold — its content must be absent.
      expect(payload.diff).not.toContain('LARGE-BLOB-CANARY');
      // The skip is warned, never silent, and names the file.
      expect(lines.join('\n')).toContain('specs/feat/large-blob.md');
      expect(lines.join('\n')).toMatch(/budget/i);
      // And ledgered in the payload's skip record.
      expect(payload.skippedOverBudget).toContain('specs/feat/large-blob.md');
    } finally {
      fixture.cleanup();
    }
  });

  it('a feature root INSIDE the installation produces no cross-tree arm and no announcement', () => {
    const fixture = makeNestedFixture();
    try {
      fixture.writeInstallation('specs/feat/spec.md', 'In-tree spec.\n');
      gitIn(fixture.outerRoot, ['add', '.']);
      gitIn(fixture.outerRoot, ['commit', '-q', '-m', 'in-tree spec']);

      const { lines, warn } = collectWarn();
      const payload = assembleImplementPayload({
        installationRoot: fixture.installationRoot,
        base: 'HEAD~1',
        featureRoot: join(fixture.installationRoot, 'specs', 'feat'),
        warn,
      });
      expect(payload.diff).not.toContain(CROSS_TREE_LABEL);
      expect(lines.join('\n')).not.toContain(ANNOUNCEMENT);
      expect(payload.diff).toContain('In-tree spec.');
    } finally {
      fixture.cleanup();
    }
  });
});

describe('US3 — govern flag/env retirement (R2)', () => {
  it('--repo-root hits the unknown-flag usage error (exit 2)', () => {
    const r = spawnSync(resolveTsx(), [CLI, 'govern', '--mode', 'implement', '--repo-root', '/tmp'], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--repo-root');
    expect(r.stderr).toMatch(/unknown flag/i);
  }, 60_000);

  it('GOVERN_REPO_ROOT is refused loudly, naming the --at replacement (exit 2)', () => {
    const r = spawnSync(resolveTsx(), [CLI, 'govern', '--mode', 'implement'], {
      encoding: 'utf8',
      env: { ...process.env, GOVERN_REPO_ROOT: '/tmp' },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('GOVERN_REPO_ROOT');
    expect(r.stderr).toContain('--at');
  }, 60_000);
});

// The end-to-end anchor test: govern runs from the OUTER repo root with
// --at naming the installation. The stub barrage copies the rendered vars
// (whose `diff` is the assembled payload) so the test can assert WHAT
// shipped: no outer-tree leak, and no backlog-store leak even though the
// cwd has no resolvable backlog store (TASK-40: the exclusion derives from
// the installation record, never the cwd). The stub also records the args
// the protocol passed to the barrage AND render verbs as verb-prefixed
// lines: --at threading for the barrage, --repo-root threading for the
// render (AUDIT-20260611-06 — the render resolves the prompt-template
// override `.stack-control/audit-barrage-prompt.md` relative to its
// repoRoot, so an unanchored render run from an outer repo silently picks
// the outer/default prompt instead of the installation's tuned override).
function writeAnchorStub(dir: string): string {
  const stub = join(dir, 'stub-barrage.sh');
  const body = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'verb="$1"; shift',
    'if [ "$verb" = "audit-barrage" ] || [ "$verb" = "audit-barrage-render" ]; then',
    '  printf "%s %s\\n" "$verb" "$*" >> "${STUB_ARGS_FILE:?STUB_ARGS_FILE required}"',
    'fi',
    'repo=""; feature=""; output=""; vars=""',
    'while [ "$#" -gt 0 ]; do',
    '  case "$1" in',
    '    --at) repo="$2"; shift 2 ;;',
    '    --feature) feature="$2"; shift 2 ;;',
    '    --output) output="$2"; shift 2 ;;',
    '    --vars-file) vars="$2"; shift 2 ;;',
    '    *) shift ;;',
    '  esac',
    'done',
    'case "$verb" in',
    '  audit-barrage-render)',
    '    cp "$vars" "${STUB_VARS_COPY:?STUB_VARS_COPY required}"',
    '    [ -n "$output" ] && printf "stub prompt\\n" > "$output" || true',
    '    exit 0 ;;',
    '  audit-barrage)',
    '    rd="${STUB_RUN_DIR:?STUB_RUN_DIR required}"',
    '    mkdir -p "$rd"',
    '    printf "%s\\n" "$rd"',
    '    exit 0 ;;',
    '  audit-barrage-lift)',
    '    log="${repo}/docs/1.0/001-IN-PROGRESS/${feature}/audit-log.md"',
    '    {',
    '      printf "\\n## 2026-06-11 — audit-barrage lift (stub-run-after_clarify)\\n\\n"',
    '      printf "### Clean finding\\n\\n"',
    '      printf "Finding-ID: AUDIT-20260611-99\\nStatus:     open\\nSeverity:   low\\n"',
    '      printf "Surface:    spec.md:1\\n\\nBody.\\n"',
    '    } >> "$log"',
    '    exit 0 ;;',
    '  *) echo "stub-barrage: unknown verb $verb" >&2; exit 3 ;;',
    'esac',
    '',
  ].join('\n');
  writeFileSync(stub, body);
  chmodSync(stub, 0o755);
  return stub;
}

describe('US3/US4 — govern end-to-end: --at anchor, no cwd leak, backlog-store exclusion from the record (TASK-40)', () => {
  it('govern --at <installation> from the outer root ships an installation-anchored payload', () => {
    const fixture = makeNestedFixture();
    const fx = mkdtempSync(join(tmpdir(), 'gov-anchor-'));
    try {
      // Feature docs + audit-log inside the installation.
      fixture.writeInstallation(
        'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
        '# Audit Log — feat\n',
      );
      // Substantive source so the implement-mode clone step's jscpd run
      // analyzes real files (it writes no report over a trivial tree).
      for (const n of [0, 1]) {
        const lines = Array.from({ length: 30 }, (_, i) => `export const v${n}_${i} = ${i} * ${n + 2};`);
        fixture.writeInstallation(`src/f${n}.ts`, `${lines.join('\n')}\n`);
      }
      gitIn(fixture.outerRoot, ['add', '.']);
      gitIn(fixture.outerRoot, ['commit', '-q', '-m', 'feature scaffold']);
      // Untracked canaries: an outer-tree file and a backlog-store task file.
      fixture.writeOuter('OUTER-LEAK-CANARY.txt', 'outer leak\n');
      mkdirSync(join(fixture.installationRoot, '.stack-control', 'backlog', 'backlog'), {
        recursive: true,
      });
      writeFileSync(
        join(fixture.installationRoot, '.stack-control', 'backlog', 'backlog', 'task-99.md'),
        'BACKLOG-STORE-CANARY\n',
        'utf8',
      );
      // T029 / TASK-57: an untracked barrage run artifact (control-plane noise)
      // must NOT fold into the payload — folding it compounds prior rounds.
      mkdirSync(join(fixture.installationRoot, '.stack-control', 'audit-runs', 'run1'), {
        recursive: true,
      });
      writeFileSync(
        join(fixture.installationRoot, '.stack-control', 'audit-runs', 'run1', 'codex.md'),
        'AUDIT-RUNS-CANARY finding prose from a prior round\n',
        'utf8',
      );

      const stub = writeAnchorStub(fx);
      const varsCopy = join(fx, 'vars-copy.json');
      const argsFile = join(fx, 'barrage-args.txt');
      const r = spawnSync(
        resolveTsx(),
        [CLI, 'govern', '--mode', 'implement', '--feature', 'feat', '--at', fixture.installationRoot, '--diff-base', 'HEAD'],
        {
          encoding: 'utf8',
          cwd: fixture.outerRoot,
          env: {
            ...process.env,
            GOVERN_BARRAGE_BIN: stub,
            STUB_RUN_DIR: join(fx, 'run-anchor'),
            STUB_VARS_COPY: varsCopy,
            STUB_ARGS_FILE: argsFile,
            STACKCTL_BACKLOG_DIR: '',
          },
        },
      );
      expect(r.status, `stderr was:\n${r.stderr}`).toBe(0);
      const vars = readFileSync(varsCopy, 'utf8');
      expect(vars).not.toContain('OUTER-LEAK-CANARY');
      // TASK-40: the store exclusion derives from the installation record;
      // the cwd (outer root, no installation) must play no role.
      expect(vars).not.toContain('BACKLOG-STORE-CANARY');
      // T029 / TASK-57: the barrage run-artifact dir is trimmed from the payload.
      expect(vars).not.toContain('AUDIT-RUNS-CANARY');
      // The protocol threads the resolved installation into the barrage.
      const recordedArgs = readFileSync(argsFile, 'utf8').trim().split('\n');
      const barrageLine = recordedArgs.find((l) => l.startsWith('audit-barrage '));
      expect(barrageLine, `recorded argv was:\n${recordedArgs.join('\n')}`).toBeDefined();
      expect(barrageLine).toContain('--at');
      // AUDIT-20260611-06: the FIRST step — the render — must carry the
      // anchor too. Without it the render's repoRoot defaults to the spawn
      // cwd and the prompt-template override resolves against the OUTER
      // repo (or the plugin default) instead of the installation's tuned
      // `.stack-control/audit-barrage-prompt.md`. The render verb is
      // read-side, so its surviving `--repo-root` flag is the carrier
      // (R2 retired --repo-root on state-WRITING verbs only).
      const renderLine = recordedArgs.find((l) => l.startsWith('audit-barrage-render '));
      expect(renderLine, `recorded argv was:\n${recordedArgs.join('\n')}`).toBeDefined();
      expect(renderLine).toContain('--repo-root');
      // macOS realpath caveat: the resolved installation may be recorded in
      // either the /var or /private/var spelling — accept both.
      const anchorCarried =
        (renderLine ?? '').includes(fixture.installationRoot) ||
        (renderLine ?? '').includes(realpathSync(fixture.installationRoot));
      expect(anchorCarried, `render argv was:\n${renderLine ?? '(none)'}`).toBe(true);
    } finally {
      fixture.cleanup();
      rmSync(fx, { recursive: true, force: true });
    }
  }, 120_000);
});
