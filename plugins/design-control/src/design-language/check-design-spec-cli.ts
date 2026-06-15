/**
 * Process entry for `bin/check-design-spec`. All behavior lives in
 * {@link runCheckDesignSpec} (tested directly); this file only wires argv and
 * the process exit code.
 */

import { runCheckDesignSpec } from '@/design-language/check-spec-file';

process.exitCode = runCheckDesignSpec(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
