# Fleet Multi-Host Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let instances on other hosts report into one running fleet control plane by self-enrolling per-instance telemetry tokens under an operator-issued, host-scoped enrollment credential.

**Architecture:** The plane gains a persisted *fleet registry* (two race-free files: a CLI-owned `enrollment.json` for credentials + revocations, a plane-owned `telemetry.json` for enrolled tokens + their bound identity). A new `POST /v1/enroll` route, authed by an enrollment credential, mints a per-instance telemetry token, binds it to the caller-claimed `installationId`+`host:path` at enroll time, and persists it. The sidecar auto-enrolls on first run when it has no telemetry token but does have a host enrollment credential. The existing telemetry-token auth guard and `refuseInstallationMismatch`/`refuseInstanceMismatch` checks are reused unchanged — they now read their accepted set from the registry's live maps.

**Tech Stack:** TypeScript (node16 ESM), Node `http`/`fs`/`crypto`, vitest. No new runtime dependencies.

## Global Constraints

- **Design source of truth:** `docs/superpowers/specs/2026-07-20-fleet-multihost-enrollment-design.md`. Every task traces to it.
- **ESM/node16:** relative imports carry the `.js` extension; there is **no `@/` alias** in this plugin. From `tests/**` reach source as `../../src/...`; from `src/__tests__/**` reach helpers as `../_run-helpers.js`.
- **Typing (Constitution VI):** no `any`, no `as Type`, no `@ts-ignore`. Narrow with runtime guards. `tsconfig` has `noUncheckedIndexedAccess: true`.
- **File cap:** keep every file under 500 lines; split by responsibility.
- **Tests:** vitest, `globals: false` → always `import { describe, it, expect } from 'vitest'`. Test files live under `tests/**/*.test.ts` (fleet/machine-state/plane suites) or `src/__tests__/**/*.test.ts` (subcommand suites). Helper files use a leading `_` so they are not collected. Run one file: `npx vitest run <path>` from `plugins/stack-control/`.
- **Machine-state redirect is mandatory:** any test that touches a `durableDir`, token custody, identity, or the registry MUST use `useMachineStateStore()` from `tests/fleet/_machine-state-harness.ts`, so nothing writes into a real developer `$HOME`.
- **Always over Tailscale:** no TLS/mTLS in scope. Plaintext-HTTP bearer inside the tailnet is the transport.
- **Zero backwards compatibility (project rule):** delete the single-`--token` serve path and `plane provision-token` in the same change that replaces them. No `--legacy` arm, no deprecation alias.
- **Credential secrets:** minted via `randomBytes(32).toString('base64url')`. Never logged/echoed on success or failure — only confirmation lines. Persisted 0600 inside the plane/host durable dirs, never git-tracked.
- **Working directory / branch:** worktree `/Users/orion/work/deskwork-work/fleet-control-plane`, branch `feature/fleet-control-plane`. Commit + push after each task.

---

## File Structure

**New files**
- `src/plane/fleet-registry.ts` — registry data model, two-file load/persist, `mintCredential`, enroll/revoke logic, live maps for the runtime.
- `src/plane/http/enroll.ts` — the `POST /v1/enroll` route handler.
- `src/machine-state/enrollment-custody.ts` — host-level enrollment-credential custody (mirror of `token.ts`).
- `src/sidecar/enroll-client.ts` — sidecar-side `POST /v1/enroll` client.
- Test files under `tests/fleet/` and `src/__tests__/subcommands/` per task.

**Modified files**
- `src/machine-state/locate.ts` — add `locateHostState()` (host-level durable dir, not keyed by installation).
- `src/plane/runtime.ts` — `PlaneRuntimeOptions` gains `enrollment?`; conditionally mount `/v1/enroll`.
- `src/subcommands/plane.ts` — add `issue-enrollment` + `revoke`; rewrite `serve`; **delete** `provision-token`.
- `src/subcommands/plane-serve-options.ts` — **delete** (single-token binding); replaced by registry-backed serve.
- `src/subcommands/sidecar.ts` — add `set-enrollment`.
- `src/sidecar/daemon.ts` — auto-enroll between token read and `uplinkReady` (lines 262–268).
- SKILL docs: `plugins/stack-control/skills/{plane,sidecar}/SKILL.md`.

**Data types (defined in `fleet-registry.ts`, referenced everywhere)**

```ts
export interface InstanceBinding {
  readonly installationId: string;
  readonly host: string;
  readonly path: string;
  readonly credential: string; // the enrollment credential that minted this token
}
```

On-disk shapes:
- `enrollment.json` (CLI-owned): `{ "credentials": [{ "credential": string, "label": string }], "revokedTokens": string[], "revokedCredentials": string[] }`
- `telemetry.json` (plane-owned): `{ "tokens": { [token: string]: InstanceBinding } }`

Both live under `<planeDurableDir>/fleet/`.

---

## Task 1: Fleet registry — data model, two-file persistence, mint

**Files:**
- Create: `src/plane/fleet-registry.ts`
- Test: `tests/fleet/fleet-registry.test.ts`

