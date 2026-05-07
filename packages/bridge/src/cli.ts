/**
 * CLI argument parsing for `deskwork-bridge`. Extracted from `server.ts`
 * to keep boot-time orchestration separable from argv parsing — the
 * latter is exercised directly by unit tests, the former by the
 * sidecar-boot integration tests.
 */

import { isAbsolute, resolve } from 'node:path';

export interface CliArgs {
  projectRoot: string;
  port: number;
  portExplicit: boolean;
  hostOverride: string | null;
  noTailscale: boolean;
}

export const DEFAULT_PORT = 47321;
export const LOOPBACK = '127.0.0.1';

export function parseCliArgs(argv: string[]): CliArgs {
  let projectRoot = process.cwd();
  let port = DEFAULT_PORT;
  let portExplicit = false;
  let hostOverride: string | null = null;
  let noTailscale = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project-root' || a === '-r') {
      const next = argv[++i];
      if (!next) usage(`${a} requires a value`);
      projectRoot = next;
    } else if (a.startsWith('--project-root=')) {
      projectRoot = a.slice('--project-root='.length);
    } else if (a === '--port' || a === '-p') {
      const next = argv[++i];
      if (!next) usage(`${a} requires a value`);
      port = parseInt(next, 10);
      portExplicit = true;
    } else if (a.startsWith('--port=')) {
      port = parseInt(a.slice('--port='.length), 10);
      portExplicit = true;
    } else if (a === '--host' || a === '-H') {
      const next = argv[++i];
      if (!next) usage(`${a} requires a value`);
      hostOverride = next;
    } else if (a.startsWith('--host=')) {
      hostOverride = a.slice('--host='.length);
    } else if (a === '--no-tailscale') {
      noTailscale = true;
    } else if (a === '--help' || a === '-h') {
      usage(null);
    } else {
      usage(`unknown argument: ${a}`);
    }
  }
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    usage(`invalid port: ${port}`);
  }
  return {
    projectRoot: isAbsolute(projectRoot)
      ? projectRoot
      : resolve(process.cwd(), projectRoot),
    port,
    portExplicit,
    hostOverride,
    noTailscale,
  };
}

export function usage(error: string | null): never {
  const out = error ? process.stderr : process.stdout;
  if (error) out.write(`error: ${error}\n\n`);
  out.write(
    'Usage: deskwork-bridge [--project-root <path>] [--port <n>] [--host <addr>] [--no-tailscale]\n\n',
  );
  out.write('Options:\n');
  out.write('  -r, --project-root <path>   project root containing .deskwork/config.json\n');
  out.write('                              (default: cwd)\n');
  out.write(`  -p, --port <n>              listen on this port (default: ${DEFAULT_PORT})\n`);
  out.write('  -H, --host <addr>           bind ONLY to this address — overrides Tailscale\n');
  out.write('                              auto-detection. Use 0.0.0.0 to expose on every\n');
  out.write('                              interface; only do this on trusted networks.\n');
  out.write('      --no-tailscale          skip Tailscale auto-detection (loopback only)\n');
  out.write('  -h, --help                  show this message\n\n');
  out.write('Default networking policy: bind to 127.0.0.1 (loopback) AND, if Tailscale is\n');
  out.write('running, the local Tailscale interface(s). The bridge has no auth; loopback +\n');
  out.write('Tailscale tailnet are treated as trusted, all other interfaces opt-in via --host.\n\n');
  out.write('Foreground operation: the sidecar runs in the operator\'s terminal. There is no\n');
  out.write('daemonization in this build. Stop the sidecar with Ctrl-C / SIGTERM; it removes\n');
  out.write('the discovery descriptor at <projectRoot>/.deskwork/.bridge on graceful exit.\n');
  process.exit(error ? 2 : 0);
}
