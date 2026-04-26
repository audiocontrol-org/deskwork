#!/usr/bin/env tsx
/**
 * deskwork-review-report — voice-drift signal across completed reviews.
 *
 * Builds the report from the review journal. By default includes only
 * terminal workflows (applied or cancelled) — in-flight workflows don't
 * represent settled signal yet.
 *
 * Usage:
 *   deskwork-review-report <project-root> [--site <slug>] [--include-active]
 *   deskwork-review-report <project-root> --format text
 */

import { readConfig } from '@deskwork/core/config';
import { buildReport, renderReport } from '@deskwork/core/review/report';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';

const KNOWN_FLAGS = ['site', 'format'] as const;
const BOOLEAN_FLAGS = ['include-active'] as const;

const { positional, flags, booleans } = parse();

if (positional.length < 1) {
  fail(
    'Usage: deskwork-review-report <project-root> [--site <slug>] [--include-active] [--format text|json]',
    2,
  );
}

const projectRoot = absolutize(positional[0]);
const format = flags.format ?? 'json';
if (format !== 'json' && format !== 'text') {
  fail(`Invalid --format "${flags.format}". Must be "json" or "text".`);
}

let config;
try {
  config = readConfig(projectRoot);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

const report = buildReport(projectRoot, config, {
  terminalOnly: !booleans.has('include-active'),
  ...(flags.site !== undefined ? { site: flags.site } : {}),
});

if (format === 'text') {
  process.stdout.write(renderReport(report) + '\n');
} else {
  emit(report);
}

function parse() {
  try {
    return parseArgs(process.argv.slice(2), KNOWN_FLAGS, BOOLEAN_FLAGS);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }
}
