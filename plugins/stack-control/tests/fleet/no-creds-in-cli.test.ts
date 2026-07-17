// specs/036-fleet-control-plane — T110 (RED)
// contracts/sidecar-plane-protocol.md § C6: "Credentials live in the sidecar
// only — never in a CLI process, never on the local socket."
//
// DISTINCTION FROM token-not-on-socket.test.ts: that test proves the bearer
// token is never serialized onto the socket wire itself (frame-level guard).
// T110 proves a STRUCTURAL boundary: the token-custody module is not on the
// CLI's IMPORT GRAPH at all. The CLI emit path (src/telemetry/emit.js) does
// NOT load, hold, or touch bearer credentials — they live machine-local in
// the sidecar's custody only.
//
// Assertions (RED phase, unfixed code):
//   1. The CLI emit path imports src/telemetry/emit.js — assert that its
//      source file does NOT import from src/machine-state/token.js (the module
//      that T118 will build). Structural guard: token is not on the CLI's graph.
//   2. TOKEN_FILE_MODE === 0o600 — the sidecar-local token file mode.
//   3. TokenCustody.read() returns the token from a real machine-state dir
//      (0o600 file in a real temp dir, no mocked fs).
//
// The assumed API (design for T118 impl to conform to):
//   export interface TokenCustody { read(): string | undefined; }
//   export function openTokenCustody(machineStateDir: string): TokenCustody;
//   export const TOKEN_FILE_MODE = 0o600;
//
// Relative `.js` imports under node16; real filesystem; no `any`, no `as`,
// no `@ts-ignore`.

import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('no credentials in CLI process (T110, C6, SC-011)', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir !== undefined) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it('CLI emit path (src/telemetry/emit.ts) does NOT import token-custody module — structural guard against CLI holding credentials', () => {
    // Read the actual emit.ts source to verify it does not import from the
    // token-custody module (src/machine-state/token.ts). This is a structural
    // guarantee that the bearer token is not on the CLI's import graph.
    const emitSourcePath = join(
      __dirname,
      '../../src/telemetry/emit.ts',
    );

    // In the RED phase, emit.ts exists but token.ts does not.
    // After T118 lands, token.ts will exist; the assertion still holds:
    // emit.ts must never import from it.
    const emitSource = readFileSync(emitSourcePath, 'utf8');

    // Assert no import/require of the token module.
    expect(emitSource).not.toMatch(/from\s+['"].*machine-state\/token/);
    expect(emitSource).not.toMatch(/require\(['"].*machine-state\/token/);

    // Additional safety: assert no reference to "token" that suggests credential
    // handling (this is less strict than the import check, but catches sneakier
    // patterns like dynamic requires or manual credential passing).
    // We allow the word "token" in comments/strings, so we're looking for
    // patterns that suggest CODE using a token, not just mentioning it.
    // This is a secondary check; the primary guard is the import assertion.
    expect(emitSource).not.toMatch(/TokenCustody|openTokenCustody|TOKEN_FILE_MODE/);
  });

  it('TOKEN_FILE_MODE is 0o600 — the machine-local durable token file mode', async () => {
    // RED phase: token.ts does not exist. This test will fail with ModuleNotFoundError.
    // After T118 lands, it will pass.
    const { TOKEN_FILE_MODE } = await import(
      '../../src/machine-state/token.ts'
    );
    expect(TOKEN_FILE_MODE).toBe(0o600);
  });

  it('openTokenCustody.read() returns undefined when no token file exists', async () => {
    const { openTokenCustody } = await import(
      '../../src/machine-state/token.ts'
    );

    // Create a fresh temp dir with no token file inside.
    tempDir = mkdtempSync(join(tmpdir(), 'test-token-custody-'));

    const custody = openTokenCustody(tempDir);
    const result = custody.read();

    // No token file present → read() returns undefined (not throw).
    expect(result).toBeUndefined();
  });

  it('openTokenCustody.read() returns the seeded token from a real 0o600 file', async () => {
    const { openTokenCustody, TOKEN_FILE_MODE } = await import(
      '../../src/machine-state/token.ts'
    );

    // Create a fresh temp dir and write a token file at the expected location.
    tempDir = mkdtempSync(join(tmpdir(), 'test-token-custody-'));

    const testToken = 'sk-fleet-test-token-abc123def456';
    const tokenFilePath = join(tempDir, 'bearer-token');

    // Write with 0o600 mode (the contract).
    writeFileSync(tokenFilePath, testToken, {
      encoding: 'utf8',
      mode: TOKEN_FILE_MODE,
    });

    const custody = openTokenCustody(tempDir);
    const result = custody.read();

    // The seeded token is returned.
    expect(result).toBe(testToken);
  });

  it('TokenCustody interface surface is correct (no excessive properties)', async () => {
    const { openTokenCustody } = await import(
      '../../src/machine-state/token.ts'
    );

    tempDir = mkdtempSync(join(tmpdir(), 'test-token-custody-'));
    const custody = openTokenCustody(tempDir);

    // Verify the interface: read() method exists and is callable.
    expect(typeof custody.read).toBe('function');

    // Call it (should return undefined on empty dir).
    const result = custody.read();
    expect(result === undefined || typeof result === 'string').toBe(true);

    // No extraneous surface (no token property, no bearer, etc.).
    expect(Object.prototype.hasOwnProperty.call(custody, 'token')).toBe(false);
  });
});
