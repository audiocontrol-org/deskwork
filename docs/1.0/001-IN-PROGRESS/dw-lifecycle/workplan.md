# dw-lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v0.1.0 release of the `dw-lifecycle` plugin — a Claude Code plugin that orchestrates managed-project feature lifecycles by composing `superpowers` (process disciplines) and `feature-dev` (specialist agents) instead of duplicating their practices.

**Architecture:** Three-layer composition (see `design.md` §2). `dw-lifecycle` owns project-management substrate (PRD/workplan/README, version-aware `docs/<v>/<status>/<slug>/`, journal, GitHub issue patterns) and delegates canonical practices upstream. The plugin lives at `plugins/dw-lifecycle/` inside the deskwork monorepo as a sibling to `deskwork` and `deskwork-studio`.

**Tech Stack:** TypeScript (strict mode) + tsx for the bin runtime; Vitest for tests; Zod for config validation; `gh` CLI shell-out for GitHub tracking; `js-yaml` or built-in `yaml` parsing for frontmatter; markdown-table parsers for workplan I/O.

**Reference:** All shape decisions are locked in `design.md` (committed at `c7931cb`). The plan implements that design; if you find a divergence, prefer the design doc and update the plan.

---

## File Structure

Files this plan creates or modifies:

### New plugin tree

```text
plugins/dw-lifecycle/
├── .claude-plugin/
│   └── plugin.json                        # plugin metadata
├── package.json                           # workspace member; declares deps
├── tsconfig.json                          # extends repo root
├── vitest.config.ts
├── README.md                              # adopter-facing docs
├── LICENSE
├── bin/
│   └── dw-lifecycle                       # CLI wrapper (shell script → tsx src/cli.ts)
├── src/
│   ├── cli.ts                             # subcommand dispatcher
│   ├── config.ts                          # load .dw-lifecycle/config.json (Zod)
│   ├── config.types.ts                    # config TypeScript types
│   ├── docs.ts                            # version-aware path resolution
│   ├── workplan.ts                        # workplan markdown parser/writer
│   ├── journal.ts                         # DEVELOPMENT-NOTES append
│   ├── transitions.ts                     # state-transition handlers (atomic moves)
│   ├── tracking-github.ts                 # gh CLI wrappers for issue ops
│   ├── frontmatter.ts                     # YAML frontmatter read/write helpers
│   ├── repo.ts                            # repo-root + git helpers (basename, branch)
│   └── subcommands/
│       ├── install.ts
│       ├── setup.ts
│       ├── issues.ts
│       ├── transition.ts
│       ├── journal-append.ts
│       └── doctor.ts
├── src/__tests__/
│   ├── config.test.ts
│   ├── docs.test.ts
│   ├── workplan.test.ts
│   ├── journal.test.ts
│   ├── transitions.test.ts
│   ├── tracking-github.test.ts
│   ├── frontmatter.test.ts
│   └── fixtures/                          # sample configs, workplans, doc trees
├── templates/
│   ├── prd.md
│   ├── workplan.md
│   ├── readme.md
│   └── feature-definition.md
└── skills/
    ├── install/SKILL.md
    ├── define/SKILL.md
    ├── setup/SKILL.md
    ├── issues/SKILL.md
    ├── implement/SKILL.md
    ├── review/SKILL.md
    ├── ship/SKILL.md
    ├── complete/SKILL.md
    ├── pickup/SKILL.md
    ├── extend/SKILL.md
    ├── teardown/SKILL.md
    ├── session-start/SKILL.md
    ├── session-end/SKILL.md
    ├── doctor/SKILL.md
    └── help/SKILL.md
```

### Files modified outside the new plugin tree

- `.claude-plugin/marketplace.json` — append `dw-lifecycle` entry
- `package.json` (repo root) — add `plugins/dw-lifecycle` to workspaces array (if applicable)
- `scripts/smoke-dw-lifecycle.sh` — new local smoke test script (not added to CI)

---

## Phases

The plan is organized into 6 phases. Each phase ends in a working, testable state. The final phase produces v0.1.0-ready artifacts (release ceremony itself is gated on upstream issue [audiocontrol-org/deskwork#81](https://github.com/audiocontrol-org/deskwork/issues/81)).

| Phase | Tasks | What works at end of phase |
|---|---|---|
| 1. Plugin scaffolding | T1–T5 | Plugin loads cleanly via `/plugin install`; appears in skill list (skills are stubs) |
| 2. Bin foundation | T6–T13 | `dw-lifecycle install <root>` writes `.dw-lifecycle/config.json`; tests pass |
| 3. Doc tree + workplan I/O | T14–T19 | Version-aware path resolution + workplan round-trip; `dw-lifecycle setup` works |
| 4. Tracking + transitions + journal | T20–T26 | `dw-lifecycle issues / transition / journal-append / doctor` all functional |
| 5. Skills | T27–T42 | All 15 SKILL.md files complete; integration with bin verified |
| 6. Release prep | T43–T46 | README, smoke test, marketplace registration, v0.1.0 tag-ready |

---

## Phase 1 — Plugin scaffolding (T1–T5)

### Task 1: Initial plugin skeleton

**Files:**
- Create: `plugins/dw-lifecycle/.claude-plugin/plugin.json`
- Create: `plugins/dw-lifecycle/package.json`
- Create: `plugins/dw-lifecycle/README.md` (placeholder)
- Create: `plugins/dw-lifecycle/LICENSE` (copy from sibling plugin)

- [x] **Step 1: Create `plugin.json`**

```json
{
  "name": "dw-lifecycle",
  "version": "0.1.0",
  "description": "Project lifecycle orchestration plugin — define → setup → issues → implement → review → ship → complete. Composes superpowers (process disciplines) and feature-dev (specialist agents).",
  "license": "GPL-3.0-or-later",
  "metadata": {
    "peerPlugins": {
      "required": ["superpowers"],
      "recommended": ["feature-dev"]
    }
  }
}
```

- [x] **Step 2: Create `package.json`**

```json
{
  "name": "@deskwork/plugin-dw-lifecycle",
  "version": "0.1.0",
  "private": true,
  "description": "Workspace package for the dw-lifecycle Claude Code plugin",
  "license": "GPL-3.0-or-later",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "tsx": "^4.21.0",
    "yaml": "^2.8.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [x] **Step 3: Copy LICENSE from sibling**

Run: `cp plugins/deskwork/LICENSE plugins/dw-lifecycle/LICENSE`

- [x] **Step 4: Stub README**

```markdown
# dw-lifecycle

Project lifecycle orchestration plugin for Claude Code. Composes `superpowers` and `feature-dev`.

Status: under development (v0.1.0). See `docs/1.0/001-IN-PROGRESS/dw-lifecycle/` in the deskwork repo for design and workplan.
```

- [x] **Step 5: Commit**

```bash
git add plugins/dw-lifecycle/
git commit -m "feat(dw-lifecycle): plugin skeleton"
```

---

### Task 2: TypeScript + Vitest config

**Files:**
- Create: `plugins/dw-lifecycle/tsconfig.json`
- Create: `plugins/dw-lifecycle/vitest.config.ts`

- [x] **Step 1: Create `tsconfig.json`**

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "moduleResolution": "node16",
    "module": "node16",
    "target": "ES2022",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/__tests__/**"]
}
```

(If `tsconfig.base.json` doesn't exist at the repo root, replace `extends` with the equivalent inline config from `plugins/deskwork/tsconfig.json`.)

- [x] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    globals: false,
  },
});
```

- [x] **Step 3: Verify TS compiles**

Run: `cd plugins/dw-lifecycle && npx tsc --noEmit`
Expected: no errors (no source files yet, exits clean).

- [x] **Step 4: Commit**

```bash
git add plugins/dw-lifecycle/tsconfig.json plugins/dw-lifecycle/vitest.config.ts
git commit -m "build(dw-lifecycle): tsc + vitest config"
```

---

### Task 3: Bin wrapper

**Files:**
- Create: `plugins/dw-lifecycle/bin/dw-lifecycle` (executable shell script)
- Create: `plugins/dw-lifecycle/src/cli.ts` (stub)

- [x] **Step 1: Create the bin wrapper**

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
exec npx tsx "$PLUGIN_ROOT/src/cli.ts" "$@"
```

Run: `chmod +x plugins/dw-lifecycle/bin/dw-lifecycle`

- [x] **Step 2: Create the cli stub**

```typescript
// plugins/dw-lifecycle/src/cli.ts
const subcommand = process.argv[2];
const args = process.argv.slice(3);

const SUBCOMMANDS: Record<string, () => Promise<void>> = {};

async function main() {
  if (!subcommand) {
    console.error('Usage: dw-lifecycle <subcommand> [args...]');
    console.error('Subcommands: install, setup, issues, transition, journal-append, doctor');
    process.exit(1);
  }

  const handler = SUBCOMMANDS[subcommand];
  if (!handler) {
    console.error(`Unknown subcommand: ${subcommand}`);
    process.exit(1);
  }

  await handler();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

export { SUBCOMMANDS, args };
```

- [x] **Step 3: Verify the wrapper runs**

Run: `plugins/dw-lifecycle/bin/dw-lifecycle`
Expected: prints `Usage: dw-lifecycle <subcommand>...` to stderr and exits 1.

- [x] **Step 4: Commit**

```bash
git add plugins/dw-lifecycle/bin/dw-lifecycle plugins/dw-lifecycle/src/cli.ts
git commit -m "feat(dw-lifecycle): bin wrapper + cli stub"
```

---

### Task 4: Stub all 15 skills

**Files:** create one `SKILL.md` per skill, all stubs:
- `skills/install/SKILL.md`
- `skills/define/SKILL.md`
- `skills/setup/SKILL.md`
- `skills/issues/SKILL.md`
- `skills/implement/SKILL.md`
- `skills/review/SKILL.md`
- `skills/ship/SKILL.md`
- `skills/complete/SKILL.md`
- `skills/pickup/SKILL.md`
- `skills/extend/SKILL.md`
- `skills/teardown/SKILL.md`
- `skills/session-start/SKILL.md`
- `skills/session-end/SKILL.md`
- `skills/doctor/SKILL.md`
- `skills/help/SKILL.md`

- [x] **Step 1: Write the stub template**

Each `SKILL.md` follows this stub shape (replace `<command>` and `<one-line description>`):

```markdown
---
name: dw-lifecycle:<command>
description: "<one-line description from the integration map in design.md §3>"
user_invocable: true
---

# /dw-lifecycle:<command>

STUB — implementation deferred to Phase 5. See `docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md` for the wire-up tasks.
```

Use these descriptions (from design.md):
- `install`: "Bootstrap dw-lifecycle in a host project: probe structure, write .dw-lifecycle/config.json"
- `define`: "Interview to capture problem/scope/approach/tasks; writes feature-definition.md"
- `setup`: "Create branch + worktree + version-aware docs/<v>/<status>/<slug>/ + populate PRD/workplan/README"
- `issues`: "Create parent + per-phase GitHub issues from workplan; back-fill issue links"
- `implement`: "Walk workplan tasks; delegate to subagents; commit at task boundaries"
- `review`: "Delegate code review of recent changes; collate findings"
- `ship`: "Verify acceptance criteria; open PR; stop at PR creation (operator owns merge)"
- `complete`: "Move docs to <complete-dir>; update ROADMAP; close issues"
- `pickup`: "Read workplan + check issue status + report next-action"
- `extend`: "Add phases to PRD/workplan; create new GitHub issues for added phases"
- `teardown`: "Remove branch + worktree (infrastructure-only)"
- `session-start`: "Bootstrap session: read workplan + journal + open issues; report context"
- `session-end`: "Append journal entry; update feature docs; commit documentation changes"
- `doctor`: "Audit binding metadata across calendar/journal/docs/issues; opt-in --fix"
- `help`: "Render lifecycle diagram + current state of active features"

- [x] **Step 2: Create all 15 stub files**

Use the Write tool 15 times (or batch via a script). Each file gets the appropriate header.

- [x] **Step 3: Commit**

```bash
git add plugins/dw-lifecycle/skills/
git commit -m "feat(dw-lifecycle): stub all 15 skills"
```

---

### Task 5: Marketplace registration + plugin loads

**Files:**
- Modify: `.claude-plugin/marketplace.json` (root of deskwork repo)

- [x] **Step 1: Read existing marketplace.json**

