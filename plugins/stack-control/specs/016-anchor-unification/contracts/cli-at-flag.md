# Contract: Uniform `--at <dir>` on State-Writing Verbs

Closes the "backlog has no --at by contract" carve-out (TASK-51, ratified in clarify Q1). Normative for FR-006.

## Flag semantics (identical everywhere)

- `--at <dir>`: resolve the domain enclosing `<dir>` (per the anchor-resolution contract) and anchor EVERY read and write of the invocation there. Relative `<dir>` resolves against cwd at parse time; thereafter cwd is irrelevant.
- Missing value (`--at` with nothing following): usage error, exit 2.
- `<dir>` outside any domain: the not-found wording class, per-verb exit semantics, zero writes.
- `<dir>` under overlapping markers: the overlap error, zero writes.

## Verbs gaining the flag in this feature

| Verb | Note |
|---|---|
| `backlog capture` | parsed at the backlog dispatcher, threaded as the store-resolution start dir |
| `backlog import-github` | same |
| `backlog import-slush` | anchors BOTH the store and the feature audit-log lookup (FR-005) |
| `backlog promote` | also re-bases the pending-create advisory (FR-007) |
| `backlog list` | read-only but dispatcher-level parsing makes it uniform; same semantics |

`govern` already carries `--at` (installation-isolation); its semantics are unchanged and now also govern the exclude/slush sub-steps (FR-002).

## Interaction with `STACKCTL_BACKLOG_DIR`

The env override names a store directly and still wins for store *location*; `--at` still governs everything else (audit-log lookup, advisories). This combination is reported on stderr so the pierce is visible.

## Test matrix (cwd-invariance, SC-004)

Every state-writing backlog verb runs three ways with byte-equivalent placement + advisory output (modulo ids/timestamps):
1. cwd = domain root, no flag
2. cwd = domain subdirectory, no flag
3. cwd = outside any domain, `--at <domain subdir>`
