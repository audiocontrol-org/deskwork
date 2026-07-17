// specs/036-fleet-control-plane — T022 (impl), pairs with T021's RED test.
//
// PT-008 (research.md § PT-008 — SETTLED, not re-derived here): a
// **deny-by-default field policy**. Redaction PRECEDES spooling (FR-047/048)
// — the sidecar is the last hop under the operator's control, so nothing
// leaves this function unredacted:
//
//   - Fields are NOT emitted unless explicitly allowed (an allowlist, never
//     a denylist). A field absent from the allowlist is silently dropped,
//     however sensitive or innocuous its value.
//   - Absolute paths are normalized to installation-relative, or DROPPED
//     when they cannot be — never leaked as an absolute host path.
//   - Usernames, home-directory segments, and hostnames are redacted —
//     including inside otherwise-allowed free-text fields (commit messages,
//     error content), because a sensitive substring can appear anywhere in
//     prose, not only in a dedicated path field.
//   - Commit messages and error content are length-capped.
//   - Branch names are RETAINED VERBATIM — the one explicit exception
//     PT-008 names.
//
// SCOPE (per the task pairing): the redaction FIELD POLICY only — a pure
// function over an already-shaped event's string fields plus an explicit
// allowlist. NOT the spool, NOT retention (PT-008 is explicit: "retention
// is a plane-side configuration rather than a sidecar concern"), NOT the
// pipeline ordering that calls this (that is T086's job — this module is a
// building block it will import).
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). `RedactionContext` is
// the injected DI seam: tests pass a fully deterministic fake; only
// `createSystemRedactionContext` below touches the real machine.

import { hostname, homedir, userInfo } from 'node:os';
import { isAbsolute, relative as pathRelative } from 'node:path';

/**
 * The four field-level treatments PT-008 names. Every allowlisted field
 * must declare exactly one.
 */
export type FieldPolicy = 'path' | 'commit-message' | 'error' | 'branch';

/**
 * The deny-by-default allowlist: only fields present as keys here can ever
 * appear in `redactEvent`'s output, and only under the declared policy.
 */
export type FieldAllowlist = Readonly<Record<string, FieldPolicy>>;

/**
 * The DI seam (Constitution Principle VI). A plain data value — not a
 * class — so tests inject a fully deterministic fake with no real-machine
 * dependency (never the actual home directory, logged-in user, or
 * hostname). Only `createSystemRedactionContext` fills one from the real
 * machine, for production callers (the sidecar pipeline, T086).
 */
export interface RedactionContext {
  /** Absolute installation root. Absolute paths are normalized relative to
   * this; a path outside it is dropped, never leaked. */
  readonly installationRoot: string;
  /** Absolute home directory to redact out of free-text fields. */
  readonly homeDir: string;
  /** OS username to redact out of free-text fields. */
  readonly username: string;
  /** Hostname to redact out of free-text fields. */
  readonly hostname: string;
}

/**
 * Commit-message length cap. PT-014's constants table lists caps that are
 * "pinned at task time... engineering judgment sized against real
 * infrastructure floors, not looked-up facts" (research.md § PT-014) — this
 * constant follows that same pattern for the field-level cap PT-008 names
 * but PT-014's table does not itself enumerate a value for. Sized generously
 * above a typical commit body so ordinary messages pass through untouched,
 * while still bounding storage/transmission cost for a pathological one.
 */
export const COMMIT_MESSAGE_MAX_LENGTH = 500;

/**
 * Error-content length cap. Same basis as `COMMIT_MESSAGE_MAX_LENGTH` above
 * — sized larger to accommodate a short stack trace without truncating
 * routine diagnostics, while still bounding a pathological error blob.
 */
export const ERROR_CONTENT_MAX_LENGTH = 2000;

/** Appended to a value cut down to its cap, so a caller can tell truncation
 * occurred rather than mistaking a cut string for a naturally short one. */
const TRUNCATION_MARKER = '<truncated>';

const HOME_PLACEHOLDER = '<redacted-home>';
const USER_PLACEHOLDER = '<redacted-user>';
const HOST_PLACEHOLDER = '<redacted-host>';

/**
 * Redact one event's fields per PT-008. Deny-by-default: only keys present
 * in `allowlist` can appear in the returned object; every other key in
 * `input`, however sensitive, is silently absent from the output — never
 * inspected further, never partially emitted.
 *
 * Throws (fails loud, no silent coercion) when an allowlisted field is
 * present in `input` but its value is not a string, or when the allowlist
 * itself declares a policy value outside `FieldPolicy` (defends against a
 * malformed allowlist reaching here from non-typed callers, e.g. JSON).
 */
