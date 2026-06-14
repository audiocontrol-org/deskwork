// Empty-but-valid skeleton writers per WorkingFileKey (009 T011). Shared by the
// `setup` verb (create-side) and the verbs' auto-on-first-use read path — one
// code path guarantees the two are byte-identical (FR-017). Skeletons are
// deterministic (no timestamps) and the minimal structurally-valid artifact each
// consumer accepts (FR-002), proven by verify.ts running the consuming parser.
//
// Non-destructive (FR-004): scaffoldKey never opens an existing target for
// write — it returns created=false instead.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { WORKING_FILE_KEYS } from '../config/keys.js';
import type { ResolvedPaths, ScaffoldedKey } from '../config/types.js';

/** Scaffold order: config first (creates .stack-control), then the rest. */
export const MANAGED_KEYS = WORKING_FILE_KEYS;

export const ROADMAP_SKELETON = `---
doc-grammar: roadmap
---

# Roadmap

The governed dependency graph of this project's features. Each item is a
heading-keyed unit identified by its \`<phase>:<kind>/<slug>\` id; manage the
graph with \`stackctl roadmap\` — do not hand-edit.
`;

export const INBOX_SKELETON = `---
doc-grammar: design-inbox
---

# Design Inbox

A governed, low-friction parking lot for out-of-sequence design ideas. Capture
and triage with \`stackctl inbox\` (\`capture\` / \`promote\` / \`drop\` / \`list\`) —
do not hand-edit.
`;

export const AUDIT_LOG_SKELETON = `# Audit Log

Durable record of audit findings + their dispositions. Status values: \`open\` → \`fixed-<sha>\` → \`verified-<date>\`, or \`acknowledged-<date>\` with a substantive reason.

---
`;

export const DEFAULT_CONFIG_YAML = 'version: 1\n';

export const FLEET_KNOWLEDGE_SKELETON = `lanes:
  - name: claude
    max_prompt_bytes: 65536
  - name: codex
    max_prompt_bytes: 24576
  - name: sonnet
    max_prompt_bytes: 32768
`;

/** The 008 deterministic `filesystem_only` backlog config (no interactive init). */
export function backlogConfigYml(): string {
  return [
    'project_name: "backlog"',
    'default_status: "To Do"',
    'statuses: ["To Do", "In Progress", "Done"]',
    'labels: []',
    'date_format: yyyy-mm-dd',
    'max_column_width: 80',
    'auto_open_browser: false',
    'default_port: 6420',
    'remote_operations: false',
    'auto_commit: false',
    'filesystem_only: true',
    'bypass_git_hooks: false',
    'check_active_branches: false',
    'active_branch_days: 30',
    'task_prefix: "task"',
    '',
  ].join('\n');
}

export interface ScaffoldOutcome {
  readonly key: ScaffoldedKey;
  readonly location: string;
  readonly created: boolean;
}

/**
 * The target whose existence marks `key` as already-present. For the backlog the
 * marker is `config.yml` inside the store dir (the dir alone is not enough).
 */
export function targetExists(key: ScaffoldedKey, resolved: ResolvedPaths): boolean {
  if (key === 'backlog') return existsSync(join(resolved.backlog, 'config.yml'));
  return existsSync(resolved[key]);
}

/** Write the empty-but-valid skeleton for `key` when missing; never overwrite. */
export function scaffoldKey(key: ScaffoldedKey, resolved: ResolvedPaths): ScaffoldOutcome {
  const location = resolved[key];
  if (targetExists(key, resolved)) return { key, location, created: false };

  switch (key) {
    case 'config':
      writeEnsuringDir(location, DEFAULT_CONFIG_YAML);
      break;
    case 'roadmap':
      writeEnsuringDir(location, ROADMAP_SKELETON);
      break;
    case 'inbox':
      writeEnsuringDir(location, INBOX_SKELETON);
      break;
    case 'auditLog':
      writeEnsuringDir(location, AUDIT_LOG_SKELETON);
      break;
    case 'fleetKnowledge':
      writeEnsuringDir(location, FLEET_KNOWLEDGE_SKELETON);
      break;
    case 'backlog':
      mkdirSync(location, { recursive: true });
      writeFileSync(join(location, 'config.yml'), backlogConfigYml());
      break;
  }
  return { key, location, created: true };
}

function writeEnsuringDir(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
