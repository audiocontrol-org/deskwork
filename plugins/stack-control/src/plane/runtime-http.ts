/**
 * specs/036-fleet-control-plane — pure HTTP request/response + body-parsing
 * helpers factored out of `src/plane/runtime.ts` (which crossed the 300-500
 * line file cap once the AUDIT-20260717-13/-14/-15/-16 wiring landed). These
 * are stateless: `node:http` marshalling, path-param extraction, command/body
 * validation, and run-owner resolution. The runtime module owns the wiring and
 * closure state; this module owns the reusable, side-effect-light plumbing.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
 * under node16 resolution (no `@/` alias — this plugin has none). Real
 * `node:http` — never a mocked transport.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RouteContext } from './http/server.js';
import type { CommandKind } from '../fleet/command.js';
import { buildRegistry, type ClassifiedEvent } from './registry.js';

/** Write a JSON body with an explicit status. */
export function respondJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Read and JSON-parse a request body, resolving `undefined` for an empty
 * body and rejecting (never silently accepting) a malformed payload. */
export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim() === '') {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    req.on('error', (error) => reject(error));
  });
}

const COMMAND_KINDS: readonly CommandKind[] = ['pause', 'resume', 'cancel', 'config-push', 'reconcile'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A path param the route pattern guarantees is present. The router only
 * invokes a handler after a positive regex match, so a `:name` segment always
 * resolved — this guard turns `noUncheckedIndexedAccess`'s `string | undefined`
 * into the `string` the route already promises, failing loud (never a silent
 * empty) if the invariant were ever violated. */
export function requireParam(ctx: RouteContext, name: string): string {
  const value = ctx.params[name];
  if (value === undefined) {
    throw new Error(`plane runtime: route matched but path param ${JSON.stringify(name)} is missing.`);
  }
  return value;
}

/**
 * Resolve the installation that owns `runId` from the live registry, or
 * `undefined` if the plane has never observed that run. The archived history
 * object key is per-installation (`runs/{installationId}/{runId}/summary.json`),
 * so history/timings resolve the owner here rather than trusting the caller
 * (AUDIT-20260717-13/-15).
 */
export function installationIdForRun(events: ClassifiedEvent[], runId: string): string | undefined {
  const entry = buildRegistry(events).entries().find((candidate) => candidate.runId === runId);
  return entry?.installationId;
}

/** Validate a command-issue body carries a recognized `kind`. */
export function parseCommandKind(body: unknown): CommandKind {
  if (!isRecord(body)) {
    throw new Error('command request body must be a JSON object carrying a "kind".');
  }
  const { kind } = body;
  const match = COMMAND_KINDS.find((candidate) => candidate === kind);
  if (match === undefined) {
    throw new Error(
      `command "kind" must be one of ${COMMAND_KINDS.join(', ')}; got ${JSON.stringify(kind)}.`,
    );
  }
  return match;
}

/** Validate a fleet-command body carries a `targets` array of installation ids. */
export function parseTargets(body: unknown): string[] {
  if (!isRecord(body)) {
    throw new Error('fleet command body must be a JSON object.');
  }
  const { targets } = body;
  if (!Array.isArray(targets) || targets.some((t) => typeof t !== 'string')) {
    throw new Error('fleet command "targets" must be an array of installation-id strings.');
  }
  return targets.filter((t): t is string => typeof t === 'string');
}

/** Validate a session-liveness heartbeat body (C3). */
export function assertSessionLiveness(body: unknown): void {
  if (
    !isRecord(body) ||
    body.kind !== 'session-liveness' ||
    typeof body.installationId !== 'string' ||
    typeof body.emittedAt !== 'string'
  ) {
    throw new Error(
      'session-liveness heartbeat must carry { kind: "session-liveness", installationId, emittedAt }.',
    );
  }
}
