# Quickstart: Low-friction insight capture

Runnable validation scenarios that prove the feature end-to-end. Run from the repo root against a throwaway copy of the governed inbox (so the real `DESIGN-INBOX.md` is untouched), or against a tmp fixture. The bin is `plugins/stack-control/bin/stackctl`. See [contracts/inbox-cli.md](./contracts/inbox-cli.md) and [data-model.md](./data-model.md) for details.

> Setup: copy the governed inbox to a scratch path and point `--doc` at it.
> `cp plugins/stack-control/DESIGN-INBOX.md /tmp/$$-inbox.md` (or use a `tests/inbox/fixtures/*.md`).

## Scenario 1 — Safe one-move capture (US1; SC-001, SC-002, SC-003)

1. **Capture** an idea in one move:
   `stackctl inbox capture "Try a TUI inbox view" --idea "A terminal browser for inbox entries" --doc <scratch> --apply`
   - **Expect**: exit 0, "captured …"; a new `### Try a TUI inbox view` entry with status `captured`; `stackctl inbox list --doc <scratch>` shows it.
2. **Validation guard** — attempt a duplicate-title capture:
   `stackctl inbox capture "Try a TUI inbox view" --idea "dup" --doc <scratch> --apply`
   - **Expect**: exit 2, descriptive error; the inbox is **byte-for-byte unchanged** (SC-002 — a malformed/duplicate capture can never land).
3. **Dry-run writes nothing**:
   `stackctl inbox capture "Another idea" --idea "x" --doc <scratch>` (no `--apply`)
   - **Expect**: exit 0, "would capture …"; inbox unchanged.

## Scenario 2 — Triage & graduation (US2; SC-005)

1. **Promote** the captured entry to a roadmap target:
   `stackctl inbox promote "Try a TUI inbox view" --to "multi:gap/inbox-tui" --doc <scratch> --apply`
   - **Expect**: exit 0; status `promoted`; the target reference recorded in the entry body. (No roadmap item is created here — that is a separate `roadmap add`.)
2. **Drop** another entry with a reason:
   `stackctl inbox drop "Some stale idea" --reason "superseded by X" --doc <scratch> --apply`
   - **Expect**: exit 0; status `dropped`; the reason recorded.
3. **Refusals** (fail-loud):
   - promote/drop a non-existent title → exit 2, zero write.
   - promote/drop an already-terminal entry → exit 2, zero write.
4. **Lean-keeping** (existing generic verbs):
   `stackctl archive --doc <scratch> --apply`
   - **Expect**: the `promoted`/`dropped` entries move to `<scratch>`'s sibling archive file + ledger and leave the live inbox; `stackctl unarchive --doc <scratch> --id "Try a TUI inbox view"` restores one (SC-005 — lean with zero history loss).

## Scenario 3 — One mechanism, one source of truth (US3; SC-004)

After the feature ships:
- **Expect**: `.claude/rules/design-inbox.md` and the docs-tree pointer `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/design-inbox.md` are removed; the only documented capture path is `stackctl inbox capture`.
- **Expect**: there is exactly one inbox source of truth (the governed `DESIGN-INBOX.md`); no parallel hand-append convention remains.

## Regression guard

- The full suite stays green: `npm --workspace @deskwork/... test` (or `npx vitest run` in the plugin) — including the new `tests/inbox/*` RED-first tests and the existing `generality.test.ts` (which no longer reads the retired source).
- `tsc --noEmit` strict clean; no `any`/`as`/`@ts-ignore`; new modules ≤ 500 lines.