**Interfaces:**
- Produces:
  - `InstanceBinding` (above).
  - `mintCredential(): string` — 43-char base64url secret.
  - `loadFleetRegistry(planeDurableDir: string): FleetRegistry` — reads both files (creating `fleet/` if absent), returns a live object.
  - `interface FleetRegistry {`
    - `activeTokens(): Map<string, string>` (token → installationId; excludes revoked) — the SAME Map instance the runtime holds; enroll mutates it in place.
    - `instanceBindings(): Map<string, string>` (token → "host:path"; excludes revoked)
    - `revokedTokens(): Set<string>`
    - `enrollmentCredentials(): Set<string>`
    - `enroll(credential: string, identity: { installationId: string; host: string; path: string }): EnrollOutcome`
    - `addCredential(credential: string, label: string): void`
    - `revokeToken(token: string): void` / `revokeCredential(credential: string): void`
  - `}`
  - `type EnrollOutcome = { ok: true; token: string } | { ok: false; reason: 'unknown-credential' | 'identity-owned-by-other-credential' }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/fleet/fleet-registry.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFleetRegistry, mintCredential } from '../../src/plane/fleet-registry.js';

let dir: string | undefined;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined; });
function makeDir(): string { dir = mkdtempSync(join(tmpdir(), 'scf-registry-')); return dir; }

describe('fleet-registry', () => {
  it('mintCredential yields a 43-char base64url secret, unique per call', () => {
    const a = mintCredential();
    const b = mintCredential();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('enroll binds identity, exposes the token in live maps, and persists across reload', () => {
    const d = makeDir();
    const reg = loadFleetRegistry(d);
    reg.addCredential('cred-1', 'hostB');
    const out = reg.enroll('cred-1', { installationId: 'inst-1', host: 'hostB', path: '/p' });
    expect(out).toEqual({ ok: true, token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    if (!out.ok) throw new Error('unreachable');
    expect(reg.activeTokens().get(out.token)).toBe('inst-1');
    expect(reg.instanceBindings().get(out.token)).toBe('hostB:/p');

    const reloaded = loadFleetRegistry(d);
    expect(reloaded.activeTokens().get(out.token)).toBe('inst-1');
    expect(reloaded.enrollmentCredentials().has('cred-1')).toBe(true);
  });

  it('enroll rejects an unknown credential', () => {
    const reg = loadFleetRegistry(makeDir());
    expect(reg.enroll('nope', { installationId: 'i', host: 'h', path: '/p' }))
      .toEqual({ ok: false, reason: 'unknown-credential' });
  });

  it('re-enroll of the same identity under the SAME credential supersedes (self-heal), revoking the prior token', () => {
    const reg = loadFleetRegistry(makeDir());
    reg.addCredential('cred-1', 'hostB');
    const first = reg.enroll('cred-1', { installationId: 'i', host: 'h', path: '/p' });
    const second = reg.enroll('cred-1', { installationId: 'i', host: 'h', path: '/p' });
    if (!first.ok || !second.ok) throw new Error('unreachable');
    expect(second.token).not.toBe(first.token);
    expect(reg.activeTokens().has(first.token)).toBe(false);
    expect(reg.activeTokens().get(second.token)).toBe('i');
  });

  it('re-enroll of an identity owned by a DIFFERENT credential is refused', () => {
    const reg = loadFleetRegistry(makeDir());
    reg.addCredential('cred-1', 'hostB');
    reg.addCredential('cred-2', 'hostC');
    reg.enroll('cred-1', { installationId: 'i', host: 'h', path: '/p' });
    expect(reg.enroll('cred-2', { installationId: 'i', host: 'h', path: '/p' }))
      .toEqual({ ok: false, reason: 'identity-owned-by-other-credential' });
  });

  it('revokeToken removes the token from the live active map and persists', () => {
    const d = makeDir();
    const reg = loadFleetRegistry(d);
    reg.addCredential('cred-1', 'hostB');
    const out = reg.enroll('cred-1', { installationId: 'i', host: 'h', path: '/p' });
    if (!out.ok) throw new Error('unreachable');
    reg.revokeToken(out.token);
    expect(reg.activeTokens().has(out.token)).toBe(false);
    expect(reg.revokedTokens().has(out.token)).toBe(true);
    expect(loadFleetRegistry(d).revokedTokens().has(out.token)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fleet/fleet-registry.test.ts`
Expected: FAIL — `loadFleetRegistry`/`mintCredential` not exported.

- [ ] **Step 3: Write minimal implementation**

