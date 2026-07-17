/**
 * specs/036-fleet-control-plane — T021 (RED), pairs with T022's impl.
 *
 * PT-008 (research.md § PT-008 — SETTLED, not re-derived here): a
 * **deny-by-default field policy**. The sidecar is the last hop under the
 * operator's control, and redaction PRECEDES spooling (FR-047/048), so:
 *
 *   - Fields are NOT emitted unless explicitly allowed (an allowlist, not a
 *     denylist) — an unlisted field is silently dropped.
 *   - Absolute paths are normalized to installation-relative, or DROPPED —
 *     never leaked. Relative-looking values pass through (still scrubbed).
 *   - Usernames, home-directory segments, and hostnames are redacted —
 *     including inside otherwise-allowed free-text fields (commit messages,
 *     error content), because a sensitive substring can appear anywhere in
 *     prose, not just in a dedicated "path" field.
 *   - Commit messages and error content are length-capped.
 *   - Branch names are RETAINED verbatim (not redacted) — explicitly named
 *     as the one exception in PT-008.
 *
 * `RedactionContext` (installationRoot/homeDir/username/hostname) is an
 * injected DI seam (Constitution Principle VI) so this suite is fully
 * deterministic and never depends on the real machine's actual home
 * directory, logged-in user, or hostname.
 *
 * This repo's convention is relative `.js` imports under node16 module
 * resolution (no `@/` alias configured).
 */

import { describe, expect, it } from 'vitest';
import {
  COMMIT_MESSAGE_MAX_LENGTH,
  createSystemRedactionContext,
  ERROR_CONTENT_MAX_LENGTH,
  redactEvent,
  type FieldAllowlist,
  type RedactionContext,
} from '../../src/fleet/redact.js';

// Deterministic fake context — never the real machine's home/user/hostname.
const CTX: RedactionContext = {
  installationRoot: '/Users/testuser/work/project',
  homeDir: '/Users/testuser',
  username: 'testuser',
  hostname: 'test-host.local',
};

