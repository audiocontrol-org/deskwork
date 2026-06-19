# Contract: Roadmap Edge-Mutation & Marker Verbs

**Feature**: `028-front-door-completeness` | **Phase**: 1 | Satisfies FR-014/015/016/017; SC-002/003.

New sub-actions on the existing `roadmap` verb (`src/subcommands/roadmap.ts`, mounted
on commander via `src/subcommands/roadmap-command.ts`), backed by
`src/roadmap/mutations.ts` (the candidate-then-validate-then-write engine) and
`src/roadmap/roadmap-model.ts` (the typed `WorkItem` graph). Every mutation is
dry-run-by-default with `--apply`, and re-validates the whole graph (no
cycle/dangling/duplicate) — zero-write on a violation (the existing `mutations.ts`
invariant).

---

## RM1 — Edge mutation (FR-014)

**Signatures.**
- `stackctl roadmap add-edge <from> --field <depends-on|part-of|deferred-until> --to <target> [--apply]`
- `stackctl roadmap remove-edge <from> --field <field> --to <target> [--apply]`
- `stackctl roadmap move-edge <child> --field <field> --from <parent> --to <parent> [--apply]` (reparent)
- `stackctl roadmap rename <from> --to <new-id> [--apply]` (repoints dependents)
- `stackctl roadmap remove-node <id> [--apply]` (edge-aware)

**Inputs.** A positional node identifier; `--field` over the typed `EdgeField`
vocabulary; `--to`/`--from` targets as required per sub-action.

**Success output.**
- dry-run: `roadmap <sub>: dry-run — would <change> (use --apply to write)`.
- `--apply`: `roadmap <sub>: applied to <id>` after a successful graph re-validation. **Exit 0.**

**Error output.**
- A mutation that would create a **cycle**, a **dangling ref**, or a **duplicate id** → exit 2 (`DocumentModelError`, fail loud, on-disk doc unchanged).
- Unknown node / unknown edge target / empty `--field` value → exit 2 (usage).
- `move-edge` whose `--from` parent does not hold the edge → exit 2.

**Invariant (US2 scenario 3).** After `move-edge --apply`, `roadmap order`
revalidates clean (no cycle/dangling ref). `remove-node` is **edge-aware**: removing
a node still targeted by a `depends-on`/`part-of` edge re-points/clears the edge or
refuses loud — never leaves a dangling reference.

**Mediation class.** `mutating` (all five).

**Satisfies.** FR-014.

---

## RM2 — `roadmap reconcile --unorphan <spec>` (FR-015)

**Signature.** `stackctl roadmap reconcile --unorphan <spec> [--apply]`.

**Inputs.** `<spec>` — an orphan spec dir the report-only `reconcile` flags under
`orphan spec dirs` (`src/roadmap/reconcile.ts`).

**Success output.**
- dry-run: `roadmap reconcile --unorphan: dry-run — would resolve <spec> into a node (use --apply to write)`.
- `--apply`: resolves the orphan into a node (creating the node + its `spec:` edge) WITHOUT hand-editing ROADMAP.md, graph re-validated. **Exit 0.**

**Error output.** A `<spec>` that is not actually an orphan / not under the
reconciliation glob-parent → exit 2 (fail loud — never reconcile against a wrong
base, the existing `reconcileBaseDir` guard). The bare `roadmap reconcile`
(report-only) is unchanged.

**Mediation class.** `mutating` (the `--unorphan` assist; bare `reconcile` is `read-only`).

**Satisfies.** FR-015.

---

## RM3 — Approve-design / analyze-clean marker writer (FR-016)

**Signature.** `stackctl roadmap approve-design <id> [--analyze-clean] [--clear] [--apply]`
(writes `design-approved`; `--analyze-clean` writes the symmetric `analyze-clean`
marker; `--clear` negates).

**Inputs.** `<id>` (positional, required). The marker(s) to record.

**Success output.**
- dry-run: `roadmap approve-design: dry-run — would record design-approved on <id> (use --apply to write)`.
- `--apply`: writes the `design-approved` (and, with `--analyze-clean`, `analyze-clean`) roadmap marker edge field WITHOUT a hand-edit — the marker `WorkItem.designApproved`/`analyzeClean` reads true after. **Exit 0.**

**Error output.** Unknown node → exit 2. Graph re-validation failure → exit 2 (zero-write).

**Invariant.** The marker is a recorded fact (presence = true), consistent with the
existing `markerTrue` read semantics in `roadmap-model.ts`. Today these markers are
read-only; this verb makes recording them no longer a forbidden hand-edit.

**Mediation class.** `mutating`.

**Satisfies.** FR-016 (US2 scenario 5).

---

## RM4 — Edge-aware archival (FR-017)

**Contract.** `curate`/archive (and `backlog archive`, cross-ref backlog-verbs §B2)
MUST NOT archive a terminal item that is still a `depends-on`/`part-of` target in a
way that dangles the edge. Before removing/archiving, the operation consults the
graph (`roadmap-model.ts` typed edges); a still-referenced terminal item → refuse
loud (exit 2) naming the dangling edge, or re-point/clear the edge as part of the
move.

**Satisfies.** FR-017 (US2 scenario 7).

---

## Exit-code summary

| Outcome | Exit |
|---|---|
| dry-run or `--apply` success | 0 |
| Backlog backend runtime fail-loud (close-related path) | 1 |
| Usage / graph violation (cycle, dangling ref, duplicate id, unknown node, dangling-edge refusal) | 2 |
