---
title: Command shortcuts — design spec
slug: command-shortcuts
date: 2026-05-11
status: draft
deskwork:
  doc: design-spec
---

# Command shortcuts — design

## Problem

Claude Code requires plugin commands as `/<plugin>:<command>` (e.g.
`/dw-lifecycle:implement`). The docs claim the prefix is optional when there
are no collisions, but in practice it is always required — see upstream
issues:

- [anthropics/claude-code#15882](https://github.com/anthropics/claude-code/issues/15882) — plugin commands are always namespaced (doc contradiction)
- [anthropics/claude-code#23589](https://github.com/anthropics/claude-code/issues/23589) — feature request: shorthand aliases

For `dw-lifecycle` specifically (16 commands, daily use across active feature
work), the `/dw-lifecycle:` prefix is friction-heavy. The working workaround
documented in the pasted problem brief is user-level shim files at
`~/.claude/commands/<name>.md` whose body is `/dw-lifecycle:<command> $ARGUMENTS`
— Claude Code surfaces those as `/<name>` slash commands that forward to the
namespaced form.

This feature ships that workaround as an explicit, opt-in dw-lifecycle skill so
operators don't have to author the shims by hand.

## Scope

### In

- New skill `/dw-lifecycle:install-shortcuts` (`plugins/dw-lifecycle/skills/install-shortcuts/SKILL.md` + matching `commands/install-shortcuts.md`).
- CLI subcommand `dw-lifecycle install-shortcuts` doing the file work.
- Three naming-scheme options offered to the operator at install time (see § Approach).
- Collision detection against existing `~/.claude/commands/*.md`.
- Manifest file at `~/.claude/commands/.dw-lifecycle-shortcuts.json` recording scheme + shim paths + plugin version, so the operator (or the companion uninstall skill) can roll the install back cleanly.
- Companion skill `/dw-lifecycle:uninstall-shortcuts` and CLI subcommand `dw-lifecycle uninstall-shortcuts`. Manifest-driven; refuses to remove shims whose contents drifted (with `--force-uninstall` to override).
- One-line hint in the existing `/dw-lifecycle:install` skill's final report nudging the operator toward `install-shortcuts`. Non-breaking.

### Out (deferred or rejected)

- **Shortcuts for `deskwork` and `deskwork-studio`.** Deferred until the dw-lifecycle pattern is validated by daily use. Re-evaluate after this feature ships.
- **Inner command renames** (workaround #3 from the problem brief — e.g. renaming `implement` → `i`). Separate concern; defer to a follow-up if shims aren't enough on their own.
- **First-class alias mechanism.** Waiting on Claude Code [#23589](https://github.com/anthropics/claude-code/issues/23589); when it lands, this feature retires.
- **Per-project (rather than per-user) shims.** `~/.claude/commands/` is user-global by design; `~/.claude/commands/` is the only place Claude Code reads user-level commands from. A per-project scoping would require a different Claude Code feature.
- **CI test infrastructure.** Per the deskwork rule *"No test infrastructure in CI."* Local vitest only.

## Approach

### Skill flow

`/dw-lifecycle:install-shortcuts` walks the operator through:

1. Show the three naming schemes (terminal table) with example mappings:
   - **A — 2-letter `dw<initial>`** — terse; ~half of the 16 commands need disambiguation suffixes for unique initials. Examples: `dwi` (implement), `dws` (setup), `dwsh` (ship), `dwss` (session-start), `dwse` (session-end), `dwd` (define), `dwdo` (doctor), `dwc` (customize), `dwco` (complete), `dwe` (extend), `dwh` (help), `dwin` (install), `dwis` (issues), `dwp` (pickup), `dwr` (review), `dwt` (teardown). The full table is canonicalized in `schemes.ts`.
   - **B — 3-letter `dw-<2-char>`** — regular pattern, zero collisions, hyphen makes the prefix readable. Examples: `dw-im`, `dw-se`, `dw-de`, `dw-sh`, `dw-ss`, `dw-en`, `dw-cu`, `dw-co`, `dw-do`, `dw-ex`, `dw-he`, `dw-in`, `dw-is`, `dw-pi`, `dw-re`, `dw-te`.
   - **C — `dw-<verb>`** — verbose, zero collisions, self-documenting. Examples: `dw-implement`, `dw-setup`, `dw-define`, `dw-ship`, `dw-session-start`, `dw-session-end`, `dw-customize`, `dw-complete`, `dw-doctor`, `dw-extend`, `dw-help`, `dw-install`, `dw-issues`, `dw-pickup`, `dw-review`, `dw-teardown`. **Default scheme** — preserves discoverability.
2. Operator picks A, B, or C (default: C).
3. Skill invokes the CLI helper:
   ```bash
   dw-lifecycle install-shortcuts --scheme=<A|B|C> [--force] [--dry-run]
   ```
4. CLI probes `~/.claude/commands/` for collisions against the chosen scheme. If any exist (and `--force` is not set), it lists them, declines to overwrite, and exits non-zero. Operator re-runs with `--force` (overwrite) or `--rename <prefix>` (replace `dw-` / `dw` in the scheme with a different prefix for this install only — manifest records the prefix used).
5. CLI writes the shim files. Each shim's body is exactly:
   ```
   /dw-lifecycle:<command> $ARGUMENTS
   ```
6. CLI writes the manifest at `~/.claude/commands/.dw-lifecycle-shortcuts.json` recording the scheme, each shim's path, and the dw-lifecycle plugin version that wrote them.
7. Skill reports: scheme picked, shims written (or skipped on collision), manifest path, uninstall hint.

`/dw-lifecycle:uninstall-shortcuts` is the inverse: read manifest, verify each shim's content matches what was written (drift detection — operator may have hand-edited), delete shims, delete manifest. `--force-uninstall` overrides drift detection.

### Why three schemes (and not one opinionated default)

The operator picks the tradeoff explicitly because the three schemes optimize for different things — terseness (A), regularity (B), discoverability (C). The skill defaults to C because that's the safest first pick; an operator who wants A or B knows their own ergonomics best. This also means the schemes module ships three tested maps from day one, which gives us coverage for the cases adopters will trip over later.

### Why a separate install skill, not a flag on `/dw-lifecycle:install`

The existing install skill is a project-level bootstrap (writes `.dw-lifecycle/config.json` into the project root). Shortcut installation is a user-level action (writes into `~/.claude/commands/`). Different scopes, different blast radii, different idempotency stories. Folding them into one skill would conflate the two and force every adopter into a shortcut decision at first install. Keeping them separate makes shortcut install opt-in, leaves existing install behavior unchanged, and lets the `install` skill keep its established contract.

## Components

| Unit | Path | Responsibility |
|---|---|---|
| Schemes module | `plugins/dw-lifecycle/src/shortcuts/schemes.ts` | Static map: command → shim name for each of A/B/C. Single source of truth. |
| Install CLI subcommand | `plugins/dw-lifecycle/src/subcommands/install-shortcuts.ts` | Probes collisions; supports `--scheme`, `--force`, `--dry-run`, `--rename`, `--replace`; writes shims + manifest |
| Uninstall CLI subcommand | `plugins/dw-lifecycle/src/subcommands/uninstall-shortcuts.ts` | Reads manifest, drift-checks, removes shims + manifest; supports `--force-uninstall`, `--dry-run` |
| Dispatcher wiring | `plugins/dw-lifecycle/src/cli.ts` | Register the two new subcommands alongside existing ones (`install`, `setup`, `doctor`, …) |
| Install skill | `plugins/dw-lifecycle/skills/install-shortcuts/SKILL.md` + `plugins/dw-lifecycle/commands/install-shortcuts.md` | Operator-facing flow: render scheme table, ask for pick, invoke helper, surface report |
| Uninstall skill | `plugins/dw-lifecycle/skills/uninstall-shortcuts/SKILL.md` + `plugins/dw-lifecycle/commands/uninstall-shortcuts.md` | Manifest-driven removal flow |
| Existing install skill update | `plugins/dw-lifecycle/skills/install/SKILL.md` | One-line nudge in the final report toward `/dw-lifecycle:install-shortcuts` |
| README update | `plugins/dw-lifecycle/README.md` | New "Shortcuts" section: what the three schemes are, how to install/uninstall, manifest location |
| Unit tests | `plugins/dw-lifecycle/src/__tests__/shortcuts.test.ts` | Scheme correctness for all 16 commands × 3 schemes; no-duplicates invariant; manifest round-trip; collision logic; drift detection |
| Integration test | `plugins/dw-lifecycle/src/__tests__/install-shortcuts.smoke.test.ts` | tmp HOME fixture, install + uninstall cycle, collision/force/dry-run, drift refusal |

The shim file format is intentionally tiny (one line) so anyone reading
`~/.claude/commands/dw-implement.md` after the fact sees exactly what the
shortcut does without having to consult the manifest.

## Data flow

```
Operator: /dw-lifecycle:install-shortcuts
   │
   ▼
Skill (SKILL.md prose): render scheme table → operator picks A|B|C
   │
   ▼
CLI: dw-lifecycle install-shortcuts --scheme=<X>
   │
   ▼
Probe ~/.claude/commands/ for collisions
   │  (collisions → list, refuse, exit non-zero unless --force)
   ▼
Write 16 shim .md files + 1 manifest .json
   │
   ▼
Skill reports back: scheme, paths, uninstall hint
```

Per-shim runtime flow (after install):

```
Operator types /dw-implement in any Claude Code session
   │
   ▼
Claude Code reads ~/.claude/commands/dw-implement.md
   │
   ▼
Body: "/dw-lifecycle:implement $ARGUMENTS"
   │
   ▼
Claude Code invokes /dw-lifecycle:implement with the operator's args
```

## Error handling

| Condition | Behavior |
|---|---|
| `~/.claude/commands/` doesn't exist | Create it (operator-owned dir; safe to mkdir -p) |
| Collisions (existing file with target name, no `--force`) | List collisions, refuse, exit 2 |
| Collisions with `--force` | Overwrite; manifest records that this happened |
| Re-run with same scheme | Idempotent: rewrite shims with same content; manifest unchanged |
| Re-run with different scheme | Refuse unless `--replace` is passed; surface a clear message ("scheme X already installed; uninstall first or pass --replace") |
| Uninstall: manifest missing | Exit with "no manifest found; nothing to uninstall" |
| Uninstall: a shim's content drifted from what was installed | Refuse, show diff, suggest `--force-uninstall` |
| Uninstall: a shim is missing from disk | Note in report, continue (operator may have removed it manually) |
| Dry-run (both subcommands) | Print intended changes; touch nothing |

Exit codes follow the deskwork convention: `0` success, `1` runtime failure,
`2` usage/collision error.

## Testing

- **Unit (vitest).** `packages/dw-lifecycle-cli/test/shortcuts.test.ts` covers: the three scheme tables produce the expected shim names for all 16 commands; no duplicates within a scheme; manifest serialization round-trip; collision detector; drift detector.
- **Integration (vitest with tmp fixtures).** `packages/dw-lifecycle-cli/test/install-shortcuts.int.test.ts` runs the install CLI against a fixture `HOME` directory, verifies the right files land on disk, exercises `--force`, `--dry-run`, `--replace`, and the uninstall happy + drift paths.
- **No CI changes.** Per the deskwork rule *"No test infrastructure in CI."* Local `npm --workspace @deskwork/plugin-dw-lifecycle test` is the gate.

## Tasks (high-level)

The phase breakdown that `/dw-lifecycle:setup` will consume:

1. **Schemes module + tests.** Author the static command→shim maps for A/B/C; unit-test correctness, no-duplicates invariant, and full coverage of all 16 commands.
2. **Install CLI helper.** Build `dw-lifecycle install-shortcuts` with `--scheme`, `--force`, `--dry-run`, `--rename`, `--replace`. Manifest writer included.
3. **Uninstall CLI helper.** Build `dw-lifecycle uninstall-shortcuts` with manifest read, drift detection, `--force-uninstall`, `--dry-run`.
4. **Install skill.** Author `SKILL.md` + `commands/install-shortcuts.md` to render the scheme table and invoke the helper.
5. **Uninstall skill.** Author `SKILL.md` + `commands/uninstall-shortcuts.md`.
6. **Install-skill nudge.** Add the one-line hint in the existing `/dw-lifecycle:install` skill's final report.
7. **README update.** New "Shortcuts" section in `plugins/dw-lifecycle/README.md`.
8. **Integration tests.** Full install + uninstall fixture coverage.
9. **Manual dogfood.** Run `/dw-lifecycle:install-shortcuts` against this repo's `~/.claude/commands/`, exercise three random shortcuts, run uninstall, confirm clean state. File any friction as bugs.

## Open questions

None blocking. The "dw-only-for-now" scope decision can be revisited after the
feature ships and proves the pattern.
