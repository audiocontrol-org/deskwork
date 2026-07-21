// src/sidecar/enroll-client.ts
//
// Sidecar-side HTTP client for POST /v1/enroll. Exchanges a host enrollment
// credential for a per-instance telemetry token. This module owns only the
// HTTP exchange — it has no knowledge of token custody (where/how the token
// gets persisted to disk); that is the daemon's responsibility.

export interface EnrollIdentity {
  readonly installationId: string;
  readonly host: string;
  readonly path: string;
}

export interface EnrollArgs {
  readonly planeUrl: string;
  readonly credential: string;
  readonly identity: EnrollIdentity;
}

export type EnrollResult = { readonly ok: true; readonly token: string } | { readonly ok: false; readonly status: number };

function isTokenResponse(value: unknown): value is { token: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'token' in value &&
    typeof value.token === 'string'
  );
}

// Bounded so an unreachable/hanging plane can never stall the daemon's
// `started` election (which `stop()` awaits) or delay startup indefinitely.
const ENROLL_TIMEOUT_MS = 15_000;

export async function enrollInstance(args: EnrollArgs): Promise<EnrollResult> {
  let response: Response;
  try {
    response = await fetch(`${args.planeUrl}/v1/enroll`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${args.credential}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(args.identity),
      signal: AbortSignal.timeout(ENROLL_TIMEOUT_MS),
    });
  } catch {
    // Any network failure — connection refused, DNS failure, abort/timeout —
    // never throws out of this call. status:0 denotes "no HTTP response was
    // ever obtained" (distinct from a real HTTP status). Never fabricate a
    // token on failure.
    return { ok: false, status: 0 };
  }

  if (response.status !== 200) {
    return { ok: false, status: response.status };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: 200 };
  }

  if (!isTokenResponse(body)) {
    return { ok: false, status: 200 };
  }

  return { ok: true, token: body.token };
}
