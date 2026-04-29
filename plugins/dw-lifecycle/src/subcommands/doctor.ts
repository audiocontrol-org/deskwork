import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_RELATIVE_PATH } from '../config.js';

export interface Finding {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface DoctorOptions {
  projectRoot: string;
  detectPeerPlugin: (name: string) => boolean;
  checkConfig: () => boolean;
}

const REQUIRED_PEERS = ['superpowers'];
const RECOMMENDED_PEERS = ['feature-dev'];

export async function runDoctor(opts: DoctorOptions): Promise<Finding[]> {
  const findings: Finding[] = [];

  if (!opts.checkConfig()) {
    findings.push({
      rule: 'missing-config',
      severity: 'error',
      message: `No ${CONFIG_RELATIVE_PATH} found. Run /dw-lifecycle:install first.`,
    });
  }

  for (const peer of REQUIRED_PEERS) {
    if (!opts.detectPeerPlugin(peer)) {
      findings.push({
        rule: 'peer-plugins',
        severity: 'error',
        message: `Required peer plugin "${peer}" not installed. Install: /plugin install ${peer}@claude-plugins-official`,
      });
    }
  }

  for (const peer of RECOMMENDED_PEERS) {
    if (!opts.detectPeerPlugin(peer)) {
      findings.push({
        rule: 'peer-plugins',
        severity: 'warning',
        message: `Recommended peer plugin "${peer}" not installed. Install: /plugin install ${peer}@claude-plugins-official`,
      });
    }
  }

  return findings;
}

export async function doctor(args: string[]): Promise<void> {
  const projectRoot = args[0] ?? process.cwd();
  const findings = await runDoctor({
    projectRoot,
    detectPeerPlugin: () => false, // Phase 5 will implement actual detection
    checkConfig: () => existsSync(join(projectRoot, CONFIG_RELATIVE_PATH)),
  });
  console.log(JSON.stringify({ findings }, null, 2));
  if (findings.some((f) => f.severity === 'error')) {
    process.exit(1);
  }
}
