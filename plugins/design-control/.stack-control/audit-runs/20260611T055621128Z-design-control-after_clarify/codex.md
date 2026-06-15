### `recordDerivation` can leave an orphaned snapshot if sidecar write fails

Finding-ID: AUDIT-BARRAGE-codex-01  
Status:     open  
Severity:   medium  
Surface:    `plugins/design-control/src/provenance/derived.ts:102-118`

`recordDerivation` writes `<surfaceId>.derived-snapshot.html` first, then writes `<surfaceId>.provenance.json`. If the process is interrupted, the disk fills, permissions change, or JSON sidecar write otherwise fails after line 104, the directory is left with a snapshot but no valid provenance record. The workplan says `recordDerivation` “writes snapshot + zod-validated sidecar in one move”; this implementation is sequential non-atomic writes.

The blast radius is medium: normal consumers will usually succeed, but the failure mode creates ambiguous provenance state in the operator’s artifact directory. A later unattended agent or operator may see the snapshot and assume derivation was recorded, while `loadProvenance` fails loud because the sidecar is absent. A reasonable fix is to write both artifacts via temporary files and atomic renames, with cleanup on failure, or to write the sidecar first with a temporary snapshot reference and only promote both names once both writes have succeeded.
