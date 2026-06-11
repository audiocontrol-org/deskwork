### `wireframeFile` can escape the provenance directory

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:170-191, 337-361; plugins/design-control/skills/wireframe/SKILL.md:66-76

`surfaceId` is validated before path construction, but the driving artifact filename is not. `recordDrivingWireframe` accepts `wireframeFile: string`, joins it directly with `input.dir`, stores that value in the sidecar, and `verifyDrivingWireframe` joins the stored value again. The skill describes `<wireframe-filename>` as relative to `<wireframes-dir>`, but the implementation accepts `../outside.html`, nested paths, and other non-canonical names.

Blast radius is medium: this is operator or agent input rather than hostile web input, so the realistic failure is binding provenance to the wrong artifact or a file outside the intended wireframe directory. Since driving provenance certifies an implementation claim, that mistake compounds. Validate `wireframeFile` as a plain filename, or explicitly support subdirectories with `resolve` plus containment checks and document that contract.

### `recordDerivation` can overwrite an orphan snapshot before the sidecar commit succeeds

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/provenance/derived.ts:230-263

`recordDerivation` checks append-once only for the sidecar path. It then renames `stagedSnapshot` to `snapshotTarget` before renaming the sidecar. On POSIX, `renameSync(stagedSnapshot, snapshotTarget)` replaces an existing file, so if `<surfaceId>.derived-snapshot.html` already exists without a sidecar, the function can overwrite it. If the later sidecar rename fails, cleanup removes only temp paths and the prior snapshot remains replaced by bytes from a failed operation.

Blast radius is medium because orphan snapshots are normally inert, but this violates the all-or-nothing provenance claim and can destroy operator artifact state during recovery from a previous partial run. Treat the snapshot target as part of the append-once commit: refuse if either final target exists, or use non-overwriting promotion semantics.
