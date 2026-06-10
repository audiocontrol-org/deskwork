---
name: inbox
description: "Low-friction insight capture for the governed design inbox: capture an out-of-sequence idea in ONE move mid-thread (capture ≠ scope), then triage in a separate deliberate pass — promote (record a graduation target, reuse existing creators) or drop (record a reason). List entries; keep lean with curate/archive. Dry-run first, --apply to write. Wraps `stackctl inbox`."
---

# /stack-control:inbox

Capture and triage out-of-sequence design ideas against a governed `DESIGN-INBOX.md`. This is the **native** capture mechanism — it replaces the interim hand-append convention (`.claude/rules/design-inbox.md`, retired when this shipped). There is exactly **one** capture mechanism and **one** inbox source of truth.

**Which inbox `--doc` targets:** when `--doc` is omitted, the verb resolves the enclosing **stack-control installation** — the nearest ancestor with a `.stack-control/config.yaml` — and operates on its configured inbox (009 read-side wiring; this is the landing of `design:gap/project-relative-doc-discovery`). Run [`/stack-control:setup`](../setup/SKILL.md) once to create an installation. If the installation's inbox is missing, it is **auto-scaffolded on first use** (announced, empty-but-valid). Outside any installation the verb **fails loud** directing you to `stackctl setup` — there is no bundled-copy fallback. `--doc <path>` (or the `STACKCTL_INBOX_DEFAULT_DOC` seam) still overrides resolution for an explicit, one-off target.

Every mutation re-validates the whole governed document before any write and is **zero-write-on-failure** — a duplicate title or structural violation is refused leaving the inbox byte-for-byte unchanged. No more raw hand-edits that corrupt the inbox undetected.

> Per `.claude/rules/enforcement-lives-in-skills.md`, the capture discipline lives in this skill body + the `stackctl inbox` verb it calls — not in a separate rule or git hook.

## The discipline (why this exists)

Low-friction insight capture is a direct expression of the stack-control thesis — *invest heavily in up-front design and tooling; industrialize execution*. Design and scoping are **not serial**; capturing an idea must never require finishing the current thread.

1. **Capture is instant and one-move.** When an out-of-sequence design idea surfaces mid-thread, capture it in one action and return to what you were doing. Do **not** stop the current thread to scope it.
2. **Capture ≠ scope.** The inbox is a pre-triage parking lot. **Triage is a separate, deliberate pass** (`promote` / `drop`) that graduates an entry or drops it with a reason. Never let "capture this" expand into "scope this now."
3. **Hold multiple threads at once.** Several captured ideas living simultaneously is fine and expected; capturing one never disturbs the others.
4. **Promote records, it does not create.** `promote --to <ref>` records a graduation target (a spec dir, roadmap id, or issue ref) and sets status `promoted`. It does **not** create or validate the target — creating it is a separate step via the existing creators (`stackctl roadmap add`, `gh issue create`, `/speckit-specify`). Record-and-reuse keeps capture/triage decoupled from the target-creation subsystems.
5. **Default to capturing.** If unsure whether an idea is in scope, capture it and keep going. Captures are append-only and cheap; a lost insight is not.

## Capture (one move, mid-thread)

Dry-run first is optional for capture — it is a single fail-safe append — but `--apply` is required to write:

```bash
plugins/stack-control/bin/stackctl inbox capture "<title>" \
  --idea "<the idea>" \
  [--surfaced "<when/where it came up>"] \
  [--context "<background>"] \
  [--home "<provisional home>"] \
  [--doc <path>] --apply
```

- `<title>` becomes the entry identifier (must be unique; non-empty). `--idea` is required (non-empty).
- A duplicate title, empty title, or empty idea is refused (exit 2) with the inbox unchanged.

## Triage (a separate, deliberate pass)

```bash
# Promote — record the graduation target (does NOT create it):
plugins/stack-control/bin/stackctl inbox promote "<title>" --to "<spec|roadmap-id|issue-ref>" [--doc <path>] --apply

# Drop — record why:
plugins/stack-control/bin/stackctl inbox drop "<title>" --reason "<why>" [--doc <path>] --apply
```

- `promote`/`drop` are valid only from a `captured` entry. An absent or already-terminal entry is refused (exit 2, zero write).
- After `promote`, create the target separately (`roadmap add` / issue / spec) — the verb only recorded the linkage.
- **Canonical recording form:** `promote` records the graduation target as a `- **Promoted-to:** <ref>` body line and `drop` records a `- **Drop-reason:** <reason>` line — a machine-greppable body bullet (research D2), distinct from the entry's status bullet. Some pre-native migrated entries record the target *inline* on the status line (`- **Status:** **promoted** → <ref>`); that inline form is legacy. New code reads the `Promoted-to:`/`Drop-reason:` bullets as canonical.
- Scalar field values (`<title>`, `--idea`, `--surfaced`, `--context`, `--home`, `--to`, `--reason`) must be single-line — a value containing a newline is refused (exit 2, zero write) to prevent a `### ` heading from injecting a phantom entry.

## List

```bash
plugins/stack-control/bin/stackctl inbox list [--doc <path>]
```

Read-only — prints each entry's identifier + status. Never writes.

## Lean-keeping (reuse, not new code)

Terminal (`promoted`/`dropped`) entries are cleared from the live inbox with the **existing generic** document verbs — the inbox is just another governed document:

```bash
/stack-control:curate     # reorder + archive terminal entries
/stack-control:archive    # move terminal entries to DESIGN-INBOX-archive.md (+ ledger)
/stack-control:unarchive  # restore one by identifier
```

History is preserved — archived entries move to the sibling archive file + ledger and are recoverable. Nothing is destroyed.

## Fail-loud cases (exit 2, zero writes)

- Inbox missing or not governable → descriptive error (never auto-create/repair).
- Duplicate / empty title, or empty idea on capture.
- `promote`/`drop` of an absent or already-terminal entry; `promote` without `--to`, `drop` without `--reason`.
- Any whole-document validation failure during `--apply` → the inbox is left byte-for-byte unchanged.
