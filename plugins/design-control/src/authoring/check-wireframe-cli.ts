/**
 * Process entry for `bin/check-wireframe`. All behavior lives in
 * {@link runCheckWireframe} (tested directly); this file only wires argv and
 * the process exit code.
 */

import { runCheckWireframe } from '@/authoring/lint-file';

process.exitCode = runCheckWireframe(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
