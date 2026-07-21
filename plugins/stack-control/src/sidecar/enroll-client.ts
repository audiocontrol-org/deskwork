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

export async function enrollInstance(args: EnrollArgs): Promise<EnrollResult> {
  const response = await fetch(`${args.planeUrl}/v1/enroll`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${args.credential}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args.identity),
  });

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
