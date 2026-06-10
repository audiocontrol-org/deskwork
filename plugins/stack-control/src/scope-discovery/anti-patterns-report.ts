/**
 * plugins/stack-control/src/scope-discovery/anti-patterns-report.ts
 *
 * Reporting helpers for `check-anti-patterns.ts` (Phase 2 Family A).
 * Split into a sibling module so the scanner stays under the 300-line
 * cap mandated by the host project guidelines.
 *
 * Two output modes:
 *   - reportText: human-readable; per-finding block with replacement +
 *     message; respects `--quiet` (summary only). When the registry is
 *     empty / has no findings, returns a one-line acknowledgement so a
 *     dev running `stackctl check-anti-patterns` always sees a
 *     non-empty stdout line.
 *   - reportJson: structured stable-shape JSON for downstream tooling.
 */

import { relative } from 'node:path';
import type { AntiPatternEntry } from './anti-patterns-registry.js';

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly entry: AntiPatternEntry;
}

export interface ScanResult {
  readonly findings: readonly Finding[];
  readonly filesScanned: number;
  readonly entriesScanned: number;
}

export interface ReportOptions {
  readonly quiet: boolean;
  /** Absolute root that finding paths are rendered relative to (the scan root). */
  readonly displayRoot: string;
}

export function reportText(result: ScanResult, opts: ReportOptions): string {
  if (result.entriesScanned === 0) {
    return opts.quiet ? '' : 'anti-patterns: registry empty; nothing to scan.\n';
  }
  if (result.findings.length === 0) {
    return opts.quiet
      ? ''
      : `anti-patterns: ${result.entriesScanned} entries scanned across ${result.filesScanned} files; 0 findings.\n`;
  }
  if (opts.quiet) {
    return `anti-patterns: ${result.findings.length} finding(s).\n`;
  }
  const lines: string[] = [];
  for (const finding of result.findings) {
    const rel = relative(opts.displayRoot, finding.file);
    lines.push(`${rel}:${finding.line}: matches anti-pattern ${finding.entry.id}`);
    lines.push(`  replacement: ${finding.entry.primitive} from ${finding.entry.from}`);
    const indented = finding.entry.message
      .trim()
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n');
    lines.push(indented);
    lines.push('');
  }
  lines.push(
    `anti-patterns: ${result.findings.length} finding(s) across ${result.filesScanned} files.`,
  );
  return lines.join('\n') + '\n';
}

export function reportJson(result: ScanResult, displayRoot: string): string {
  const payload = {
    files_scanned: result.filesScanned,
    entries_scanned: result.entriesScanned,
    findings: result.findings.map((f) => ({
      file: relative(displayRoot, f.file),
      line: f.line,
      id: f.entry.id,
      primitive: f.entry.primitive,
      from: f.entry.from,
      message: f.entry.message,
    })),
  };
  return JSON.stringify(payload, null, 2) + '\n';
}