Run: `cat .claude-plugin/marketplace.json`
Note the existing `plugins[]` array shape.

- [x] **Step 2: Append the dw-lifecycle entry**

Add this object to the `plugins[]` array (after the `deskwork-studio` entry):

```jsonc
{
  "name": "dw-lifecycle",
  "description": "Project lifecycle orchestration; composes superpowers + feature-dev.",
  "source": "./plugins/dw-lifecycle",
  "category": "development"
}
```

- [x] **Step 3: Validate marketplace JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json'))"`
Expected: silent success.

- [x] **Step 4: Verify plugin loads in Claude Code**

Run: `claude plugin install --marketplace $(pwd)`
Expected: dw-lifecycle plugin appears in the install list, all 15 skills enumerated.

(If `claude plugin install` complains, follow the documentation surfaced — the install path is the source of truth per `agent-discipline.md`'s "Read documentation before quoting commands" rule.)

- [x] **Step 5: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -m "feat(dw-lifecycle): register in marketplace.json"
```

---

## Phase 2 — Bin foundation (T6–T13)

### Task 6: Frontmatter helpers

**Files:**
- Create: `plugins/dw-lifecycle/src/frontmatter.ts`
- Create: `plugins/dw-lifecycle/src/__tests__/frontmatter.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// src/__tests__/frontmatter.test.ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, writeFrontmatter, updateFrontmatter } from '../frontmatter.js';

describe('frontmatter', () => {
  it('parses YAML frontmatter and body', () => {
    const md = `---\ntitle: Test\nstate: draft\n---\n\n# Body\n\nContent.\n`;
    const { data, body } = parseFrontmatter(md);
    expect(data).toEqual({ title: 'Test', state: 'draft' });
    expect(body).toBe('# Body\n\nContent.\n');
  });

  it('handles a file with no frontmatter', () => {
    const md = '# Body only\n';
    const { data, body } = parseFrontmatter(md);
    expect(data).toEqual({});
    expect(body).toBe('# Body only\n');
  });

  it('preserves quoted scalars on round-trip', () => {
    const md = `---\ndate: "2026-04-29"\nname: 'foo'\n---\n\nbody\n`;
    const { data, body } = parseFrontmatter(md);
    const out = writeFrontmatter(data, body);
    expect(out).toBe(md);
  });

  it('updateFrontmatter mutates only the named keys', () => {
    const md = `---\ntitle: Old\nstate: draft\n---\n\nbody\n`;
    const out = updateFrontmatter(md, { state: 'published' });
    expect(out).toContain('title: Old');
    expect(out).toContain('state: published');
    expect(out).toContain('\n\nbody\n');
  });
});
```

- [x] **Step 2: Run the test, expect failure**

Run: `cd plugins/dw-lifecycle && npm test -- frontmatter`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `frontmatter.ts`**

```typescript
// src/frontmatter.ts
import { parseDocument, stringify } from 'yaml';

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  body: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) {
    return { data: {}, body: source };
  }
  const [, yamlBlock, body] = match;
  const doc = parseDocument(yamlBlock);
  const data = (doc.toJSON() ?? {}) as Record<string, unknown>;
  return { data, body: body.startsWith('\n') ? body.slice(1) : body };
}

export function writeFrontmatter(data: Record<string, unknown>, body: string): string {
  const yaml = stringify(data, { lineWidth: 0 }).trimEnd();
  const bodyPart = body.startsWith('\n') ? body : '\n' + body;
  return `---\n${yaml}\n---\n${bodyPart}`;
}

export function updateFrontmatter(source: string, patch: Record<string, unknown>): string {
  const { data, body } = parseFrontmatter(source);
  const merged = { ...data, ...patch };
  return writeFrontmatter(merged, body);
}
```

(If round-trip preservation of scalar quoting is fragile, switch to `yaml`'s `parseDocument` + manual node update for the quoted-scalar case — same approach used in the deskwork doctor's frontmatter rewrite per audiocontrol-org/deskwork#37 fix.)

- [x] **Step 4: Run tests, expect pass**

Run: `cd plugins/dw-lifecycle && npm test -- frontmatter`
Expected: 4 tests pass.

- [x] **Step 5: Commit**

```bash
git add plugins/dw-lifecycle/src/frontmatter.ts plugins/dw-lifecycle/src/__tests__/frontmatter.test.ts
git commit -m "feat(dw-lifecycle/bin): frontmatter parse/write helpers"
```

---

### Task 7: Config schema and loader (TDD)

**Files:**
- Create: `plugins/dw-lifecycle/src/config.types.ts`
- Create: `plugins/dw-lifecycle/src/config.ts`
- Create: `plugins/dw-lifecycle/src/__tests__/config.test.ts`
- Create: `plugins/dw-lifecycle/src/__tests__/fixtures/configs/`

- [x] **Step 1: Write the failing test**

```typescript
// src/__tests__/config.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig, validateConfig, defaultConfig } from '../config.js';

describe('config', () => {
  it('parses a minimal valid config and applies defaults', () => {
    const raw = '{"version": 1, "sites": {}}';
    const cfg = validateConfig(JSON.parse(raw));
    expect(cfg.docs.root).toBe('docs');
    expect(cfg.docs.byVersion).toBe(true);
    expect(cfg.docs.defaultTargetVersion).toBe('1.0');
    expect(cfg.branches.prefix).toBe('feature/');
    expect(cfg.tracking.platform).toBe('github');
  });

  it('rejects unknown tracking platform with a clear error', () => {
    const raw = { version: 1, tracking: { platform: 'jira' } };
    expect(() => validateConfig(raw)).toThrow(/tracking\.platform/);
  });

  it('respects user overrides over defaults', () => {
    const raw = {
      version: 1,
      docs: { root: 'documentation', byVersion: false },
      branches: { prefix: 'topic/' },
    };
    const cfg = validateConfig(raw);
    expect(cfg.docs.root).toBe('documentation');
    expect(cfg.docs.byVersion).toBe(false);
    expect(cfg.branches.prefix).toBe('topic/');
  });

  it('throws on invalid version field', () => {
    expect(() => validateConfig({ version: 'banana' })).toThrow();
  });
});
```

- [x] **Step 2: Run, expect failure**

Run: `cd plugins/dw-lifecycle && npm test -- config`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `config.types.ts` + `config.ts`**

```typescript
// src/config.types.ts
import { z } from 'zod';

export const ConfigSchema = z.object({
  version: z.literal(1),
  docs: z
    .object({
      root: z.string().default('docs'),
      byVersion: z.boolean().default(true),
      defaultTargetVersion: z.string().default('1.0'),
      knownVersions: z.array(z.string()).default([]),
      statusDirs: z
        .object({
          inProgress: z.string().default('001-IN-PROGRESS'),
          waiting: z.string().default('002-WAITING'),
          complete: z.string().default('003-COMPLETE'),
        })
        .default({
          inProgress: '001-IN-PROGRESS',
          waiting: '002-WAITING',
          complete: '003-COMPLETE',
        }),
    })
    .default({
      root: 'docs',
      byVersion: true,
      defaultTargetVersion: '1.0',
      knownVersions: [],
      statusDirs: {
        inProgress: '001-IN-PROGRESS',
        waiting: '002-WAITING',
        complete: '003-COMPLETE',
      },
    }),
  branches: z
    .object({
      prefix: z.string().default('feature/'),
    })
    .default({ prefix: 'feature/' }),
  worktrees: z
    .object({
      naming: z.string().default('<repo>-<slug>'),
    })
    .default({ naming: '<repo>-<slug>' }),
  journal: z
    .object({
      path: z.string().default('DEVELOPMENT-NOTES.md'),
      enabled: z.boolean().default(true),
    })
    .default({ path: 'DEVELOPMENT-NOTES.md', enabled: true }),
  tracking: z
    .object({
      platform: z.enum(['github']).default('github'),
      parentLabels: z.array(z.string()).default(['enhancement']),
      phaseLabels: z.array(z.string()).default(['enhancement']),
    })
    .default({
      platform: 'github',
      parentLabels: ['enhancement'],
      phaseLabels: ['enhancement'],
    }),
  session: z
    .object({
      start: z.object({ preamble: z.string().default('') }).default({ preamble: '' }),
      end: z.object({ preamble: z.string().default('') }).default({ preamble: '' }),
    })
    .default({ start: { preamble: '' }, end: { preamble: '' } }),
});

export type Config = z.infer<typeof ConfigSchema>;
```

```typescript
// src/config.ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigSchema, type Config } from './config.types.js';

export const CONFIG_RELATIVE_PATH = '.dw-lifecycle/config.json';

export function validateConfig(raw: unknown): Config {
  return ConfigSchema.parse(raw);
}

export function defaultConfig(): Config {
  return ConfigSchema.parse({ version: 1 });
}

