### `isPopulatedGroupEntry` is implemented but not exported from the public groups entrypoint

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    `packages/core/src/groups/index.ts:11`, `packages/core/src/groups/types.ts:39-45`

`isPopulatedGroupEntry` is introduced in `types.ts` as the predicate consumers should use when they need "group AND has at least one member", and the docblock names downstream use cases. But the package-facing barrel only exports `isArchivedEntry` and `isGroupEntry`. Since `packages/core/package.json` exposes `./groups` as the public subpath, downstream code cannot import the populated predicate from `@deskwork/core/groups` without reaching into internals.

This is a composition trap for the next group surfaces: they either duplicate the predicate, use the looser `isGroupEntry` by mistake, or import an internal path. Fix is to export `isPopulatedGroupEntry` from `packages/core/src/groups/index.ts` next to `isGroupEntry`.

### Group mutators can commit sidecar changes without the required group journal event

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   medium
Surface:    `packages/core/src/groups/operations/create.ts:106-121`, `packages/core/src/groups/operations/update.ts:84-94`, `packages/core/src/groups/operations/add-member.ts:126-145`, `packages/core/src/groups/operations/remove-member.ts:72-89`, `packages/core/src/groups/operations/archive.ts:68-77`, `packages/core/src/groups/operations/archive.ts:104-109`

Every group mutator writes the sidecar before appending its `group-*` journal event. If the journal write fails after the sidecar write, the on-disk group state is changed with no audit event, despite the feature explicitly adding six group event kinds for mutating-verb audit completeness.

This matters most for `add-member` / `remove-member` and archive/restore, where the journal is the only durable explanation of why the membership or visibility changed. A reasonable fix is to make the write+journal sequence transactional enough for this filesystem model: write a recoverable pending record, or perform a compensating sidecar restore/delete when `appendJournalEvent` fails, and add a test that forces journal append failure after sidecar write.

### Extra positional arguments are silently ignored by group subcommands

Finding-ID: AUDIT-BARRAGE-codex-03
Status:     open
Severity:   medium
Surface:    `packages/cli/src/commands/group.ts:151-163`, `packages/cli/src/commands/group.ts:182-213`, `packages/cli/src/commands/group.ts:221-248`, `packages/cli/src/commands/group.ts:274-296`, `packages/cli/src/commands/group.ts:302-318`, `packages/cli/src/commands/group.ts:324-340`

The handlers only check minimum positional counts. `show`, `create`, `update`, `add-member`, `remove-member`, `archive`, and `restore` all accept extra positionals and discard them. For example, `deskwork group <root> archive group-a group-b` archives only `group-a`; `group create slug accidental --lane default` creates `slug` and ignores `accidental`.

This is a CLI correctness issue because these verbs mutate state and the project convention prefers explicit refusal over hiding operator typos. The handlers should require exact arity per verb, with `create` still accepting optional values only through flags.

### Group skill documentation still describes the superseded empty-members doctor rule and stale refusal text

Finding-ID: AUDIT-BARRAGE-codex-04
Status:     open
Severity:   low
Surface:    `plugins/deskwork/skills/group/SKILL.md:53`, `plugins/deskwork/skills/group/SKILL.md:58-66`

The skill header and workplan now define `members: []` as the canonical declared-empty group state, and the workplan renames Task 7.5.5 to `group-stale-empty-members`. But the group skill default section still says Doctor’s `group-empty-members-array` rule surfaces the “dual representation” for normalization. Its error catalog also says non-group `show` / `update` refusals use the old “entry has no members” / “non-empty members[]” wording, while the implementation now refuses on absence of the `members` field.

This is documentation drift on the operator-facing skill. The fix is to align the skill with the implemented semantics: `members: []` is not a normalization target, and non-group refusal text should mention “no `members` field” rather than “no members” or “non-empty members[]”.
