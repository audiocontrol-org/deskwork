// 028 US1 T050/T051 (FR-006; TASK-147). The session-discovery code must never
// hardcode a SOURCE-REPO-ONLY path (`plugins/stack-control/bin/stackctl`) that
// 404s in an adopter's host install — every path it surfaces resolves through the
// resolved installation, and the CLI is invoked as the bare `stackctl` on PATH.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SESSION_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'session');
const FORBIDDEN = 'plugins/stack-control/bin/stackctl';

describe('session discovery output is install-portable (T051)', () => {
  it('no src/session module hardcodes the source-repo-only stackctl path', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(SESSION_DIR)) {
      if (!file.endsWith('.ts')) continue;
      if (readFileSync(join(SESSION_DIR, file), 'utf8').includes(FORBIDDEN)) {
        offenders.push(`src/session/${file}`);
      }
    }
    expect(offenders, `source-repo path leaked into: ${offenders.join(', ')}`).toEqual([]);
  });
});
