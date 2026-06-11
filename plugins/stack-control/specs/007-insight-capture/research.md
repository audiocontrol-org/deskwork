# Phase 0 Research: Low-friction insight capture

All decisions are grounded in concrete existing instances in `plugins/stack-control` (Principle II, Integration-First). No `NEEDS CLARIFICATION` remain — the spec's forks were resolved in `/speckit-clarify`; the items below resolve the *mechanism* against the real code.

## D1 — Capture mirrors the `roadmap add` mutation (add-time re-validation, zero-write-on-failure)

- **Decision**: Implement `capture` exactly like `roadmap add` (`src/roadmap/mutations.ts:131`): build a candidate document string (append a new `### <title>` section to the loaded source), then call `loadDocumentFromSource(candidate, docPath, opts)` to **re-validate the whole governed document**, and only on success `writeFileSync(docPath, candidate, 'utf8')`. A validation failure throws `DocumentModelError` *before* any write, leaving the file byte-for-byte unchanged.
- **Rationale**: This is precisely FR-003 (validate-then-write, no partial/dangling entry) and the fix for the hand-edit gap. The pattern is proven on the live ROADMAP and has tests asserting zero-write-on-failure.
- **Alternatives rejected**: (a) raw file append — the current bug (no validation; corruption surfaces only on next load); (b) append-then-validate-after-write — not zero-write; a bad entry lands then errors.

## D2 — Reuse the `design-inbox` grammar unchanged; record the promote target as a body line, NOT an edge

- **Decision**: No grammar change. `grammars/design-inbox.peg` already declares `statusVocabulary: [captured, promoted, dropped]` and `terminalStatuses: [promoted, dropped]`, with the body as free markdown (no `edgeFields`). The promote **target reference** is written as a plain body line (e.g. `- promoted-to: <ref>`), not a declared edge.
- **Rationale**: FR-014 is *record linkage, don't validate/create*. An edge field would trigger the engine's referential-integrity check against the inbox's *own* units (the target is a roadmap/spec/issue id that does not exist in the inbox) → wrong failure. A recorded body line is machine-greppable and correct for "record, reuse creators."
- **Alternatives rejected**: declaring a `target`/`promoted-to` edge field (would mis-fire referential integrity); unifying inbox+roadmap into one store (explicitly out, FR-012).

## D3 — Promote / drop mirror the `advance` status-rewrite

- **Decision**: `promote` and `drop` follow `roadmap advance` (`mutations.ts:162`): load the doc, locate the target entry, rewrite its status bullet (`captured → promoted | dropped`), append the target reference (promote) or reason (drop) to the entry body, then re-validate the whole doc and write atomically. Refuse (exit 2, zero write) if the entry is absent or already terminal.
- **Rationale**: Same proven, zero-write engine path; satisfies FR-007.
- **Note**: the design-inbox status line is grammar-specific (`- **Status:** **<status>** …`), unlike roadmap's `- status:`. The mutation rewrites the design-inbox-shaped bullet (read how `statusOf` parses it in `design-inbox.peg`). This is a known per-grammar detail to cover in a RED test.

## D4 — Lean-keeping reuses the existing generic `curate` / `archive` / `unarchive`

- **Decision**: Do NOT reimplement lean-keeping. The existing `curate`/`archive`/`unarchive` verbs already operate on any governed doc (they key off `terminalStatuses`), so a `promoted`/`dropped` inbox entry is archived by the existing `archive`/`curate` against `DESIGN-INBOX.md` — moving it to `DESIGN-INBOX-archive.md` + ledger, preserving history (FR-008, SC-005).
- **Rationale**: Composition over new infrastructure (Principle VI); these are tested generic primitives.
- **Alternatives rejected**: an inbox-specific archive path (duplicates a generic capability).

## D5 — Verb shape: `stackctl inbox <subaction>` mirroring `stackctl roadmap`

- **Decision**: One `inbox` verb registered in `src/cli.ts` `SUBCOMMANDS`, with subactions `capture`, `promote`, `drop`, `list`. Dry-run by default; `--apply` writes (mirrors roadmap). Exit `0` success, `2` usage/validation/fatal (catch `DocumentModelError` → exit 2). Unknown flags rejected (mirror roadmap's `validateFlags`, AUDIT-20260608-13).
- **Rationale**: Symmetry with the established `roadmap` verb is discoverable and consistent; the thin-verb + mutation-module split keeps both files under the cap.
- **Alternatives**: a top-level `stackctl capture` verb (+ separate `inbox` for triage). Recorded as an open structure choice in the plan; the mutation core is identical, so the operator can redirect cheaply.

## D6 — Retire the interim convention (US3) without re-forking

- **Decision**: On ship, delete `.claude/rules/design-inbox.md` and the docs-tree pointer `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/design-inbox.md`, and repoint any cross-references (README, other rules) to the `inbox` verb. The `generality.test.ts` T038 source-mirror coupling was already removed (it reads a frozen baseline, not the docs source), so retirement does not break it.
- **Rationale**: FR-011 / SC-004 — exactly one capture mechanism, one source of truth. Per the project's content-preserves rule, the prose is preserved in git history; the governed `DESIGN-INBOX.md` carries all entries.
- **Alternatives rejected**: leaving the rule as "advisory" (re-creates the two-mechanisms risk this feature exists to remove).

## D7 — Concurrency posture for v1

- **Decision**: Each mutation is a single synchronous read → validate → atomic `writeFileSync`. Concurrent captures are **last-writer-wins at the file level** — the same guarantee `roadmap add` already provides — with each individual write atomic and validated. No cross-process lock in v1.
- **Rationale**: Matches the existing engine; over-building a lock is speculative (Principle II). The realistic usage (one operator/agent session) does not contend.
- **Follow-up (not v1)**: if real contention appears, a file-lock or compare-and-swap is a fast-follow — captured as a future concern, not built now.

## D8 — Test strategy (RED-first)

- **Decision**: Mutation unit tests call `capture`/`promote`/`drop` directly against tmp-copied committed fixtures (`tests/inbox/fixtures/`); verb tests invoke the CLI end-to-end via `runCli` (`spawnSync` through `bin/stackctl`). Each behavior (happy path, duplicate-title refusal + zero-write, absent-entry refusal, terminal-entry refusal, empty-idea refusal) gets a failing test first.
- **Rationale**: Principle I; mirrors `tests/roadmap/mutations-add.test.ts` + `verb-add.test.ts`.
