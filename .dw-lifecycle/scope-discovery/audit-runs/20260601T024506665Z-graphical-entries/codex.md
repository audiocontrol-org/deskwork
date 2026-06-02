### `group list` still appears to accept extra positionals

Finding-ID: AUDIT-BARRAGE-codex-01  
Status:     open  
Severity:   medium  
Surface:    `packages/cli/src/commands/group.ts:151-163` and `packages/cli/test/group/extra-positional-refused.test.ts:31-106`

AUDIT-20260530-94 was “group subcommands refuse extra positionals,” and its cited surface includes the first handler range at `group.ts:151-163`, which is the likely zero-positional `list` handler. The fix adds `assertExactPositional(...)` to `show`, `create`, `update`, `add-member`, `remove-member`, `archive`, and `restore`, but the diff shows no corresponding `assertExactPositional(rest, 0, 'list')` call for `list`.

The new regression file also skips `list`: it tests extra positionals for seven verbs starting with `show`, but not `group list accidental`. That leaves the original silent-discard shape alive for the zero-arity command: an operator typo like `deskwork group list stale-token` can still succeed instead of returning usage exit `2`. Reasonable fix: invoke the helper from `handleList` with expected `0`, and add a `list: refuses an extra positional` case to the regression test.
