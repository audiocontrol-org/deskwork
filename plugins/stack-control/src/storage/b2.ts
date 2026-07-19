// specs/036-fleet-control-plane — T096 (impl), pairs with T096's RED test
// at tests/fleet/b2-adapter.test.ts.
//
// Concrete `ObjectStorePort` implementation backed by Backblaze B2, per
// plan.md's "Vendor identity is confined to `storage/b2.ts` behind
// `storage/port.ts`" (Constitution Principle III). Nothing outside this
// file may import a B2-specific type or concept — every caller depends
// only on `./port.js`.
//
// API surface targeted: B2's **S3-compatible API**, not B2's native API.
// Chosen because:
//   - SigV4 signing is stateless — every request is signed locally from
//     the injected credentials with zero round trips. B2's native API
//     requires an `b2_authorize_account` round trip up front (returning a
//     time-limited token + dynamic `apiUrl`/`downloadUrl`) and, for
//     uploads, a SEPARATE `b2_get_upload_url` round trip per upload
//     target, plus token-refresh/retry handling on expiry. That session
//     lifecycle is unnecessary complexity this adapter has no need for.
//   - Every operation this port needs (PUT/GET/HEAD by key, prefix list)
//     maps directly onto the S3 REST verbs used against every other
//     S3-compatible store in this ecosystem — no B2-specific request
//     shapes (`X-Bz-File-Name`, `X-Bz-Content-Sha1`, `fileId`-keyed
//     lookups) leak into the adapter.
//   - Backblaze documents and supports the S3 Compatible API as a
//     first-class surface for exactly this shape of workload.
//
// research.md's B2-read-cap note (§ "Do NOT re-derive") governs the HOT
// READ path, which this adapter does not serve — reads land through the
// CDN (a later `storage/cdn-reader.ts`). This module is the WRITE path
// plus R-04's off-hot-path reconciliation-backstop LIST; `getObject` /
// `headObject` exist here only to satisfy the port contract (e.g. direct
// verification, non-hot-path callers), not as a hot hydration path.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI).

import { createHash, createHmac } from 'node:crypto';
import type { ObjectMetadata, ObjectStorePort, PutObjectInput } from './port.js';
import type { HttpRequest, HttpResponseMessage, HttpTransport } from './http-transport.js';

const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';
/** Defensive bound on `listObjects` pagination. Exceeding it throws a loud
 * error rather than silently truncating results (no-silent-caps
 * discipline) — it exists only to turn a server bug that never sets
 * `IsTruncated=false` into a diagnosable failure instead of a hang. */
const MAX_LIST_PAGES = 100_000;

/**
 * Non-secret operational parameters needed to construct AND sign a request
 * against a B2 S3-compatible bucket. `region` is required by AWS SigV4
 * (the algorithm B2's S3-compatible endpoint speaks) — it is not a secret,
 * so it lives here rather than behind the credential seam below.
 */
export interface B2Config {
  readonly bucket: string;
  readonly endpoint: string;
  readonly region: string;
}

/** The secret half of B2 auth. Never placed in `B2Config` — secrets travel
 * only through the injected `B2CredentialProvider` seam below, so a caller
 * can source them from env/secret-manager/rotation logic without this
 * adapter ever hardcoding or logging them. */
export interface B2Credentials {
  readonly keyId: string;
  readonly applicationKey: string;
}

/** The auth/credential provider seam. Called on every signed request so a
 * caller can rotate credentials without reconstructing the store. */
export interface B2CredentialProvider {
  getCredentials(): Promise<B2Credentials>;
}

export interface B2Deps {
  readonly transport: HttpTransport;
  readonly config: B2Config;
  readonly credentials: B2CredentialProvider;
}

/**
 * Reads B2 credentials from environment variables. The one concrete
 * `B2CredentialProvider` this module ships — never hardcodes a secret,
 * throws a descriptive error (never a fallback/mock value) when the
 * environment is unconfigured.
 */
export class EnvB2CredentialProvider implements B2CredentialProvider {
  constructor(
    private readonly keyIdEnvVar: string = 'B2_KEY_ID',
    private readonly applicationKeyEnvVar: string = 'B2_APPLICATION_KEY',
  ) {}

