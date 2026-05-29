// Dispatch shim — back-compat alias for the renamed `check-clones`
// subcommand. The library API in scope-discovery/clone-detector.ts
// renamed `detectClones` -> `checkClones`; this file preserves the
// `dw-lifecycle detect-clones` invocation contract by re-exporting
// `checkClones` under the legacy `detectClones` name. Adopter hooks
// pinned to `detect-clones` (installed by earlier versions of
// `install-scope-discovery-hooks`) continue to work without
// modification.

import { checkClones } from '../scope-discovery/clone-detector.js';

export { checkClones as detectClones };