describe('redactEvent (T021, PT-008 deny-by-default field policy)', () => {
  it('deny-by-default: a field present in input but absent from the allowlist is dropped', () => {
    const allowlist: FieldAllowlist = { branch: 'branch' };
    const input = {
      branch: 'feature/redact-fields',
      secretField: 'this must never be emitted',
    };
    const output = redactEvent(input, allowlist, CTX);
    expect(output).toEqual({ branch: 'feature/redact-fields' });
    expect(output).not.toHaveProperty('secretField');
    // Prove the denied value never appears anywhere in the emitted output,
    // not merely that the key is absent.
    expect(JSON.stringify(output)).not.toContain('this must never be emitted');
  });

  it('deny-by-default: an allowlisted field simply absent from input is silently skipped (sparse envelopes)', () => {
    const allowlist: FieldAllowlist = { branch: 'branch', commitMessage: 'commit-message' };
    const output = redactEvent({ branch: 'main' }, allowlist, CTX);
    expect(output).toEqual({ branch: 'main' });
    expect(output).not.toHaveProperty('commitMessage');
  });

  it('absolute path under installationRoot is normalized to installation-relative', () => {
    const allowlist: FieldAllowlist = { file: 'path' };
    const output = redactEvent(
      { file: '/Users/testuser/work/project/src/fleet/redact.ts' },
      allowlist,
      CTX,
    );
    expect(output.file).toBe('src/fleet/redact.ts');
    // The installation root's absolute prefix never survives into the output.
    expect(output.file).not.toContain('/Users/testuser');
  });

  it('absolute path OUTSIDE installationRoot is DROPPED, not leaked', () => {
    const allowlist: FieldAllowlist = { file: 'path' };
    const output = redactEvent(
      { file: '/Users/testuser/other-project/secret.txt' },
      allowlist,
      CTX,
    );
    expect(output).not.toHaveProperty('file');
    expect(JSON.stringify(output)).not.toContain('secret.txt');
    expect(JSON.stringify(output)).not.toContain('/Users/testuser');
  });

  it('a sibling directory that merely shares the installationRoot as a STRING PREFIX is still outside it and is dropped', () => {
    // installationRoot is ".../work/project" — this path is
    // ".../work/project-other/..." which is NOT a subdirectory, only a
    // string-prefix collision. A naive startsWith() check would wrongly
    // treat this as inside; real path semantics (node:path.relative) must
    // not.
    const allowlist: FieldAllowlist = { file: 'path' };
    const output = redactEvent(
      { file: '/Users/testuser/work/project-other/leak.txt' },
      allowlist,
      CTX,
    );
    expect(output).not.toHaveProperty('file');
  });

  it('a relative path value passes through unchanged (only absolute paths are subject to the installation-relative rule)', () => {
    const allowlist: FieldAllowlist = { file: 'path' };
    const output = redactEvent({ file: 'src/fleet/redact.ts' }, allowlist, CTX);
    expect(output.file).toBe('src/fleet/redact.ts');
  });

  it('commit message: home-directory segment, username, and hostname substrings are all redacted', () => {
    const allowlist: FieldAllowlist = { commitMessage: 'commit-message' };
    const input = {
      commitMessage:
        'Fixes bug in /Users/testuser/work/project/notes.txt reported by ' +
        'testuser on test-host.local',
    };
    const output = redactEvent(input, allowlist, CTX);
    expect(output.commitMessage).not.toContain('/Users/testuser');
    expect(output.commitMessage).not.toContain('testuser');
    expect(output.commitMessage).not.toContain('test-host.local');
    expect(output.commitMessage).toContain('<redacted-home>');
    expect(output.commitMessage).toContain('<redacted-user>');
    expect(output.commitMessage).toContain('<redacted-host>');
    // The non-sensitive prose survives.
    expect(output.commitMessage).toContain('Fixes bug in');
    expect(output.commitMessage).toContain('reported by');
  });

  it('error content: home-directory segment, username, and hostname substrings are all redacted', () => {
    const allowlist: FieldAllowlist = { error: 'error' };
    const input = {
      error:
        'ENOENT: no such file /Users/testuser/work/project/missing.txt ' +
        '(host=test-host.local, user=testuser)',
    };
    const output = redactEvent(input, allowlist, CTX);
    expect(output.error).not.toContain('/Users/testuser');
    expect(output.error).not.toContain('testuser');
    expect(output.error).not.toContain('test-host.local');
    expect(output.error).toContain('<redacted-home>');
    expect(output.error).toContain('<redacted-user>');
    expect(output.error).toContain('<redacted-host>');
  });

  it('commit message is length-capped at COMMIT_MESSAGE_MAX_LENGTH characters of content', () => {
    const allowlist: FieldAllowlist = { commitMessage: 'commit-message' };
    const longMessage = 'x'.repeat(COMMIT_MESSAGE_MAX_LENGTH + 500);
    const output = redactEvent({ commitMessage: longMessage }, allowlist, CTX);
    expect(output.commitMessage.startsWith('x'.repeat(COMMIT_MESSAGE_MAX_LENGTH))).toBe(true);
    expect(output.commitMessage.length).toBeLessThan(longMessage.length);
    expect(output.commitMessage).toContain('<truncated>');
  });

  it('a commit message at or under the cap is emitted unmodified (aside from substring scrubbing)', () => {
    const allowlist: FieldAllowlist = { commitMessage: 'commit-message' };
    const shortMessage = 'fix: correct off-by-one in the sequence gap classifier';
    const output = redactEvent({ commitMessage: shortMessage }, allowlist, CTX);
    expect(output.commitMessage).toBe(shortMessage);
  });

  it('error content is length-capped at ERROR_CONTENT_MAX_LENGTH characters of content', () => {
    const allowlist: FieldAllowlist = { error: 'error' };
    const longError = 'e'.repeat(ERROR_CONTENT_MAX_LENGTH + 500);
    const output = redactEvent({ error: longError }, allowlist, CTX);
    expect(output.error.startsWith('e'.repeat(ERROR_CONTENT_MAX_LENGTH))).toBe(true);
    expect(output.error.length).toBeLessThan(longError.length);
    expect(output.error).toContain('<truncated>');
  });

  it('branch names are RETAINED VERBATIM — the one explicit non-redaction in PT-008', () => {
    const allowlist: FieldAllowlist = { branch: 'branch' };
    // Deliberately contains the injected username as a substring: proves
    // the 'branch' policy skips substring scrubbing entirely, unlike every
    // other policy.
    const branchName = 'feature/testuser-fixes-redaction';
    const output = redactEvent({ branch: branchName }, allowlist, CTX);
    expect(output.branch).toBe(branchName);
  });

  it('a branch name is retained even if it would otherwise exceed a length cap (no cap applies to branch)', () => {
    const allowlist: FieldAllowlist = { branch: 'branch' };
    const longBranch = `feature/${'b'.repeat(COMMIT_MESSAGE_MAX_LENGTH + 100)}`;
    const output = redactEvent({ branch: longBranch }, allowlist, CTX);
    expect(output.branch).toBe(longBranch);
  });

  it('fails loud when an allowlisted field is present but not a string (malformed input, no silent coercion)', () => {
    const allowlist: FieldAllowlist = { file: 'path' };
    expect(() => redactEvent({ file: 12345 }, allowlist, CTX)).toThrow(/file/);
  });

  it('exercises every PT-008 policy together on one realistic multi-field event, deny-by-default intact', () => {
    const allowlist: FieldAllowlist = {
      branch: 'branch',
      commitMessage: 'commit-message',
      error: 'error',
      workingFile: 'path',
    };
    const input = {
      branch: 'main',
      commitMessage: `Deployed by testuser from /Users/testuser/work/project`,
      error: 'no error',
      workingFile: '/Users/testuser/work/project/src/fleet/redact.ts',
      // Not in the allowlist — must never survive.
      rawEnv: { HOME: '/Users/testuser', USER: 'testuser' },
    };
    const output = redactEvent(input, allowlist, CTX);
    expect(Object.keys(output).sort()).toEqual(
      ['branch', 'commitMessage', 'error', 'workingFile'].sort(),
    );
    expect(output.branch).toBe('main');
    expect(output.workingFile).toBe('src/fleet/redact.ts');
    expect(output.commitMessage).not.toContain('/Users/testuser');
    expect(output.commitMessage).toContain('<redacted-user>');
    expect(JSON.stringify(output)).not.toContain('rawEnv');
  });
});

describe('createSystemRedactionContext (DI seam production factory, PT-008)', () => {
  it('builds a RedactionContext from the real machine plus an explicit installationRoot', () => {
    const ctx = createSystemRedactionContext('/some/installation/root');
    expect(ctx.installationRoot).toBe('/some/installation/root');
    expect(typeof ctx.homeDir).toBe('string');
    expect(ctx.homeDir.length).toBeGreaterThan(0);
    expect(typeof ctx.username).toBe('string');
    expect(ctx.username.length).toBeGreaterThan(0);
    expect(typeof ctx.hostname).toBe('string');
    expect(ctx.hostname.length).toBeGreaterThan(0);
  });
});
