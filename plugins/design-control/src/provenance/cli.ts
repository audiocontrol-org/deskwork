/**
 * CLI core behind `bin/wireframe-provenance` — the executable firing surface
 * for the provenance recorders and gates (AUDIT-20260611-03). Mirrors the lint
 * seam (`bin/check-wireframe` → `check-wireframe-cli.ts` → tested
 * `runCheckWireframe`): all behavior lives here, tested as a function; the
 * process entry only wires argv and the exit code.
 *
 * Subcommands (exit codes: 0 success/ok, 1 refusal or error, 2 usage):
 *   record-driving   <dir> <surfaceId> <wireframeFile>
 *   record-derived   <dir> <surfaceId> <source> --from <derivedHtmlFile>
 *   check-acceptance <dir> <surfaceId> <acceptedHtmlFile>
 *   verify-driving   <dir> <surfaceId>
 */

import { readFileSync } from 'node:fs';
import type { CliIo } from '@/authoring/lint-file';
import {
  checkDerivedAcceptance,
  recordDerivation,
  recordDrivingWireframe,
  verifyDrivingWireframe,
} from '@/provenance/derived';

const USAGE = [
  'usage: wireframe-provenance <subcommand> ...',
  '  record-driving   <dir> <surfaceId> <wireframeFile>',
  '  record-derived   <dir> <surfaceId> <source> --from <derivedHtmlFile>',
  '  check-acceptance <dir> <surfaceId> <acceptedHtmlFile>',
  '  verify-driving   <dir> <surfaceId>',
];

function printUsage(io: CliIo): number {
  for (const line of USAGE) io.err(line);
  return 2;
}

function printError(io: CliIo, error: unknown): number {
  io.err(error instanceof Error ? error.message : String(error));
  return 1;
}

function runRecordDriving(args: readonly string[], io: CliIo): number {
  if (args.length !== 3) return printUsage(io);
  const [dir, surfaceId, wireframeFile] = args;
  try {
    recordDrivingWireframe({ dir, surfaceId, wireframeFile });
  } catch (error) {
    return printError(io, error);
  }
  io.out(`Recorded driving provenance for surface "${surfaceId}" (wireframe ${wireframeFile}).`);
  return 0;
}

function runRecordDerived(args: readonly string[], io: CliIo): number {
  if (args.length !== 5 || args[3] !== '--from') return printUsage(io);
  const [dir, surfaceId, source, , derivedHtmlFile] = args;
  try {
    const derivedHtml = readFileSync(derivedHtmlFile, 'utf8');
    recordDerivation({ dir, surfaceId, derivedHtml, source });
  } catch (error) {
    return printError(io, error);
  }
  io.out(
    `Recorded derived provenance for surface "${surfaceId}" (snapshot + sidecar committed; ` +
      `source: ${source}).`,
  );
  return 0;
}

function runCheckAcceptance(args: readonly string[], io: CliIo): number {
  if (args.length !== 3) return printUsage(io);
  const [dir, surfaceId, acceptedHtmlFile] = args;
  try {
    const acceptedHtml = readFileSync(acceptedHtmlFile, 'utf8');
    const result = checkDerivedAcceptance(dir, surfaceId, acceptedHtml);
    if (!result.ok) {
      for (const finding of result.findings) {
        io.err(`${finding.rule}: ${finding.message}`);
      }
      return 1;
    }
  } catch (error) {
    return printError(io, error);
  }
  io.out(`Surface "${surfaceId}": acceptance gate ok.`);
  return 0;
}

function runVerifyDriving(args: readonly string[], io: CliIo): number {
  if (args.length !== 2) return printUsage(io);
  const [dir, surfaceId] = args;
  try {
    verifyDrivingWireframe(dir, surfaceId);
  } catch (error) {
    return printError(io, error);
  }
  io.out(`Surface "${surfaceId}": driving wireframe verified against its recorded hash.`);
  return 0;
}

/**
 * Dispatch entry for the `wireframe-provenance` bin. The exit-code contract is
 * the skill's gate: 0 success, 1 refusal/error (descriptive message on stderr;
 * never a fabricated verdict), 2 usage error.
 */
export function runWireframeProvenance(argv: readonly string[], io: CliIo): number {
  const [subcommand, ...args] = argv;
  switch (subcommand) {
    case 'record-driving':
      return runRecordDriving(args, io);
    case 'record-derived':
      return runRecordDerived(args, io);
    case 'check-acceptance':
      return runCheckAcceptance(args, io);
    case 'verify-driving':
      return runVerifyDriving(args, io);
    default:
      return printUsage(io);
  }
}
