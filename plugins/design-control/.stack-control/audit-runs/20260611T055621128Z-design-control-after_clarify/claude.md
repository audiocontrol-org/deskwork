### Provenance mode can be silently rewritten — a later `recordDrivingWireframe` call overwrites a `derived` record and launders the exact claim the module exists to prevent

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:84-98 (recordDrivingWireframe), 100-127 (recordDerivation), 70-75 (writeProvenance)

`writeProvenance` unconditionally `writeFileSync`s `<surfaceId>.provenance.json`. Nothing in `recordDrivingWireframe` or `recordDerivation` checks whether a sidecar already exists, so a surface recorded as `derived` (with its snapshot + hash baseline) can be flipped to `driving` with a single later call — after which `wireframeDroveImplementation` returns `true` and `checkDerivedAcceptance` passes unconditionally (lines 144-146 short-circuit on non-derived mode). The module's own header (lines 15-17) states the design goal: *"provenance distinguishes the two modes precisely so the claim cannot be laundered through acceptance."* The overwrite path is a one-call laundering vector that bypasses acceptance entirely. The derivation-time snapshot is also silently orphaned (the `.derived-snapshot.html` stays on disk but nothing references it), erasing the audit trail.

Blast radius: this is a library invoked under skill direction, so it requires a wrong call rather than happening by default — but the population this discipline explicitly defends against is an unattended agent looking for the path of least resistance past a failing `derived-unedited` gate, and the cheapest such path is exactly this call. It doesn't break the feature when used correctly, hence medium rather than high. A reasonable fix: `writeProvenance` (or both record functions) fails loud when a sidecar already exists for the surface, with mode transitions requiring an explicit, separately-named operation (or at minimum refusing the `derived → driving` direction outright, since that transition is semantically never legitimate).

### `surfaceId` is interpolated into filesystem paths with no filename validation — `..` escapes the provenance dir, `/` breaks round-tripping

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:66-67 (sidecarPath), 108 (snapshotFile), 31, 44 (zod schemas)

The zod schemas constrain `surfaceId` only to `z.string().min(1)`, but the id is used directly to build paths: `join(dir, `${surfaceId}.provenance.json`)` and `${surfaceId}.derived-snapshot.html`. A `surfaceId` of `../something` writes the sidecar and snapshot *outside* the operator-chosen provenance directory; an id containing `/` (e.g. `studio/content-browser` — an entirely plausible operator-meaningful id, given the codebase's route-style naming like `/dev/editorial-studio` which appears in this very diff's tests as a `source` value) either ENOENTs on write or silently lands in an unintended subdirectory. `loadProvenance` joins identically, so the misplacement round-trips invisibly rather than failing loud.

Blast radius: the id is operator/agent-supplied prose, not attacker input, so the realistic failure is accidental misplacement and confusing ENOENTs rather than exploitation — a design defect that compounds as more surfaces are recorded, hence medium. Fix: validate `surfaceId` against a portable-filename pattern (e.g. `/^[a-z0-9][a-z0-9._-]*$/i`) in the zod schema and at record time, failing loud with a message naming the constraint — consistent with the project's no-fallbacks rule.

### The derived-acceptance gate and provenance recording have no executable firing surface — the skill directs the agent to call raw TypeScript functions

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    plugins/design-control/skills/wireframe/SKILL.md:64-72 (step 6); plugins/design-control/src/provenance/derived.ts (whole module); plugins/design-control/bin/ (missing sibling to check-wireframe)

The lint gate got a proper seam: `bin/check-wireframe` → `check-wireframe-cli.ts` → tested `runCheckWireframe`, and SKILL.md step 5 quotes the exact command. The provenance path got none. SKILL.md step 6 instructs: *"record it via `recordDrivingWireframe` (`@/provenance`)"* — but an agent executing the skill has no documented way to invoke a TypeScript export. In practice it will improvise a `tsx -e` one-liner per invocation, which is precisely the "ad-hoc shell instead of proper scripts under `bin/`" anti-pattern the repo's plugin conventions forbid — or it will quietly skip the step, since unlike the lint there is no exit-code gate to fail. The same applies to `checkDerivedAcceptance`: it is a "non-negotiable" acceptance gate per the spec, yet nothing in the diff (no bin verb, no skill step, no caller anywhere) ever fires it. The plugin's own thesis, quoted in this SKILL.md (lines 13-16), is that *"policy is enforced by a process, not a rule"* — the lo-fi property got the process; the provenance property got a rule.

