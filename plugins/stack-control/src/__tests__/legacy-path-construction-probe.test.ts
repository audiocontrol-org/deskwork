// specs/014 US7 (T017) — the R7 probe as a regression test (SC-007 as
// amended by research.md R7).
//
// Contract: every `001-IN-PROGRESS` occurrence in src/ OUTSIDE the
// shared resolver module (util/feature-root.ts) and tests is inside a
// fail-loud error-message string or a comment — NEVER a path
// construction. The fail-loud messages that name BOTH layouts
// (`…/specs/<NNN>-<slug> (speckit) or …/docs/*/001-IN-PROGRESS/<slug>
// (legacy-docs)`) are 013-mandated loudness and are compliant; a
// consumer that BUILDS the legacy path re-opens the gh-442 class.
//
// Mechanics: grep-equivalent walk over src/**/*.ts; a hit line is a
// VIOLATION when it matches one of the construction shapes:
//   V1 — the literal inside a single-line join()/resolve() argument
//        list (no intervening close-paren, so `${join(root, 'docs')}/…`
//        prose interpolations don't false-positive);
//   V2 — a bare `'001-IN-PROGRESS'` literal line (a multi-line
//        join/resolve argument);
//   V3 — assignment of the bare bucket literal (`= '001-IN-PROGRESS'`);
//   V4 — a template literal that interpolates around the bucket
//        (`docs/…/001-IN-PROGRESS/${slug}/…`) UNLESS the line names
//        both layouts ('legacy-docs' / 'speckit' / a `/*/` glob) —
//        the compliant loud-error shape.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const RESOLVER_REL = join('scope-discovery', 'util', 'feature-root.ts');
const LITERAL = '001-IN-PROGRESS';

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name.startsWith('.')) continue;
      out.push(...walkTsFiles(abs));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) out.push(abs);
  }
  return out;
}

function isComment(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*')
  );
}

function namesBothLayouts(line: string): boolean {
  return (
    line.includes('legacy-docs') ||
    line.includes('speckit') ||
    line.includes('/*/')
  );
}

function isConstruction(line: string): boolean {
  if (isComment(line)) return false;
  // V1 — single-line join/resolve with the literal inside the parens.
  if (new RegExp(`(?:\\bjoin|\\bresolve)\\s*\\([^)]*${LITERAL}`).test(line)) {
    return true;
  }
  // V2 — bare literal line (multi-line join/resolve argument).
  if (new RegExp(`^\\s*['"\`]${LITERAL}['"\`],?\\s*$`).test(line)) {
    return true;
  }
  // V3 — assignment of the bare bucket literal.
  if (new RegExp(`=\\s*['"\`]${LITERAL}['"\`]`).test(line)) {
    return true;
  }
  // V4 — interpolating template path, unless it is the loud
  // both-layouts error shape.
  if (
    new RegExp(`\`[^\`]*${LITERAL}[^\`]*\\$\\{`).test(line) ||
    new RegExp(`\\$\\{[^\`]*\`?[^\`]*${LITERAL}`).test(line)
  ) {
    return !namesBothLayouts(line);
  }
  return false;
}

describe('US7 — R7 legacy-path-construction probe (SC-007 as amended)', () => {
  it('no src file outside the shared resolver constructs the legacy 001-IN-PROGRESS path', () => {
    const violations: string[] = [];
    for (const file of walkTsFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file);
      if (rel === RESOLVER_REL) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        if (!line.includes(LITERAL)) return;
        if (isConstruction(line)) {
          violations.push(`${rel}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});
