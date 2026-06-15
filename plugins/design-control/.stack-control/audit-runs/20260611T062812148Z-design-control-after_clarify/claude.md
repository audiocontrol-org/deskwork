Verification complete — three claims checked against live repo state before writing: the run-062218157Z artifacts are **untracked** (not committed at all; `git ls-files` is empty for that dir while the files exist on disk), `wireframeFile` is confirmed unvalidated at `derived.ts:75/172/344`, and `audit-log.md` has no disposition entries for that run's codex findings. Findings follow.

### Run 20260611T062218157Z is uncommitted, and the governance diff renders its files as malformed absolute-path entries (`a/Users/orion/...`)

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    plugins/design-control/.stack-control/audit-runs/20260611T062218157Z-design-control-after_clarify/ (untracked); the `diff --git a/Users/orion/work/...` entries at the tail of the audited diff

Commit 90bc5507's message cites run 20260611T062218157Z ("floor shortfall") as the justification for the config change, but `git show 90bc5507 --stat` shows the commit contains only `audit-barrage-config.yaml` — the run record itself (INDEX.md, PROMPT.md, codex.md with two findings, gemini stderr, tip.sha) is untracked working-tree state. This breaks the protocol's own pattern: the sibling run 055621128Z was committed in 9c0d556c. The evidentiary record for a committed config change exists only on one machine and vanishes with the worktree. Separately, the diff-builder rendered those untracked files into this audit's payload as `diff --git a/Users/orion/work/deskwork-work/design-control/plugins/...` — absolute paths posing as repo-relative ones. Any consumer that applies or path-keys on this diff would create a literal `Users/` tree at the repo root, and an auditor reading the diff is misled into believing such a tree was committed (I initially was; only a live `ls` disproved it).

Blast radius: medium. The governance discipline's value rests on run records being durable and discoverable; an uncommitted record cited by a commit message is a provenance gap in the provenance tooling itself, and the absolute-path diff rendering will mislead every future cross-model auditor fed this payload. Fix: commit the run directory (matching 9c0d556c's pattern), and make the diff-builder either exclude untracked files or render them with correct repo-relative prefixes.

### Two codex findings from run 062218157Z are committed-adjacent but undispositioned — and both name real defects in the current code

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    audit-runs/20260611T062218157Z-design-control-after_clarify/codex.md (AUDIT-BARRAGE-codex-01, -02); plugins/design-control/specs/001-design-control/audit-log.md (no matching entries)

The run produced AUDIT-BARRAGE-codex-01 (`wireframeFile` can escape the provenance directory) and AUDIT-BARRAGE-codex-02 (`recordDerivation` can clobber an existing snapshot before the sidecar commit fails). A grep of `audit-log.md` finds no disposition for either. The run failed the ≥2-emitting-models floor, which legitimately refuses the *round* — but the findings exist, were captured to disk, and I have independently verified both defects are present in `src/provenance/derived.ts` as written (see claude-03 and claude-04 below, which are my independent confirmations). Per the project's scope-don't-defer rule, a captured finding with no disposition is precisely the parked-defect failure mode the audit-log exists to prevent; the floor refusal is being silently treated as if it also voided the findings.

Blast radius: medium. Nothing breaks today, but two verified-real defects in a tamper-evidence module are sitting in an untracked file with no tracking entry — the discipline degrades silently. Fix: lift both into the audit-log with IDs and dispositions (the fixes are small; see the two findings below).

### `wireframeFile` is interpolated into paths with no validation — the surfaceId fix (AUDIT-20260611-02) left its sibling input open

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:75 (drivingSchema), :172 (recordDrivingWireframe join), :344 (verifyDrivingWireframe join)

Commit 896be642 added `assertPortableSurfaceId` at every surfaceId path-building entry, with a zod-side defense on load. But `recordDrivingWireframe` then does `join(input.dir, input.wireframeFile)` (line 172) with `wireframeFile` constrained only to `z.string().min(1)` (line 75), and `verifyDrivingWireframe` re-joins the stored value at line 344. A `wireframeFile` of `../outside.html`, a nested `sub/file.html`, or a planted sidecar carrying a traversal path binds driving provenance to — and later "verifies" — an artifact outside the operator-chosen wireframes directory. SKILL.md (step 6) promises the filename is "relative to `<wireframes-dir>`" but nothing enforces it. This is the exact shape AUDIT-20260611-02 fixed for surfaceId, applied asymmetrically.

Blast radius: medium — operator/agent-supplied input, so the realistic failure is provenance bound to the wrong artifact (a certification surface certifying outside its directory) rather than exploitation, but driving records are the module's strongest claim and the asymmetry compounds with adoption. Fix: validate `wireframeFile` as a portable filename (reuse `SURFACE_ID_PATTERN`-style validation plus an extension allowance) at record time AND in `drivingSchema`, mirroring the surfaceId defense's both-sides shape.

### `recordDerivation`'s promote can destroy a pre-existing snapshot — append-once guards only the sidecar target

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:228-263 (assertAppendOnce checks only sidecarPath; renameSync clobbers snapshotTarget)

