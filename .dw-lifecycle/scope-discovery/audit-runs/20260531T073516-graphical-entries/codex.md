No findings.

The change adds a centralized `STORAGE_SCHEMA_VERSION` and moves the shared dashboard prefix to `deskwork:dashboard:v2:` in `plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts:21-34`. The affected dashboard controllers appear to build keys through that shared prefix, including focus/visibility, collapse, view-mode, lane order, lane stack, and presets. The added regression seeds the old unversioned visibility key and verifies it is ignored, which covers the production stale-key shape from AUDIT-20260530-26.

Residual risk: old unversioned keys are ignored rather than removed, so browser storage can retain unused entries. That is storage hygiene rather than a restore bug unless the product explicitly requires physical cleanup on version bump.
