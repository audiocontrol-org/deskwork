---
slug: audit-protocol-friction-burndown
targetVersion: ""
---

# Audit log — audit-protocol-friction-burndown

## 2026-06-14 — audit-barrage lift (20260614T025252527Z-audit-protocol-friction-burndown-after_clarify)

### AUDIT-20260614-01 — Phase checkpoint paths accept unsanitized slug and phase components

Finding-ID: AUDIT-20260614-01
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/checkpoint-state.ts:28-46

`checkpointPath()` builds a writable filesystem path directly from `featureSlug` and `phaseId`: `join(installationRoot, CHECKPOINTS_REL, featureSlug)` plus ``phase-${phaseId}.json``. Neither component is validated before `writePhaseCheckpoint()` creates parent directories and writes the file. A slug or phase id containing path separators or `..` can move the checkpoint outside the intended `.stack-control/govern/phase-checkpoints/<feature>/` namespace.

The blast radius is high because this is a state-writing governance primitive. If any caller threads CLI-derived `--feature` or `--phase` values through this helper, an operator can accidentally or intentionally overwrite unrelated files under the installation. A reasonable fix is to reject path separators, `.`/`..`, and empty normalized components for both slug and phase id, or encode them with a reversible safe filename function before joining.

### AUDIT-20260614-02 — Fleet negotiation counts unenforced and unmonitored lanes toward quorum

Finding-ID: AUDIT-20260614-02
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/fleet-negotiation.ts:11-28

`negotiateFleet()` accepts a lane solely when `lane.envelope.maxPromptBytes >= requestedPromptBytes`, then opens the negotiation when `accepted.length >= requireModels`. The `LaneCapabilityProfile` being negotiated carries `enforcement` and `liveness`, but those fields are ignored. That means an `unenforced` or `unmonitored` lane with a large envelope can satisfy the required model count even though the barrage reliability contracts distinguish those states as materially different capabilities.

The blast radius is high because this helper is explicitly positioned as pre-payload fleet negotiation. A consumer using it as written can proceed with a payload that appears to meet quorum while relying on lanes that are not mechanically enforced or not liveness-monitored. A reasonable fix is to make quorum eligibility explicit, likely counting only lanes with the required enforcement and liveness states, and recording the reason non-eligible lanes were rejected separately from byte-envelope rejection.

### AUDIT-20260614-03 — New governance primitives are not wired into the protocol path

Finding-ID: AUDIT-20260614-03
Status:     open
Severity:   blocking
Per-lane:   codex=blocking
Decision:   single-model (gate-counted blocking)
Surface:    Missing integration across src/govern/protocol.ts:253-389, src/govern/checkpoint-state.ts:40-68, src/govern/lane-capabilities.ts:46-51, src/govern/fleet-negotiation.ts:11-28, src/govern/phase-boundary-sizing.ts:17-45

The diff adds checkpoint persistence, lane capability loading, fleet negotiation, and phase boundary sizing helpers, but the actual `runProtocol()` path still only renders, fires the barrage, lifts, slushes, and gates. There is no production call in the diff that loads lane capabilities, negotiates the active fleet, measures the prompt against the fleet envelope, writes a passed phase checkpoint, or reads a prior checkpoint to decide freshness.

The blast radius is blocking for the feature as implemented because the operator-facing governance behavior remains effectively unchanged apart from the `repoRoot` rename to `installationRoot`. The new tests exercise isolated helpers, but an adopter running `stackctl govern` will not receive durable phase checkpoint behavior or pre-dispatch fleet/boundary enforcement. A reasonable fix is to wire these helpers into the govern/protocol flow at the points their contracts imply: capability load and negotiation before dispatch, actual prompt measurement after render, and checkpoint write only after a successful gate for the scoped phase.

## 2026-06-14 — audit-barrage lift (20260614T031027857Z-audit-protocol-friction-burndown-after_clarify)

### AUDIT-20260614-04 — Timeout-based envelope fallback overstates lane capacity by an order of magnitude

Finding-ID: AUDIT-20260614-04
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    [src/govern/lane-capabilities.ts](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/govern/lane-capabilities.ts:75)

`deriveEnvelopeBytes` treats `timeoutSeconds` as if it were a prompt-size budget and converts it to bytes via `model.timeoutSeconds * 1024` ([src/govern/lane-capabilities.ts](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/govern/lane-capabilities.ts:75)). In this diff, the live override fleet was also changed to fixed `timeout_seconds: 600` for both Codex lanes ([.stack-control/audit-barrage-config.yaml](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/.stack-control/audit-barrage-config.yaml:37)), so any installation without a `fleet-knowledge.yaml` will infer a 614,400-byte envelope per lane. That is not a real prompt-capacity signal; it is just a wall-clock timeout.

The blast radius is high because the new negotiation/boundary-sizing layer will accept oversized payloads as “viable” on the strength of a fabricated envelope, then fail later at the actual model boundary the feature is supposed to predict up front. A reasonable fix is to make the no-knowledge fallback explicit and conservative: either fail loud without `fleet-knowledge.yaml`, or derive from a separately calibrated prompt-capacity field rather than from timeout seconds.

### AUDIT-20260614-05 — Fleet negotiation counts degraded lanes as viable