export function loadConfig(projectRoot: string): Config {
  const path = join(projectRoot, CONFIG_RELATIVE_PATH);
  if (!existsSync(path)) {
    throw new Error(
      `No ${CONFIG_RELATIVE_PATH} found at ${projectRoot}. Run /dw-lifecycle:install first.`
    );
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return validateConfig(raw);
}
```

- [x] **Step 4: Run tests, expect pass**

Run: `cd plugins/dw-lifecycle && npm test -- config`
Expected: 4 tests pass.

- [x] **Step 5: Commit**

```bash
git add plugins/dw-lifecycle/src/config.ts plugins/dw-lifecycle/src/config.types.ts plugins/dw-lifecycle/src/__tests__/config.test.ts
git commit -m "feat(dw-lifecycle/bin): config schema + loader"
```

---

### Task 8: Repo helpers

**Files:**
- Create: `plugins/dw-lifecycle/src/repo.ts`

- [x] **Step 1: Implement `repo.ts`**

```typescript
// src/repo.ts
import { execSync } from 'node:child_process';
import { basename } from 'node:path';

export function repoRoot(cwd: string = process.cwd()): string {
  try {
    return execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Not inside a git repository.');
  }
}

export function repoBasename(cwd: string = process.cwd()): string {
  return basename(repoRoot(cwd));
}

export function currentBranch(cwd: string = process.cwd()): string {
  return execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim();
}

export function expandWorktreeName(template: string, slug: string, cwd: string = process.cwd()): string {
  return template.replace('<repo>', repoBasename(cwd)).replace('<slug>', slug);
}
```

- [x] **Step 2: Verify tsc passes**

Run: `cd plugins/dw-lifecycle && npx tsc --noEmit`
Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add plugins/dw-lifecycle/src/repo.ts
git commit -m "feat(dw-lifecycle/bin): repo + git helpers"
```

---

### Task 9: `dw-lifecycle install` subcommand

**Files:**
- Create: `plugins/dw-lifecycle/src/subcommands/install.ts`
- Modify: `plugins/dw-lifecycle/src/cli.ts`

- [x] **Step 1: Implement install subcommand**

```typescript
// src/subcommands/install.ts
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_RELATIVE_PATH, defaultConfig } from '../config.js';

export async function install(args: string[]): Promise<void> {
  const projectRoot = args[0] ?? process.cwd();
  const configDir = join(projectRoot, '.dw-lifecycle');
  const configPath = join(configDir, 'config.json');

  if (existsSync(configPath)) {
    console.error(`Config already exists at ${configPath}. Refusing to overwrite.`);
    process.exit(1);
  }

  mkdirSync(configDir, { recursive: true });

  const config = defaultConfig();
  // The install skill is responsible for the interactive probe + operator confirmation
  // before this is called. The bin just writes the agreed-upon config.
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({ configPath, config }, null, 2));
}
```

- [x] **Step 2: Wire into `cli.ts`**

Replace the empty `SUBCOMMANDS` map in `src/cli.ts`:

```typescript
import { install } from './subcommands/install.js';

const SUBCOMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  install,
};
```

And wire `handler(args)` instead of `handler()`:

```typescript
await handler(args);
```

- [x] **Step 3: Smoke test against a temp directory**

```bash
TMP=$(mktemp -d)
git -C "$TMP" init
plugins/dw-lifecycle/bin/dw-lifecycle install "$TMP"
cat "$TMP/.dw-lifecycle/config.json"
rm -rf "$TMP"
```

Expected: prints config JSON; the file matches the default schema shape.

- [x] **Step 4: Commit**

```bash
git add plugins/dw-lifecycle/src/subcommands/install.ts plugins/dw-lifecycle/src/cli.ts
git commit -m "feat(dw-lifecycle/bin): install subcommand"
```

---

### Task 10: Bin sanity test (end-to-end smoke)

**Files:**
- Create: `plugins/dw-lifecycle/src/__tests__/install.smoke.test.ts`

- [x] **Step 1: Write the smoke test**

```typescript
// src/__tests__/install.smoke.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../subcommands/install.js';

describe('install (smoke)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-lifecycle-install-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes a default config to .dw-lifecycle/config.json', async () => {
    await install([tmp]);
    const cfgPath = join(tmp, '.dw-lifecycle/config.json');
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    expect(cfg.version).toBe(1);
    expect(cfg.docs.byVersion).toBe(true);
    expect(cfg.tracking.platform).toBe('github');
  });
});
```

- [x] **Step 2: Run, expect pass**

Run: `cd plugins/dw-lifecycle && npm test -- install.smoke`
Expected: 1 test passes.

- [x] **Step 3: Commit**

```bash
git add plugins/dw-lifecycle/src/__tests__/install.smoke.test.ts
git commit -m "test(dw-lifecycle/bin): install smoke test"
```

---

### Task 11: Doctor — peer-plugins rule (placeholder for Phase 4 expansion)

This task adds the `dw-lifecycle doctor` subcommand with one rule (peer-plugins detection) so the bin command exists. Phase 4 will add the remaining rules.

**Files:**
- Create: `plugins/dw-lifecycle/src/subcommands/doctor.ts`
- Create: `plugins/dw-lifecycle/src/__tests__/doctor.test.ts`
- Modify: `plugins/dw-lifecycle/src/cli.ts`

- [x] **Step 1: Write the failing test**

```typescript
// src/__tests__/doctor.test.ts
import { describe, it, expect } from 'vitest';
import { runDoctor } from '../subcommands/doctor.js';

describe('doctor', () => {
  it('returns no findings when peers and config are present', async () => {
    // Phase 2 doctor only checks peer plugins; mock detection returns true.
    const findings = await runDoctor({
      projectRoot: process.cwd(),
      detectPeerPlugin: () => true,
      checkConfig: () => true,
    });
    expect(findings).toEqual([]);
  });

  it('flags missing required peer plugin (superpowers)', async () => {
    const findings = await runDoctor({
      projectRoot: process.cwd(),
      detectPeerPlugin: (name) => name !== 'superpowers',
      checkConfig: () => true,
    });
    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'peer-plugins', severity: 'error' })
    );
  });

  it('flags missing recommended peer plugin (feature-dev) as warning', async () => {
    const findings = await runDoctor({
      projectRoot: process.cwd(),
      detectPeerPlugin: (name) => name !== 'feature-dev',
      checkConfig: () => true,
    });
    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'peer-plugins', severity: 'warning' })
    );
  });

  it('flags missing config', async () => {
    const findings = await runDoctor({
      projectRoot: process.cwd(),
      detectPeerPlugin: () => true,
      checkConfig: () => false,
    });
    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'missing-config', severity: 'error' })
    );
  });
});
```

- [x] **Step 2: Run, expect failure**

Run: `cd plugins/dw-lifecycle && npm test -- doctor`
Expected: FAIL — module not found.

- [x] **Step 3: Implement doctor**

```typescript
// src/subcommands/doctor.ts
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
```

(Note: real peer-plugin detection requires walking `~/.claude/plugins/cache/` or reading the host's installed-plugins state. Phase 5 wires this; for now `detectPeerPlugin` is a hardcoded `() => false` stub. Tests inject a mock.)

- [x] **Step 4: Wire into cli.ts**

Add to the `SUBCOMMANDS` map in `src/cli.ts`:

```typescript
import { doctor } from './subcommands/doctor.js';

const SUBCOMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  install,
  doctor,
};
```

- [x] **Step 5: Run tests, expect pass**

Run: `cd plugins/dw-lifecycle && npm test -- doctor`
Expected: 4 tests pass.

- [x] **Step 6: Commit**

```bash
git add plugins/dw-lifecycle/src/subcommands/doctor.ts plugins/dw-lifecycle/src/__tests__/doctor.test.ts plugins/dw-lifecycle/src/cli.ts
git commit -m "feat(dw-lifecycle/bin): doctor subcommand (peer-plugins + missing-config rules)"
```

---

### Task 12: Run all Phase 2 tests + verify clean

- [x] **Step 1: Run full test suite**

Run: `cd plugins/dw-lifecycle && npm test`
Expected: all tests pass (config + frontmatter + install.smoke + doctor).

- [x] **Step 2: Verify tsc clean**

Run: `cd plugins/dw-lifecycle && npx tsc --noEmit`
Expected: no errors.

- [x] **Step 3: No commit needed (verification step)**

---

### Task 13: Phase 2 wrap commit (if needed)

(Skip if all tasks committed inline. This task exists as a checkpoint marker for subagent-driven execution to align before Phase 3.)

---

## Phase 3 — Doc tree + workplan I/O (T14–T19)

### Task 14: Doc-tree resolution (TDD)

**Files:**
- Create: `plugins/dw-lifecycle/src/docs.ts`
- Create: `plugins/dw-lifecycle/src/__tests__/docs.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// src/__tests__/docs.test.ts
import { describe, it, expect } from 'vitest';
import { resolveFeatureDir, resolveFeaturePath } from '../docs.js';
import type { Config } from '../config.types.js';

const baseCfg: Config = {
  version: 1,
  docs: {
    root: 'docs',
    byVersion: true,
    defaultTargetVersion: '1.0',
    knownVersions: ['1.0', '1.1'],
    statusDirs: {
      inProgress: '001-IN-PROGRESS',
      waiting: '002-WAITING',
      complete: '003-COMPLETE',
    },
  },
  branches: { prefix: 'feature/' },
  worktrees: { naming: '<repo>-<slug>' },
  journal: { path: 'DEVELOPMENT-NOTES.md', enabled: true },
  tracking: { platform: 'github', parentLabels: [], phaseLabels: [] },
  session: { start: { preamble: '' }, end: { preamble: '' } },
};

describe('docs', () => {
  it('resolves byVersion path with explicit target', () => {
    const dir = resolveFeatureDir(baseCfg, '/repo', 'my-slug', { stage: 'inProgress', targetVersion: '1.1' });
    expect(dir).toBe('/repo/docs/1.1/001-IN-PROGRESS/my-slug');
  });

  it('uses defaultTargetVersion when target omitted', () => {
    const dir = resolveFeatureDir(baseCfg, '/repo', 'my-slug', { stage: 'inProgress' });
    expect(dir).toBe('/repo/docs/1.0/001-IN-PROGRESS/my-slug');
  });

  it('omits version segment when byVersion is false', () => {
    const cfg: Config = { ...baseCfg, docs: { ...baseCfg.docs, byVersion: false } };
    const dir = resolveFeatureDir(cfg, '/repo', 'my-slug', { stage: 'inProgress' });
    expect(dir).toBe('/repo/docs/001-IN-PROGRESS/my-slug');
  });

  it('resolves complete stage', () => {
    const dir = resolveFeatureDir(baseCfg, '/repo', 'my-slug', { stage: 'complete', targetVersion: '1.0' });
    expect(dir).toBe('/repo/docs/1.0/003-COMPLETE/my-slug');
  });

  it('resolveFeaturePath joins file inside the feature dir', () => {
    const file = resolveFeaturePath(baseCfg, '/repo', 'my-slug', 'workplan.md', { stage: 'inProgress' });
    expect(file).toBe('/repo/docs/1.0/001-IN-PROGRESS/my-slug/workplan.md');
  });
});
```

- [x] **Step 2: Run, expect failure**

Run: `cd plugins/dw-lifecycle && npm test -- docs`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `docs.ts`**

```typescript
// src/docs.ts
import { join } from 'node:path';
import type { Config } from './config.types.js';

export type Stage = 'inProgress' | 'waiting' | 'complete';

export interface ResolveOpts {
  stage: Stage;
  targetVersion?: string;
}

export function resolveFeatureDir(
  cfg: Config,
  projectRoot: string,
  slug: string,
  opts: ResolveOpts
): string {
  const stageDir = cfg.docs.statusDirs[opts.stage];
  const segments = [projectRoot, cfg.docs.root];
  if (cfg.docs.byVersion) {
    segments.push(opts.targetVersion ?? cfg.docs.defaultTargetVersion);
  }
  segments.push(stageDir, slug);
  return join(...segments);
}

export function resolveFeaturePath(
  cfg: Config,
  projectRoot: string,
  slug: string,
  file: string,
  opts: ResolveOpts
): string {
  return join(resolveFeatureDir(cfg, projectRoot, slug, opts), file);
}
```

- [x] **Step 4: Run tests, expect pass**

Run: `cd plugins/dw-lifecycle && npm test -- docs`
Expected: 5 tests pass.

- [x] **Step 5: Commit**

```bash
git add plugins/dw-lifecycle/src/docs.ts plugins/dw-lifecycle/src/__tests__/docs.test.ts
git commit -m "feat(dw-lifecycle/bin): version-aware doc-tree resolution"
```

---

### Task 15: Workplan parser/writer (TDD)

The workplan is a markdown file with a known structure (frontmatter + phase headings + task tables). The parser extracts the task list (with checkbox states); the writer mutates checkboxes idempotently.

**Files:**
- Create: `plugins/dw-lifecycle/src/workplan.ts`
- Create: `plugins/dw-lifecycle/src/__tests__/workplan.test.ts`
- Create: `plugins/dw-lifecycle/src/__tests__/fixtures/workplan-sample.md`

- [x] **Step 1: Create the fixture**

```markdown
<!-- src/__tests__/fixtures/workplan-sample.md -->
---
slug: example
targetVersion: "1.0"
---

# Workplan: example

## Phase 1

### Task 1: First thing

- [ ] Step 1: do thing
- [ ] Step 2: verify

### Task 2: Second thing

- [x] Step 1: already done
- [ ] Step 2: not yet
```

- [x] **Step 2: Write the failing test**

```typescript
// src/__tests__/workplan.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkplan, markStepDone } from '../workplan.js';

const fixture = readFileSync(join(__dirname, 'fixtures/workplan-sample.md'), 'utf8');

describe('workplan', () => {
  it('parses tasks and steps', () => {
    const wp = parseWorkplan(fixture);
    expect(wp.tasks).toHaveLength(2);
    expect(wp.tasks[0].title).toBe('Task 1: First thing');
    expect(wp.tasks[0].steps[0]).toEqual({ done: false, text: 'Step 1: do thing' });
    expect(wp.tasks[1].steps[0]).toEqual({ done: true, text: 'Step 1: already done' });
  });

  it('marks a step done idempotently', () => {
    const out1 = markStepDone(fixture, { task: 'Task 1: First thing', step: 'Step 1: do thing' });
    const out2 = markStepDone(out1, { task: 'Task 1: First thing', step: 'Step 1: do thing' });
    expect(out1).toBe(out2);
    const wp = parseWorkplan(out1);
    expect(wp.tasks[0].steps[0].done).toBe(true);
  });

  it('preserves untouched content byte-identical', () => {
    const out = markStepDone(fixture, { task: 'Task 1: First thing', step: 'Step 1: do thing' });
    // Only the targeted checkbox flips; everything else identical
    const diff = out.split('\n').filter((line, i) => line !== fixture.split('\n')[i]);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toContain('[x] Step 1: do thing');
  });
});
```

- [x] **Step 3: Run, expect failure**

Run: `cd plugins/dw-lifecycle && npm test -- workplan`
Expected: FAIL — module not found.

- [x] **Step 4: Implement `workplan.ts`**

```typescript
// src/workplan.ts
export interface WorkplanStep {
  done: boolean;
  text: string;
}

export interface WorkplanTask {
  title: string;
  steps: WorkplanStep[];
}

export interface ParsedWorkplan {
  tasks: WorkplanTask[];
}

const TASK_HEADER_RE = /^### (Task .+)$/;
const STEP_RE = /^- \[( |x)\] (.+)$/;

export function parseWorkplan(source: string): ParsedWorkplan {
  const lines = source.split('\n');
  const tasks: WorkplanTask[] = [];
  let currentTask: WorkplanTask | null = null;

  for (const line of lines) {
    const taskMatch = TASK_HEADER_RE.exec(line);
    if (taskMatch) {
      currentTask = { title: taskMatch[1], steps: [] };
      tasks.push(currentTask);
      continue;
    }
    if (!currentTask) continue;
    const stepMatch = STEP_RE.exec(line);
    if (stepMatch) {
      currentTask.steps.push({ done: stepMatch[1] === 'x', text: stepMatch[2] });
    }
  }

  return { tasks };
}

export interface MarkStepArgs {
  task: string;
  step: string;
}

export function markStepDone(source: string, args: MarkStepArgs): string {
  const lines = source.split('\n');
  let inTask = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const taskMatch = TASK_HEADER_RE.exec(line);
    if (taskMatch) {
      inTask = taskMatch[1] === args.task;
      continue;
    }
    if (!inTask) continue;
    const stepMatch = STEP_RE.exec(line);
    if (stepMatch && stepMatch[2] === args.step) {
      lines[i] = `- [x] ${stepMatch[2]}`;
      // Keep walking — multiple matches in same task should all flip,
      // though by convention each step text is unique within a task.
    }
  }

  return lines.join('\n');
}
```

- [x] **Step 5: Run tests, expect pass**

Run: `cd plugins/dw-lifecycle && npm test -- workplan`
Expected: 3 tests pass.

- [x] **Step 6: Commit**

```bash
git add plugins/dw-lifecycle/src/workplan.ts plugins/dw-lifecycle/src/__tests__/workplan.test.ts plugins/dw-lifecycle/src/__tests__/fixtures/workplan-sample.md
git commit -m "feat(dw-lifecycle/bin): workplan parser + step-mark helpers"
```

---

### Task 16: Templates — copy from existing /feature-* family

**Files:**
- Create: `plugins/dw-lifecycle/templates/prd.md`
- Create: `plugins/dw-lifecycle/templates/workplan.md`
- Create: `plugins/dw-lifecycle/templates/readme.md`
- Create: `plugins/dw-lifecycle/templates/feature-definition.md`

- [x] **Step 1: Read existing templates**

Run: `find /Users/orion/work/deskwork-work/deskwork-plugin/.claude/skills/feature-setup -name "*.md" -type f`

The feature-setup skill almost certainly embeds template content inline (e.g., as heredocs or markdown blocks). Read the SKILL.md and extract the embedded templates.

- [x] **Step 2: Save each template as a file with placeholders**

Templates use `<placeholder>` syntax for substitution at scaffold time. Required placeholders:

- `<slug>` — feature slug
- `<title>` — human-readable title
- `<targetVersion>` — release target (e.g., `1.0`, `1.1`)
- `<date>` — ISO date of scaffold
- `<branch>` — full branch name (e.g., `feature/<slug>`)
- `<parentIssue>` — parent GitHub issue reference (filled by `/dw-lifecycle:issues`)

Templates faithfully reproduce the in-tree shape. PRD has Problem / Scope / Approach / Tasks sections; workplan has phase headings and task tables; readme has status table + phase status.

- [x] **Step 3: Verify the templates render**

Run: `node -e "console.log(require('fs').readFileSync('plugins/dw-lifecycle/templates/prd.md', 'utf8'))"`
Expected: prints the PRD template content with placeholders visible.

- [x] **Step 4: Commit**

```bash
git add plugins/dw-lifecycle/templates/
git commit -m "feat(dw-lifecycle): port PRD/workplan/README/definition templates from /feature-*"
```

---

### Task 17: `dw-lifecycle setup` subcommand

**Files:**
- Create: `plugins/dw-lifecycle/src/subcommands/setup.ts`
- Modify: `plugins/dw-lifecycle/src/cli.ts`

- [x] **Step 1: Implement setup**

```typescript
// src/subcommands/setup.ts
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { resolveFeatureDir } from '../docs.js';
import { repoRoot, expandWorktreeName } from '../repo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');

interface SetupArgs {
  slug: string;
  targetVersion?: string;
  title?: string;
  definitionFile?: string;
}

function parseArgs(args: string[]): SetupArgs {
  let slug: string | undefined;
  let targetVersion: string | undefined;
  let title: string | undefined;
  let definitionFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--target') targetVersion = args[++i];
    else if (a === '--title') title = args[++i];
    else if (a === '--definition') definitionFile = args[++i];
    else if (!slug && !a.startsWith('--')) slug = a;
  }

  if (!slug) throw new Error('Usage: dw-lifecycle setup <slug> [--target <version>] [--title <title>] [--definition <path>]');
  return { slug, targetVersion, title, definitionFile };
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/<(\w+)>/g, (m, key) => vars[key] ?? m);
}

export async function setup(args: string[]): Promise<void> {
  const { slug, targetVersion, title, definitionFile } = parseArgs(args);
  const root = repoRoot();
  const cfg = loadConfig(root);
  const target = targetVersion ?? cfg.docs.defaultTargetVersion;
  const dir = resolveFeatureDir(cfg, root, slug, { stage: 'inProgress', targetVersion: target });

  if (existsSync(dir)) {
    throw new Error(`Feature directory already exists: ${dir}. Refusing to overwrite.`);
  }

  // Create branch + worktree
  const branchName = `${cfg.branches.prefix}${slug}`;
  const worktreePath = join(dirname(root), expandWorktreeName(cfg.worktrees.naming, slug, root));
  execSync(`git -C "${root}" worktree add "${worktreePath}" -b "${branchName}" main`, { stdio: 'inherit' });

  // Scaffold docs in the new worktree
  const docsDir = resolveFeatureDir(cfg, worktreePath, slug, { stage: 'inProgress', targetVersion: target });
  mkdirSync(docsDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const vars: Record<string, string> = {
    slug,
    title: title ?? slug,
    targetVersion: target,
    date: today,
    branch: branchName,
    parentIssue: '',
  };

  for (const filename of ['prd.md', 'workplan.md', 'readme.md']) {
    const tpl = readFileSync(join(TEMPLATES_DIR, filename), 'utf8');
    const out = renderTemplate(tpl, vars);
    const targetPath = join(docsDir, filename === 'readme.md' ? 'README.md' : filename);
    writeFileSync(targetPath, out, 'utf8');
  }

  // Optionally seed workplan content from a feature-definition.md file
  if (definitionFile && existsSync(definitionFile)) {
    // Phase 4 will integrate writing-plans output; for now just append the
    // definition's "Tasks" section as a Phase 1 stub.
    const defContent = readFileSync(definitionFile, 'utf8');
    const wpPath = join(docsDir, 'workplan.md');
    const wp = readFileSync(wpPath, 'utf8');
    writeFileSync(wpPath, wp + '\n<!-- Definition imported from: ' + definitionFile + ' -->\n' + defContent + '\n', 'utf8');
  }

  console.log(JSON.stringify({ slug, target, branch: branchName, worktreePath, docsDir }, null, 2));
}
```

- [x] **Step 2: Wire into cli.ts**

```typescript
import { setup } from './subcommands/setup.js';

const SUBCOMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  install,
  setup,
  doctor,
};
```

- [x] **Step 3: Smoke test against a temp git repo**

```bash
TMP=$(mktemp -d)
cd "$TMP"
git init
git commit --allow-empty -m "init"
git -C "$TMP" branch -M main
plugins/dw-lifecycle/bin/dw-lifecycle install "$TMP"
plugins/dw-lifecycle/bin/dw-lifecycle setup test-feature --target 1.0 --title "Test Feature"
ls "$(dirname "$TMP")/$(basename "$TMP")-test-feature/docs/1.0/001-IN-PROGRESS/test-feature/"
```

Expected: prints `prd.md  README.md  workplan.md`.

Cleanup:
```bash
git -C "$TMP" worktree remove "$(dirname "$TMP")/$(basename "$TMP")-test-feature" --force
rm -rf "$TMP" "$(dirname "$TMP")/$(basename "$TMP")-test-feature"
```

- [x] **Step 4: Commit**

```bash
git add plugins/dw-lifecycle/src/subcommands/setup.ts plugins/dw-lifecycle/src/cli.ts
git commit -m "feat(dw-lifecycle/bin): setup subcommand (branch + worktree + docs scaffold)"
```

---

### Task 18: Setup integration test

**Files:**
- Create: `plugins/dw-lifecycle/src/__tests__/setup.smoke.test.ts`

- [x] **Step 1: Write the integration test**

```typescript
// src/__tests__/setup.smoke.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { install } from '../subcommands/install.js';
import { setup } from '../subcommands/setup.js';

describe('setup (smoke)', () => {
  let tmpRoot: string;
  let worktreePath: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'dw-lifecycle-setup-'));
    execSync('git init -b main', { cwd: tmpRoot });
    execSync('git commit --allow-empty -m "init"', { cwd: tmpRoot });
  });

  afterEach(() => {
    if (worktreePath && existsSync(worktreePath)) {
      try {
        execSync(`git -C "${tmpRoot}" worktree remove "${worktreePath}" --force`);
      } catch {}
      rmSync(worktreePath, { recursive: true, force: true });
    }
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('creates a worktree, branch, and scaffolded docs', async () => {
    await install([tmpRoot]);

    // chdir so repoRoot() picks up tmpRoot
    const origCwd = process.cwd();
    process.chdir(tmpRoot);
    try {
      await setup(['test-feature', '--target', '1.0', '--title', 'Test']);
    } finally {
      process.chdir(origCwd);
    }

    worktreePath = join(dirname(tmpRoot), `${basename(tmpRoot)}-test-feature`);
    expect(existsSync(worktreePath)).toBe(true);

    const docsDir = join(worktreePath, 'docs/1.0/001-IN-PROGRESS/test-feature');
    expect(existsSync(join(docsDir, 'prd.md'))).toBe(true);
    expect(existsSync(join(docsDir, 'workplan.md'))).toBe(true);
    expect(existsSync(join(docsDir, 'README.md'))).toBe(true);

    const prd = readFileSync(join(docsDir, 'prd.md'), 'utf8');
    expect(prd).toContain('test-feature');
  });
});
```

- [x] **Step 2: Run, expect pass**

Run: `cd plugins/dw-lifecycle && npm test -- setup.smoke`
Expected: 1 test passes.

- [x] **Step 3: Commit**

```bash
git add plugins/dw-lifecycle/src/__tests__/setup.smoke.test.ts
git commit -m "test(dw-lifecycle/bin): setup integration smoke test"
```

---

### Task 19: Phase 3 verification

- [x] **Step 1: Run full test suite**

Run: `cd plugins/dw-lifecycle && npm test`
Expected: all tests pass.

- [x] **Step 2: Tsc clean**

Run: `cd plugins/dw-lifecycle && npx tsc --noEmit`
Expected: no errors.

---

## Phase 4 — Tracking + transitions + journal (T20–T26)

### Task 20: Journal append (TDD)

**Files:**
- Create: `plugins/dw-lifecycle/src/journal.ts`
- Create: `plugins/dw-lifecycle/src/__tests__/journal.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// src/__tests__/journal.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendJournalEntry } from '../journal.js';

describe('journal', () => {
  let tmp: string;
  let path: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-journal-'));
    path = join(tmp, 'DEVELOPMENT-NOTES.md');
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('creates the journal file when missing', () => {
    appendJournalEntry(path, '## 2026-04-29: Test\n\nGoal: testing.\n');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('## 2026-04-29: Test');
  });

  it('appends below existing content with separator', () => {
    writeFileSync(path, '# Development Notes\n\nExisting content.\n', 'utf8');
    appendJournalEntry(path, '## 2026-04-29: New entry\n\nGoal: stuff.\n');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('Existing content.');
    expect(content).toContain('## 2026-04-29: New entry');
    expect(content.indexOf('Existing content')).toBeLessThan(content.indexOf('New entry'));
  });

  it('does not double-append the same entry text', () => {
    writeFileSync(path, '# Notes\n\n## 2026-04-29: Foo\n\nGoal: x.\n', 'utf8');
    appendJournalEntry(path, '## 2026-04-29: Foo\n\nGoal: x.\n');
    const content = readFileSync(path, 'utf8');
    const occurrences = content.split('## 2026-04-29: Foo').length - 1;
    expect(occurrences).toBe(1);
  });
});
```

- [x] **Step 2: Run, expect failure**

Run: `cd plugins/dw-lifecycle && npm test -- journal`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `journal.ts`**

```typescript
// src/journal.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export function appendJournalEntry(journalPath: string, entry: string): void {
  if (!existsSync(journalPath)) {
    writeFileSync(journalPath, '# Development Notes\n\n' + entry + '\n', 'utf8');
    return;
  }
  const current = readFileSync(journalPath, 'utf8');
  // Idempotency: extract first line of entry as a fingerprint
  const fingerprint = entry.split('\n')[0];
  if (fingerprint && current.includes(fingerprint)) {
    return;
  }
  const trimmed = current.endsWith('\n') ? current : current + '\n';
  writeFileSync(journalPath, trimmed + '\n' + entry + (entry.endsWith('\n') ? '' : '\n'), 'utf8');
}
```

- [x] **Step 4: Run tests, expect pass**

Run: `cd plugins/dw-lifecycle && npm test -- journal`
Expected: 3 tests pass.

- [x] **Step 5: Commit**

```bash
git add plugins/dw-lifecycle/src/journal.ts plugins/dw-lifecycle/src/__tests__/journal.test.ts
git commit -m "feat(dw-lifecycle/bin): journal append helper"
```

---

### Task 21: `dw-lifecycle journal-append` subcommand

**Files:**
- Create: `plugins/dw-lifecycle/src/subcommands/journal-append.ts`
- Modify: `plugins/dw-lifecycle/src/cli.ts`

- [x] **Step 1: Implement subcommand**

```typescript
// src/subcommands/journal-append.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { repoRoot } from '../repo.js';
import { appendJournalEntry } from '../journal.js';

export async function journalAppend(args: string[]): Promise<void> {
  let entryFile: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') entryFile = args[++i];
  }
  if (!entryFile) throw new Error('Usage: dw-lifecycle journal-append --file <entry.md>');

  const root = repoRoot();
  const cfg = loadConfig(root);
  if (!cfg.journal.enabled) {
    console.log(JSON.stringify({ skipped: true, reason: 'journal.enabled=false' }));
    return;
  }

  const journalPath = join(root, cfg.journal.path);
  const entry = readFileSync(entryFile, 'utf8');
  appendJournalEntry(journalPath, entry);
  console.log(JSON.stringify({ journalPath, appended: true }));
}
```

- [x] **Step 2: Wire into cli.ts**

```typescript
import { journalAppend } from './subcommands/journal-append.js';

const SUBCOMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  install,
  setup,
  doctor,
  'journal-append': journalAppend,
};
```

- [x] **Step 3: Commit**

```bash
git add plugins/dw-lifecycle/src/subcommands/journal-append.ts plugins/dw-lifecycle/src/cli.ts
git commit -m "feat(dw-lifecycle/bin): journal-append subcommand"
```

---

### Task 22: Transitions (TDD)

**Files:**
- Create: `plugins/dw-lifecycle/src/transitions.ts`
- Create: `plugins/dw-lifecycle/src/__tests__/transitions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/transitions.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transitionFeature } from '../transitions.js';
import type { Config } from '../config.types.js';

const baseCfg: Config = {
  version: 1,
  docs: {
    root: 'docs',
    byVersion: true,
    defaultTargetVersion: '1.0',
    knownVersions: ['1.0'],
    statusDirs: { inProgress: '001-IN-PROGRESS', waiting: '002-WAITING', complete: '003-COMPLETE' },
  },
  branches: { prefix: 'feature/' },
  worktrees: { naming: '<repo>-<slug>' },
  journal: { path: 'DEVELOPMENT-NOTES.md', enabled: true },
  tracking: { platform: 'github', parentLabels: [], phaseLabels: [] },
  session: { start: { preamble: '' }, end: { preamble: '' } },
};

describe('transitions', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-trans-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('moves a feature directory from inProgress to complete', () => {
    const fromDir = join(tmp, 'docs/1.0/001-IN-PROGRESS/test');
    mkdirSync(fromDir, { recursive: true });
    writeFileSync(join(fromDir, 'README.md'), '# test\n', 'utf8');

    transitionFeature(baseCfg, tmp, 'test', { from: 'inProgress', to: 'complete', targetVersion: '1.0' });

    expect(existsSync(fromDir)).toBe(false);
    const toDir = join(tmp, 'docs/1.0/003-COMPLETE/test');
    expect(existsSync(join(toDir, 'README.md'))).toBe(true);
  });

  it('is idempotent if source missing but destination present', () => {
    const toDir = join(tmp, 'docs/1.0/003-COMPLETE/test');
    mkdirSync(toDir, { recursive: true });
    writeFileSync(join(toDir, 'README.md'), '# test\n', 'utf8');

    transitionFeature(baseCfg, tmp, 'test', { from: 'inProgress', to: 'complete', targetVersion: '1.0' });

    expect(existsSync(join(toDir, 'README.md'))).toBe(true);
  });

  it('throws if both source and destination missing', () => {
    expect(() =>
      transitionFeature(baseCfg, tmp, 'nonexistent', { from: 'inProgress', to: 'complete', targetVersion: '1.0' })
    ).toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `cd plugins/dw-lifecycle && npm test -- transitions`
Expected: FAIL.

- [ ] **Step 3: Implement `transitions.ts`**

```typescript
// src/transitions.ts
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveFeatureDir, type Stage } from './docs.js';
import type { Config } from './config.types.js';

export interface TransitionOpts {
  from: Stage;
  to: Stage;
  targetVersion: string;
}

export function transitionFeature(
  cfg: Config,
  projectRoot: string,
  slug: string,
  opts: TransitionOpts
): void {
  const fromDir = resolveFeatureDir(cfg, projectRoot, slug, { stage: opts.from, targetVersion: opts.targetVersion });
  const toDir = resolveFeatureDir(cfg, projectRoot, slug, { stage: opts.to, targetVersion: opts.targetVersion });

  if (existsSync(fromDir)) {
    mkdirSync(dirname(toDir), { recursive: true });
    renameSync(fromDir, toDir);
    return;
  }

  if (existsSync(toDir)) {
    // Idempotent: already at destination
    return;
  }

  throw new Error(`Feature "${slug}" not found at ${fromDir} or ${toDir}`);
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd plugins/dw-lifecycle && npm test -- transitions`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/dw-lifecycle/src/transitions.ts plugins/dw-lifecycle/src/__tests__/transitions.test.ts
git commit -m "feat(dw-lifecycle/bin): atomic state transitions"
```

---

### Task 23: `dw-lifecycle transition` subcommand

**Files:**
- Create: `plugins/dw-lifecycle/src/subcommands/transition.ts`
- Modify: `plugins/dw-lifecycle/src/cli.ts`

- [ ] **Step 1: Implement subcommand**

```typescript
// src/subcommands/transition.ts
import { loadConfig } from '../config.js';
import { repoRoot } from '../repo.js';
import { transitionFeature } from '../transitions.js';
import type { Stage } from '../docs.js';

const VALID_STAGES: Stage[] = ['inProgress', 'waiting', 'complete'];

export async function transition(args: string[]): Promise<void> {
  let slug: string | undefined;
  let from: Stage | undefined;
  let to: Stage | undefined;
  let targetVersion: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from') from = args[++i] as Stage;
    else if (a === '--to') to = args[++i] as Stage;
    else if (a === '--target') targetVersion = args[++i];
    else if (!slug && !a.startsWith('--')) slug = a;
  }

  if (!slug || !from || !to) {
    throw new Error('Usage: dw-lifecycle transition <slug> --from <stage> --to <stage> [--target <version>]');
  }
  if (!VALID_STAGES.includes(from)) throw new Error(`Invalid --from stage: ${from}`);
  if (!VALID_STAGES.includes(to)) throw new Error(`Invalid --to stage: ${to}`);

  const root = repoRoot();
  const cfg = loadConfig(root);
  const target = targetVersion ?? cfg.docs.defaultTargetVersion;

  transitionFeature(cfg, root, slug, { from, to, targetVersion: target });
  console.log(JSON.stringify({ slug, from, to, targetVersion: target, ok: true }));
}
```

- [ ] **Step 2: Wire into cli.ts**

```typescript
import { transition } from './subcommands/transition.js';

const SUBCOMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  install,
  setup,
  doctor,
  transition,
  'journal-append': journalAppend,
};
```

- [ ] **Step 3: Commit**

```bash
git add plugins/dw-lifecycle/src/subcommands/transition.ts plugins/dw-lifecycle/src/cli.ts
git commit -m "feat(dw-lifecycle/bin): transition subcommand"
```

---

### Task 24: GitHub tracking (TDD)

**Files:**
- Create: `plugins/dw-lifecycle/src/tracking-github.ts`
- Create: `plugins/dw-lifecycle/src/__tests__/tracking-github.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/tracking-github.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createParentIssue, createPhaseIssues } from '../tracking-github.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';

describe('tracking-github', () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
  });

  it('createParentIssue invokes gh with title + body', () => {
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from('https://github.com/owner/repo/issues/42\n'));
    const result = createParentIssue({ repo: 'owner/repo', title: 'Parent', body: 'Body', labels: ['enhancement'] });
    const call = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(call).toContain("gh issue create");
    expect(call).toContain('--repo owner/repo');
    expect(call).toContain('--title "Parent"');
    expect(call).toContain('--label enhancement');
    expect(result.url).toBe('https://github.com/owner/repo/issues/42');
    expect(result.number).toBe(42);
  });

  it('createPhaseIssues creates one issue per phase with parent reference', () => {
    vi.mocked(execSync)
      .mockReturnValueOnce(Buffer.from('https://github.com/owner/repo/issues/43\n'))
      .mockReturnValueOnce(Buffer.from('https://github.com/owner/repo/issues/44\n'));
    const results = createPhaseIssues({
      repo: 'owner/repo',
      parentNumber: 42,
      phases: [
        { name: 'Phase 1', body: 'P1' },
        { name: 'Phase 2', body: 'P2' },
      ],
      labels: ['enhancement'],
    });
    expect(results).toHaveLength(2);
    expect(results[0].number).toBe(43);
    expect(results[1].number).toBe(44);
    const firstCall = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(firstCall).toContain('Phase 1');
    expect(firstCall).toContain('#42');
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `cd plugins/dw-lifecycle && npm test -- tracking-github`
Expected: FAIL.

- [ ] **Step 3: Implement `tracking-github.ts`**

```typescript
// src/tracking-github.ts
import { execSync } from 'node:child_process';

export interface CreateIssueArgs {
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface IssueRef {
  url: string;
  number: number;
}

function shellEscape(s: string): string {
  return `"${s.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
}

function parseIssueRef(stdout: string): IssueRef {
  const url = stdout.trim();
  const match = /\/issues\/(\d+)/.exec(url);
  if (!match) throw new Error(`Could not parse gh issue URL: ${url}`);
  return { url, number: parseInt(match[1], 10) };
}

export function createParentIssue(args: CreateIssueArgs): IssueRef {
  const labelArgs = (args.labels ?? []).map((l) => `--label ${l}`).join(' ');
  const cmd = `gh issue create --repo ${args.repo} --title ${shellEscape(args.title)} --body ${shellEscape(args.body)} ${labelArgs}`.trim();
  const out = execSync(cmd, { encoding: 'utf8' });
  return parseIssueRef(out);
}

export interface CreatePhaseIssuesArgs {
  repo: string;
  parentNumber: number;
  phases: Array<{ name: string; body: string }>;
  labels?: string[];
}

export function createPhaseIssues(args: CreatePhaseIssuesArgs): IssueRef[] {
  const labelArgs = (args.labels ?? []).map((l) => `--label ${l}`).join(' ');
  return args.phases.map((p) => {
    const body = `${p.body}\n\nPart of #${args.parentNumber}.`;
    const cmd = `gh issue create --repo ${args.repo} --title ${shellEscape(p.name)} --body ${shellEscape(body)} ${labelArgs}`.trim();
    const out = execSync(cmd, { encoding: 'utf8' });
    return parseIssueRef(out);
  });
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd plugins/dw-lifecycle && npm test -- tracking-github`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/dw-lifecycle/src/tracking-github.ts plugins/dw-lifecycle/src/__tests__/tracking-github.test.ts
git commit -m "feat(dw-lifecycle/bin): github issue tracking helpers"
```

---

### Task 25: `dw-lifecycle issues` subcommand

**Files:**
- Create: `plugins/dw-lifecycle/src/subcommands/issues.ts`
- Modify: `plugins/dw-lifecycle/src/cli.ts`

- [ ] **Step 1: Implement issues subcommand**

```typescript
// src/subcommands/issues.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { loadConfig } from '../config.js';
import { resolveFeaturePath } from '../docs.js';
import { repoRoot } from '../repo.js';
import { createParentIssue, createPhaseIssues } from '../tracking-github.js';
import { parseFrontmatter } from '../frontmatter.js';

interface IssuesArgs {
  slug: string;
  targetVersion?: string;
  repo?: string;
}

function parseArgs(args: string[]): IssuesArgs {
  let slug: string | undefined;
  let targetVersion: string | undefined;
  let repo: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--target') targetVersion = args[++i];
    else if (a === '--repo') repo = args[++i];
    else if (!slug && !a.startsWith('--')) slug = a;
  }
  if (!slug) throw new Error('Usage: dw-lifecycle issues <slug> [--target <version>] [--repo <owner/repo>]');
  return { slug, targetVersion, repo };
}

function detectRepo(root: string): string {
  const remote = execSync('git remote get-url origin', { cwd: root, encoding: 'utf8' }).trim();
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (!match) throw new Error(`Could not parse GitHub repo from origin: ${remote}`);
  return match[1];
}

function extractPhases(workplan: string): Array<{ name: string; body: string }> {
  // Phase headings: "## Phase N — <name>"
  const lines = workplan.split('\n');
  const phases: Array<{ name: string; body: string }> = [];
  let current: { name: string; body: string } | null = null;
  for (const line of lines) {
    const m = /^## (Phase \d+.*)$/.exec(line);
    if (m) {
      if (current) phases.push(current);
      current = { name: m[1], body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) phases.push(current);
  return phases;
}

export async function issues(parsedArgs: string[]): Promise<void> {
  const { slug, targetVersion, repo } = parseArgs(parsedArgs);
  const root = repoRoot();
  const cfg = loadConfig(root);
  const target = targetVersion ?? cfg.docs.defaultTargetVersion;
  const repoSlug = repo ?? detectRepo(root);

  const wpPath = resolveFeaturePath(cfg, root, slug, 'workplan.md', { stage: 'inProgress', targetVersion: target });
  const readmePath = resolveFeaturePath(cfg, root, slug, 'README.md', { stage: 'inProgress', targetVersion: target });

  if (!existsSync(wpPath)) throw new Error(`Workplan not found: ${wpPath}. Run /dw-lifecycle:setup first.`);
  const wpContent = readFileSync(wpPath, 'utf8');

  const parent = createParentIssue({
    repo: repoSlug,
    title: `[${slug}] feature lifecycle parent`,
    body: `Parent issue for the ${slug} feature. See \`${wpPath}\` in the worktree.`,
    labels: cfg.tracking.parentLabels,
  });

  const phaseList = extractPhases(wpContent);
  const phaseRefs = createPhaseIssues({
    repo: repoSlug,
    parentNumber: parent.number,
    phases: phaseList,
    labels: cfg.tracking.phaseLabels,
  });

  // Update README.md frontmatter with parentIssue + back-fill phase issue numbers in workplan
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, 'utf8');
    const { data, body } = parseFrontmatter(readme);
    const updatedReadme = readme.replace(/<parentIssue>/g, `#${parent.number}`);
    writeFileSync(readmePath, updatedReadme, 'utf8');
  }

  console.log(JSON.stringify({ parent, phases: phaseRefs }, null, 2));
}
```

- [ ] **Step 2: Wire into cli.ts**

```typescript
import { issues } from './subcommands/issues.js';

const SUBCOMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  install,
  setup,
  issues,
  transition,
  'journal-append': journalAppend,
  doctor,
};
```

- [ ] **Step 3: Commit**

```bash
git add plugins/dw-lifecycle/src/subcommands/issues.ts plugins/dw-lifecycle/src/cli.ts
git commit -m "feat(dw-lifecycle/bin): issues subcommand (parent + phase issue creation)"
```

---

### Task 26: Phase 4 verification

- [ ] **Step 1: Run full suite**

Run: `cd plugins/dw-lifecycle && npm test`
Expected: all tests pass.

- [ ] **Step 2: Tsc clean**

Run: `cd plugins/dw-lifecycle && npx tsc --noEmit`
Expected: no errors.

---

## Phase 5 — Skills (T27–T42)

Each task in this phase replaces a stub `SKILL.md` with the real content per design.md §3 (the skill-by-skill integration map). The skill body shows: numbered steps, what to invoke from canonical layers, what to dispatch via Agent tool, what bin subcommand to shell out to, and error handling.

The skills follow the existing deskwork skill-doc shape — read `plugins/deskwork/skills/install/SKILL.md` once before starting Phase 5 to internalize the convention.

### Task 27: /dw-lifecycle:install

- [ ] **Step 1: Read the existing pattern**

Run: `cat plugins/deskwork/skills/install/SKILL.md`
Note: structure is frontmatter → intent paragraph → numbered steps → error handling.

- [ ] **Step 2: Write `skills/install/SKILL.md`**

```markdown
---
name: dw-lifecycle:install
description: "Bootstrap dw-lifecycle in a host project: probe structure, write .dw-lifecycle/config.json"
user_invocable: true
---