export function redactEvent(
  input: Readonly<Record<string, unknown>>,
  allowlist: FieldAllowlist,
  context: RedactionContext,
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [field, policy] of Object.entries(allowlist)) {
    if (!(field in input)) continue;
    const raw = input[field];
    if (typeof raw !== 'string') {
      throw new Error(
        `redactEvent: allowlisted field "${field}" (policy "${policy}") must be a string, got ${typeof raw}`,
      );
    }
    const redacted = applyPolicy(raw, policy, context, field);
    if (redacted !== undefined) {
      output[field] = redacted;
    }
  }
  return output;
}

/**
 * Applies one field's declared policy. Returns `undefined` to signal the
 * field must be DROPPED (only the `path` policy can do this — an absolute
 * path that cannot be made installation-relative).
 */
function applyPolicy(
  value: string,
  policy: FieldPolicy,
  context: RedactionContext,
  field: string,
): string | undefined {
  switch (policy) {
    case 'path':
      return redactPath(value, context);
    case 'branch':
      // PT-008's one explicit exception: retained verbatim, no substring
      // scrubbing, no length cap.
      return value;
    case 'commit-message':
      return truncate(scrubSubstrings(value, context), COMMIT_MESSAGE_MAX_LENGTH);
    case 'error':
      return truncate(scrubSubstrings(value, context), ERROR_CONTENT_MAX_LENGTH);
    default: {
      // Exhaustiveness guard: FieldPolicy is a closed union, so a
      // well-typed caller can never reach here. A malformed allowlist
      // arriving from an untyped boundary (e.g. deserialized JSON) can —
      // fail loud rather than silently emitting under an unknown policy.
      throw new Error(`redactEvent: field "${field}" declares unrecognized policy "${String(policy)}"`);
    }
  }
}

/**
 * `path` policy (PT-008): an absolute path is normalized to
 * installation-relative; a path that cannot be made installation-relative
 * (outside the installation root entirely) is DROPPED, never leaked as an
 * absolute host path. A relative-looking value passes through (still
 * scrubbed for sensitive substrings) since it carries no host-absolute
 * information to normalize away.
 *
 * Uses `node:path.relative` rather than a string-prefix check: a sibling
 * directory that merely shares the installation root as a text prefix
 * (e.g. installationRoot `/a/project`, path `/a/project-other/x`) is NOT
 * inside the installation, and only real path semantics get this right.
 */
function redactPath(value: string, context: RedactionContext): string | undefined {
  if (!isAbsolute(value)) {
    return scrubSubstrings(value, context);
  }
  const rel = pathRelative(context.installationRoot, value);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return undefined;
  }
  return rel;
}

/**
 * Redacts sensitive substrings (home directory, username, hostname) out of
 * free-text field content. Applied to every policy except `branch`
 * (PT-008's explicit exception) and applied on top of the `path` policy's
 * own absolute-path handling, since free text can embed a home-directory
 * segment or username anywhere, not only as a leading path component.
 *
 * Longest/most-specific substring (`homeDir`) is scrubbed first so a
 * username that is itself a substring of the home directory (e.g.
 * `/Users/alice` containing `alice`) is not left partially exposed by a
 * differently-ordered pass.
 */
function scrubSubstrings(value: string, context: RedactionContext): string {
  let result = value;
  if (context.homeDir.length > 0) {
    result = replaceAll(result, context.homeDir, HOME_PLACEHOLDER);
  }
  if (context.username.length > 0) {
    result = replaceAll(result, context.username, USER_PLACEHOLDER);
  }
  if (context.hostname.length > 0) {
    result = replaceAll(result, context.hostname, HOST_PLACEHOLDER);
  }
  return result;
}

function replaceAll(value: string, search: string, replacement: string): string {
  return value.split(search).join(replacement);
}

/** Caps `value` at `maxLength` characters of content, appending a marker so
 * truncation is distinguishable from a naturally short value. */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}${TRUNCATION_MARKER}`;
}

/**
 * Production factory: builds a `RedactionContext` from the real machine
 * (home directory, OS username, hostname) plus the caller-supplied
 * installation root. The DI seam itself is the `RedactionContext`
 * interface above — this factory is the one place that touches real
 * machine state; every test injects a fake `RedactionContext` directly
 * instead of calling this.
 */
export function createSystemRedactionContext(installationRoot: string): RedactionContext {
  return {
    installationRoot,
    homeDir: homedir(),
    username: userInfo().username,
    hostname: hostname(),
  };
}
