// Installation config + resolution port — typed error (009 Phase 2).
//
// A single error type carrying a `code` so callers (the `setup` verb, the verbs'
// read path) map a failure to the right exit code without string-matching:
//   - not-found    → no installation in the upward walk (read path fails loud;
//                    setup creates one).
//   - invalid-config → a malformed/invalid .stack-control/config.yaml (a
//                    malformed managed item → setup exit 1).
//   - escape       → a resolved path escapes the installation root (FR-024) →
//                    setup exit 2 (config refusal).
//   - collision    → two keys (or two installations) resolve to the same path
//                    (FR-024) → setup exit 2 (config refusal).

export type InstallationErrorCode = 'not-found' | 'invalid-config' | 'escape' | 'collision';

export class InstallationError extends Error {
  readonly code: InstallationErrorCode;

  constructor(code: InstallationErrorCode, message: string) {
    super(message);
    this.name = 'InstallationError';
    this.code = code;
  }
}