# /dw-lifecycle:install

Bootstrap dw-lifecycle in a host project. Probes the project for existing shape (docs/<version>/, branch prefix, journal file, repo origin), confirms each detected value with the operator, then writes `.dw-lifecycle/config.json`.

This is a Phase-0 skill — every other dw-lifecycle skill assumes the config exists.

## Steps

1. Resolve the project root (default: current working directory).
2. Refuse to run if `.dw-lifecycle/config.json` already exists; surface the existing config path and stop.
3. Probe the project:
   - Detect `docs/<version>/<status>/<slug>/` shape if present (set `docs.byVersion: true` and seed `knownVersions`)
   - Detect existing branch prefix (e.g., `feature/`)
   - Detect repo basename for `worktrees.naming` template
   - Detect journal file presence (`DEVELOPMENT-NOTES.md`)
   - Detect GitHub remote for `tracking`
4. Confirm each detected value with the operator. Do NOT silently use defaults that might be wrong.
5. Invoke the helper:

```
dw-lifecycle install <project-root>
```

The helper writes `.dw-lifecycle/config.json` with the agreed values.

6. Report: config path, detected vs. defaulted fields, peer-plugin status (run `dw-lifecycle doctor` to surface).

## Error handling

- **Config already exists.** Surface path and stop. No overwrite.
- **Not a git repository.** Surface the error from `git rev-parse`. dw-lifecycle requires a git repo.
- **No GitHub remote.** Skill warns; config gets written with `tracking.platform: "github"` but operator must update remote before `/dw-lifecycle:issues` can run.
```

- [ ] **Step 3: Verify the file is valid markdown**

Run: `cat plugins/dw-lifecycle/skills/install/SKILL.md | head`
Expected: frontmatter + content visible.

- [x] **Step 4: Commit**

```bash
git add plugins/dw-lifecycle/skills/install/SKILL.md
git commit -m "feat(dw-lifecycle/skills): install skill"
```

---

### Task 28: /dw-lifecycle:define

- [ ] **Step 1: Write `skills/define/SKILL.md`**

```markdown
---
name: dw-lifecycle:define
description: "Interview to capture problem/scope/approach/tasks; writes feature-definition.md"
user_invocable: true
---

