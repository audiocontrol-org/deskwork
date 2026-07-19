// specs/036-fleet-control-plane — T096, storage/b2.ts's injected HTTP seam.
//
// `HttpTransport` abstracts the ACT of sending an HTTP request and getting a
// status/headers/body response back. Mirrors the DI pattern already used in
// src/sidecar/uplink/transport.ts (`SseTransport`): production code depends
// only on this interface, so tests can inject a FAKE that asserts the exact
// request the B2 adapter issues instead of hitting real network / needing
// real B2 credentials (there is no network access and no credentials in the
// test environment). Production wiring uses `FetchHttpTransport`, backed by
// native `fetch`.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI).

/** A single outbound HTTP request. `body` is raw bytes — the B2 adapter
 * owns all wire-format encoding (SigV4 signing, XML/JSON bodies) before
 * handing bytes to this seam. */
export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Uint8Array;
}

/** The response to an `HttpRequest`. Headers are always lower-cased keys,
 * matching `fetch`'s own `Headers` normalization, so callers never need to
 * guess casing when reading a response header back out. */
export interface HttpResponseMessage {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

/** The DI seam itself. */
export interface HttpTransport {
  request(req: HttpRequest): Promise<HttpResponseMessage>;
}

/** Real, native-`fetch`-backed `HttpTransport`. The only implementation of
 * this seam that ever touches a real network socket. */
export class FetchHttpTransport implements HttpTransport {
  async request(req: HttpRequest): Promise<HttpResponseMessage> {
    // `Buffer.from(...)` (rather than passing `req.body` straight through)
    // works around a `Uint8Array<ArrayBufferLike>` vs. `fetch`'s
    // `BodyInit`-expected `Uint8Array<ArrayBuffer>` generic mismatch in the
    // current TypeScript + @types/node combination — a typing-only
    // conversion, not a behavior change (Buffer IS a Uint8Array).
    const body = req.body === undefined ? undefined : Buffer.from(req.body);
    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const arrayBuffer = await response.arrayBuffer();
    return {
      status: response.status,
      headers,
      body: new Uint8Array(arrayBuffer),
    };
  }
}