Blast radius: provenance recording will be inconsistent or absent across real wireframes, and the derived gate exists only as a tested library function nobody calls — the discipline degrades silently rather than breaking loudly, which is the compounding-design-issue shape, hence medium. Fix: a `bin/record-provenance` (or `bin/wireframe-provenance` with `record-driving | record-derived | check-acceptance` subcommands) mirroring the `check-wireframe` shim pattern, with SKILL.md steps quoting the commands the way step 5 does.

### A `driving` provenance record carries no binding to the artifact it certifies — no filename, no hash

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:31-36 (drivingSchema) vs 38-53 (derivedSchema)

The `derived` record stores `snapshotFile`, `snapshotSha256`, and `source` — enough to identify and tamper-check its baseline. The `driving` record stores only `surfaceId`, `mode`, and `createdAt`. `wireframeDroveImplementation` therefore certifies a claim ("this wireframe drove the implementation") about an artifact the record cannot identify: the wireframe HTML next to the sidecar can be wholly replaced after recording and the claim still holds, with no tamper evidence of the kind the derived path deliberately built (lines 148-154). The asymmetry is visible side-by-side in the two schemas.

Blast radius: a downstream consumer (the future referee, or any "did a wireframe drive this change?" check) gets a `true` that is unfalsifiable against the on-disk artifact. Nothing breaks today, but every claim recorded under this schema is permanently unverifiable, and a later schema fix can't retro-bind old records — the cost compounds with adoption, hence medium. Fix: record the wireframe's filename and sha256 at `recordDrivingWireframe` time (the wireframe file already exists at that point per SKILL.md step ordering — lint at step 5 precedes provenance at step 6), and have `wireframeDroveImplementation` (or a sibling verifier) check the hash the way `checkDerivedAcceptance` checks the snapshot.

### `recordDrivingWireframe` takes a parameter named `derivedAt` for a wireframe that is by definition not derived

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    plugins/design-control/src/provenance/derived.ts:85-88; src/__tests__/provenance/derived.test.ts:118-122

The driving-path recorder's optional timestamp input is named `derivedAt` (`input: { dir; surfaceId; derivedAt?: Date }`), feeding the sidecar field `createdAt`. The name contradicts the mode it records — "derived" is the *other* mode, and the module spends its entire header explaining why the two must never be confused. The tests dutifully pass `derivedAt` when recording a driving wireframe (derived.test.ts lines 118-122), which reads as a category error at every call site.

Blast radius: no behavioral consequence — the value lands in `createdAt` correctly — but this is an exported public API (`@/provenance`), so the misleading name propagates to every future caller and to the eventual `bin/` verb's flag naming. Hence low. Fix: rename to `createdAt?` (or `at?`) in both record functions for symmetry, while the call-site count is still two test files.

### `loadProvenance` does not verify the sidecar's inner `surfaceId` matches the requested one

Finding-ID: AUDIT-BARRAGE-claude-06
Status:     open
Severity:   low
Surface:    plugins/design-control/src/provenance/derived.ts:129-139

`loadProvenance(dir, surfaceId)` resolves the file by name and zod-validates its shape, but never asserts `parsed.surfaceId === surfaceId`. A sidecar copied or renamed to another surface's filename (an easy mistake when seeding a second surface from a first) loads cleanly and flows into `checkDerivedAcceptance`, whose finding message then reports the *argument's* surface id (line 158) while gating against the *other* surface's snapshot and hash — a confusing mixed-identity verdict instead of a loud failure.

Blast radius: requires a file-management mistake to trigger, and the resulting behavior is confusing rather than silently wrong in a damaging direction (the hash check still fires against whatever snapshot the record names). Hence low. Fix: one equality check after parse, throwing with both ids in the message.