# /dw-lifecycle:define

Capture a new feature's problem, scope, approach, and task breakdown. Hands off to `superpowers:brainstorming` for the interview itself; this skill wraps brainstorming's output with the project-management envelope.

## Steps

1. Confirm the feature slug (kebab-case; the operator picks).
2. Invoke `superpowers:brainstorming` to drive the design conversation. The brainstorming skill produces a design doc; we'll capture its key fields into `feature-definition.md`.
3. (Optional) For features that touch existing code, dispatch the `code-explorer` agent (from `feature-dev`) before the interview to surface relevant patterns/files. Skip if `feature-dev` is not installed (warning printed at skill start; install via `/plugin install feature-dev@claude-plugins-official`).
4. Write `/tmp/feature-definition-<slug>.md` from the brainstorming output. Required sections:
   - Problem (1–2 paragraphs)
   - Scope (in/out)
   - Approach (chosen design summary)
   - Tasks (high-level phase list)
5. Report: definition file path. Suggest `/dw-lifecycle:setup <slug> --target <version> --definition <path>` next.

## Error handling

- **Brainstorming not finished.** This skill does NOT bypass brainstorming. If the operator wants to skip, they should write the definition file by hand and call `/dw-lifecycle:setup` directly.
- **feature-dev not installed.** Warning at start; the `code-explorer` step is skipped. Skill continues.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/define/SKILL.md
git commit -m "feat(dw-lifecycle/skills): define skill"
```

---

### Task 29: /dw-lifecycle:setup

- [ ] **Step 1: Write `skills/setup/SKILL.md`**

```markdown
---
name: dw-lifecycle:setup
description: "Create branch + worktree + version-aware docs/<v>/<status>/<slug>/ + populate PRD/workplan/README"
user_invocable: true
---

# /dw-lifecycle:setup

Provision a new feature: branch, worktree, status-organized docs directory, and scaffolded PRD/workplan/README from templates.

## Steps

1. Confirm `slug` (kebab-case) and target version (defaults to `config.docs.defaultTargetVersion`).
2. Invoke `superpowers:using-git-worktrees` for branch + worktree creation. The worktree path follows `config.worktrees.naming`.
3. Invoke `superpowers:writing-plans` to generate the workplan content from the feature definition (if `--definition <path>` given) or from a fresh design conversation. The output is the body of `workplan.md`.
4. Shell out to the helper:

```
dw-lifecycle setup <slug> [--target <version>] [--title <title>] [--definition <path>]
```

The helper:
   - Creates `docs/<version>/<status>/<slug>/` in the new worktree
   - Renders templates (`prd.md`, `workplan.md`, `README.md`) with placeholder substitution
   - Records the target version in frontmatter so it travels with the feature

5. Report: branch name, worktree path, docs directory, files scaffolded.

## Error handling

- **Branch already exists.** Helper aborts. Operator picks a different slug or checks out the existing branch manually.
- **Doc directory already exists.** Helper aborts. Never overwrites — investigate the existing directory first.
- **Version directory missing.** Helper creates it atomically. `/dw-lifecycle:doctor` flags any version directories present in the file tree but absent from `config.docs.knownVersions`.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/setup/SKILL.md
git commit -m "feat(dw-lifecycle/skills): setup skill"
```

---

### Task 30: /dw-lifecycle:issues

- [ ] **Step 1: Write `skills/issues/SKILL.md`**

```markdown
---
name: dw-lifecycle:issues
description: "Create parent + per-phase GitHub issues from workplan; back-fill issue links"
user_invocable: true
---

# /dw-lifecycle:issues

Create the GitHub tracking issues for a feature: one parent issue + one issue per phase from the workplan.

## Steps

1. Confirm slug. Default repo is detected from `git remote get-url origin`; override with `--repo owner/repo` if needed.
2. Read `workplan.md` to extract phase headings (`## Phase N — <name>`).
3. Shell out:

```
dw-lifecycle issues <slug> [--target <version>] [--repo owner/repo]
```

The helper creates the parent issue, then one issue per phase (referencing the parent in the phase issue body), then back-fills the parent issue number into the README's `<parentIssue>` placeholder.

4. Report: parent issue URL/number, list of phase issue URLs/numbers.

## Error handling

- **`gh` CLI not authenticated.** Surface the gh error verbatim. Operator runs `gh auth login` and retries.
- **Workplan missing.** Stop with `Run /dw-lifecycle:setup first.`
- **Repo not detectable from origin.** Surface the parsed URL and ask operator to pass `--repo` explicitly.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/issues/SKILL.md
git commit -m "feat(dw-lifecycle/skills): issues skill"
```

---

### Task 31: /dw-lifecycle:implement

- [ ] **Step 1: Write `skills/implement/SKILL.md`**

```markdown
---
name: dw-lifecycle:implement
description: "Walk workplan tasks; delegate to subagents; commit at task boundaries"
user_invocable: true
---

# /dw-lifecycle:implement

Drive implementation through the workplan. Selects the next unchecked task, dispatches subagents per task, reviews output, marks the task done, commits. Repeats.

## Steps

