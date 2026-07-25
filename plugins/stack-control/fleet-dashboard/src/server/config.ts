/**
 * Fleet Dashboard BFF — Server Configuration (T004)
 *
 * Loads and validates the BFF's runtime configuration from an injected
 * environment source. Per FR-005 the plane base URL and read credential are
 * read from `FLEET_PLANE_URL` / `FLEET_PLANE_READ_TOKEN`; per Constitution V
 * neither has a fallback — a missing/empty value fails loud, naming the
 * absent variable, rather than silently defaulting.
 *
 * Per FR-024 the bind address defaults to loopback. A non-loopback bind is
 * never inferred; it requires the explicit opt-in
 * `FLEET_DASHBOARD_ALLOW_NON_LOOPBACK=true` and must be paired (by the
 * deployer, not this module) with infrastructure that prevents untrusted
 * clients from reaching the listener directly.
 *
 * The environment source is an injected parameter (DI), never read from
 * `process.env` at module scope, so callers — including tests — can supply
 * an arbitrary env snapshot without mutating global state. `index.ts` is the
 * one caller that passes the real `process.env`.
 */

/** An environment-variable snapshot. `process.env` satisfies this shape. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/** The BFF's validated, immutable runtime configuration. */
export interface DashboardConfig {
  /** The plane's base URL for `/v1/*` reads (FR-005). */
  readonly planeUrl: string;
  /** The plane read credential, attached server-side only (FR-003, FR-005). */
  readonly planeReadToken: string;
  /** The address the BFF's HTTP server binds to. Loopback by default (FR-024). */
  readonly host: string;
  /** The port the BFF's HTTP server binds to. */
  readonly port: number;
}

/** Raised for any missing, empty, or invalid configuration value. */
export class DashboardConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DashboardConfigError';
  }
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8080;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const ALLOW_NON_LOOPBACK_KEY = 'FLEET_DASHBOARD_ALLOW_NON_LOOPBACK';
const ALLOW_NON_LOOPBACK_VALUE = 'true';

/** Hosts treated as loopback — no explicit opt-in required to bind to these. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Load + validate the BFF configuration from `env`. Throws
 * {@link DashboardConfigError} on any missing required value, invalid port,
 * or an implicit (non-opted-in) non-loopback bind.
 */
export function loadConfig(env: EnvSource): DashboardConfig {
  const planeUrl = requireNonEmpty(env, 'FLEET_PLANE_URL');
  const planeReadToken = requireSingleCredential(requireNonEmpty(env, 'FLEET_PLANE_READ_TOKEN'));
  const host = resolveHost(env);
  const port = resolvePort(env);

  assertBindAllowed(host, env);

  return Object.freeze({ planeUrl, planeReadToken, host, port });
}

function requireNonEmpty(env: EnvSource, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim().length === 0) {
    throw new DashboardConfigError(
      `fleet-dashboard config: missing required environment variable '${key}' ` +
        `(no default — refusing to start)`,
    );
  }
  return value;
}

/**
 * Refuse a comma-separated `FLEET_PLANE_READ_TOKEN` (AUDIT-20260725-07 /
 * AUDIT-20260725-08). The dashboard holds exactly ONE read credential — one
 * of the plane's own configured readers — and sends it verbatim as
 * `Authorization: Bearer <token>` (plane-client.ts). The plane's OWN
 * accepted-reader SET is a separate, PLURAL env var
 * (`FLEET_PLANE_READ_TOKENS`, src/subcommands/plane.ts's
 * `readerCredentialsFromEnv`) read by a different process. Before this
 * check, an operator who set the same comma-separated value for both
 * processes (a very plausible shared-`.env` setup — same conceptual "read
 * token") got a silent 401 from the plane that the dashboard's routes then
 * surfaced as a 503 "upstream unreachable", masking a credential-FORMAT
 * mismatch as a connectivity OUTAGE. Failing loud here, at config-load time,
 * turns that into an immediate, self-explanatory boot error (Constitution
 * V) instead of a silent runtime failure — and there is no "use the first
 * token" fallback: fallbacks on a credential value are exactly the bug
 * class this check exists to prevent.
 */
function requireSingleCredential(value: string): string {
  if (value.includes(',')) {
    throw new DashboardConfigError(
      `fleet-dashboard config: FLEET_PLANE_READ_TOKEN must be a single credential, but the ` +
        `configured value contains a comma ('${value}'). The dashboard holds exactly ONE read ` +
        `credential — one of the plane's configured readers. A comma-separated LIST of readers ` +
        `belongs to the PLANE's own FLEET_PLANE_READ_TOKENS (plural) environment variable, not ` +
        `the dashboard's FLEET_PLANE_READ_TOKEN (singular) — refusing to start with an ` +
        `ambiguous credential`,
    );
  }
  return value;
}

function resolveHost(env: EnvSource): string {
  const raw = env['HOST'];
  if (raw === undefined || raw.trim().length === 0) {
    return DEFAULT_HOST;
  }
  return raw.trim();
}

function resolvePort(env: EnvSource): number {
  const raw = env['PORT'];
  if (raw === undefined || raw.trim().length === 0) {
    return DEFAULT_PORT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
    throw new DashboardConfigError(
      `fleet-dashboard config: PORT must be an integer between ${MIN_PORT} and ${MAX_PORT} ` +
        `(got '${raw}')`,
    );
  }
  return parsed;
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

/**
 * Refuse an implicit non-loopback bind (FR-024). Loopback hosts pass
 * unconditionally; any other host requires the explicit opt-in env var set
 * to exactly `'true'` — any other value (including a truthy-looking one) is
 * treated as not opted in, so the default posture never silently widens.
 */
function assertBindAllowed(host: string, env: EnvSource): void {
  if (isLoopbackHost(host)) {
    return;
  }
  if (env[ALLOW_NON_LOOPBACK_KEY] === ALLOW_NON_LOOPBACK_VALUE) {
    return;
  }
  throw new DashboardConfigError(
    `fleet-dashboard config: HOST='${host}' is not loopback; a non-loopback bind requires ` +
      `explicit opt-in via ${ALLOW_NON_LOOPBACK_KEY}=${ALLOW_NON_LOOPBACK_VALUE}, and MUST be ` +
      `fronted by a service mesh / identity-aware proxy enforcing per-connection identity + ` +
      `authorization (FR-024) — refusing to start with an implicit non-loopback bind`,
  );
}