Implement `src/plane/fleet-registry.ts`. Key points:
- `mintCredential()` = `randomBytes(32).toString('base64url')` (32 bytes → 43 base64url chars).
- `loadFleetRegistry(dir)`: `fleetDir = join(dir, 'fleet')`; `mkdirSync(fleetDir, { recursive: true, mode: 0o700 })`; read `enrollment.json` + `telemetry.json` if present (JSON.parse), else start empty. Build the live `active`/`instances` Maps and `revoked`/`creds` Sets, excluding tokens in `revokedTokens` and creds in `revokedCredentials`. Hold the parsed shapes in closure.
- `enroll(cred, identity)`: if `!creds.has(cred)` → `{ ok:false, reason:'unknown-credential' }`. Find any existing token whose binding matches `identity.installationId+host+path`: if found and its `.credential !== cred` → `{ ok:false, reason:'identity-owned-by-other-credential' }`; if found and same cred → delete it (supersede/self-heal) from `tokens`+`active`+`instances`. Mint `token = mintCredential()`, set `tokens[token] = { ...identity, credential: cred }`, `active.set(token, installationId)`, `instances.set(token, \`${host}:${path}\`)`, persist telemetry.json, return `{ ok:true, token }`.
- `addCredential(cred, label)`: push to enrollment.credentials, add to live set, persist enrollment.json.
- `revokeToken(token)`: push to enrollment.revokedTokens, delete from active/instances, add to revoked set, persist enrollment.json.
- `revokeCredential(cred)`: push to enrollment.revokedCredentials, delete from creds set, persist enrollment.json.
- Persist helpers write with `{ mode: 0o600 }` via `writeFileSync` + `chmodSync` (mirror `token.ts`). Persist telemetry.json and enrollment.json independently (each has one writer role).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fleet/fleet-registry.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/stack-control/src/plane/fleet-registry.ts plugins/stack-control/tests/fleet/fleet-registry.test.ts
git commit -m "feat(fleet): fleet registry — enroll/revoke + two-file persistence"
git push origin feature/fleet-control-plane
```

---

## Task 2: Enroll HTTP handler

**Files:**
- Create: `src/plane/http/enroll.ts`
- Test: `tests/fleet/enroll-handler.test.ts`

**Interfaces:**
- Consumes: `FleetRegistry` (Task 1); `RouteHandler`, `RouteContext` from `../http/server.js`; `respondJson`, `readJsonBody`, `parseBearer` from `../runtime-http.js` / `../http/auth.js`.
- Produces: `createEnrollHandler(registry: FleetRegistry): RouteHandler`.

Behavior of `POST /v1/enroll`:
- `parseBearer(authorization)` → credential; body `{ installationId, host, path }` via `readJsonBody`.
- Missing/malformed body fields → 400 `{ error: 'bad-request', detail }`.
- `registry.enroll(cred, identity)`:
  - `unknown-credential` → 401 `{ error: 'unauthorized', reason: 'unknown-credential' }`
  - `identity-owned-by-other-credential` → 409 `{ error: 'conflict', reason: 'identity-owned-by-other-credential' }`
  - ok → 200 `{ token }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/fleet/enroll-handler.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { loadFleetRegistry } from '../../src/plane/fleet-registry.js';
import { createEnrollHandler } from '../../src/plane/http/enroll.js';

let dir: string | undefined;
let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((r) => server?.close(() => r()));
  if (dir) rmSync(dir, { recursive: true, force: true });
  server = undefined; dir = undefined;
});