1. Confirm slug and target version.
2. Invoke `superpowers:subagent-driven-development` as the orchestration discipline. The skill walks the workplan, dispatching per-task subagents with full task context.
3. For features touching existing code, dispatch `code-explorer` (from `feature-dev`) once at start to orient the agent. Skip if feature-dev not installed.
4. For each task in the workplan:
   - If the task involves architecture decisions, dispatch `code-architect` (from `feature-dev`) to propose 2–3 approaches before coding. Skip if feature-dev not installed.
   - If the task introduces or modifies tested code, follow `superpowers:test-driven-development` (write failing test → minimal impl → pass → commit).
   - If a step is independent of others, consider `superpowers:dispatching-parallel-agents` to fan out.
   - When the task body is complete, mark its checkboxes and commit.
5. After each task, optionally run `/dw-lifecycle:review` (does NOT block; operator chooses cadence).
6. Repeat until all tasks done or operator pauses.

## Error handling

- **feature-dev not installed.** Print one-line warning at start; agent dispatch steps are skipped. Skill continues with single-agent fallback.
- **Bug surfaces during a task.** Invoke `superpowers:systematic-debugging` before continuing the task. Don't push through with a known bug.
- **Test failures during TDD.** Per the TDD discipline: failing test is expected before implementation. Failing tests AFTER implementation means the impl is wrong; iterate, don't bypass the test.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/implement/SKILL.md
git commit -m "feat(dw-lifecycle/skills): implement skill"
```

---

### Task 32: /dw-lifecycle:review

- [ ] **Step 1: Write `skills/review/SKILL.md`**

```markdown
---
name: dw-lifecycle:review
description: "Delegate code review of recent changes; collate findings"
user_invocable: true
---

# /dw-lifecycle:review

Delegate review of recent changes to feature-dev's `code-reviewer` agent. Replaces in-house code-reviewer agents — canonical wins per the boundary contract.

## Steps

1. Determine review scope: defaults to commits since branching from `main`; operator may override with `--since <ref>`.
2. Invoke `superpowers:requesting-code-review` to frame the request. Include the workplan reference and any architectural decisions for context.
3. Dispatch `code-reviewer` (from `feature-dev`) with the scope. For substantial changes, dispatch 2–3 reviewers in parallel with different focuses (security, correctness, conventions) via `superpowers:dispatching-parallel-agents`.
4. Apply `superpowers:receiving-code-review` discipline when integrating findings: technical rigor, no performative agreement.
5. Report: findings grouped by severity; what was applied vs. deferred.

## Error handling

- **feature-dev not installed.** Skill exits with: `"/dw-lifecycle:review requires feature-dev. Install: /plugin install feature-dev@claude-plugins-official"`. (Treats feature-dev's reviewer as required for this skill specifically; the broader plugin's "recommended peer" posture has this carve-out.)