  async getCredentials(): Promise<B2Credentials> {
    const keyId = process.env[this.keyIdEnvVar];
    const applicationKey = process.env[this.applicationKeyEnvVar];
    if (keyId === undefined || keyId.length === 0) {
      throw new Error(`B2 credentials missing: environment variable ${this.keyIdEnvVar} is not set`);
    }
    if (applicationKey === undefined || applicationKey.length === 0) {
      throw new Error(
        `B2 credentials missing: environment variable ${this.applicationKeyEnvVar} is not set`,
      );
    }
    return { keyId, applicationKey };
  }
}

/**
 * Builds a concrete `ObjectStorePort` backed by a B2 bucket via the
 * S3-compatible API, translating each port method into exactly one signed
 * HTTP request (`listObjects` issues one request per page).
 */
export function createB2Store(deps: B2Deps): ObjectStorePort {
  const { transport, config, credentials } = deps;
  assertNonEmpty(config.bucket, 'B2Config.bucket');
  assertNonEmpty(config.endpoint, 'B2Config.endpoint');
  assertNonEmpty(config.region, 'B2Config.region');

  async function signedRequest(
    method: string,
    path: string,
    query: Readonly<Record<string, string>>,
    body: Uint8Array,
    extraHeaders: Readonly<Record<string, string>>,
  ): Promise<HttpResponseMessage> {
    const creds = await credentials.getCredentials();
    const authHeaders = buildAuthorizationHeaders({
      method,
      host: config.endpoint,
      path,
      query,
      payload: body,
      credentials: creds,
      region: config.region,
      now: new Date(),
    });
    const request: HttpRequest = {
      method,
      url: buildUrl(config.endpoint, path, query),
      headers: { ...authHeaders, ...extraHeaders },
      body: body.byteLength > 0 ? body : undefined,
    };
    return transport.request(request);
  }

  return {
    async putObject(input: PutObjectInput): Promise<void> {
      const path = objectPath(config.bucket, input.key);
      const response = await signedRequest('PUT', path, {}, input.body, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(input.body.byteLength),
      });
      if (!isSuccess(response.status)) {
        throw new Error(`B2 putObject(key=${input.key}) failed with status ${response.status}`);
      }
    },

    async getObject(key: string): Promise<Uint8Array | null> {
      const path = objectPath(config.bucket, key);
      const response = await signedRequest('GET', path, {}, new Uint8Array(0), {});
      if (response.status === 404) {
        return null;
      }
      if (!isSuccess(response.status)) {
        throw new Error(`B2 getObject(key=${key}) failed with status ${response.status}`);
      }
      return response.body;
    },

    async headObject(key: string): Promise<ObjectMetadata | null> {
      const path = objectPath(config.bucket, key);
      const response = await signedRequest('HEAD', path, {}, new Uint8Array(0), {});
      if (response.status === 404) {
        return null;
      }
      if (!isSuccess(response.status)) {
        throw new Error(`B2 headObject(key=${key}) failed with status ${response.status}`);
      }
      return { key, size: parseContentLength(response.headers, key) };
    },

    async listObjects(prefix: string): Promise<readonly ObjectMetadata[]> {
      const results: ObjectMetadata[] = [];
      let continuationToken: string | null = null;
      let pageCount = 0;
      do {
        pageCount += 1;
        if (pageCount > MAX_LIST_PAGES) {
          throw new Error(
            `B2 listObjects(prefix=${prefix}) exceeded ${MAX_LIST_PAGES} pages without ` +
              'IsTruncated=false — refusing to silently truncate results',
          );
        }
        const query: Record<string, string> = { 'list-type': '2', prefix };
        if (continuationToken !== null) {
          query['continuation-token'] = continuationToken;
        }
        const path = `/${config.bucket}`;
        const response = await signedRequest('GET', path, query, new Uint8Array(0), {});
        if (!isSuccess(response.status)) {
          throw new Error(`B2 listObjects(prefix=${prefix}) failed with status ${response.status}`);
        }
        const page = parseListObjectsXml(new TextDecoder().decode(response.body));
        results.push(...page.items);
        if (page.isTruncated) {
          if (page.nextContinuationToken === null) {
            throw new Error(
              `B2 listObjects(prefix=${prefix}) response set IsTruncated=true but omitted ` +
                'NextContinuationToken — cannot page further without silently truncating results',
            );
          }
          continuationToken = page.nextContinuationToken;
        } else {
          continuationToken = null;
        }
      } while (continuationToken !== null);
      return results;
    },
  };
}

