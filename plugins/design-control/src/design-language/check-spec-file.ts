/**
 * File-level entry to the design-language spec check — the enforcement seam
 * the `/design-control:translate-design-language` skill (and the
 * `bin/check-design-spec` shim) route EVERY spec draft through, hand-authored
 * or engine-accelerated alike. Mirrors `@/authoring/lint-file` for wireframes:
 * a thin composition of the existing axes, no parallel validation path.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { checkLinkLiveness, type SkippedLink } from '@/design-language/link-liveness';
import { parseDesignSpec } from '@/design-language/schema';
import type { DesignSpecFinding, ParsedDesignSpec } from '@/design-language/types';

export interface DesignSpecCheckResult {
  /** True iff findings is empty (skipped links stay green but visible). */
  readonly ok: boolean;
  readonly spec: ParsedDesignSpec;
  /** Schema findings followed by link-liveness findings. */
  readonly findings: readonly DesignSpecFinding[];
  readonly skipped: readonly SkippedLink[];
}

/**
 * Check a design-language spec FILE: read it, validate the markdown schema,
 * then check link-liveness with css paths resolved against the spec file's
 * own directory. Fails loud on an unreadable file — a missing spec is an
 * error, never a clean verdict.
 */
export function checkDesignSpecFile(filePath: string): DesignSpecCheckResult {
  const absolute = resolve(filePath);
  const markdown = readFileSync(absolute, 'utf8');
  const parsed = parseDesignSpec(markdown);
  const liveness = checkLinkLiveness(parsed.spec, dirname(absolute));
  const findings = [...parsed.findings, ...liveness.findings];
  return { ok: findings.length === 0, spec: parsed.spec, findings, skipped: liveness.skipped };
}

/** Line-oriented output sink, injected so the CLI core is testable. */
export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

const USAGE = 'usage: check-design-spec <design-language-spec.md>';

/**
 * CLI core behind `bin/check-design-spec`. Exit-code contract (the skill's
 * gate, same shape as check-wireframe):
 *   0 — spec green (zero findings; skipped links are reported but green)
 *   1 — findings present, or the file could not be read (descriptive error;
 *       never a fabricated verdict)
 *   2 — usage error
 */
export function runCheckDesignSpec(argv: readonly string[], io: CliIo): number {
  if (argv.length !== 1) {
    io.err(USAGE);
    return 2;
  }
  const filePath = argv[0];
  let result: DesignSpecCheckResult;
  try {
    result = checkDesignSpecFile(filePath);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
  for (const skip of result.skipped) {
    io.out(
      `note: rule "${skip.ruleId}" link "${skip.link.path} ${skip.link.selector}" is a non-CSS target — not validated in v1 (CSS-in-JS / utility-framework / CSS-Modules liveness is named-deferred).`,
    );
  }
  if (result.ok) {
    io.out(`${filePath}: spec green — 0 findings (${result.spec.rules.length} rule(s))`);
    return 0;
  }
  for (const finding of result.findings) {
    io.err(`${finding.rule}${finding.ruleId ? ` (rule: ${finding.ruleId})` : ''}: ${finding.message}`);
  }
  io.err(`${filePath}: ${result.findings.length} finding(s)`);
  return 1;
}
