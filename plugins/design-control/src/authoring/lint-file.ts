/**
 * File-level entry to the `check-mockup-lofi` lint — the enforcement seam the
 * `/design-control:wireframe` authoring skill (and the `bin/check-wireframe`
 * shim) route EVERY wireframe draft through, manual or engine-authored alike.
 *
 * This is deliberately a thin composition of the existing axes — axis 1
 * (element/attribute allowlist) + axis 1.5 (stylesheet identity pin) + the
 * codepoint allowlist — via `lintWireframe`. No parallel lint path: the skill
 * and the library agree by construction because they call the same pipeline.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { lintWireframe } from '@/lint/check-mockup-lofi';
import { buildSketchKitPin } from '@/lint/stylesheet-pin';
import type { LintResult } from '@/lint/types';

/**
 * Lint a wireframe FILE: read it, build the sketch-kit identity pin against the
 * file's own directory (the conventional layout — the kit copy sits next to the
 * wireframe), and run the full pinned lint. Fails loud on an unreadable file —
 * a missing wireframe is an error, never a clean verdict.
 */
export function lintWireframeFile(filePath: string): LintResult {
  const absolute = resolve(filePath);
  const html = readFileSync(absolute, 'utf8');
  return lintWireframe(html, { stylesheetPin: buildSketchKitPin(dirname(absolute)) });
}

/** Line-oriented output sink, injected so the CLI core is testable as a function. */
export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

const USAGE = 'usage: check-wireframe <wireframe.html>';

/**
 * CLI core behind `bin/check-wireframe`. Exit-code contract (the skill's gate):
 *   0 — lint green (zero findings)
 *   1 — findings present, or the file could not be read (descriptive error;
 *       never a fabricated verdict)
 *   2 — usage error
 */
export function runCheckWireframe(argv: readonly string[], io: CliIo): number {
  if (argv.length !== 1) {
    io.err(USAGE);
    return 2;
  }
  const filePath = argv[0];
  let result: LintResult;
  try {
    result = lintWireframeFile(filePath);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (result.ok) {
    io.out(`${filePath}: lint green — 0 findings`);
    return 0;
  }
  for (const finding of result.findings) {
    const where = [finding.tag, finding.attr].filter(Boolean).join(' ');
    io.err(`${finding.rule}${where ? ` (${where})` : ''}: ${finding.message}`);
  }
  io.err(`${filePath}: ${result.findings.length} finding(s)`);
  return 1;
}