Finding-ID: AUDIT-20260614-05 (codex-02 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   codex=medium, codex-gpt5=medium
Decision:   agreement (gate-counted medium)
Surface:    [src/govern/fleet-negotiation.ts](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/govern/fleet-negotiation.ts:15)

`LaneCapabilityProfile` carries `enforcement` and `liveness` precisely so the system can distinguish safe, monitored lanes from degraded ones ([src/govern/lane-capabilities.ts](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/govern/lane-capabilities.ts:17)). But `negotiateFleet` ignores both fields and accepts any lane whose `maxPromptBytes` clears the requested size ([src/govern/fleet-negotiation.ts](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/govern/fleet-negotiation.ts:15)). As written, an unenforced or unmonitored lane still helps satisfy `requireModels`.

The consequence is that the fleet can be reported as successfully negotiated even when one of the “accepted” lanes has already failed the protocol qualities this feature is trying to preserve. That is a medium-severity reliability defect: execution may continue, but the operator is given a stronger assurance than the fleet actually merits. The negotiation predicate should reject degraded lanes, or at minimum return a distinct disposition that does not let them satisfy quorum silently.

### AUDIT-20260614-06 — The temporary two-Codex override removes cross-family audit diversity without any compensating signal

Finding-ID: AUDIT-20260614-06
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    [.stack-control/audit-barrage-config.yaml](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/.stack-control/audit-barrage-config.yaml:6)

The config override replaces the prior mixed fleet with two OpenAI/Codex lanes only: `codex / gpt-5.5` and `codex-gpt5 / gpt-5.4` ([.stack-control/audit-barrage-config.yaml](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/.stack-control/audit-barrage-config.yaml:6), [.stack-control/audit-barrage-config.yaml](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/.stack-control/audit-barrage-config.yaml:31)). The surrounding comments describe this as preserving “two independently-pinned lanes,” but the earlier same-family warning that quorum from correlated models is weaker evidence was deleted from this installation override.

That matters because the barrage’s value proposition is genetic diversity in failure modes, not merely a count of two model invocations. Shipping a same-vendor fleet with no vendor-family warning, no weakened-quorum annotation, and no gate distinction means downstream operators can treat a 2-of-2 agreement as if it were the old cross-family signal. The blast radius is high at the governance layer: the feature can green-light work on weaker evidence than its protocol semantics imply.

### AUDIT-20260614-07 — Checkpoint freshness ignores working-tree content changes

Finding-ID: AUDIT-20260614-07
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/checkpoint-state.ts:61-63

`computeScopeFingerprint()` only combines a caller-supplied `revision` with the sorted path list: `revision::path|path`. That means a checkpoint remains “fresh” when any governed file changes in the working tree without a new revision value. For a governance checkpoint, that is a correctness defect: an adopter or unattended agent could skip a phase audit even though the actual audited content changed.

The blast radius is high because this can directly invalidate the feature’s audit-boundary guarantee. A reasonable fix is to include content state in the fingerprint, such as file hashes for every governed path, or to ensure the supplied revision is explicitly a tree/content hash that changes for uncommitted modifications.

## 2026-06-14 — audit-barrage lift (20260614T061505967Z-audit-protocol-friction-burndown-after_clarify)

### AUDIT-20260614-08 — Fleet negotiation still runs after remediation payload assembly has already happened

Finding-ID: AUDIT-20260614-08 (codex-01 + codex-01 + codex-02 + codex-03; cross-model)
Status:     open
Severity:   high
Per-lane:   codex=high, codex-gpt5=blocking
Decision:   agreement (gate-counted high)
Surface:    src/subcommands/govern.ts:530-578, src/govern/protocol.ts:277-297

`runGovern()` still builds the full audit payload before negotiation. In implement mode it calls `buildImplementVars(...)` at [src/subcommands/govern.ts:530-542](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/subcommands/govern.ts:530), which assembles the diff/audit vars that become the remediation context, and only then passes those vars into `runProtocol()`. Inside `runProtocol()`, negotiation does not happen until after `audit-barrage-render` has already rendered `prompt.md` and the code has measured its byte size at [src/govern/protocol.ts:277-297](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/govern/protocol.ts:277).

That breaks the feature’s stated contract, not just its preferred architecture. The spec requires fleet selection to happen “before remediation / execution context assembly” and to fail before payload assembly when no viable fleet exists ([specs/021-audit-protocol-friction-burndown/spec.md:40-42](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/specs/021-audit-protocol-friction-burndown/spec.md:40), [specs/021-audit-protocol-friction-burndown/spec.md:77-88](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/specs/021-audit-protocol-friction-burndown/spec.md:77)). As shipped, an undersized or unavailable fleet still pays the cost of diff assembly and prompt rendering before failing. That is blocking because the main control-plane guarantee this feature advertises is not actually true on the govern path. The fix needs to move negotiation inputs ahead of `buildImplementVars`/render, or split payload sizing metadata from full remediation-context assembly so a failed negotiation aborts before the heavy payload is built.

### AUDIT-20260614-09 — Durable checkpoint state is added but never used by the govern flow

Finding-ID: AUDIT-20260614-09
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/checkpoint-state.ts:44-90; missing integration in src/subcommands/govern.ts:464-542 and src/govern/protocol.ts:291-340

The diff adds checkpoint persistence primitives (`writePhaseCheckpoint`, `readPhaseCheckpoint`, `isCheckpointFresh`, and `computeScopeFingerprint`) in `src/govern/checkpoint-state.ts`, but the only references are unit tests. The actual govern path resolves a phase unit and builds per-phase vars in `src/subcommands/govern.ts:464-542`, then runs the protocol in `src/govern/protocol.ts:291-340`, without reading an existing checkpoint, checking freshness, or writing a passed checkpoint after a successful gate.

The blast radius is medium because this does not corrupt existing governance, but it creates a false shipped surface: tests prove the helper works in isolation while the operator-facing feature still has no durable checkpoint behavior. A reasonable fix is to wire checkpoint reads into phase selection, include the scope fingerprint inputs used for freshness, and write the checkpoint only after the convergence gate opens for that phase.

### AUDIT-20260614-10 — Temporary fleet policy is encoded as durable config without an expiry mechanism

Finding-ID: AUDIT-20260614-10
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    .stack-control/audit-barrage-config.yaml:6-21

The override says the installation pins a “temporary Codex-only fleet,” applies it “for the next few days,” and describes the second Codex lane as a “temporary substitute” at lines 6-21. That is a deferral trap in a durable config file: nothing in the config encodes an expiry, owner action, or machine-checkable reminder, so the same-family fleet can silently remain the steady-state governance signal.

The downstream consequence is weakened audit evidence: the file itself warns that 2-of-2 agreement is weaker than a cross-family barrage, but it still makes that weakened fleet the active policy indefinitely. A reasonable fix is to remove the temporal promise from durable config and either encode a concrete expiry/check in tooling or make the policy explicitly durable and accepted as same-family evidence.

## 2026-06-14 — audit-barrage lift (20260614T061756219Z-audit-protocol-friction-burndown-after_clarify)

### AUDIT-20260614-11 — Phase checkpoints are not wired into the govern path, so per-phase freshness is never enforced

Finding-ID: AUDIT-20260614-11
Status:     open
Severity:   blocking
Per-lane:   codex-gpt5=blocking
Decision:   single-model (gate-counted blocking)
Surface:    Missing integration across `src/subcommands/govern.ts:464-578`, `src/govern/protocol.ts:291-352`, and `src/govern/checkpoint-state.ts:44-90`

This diff adds durable checkpoint primitives in `src/govern/checkpoint-state.ts` (`writePhaseCheckpoint`, `readPhaseCheckpoint`, `isCheckpointFresh`, `computeScopeFingerprint`), but the actual govern flow never calls them. In `src/subcommands/govern.ts:464-578`, `--phase` only resolves the phase unit and threads a checkpoint label into `protocolArgs`; then `src/govern/protocol.ts:291-352` renders, negotiates, and runs the barrage without reading an existing checkpoint before the run or writing a passed checkpoint after success.

That means the feature’s phase-level contract is still missing at runtime: a previously passed phase cannot be skipped from durable state, and a stale phase cannot be refused because no persisted freshness record is ever consulted. The blast radius is blocking because the feature under audit is specifically about protocol friction around phase-bounded governance; shipping helper code that is only exercised by unit tests leaves the operator-visible behavior unchanged. A fix needs to thread checkpoint read/freshness checks into phase selection before barrage, and write the checkpoint record only after a successful governed pass.

### AUDIT-20260614-12 — The fallback envelope calculation turns timeout calibration into a fake prompt-capacity ceiling

Finding-ID: AUDIT-20260614-12
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    `src/govern/lane-capabilities.ts:73-94`, `src/govern/protocol.ts:291-317`

When `.stack-control/fleet-knowledge.yaml` is absent, `normalizeLaneCapability()` falls back to `deriveEnvelopeBytes()` and computes `maxPromptBytes` as `floor(timeoutFloorSeconds / timeoutSecsPerKb) * 1024` (`src/govern/lane-capabilities.ts:76-93`). `runProtocol()` then treats that number as authoritative for preflight negotiation and boundary rejection (`src/govern/protocol.ts:291-317`). But `timeout_floor_seconds` is a minimum wall-clock timeout budget, not a calibrated prompt-capacity limit; converting it into bytes creates an arbitrary ceiling.

On a fresh installation that has only the shipped barrage config and no new `fleet-knowledge.yaml`, this will reject prompts based on invented limits rather than actual model capacity. The blast radius is high because legitimate govern runs can now fail before the barrage starts, even though the underlying lanes may have handled the payload. A reasonable fix is to require explicit `fleet-knowledge.yaml` for any preflight capacity decision, or add a separately calibrated prompt-capacity field instead of deriving one from timeout math.

### AUDIT-20260614-13 — Negotiation collapses distinct failure modes into one generic `negotiation-failed` result

Finding-ID: AUDIT-20260614-13
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/govern/fleet-negotiation.ts:3-38`, `src/govern/protocol.ts:301-306`

`FleetNegotiationResult` only exposes `disposition: 'accepted' | 'negotiation-failed'`, and `negotiateFleet()` uses `accepted.length >= requireModels` as its only terminal split (`src/govern/fleet-negotiation.ts:3-38`). `runProtocol()` then reports every preflight refusal through the same generic error string (`src/govern/protocol.ts:301-306`). As written, “zero lanes can carry this payload” and “some lanes fit, but not enough survive to satisfy the required floor/safety constraints” are indistinguishable to downstream callers.

The run still stops, so this is not as severe as a silent wrong pass, but it throws away operator and automation signal the feature is explicitly trying to add. The blast radius is medium: consumers cannot tell whether to shrink the payload, restore lane count, or fix an enforcement/liveness problem. The fix is to carry a distinct reason or disposition for floor shortfall versus true payload-capacity failure and thread that through protocol reporting.

### AUDIT-20260614-14 — `--models` now passes an array where the CLI expects a string

Finding-ID: AUDIT-20260614-14
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    `src/govern/protocol.ts:332-334`

`barrageArgs` is an array of CLI arguments, but the new code pushes the accepted fleet list as a single array element: `barrageArgs.push('--models', negotiatedFleet.acceptedFleet.join(','))` is the intended shape, while the diff shows `barrageArgs` receiving `--models` and `negotiatedFleet.acceptedFleet.join(',')` in the literal initializer area after `--output-run-dir`. If this compiles as shown, it is fine; if the actual array element ordering leaves `--output-run-dir` without its expected value before `--models`, the barrage command will parse incorrectly.

The blast radius is high because this sits on the main govern protocol path: an adopter running governance would get a malformed barrage invocation rather than the negotiated fleet. A reasonable fix is to keep `--output-run-dir` paired with its generated directory argument and append `--models <comma-list>` afterward, with a test asserting the spawned barrage argv.

## 2026-06-14 — audit-barrage lift (20260614T062732497Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-15 — Phase checkpoints go stale after a plain commit, even when the audited files did not change

Finding-ID: AUDIT-20260614-15
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    `src/govern/checkpoint-state.ts:72-90`, `src/subcommands/govern.ts:384-410`, `src/subcommands/govern.ts:746-758`

`computeScopeFingerprint()` salts the checkpoint hash with the current Git revision (`digest.update(revision)` at `checkpoint-state.ts:77-78`), and `resolvePhaseCheckpointStatuses()` recomputes that hash from `git rev-parse HEAD` on every later govern run (`subcommands/govern.ts:384-400`). The checkpoint writer then persists that revision-derived fingerprint after a successful phase run (`subcommands/govern.ts:746-758`).

That means a normal workflow of “phase govern succeeds, then I commit the unchanged work” invalidates the checkpoint immediately: the files are identical, but `HEAD` changed, so `isCheckpointFresh()` flips from current to stale. The downstream blast radius is that phase 2+ advancement can be blocked by bookkeeping alone, not by changed audited surfaces. A reasonable fix is to fingerprint the governed paths’ content only, or to persist and compare an explicit content hash plus any additional state you actually need, rather than folding the ambient branch tip into freshness.

### AUDIT-20260614-16 — Whole-feature govern collapses to an empty payload once all phase checkpoints are current

Finding-ID: AUDIT-20260614-16 (codex-03 + codex-02; cross-model)
Status:     open
Severity:   blocking
Per-lane:   codex=medium, codex-gpt5=blocking
Decision:   adjudicated (gate-counted blocking) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — blocking retained.
Surface:    `src/subcommands/govern.ts:603-614`, `src/govern/payload-implement.ts:259-280`, `src/govern/payload-implement.ts:318-321`

In the new whole-feature path, `assertWholeFeatureCheckpointsCurrent()` first requires every phase status to be `current` (`subcommands/govern.ts:603-605`). The code then maps those statuses into `resolveComposingFeatureUnit()` inputs with `converged: true` and `changed: false` for every phase (`subcommands/govern.ts:608-612`). Given the existing composing-unit contract, that carries every phase, so the resulting `diffScope.files` is `[]`.

This diff also changes `assembleImplementPayload()` so an explicit empty `pathScope` produces no committed diff at all (`payload-implement.ts:259-280`) and rejects every untracked file as out-of-scope (`payload-implement.ts:318-321`). In practice, the “differentiated back half audits a plan it did not author or execute” phase becomes a no-op exactly when it is supposed to run. The blast radius is feature-wide: the final safety-net barrage for phased work silently stops auditing code. The fix needs to preserve a non-empty composing surface for the final pass, or derive `changed` from something other than the already-filtered `current` status.

### AUDIT-20260614-17 — New checkpoint bookkeeping files are not excluded from implement-mode payloads

Finding-ID: AUDIT-20260614-17
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/govern/checkpoint-state.ts:27-50`, `src/subcommands/govern.ts:369-374`, `src/subcommands/govern.ts:653-671`, `src/subcommands/govern.ts:746-758`, `src/govern/payload-implement.ts:123-136`, `src/govern/payload-implement.ts:239-242`, `src/govern/payload-implement.ts:304-312`

This diff introduces durable governance artifacts under `.stack-control/govern/phase-checkpoints/...` (`checkpoint-state.ts:27-50`) and writes them on successful phase runs (`subcommands/govern.ts:746-758`). But the only implement-mode bookkeeping exclusion threaded into `assembleImplementPayload()` is the backlog store from `resolveGovernExcludePaths()` (`subcommands/govern.ts:369-374`, `653-671`). `payload-implement.ts` uses that exclusion list for both committed diff pathspecs and the untracked fold (`239-242`, `304-312`), so the new checkpoint files are not covered.

The consequence is a partial reintroduction of governance self-reference: once those JSON records are committed or left untracked in range, later implement-mode payloads can ship internal checkpoint state back into the model fleet. That is a smaller blast radius than the audit no-op above, because path-scoped phase runs may skip them, but it is still the same class of bug the earlier exclusion work was explicitly preventing. The fix is to treat the phase-checkpoint directory as governance bookkeeping and thread it through `excludePaths` alongside the backlog store.

### AUDIT-20260614-18 — Phase fingerprints stale on any unrelated commit

Finding-ID: AUDIT-20260614-18
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/checkpoint-state.ts:71-78; src/subcommands/govern.ts:382-413

`computeScopeFingerprint` seeds every phase checkpoint hash with the repository-wide `HEAD` revision before hashing the phase’s scoped files. That means a commit touching any unrelated file changes `currentRevision()` and makes every prior phase checkpoint stale, even when the governed paths for that phase are byte-identical. The blast radius is high because an adopter following the phase flow can be blocked from advancing later phases after committing unrelated work.

The fingerprint should be scoped to the governed paths, not the whole repository revision. A reasonable fix is to hash the sorted governed path list plus each file’s content or per-path blob identity, and only include revision data if it is path-specific.

### AUDIT-20260614-19 — Empty path scope semantics contradict the contract

Finding-ID: AUDIT-20260614-19
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/payload-implement.ts:164-274; src/__tests__/govern/payload-exclusion.test.ts:125-136

The comment still says “An empty scope means `no bound` (every file is in scope),” but the implementation now treats `pathScope: []` as no files in scope: `inPathScope()` returns `false`, `diff` is forced to `''`, and all untracked files are reported as skipped. The new test name also says an empty path scope “carries every phase file,” while its assertions expect the opposite behavior.

This is high because callers and future agents will naturally rely on the documented contract and pass `[]` to mean unrestricted scope, but the runtime silently drops the entire payload. Either restore the original empty-scope behavior, or rename/document this as an explicit “empty include set” sentinel and update the misleading test name and comment.

## 2026-06-14 — audit-barrage lift (20260614T063108692Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-20 — Whole-feature govern falls back to a full payload once every phase checkpoint is current

Finding-ID: AUDIT-20260614-20 (codex-02 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   codex=medium, codex-gpt5=high
Decision:   agreement (gate-counted medium)
Surface:    src/subcommands/govern.ts:637-653

`resolveComposingFeatureUnit()` is meant to carry converged-and-unchanged phases out of the `after_implement` payload, and its contract is tested that way in [src/__tests__/govern/incremental-audit.test.ts:60-79](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/__tests__/govern/incremental-audit.test.ts:60). But the caller immediately defeats that composition: `assertWholeFeatureCheckpointsCurrent()` only allows the path where every phase is already `current`, which makes `resolveComposingFeatureUnit()` return an empty `diffScope.files`, and lines 648-653 then convert that empty scope back to `undefined`. In `buildImplementVars`, `undefined` means the pre-015 whole-feature payload, so the final safety-net run re-audits everything instead of composing from the carried checkpoints.

The blast radius is high because this is exactly the safety-net path an unattended agent will take after satisfying all per-phase requirements. As written, the “composed” whole-feature run grows back to the full feature payload, which can re-surface already-settled findings and can also trigger avoidable `boundary-too-large` failures on work that should have fit only because earlier phases were supposed to be carried forward.

### AUDIT-20260614-21 — Fleet negotiation does not model lane availability, so it cannot fail before payload assembly when a configured lane is down

Finding-ID: AUDIT-20260614-21
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/fleet-negotiation.ts:11-37

The spec for this feature requires negotiation to use lane capability knowledge plus current availability before remediation payload assembly ([spec.md:83-89](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/specs/021-audit-protocol-friction-burndown/spec.md:83), [spec.md:141-155](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/specs/021-audit-protocol-friction-burndown/spec.md:141)). The shipped negotiation code has no availability input at all. `LaneCapabilityProfile` only carries static config-derived fields plus envelope sizing, and `negotiateFleet()` accepts or rejects lanes solely on `maxPromptBytes`, `enforcement`, and `liveness`. A configured lane whose CLI is missing, broken, or otherwise unavailable is still “accepted” here and only fails later when `audit-barrage` actually tries to spawn it.

That breaks the feature’s main control-plane promise: the system still assembles the rendered prompt and enters barrage execution before discovering that the negotiated fleet was not actually viable. The downstream consequence is high, because the operator-facing state becomes “barrage outage / floor shortfall” instead of an explicit preflight negotiation refusal, which is the opposite of the unattended behavior this feature says it is adding.

### AUDIT-20260614-22 — Prospective boundary sizing exists only as an isolated helper and is never used by the govern path

Finding-ID: AUDIT-20260614-22
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/phase-boundary-sizing.ts:30-43

The feature spec requires prospective phase-boundary sizing before execution, including recording the estimation basis and recommended decision ([spec.md:71-73](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/specs/021-audit-protocol-friction-burndown/spec.md:71), [spec.md:138-139](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/specs/021-audit-protocol-friction-burndown/spec.md:138)). The diff adds `estimateBoundary()`, but it is not wired into any production path: the only production caller in this area is `assertBoundaryFits()` from `runProtocol()` ([src/govern/protocol.ts:292-319](/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/src/govern/protocol.ts:292)), and a repository search shows `estimateBoundary()` is referenced only by its unit test.

The blast radius is medium rather than high because the post-render hard gate still prevents an oversized audit from running. But the pre-execution half of the contract is still missing, so adopting agents get no mechanical guidance for shaping phases before they implement them, which means the feature still pays the full “implement first, discover it was too large afterward” cost it was supposed to remove.

### AUDIT-20260614-23 — Fleet capability load errors bypass govern’s FATAL exit channel

Finding-ID: AUDIT-20260614-23
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/govern.ts:599-605, src/subcommands/govern.ts:807-814, src/govern/lane-capabilities.ts:84-90

`runGovern()` now calls `await loadLaneCapabilities(repoRoot)` before payload assembly for implement mode, but `loadLaneCapabilities()` can throw plain `Error`s, for example when a `timeout_seconds` lane lacks `fleet-knowledge.yaml` capacity data. The only terminal catch in `runGovern()` handles `GovernProtocolError` and `GovernPayloadError`; every other error is rethrown, so an operator gets an uncaught exception path instead of the command’s documented exit-2 FATAL channel.

The blast radius is medium: the run stops, so it does not falsely govern work, but fresh or malformed fleet config produces stack-shaped failure instead of actionable protocol state. A reasonable fix is to wrap capability-load failures in `GovernProtocolError` at the call site, or make the capability loader throw a typed govern error.

## 2026-06-14 — audit-barrage lift (20260614T063155509Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-24 — Whole-feature govern now hard-fails unless every phase already has a current checkpoint, which defeats the composing safety-net the new code says it is implementing

Finding-ID: AUDIT-20260614-24 (codex-01 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   codex=high, codex-gpt5=high
Decision:   agreement (gate-counted high)
Surface:    src/subcommands/govern.ts:464-470, src/subcommands/govern.ts:630-653, src/govern/incremental-audit.ts:120-137

`resolveComposingFeatureUnit()` is explicitly documented to include phases that are changed or never converged, and to carry only phases that already converged unchanged (`src/govern/incremental-audit.ts:120-137`). That contract would let `after_implement` act as the intended safety-net pass. But the new caller path rejects exactly those cases first: `assertWholeFeatureCheckpointsCurrent()` throws if *any* phase is `missing` or `stale` (`src/subcommands/govern.ts:464-470`), and the whole-feature branch calls it unconditionally before composition (`src/subcommands/govern.ts:630-653`).

The downstream consequence is that a feature with a valid `tasks.md` can no longer run whole-feature implement govern until every earlier phase has already been governed and checkpointed. That is not just stricter; it removes the fallback path for pre-existing features, partially migrated features, or any feature where one phase changed after its last govern. In practice the operator gets a fatal refusal instead of the composing audit the comments describe, so the feature’s stated goal is broken on a common path.

### AUDIT-20260614-25 — The checked-in fleet override now depends on `fleet-knowledge.yaml`, but that required file is not part of the audited diff

Finding-ID: AUDIT-20260614-25
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    .stack-control/audit-barrage-config.yaml:34-53, src/govern/lane-capabilities.ts:84-90, missing surface `.stack-control/fleet-knowledge.yaml`

Both configured lanes were changed to `timeout_seconds: 600` (`.stack-control/audit-barrage-config.yaml:34-53`). The new capability loader treats that shape as non-derivable and throws unless a `fleet-knowledge.yaml` entry supplies `max_prompt_bytes` (`src/govern/lane-capabilities.ts:84-90`). In this workspace that sidecar exists only as an untracked file, not in the `HEAD` diff.

Blast radius is high because the tracked work product is internally incomplete: if this diff ships without also adding `.stack-control/fleet-knowledge.yaml`, implement-mode govern dies during lane-capability loading before payload assembly. This is exactly the kind of configuration/code skew that breaks unattended operation. The fix is to make the dependency explicit in the audited change set: either track the knowledge file alongside the config change, or avoid `timeout_seconds` lanes until a tracked envelope source is present.

### AUDIT-20260614-26 — The new lane-selection path advertises `--models`, but `govern` still rejects that flag at parse time

Finding-ID: AUDIT-20260614-26
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/govern.ts:146-195, src/subcommands/govern.ts:598, src/govern/protocol.ts:451

The negotiation code is written as though lane selection can come from `GOVERN_MODELS/--models`: `selectRequestedLaneCapabilities()` throws `govern: FATAL — GOVERN_MODELS/--models resolved to zero lane names` (`src/govern/protocol.ts:451`), and `runGovern()` threads a `requestedModels` value into protocol execution (`src/subcommands/govern.ts:598`). But the CLI parser never accepts `--models`: it is absent from `VALUED`, absent from `GovernFlags`, and absent from the parse switch (`src/subcommands/govern.ts:146-195`).

That leaves an operator-facing contract hole. Anyone following the error text or trying to pin the fleet from the command line gets `unknown flag: --models`, while only the env-var path works. The blast radius is medium rather than low because this feature is specifically about negotiation/friction reduction: lane selection is now part of the control surface, and the CLI surface is misleading in a way that will break scripts or manual recovery flows.

### AUDIT-20260614-27 — Phase scopes silently drop root-level files

Finding-ID: AUDIT-20260614-27
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/govern.ts:628-629, src/govern/payload-implement.ts:260-280

Phase runs now pass `phaseUnit.diffScope.files` directly into `payloadPathScope`, and `assembleImplementPayload()` treats an explicit empty path scope as “audit nothing” by setting `diffArgs` to `null`. The phase parser only collects backticked tokens that contain `/`, so common root-level task targets like `package.json`, `README.md`, `tsconfig.json`, or `Makefile` produce an empty phase scope. For such a phase, the committed diff is suppressed and the untracked fold rejects everything as out of scope.

The blast radius is high because an unattended phase audit can converge and write a phase checkpoint while never showing the changed root-level file to the audit barrage. A reasonable fix is to include valid repo-relative file tokens even when they do not contain `/`, while still filtering non-path prose tokens deliberately, and add a regression test where a phase task names only `package.json` and the generated payload contains its diff.

## 2026-06-14 — audit-barrage lift (20260614T063307519Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-28 — Backtick scope extraction now accepts whole code spans, not just path substrings

Finding-ID: AUDIT-20260614-28
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/govern/incremental-audit.ts:24-25,54-60`

The new parser changed from a path-token regex to `BACKTICK_TOKEN_RE`, then pushes the entire backtick body whenever it merely contains `/` (`extractScopedPaths`, lines 54-60). That is a materially broader contract than the previous implementation: a code span like `` `npm test src/foo.ts` ``, `` `src/foo.ts (new)` ``, or `` `src/foo.ts, src/bar.ts` `` now becomes a single “path” token verbatim instead of yielding the actual file paths inside it.

That matters because these parsed values feed both payload scoping and checkpoint freshness. A bogus token is later treated as a governed path, hashed as `MISSING`, and passed into diff scoping, so a phase can silently audit the wrong surface or block itself as stale based on prose formatting rather than code changes. The blast radius is the phase-govern contract itself: a tasks author only has to use a natural inline-code span for the audit boundary to drift. A safer fix is to keep the new “directories allowed” behavior but re-extract path-shaped substrings from inside each backtick span instead of trusting the whole span as a path.

### AUDIT-20260614-29 — Phase IDs accepted by `tasks.md` parsing can crash when checkpoint files are written

Finding-ID: AUDIT-20260614-29
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/govern/incremental-audit.ts:21,35-50` and `src/govern/checkpoint-state.ts:29-42,51-58,104-114`

`parsePhases` accepts any phase header token matching `## Phase <anything up to colon>:` and returns that text as `phaseId` with no validation (`incremental-audit.ts`, lines 21 and 35-50). The new checkpoint storage then turns `phaseId` into a filename component and hard-rejects `.`, `..`, `/`, and `\\` via `safePathComponent` (`checkpoint-state.ts`, lines 104-114), which is called from `checkpointPath`/`writePhaseCheckpoint` (lines 29-42 and 51-58).

That creates a late runtime failure path for phase IDs that the parser currently treats as valid, such as `1/2` or similar decorated labels. The govern run can proceed through parsing and payload assembly, then fail only when persisting the checkpoint, leaving the phase effectively un-advanceable and the composing whole-feature pass permanently blocked on a “missing” checkpoint. The blast radius is bounded but real: one valid-looking tasks header can break convergence bookkeeping for the feature. The fix is to validate the phase-id grammar at parse/CLI boundary and make it match the filename constraints, or encode phase IDs before using them as path components.

### AUDIT-20260614-30 — Async protocol step type breaks existing synchronous drivers

Finding-ID: AUDIT-20260614-30
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/protocol.ts:224-257

`ProtocolStep` changed from `() => ProtocolResult` to `() => Promise<ProtocolResult>` and `runProtocol` changed from synchronous to `async`, but this diff does not show the call sites being updated to `await` it. The existing comment says the driver owns the loop, and a synchronous driver that still treats the return as `ProtocolResult` will see a Promise object instead of gate state. That can make the governance loop mis-handle pass/fail outcomes or skip fields such as `gateStatus`.

The blast radius is high because this is a cross-surface API contract change in the core govern protocol path. A reasonable fix is to update every `ProtocolStep` caller and `runProtocol` caller in the same change, and add a compile/runtime test that proves the driver awaits the protocol result before deciding the next step.

### AUDIT-20260614-31 — Phase fingerprints ignore the requested revision

Finding-ID: AUDIT-20260614-31
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/checkpoint-state.ts:69-97

`computeScopeFingerprint` accepts `_revision: string` but never uses it, then hashes the current working tree contents via `existsSync`, `statSync`, `readdirSync`, and `readFileSync`. That means a checkpoint fingerprint is not tied to the revision it claims to describe. If the caller asks whether a checkpoint is fresh for a specific base or committed revision, this function answers using whatever files happen to be on disk at read time.

The blast radius is high because stale or dirty working-tree content can make phase checkpoint freshness incorrect, which directly affects whether an audit phase is skipped or rerun. A reasonable fix is either to remove the revision parameter and make the working-tree semantics explicit everywhere, or use git plumbing to fingerprint the requested revision plus scoped paths.

### AUDIT-20260614-32 — Empty explicit path scope drops the entire committed diff

Finding-ID: AUDIT-20260614-32
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/payload-implement.ts:257-275

The new semantics make `pathScope: []` an explicit empty include set, and `assembleImplementPayload` implements that by setting `diffArgs` to `null` and `diff` to `''`. That silently removes all committed changes from the audit payload whenever the scoped phase parser yields no files. In the same diff, `extractScopedPaths` only accepts backticked tokens containing `/`, so a malformed or sparse phase can now produce an empty scope and therefore an empty diff instead of a visible failure.

The blast radius is high because an adopter can get a passing or under-informed audit over no committed code for a phase. A reasonable fix is to fail loud when a phase path scope is explicitly empty for an implementation audit, unless there is a separately documented and tested whole-feature mode that intentionally composes an empty include set.

## 2026-06-14 — audit-barrage lift (20260614T063807788Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-33 — Phase checkpoints cannot distinguish an overridden audit from a genuinely clean pass

Finding-ID: AUDIT-20260614-33
Status:     open
Severity:   blocking
Per-lane:   codex-gpt5=blocking
Decision:   single-model (gate-counted blocking)
Surface:    src/govern/checkpoint-state.ts:10-20,72-76

`PhaseCheckpointRecord` records only a bare `passedAt` plus `scopeFingerprint`, and `isCheckpointFresh()` at lines 72-76 reduces validity to hash equality alone. That would be fine if every recorded checkpoint meant "the phase actually converged cleanly", but the existing govern flow does not have that invariant: `--override` is intentionally routed through the gate as `converged`, and the phase checkpoint write happens on that same terminal path. The new checkpoint format therefore has no way to represent "advanced by operator override with findings still open" versus "actually passed", yet later phases treat a fresh checkpoint as authoritative.

The blast radius is the feature’s core promise. Once an overridden phase is serialized in this format, subsequent phase gating and whole-feature composition can treat it as `current` and proceed as though the prerequisite audit really passed. That breaks the intended “earlier required checkpoints are current” guarantee, not just observability. A reasonable fix is to make the persisted checkpoint state override-aware, for example by recording disposition/provenance (`passed` vs `overridden`) and refusing to count overridden records as `current` prerequisites unless the policy explicitly allows that.

### AUDIT-20260614-34 — A copied or hand-edited checkpoint file can satisfy the wrong phase because the loader never cross-checks its identity

Finding-ID: AUDIT-20260614-34
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/checkpoint-state.ts:61-69,125-163

`readPhaseCheckpoint()` selects a file path using the requested `featureSlug` and `phaseId` (lines 61-68), but `validateCheckpointRecord()` only checks that the JSON fields are non-empty strings. It never verifies that `parsed.featureSlug` and `parsed.phaseId` match the path that was opened, nor that `checkpoint`/`auditLogSection` are the expected values for that phase. A copied `phase-1.json` dropped into `phase-2.json`, or a manual edit that changes the payload while leaving the filename alone, will still deserialize as a valid checkpoint record.

Because downstream freshness currently hinges only on the stored fingerprint, this is not just metadata drift. If two phases share the same scope, or if an operator copies a record during recovery, the wrong phase can be treated as already governed and unblock later work. That is a high-consequence silent failure in a state file that the command layer treats as authoritative. The loader should reject records whose embedded identity does not match the requested slug/phase and, ideally, verify the expected checkpoint section naming too.

### AUDIT-20260614-35 — `fleet-knowledge.yaml` silently allows duplicate lane names, so the last entry wins without any error

Finding-ID: AUDIT-20260614-35
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/lane-capabilities.ts:93-113

`readFleetKnowledge()` validates shape and numeric range, but it accumulates entries into `pairs` and then returns `new Map(pairs)` at line 113. If `fleet-knowledge.yaml` repeats a lane name, the later entry silently overwrites the earlier one. That is inconsistent with the adjacent audit-barrage config loader, which refuses duplicate model names loudly, and it violates this repo’s “no silent fallbacks / explicit errors” rule for operator-facing config.

The blast radius is bounded to negotiation and boundary sizing, but it is real: one duplicate key can quietly change the envelope used for a lane, which in turn changes fleet acceptance and `boundary-too-large` behavior. An adopter debugging why a lane was accepted or rejected would read the YAML and get the wrong answer. The parser should detect duplicate `name` values and throw with a file/line-targeted error instead of relying on `Map`’s last-write-wins behavior.

### AUDIT-20260614-36 — Checkpoint reads do not verify record identity against the requested phase

Finding-ID: AUDIT-20260614-36
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/checkpoint-state.ts:57-63, src/govern/checkpoint-state.ts:116-151

`readPhaseCheckpoint()` selects the checkpoint file from the requested `featureSlug` and `phaseId`, but `validateCheckpointRecord()` only checks that the JSON contains non-empty `featureSlug` and `phaseId`; it does not require them to match the requested identifiers. A copied, stale, or hand-edited `phase-2.json` stored at the `phase-1.json` path would be accepted and returned as a valid phase-1 checkpoint.

The blast radius is high because this code is governance state: a downstream phase gate can treat the wrong checkpoint as fresh if the `scopeFingerprint` matches, causing an audit checkpoint to be skipped for the phase being executed. A reasonable fix is to pass the expected `featureSlug` and `phaseId` into validation and reject mismatches with an explicit error.

### AUDIT-20260614-37 — Scope fingerprinting allows governed paths to escape the installation root

Finding-ID: AUDIT-20260614-37
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/checkpoint-state.ts:69-96

`computeScopeFingerprint()` accepts arbitrary `paths`, and `digestScopedPath()` resolves each path with `join(installationRoot, rel)` without rejecting absolute paths or `..` segments. That means a governed path like `../other-project/file.md` or an absolute path can be hashed as part of the checkpoint fingerprint, even though the checkpoint is meant to represent scope inside one stack-control installation.

The blast radius is medium: this does not directly execute code, but it weakens the integrity boundary of governance state and can make checkpoint freshness depend on files outside the governed installation. The path validation already exists for checkpoint filenames via `safePathComponent`; scoped input paths need equivalent containment validation, likely using `resolve()` plus a root-prefix check before reading.

### AUDIT-20260614-38 — Directory hashing follows symlinked directories and can recurse without bound

Finding-ID: AUDIT-20260614-38
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/checkpoint-state.ts:85-96

`digestScopedPath()` uses `statSync(abs)` and then recursively descends directories with `readdirSync(abs)`. Because `statSync` follows symlinks, a symlinked directory that points to an ancestor or otherwise creates a cycle can make fingerprint computation recurse indefinitely or until the process fails.

The blast radius is high because checkpoint freshness is on the critical path for governance enforcement; a single symlink cycle in governed paths can hang or crash the phase check before it emits an actionable result. The fix should use `lstatSync`, either reject symlinks explicitly or hash symlink targets as metadata, and track visited real paths if symlink traversal is intentionally supported.

## 2026-06-14 — audit-barrage lift (20260614T063922308Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-39 — Overlapping governed paths make the checkpoint fingerprint unstable for the same content

Finding-ID: AUDIT-20260614-39 (codex-02 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   codex=medium, codex-gpt5=medium
Decision:   agreement (gate-counted medium)
Surface:    `src/govern/checkpoint-state.ts:75-101`

`computeScopeFingerprint()` dedupes only exact strings, then `digestScopedPath()` recursively walks directories and also hashes any explicitly-listed child paths (`src/govern/checkpoint-state.ts:75-80`, `:97-101`). If the governed set is emitted once as `["docs"]` and another time as `["docs", "docs/README.md"]`, the same underlying tree produces a different fingerprint because `docs/README.md` is hashed twice in the second case. That makes checkpoint freshness depend on how the caller serialized scope, not on the governed content itself.

The blast radius is medium because this does not silently approve bad state, but it does quietly destroy the usefulness of phase checkpoints: a harmless change in path granularity will invalidate stored checkpoints and force unnecessary re-audits. A reasonable fix is to canonicalize the path set before hashing, removing descendants when an ancestor directory is already present, or to hash only normalized leaf expansions.

### AUDIT-20260614-40 — Symlinked governed content can change without invalidating the checkpoint

Finding-ID: AUDIT-20260614-40
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    `src/govern/checkpoint-state.ts:88-93`

When a governed path is a symlink, `digestScopedPath()` records only the link target string from `readlinkSync(abs)` and returns immediately (`src/govern/checkpoint-state.ts:88-93`). It never hashes the contents behind that symlink. As a result, if the symlink keeps pointing at the same target path and the target file or directory changes, the stored `scopeFingerprint` remains unchanged and `isCheckpointFresh()` will still report the checkpoint as fresh.

The blast radius is high because this creates a false-clean governance state: downstream code can skip a required phase checkpoint even though the audited content changed. That is especially relevant in this repo, where workspace/dev flows explicitly rely on symlinked plugin paths. The fix is to decide on symlink semantics explicitly and then hash the effective target contents as part of the fingerprint, while still guarding against escapes and cycles.

### AUDIT-20260614-41 — The new governance primitives ship without direct tests in this diff

Finding-ID: AUDIT-20260614-41
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    missing test surface for `src/govern/checkpoint-state.ts`, `src/govern/fleet-negotiation.ts`, `src/govern/lane-capabilities.ts`, and `src/govern/phase-boundary-sizing.ts`

This diff introduces four new governance modules plus new fixtures (`src/__tests__/fixtures/govern/021-audit-protocol/tasks.md`, `src/__tests__/fixtures/govern/021-fleet/fleet-knowledge.yaml`), but no corresponding test files or updates to existing test suites appear in the audited range. The missing cases are not cosmetic: this code contains contract-heavy logic around path escaping, directory recursion, symlink handling, fleet-envelope derivation, and negotiation acceptance thresholds.

The blast radius is medium because these primitives are intended to gate unattended governance flow, and several failure modes here are edge-condition driven rather than obvious happy-path bugs. I would have expected explicit tests covering overlapping paths, symlinked paths, duplicate or malformed fleet knowledge entries, and negotiation failure boundaries; their absence means the most failure-prone parts of the contract are currently unchecked.

### AUDIT-20260614-42 — Phase negotiation accepts impossible quorum values

Finding-ID: AUDIT-20260614-42
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/fleet-negotiation.ts:13-35

`negotiateFleet` never validates `requireModels`, so `0`, negative numbers, `NaN`, or non-integer values can produce an accepted negotiation even when no viable audit fleet exists. The decisive line is `accepted.length >= requireModels` on line 35; with `requireModels = 0`, an empty accepted fleet returns `disposition: 'accepted'`.

This is high severity because the feature is about audit protocol enforcement and fleet negotiation. A downstream caller with a malformed or defaulted quorum can silently bypass the intended multi-model requirement. A reasonable fix is to reject non-positive, non-finite, and non-integer quorum values before filtering lanes.

### AUDIT-20260614-43 — Boundary sizing treats invalid byte counts as valid measurements

Finding-ID: AUDIT-20260614-43
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/phase-boundary-sizing.ts:25-72

`estimateBoundary`, `measureBoundaryFit`, and `assertBoundaryFits` accept unvalidated numeric inputs. Negative `averageBytesPerPath`, negative `measuredPromptBytes`, negative `activeFleetEnvelopeBytes`, `Infinity`, and non-integer byte counts can flow into persisted measurements or fit decisions. For example, line 49 marks any `measuredPromptBytes <= activeFleetEnvelopeBytes` as `fits`, so `measuredPromptBytes = -1` fits a normal fleet envelope.

The blast radius is medium because malformed sizing inputs can make audit payload gates report impossible states, which undermines the enforcement signal without necessarily affecting normal happy-path use. A reasonable fix is to validate byte counts as finite non-negative integers and fleet envelope bytes as finite positive integers before producing estimates or measurements.

## 2026-06-14 — audit-barrage lift (20260614T064120234Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-44 — Stale or misspelled `fleet-knowledge.yaml` lane names silently change the negotiated envelope

Finding-ID: AUDIT-20260614-44
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/lane-capabilities.ts:46-51,73-79,96-114

`loadLaneCapabilities()` keys fleet knowledge by `model.name`, but `readFleetKnowledge()` only validates that each YAML row has a non-empty `name` and positive `max_prompt_bytes`; it never checks that the file’s lane set exactly matches the configured barrage models. When a lane is renamed or mistyped in `.stack-control/fleet-knowledge.yaml`, `knownEnvelopes.get(model.name)` becomes `undefined` and the code silently falls back to `deriveEnvelopeBytes()` at lines 73-79 instead of failing loud.

That is not a cosmetic fallback. The derived heuristic can materially overstate real prompt capacity: the new fixture itself records `codex` at `24576` bytes, while the derivation path for the same default timeout slope would yield about `43 KiB` (`300 / 7 * 1024`). `runProtocol()` then trusts this negotiated envelope to admit the payload and pass the boundary gate (`src/govern/protocol.ts:297-315`). A stale or misspelled lane name can therefore make `govern` approve prompts that the intended fleet cannot actually carry. The blast radius is high because this is the feature’s new admission-control path: once the envelope is wrong, every downstream governance run for that install can be sized incorrectly. A reasonable fix is to reject unknown lane names and require every configured model to have exactly one matching fleet-knowledge entry whenever the file is present.

### AUDIT-20260614-45 — Phase checkpoint files are written non-atomically and a torn write can crash all later phase gating

Finding-ID: AUDIT-20260614-45 (codex-01 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   codex=high, codex-gpt5=high
Decision:   agreement (gate-counted high)
Surface:    src/govern/checkpoint-state.ts:52-70; src/subcommands/govern.ts:417-428,779-789

`writePhaseCheckpoint()` writes JSON directly to the live checkpoint path with `writeFileSync()` (lines 56-58), and `readPhaseCheckpoint()` immediately does an unguarded `JSON.parse(readFileSync(...))` on that same file (lines 67-70). There is no temp-file-plus-rename atomic write, and no corruption handling around parse failures.

That leaves a bad partial-failure mode: if the process is interrupted, the disk fills, or the write is otherwise torn while recording a successful phase at `src/subcommands/govern.ts:779-789`, the next govern run will hit `resolvePhaseCheckpointStatuses()` (`src/subcommands/govern.ts:417-428`) and throw a raw `SyntaxError` while reading the truncated JSON. Because this checkpoint store is now a prerequisite for both `--phase` advancement and whole-feature govern, one damaged file can block the feature’s governance path entirely. The blast radius is high: this is durable state on the critical path, and operator interrupt mid-operation is explicitly a case this feature should survive. The fix is to persist checkpoints atomically and translate parse/validation failures into a deterministic govern-level refusal with remediation, rather than letting corrupt JSON crash the command.

### AUDIT-20260614-46 — Fleet negotiation accepts invalid requested prompt sizes

Finding-ID: AUDIT-20260614-46
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/fleet-negotiation.ts:14-31

`negotiateFleet()` validates `requireModels`, but it does not validate `requestedPromptBytes`. Negative values cause every enforced and monitored lane to be accepted, while `NaN` causes neither the accepted nor rejected filters to include capacity-based lanes correctly. That produces misleading governance output instead of an explicit operator-facing error.

The blast radius is medium because downstream callers relying on this as a gate can get a false accepted fleet for nonsensical input. A fix should require `requestedPromptBytes` to be a positive finite integer before filtering lanes.

### AUDIT-20260614-47 — Boundary sizing treats invalid byte counts as valid measurements

Finding-ID: AUDIT-20260614-47
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/phase-boundary-sizing.ts:26-72

`estimateBoundary()`, `measureBoundaryFit()`, and `assertBoundaryFits()` accept negative, fractional, infinite, and `NaN` byte counts without validation. For example, a negative `measuredPromptBytes` will return `disposition: 'fits'`, and `NaN` will return `boundary-too-large` without explaining that the measurement itself is invalid.

This is a governance primitive, so consumers acting on the returned disposition need the measurement contract to be strict. The practical impact is incorrect phase-boundary evidence when an upstream measurement bug passes invalid numbers through. A reasonable fix is to reject non-finite, non-integer, or negative byte counts, and require `activeFleetEnvelopeBytes` to be a positive integer.

## 2026-06-14 — audit-barrage lift (20260614T092909865Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-48 — Partial `fleet-knowledge.yaml` disables the advertised derived-envelope fallback

Finding-ID: AUDIT-20260614-48 (codex-02 + codex-01 + codex-02; cross-model)
Status:     open
Severity:   high
Per-lane:   codex=low, codex-gpt5=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/lane-capabilities.ts:81-116

`loadLaneCapabilities()` is written as if `fleet-knowledge.yaml` is optional and missing entries can fall back to `deriveEnvelopeBytes()` (`normalizeLaneCapability()` handles `knownEnvelope === undefined` at lines 56-66). But `readFleetKnowledge()` rejects any file whose lane set is not an exact match for the configured barrage lanes (lines 105-116). That means the moment an installation has a `fleet-knowledge.yaml`, adding one new configured lane without updating that file causes the whole load to throw before any fallback can run.

The blast radius is feature-blocking on upgrades and partial rollouts: a repo that previously worked can stop loading lane capabilities entirely because one lane is newly configured. A reasonable fix is to keep rejecting unknown lanes, but allow missing lanes to fall through to `deriveEnvelopeBytes()` so the fallback path is real instead of dead code whenever the YAML file exists.

### AUDIT-20260614-49 — Checkpoint scope canonicalization is not path-separator stable, so Windows-style paths hash as different scopes

Finding-ID: AUDIT-20260614-49
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/checkpoint-state.ts:91-127

`canonicalizeScopePaths()` only trims trailing `/` and compares prefixes using `/` (`path.replace(/\/+$/, '')` and `path.startsWith(\`${kept}/\`)` at lines 94-100). Later, `digestScopedPath()` hashes the raw `rel` string into the fingerprint at lines 111-112. If callers ever supply Windows-style relative paths such as `src\foo.ts`, the same logical scope can produce a different fingerprint than `src/foo.ts`, and parent/child deduplication also stops working for backslash-separated inputs.

The blast radius is persistent false checkpoint invalidation on a supported cross-platform CLI surface: unchanged governed content can look stale purely because path spelling differs by separator convention. A reasonable fix is to normalize governed paths to one separator form before deduplication and before hashing, rather than mixing raw input strings into the fingerprint.

### AUDIT-20260614-50 — Fleet negotiation accepts nonsensical prompt sizes

Finding-ID: AUDIT-20260614-50
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/fleet-negotiation.ts:11-38

`negotiateFleet` validates `requireModels`, but it does not validate `requestedPromptBytes` before comparing it to lane envelopes. A negative request accepts every enforced/monitored lane, while `NaN` rejects every lane without listing any `rejectedLanes` because both comparison branches evaluate false. That creates misleading governance output for malformed payload measurements.

Blast radius is medium: normal callers with valid measured byte counts will work, but a bad measurement or parse error can turn into a false accept or an incoherent failure. A reasonable fix is to require `requestedPromptBytes` to be a positive finite integer before filtering lanes.

## 2026-06-14 — audit-barrage lift (20260614T093203957Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-51 — Missing fleet-knowledge entries silently fall back to derived envelopes instead of failing

Finding-ID: AUDIT-20260614-51 (codex-01 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   codex=medium, codex-gpt5=high
Decision:   agreement (gate-counted medium)
Surface:    `src/govern/lane-capabilities.ts:39-46, 92-133`

`loadLaneCapabilities()` reads `.stack-control/fleet-knowledge.yaml` and passes the configured lane names into `readFleetKnowledge()` (`:39-46`), but `readFleetKnowledge()` only rejects unknown names and then returns a partial map (`:123-133`). The computed `missing` set at line 126 is never used. That means a fresh install or upgrade with an incomplete `fleet-knowledge.yaml` quietly drops into `deriveEnvelopeBytes()` for the missing lanes instead of raising an actionable configuration error.

The blast radius is high because this is governance code deciding whether a prompt fits the active fleet. A partially populated fleet-knowledge file changes negotiation behavior without any visible failure, and the fallback is explicitly based on timeout heuristics rather than real prompt-capacity data. In this repo, silent fallback is called out as a bug-factory. A reasonable fix is to make missing configured lanes a hard error, with the missing lane names listed in the exception, unless the design intentionally supports per-lane opt-out and documents that contract elsewhere.

### AUDIT-20260614-52 — Phase checkpoint writes are racy within a single process

Finding-ID: AUDIT-20260614-52 (codex-03 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   codex=medium, codex-gpt5=medium
Decision:   agreement (gate-counted medium)
Surface:    `src/govern/checkpoint-state.ts:50-59`

`writePhaseCheckpoint()` stages writes through a temp file named only by `process.pid` (`const tempPath = \`${path}.tmp-${process.pid}\`` at line 56) and then renames it into place. If the same Node process writes the same checkpoint twice concurrently, both calls target the same temp path. One call can rename the temp file out from under the other, producing nondeterministic `ENOENT` failures or last-writer-wins content that was never intended.

The blast radius is medium because this does not break the happy path for strictly serialized writes, but it creates flaky state persistence as soon as phase governance is parallelized or retried inside one CLI invocation. The reasonable fix is to use a per-write unique temp name, such as `mkdtemp`/random suffix, so atomic rename remains atomic for each caller rather than shared across concurrent calls.

### AUDIT-20260614-53 — Boundary sizing accepts nonsensical byte counts without validation

Finding-ID: AUDIT-20260614-53 (codex-02 + codex-03; cross-model)
Status:     open
Severity:   medium
Per-lane:   codex=medium, codex-gpt5=medium
Decision:   agreement (gate-counted medium)
Surface:    `src/govern/phase-boundary-sizing.ts:28-57`

The boundary-sizing helpers accept raw numeric inputs and never validate them. `estimateBoundary()` multiplies `paths.length * averageBytesPerPath` directly (`:28-42`), and `measureBoundaryFit()` compares `measuredPromptBytes <= activeFleetEnvelopeBytes` directly (`:45-57`). Negative numbers, `NaN`, or non-integer values therefore flow through as if they were legitimate measurements, and `assertBoundaryFits()` will happily accept a malformed measurement when the comparison happens to evaluate truthily.

The blast radius is medium because these functions are governance gates: if an upstream measurement bug produces `NaN` or a negative byte count, the phase can be recorded as fitting when it never should have passed. `negotiateFleet()` in the same diff validates its numeric inputs, so this surface is inconsistent with the rest of the feature. A reasonable fix is to enforce positive integer byte counts and reject invalid envelope values before producing either an estimate or a fit verdict.

## 2026-06-14 — audit-barrage lift (20260614T093501359Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-54 — Derived “maxPromptBytes” is not a real capacity limit, so fresh installs can reject governable payloads

Finding-ID: AUDIT-20260614-54
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/lane-capabilities.ts:87-96, src/govern/phase-boundary-sizing.ts:29-75

`deriveEnvelopeBytes()` manufactures a hard `maxPromptBytes` from `timeoutFloorSeconds / timeoutSecsPerKb` (`src/govern/lane-capabilities.ts:87-96`). Algebraically, that value is only the crossover point where the timeout stops being governed by the floor and starts being governed by the slope; it is not a maximum payload the lane can carry. The new boundary helpers then treat that invented value as an actual ceiling (`fitsActiveFleet` / `boundary-too-large` in `src/govern/phase-boundary-sizing.ts:29-75`). For any lane that relies on the documented derived-timeout path instead of `fleet-knowledge.yaml`, large prompts will be rejected even though the lane’s timeout model is explicitly linear and can budget more time for larger payloads.

The blast radius is concrete: a fresh install with no `.stack-control/fleet-knowledge.yaml` is an intended supported state, but this code turns it into a false-negative governor for bigger phases. Operators will see `fleet negotiation failed` or `boundary-too-large` before the barrage even runs, not because the lane cannot audit the payload, but because the code converted a timeout calibration slope into a fake byte cap. A reasonable fix is to stop deriving `maxPromptBytes` from the timeout pair at all: either require explicit fleet knowledge for any surface that needs a hard capacity number, or represent “capacity unknown, timeout derivable” as a separate state and avoid boundary rejection on that basis.

### AUDIT-20260614-55 — Checkpoint records can claim stale governed paths while freshness only checks the hash

Finding-ID: AUDIT-20260614-55
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/checkpoint-state.ts:78-84, src/govern/checkpoint-state.ts:205-224

`isCheckpointFresh` only compares `record.scopeFingerprint` to the caller-provided fingerprint, and `readPhaseCheckpoint` accepts `governedPaths` without canonicalizing or validating that they match the paths used to recompute that fingerprint. A checkpoint file can therefore carry misleading `governedPaths` metadata while still being treated as fresh if the stored fingerprint matches the current recomputation.

The blast radius is medium: the hash check may still protect the actual gate if callers always recompute from trusted paths, but downstream audit/log consumers can act on incorrect governed-path provenance. A reasonable fix is to canonicalize and validate `governedPaths` on read/write, and either include a path-set equality check in freshness or provide a freshness API that receives the current governed paths and checks both path set and fingerprint.

### AUDIT-20260614-56 — Fleet knowledge accepts fractional byte limits

Finding-ID: AUDIT-20260614-56
Status:     open
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/govern/lane-capabilities.ts:117-119

`max_prompt_bytes` is validated as a finite positive number, but not as an integer. That allows values like `24576.5` into `LanePayloadEnvelope.maxPromptBytes`, even though every consuming API treats prompt size as bytes and `negotiateFleet` requires `requestedPromptBytes` to be an integer.

The blast radius is low because fractional thresholds only affect edge comparisons at a byte boundary, but byte capacity should not be fractional and the accepted type contract implies an integer. Add `Number.isInteger(lane.max_prompt_bytes)` to the validation and keep the error message explicit.

### AUDIT-20260614-57 — Boundary sizing can produce unsafe integer estimates

Finding-ID: AUDIT-20260614-57
Status:     open
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/govern/phase-boundary-sizing.ts:32-43, src/govern/phase-boundary-sizing.ts:88-92

`assertPositiveInteger` accepts any JavaScript integer, including values above `Number.MAX_SAFE_INTEGER`, and `estimateBoundary` multiplies `paths.length * averageBytesPerPath` without checking the result is safe. Large generated path lists or bad caller input can silently lose precision and mark a boundary as fitting or not fitting based on a rounded estimate.

The blast radius is low for normal repository sizes, but this is governance code deciding whether an audit payload fits a fleet envelope. Use `Number.isSafeInteger` for inputs and verify `estimatedPromptBytes` is also safe before returning the estimate.

## 2026-06-14 — audit-barrage lift (20260614T171955355Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-58 — Checkpoint freshness ignores the checkpoint contract, so upgraded governance can silently trust stale passes

Finding-ID: AUDIT-20260614-58
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    `src/govern/checkpoint-state.ts:11-17`, `src/govern/checkpoint-state.ts:71-87`

`PhaseCheckpointRecord` stores `checkpoint`, `auditLogSection`, and a hardcoded `version`, but `isCheckpointFresh()` only compares `record.scopeFingerprint` against a newly computed fingerprint of governed files. That means an existing checkpoint remains "fresh" whenever the audited files are unchanged, even if the checkpoint semantics changed in code, the audit log section name changed, or the checkpoint protocol itself was strengthened in a new release.

The blast radius is governance bypass on upgrade: an adopter can pull a stricter audit implementation and still have old checkpoint files accepted without rerunning the phase gate, as long as the scoped content did not change. The evidence is the narrow freshness predicate at lines 71-77, contrasted with the additional contract-bearing fields persisted on the record at lines 11-17 that are never consulted for freshness. A reasonable fix is to version the checkpoint contract into freshness evaluation: either include checkpoint identity/version fields in the invalidation key, or treat mismatched `checkpoint` / `auditLogSection` / schema version as stale and require a rerun.

### AUDIT-20260614-59 — Intermediate symlink components can escape the installation root

Finding-ID: AUDIT-20260614-59
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/checkpoint-state.ts:111-144

`resolveScopedPath()` checks lexical containment with `resolve()`/`relative()`, and `digestScopedPath()` rejects only when the final path itself is a symlink (`lstatSync(abs).isSymbolicLink()`). That misses paths where an intermediate directory component is a symlink, such as `governed/link-to-outside/file.md`: the final `lstatSync()` sees the target file, not the symlinked parent, and `readFileSync(abs)` can digest content outside the installation root.

The blast radius is high because this code is explicitly a governance checkpoint primitive for scoped paths. If shipped as-is, a checkpoint can silently fingerprint out-of-root content while still appearing to enforce “must not be a symlink” and “must not escape the installation root.” A reasonable fix is to validate each path component with `lstatSync()` before descending, or compare `realpathSync()` results against the real installation root while still rejecting symlink components according to the stated policy.

## 2026-06-14 — audit-barrage lift (20260614T172207382Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-60 — Derived lane envelopes understate actual prompt capacity and can reject viable fleets

Finding-ID: AUDIT-20260614-60 (codex-02 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   codex=high, codex-gpt5=high
Decision:   agreement (gate-counted high)
Surface:    `src/govern/lane-capabilities.ts:87-97`

`deriveEnvelopeBytes()` computes the fallback prompt envelope as `floor(timeoutFloorSeconds / timeoutSecsPerKb) * 1024` bytes. That is not the same contract the runtime actually uses. The existing timeout derivation is `max(floor, ceil(secs_per_kb × payload_kb))` (`src/scope-discovery/audit-barrage/timeout-derivation.ts:1-49`), which means payloads larger than `floor / secsPerKb` are still valid: they simply receive a proportionally larger timeout. Under the new logic, any lane without `fleet-knowledge.yaml` is treated as incapable of prompts above that threshold even though the barrage runtime would run them normally.

The downstream blast radius is feature-visible, not cosmetic. `runProtocol()` and `preflightNegotiatedFleet()` both use these envelopes to decide whether a lane is eligible before running the barrage, so a healthy multi-model fleet can be rejected with `fleet negotiation failed` purely because the fallback envelope is underestimated. The new test only asserts the derived envelope is “greater than 0” (`src/__tests__/govern/lane-capabilities.test.ts:35-42`), so this contract mismatch would ship unnoticed. A reasonable fix is to stop inferring a hard `maxPromptBytes` from the timeout slope at all, or encode a different capability model that matches the runtime’s actual linear-scaling behavior instead of turning the timeout floor into a false upper bound.

### AUDIT-20260614-61 — Phase checkpoint storage trusts symlinked state roots outside the installation

Finding-ID: AUDIT-20260614-61
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/govern/checkpoint-state.ts:39-63`, `src/govern/checkpoint-state.ts:66-80`

The new checkpoint persistence code carefully rejects symlinks in governed payload paths, but it does not apply the same isolation to the checkpoint files themselves. `checkpointDir()`/`checkpointPath()` just `join()` under `.stack-control/govern/phase-checkpoints`, and `writePhaseCheckpoint()` / `readPhaseCheckpoint()` then `mkdirSync`, `writeFileSync`, `renameSync`, and `readFileSync` whatever path resolves there. If `.stack-control/govern` or a feature-specific checkpoint directory is a symlink, this code will read or write checkpoint JSON outside the installation root with no refusal.

That matters because these records are later used to decide whether earlier phases are `current`, `stale`, or `missing`. A symlinked checkpoint directory can therefore make one installation trust another installation’s governance state, or write governance markers into an arbitrary external location, which breaks the installation-isolation guarantees this feature is trying to add. The tests cover symlink rejection for governed source paths (`src/__tests__/govern/checkpoint-state.test.ts:175-201`) but there is no corresponding check for the checkpoint storage path itself. A fix should validate the checkpoint directory chain the same way `resolveScopedPath()` validates governed paths: reject symlinked ancestors and anything that resolves outside `installationRoot` before reading or writing checkpoint files.

### AUDIT-20260614-62 — Fleet knowledge accepts fractional byte limits

Finding-ID: AUDIT-20260614-62
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/govern/lane-capabilities.ts:119`

`readFleetKnowledge` validates `max_prompt_bytes` with `typeof === 'number'`, `Number.isFinite`, and `>= 1`, but it does not require an integer. That means a YAML value like `24576.5` is accepted as a byte ceiling and then used by fleet negotiation as a hard prompt envelope.

The downstream blast radius is medium: this likely will not break normal hand-written config, but it makes the governance primitive accept a nonsensical capacity value and can create boundary decisions around impossible byte counts. A reasonable fix is to require `Number.isInteger(lane.max_prompt_bytes)` and keep the existing positive finite check.

## 2026-06-14 — audit-barrage lift (20260614T172448374Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-63 — `fleet-knowledge.yaml` became a hard runtime dependency, but the diff does not add any install/migration surface for it

Finding-ID: AUDIT-20260614-63
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    `src/govern/lane-capabilities.ts:44-90` and missing setup/doctor/template updates elsewhere in the diff

`loadLaneCapabilities()` now always resolves `.stack-control/fleet-knowledge.yaml` (`KNOWLEDGE_REL` at lines 44-49) and `normalizeLaneCapability()` refuses to proceed unless every configured lane has a `max_prompt_bytes` entry (`requireKnownEnvelope()` at lines 80-90). The new tests explicitly lock that in: a missing file is a hard failure, not an advisory condition. That means govern has acquired a new mandatory operator-authored file.

The problem is that this diff only adds the runtime reader and test fixtures. It does not add any corresponding seeding, template, setup, or doctor-rule change that would create or validate `.stack-control/fleet-knowledge.yaml` ahead of time. On upgrade or fresh install, an adopter can have a valid existing barrage config and still have `govern` start failing immediately with “needs fleet-knowledge.yaml max_prompt_bytes”. The blast radius is high because this is not a corner case: it is the default state for every installation that pulls this change without already knowing to hand-author a brand-new file. A reasonable fix is to treat `fleet-knowledge.yaml` like the repo’s other governed YAML surfaces: ship a template/seed path, wire it into install/setup, and add a doctor check that fails before the govern path reaches runtime.

### AUDIT-20260614-64 — Phase checkpoint reads and writes do not defend the checkpoint directory tree against symlink escape

Finding-ID: AUDIT-20260614-64
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    `src/govern/checkpoint-state.ts:43-63` and `src/govern/checkpoint-state.ts:68-80`

`checkpointPath()` constructs `<installation>/.stack-control/govern/phase-checkpoints/<slug>/phase-<id>.json` purely by string join (lines 43-51), and both `writePhaseCheckpoint()` and `readPhaseCheckpoint()` trust that path directly (lines 55-63 and 68-80). Unlike `computeScopeFingerprint()`, which explicitly walks the path and rejects symlinks before touching content, the checkpoint persistence path never verifies that `.stack-control/govern`, `phase-checkpoints`, or the feature directory are real directories inside the installation root.

That leaves an installation-isolation hole: if any ancestor in that checkpoint tree is a symlink, writes can be redirected outside the installation root and reads can consume state from outside the repo. In this codebase, installation-boundary correctness is load-bearing, so this is more than hygiene. The blast radius is high because a governed run can silently persist or read checkpoint state in the wrong location, which makes phase gating non-deterministic across repos and can clobber unrelated files. A reasonable fix is to apply the same realpath/symlink rejection strategy used in `resolveScopedPath()` before reading or writing checkpoint files, not just when hashing governed content.

### AUDIT-20260614-65 — Fleet negotiation does not verify lane availability

Finding-ID: AUDIT-20260614-65
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/lane-capabilities.ts:18-24, src/govern/lane-capabilities.ts:69-76, src/govern/fleet-negotiation.ts:24-38

`LaneCapabilityProfile` records `binary`, but neither `loadLaneCapabilities()` nor `negotiateFleet()` checks whether that binary is actually runnable. The accepted-lane predicate only considers prompt envelope, enforcement, and liveness configuration, so a configured lane whose CLI is missing from PATH can still satisfy quorum and be returned in `acceptedFleet`.

The blast radius is high because the feature scope explicitly calls for autonomous fleet negotiation before payload assembly, including unavailable lanes. As written, an adopter with one missing CLI can pass negotiation and only fail during barrage spawn, which is exactly the degraded runtime behavior this control-plane gate is meant to prevent. A reasonable fix is to add an availability signal to `LaneCapabilityProfile`, derive it during capability loading or an injected probe, and exclude unavailable lanes from quorum with a distinct rejection reason.

### AUDIT-20260614-66 — Checkpoint files can be redirected through symlinked governance directories

Finding-ID: AUDIT-20260614-66
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/checkpoint-state.ts:37-63, src/govern/checkpoint-state.ts:159-196

The governed payload paths get careful root and symlink validation in `resolveScopedPath()`, but the checkpoint storage path itself does not. `checkpointPath()` simply joins under `.stack-control/govern/phase-checkpoints`, and `writePhaseCheckpoint()` then creates directories, writes a temp file, and renames it without checking whether `.stack-control`, `.stack-control/govern`, or a feature checkpoint directory is a symlink.

The blast radius is medium: normal installs work, but any symlinked governance directory redirects durable checkpoint reads and writes outside the installation root while still appearing successful. That undermines the mechanical phase gate because the state file can be stored in, or read from, a location the installation resolver did not authorize. A reasonable fix is to validate the checkpoint base and all existing parent components with the same realpath/lstat discipline used for governed paths before reading or writing checkpoint JSON.

## 2026-06-14 — audit-barrage lift (20260614T172912854Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-67 — Missing governed files are treated as a valid checkpoint fingerprint instead of a hard failure

Finding-ID: AUDIT-20260614-67
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/checkpoint-state.ts:131-143

`computeScopeFingerprint()` currently certifies a phase scope even when one of the governed paths does not exist. In `digestScopedPath()`, the code hashes the path name, appends the sentinel `"\0MISSING\0"`, and returns (`src/govern/checkpoint-state.ts:138-142`) instead of throwing. That means a stale or mistyped `tasks.md` entry can still produce a stable fingerprint and later be considered "current" by checkpoint freshness checks, as long as the path stays missing.

The blast radius is the phase-gating feature itself: a later phase or the composing whole-feature pass can trust a checkpoint that never actually audited the named surface. This is not just hygiene, because unattended consumers will read "current checkpoint" as "this phase's declared scope was governed." A reasonable fix is to fail loud on missing governed paths the same way the code already fails on symlinks and path escapes, so an invalid phase boundary cannot be recorded as converged.

### AUDIT-20260614-68 — The diff introduces mandatory installation state but does not add any setup/doctor/bootstrap path for it

Finding-ID: AUDIT-20260614-68
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/lane-capabilities.ts:46-56,88-146; src/govern/checkpoint-state.ts:37-64; missing changes under `src/setup/`, `templates/`, and doctor/documentation surfaces

This change makes `govern` depend on two new on-disk installation surfaces: `.stack-control/fleet-knowledge.yaml` (`src/govern/lane-capabilities.ts:46-56`) and `.stack-control/govern/phase-checkpoints/...` (`src/govern/checkpoint-state.ts:37-64`). The first is now mandatory in practice, because `requireKnownEnvelope()` throws when a configured lane has no `max_prompt_bytes` entry (`src/govern/lane-capabilities.ts:88-98`), and `readFleetKnowledge()` enforces an exact lane-name match (`src/govern/lane-capabilities.ts:135-146`). But this diff does not add any corresponding scaffold in `src/setup/`, any template alongside `templates/audit-barrage-config.yaml`, or any doctor/readme surface that teaches operators how to create or validate the new file.

That creates an upgrade trap on fresh installs and existing adopters: the code now hard-fails on missing fleet knowledge, but the repository does not appear to provision or validate that requirement anywhere in the install path. The consequence is a real feature break, not just documentation drift, because `govern` stops working until an operator reverse-engineers a file format from code or tests. A reasonable fix is to seed `fleet-knowledge.yaml` through setup/template machinery and add a doctor rule that reports missing/mismatched fleet knowledge before the user hits the govern path.

### AUDIT-20260614-69 — Duplicate lane names can satisfy the required model count

Finding-ID: AUDIT-20260614-69
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/fleet-negotiation.ts:20-45

`negotiateFleet` counts accepted lane entries, not distinct models or distinct lane names. Because `acceptedFleet` is built with `.map((lane) => lane.name)` and the pass condition is `accepted.length >= requireModels`, a caller can pass two `LaneCapabilityProfile` objects with the same `name` and satisfy `requireModels: 2` with only one independent lane represented.

That matters because the feature is explicitly about fleet negotiation across models; downstream governance could believe a multi-model audit barrage is viable when it is actually a duplicated single lane. The reasonable fix is to reject duplicate lane names before negotiation, or deduplicate by lane name before counting and reporting accepted/rejected lanes.

## 2026-06-14 — audit-barrage lift (20260614T173036386Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-70 — New required `fleet-knowledge.yaml` has no upgrade/bootstrap path, so existing installs hard-fail on first use

Finding-ID: AUDIT-20260614-70 (codex-02 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   codex=medium, codex-gpt5=high
Decision:   agreement (gate-counted medium)
Surface:    `src/govern/lane-capabilities.ts:43-49,89-142` and missing setup/doctor migration surfaces in this diff

`loadLaneCapabilities()` now makes every configured lane depend on `.stack-control/fleet-knowledge.yaml`, because `normalizeLaneCapability()` calls `requireKnownEnvelope()` for every model and that throws whenever a lane has no `max_prompt_bytes` entry (`src/govern/lane-capabilities.ts:43-49,78-87`). At the same time, `readFleetKnowledge()` enforces an exact name-for-name match with the configured barrage lanes (`src/govern/lane-capabilities.ts:123-142`). On a fresh install with no file, or on an upgrade where the lane list changed, the feature stops with a runtime error.

The blast radius is high because a downstream adopter does not get degraded behavior or a guided migration; they get a hard stop the first time this surface is exercised. I would expect this diff to also introduce one of: setup/bootstrap logic that writes the file, a doctor rule that flags the missing/stale file before runtime, or a documented migration path. None of those surfaces are present in the audited range, so the new mandatory artifact is operationally orphaned.

### AUDIT-20260614-71 — Duplicate lane names can falsely satisfy the multi-model quorum

Finding-ID: AUDIT-20260614-71
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    `src/govern/lane-capabilities.ts:51-76,89-142` and `src/govern/fleet-negotiation.ts:18-45`

The quorum logic counts array entries, not distinct lanes. `loadLaneCapabilities()` returns one `LaneCapabilityProfile` per `config.models` entry (`src/govern/lane-capabilities.ts:51-57`), and `negotiateFleet()` decides success with `accepted.length >= requireModels` after a plain `filter().map()` (`src/govern/fleet-negotiation.ts:18-45`). There is no uniqueness check on lane names in the production path. `readFleetKnowledge()` does reject duplicate names inside `fleet-knowledge.yaml`, but it does not reject duplicate configured lane names because it compares the configured names through a `Set` (`src/govern/lane-capabilities.ts:131-142`).

The consequence is that a malformed config with the same lane listed twice can produce `acceptedFleet: ['codex', 'codex']` and still return `disposition: 'accepted'` for `requireModels = 2`. That breaks the stated goal of fleet diversity while reporting success, so downstream consumers can believe they ran a multi-model audit when they actually ran one lane twice. The fix is to enforce unique lane names when loading capabilities, or to compute quorum over distinct accepted lane identities.

### AUDIT-20260614-72 — Phase checkpoint fingerprints ignore executable-bit and mode changes

Finding-ID: AUDIT-20260614-72
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/govern/checkpoint-state.ts:121-150`

`computeScopeFingerprint()` is meant to decide whether a prior phase checkpoint is still fresh, but `digestScopedPath()` only hashes the normalized path name, a directory marker, and file bytes (`src/govern/checkpoint-state.ts:121-150`). It does not include file mode or any other execution-relevant metadata from `lstatSync()`. A governed shell script or CLI wrapper can therefore change from executable to non-executable, or vice versa, without changing the fingerprint.

The blast radius is medium because it creates a false “no material change” result: governance can reuse a prior checkpoint even though the runnable behavior of the governed surface changed. In this repo, executable status is load-bearing for plugin/bin surfaces, so mode changes are not cosmetic. A reasonable fix is to include relevant `stat` metadata, at minimum the file type plus executable bits, in the hashed payload before reading file contents.

### AUDIT-20260614-73 — Checkpoint writes can leave orphan temp files on failure

Finding-ID: AUDIT-20260614-73
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/checkpoint-state.ts:49-51

`writePhaseCheckpoint` writes the checkpoint through a sibling temp file and then renames it, but if `writeFileSync` succeeds and `renameSync` fails, the `.tmp-<pid>-<uuid>` file is left in `.stack-control/govern/phase-checkpoints/...`. The fingerprint reader later walks directories recursively and includes every child in directory digests, so abandoned temp files inside governed storage can become persistent state noise and operator-visible clutter.

The blast radius is medium: this does not corrupt the target checkpoint, but it creates a failure mode that compounds under interrupts, permission errors, or cross-device/storage quirks. A reasonable fix is to wrap the write/rename in `try/catch` and remove the temp path if it exists before rethrowing the original error.

## 2026-06-14 — audit-barrage lift (20260614T173405767Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-74 — Fresh installs and upgrades now fail at runtime unless a new `fleet-knowledge.yaml` is created out of band

Finding-ID: AUDIT-20260614-74
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   single-model (gate-counted high)
Surface:    `src/govern/lane-capabilities.ts:43-92` and missing setup/doctor surfaces for `.stack-control/fleet-knowledge.yaml`

`loadLaneCapabilities()` now always routes every configured model through `requireKnownEnvelope()` (`src/govern/lane-capabilities.ts:48-53`, `82-92`). If `.stack-control/fleet-knowledge.yaml` is absent, `readFleetKnowledge()` returns an empty map (`96-101`), and the first model immediately throws `lane '<name>' needs fleet-knowledge.yaml max_prompt_bytes`. That means a fresh install or an upgraded existing installation cannot even reach fleet negotiation; governance aborts before it can classify lanes.

The blast radius is high because this is a hard startup failure on the main path, not a degraded mode. The diff introduces only a test fixture copy of `fleet-knowledge.yaml` under `src/__tests__/fixtures/...`; it does not add any companion setup, migration, doctor, or schema surface that would create or preflight the new required file in real installations. A reasonable fix is to land the runtime requirement together with installer/bootstrap and doctor validation support, or make the absence of fleet knowledge an explicit preflight error from a dedicated validation step rather than a late throw during lane normalization.

### AUDIT-20260614-75 — Empty rendered phases are treated as invalid instead of as a valid zero-byte boundary

Finding-ID: AUDIT-20260614-75
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/govern/phase-boundary-sizing.ts:43-89`

`measureBoundaryFit()` and `assertBoundaryFits()` reject `measuredPromptBytes === 0` because both flow through `assertPositiveInteger()` (`45-49`, `58-64`, `84-88`). That makes a zero-byte payload an exception case rather than producing a measurement with disposition `fits`. For sizing logic, zero is a legitimate boundary outcome whenever a phase renders no governed content after filtering, or when an empty phase is evaluated intentionally.

The blast radius is medium: it does not break every run, but unattended governance will fail on a perfectly representable edge case instead of recording a deterministic measurement. The fix is straightforward: keep `activeFleetEnvelopeBytes` strictly positive, but allow `measuredPromptBytes` to be a non-negative integer so the boundary code can distinguish “empty payload” from “invalid input” cleanly.

### AUDIT-20260614-76 — The new persisted-governance primitives land without executable coverage in the same diff

Finding-ID: AUDIT-20260614-76
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/govern/checkpoint-state.ts:1-288`, `src/govern/lane-capabilities.ts:1-152`, `src/govern/fleet-negotiation.ts:1-66`, `src/govern/phase-boundary-sizing.ts:1-97`

This change adds four new core primitives: persisted checkpoint I/O, filesystem path validation, fleet capability loading from YAML, negotiation logic, and boundary sizing. The only test-side additions in the diff are fixture files (`src/__tests__/fixtures/govern/021-audit-protocol/tasks.md`, `src/__tests__/fixtures/govern/021-fleet/fleet-knowledge.yaml`); there are no accompanying `*.test.ts` changes that exercise the contracts being introduced.

The blast radius is medium because these code paths govern persisted state and install-local configuration, where regressions tend to surface only after shipping: corrupt checkpoint handling, duplicate lane detection, missing knowledge files, symlink rejection, and oversize-boundary behavior are all load-bearing behaviors here. A reasonable fix is to add direct unit coverage for each module’s failure modes and fresh-install path, not just fixtures that imply future tests.

## 2026-06-14 — audit-barrage lift (20260614T173617695Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-77 — Fleet-knowledge lookup ignores the installation’s configured path semantics

Finding-ID: AUDIT-20260614-77 (codex-01 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   codex=high, codex-gpt5=high
Decision:   agreement (gate-counted high)
Surface:    src/govern/lane-capabilities.ts:47-110, src/config/resolve-paths.ts:16-31

`loadLaneCapabilities` hardcodes `join('.stack-control', 'fleet-knowledge.yaml')` and then falls back to a plugin-shipped template when that exact file is absent (`src/govern/lane-capabilities.ts:47-49,104-110`). That bypasses the installation path contract that already exists in `resolvePaths`, where `fleetKnowledge` is explicitly configurable via `baseDir` / `paths.fleetKnowledge` (`src/config/resolve-paths.ts:16-31`). An installation that relocates working files will therefore have its real fleet-knowledge file ignored.

The downstream blast radius is high because the govern protocol now makes fleet negotiation and boundary checks depend on this data. On a non-default installation, the code will either read stale built-in capacities from the plugin template or throw a lane-mismatch error against the wrong file, even though the operator configured a valid in-repo path. A reasonable fix is to resolve the fleet-knowledge file through the same installation-path resolver the rest of the product uses, and only read the resolved location rather than a separate hardcoded path.

### AUDIT-20260614-78 — Checkpoint reads still follow a symlinked final JSON file

Finding-ID: AUDIT-20260614-78
Status:     open
Severity:   high
Per-lane:   codex-gpt5=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/checkpoint-state.ts:67-80, src/govern/checkpoint-state.ts:201-228

`readPhaseCheckpoint` calls `assertCheckpointStoragePath` and then `readFileSync(path, 'utf8')` (`src/govern/checkpoint-state.ts:67-80`). But `assertCheckpointStoragePath` only walks `components.slice(0, -1)`, so it validates existing parent directories and never inspects the final `phase-<id>.json` entry itself (`src/govern/checkpoint-state.ts:207-228`). If that final file is a symlink, `readFileSync` will follow it.

That leaves a gap in the very surface meant to gate phase advancement. A symlinked checkpoint file can source state from outside the installation root, which means prior-phase freshness can be forged from external content or destabilized by unrelated files elsewhere on disk. The blast radius is high because unattended govern runs may accept or reject phase progression based on data the installation does not own. The fix is straightforward: reject a symlink at the final checkpoint path before reading, the same way governed paths already reject symlinks during fingerprinting.

### AUDIT-20260614-79 — Boundary estimates can silently approve an empty phase

Finding-ID: AUDIT-20260614-79
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/phase-boundary-sizing.ts:28-42

`estimateBoundary()` validates `phaseId`, `averageBytesPerPath`, and `activeFleetEnvelopeBytes`, but it does not validate that `paths` is non-empty. An empty `paths` array produces `estimatedPromptBytes = 0` and `fitsActiveFleet = true` at lines 34-40, which can make a phase with no governed surface look like a valid, fleet-sized boundary.

The blast radius is medium because this does not directly corrupt data, but it weakens the phase-control contract: an omitted or failed scope discovery result can be mistaken for a passing prospective boundary check. A reasonable fix is to reject empty `paths` with an explicit error, or add a separate disposition that distinguishes “no governed paths” from “fits active fleet.”

## 2026-06-14 — audit-barrage lift (20260614T174121098Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-80 — Fresh installs have no runtime `fleet-knowledge.yaml` to satisfy the new lane-capability contract

Finding-ID: AUDIT-20260614-80 (codex-01 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   codex=high, codex-gpt5=blocking
Decision:   agreement (gate-counted high)
Surface:    `src/govern/lane-capabilities.ts:45-55,95-97` and missing runtime surface `templates/fleet-knowledge.yaml`

`loadLaneCapabilities()` now requires every configured lane to have a `max_prompt_bytes` entry from either a project override or the default template path (`DEFAULT_KNOWLEDGE_PATH` at lines 45-55). But `readFleetKnowledge()` explicitly returns an empty map when that file is absent (lines 95-97), and `requireKnownEnvelope()` then throws for every lane. In this diff, the only new YAML is a test fixture at `src/__tests__/fixtures/govern/021-fleet/fleet-knowledge.yaml`; there is no runtime `templates/fleet-knowledge.yaml` or install scaffolding for `.stack-control/fleet-knowledge.yaml`.

The blast radius is blocking because a fresh install or upgrade that has not manually created this file cannot negotiate any fleet at all: the first capability load fails before governance can proceed. A reasonable fix is to ship the runtime template and/or seed it during setup, so the new contract exists outside test fixtures.

### AUDIT-20260614-81 — Checkpoint writes can leave torn temp files on failure

Finding-ID: AUDIT-20260614-81
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/src/govern/checkpoint-state.ts:58-63

`writePhaseCheckpoint()` writes to a unique temp path and renames it into place, but it has no cleanup path if `writeFileSync()` succeeds and `renameSync()` fails. Failures here are realistic for governed state writes: interrupted runs, permission changes, storage errors, or cross-device/path issues can leave `.json.tmp-<pid>-<uuid>` files beside real checkpoints.

The blast radius is medium because the primary checkpoint file remains protected by atomic rename, but the governance store accumulates ambiguous checkpoint-looking artifacts that neither the reader nor a doctor/cleanup surface accounts for in this diff. A reasonable fix is to wrap the write/rename sequence and unlink the temp file on failure when it exists, while preserving the original error.

### AUDIT-20260614-82 — Governed path hashing reads non-regular filesystem entries as files

Finding-ID: AUDIT-20260614-82
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    plugins/stack-control/src/govern/checkpoint-state.ts:144-158

`digestScopedPath()` rejects symlinks and recurses directories, but every other filesystem type falls through to `readFileSync(abs)`. That includes FIFOs, sockets, devices, and other special entries that can hang, throw surprising errors, or make checkpoint freshness depend on non-content filesystem state.

The blast radius is medium because `computeScopeFingerprint()` is intended to gate phase freshness over governed paths, and a broad scoped directory can encounter special files created by tools or local processes. A reasonable fix is to accept only regular files and directories after the symlink check, and fail loud with the relative path and detected unsupported type for anything else.

## 2026-06-14 — audit-barrage lift (20260614T174317931Z-audit-protocol-friction-burndown-phase-1)

### AUDIT-20260614-83 — Missing installation `fleet-knowledge` silently falls back to the repo template

Finding-ID: AUDIT-20260614-83 (codex-02 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   codex=medium, codex-gpt5=high
Decision:   agreement (gate-counted medium)
Surface:    src/govern/lane-capabilities.ts:52-58,98-103,149-155

`loadLaneCapabilities()` reads per-installation lane limits, but `readFleetKnowledge()` quietly substitutes `templates/fleet-knowledge.yaml` whenever the resolved installation file is absent (`const sourcePath = existsSync(overridePath) ? overridePath : DEFAULT_KNOWLEDGE_PATH`). That means a fresh install, an upgrade that forgot to seed `.stack-control/fleet-knowledge.yaml`, or a broken path resolution will still produce a seemingly valid capability profile using checked-in defaults rather than operator-owned data.

The blast radius is high because the rest of the governance flow treats these byte ceilings as admission control for unattended audit prompts. If the template overstates a lane’s real prompt capacity, the system will accept a fleet that cannot actually carry the rendered prompt; if it understates capacity, it will reject viable lanes. In both cases the operator gets a wrong governance decision rather than an explicit configuration error. A reasonable fix is to make the resolved installation path mandatory once this feature is enabled, with setup/migration code creating the file and runtime throwing an actionable error when it is missing instead of substituting the repo template.

### AUDIT-20260614-84 — Lane probing converts probe-tool failure into fake lane unavailability

Finding-ID: AUDIT-20260614-84
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    src/govern/lane-capabilities.ts:52-58,160-163

Binary availability is derived from `spawnSync('which', [binary], ...)` and then reduced to `result.status === 0`. If `which` itself is unavailable, not on `PATH`, or `spawnSync` errors for another environment reason, this code returns `false` and marks the lane `unavailable` instead of surfacing that the probe mechanism failed.

The consequence is a false governance outcome that looks like a real fleet-capability signal. An adopter on a stripped-down environment can end up with every lane rejected and a `negotiation-failed` result even though the configured binaries are present and runnable. That is a medium-severity defect because it blocks the feature in some environments and misattributes the failure to model availability. The fix is to treat probe execution failure as an explicit error path, or use a shell-native probe with error handling that distinguishes “binary not found” from “probe infrastructure failed.”

### AUDIT-20260614-85 — New persisted governance artifacts ship without any matching doctor/schema surface

Finding-ID: AUDIT-20260614-85
Status:     open
Severity:   medium
Per-lane:   codex-gpt5=medium
Decision:   single-model (gate-counted medium)
Surface:    Missing validation/migration surface for `.stack-control/govern/phase-checkpoints/phase-*.json` and `.stack-control/fleet-knowledge.yaml` introduced by `src/govern/checkpoint-state.ts` and `src/govern/lane-capabilities.ts`

This diff introduces two operator-editable/on-disk contracts: JSON phase checkpoint records (`writePhaseCheckpoint()` in `src/govern/checkpoint-state.ts`) and `fleet-knowledge.yaml` (`src/govern/lane-capabilities.ts`, plus `templates/fleet-knowledge.yaml`). I do not see any corresponding doctor rule, schema, or migration/update surface in the diff for either artifact. The only validation happens at point-of-use during runtime reads.

The blast radius is medium because malformed or stale files now fail late, inside governance execution, instead of being caught by the repo’s normal install/doctor discipline. That is especially risky for upgrades: an older installation can carry no `fleet-knowledge.yaml` or a stale lane set until an audit run touches it. A reasonable fix is to add these artifacts to the existing doctor/schema pipeline and setup/migration flow so the repo can detect missing, stale, or malformed state before governance commands depend on it.

### AUDIT-20260614-86 — Empty governed path sets produce a reusable checkpoint fingerprint

Finding-ID: AUDIT-20260614-86
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/checkpoint-state.ts:102-110, src/govern/checkpoint-state.ts:113-119

`computeScopeFingerprint()` accepts an empty `paths` array, and `canonicalizeScopePaths()` also filters empty strings without checking whether anything remains. The result is the SHA-256 digest of no scoped content, which is stable forever. If a phase scope discovery bug, malformed tasks file, or caller mistake passes `[]`, the checkpoint can be marked fresh without any governed file participating in the staleness decision.

The blast radius is high because this is a governance bypass for the feature’s checkpoint contract: downstream code can persist or compare a checkpoint that never changes with implementation edits. A reasonable fix is to reject empty canonical governed path sets before hashing, with an error that identifies the feature/phase caller context where possible.
