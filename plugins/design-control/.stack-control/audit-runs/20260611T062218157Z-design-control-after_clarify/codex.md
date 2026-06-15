### `wireframeFile` can still escape the provenance directory

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:170-191, 337-361; plugins/design-control/skills/wireframe/SKILL.md:66-76

`surfaceId` is now validated as a portable filename before path construction, but the driving artifact filename is not. `recordDrivingWireframe` accepts `wireframeFile: string`, joins it directly with `input.dir` at line 176, stores it in provenance at line 187, and `verifyDrivingWireframe` later joins the stored value again at line 341. The skill says `<wireframe-filename>` is “relative to `<wireframes-dir>`” at lines 71-72, but the code accepts `../outside.html`, `nested/file.html`, or an absolute path if Node’s `join` semantics are relied on by future callers differently than expected. That means a driving provenance record can bind to a file outside the chosen wireframes directory, or to a nested path the operator did not intend as the surface’s canonical wireframe.

Blast radius is medium: this is operator/agent-supplied input rather than hostile external input, so the realistic failure is misplaced provenance and later verification of the wrong artifact, not an attacker exploit. It still compounds because driving provenance is a certification surface. A reasonable fix is to validate `wireframeFile` as a plain dir-relative filename, or explicitly support subdirectories with `resolve` + containment checks and document that contract.

### `recordDerivation` can clobber an existing snapshot before failing to commit the sidecar

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:230-263

`recordDerivation` stages both files, then renames `stagedSnapshot` to `snapshotTarget` at line 251 before renaming the sidecar at line 252. `assertAppendOnce` only checks the sidecar path, so if `<surfaceId>.derived-snapshot.html` already exists without a sidecar, the rename overwrites it on POSIX. If the subsequent sidecar rename fails, the catch removes only temp paths, leaving the pre-existing snapshot replaced by this failed attempt’s bytes.

Blast radius is medium because orphan snapshots are supposed to be inert, but this violates the “no half-state when a write fails” claim and can destroy operator artifact state in a recovery scenario. The fix should treat the snapshot target as part of the append-once commit too: refuse if either final target already exists, or use non-overwriting creation/link semantics for promotion.