function assertNonEmpty(value: string, name: string): void {
  if (value.length === 0) {
    throw new Error(`${name} must not be empty — source it from injected config/env, never hardcode it`);
  }
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

function objectPath(bucket: string, key: string): string {
  return `/${bucket}/${key}`;
}

function parseContentLength(headers: Readonly<Record<string, string>>, key: string): number {
  const raw = headers['content-length'];
  if (raw === undefined) {
    throw new Error(`B2 headObject(key=${key}) response is missing a Content-Length header`);
  }
  const size = Number(raw);
  if (!Number.isFinite(size)) {
    throw new Error(`B2 headObject(key=${key}) response has a non-numeric Content-Length: ${raw}`);
  }
  return size;
}

// --- AWS SigV4 signing -----------------------------------------------------
// B2's S3-compatible endpoint speaks standard AWS Signature Version 4.
// Implemented against node:crypto only (no vendor SDK dependency), scoped
// strictly to what this adapter's four request shapes need.

interface SignParams {
  readonly method: string;
  readonly host: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly payload: Uint8Array;
  readonly credentials: B2Credentials;
  readonly region: string;
  readonly now: Date;
}

function buildAuthorizationHeaders(params: SignParams): Record<string, string> {
  const amzDate = formatAmzDate(params.now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(params.payload);

  const headersToSign: Record<string, string> = {
    host: params.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaderNames = Object.keys(headersToSign).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headersToSign[name] ?? ''}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    params.method,
    canonicalUri(params.path),
    canonicalQueryString(params.query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${params.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join('\n');

  const key = deriveSigningKey(params.credentials.applicationKey, dateStamp, params.region);
  const signature = hmacSha256(key, stringToSign).toString('hex');

  const authorization =
    `${ALGORITHM} Credential=${params.credentials.keyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Host: params.host,
    'X-Amz-Content-Sha256': payloadHash,
    'X-Amz-Date': amzDate,
    Authorization: authorization,
  };
}

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function deriveSigningKey(secretKey: string, dateStamp: string, region: string): Buffer {
  const kDate = hmacSha256(Buffer.from(`AWS4${secretKey}`, 'utf8'), dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, SERVICE);
  return hmacSha256(kService, 'aws4_request');
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalUri(path: string): string {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  return '/' + segments.map(encodeRfc3986).join('/');
}

function canonicalQueryString(query: Readonly<Record<string, string>>): string {
  const keys = Object.keys(query).sort();
  return keys.map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(query[k] ?? '')}`).join('&');
}

function buildUrl(endpoint: string, path: string, query: Readonly<Record<string, string>>): string {
  const qs = canonicalQueryString(query);
  const base = `https://${endpoint}${path}`;
  return qs.length > 0 ? `${base}?${qs}` : base;
}

// --- ListObjectsV2 XML parsing ----------------------------------------------
// Minimal, scoped regex extraction over the specific fields this adapter
// needs (Key, Size, IsTruncated, NextContinuationToken) rather than a
// general-purpose XML parser dependency — the response shape is fixed and
// simple (S3 ListObjectsV2), and no other field in the document is ever
// read.

interface ListObjectsPage {
  readonly isTruncated: boolean;
  readonly nextContinuationToken: string | null;
  readonly items: readonly ObjectMetadata[];
}

function parseListObjectsXml(xml: string): ListObjectsPage {
  const isTruncatedMatch = /<IsTruncated>(true|false)<\/IsTruncated>/.exec(xml);
  const isTruncated = isTruncatedMatch !== null && isTruncatedMatch[1] === 'true';

  const nextTokenMatch = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml);
  const nextContinuationToken = nextTokenMatch !== null ? decodeXmlEntities(nextTokenMatch[1] ?? '') : null;

  const items: ObjectMetadata[] = [];
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match = contentsRegex.exec(xml);
  while (match !== null) {
    const block = match[1] ?? '';
    const keyMatch = /<Key>([\s\S]*?)<\/Key>/.exec(block);
    const sizeMatch = /<Size>(\d+)<\/Size>/.exec(block);
    if (keyMatch === null || sizeMatch === null) {
      throw new Error(`B2 listObjects response contained a <Contents> entry missing Key or Size`);
    }
    items.push({
      key: decodeXmlEntities(keyMatch[1] ?? ''),
      size: Number(sizeMatch[1] ?? '0'),
    });
    match = contentsRegex.exec(xml);
  }

  return { isTruncated, nextContinuationToken, items };
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