`assertAppendOnce` checks only `<surfaceId>.provenance.json`. The promote then `renameSync(stagedSnapshot, snapshotTarget)` — which silently overwrites an existing file on POSIX — *before* the sidecar commit point. The module's own error messages create the triggering scenario: `checkDerivedAcceptance` and `verifyDrivingWireframe` both instruct "Remove the existing record, then re-derive." An operator who removes the sidecar (leaving the historical snapshot) and re-derives gets the old baseline overwritten at line ~251; if the sidecar rename then fails, the catch block removes only `.tmp-` staging paths — the original snapshot bytes are gone, replaced by an uncommitted attempt's bytes, with no sidecar referencing either. This contradicts the commit a26a1645 claim of "no half-state on failure": the failure path now mutates pre-existing state.

Blast radius: medium. Requires the remove-and-re-derive recovery path plus a write failure, but the destroyed artifact is exactly the kind of historical baseline the provenance discipline exists to preserve, and the documented recovery procedure is what walks the operator into it. Fix: include `snapshotTarget` in the append-once refusal (refuse if either final target exists), or promote with no-clobber semantics (`linkSync` + `unlink` instead of `renameSync`).

### The append-once guarantee is check-then-act — concurrent recorders for the same surface can both succeed

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    plugins/design-control/src/provenance/derived.ts:128-141 (assertAppendOnce existsSync), :143-146 (writeProvenance with default 'w' flag), :251-252 (clobbering renameSync)

`assertAppendOnce` uses `existsSync`, then `writeProvenance` writes with the default `'w'` flag and `recordDerivation` promotes via clobbering `renameSync`. Two concurrent recorders for the same surface (the stack-control thesis explicitly targets parallel unattended execution) can both pass the existence check and both "succeed," last-writer-wins — including the derived→driving laundering direction that 0e4027c3 was written to kill. The window is small, but the guarantee is the module's headline promise and the atomic primitive is one flag away.

Blast radius: low — requires two processes recording the same surface near-simultaneously, which already implies an orchestration error, and the result is one record silently lost rather than a default-path failure. Fix: `writeFileSync(path, data, { flag: 'wx' })` for the driving sidecar (making check-and-write atomic, with EEXIST mapped to the append-once refusal), and a link-based no-clobber promote on the derived path (which also resolves claude-04).

### The govern loop's audited diff embeds its own prior run artifacts — payload compounds each round, and the 900s timeout treats the symptom

Finding-ID: AUDIT-BARRAGE-claude-06
Status:     open
Severity:   medium
Surface:    plugins/design-control/.stack-control/audit-barrage-config.yaml:30-37 (claude 300→900 rationale); the audited diff's inclusion of audit-runs/\*\*/PROMPT.md

This run's payload contains run 062218157Z's PROMPT.md (~3757 lines), which itself embeds run 055621128Z's full PROMPT.md (~859 lines), which embeds the original feature diff — three levels of recursive self-quotation. Because the governed diff is taken against a fixed base (4a7f30d0) and run artifacts are committed inside the audited tree, every governance round appends its own bookkeeping to the next round's prompt. The config comment documents the consequence — a 181KB prompt and a claude timeout at 301s — and responds by raising the timeout to 900s. That is a symptom patch; the generator is the inclusion of `.stack-control/audit-runs/` (meta-artifacts about the audit) in the diff the audit reads. Per the project's own spec-audit-diminishing-returns rule: remove the generator, don't feed it.

Blast radius: medium and monotonically worsening — each round adds its predecessor's full payload, so timeouts and zero-byte model failures (the exact fleet-degradation mode issue 447 documented) recur at the next size doubling regardless of timeout value, and auditor attention is diluted across thousands of lines of self-quotation. Fix: exclude `.stack-control/audit-runs/` (and governance bookkeeping generally) from the governed diff via pathspec, keeping the diff scoped to work product.

### Seeded config's header narrates a different feature's history ("project override for graphical-entries")

Finding-ID: AUDIT-BARRAGE-claude-07
Status:     open
Severity:   low
Surface:    plugins/design-control/.stack-control/audit-barrage-config.yaml:1-27

The file seeded into the design-control nested installation opens with "project override for graphical-entries" and carries that feature's gemini-failure statistics (16 of 17 runs across "the graphical-entries Phase 0 audit cycle") and Phase 12 Task 8 history verbatim. Only the final comment block (claude 300→900, specs/014) belongs to this installation. A future reader tuning this config inherits another feature's rationale as if it were locally measured evidence.

Blast radius: low — no behavioral consequence (the `models:` block is correct), purely misleading provenance in comments, but this plugin's whole subject matter is records that accurately bind to what they describe. Fix: reword the header to name this installation, keep the gemini-disable rationale but attribute it ("per the root override, originally measured on graphical-entries"), and drop the Phase-12 block or cite it as inherited.

---

**Summary for triage:** 7 findings, 0 high/blocking. The strongest cross-cutting signals: (1) the governance tooling itself dropped a run record cited by a commit and rendered untracked files with absolute paths into this very audit's payload (claude-01); (2) two real, verified code defects from the floor-refused run are sitting untriaged (claude-02, independently confirmed as claude-03/-04); (3) the recursive prompt-growth generator behind the timeout bump will defeat the 900s ceiling too (claude-06). Claude-03 and -04 corroborate codex's findings from run 062218157Z — that's cross-model agreement, the protocol's HIGH-confidence signal, despite my medium per-finding blast-radius ratings.
