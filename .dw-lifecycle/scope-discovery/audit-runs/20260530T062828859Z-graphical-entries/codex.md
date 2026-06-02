### Template ids can escape the pipeline directories

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   high
Surface:    packages/core/src/pipelines/loader.ts:98-116, packages/core/src/pipelines/types.ts:89

`loadPipelineTemplate` only rejects the empty string, then interpolates `id` directly into `join(projectOverridesDir(projectRoot), `${id}.json`)` and `join(PLUGIN_DEFAULTS_DIR, `${id}.json`)`. Because `PipelineTemplateSchema` also accepts any non-empty `id`, a path-shaped id such as `../template` or `nested/foo` can resolve outside `.deskwork/pipelines/` or `dist/pipelines/` before validation runs. The later filename/id equality check does not close the boundary; it only requires the escaped JSON file to declare the same path-shaped id.

This matters because template ids will be read from operator-authored config in downstream phases, and the resolver is supposed to be a scoped override resolver, not a general filesystem JSON loader. A reasonable fix is to introduce a canonical template-id regex, for example lowercase kebab-case without separators, enforce it in `PipelineTemplateSchema.id`, reject invalid ids at the top of `loadPipelineTemplate`, and have `listAvailablePipelineTemplates` ignore or error on filenames that do not match the same id contract.
