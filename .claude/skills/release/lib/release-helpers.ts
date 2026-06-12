/**
 * Legacy Claude-hosted wrapper for the portable stack-control release helper.
 *
 * The shared release logic now lives under
 * `plugins/stack-control/src/release/helpers.ts`; this file remains only as a
 * compatibility wrapper for the existing Claude-owned skill surface while
 * `017-portability` completes the rehome.
 */

import { pathToFileURL } from 'node:url';
import {
  atomicPush,
  checkPreconditions,
  DESKWORK_PACKAGES,
  dispatchReleaseHelper,
  realNpmViewer,
  validateVersion,
  verifyNpmStatus,
  verifyNpmStatusUntilPublished,
  type AtomicPushOptions,
  type CheckPreconditionsOptions,
  type NpmStatusReport,
  type NpmViewer,
  type PreconditionReport,
  type ValidateVersionResult,
  type VerifyNpmStatusUntilPublishedOptions,
} from '../../../../plugins/stack-control/src/release/helpers.js';

export {
  atomicPush,
  checkPreconditions,
  DESKWORK_PACKAGES,
  realNpmViewer,
  validateVersion,
  verifyNpmStatus,
  verifyNpmStatusUntilPublished,
  type AtomicPushOptions,
  type CheckPreconditionsOptions,
  type NpmStatusReport,
  type NpmViewer,
  type PreconditionReport,
  type ValidateVersionResult,
  type VerifyNpmStatusUntilPublishedOptions,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dispatchReleaseHelper(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
      process.exit(1);
    },
  );
}
