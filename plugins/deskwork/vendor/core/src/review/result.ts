/**
 * Common HTTP-shape result type for review handlers. Pulled out so the
 * handler modules (`handlers.ts`, `start-handlers.ts`) can share it
 * without one importing the other.
 */

export interface HandlerResult {
  status: number;
  body: unknown;
}

export function err(status: number, message: string): HandlerResult {
  return { status, body: { error: message } };
}

export function ok(body: unknown): HandlerResult {
  return { status: 200, body };
}
