/**
 * specs/037-instance-observability (plan: docs/superpowers/plans/
 * 2026-07-20-fleet-multihost-enrollment.md) — Task 2.
 *
 * `POST /v1/enroll` HTTP handler: the wire-level wrapper around Task 1's
 * `FleetRegistry.enroll`. This module owns only request/response
 * marshalling — bearer extraction, body-shape validation, and outcome-to-
 * status mapping. All enrollment decision logic (unknown credential,
 * identity-hijack detection, token minting) lives in `fleet-registry.ts`;
 * this handler never duplicates it.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 module resolution (no `@/` alias configured).
 */

import type { FleetRegistry } from '../fleet-registry.js';
import type { RouteHandler } from './server.js';
import { readJsonBody, respondJson } from '../runtime-http.js';
import { parseBearer } from './auth.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An enroll request body's identity fields, narrowed by runtime check. */
interface EnrollRequestBody {
  readonly installationId: string;
  readonly host: string;
  readonly path: string;
}

function isEnrollRequestBody(value: unknown): value is EnrollRequestBody {
  return (
    isRecord(value) &&
    typeof value.installationId === 'string' &&
    typeof value.host === 'string' &&
    typeof value.path === 'string'
  );
}

/**
 * Build the `POST /v1/enroll` route handler over `registry` (Task 1's
 * `FleetRegistry`). Behavior (plan Task 2):
 *   - No/malformed bearer -> 401 `{ error: 'unauthorized', reason: 'missing' }`.
 *   - Malformed body (not `{ installationId, host, path }` strings) -> 400
 *     `{ error: 'bad-request', detail }`.
 *   - `registry.enroll()` outcome mapped to 401 (unknown-credential), 409
 *     (identity-owned-by-other-credential), or 200 `{ token }`.
 */
export function createEnrollHandler(registry: FleetRegistry): RouteHandler {
  return async (ctx): Promise<void> => {
    const credential = parseBearer(ctx.req.headers.authorization);
    if (credential === undefined) {
      respondJson(ctx.res, 401, { error: 'unauthorized', reason: 'missing' });
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(ctx.req);
    } catch (error) {
      respondJson(ctx.res, 400, {
        error: 'bad-request',
        detail: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (!isEnrollRequestBody(body)) {
      respondJson(ctx.res, 400, {
        error: 'bad-request',
        detail: 'enroll body must be { installationId, host, path }',
      });
      return;
    }

    const outcome = registry.enroll(credential, {
      installationId: body.installationId,
      host: body.host,
      path: body.path,
    });

    if (!outcome.ok) {
      if (outcome.reason === 'unknown-credential') {
        respondJson(ctx.res, 401, { error: 'unauthorized', reason: 'unknown-credential' });
        return;
      }
      respondJson(ctx.res, 409, { error: 'conflict', reason: 'identity-owned-by-other-credential' });
      return;
    }

    respondJson(ctx.res, 200, { token: outcome.token });
  };
}
