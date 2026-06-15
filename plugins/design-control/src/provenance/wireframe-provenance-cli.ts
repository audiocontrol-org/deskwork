/**
 * Process entry for `bin/wireframe-provenance`. All behavior lives in
 * {@link runWireframeProvenance} (tested directly); this file only wires argv
 * and the process exit code.
 */

import { runWireframeProvenance } from '@/provenance/cli';

process.exitCode = runWireframeProvenance(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