async function start(): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'scf-enroll-'));
  const reg = loadFleetRegistry(dir);
  reg.addCredential('cred-1', 'hostB');
  const handler = createEnrollHandler(reg);
  server = createServer((req, res) => {
    void handler({ req, res, params: {}, url: new URL(req.url ?? '/', 'http://x') });
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no port');
  return `http://127.0.0.1:${(addr satisfies AddressInfo).port}`;
}

describe('POST /v1/enroll', () => {
  it('mints a token for a valid credential + identity', async () => {
    const base = await start();
    const res = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { authorization: 'Bearer cred-1', 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: 'inst-1', host: 'hostB', path: '/p' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
  });

  it('rejects an unknown credential with 401', async () => {
    const base = await start();
    const res = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { authorization: 'Bearer nope', 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: 'i', host: 'h', path: '/p' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reason: 'unknown-credential' });
  });

  it('rejects a malformed body with 400', async () => {
    const base = await start();
    const res = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { authorization: 'Bearer cred-1', 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: 'i' }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fleet/enroll-handler.test.ts`
Expected: FAIL — `createEnrollHandler` not exported.

- [ ] **Step 3: Write minimal implementation**

`createEnrollHandler(registry)` returns an async `RouteHandler` that: reads `parseBearer(ctx.req.headers.authorization)`; if undefined → 401 `{ error:'unauthorized', reason:'missing' }`. `const body = await readJsonBody(ctx.req)`; guard `body` is a record with string `installationId`/`host`/`path`, else `respondJson(res, 400, { error:'bad-request', detail:'enroll body must be { installationId, host, path }' })`. Call `registry.enroll(cred, { installationId, host, path })`; map outcome to 200/401/409 per the table above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fleet/enroll-handler.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/stack-control/src/plane/http/enroll.ts plugins/stack-control/tests/fleet/enroll-handler.test.ts
git commit -m "feat(fleet): POST /v1/enroll handler over the fleet registry"
git push origin feature/fleet-control-plane
```

---

## Task 3: Wire the registry + enroll route into the plane runtime

**Files:**
- Modify: `src/plane/runtime.ts` (PlaneRuntimeOptions ~78-128; sidecar routes ~287-292)
- Test: `tests/fleet/plane-enroll-e2e.test.ts`

**Interfaces:**
- `PlaneRuntimeOptions` gains: `readonly enrollment?: { readonly handler: RouteHandler }`. When present, the runtime appends `{ method: 'POST', pattern: '/v1/enroll', handler: options.enrollment.handler }` to `sidecarRoutes` (NOT wrapped in the telemetry `withAuth` — it authenticates by enrollment credential inside the handler).
- The existing `acceptedTokens`/`acceptedInstances`/`revokedTokens` inputs are unchanged in type; the serve layer (Task 5) will pass the registry's **live** Map/Set instances so enroll mutations are visible without restart.

- [ ] **Step 1: Write the failing test** — an end-to-end runtime test: enroll, then use the returned token to ingest.

```ts
// tests/fleet/plane-enroll-e2e.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boundPort } from '../_bound-port.js';
import { createPlaneRuntime } from '../../src/plane/runtime.js';
import { loadFleetRegistry } from '../../src/plane/fleet-registry.js';
import { createEnrollHandler } from '../../src/plane/http/enroll.js';

// makeRawEvent copied from plane-serve.test.ts helper shape (envelope with installationId/host/path).
function makeRawEvent(o: { installationId: string; host: string; path: string; runId: string }): unknown {
  return {
    envelope: { installationId: o.installationId, host: o.host, path: o.path,
      eventId: 'e1', invocationSequence: 1, emittedAt: new Date(0).toISOString() },
    runId: o.runId, type: 'run.started', classification: 'live-only',
  };
}

let dir: string | undefined; let server: import('node:http').Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((r) => server?.close(() => r()));
  if (dir) rmSync(dir, { recursive: true, force: true }); server = undefined; dir = undefined;
});

async function startPlane(): Promise<{ base: string; cred: string }> {
  dir = mkdtempSync(join(tmpdir(), 'scf-enroll-e2e-'));
  const reg = loadFleetRegistry(dir);
  reg.addCredential('cred-1', 'hostB');
  const runtime = createPlaneRuntime({
    acceptedTokens: reg.activeTokens(),
    acceptedInstances: reg.instanceBindings(),
    revokedTokens: reg.revokedTokens(),
    commandStoreDir: join(dir, 'commands'),
    enrollment: { handler: createEnrollHandler(reg) },
  });
  server = runtime.createServer();
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()));
  return { base: `http://127.0.0.1:${boundPort(server)}`, cred: 'cred-1' };
}

describe('plane enroll → ingest end to end', () => {
  it('a freshly-enrolled token is accepted by /v1/ingest for its bound identity', async () => {
    const { base, cred } = await startPlane();
    const enroll = await fetch(`${base}/v1/enroll`, {
      method: 'POST', headers: { authorization: `Bearer ${cred}`, 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: 'inst-1', host: 'hostB', path: '/p' }),
    });
    expect(enroll.status).toBe(200);
    const { token } = (await enroll.json()) as { token: string };

    const ok = await fetch(`${base}/v1/ingest`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(makeRawEvent({ installationId: 'inst-1', host: 'hostB', path: '/p', runId: 'r1' })),
    });
    expect(ok.status).toBe(200);
  });

  it('the enrolled token is refused 403 for a DIFFERENT identity', async () => {
    const { base, cred } = await startPlane();
    const enroll = await fetch(`${base}/v1/enroll`, {
      method: 'POST', headers: { authorization: `Bearer ${cred}`, 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: 'inst-1', host: 'hostB', path: '/p' }),
    });
    const { token } = (await enroll.json()) as { token: string };
    const bad = await fetch(`${base}/v1/ingest`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(makeRawEvent({ installationId: 'other', host: 'hostZ', path: '/q', runId: 'r2' })),
    });
    expect(bad.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fleet/plane-enroll-e2e.test.ts`
Expected: FAIL — `enrollment` not accepted / `/v1/enroll` 404s.

- [ ] **Step 3: Implement** — add the optional `enrollment` field to `PlaneRuntimeOptions`; in the `sidecarRoutes` array assembly, conditionally append the enroll route when `options.enrollment !== undefined`. (Reuse the exact envelope field names the existing `ingestClaimedInstallationId`/`ingestClaimedInstance` read — confirm `makeRawEvent` matches the real helper in `plane-serve.test.ts`; adjust the copied helper if the real envelope requires more fields for `ingestEvent` to reach `accepted`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fleet/plane-enroll-e2e.test.ts`
Expected: PASS. Also run the existing suite to confirm no regression: `npx vitest run tests/fleet/plane-serve.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add plugins/stack-control/src/plane/runtime.ts plugins/stack-control/tests/fleet/plane-enroll-e2e.test.ts
git commit -m "feat(fleet): mount /v1/enroll on the plane runtime behind the fleet registry"
git push origin feature/fleet-control-plane
```

---

## Task 4: Host-level enrollment-credential custody

**Files:**
- Modify: `src/machine-state/locate.ts` (add `locateHostState`)
- Create: `src/machine-state/enrollment-custody.ts`
- Test: `tests/fleet/enrollment-custody.test.ts`

**Interfaces:**
- Produces:
  - `locateHostState(): { readonly durableDir: string }` — the host-level `stack-control` app dir (`join(durableBase(platform), 'stack-control')`), 0700, **shared across all installations on the host** (NOT keyed by installation root). Reuses the private `durableBase`/`ensureDir0700` already in `locate.ts`.
  - `openEnrollmentCustody(hostDurableDir: string): EnrollmentCustody` where `EnrollmentCustody = { read(): string | undefined; write(credential: string): void }` — mirror of `openTokenCustody`, filename `enrollment-credential`, mode 0600.

- [ ] **Step 1: Write the failing test**

```ts
// tests/fleet/enrollment-custody.test.ts
import { describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import { locateHostState } from '../../src/machine-state/locate.js';
import { openEnrollmentCustody } from '../../src/machine-state/enrollment-custody.js';
import { useMachineStateStore } from './_machine-state-harness.js';

describe('host-level enrollment custody', () => {
  useMachineStateStore(); // redirects HOME/XDG so nothing lands in a real home

  it('locateHostState resolves a host-level durable dir under the redirected store', () => {
    const host = locateHostState();
    expect(typeof host.durableDir).toBe('string');
    expect(host.durableDir.length).toBeGreaterThan(0);
  });

  it('write then read round-trips the credential at 0600', () => {
    const host = locateHostState();
    const custody = openEnrollmentCustody(host.durableDir);
    expect(custody.read()).toBeUndefined();
    custody.write('cred-abc');
    expect(custody.read()).toBe('cred-abc');
    if (process.platform !== 'win32') {
      const mode = statSync(`${host.durableDir}/enrollment-credential`).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/fleet/enrollment-custody.test.ts` → FAIL (`locateHostState`/`openEnrollmentCustody` missing).

- [ ] **Step 3: Implement** — in `locate.ts` add `export function locateHostState(): { readonly durableDir: string }` computing `const durableDir = join(durableBase(platform()), 'stack-control'); ensureDir0700(durableDir); return { durableDir };`. Create `enrollment-custody.ts` copying the `token.ts` structure with `ENROLLMENT_FILENAME = 'enrollment-credential'` and `EnrollmentCustody`/`openEnrollmentCustody`.

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/fleet/enrollment-custody.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/stack-control/src/machine-state/locate.ts plugins/stack-control/src/machine-state/enrollment-custody.ts plugins/stack-control/tests/fleet/enrollment-custody.test.ts
git commit -m "feat(machine-state): host-level enrollment-credential custody"
git push origin feature/fleet-control-plane
```

---

## Task 5: Rewrite `plane serve` on the registry; delete `provision-token` + single-token binding (clean break)

**Files:**
- Modify: `src/subcommands/plane.ts` (`runServe` 183-218; delete `runProvisionToken` 99-108, `parseProvisionTokenArgs` 64-89, the `--token` in `parseServeArgs`, the `provision-token` dispatch arm, its `SUBACTION_SPECS`/`USAGE` entries)
- Delete: `src/subcommands/plane-serve-options.ts`
- Delete/rework: `tests/fleet/plane-serve-instance-auth.test.ts` (used `buildServeRuntimeOptions`), `tests/fleet/plane-provision-token.test.ts`
- Test: `tests/fleet/plane-serve-registry.test.ts`

**Interfaces:**
- `parseServeArgs` now yields `{ readonly port: number }` only (no `--token`). `SERVE_USAGE = 'usage: plane serve --port <n>'`.
- `runServe`: `location = locateMachineState(cwd)`; `installationId = mintOrReadInstallationId(cwd)`; `planeDurableDir = join(location.durableDir, 'plane')`; `registry = loadFleetRegistry(planeDurableDir)`; **seed loopback:** if `registry.enrollmentCredentials().size === 0`, `const seed = mintCredential(); registry.addCredential(seed, 'local'); openEnrollmentCustody(locateHostState().durableDir).write(seed)` (so host A's own sidecars self-enroll through the identical path). Build runtime with `acceptedTokens: registry.activeTokens()`, `acceptedInstances: registry.instanceBindings()`, `revokedTokens: registry.revokedTokens()`, `commandStoreDir: join(planeDurableDir, 'commands')`, `enrollment: { handler: createEnrollHandler(registry) }`. Listen as before.

- [ ] **Step 1: Write the failing test** — an in-process `runServe` test that starts on `--port 0`, then enrolls over the loopback and confirms the seeded credential exists in the host custody. Use the `useMachineStateStore()` harness + `process.chdir` into a tmp installation root (mirror `plane-provision-token.test.ts`'s chdir/finally). Because `runServe` blocks, drive it by spawning through `runCli(['plane','serve','--port','0'], { cwd })` and asserting the `plane: serving on port` line appears; then kill the child. (If a child-process wait is awkward, assert instead at the unit level: extract a `buildServeRuntime(cwd, port)` pure helper returning `{ runtime, seededCredential }` and test THAT — recommended; keep `runServe` a thin wrapper that listens.)

Recommended unit shape:

```ts
// tests/fleet/plane-serve-registry.test.ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServeRuntime } from '../../src/subcommands/plane.js';
import { openEnrollmentCustody } from '../../src/machine-state/enrollment-custody.js';
import { locateHostState } from '../../src/machine-state/locate.js';
import { useMachineStateStore } from './_machine-state-harness.js';

describe('plane serve on the fleet registry', () => {
  useMachineStateStore();
  it('seeds a loopback enrollment credential into host custody on first serve', () => {
    const root = mkdtempSync(join(tmpdir(), 'scf-serve-'));
    try {
      const built = buildServeRuntime(root);
      expect(built.runtime).toBeDefined();
      const seeded = openEnrollmentCustody(locateHostState().durableDir).read();
      expect(seeded).toMatch(/^[A-Za-z0-9_-]{43}$/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/fleet/plane-serve-registry.test.ts` → FAIL (`buildServeRuntime` not exported).

- [ ] **Step 3: Implement** — extract `export function buildServeRuntime(installationRoot: string): { runtime: PlaneRuntime; }` doing the registry load + loopback seed + `createPlaneRuntime` wiring; make `runServe` call it then `listen(port)`. Delete `provision-token` machinery + `plane-serve-options.ts` and its imports. Update `PLANE_USAGE`/`SUBACTION_SPECS` (drop `provision-token`).

- [ ] **Step 4: Run tests** — `npx vitest run tests/fleet/plane-serve-registry.test.ts` → PASS. Delete the two obsolete tests, then run the whole fleet suite: `npx vitest run tests/fleet` → all green. Fix any test that imported the deleted `plane-serve-options.js`.

- [ ] **Step 5: Commit**

```bash
git add -A plugins/stack-control/src/subcommands plugins/stack-control/tests/fleet
git commit -m "feat(fleet)!: plane serve on the fleet registry; remove provision-token + single-token binding"
git push origin feature/fleet-control-plane
```

---

## Task 6: `plane issue-enrollment` verb

**Files:**
- Modify: `src/subcommands/plane.ts` (add `runIssueEnrollment`, dispatch arm, `PLANE_USAGE`, `SUBACTION_SPECS`)
- Test: `src/__tests__/subcommands/plane-issue-enrollment.test.ts`

**Interfaces:**
- `stackctl plane issue-enrollment [--label <host>]` → loads the registry at `join(locateMachineState(cwd).durableDir, 'plane')`, mints a credential, `registry.addCredential(cred, label ?? 'unlabeled')`, prints the credential ONCE to stdout on its own line (this is the one credential the operator carries — it is intentionally printed here, unlike telemetry tokens). Strict args: unknown flag / missing `--label` value / stray positional → exit 2.

- [ ] **Step 1: Write the failing test** — `runCli(['plane','issue-enrollment','--label','hostB'], { cwd })` inside a `useMachineStateStore()`-redirected + tmp-root chdir; assert `r.status === 0`, `r.stdout` contains a 43-char base64url line, and a second `loadFleetRegistry(...)` shows the credential present. Assert `runCli(['plane','issue-enrollment','--bogus'])` → `r.status === 2`.

- [ ] **Step 2: Run → FAIL** (`unknown subcommand 'issue-enrollment'`).
- [ ] **Step 3: Implement** the verb + dispatch arm.
- [ ] **Step 4: Run → PASS**: `npx vitest run src/__tests__/subcommands/plane-issue-enrollment.test.ts`.
- [ ] **Step 5: Commit**

```bash
git add plugins/stack-control/src/subcommands/plane.ts plugins/stack-control/src/__tests__/subcommands/plane-issue-enrollment.test.ts
git commit -m "feat(fleet): plane issue-enrollment mints a host enrollment credential"
git push origin feature/fleet-control-plane
```

---

## Task 7: `plane revoke` verb

**Files:**
- Modify: `src/subcommands/plane.ts` (add `runRevoke`, dispatch arm, usage)
- Test: `src/__tests__/subcommands/plane-revoke.test.ts`

**Interfaces:**
- `stackctl plane revoke (--token <t> | --enrollment <e>)` — exactly one of the two required; loads the registry, calls `revokeToken`/`revokeCredential`, prints a confirmation (no secret echoed). Both or neither → exit 2. **Scope note (state in commit body):** revocation is written to `enrollment.json` and takes effect at the next `serve` (the plane snapshots the accepted set at startup). Live revocation without restart is a named follow-on in the design's Scope Boundary, not implemented here.

- [ ] **Step 1: Write the failing test** — seed a registry with an enrolled token (via `loadFleetRegistry` + `addCredential` + `enroll`), then `runCli(['plane','revoke','--token', <tok>], { cwd })` → status 0, and `loadFleetRegistry(...).revokedTokens().has(tok)` true. Assert `--token x --enrollment y` → exit 2; no flags → exit 2.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**

```bash
git add plugins/stack-control/src/subcommands/plane.ts plugins/stack-control/src/__tests__/subcommands/plane-revoke.test.ts
git commit -m "feat(fleet): plane revoke (token|enrollment), restart-effective per design scope"
git push origin feature/fleet-control-plane
```

---

## Task 8: `sidecar set-enrollment` verb

**Files:**
- Modify: `src/subcommands/sidecar.ts` (add `runSetEnrollment`, dispatch arm, `SIDECAR_USAGE`, `SUBACTION_SPECS`)
- Test: `src/__tests__/subcommands/sidecar-set-enrollment.test.ts`

**Interfaces:**
- `stackctl sidecar set-enrollment --token <cred>` → `openEnrollmentCustody(locateHostState().durableDir).write(cred)`; prints `sidecar: enrollment credential stored` (no echo of the secret). Missing `--token` / unknown flag / stray positional → exit 2.

- [ ] **Step 1: Write the failing test** — `useMachineStateStore()`; `runCli(['sidecar','set-enrollment','--token','cred-xyz'], { cwd })` → status 0; `openEnrollmentCustody(locateHostState().durableDir).read()` === 'cred-xyz'. `runCli(['sidecar','set-enrollment'])` → exit 2.
- [ ] **Step 2: Run → FAIL** (`unknown subcommand 'set-enrollment'`).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**

```bash
git add plugins/stack-control/src/subcommands/sidecar.ts plugins/stack-control/src/__tests__/subcommands/sidecar-set-enrollment.test.ts
git commit -m "feat(fleet): sidecar set-enrollment stores the host enrollment credential"
git push origin feature/fleet-control-plane
```

---

## Task 9: Sidecar enroll client

**Files:**
- Create: `src/sidecar/enroll-client.ts`
- Test: `tests/fleet/sidecar-enroll-client.test.ts`

**Interfaces:**
- Produces: `enrollInstance(args: { planeUrl: string; credential: string; identity: { installationId: string; host: string; path: string } }): Promise<{ ok: true; token: string } | { ok: false; status: number }>`. POSTs `${planeUrl}/v1/enroll` with `Authorization: Bearer <credential>` and the identity body; returns the token on 200, else `{ ok:false, status }`. Uses global `fetch`. No token custody knowledge here (the daemon writes custody).

- [ ] **Step 1: Write the failing test** — stand up a tiny `node:http` server that returns `{ token: 't-1' }` for a good cred and 401 otherwise; assert `enrollInstance` returns `{ ok:true, token:'t-1' }` and `{ ok:false, status:401 }` respectively.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS:** `npx vitest run tests/fleet/sidecar-enroll-client.test.ts`.
- [ ] **Step 5: Commit**

```bash
git add plugins/stack-control/src/sidecar/enroll-client.ts plugins/stack-control/tests/fleet/sidecar-enroll-client.test.ts
git commit -m "feat(fleet): sidecar enroll client (POST /v1/enroll)"
git push origin feature/fleet-control-plane
```

---

## Task 10: Auto-enroll on `sidecar run`

**Files:**
- Modify: `src/sidecar/daemon.ts` (between the token read at ~267 and `uplinkReady` at ~268)
- Test: `tests/fleet/sidecar-auto-enroll.test.ts`

**Interfaces:**
- Consumes: `enrollInstance` (Task 9), `openEnrollmentCustody`+`locateHostState` (Task 4), `openTokenCustody` (existing), `deriveInstanceFields`+`mintOrReadInstallationId` (existing).
- Behavior: after `const token = openTokenCustody(location.durableDir).read();`, if `token === undefined` AND `planeUrl` is set AND `openEnrollmentCustody(locateHostState().durableDir).read()` returns a credential, then derive identity (`installationId = mintOrReadInstallationId(root)`, `{host,path} = deriveInstanceFields(root)`), call `enrollInstance({ planeUrl, credential, identity })`; on `ok`, `openTokenCustody(location.durableDir).write(result.token)` and re-read into `token`. On failure, leave `token` undefined (uplink stays inactive; existing behavior — the WAL still spools). Enroll is injected as a seam `options.enroll?` (defaulting to `enrollInstance`) so the test uses a fake and never hits the network.

- [ ] **Step 1: Write the failing test** — construct `runSidecarDaemon({ installationRoot, planeUrl: 'http://x', enroll: fakeEnroll })` under `useMachineStateStore()` with an enrollment credential pre-written to host custody and NO telemetry token; assert `fakeEnroll` was called with the derived identity and that the telemetry token custody now holds the returned token. (Election machinery: reuse the daemon-test setup pattern from `tests/fleet/sidecar-daemon.test.ts`.)
- [ ] **Step 2: Run → FAIL** (no `enroll` seam; token stays undefined).
- [ ] **Step 3: Implement** the injection + the optional `enroll` seam on `SidecarDaemonOptions`.
- [ ] **Step 4: Run → PASS:** `npx vitest run tests/fleet/sidecar-auto-enroll.test.ts`; then `npx vitest run tests/fleet/sidecar-daemon.test.ts` to confirm no regression.
- [ ] **Step 5: Commit**

```bash
git add plugins/stack-control/src/sidecar/daemon.ts plugins/stack-control/tests/fleet/sidecar-auto-enroll.test.ts
git commit -m "feat(fleet): sidecar run auto-enrolls when it has a credential but no token"
git push origin feature/fleet-control-plane
```

---

## Task 11: Update plane + sidecar SKILL docs

**Files:**
- Modify: `plugins/stack-control/skills/plane/SKILL.md`, `plugins/stack-control/skills/sidecar/SKILL.md`

**Changes (no code):** Replace the `provision-token` section with `issue-enrollment` + `revoke`; document `serve` without `--token` (loads the fleet registry, seeds a loopback credential); document `sidecar set-enrollment` + auto-enroll on `run`; state the always-tailnet transport assumption and that revocation/new-credential pickup is restart-effective. Keep the fail-loud/exit-code sections accurate to the new arg grammars.

- [ ] **Step 1:** Rewrite both SKILL.md files to match the shipped verbs.
- [ ] **Step 2: Verify** each documented command against the code (arg names, exit codes).
- [ ] **Step 3: Commit**

```bash
git add plugins/stack-control/skills/plane/SKILL.md plugins/stack-control/skills/sidecar/SKILL.md
git commit -m "docs(fleet): plane/sidecar skills for enrollment-based multi-host"
git push origin feature/fleet-control-plane
```

---

## Task 12: Live two-host acceptance (dogfood) — manual, not CI

**Files:**
- Create: `docs/superpowers/specs/2026-07-20-fleet-multihost-acceptance.md` (a runnable checklist)

Per the project rule "no test infrastructure in CI," this is a **local-only** acceptance walkthrough, the test this feature exists for:

1. On host A: `stackctl plane serve --port 47800` (note the seeded loopback credential path).
2. On host A: `stackctl plane issue-enrollment --label hostB` → copy the printed credential.
3. On host B (over the tailnet): `stackctl sidecar set-enrollment --token <credential>`, then `stackctl sidecar run --plane-url http://<hostA-tailnet-ip>:47800`.
4. On host A: `curl -H "Authorization: Bearer <a-local-token>" http://127.0.0.1:47800/v1/instances` → host B's instance appears. (A local token is obtained by running a host-A sidecar, which self-enrolls off the seeded loopback credential.)
5. Re-run `sidecar run` in a second checkout on host B → a second instance appears under the same credential.
6. Negative: a foreign-identity uplink under a host-B token → 403 (already covered by Task 3's automated test; re-confirm live).

- [ ] **Step 1:** Write the checklist doc.
- [ ] **Step 2:** Execute it against a real second tailnet host; record results inline.
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-20-fleet-multihost-acceptance.md
git commit -m "docs(fleet): live two-host acceptance walkthrough + results"
git push origin feature/fleet-control-plane
```

---

## Self-Review

**Spec coverage** — every design section maps to a task: two credential tiers (Tasks 1,2,4); enrollment flow + self-heal (1,2,9,10); persistence two-file split (1,5); runtime changes (3,5); verbs incl. removals (5,6,7,8); security properties (enforced by 1–3, exercised in 3); error handling table (2,3,6,7); always-tailnet/no-TLS (global constraint + Task 11); scope boundary incl. restart-effective revocation (Task 7 note, Task 12). The loopback-seeding for host A's own instances (design "serve local-instance seeding") is Task 5.

**Placeholder scan** — no TBD/TODO; every code step shows real code; the one deliberately-deferred item (live revocation/credential reload) is an explicit design Scope-Boundary follow-on, cited in Task 7, not a hidden IOU.

**Type consistency** — `InstanceBinding`, `EnrollOutcome`, `loadFleetRegistry`, `mintCredential`, `createEnrollHandler`, `enrollInstance`, `locateHostState`, `openEnrollmentCustody`, `buildServeRuntime` are named identically across the tasks that define and consume them. The runtime keeps `acceptedTokens`/`acceptedInstances`/`revokedTokens` (unchanged types) and gains only the optional `enrollment` field — existing fleet tests stay green (verified explicitly in Tasks 3 and 5 by running the prior suite).

**Known risk to watch during execution:** Task 3's `makeRawEvent` helper must exactly match the real envelope shape `ingestEvent` requires to reach `accepted` (copy it from `tests/fleet/plane-serve.test.ts`, don't hand-reconstruct). Task 5 deletes `plane-serve-options.ts`; grep for its importers before deleting (`plane-serve-instance-auth.test.ts` at least) and rework them onto `buildServeRuntime`/`loadFleetRegistry`.