(Author's note: revisit this carve-out — if the user prefers a soft-fallback for review, change this skill to print a warning and skip the dispatch.)
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/review/SKILL.md
git commit -m "feat(dw-lifecycle/skills): review skill"
```

---

### Task 33: /dw-lifecycle:ship

- [ ] **Step 1: Write `skills/ship/SKILL.md`**

```markdown
---
name: dw-lifecycle:ship
description: "Verify acceptance criteria; open PR; stop at PR creation (operator owns merge)"
user_invocable: true
---

# /dw-lifecycle:ship

Final pre-merge gate. Verify acceptance criteria, run tests, open the PR. **Stops at PR creation.** The operator owns the merge gate per agent-discipline.

## Steps

1. Read the workplan's acceptance criteria from `Phase: Acceptance` (or equivalent).
2. Invoke `superpowers:verification-before-completion`: run the verification commands listed in the workplan and confirm output. Evidence before assertions.
3. Invoke `superpowers:finishing-a-development-branch` to handle the PR creation flow.
4. Open the PR via `gh pr create`. Title format: `feat(<slug>): <one-line summary>`. Body references the parent issue.
5. **Stop.** Report PR URL. Do NOT merge. The operator decides when to merge.

## Error handling

- **Verification fails.** Stop. Surface the failing verification step. Iterate until verification passes; do not push to PR with known failures.
- **Tests fail.** Same — stop and iterate. Tests passing is non-negotiable for ship.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/ship/SKILL.md
git commit -m "feat(dw-lifecycle/skills): ship skill (stop-at-PR rule)"
```

---

### Task 34: /dw-lifecycle:complete

- [ ] **Step 1: Write `skills/complete/SKILL.md`**

```markdown
---
name: dw-lifecycle:complete
description: "Move docs to <complete-dir>; update ROADMAP; close issues"
user_invocable: true
---

# /dw-lifecycle:complete

Mark a feature complete. Runs ON the feature branch BEFORE merge. Moves docs to the complete-status directory, updates ROADMAP, closes related issues.

## Steps

1. Confirm slug and target version (read from feature's README/PRD frontmatter).
2. Read `<feature-dir>/README.md` to find the parent issue + phase issue numbers.
3. Shell out to the helper to move docs:

```
dw-lifecycle transition <slug> --from inProgress --to complete --target <version>
```

4. Update `docs/<version>/ROADMAP.md` (if present) — append a row for this feature in the COMPLETE section.
5. Close the parent + phase GitHub issues:

```
gh issue close <number> --comment "Completed in feature/<slug>; see <feature-dir>/README.md for the implementation summary."
```

6. Commit the doc-tree move and ROADMAP update.
7. Report: new docs path, issues closed, commit hash.

## Error handling

- **Feature not in inProgress.** Helper's transition errors out. Surface and stop.
- **gh close fails.** Surface and stop; doc moves stay (idempotent transition handles re-run).
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/complete/SKILL.md
git commit -m "feat(dw-lifecycle/skills): complete skill"
```

---

### Task 35: /dw-lifecycle:pickup

- [ ] **Step 1: Write `skills/pickup/SKILL.md`**

```markdown
---
name: dw-lifecycle:pickup
description: "Read workplan + check issue status + report next-action"
user_invocable: true
---

# /dw-lifecycle:pickup

Resume a feature mid-flight. Read the workplan, check GitHub issue status, report what's done and what's next.

## Steps

1. Confirm slug.
2. Read `<feature-dir>/workplan.md` and find the first unchecked task.
3. Read `<feature-dir>/README.md` for parent issue number; pull issue states via `gh issue view <n>`.
4. Read the latest journal entry referencing this slug.
5. Report:
   - Current phase + first unchecked task
   - Issue states (open/closed)
   - Last journal-entry summary
   - Suggested next command (typically `/dw-lifecycle:implement <slug>`)

## Error handling

- **Slug doesn't exist.** Suggest `/dw-lifecycle:doctor` to find orphan dirs or unbound features.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/pickup/SKILL.md
git commit -m "feat(dw-lifecycle/skills): pickup skill"
```

---

### Task 36: /dw-lifecycle:extend

- [ ] **Step 1: Write `skills/extend/SKILL.md`**

```markdown
---
name: dw-lifecycle:extend
description: "Add phases to PRD/workplan; create new GitHub issues for added phases"
user_invocable: true
---

# /dw-lifecycle:extend

Add new phases to a feature mid-implementation. Mirrors the initial setup pattern but for incremental additions.

## Steps

1. Confirm slug and the new phase content.
2. Invoke `superpowers:writing-plans` to generate the new phase's task breakdown. (Same discipline as initial workplan creation.)
3. Append the phase to `<feature-dir>/workplan.md` and update the README's phase status table.
4. Create new GitHub issues for the added phases (single phase = one new issue, link to parent):

```
gh issue create --title "<phase title>" --body "Part of #<parent>" --label enhancement
```

5. Update the PRD's "Implementation Phases" section to reflect the addition.
6. Optionally record `--retarget <new-version>` to move the feature directory to a different version target. Helper usage:

```
dw-lifecycle transition <slug> --from inProgress --to inProgress --target <new-version>
```

(Note: same-stage transition with version change is the re-target operation; helper handles the directory rename + frontmatter update.)

## Error handling

- **Cannot retarget if `byVersion: false`.** Skill warns and skips the version-change operation.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/extend/SKILL.md
git commit -m "feat(dw-lifecycle/skills): extend skill"
```

---

### Task 37: /dw-lifecycle:teardown

- [ ] **Step 1: Write `skills/teardown/SKILL.md`**

```markdown
---
name: dw-lifecycle:teardown
description: "Remove branch + worktree (infrastructure-only)"
user_invocable: true
---

# /dw-lifecycle:teardown

Remove the feature's branch + worktree. Pure infrastructure cleanup — no opinion on whether the feature is complete.

## Steps

1. Confirm slug.
2. Confirm with operator: "This will delete the branch `feature/<slug>` and remove the worktree at `<path>`. Continue?" (Destructive action; explicit confirmation required.)
3. Invoke `superpowers:using-git-worktrees`'s teardown helpers:

```
git worktree remove <worktree-path>
git branch -D feature/<slug>
```

4. Report: removed branch + worktree path. Suggest `/dw-lifecycle:complete` was already run if docs should have been moved (this skill does NOT move docs).

## Error handling

- **Worktree has uncommitted changes.** Surface; refuse to remove. Operator pushes/discards before re-running.
- **Operator declines confirmation.** Stop, no changes.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/teardown/SKILL.md
git commit -m "feat(dw-lifecycle/skills): teardown skill"
```

---

### Task 38: /dw-lifecycle:session-start

- [ ] **Step 1: Write `skills/session-start/SKILL.md`**

```markdown
---
name: dw-lifecycle:session-start
description: "Bootstrap session: read workplan + journal + open issues; report context"
user_invocable: true
---

# /dw-lifecycle:session-start

Bootstrap a session. Reads the active feature's workplan, last journal entry, and open issues; reports context.

## Steps

1. Identify the active feature from worktree name + branch.
2. Read `config.session.start.preamble` from `.dw-lifecycle/config.json` (project-specific bootstrap text — e.g., "check the Grafana dashboard before coding"). Display it.
3. Read the feature's `README.md` (status table, current phase) and `workplan.md` (next unchecked task).
4. Read the latest entry from `DEVELOPMENT-NOTES.md` referencing this slug.
5. Run `gh issue list --state open --search <slug>` to surface relevant issues.
6. Report context to the operator. Do NOT start work until they confirm the session goal.

## Error handling

- **Not on a feature branch.** Skill prompts: "Current branch is `main` (or other non-feature branch). Switch to a feature worktree before continuing."
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/session-start/SKILL.md
git commit -m "feat(dw-lifecycle/skills): session-start skill"
```

---

### Task 39: /dw-lifecycle:session-end

- [ ] **Step 1: Write `skills/session-end/SKILL.md`**

```markdown
---
name: dw-lifecycle:session-end
description: "Append journal entry; update feature docs; commit documentation changes"
user_invocable: true
---

# /dw-lifecycle:session-end

Wrap up a session. Append a structured journal entry, update feature docs, commit documentation changes.

## Steps

1. Identify active feature.
2. Update `<feature-dir>/README.md` status table (check off completed acceptance criteria, update phase status).
3. Update `<feature-dir>/workplan.md` (check off completed task steps).
4. Compose journal entry following the canonical format:

```markdown
## YYYY-MM-DD: [Session Title]
### Feature: [slug]
### Worktree: [name]

**Goal:** ...
**Accomplished:** ...
**Didn't Work:** ...
**Course Corrections:** ...
**Quantitative:** ...
**Insights:** ...
```

5. Append the entry via the helper:

```
dw-lifecycle journal-append --file <entry.md>
```

6. Read `config.session.end.preamble` and display any project-specific wrap-up text.
7. Commit all documentation changes:

```
git add <feature-dir> DEVELOPMENT-NOTES.md
git commit -m "docs: session-end <YYYY-MM-DD> [<slug>]"
```

8. Report: commit hash, files changed, journal-entry summary.

## Error handling

- **Uncommitted code changes outside docs.** Skill warns: "There are non-doc changes uncommitted. Commit those separately first to keep the session-end commit doc-only."
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/session-end/SKILL.md
git commit -m "feat(dw-lifecycle/skills): session-end skill"
```

---

### Task 40: /dw-lifecycle:doctor

- [ ] **Step 1: Write `skills/doctor/SKILL.md`**

```markdown
---
name: dw-lifecycle:doctor
description: "Audit binding metadata across calendar/journal/docs/issues; opt-in --fix"
user_invocable: true
---

# /dw-lifecycle:doctor

Read-only audit (default) or opt-in repair (`--fix=<rule>`) of binding metadata.

## Steps

1. Shell out to the helper:

```
dw-lifecycle doctor [--fix=<rule>] [--yes]
```

The helper runs all rules:
- `missing-config` — no `.dw-lifecycle/config.json`
- `peer-plugins` — `superpowers` (required) or `feature-dev` (recommended) missing
- `version-shape-drift` — `docs/<v>/<status>/<slug>/` directories present for versions not in `config.docs.knownVersions`
- `orphan-feature-doc` — directory in `inProgress` with no matching workplan
- `stale-issue` — GitHub issue closed but feature still in `inProgress`
- `journal-feature-mismatch` — journal entry references a slug with no doc directory

2. Display findings grouped by severity (error / warning).
3. For `--fix=<rule>`, prompt operator before each repair (unless `--yes`).

## Error handling

- **`--fix=<unknown-rule>`.** List available rules and stop.
- **No findings.** Report `no findings` and exit 0.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/doctor/SKILL.md
git commit -m "feat(dw-lifecycle/skills): doctor skill"
```

---

### Task 41: /dw-lifecycle:help

- [ ] **Step 1: Write `skills/help/SKILL.md`**

```markdown
---
name: dw-lifecycle:help
description: "Render lifecycle diagram + current state of active features"
user_invocable: true
---

# /dw-lifecycle:help

Show the lifecycle diagram and current state. Read-only; does not start any work.

## Steps

1. Render the lifecycle diagram:

```
/dw-lifecycle:install   Bootstrap config in host project
        |
        v
/dw-lifecycle:define    Interview to capture problem/scope/approach/tasks
        |
        v
/dw-lifecycle:setup     Create branch, worktree, version-aware docs
        |
        v
/dw-lifecycle:issues    Create GitHub parent + phase issues
        |
        v
/dw-lifecycle:implement Walk workplan tasks via subagents
        |
        v
/dw-lifecycle:review    Delegate code review (feature-dev's reviewer)
        |
        v
/dw-lifecycle:ship      Verify + open PR (stop at PR; operator merges)
        |
        v
/dw-lifecycle:complete  Move docs to complete-dir, close issues
        |
        v
/dw-lifecycle:teardown  Remove branch + worktree
```

2. Walk `docs/<version>/<inProgress>/*` and list active features with phase + last-touched dates.
3. List open dw-lifecycle-related GitHub issues across the repo.

## Error handling

- **No config.** Suggest `/dw-lifecycle:install` to bootstrap.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/skills/help/SKILL.md
git commit -m "feat(dw-lifecycle/skills): help skill"
```

---

### Task 42: Phase 5 verification

- [ ] **Step 1: List all 15 SKILL.md files**

Run: `ls plugins/dw-lifecycle/skills/*/SKILL.md | wc -l`
Expected: `15`

- [ ] **Step 2: Verify plugin loads**

Run: `claude plugin install --marketplace $(pwd)`
Expected: dw-lifecycle plugin shows all 15 skills loaded; no parsing errors.

- [ ] **Step 3: No commit (verification)**

---

## Phase 6 — Release prep (T43–T46)

### Task 43: README

**Files:**
- Modify: `plugins/dw-lifecycle/README.md`

- [ ] **Step 1: Replace stub README**

Write a real README covering:
- One-paragraph elevator pitch
- Install instructions (the marketplace path — verbatim from the public docs, NOT invented)
- Peer plugin requirements (superpowers required, feature-dev recommended)
- Slash command list with one-line each
- Config schema overview pointing at `design.md` for full
- Boundary contract summary (the canonical-vs-tailored line)
- Link to design and workplan in `docs/1.0/001-IN-PROGRESS/dw-lifecycle/`
- Status: under-development; this is v0.1.0

(Aim ~150–250 lines; this is the adopter-facing landing page.)

- [ ] **Step 2: Commit**

```bash
git add plugins/dw-lifecycle/README.md
git commit -m "docs(dw-lifecycle): adopter-facing README"
```

---

### Task 44: Smoke test script

**Files:**
- Create: `scripts/smoke-dw-lifecycle.sh`

- [ ] **Step 1: Write the smoke script**

```bash
#!/usr/bin/env bash
# Local smoke test for dw-lifecycle. Not in CI per the deskwork repo's
# no-CI-testing rule. Run before tagging a release.

set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
TMP=$(mktemp -d)
WORKTREE_PARENT="$(dirname "$TMP")"
WORKTREE_NAME="$(basename "$TMP")-smoke-feature"
WORKTREE="$WORKTREE_PARENT/$WORKTREE_NAME"

cleanup() {
  if [ -d "$WORKTREE" ]; then
    git -C "$TMP" worktree remove "$WORKTREE" --force 2>/dev/null || true
    rm -rf "$WORKTREE"
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "== smoke: setup temp repo =="
cd "$TMP"
git init -b main
git commit --allow-empty -m "init"

echo "== smoke: install =="
"$ROOT/plugins/dw-lifecycle/bin/dw-lifecycle" install "$TMP"
test -f "$TMP/.dw-lifecycle/config.json" || { echo "FAIL: config not written"; exit 1; }

echo "== smoke: setup =="
"$ROOT/plugins/dw-lifecycle/bin/dw-lifecycle" setup smoke-feature --target 1.0 --title "Smoke"
test -f "$WORKTREE/docs/1.0/001-IN-PROGRESS/smoke-feature/prd.md" || { echo "FAIL: prd.md missing"; exit 1; }
test -f "$WORKTREE/docs/1.0/001-IN-PROGRESS/smoke-feature/workplan.md" || { echo "FAIL: workplan.md missing"; exit 1; }

echo "== smoke: transition =="
"$ROOT/plugins/dw-lifecycle/bin/dw-lifecycle" transition smoke-feature --from inProgress --to complete --target 1.0
test -d "$WORKTREE/docs/1.0/003-COMPLETE/smoke-feature" || { echo "FAIL: not transitioned"; exit 1; }
test ! -d "$WORKTREE/docs/1.0/001-IN-PROGRESS/smoke-feature" || { echo "FAIL: source still present"; exit 1; }

echo "== smoke: doctor =="
"$ROOT/plugins/dw-lifecycle/bin/dw-lifecycle" doctor "$TMP" || true  # exit 1 expected if no peer plugins detected

echo "== smoke: PASS =="
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/smoke-dw-lifecycle.sh`

- [ ] **Step 3: Run it**

Run: `./scripts/smoke-dw-lifecycle.sh`
Expected: prints `== smoke: PASS ==` at end.

- [x] **Step 4: Commit**

```bash
git add scripts/smoke-dw-lifecycle.sh
git commit -m "test(dw-lifecycle): local smoke test script"
```

---

### Task 45: Update README status section + close acceptance items

**Files:**
- Modify: `docs/1.0/001-IN-PROGRESS/dw-lifecycle/README.md`

- [ ] **Step 1: Read the existing README (created by /dw-lifecycle:setup or hand-written)**

If no README exists yet, scaffold one matching the existing /feature-* convention with:
- Status table
- Phase status (1–6 from this workplan)
- Links to PRD (design.md), workplan
- Parent issue link (filled in by issues subcommand or manually)

- [ ] **Step 2: Update phase status**

Mark Phases 1–6 as Complete on the README phase-status table.

- [ ] **Step 3: Commit**

```bash
git add docs/1.0/001-IN-PROGRESS/dw-lifecycle/README.md
git commit -m "docs(dw-lifecycle): mark Phases 1-6 complete in README"
```

---

### Task 46: v0.1.0 release-readiness audit (gated on deskwork#81)

This task does NOT cut the release. It verifies all v0.1.0 acceptance criteria pass and surfaces any remaining blockers. The actual release ceremony happens after audiocontrol-org/deskwork#81 (empty-`vendor/` packaging regression) is resolved upstream.

- [ ] **Step 1: Run the v0.1.0 acceptance checklist from `design.md` §9**

For each item in the design doc's acceptance criteria, verify:
- All 15 slash commands exist as `SKILL.md` files: `ls plugins/dw-lifecycle/skills/*/SKILL.md | wc -l` → 15
- Each skill conforms to the integration map (manual review of each SKILL.md against design.md §3)
- `bin/dw-lifecycle` implements all six subcommands: `bin/dw-lifecycle 2>&1 | grep -E 'install|setup|issues|transition|journal-append|doctor'`
- Config schema implemented: `npm test -- config`
- All vitest tests pass: `npm test`
- Smoke test passes: `./scripts/smoke-dw-lifecycle.sh`
- `plugin.json`, `marketplace.json` entry, README all exist
- Plugin loads cleanly via `claude plugin install --marketplace .`

- [ ] **Step 2: Check #81 status**

Run: `gh issue view 81 --repo audiocontrol-org/deskwork --json state`
Expected: `OPEN` blocks the release. `CLOSED` allows it (verify the closing fix actually populated `vendor/` in a v0.8.x patch release).

- [ ] **Step 3: If #81 still open, stop and surface blocker**

Report: "v0.1.0 ready for release except for upstream blocker deskwork#81. Hold tag until #81 is fixed and the release pipeline is verified."

- [ ] **Step 4: If #81 closed, proceed to tag**

Per deskwork's existing release process (see `RELEASING.md` in repo root):

```bash
npm run version:bump 0.1.0   # if the repo has a unified bump script
git add -A
git commit -m "release(dw-lifecycle): v0.1.0"
git tag dw-lifecycle-v0.1.0
git push origin feature/deskwork-dw-lifecycle --tags
```

(Verify against `RELEASING.md` — do NOT invent commands. Read the docs first per agent-discipline.md.)

- [ ] **Step 5: Open PR for the feature branch**

```bash
gh pr create \
  --base main \
  --title "feat(dw-lifecycle): v0.1.0 — project lifecycle orchestration plugin" \
  --body "$(cat <<'EOF'
## Summary

Initial release of dw-lifecycle, a project-lifecycle orchestration plugin that composes superpowers (process disciplines) and feature-dev (specialist agents) instead of duplicating their practices.

15 slash commands, 1 bin (six subcommands), 4 templates, full vitest suite passing, local smoke script verified.

See \`docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md\` for the full design.

## Acceptance criteria

All v0.1.0 items in design.md §9 met.
deskwork#81 (release-pipeline blocker) verified resolved.

## Phase 2 follow-up

Dogfood the plugin inside this repo's own development. In-tree \`/feature-*\` skills stay in place as fallback until two consecutive features are driven through dw-lifecycle end-to-end.
EOF
)"
```

- [ ] **Step 6: Stop. Operator owns the merge.**

Per the agent-discipline.md "operator-owns-merge" rule.

---

## Self-review

After writing, I ran the four-check spec self-review:

**1. Spec coverage:** Mapped each section in `design.md` to tasks in the plan:
- §2 architecture → Task 5 (marketplace registration verifies the layered shape loads)
- §3 integration map → Tasks 27–41 (one task per skill, each cites the right superpowers/feature-dev hooks)
- §4 parameterization → Tasks 7 (config), 14 (docs), 16 (templates)
- §5 packaging → Tasks 1–5
- §6 migration → Out of scope for this plan (Phase 2/3/4 of the rollout happen AFTER v0.1.0 ships)
- §7 edge cases → Tasks 9 (install refuses overwrite), 11 (doctor peer-plugins), 17 (setup version-dir creation), 22 (transitions), each subcommand's error handling
- §9 acceptance → Task 46

No spec gaps found.

**2. Placeholder scan:** No "TBD" / "TODO" / "fill in details" found. The Author's note in Task 32 is an honest open question (review skill carve-out for feature-dev) — flagged for operator decision, not a placeholder.

**3. Type consistency:** `Stage` type used consistently across `docs.ts`, `transitions.ts`, subcommands. `Config` type sourced from `config.types.ts` everywhere. Function names match across tasks (`parseFrontmatter`, `writeFrontmatter`, `parseWorkplan`, `markStepDone`, `transitionFeature`, `appendJournalEntry`, `createParentIssue`, `createPhaseIssues`).

**4. Ambiguity:** Task 32's `code-reviewer` carve-out (treating feature-dev as required for `/dw-lifecycle:review` specifically) is flagged as needing operator decision. Otherwise no ambiguities — all error handling is explicit.

---

## Execution handoff

Plan complete and saved to `docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Uses `superpowers:subagent-driven-development`.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
