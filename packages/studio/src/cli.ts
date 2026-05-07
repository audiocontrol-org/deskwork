/**
 * CLI argument parsing for `deskwork-studio` (Phase 10c).
 *
 * Surface is intentionally narrow: the studio is upstream-only and
 * binds loopback. Tailscale, host-binding, and the canonical phone
 * port are sidecar concerns — see `@deskwork/bridge`'s CLI.
 */

import { isAbsolute, resolve } from 'node:path';

export interface CliArgs {
  projectRoot: string;
  studioPort: number;
  studioPortExplicit: boolean;
}

export const DEFAULT_STUDIO_PORT = 47422;

export function parseCliArgs(argv: string[]): CliArgs {
  let projectRoot = process.cwd();
  let studioPort = DEFAULT_STUDIO_PORT;
  let studioPortExplicit = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project-root' || a === '-r') {
      const next = argv[++i];
      if (!next) usage(`${a} requires a value`);
      projectRoot = next;
    } else if (a.startsWith('--project-root=')) {
      projectRoot = a.slice('--project-root='.length);
    } else if (a === '--studio-port') {
      const next = argv[++i];
      if (!next) usage(`${a} requires a value`);
      studioPort = parseInt(next, 10);
      studioPortExplicit = true;
    } else if (a.startsWith('--studio-port=')) {
      studioPort = parseInt(a.slice('--studio-port='.length), 10);
      studioPortExplicit = true;
    } else if (a === '--help' || a === '-h') {
      usage(null);
    } else {
      usage(`unknown argument: ${a}`);
    }
  }
  if (!Number.isFinite(studioPort) || studioPort <= 0 || studioPort > 65535) {
    usage(`invalid studio-port: ${studioPort}`);
  }
  return {
    projectRoot: isAbsolute(projectRoot) ? projectRoot : resolve(process.cwd(), projectRoot),
    studioPort,
    studioPortExplicit,
  };
}

export function usage(error: string | null): never {
  const out = error ? process.stderr : process.stdout;
  if (error) out.write(`error: ${error}\n\n`);
  out.write('Usage: deskwork-studio [--project-root <path>] [--studio-port <n>]\n');
  out.write('\n');
  out.write('Options:\n');
  out.write('  -r, --project-root <path>   project root containing .deskwork/config.json\n');
  out.write('                              (default: cwd)\n');
  out.write(
    `      --studio-port <n>       loopback bind port (default: ${DEFAULT_STUDIO_PORT})\n`,
  );
  out.write('  -h, --help                  show this message\n');
  out.write('\n');
  out.write('Two-process model (Phase 10c):\n');
  out.write('  Run `deskwork-bridge` in another terminal first. The studio reads the\n');
  out.write('  sidecar descriptor at <projectRoot>/.deskwork/.bridge to confirm the\n');
  out.write('  sidecar is running, binds its own loopback-only port, and writes its\n');
  out.write('  descriptor at <projectRoot>/.deskwork/.studio for the sidecar to\n');
  out.write('  reverse-proxy through. The phone hits the canonical (sidecar) port;\n');
  out.write('  the studio surface lives on the loopback port and is proxied.\n');
  process.exit(error ? 2 : 0);
}
