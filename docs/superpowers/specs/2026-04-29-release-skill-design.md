## Design: `/release` skill for the deskwork monorepo

**Status:** approved 2026-04-29 (brainstorming)
**Implementation:** pending

### Problem

The deskwork release process lives in `RELEASING.md` as a manual numbered procedure. Three issues with this:

1. **Smoke ordering gap.** Step 3 runs `bash scripts/smoke-marketplace.sh` *before* the version-bump commit at step 4 — so the actual commit being shipped has never been smoked. Manifest-only changes are unlikely to break packaging, but the gate's logic is incoherent in principle.
2. **Two-push race.** `git push && git push --tags` lets the tag arrive at origin before its target commit, occasionally causing the release workflow to fail with confusing errors.
3. **Re-tag footgun.** Line 60 says "delete the tag and re-tag the fix" with no warning that re-tagging a published name silently mutates what adopters get on next fetch. For a marketplace pinning model (`#vX.Y.Z`), this is dangerous.

The procedure also has no precondition checks (must be on appropriate branch state, working tree clean, branch up-to-date). Operator memory is the only gate — the kind of "just for now" reliance that becomes conventional canon.

The principle from the operator: *no "just for now." If it's worth doing, enshrine it. Build it as a skill so the procedure can't drift, and document the use of the skill in RELEASING.md.*

### Goal

A `/release` skill that:

- Reduces the release ceremony to a single command
- Enforces preconditions (branch state, version validity, smoke pass) as hard gates with no override flags
- Pauses for operator decisions only at points that genuinely need a human (version number, tag message, final push confirmation)
- Prevents re-tagging a published version
- Atomic push so commit + tag arrive together
- Surrounds the load-bearing commands (precondition checks, atomic push) with bash helpers that are auditable as code, not paraphrasable as prose

### Non-goals

- Releasing via PR-merge (deliberate pre-1.0 velocity choice; revisit at 1.0 — see "Maturity stance" below)
- Auto-generating release notes (GitHub's auto-generation is sufficient at this maturity level)
- Cross-repo releases (this is for the deskwork monorepo only)
- Replacing `/session-end` (orthogonal — operator can run both when both apply)

### Decisions made during brainstorming

| Question | Decision |
|---|---|
| Gate strictness | Hard gates only; no `--force`, `--skip-smoke`, or override flags |
| Interaction model | Run-with-decision-pauses (~4 pauses); not chatty walkthrough; not one-shot |
| Skill location | Project-level: `.claude/skills/release/` |
| Branch model | Direct-to-main (push to `origin/main` from feature-branch worktree) — pre-1.0 velocity decision, revisit at 1.0 |
| Implementation form | SKILL.md prose + `lib/release-helpers.sh` (Approach 2 of three considered) |
| v0.9.0 sequencing | Build the skill first; v0.9.0 is the first canonical run of `/release` (no "ship manually first" exception) |

### Architecture

**File layout:**

```text
.claude/skills/release/
├── SKILL.md                    # operator-facing prose, drives the flow
└── lib/
    └── release-helpers.sh      # load-bearing bash predicates (sourced)
```

`SKILL.md` is invoked when operator types `/release`. It sources `lib/release-helpers.sh` and orchestrates the four operator pauses described below.

### Operator-facing flow (the four pauses)

The flow assumes the operator is in any worktree of the repo (the project's working pattern uses git worktrees; `main` is checked out elsewhere — see `.claude/CLAUDE.md` "Worktree Convention"). The skill cares about HEAD's relationship to `origin/main`, not which local branch is checked out.

**Pause 1 — Precondition + version**

Skill calls `release_check_preconditions`. Reports a status line:

```
HEAD: 9610ad0 (feature/deskwork-plugin)
Relative to origin/main: 3 commits ahead, fast-forward possible
Working tree: clean
Tracking remote: up-to-date with origin/feature/deskwork-plugin
Last release: v0.8.7 (committed 2026-04-29)
```

Then asks:

```
What version? (must be > v0.8.7; recommend 0.9.0 for new architecture)
>
```

Skill validates via `release_validate_version <version> <last-tag>`:
- Must match `\d+\.\d+\.\d+`
- Must be strictly greater than the last tag (semver-aware comparison)

Hard abort with explanation on either failure. No retry loop within a single skill run — operator re-runs the skill with a corrected version.

**Pause 2 — Post-bump diff review**

Skill runs `npm run version:bump <version>`. The bump script atomically updates `version` in: root `package.json`, every workspace `package.json`, both `plugins/*/.claude-plugin/plugin.json` files, and `.claude-plugin/marketplace.json` (top-level `metadata.version` plus each plugin entry's version) — see `scripts/version-bump.ts` (or wherever it lives — verify in implementation).

Skill prints `git diff --stat` and shows `git diff` (truncated for prompt budget; tail of long manifests not surfaced — operator can run `git diff` themselves if needed).

Asks:

```
Commit as 'chore: release v<version>' and continue? [y/N]
>
```

- On `y`: skill runs `git commit -am "chore: release v<version>"`.
- On `n`: skill bails, leaves bumped manifests in the working tree. Operator decides whether to revert (`git restore .`) or fix something and re-run.

**Pause 3 — Smoke + tag message**

Skill runs `bash scripts/smoke-marketplace.sh` with output streamed.

- On smoke fail: hard abort. Working tree state preserved (release-prep commit, bumped manifests). Skill prints the smoke output's tail and exits non-zero. Operator: fix bug, amend release commit (`git commit --amend`), re-run.
- On smoke pass: continue.

Skill drafts a default tag message. The release-prep commit's subject line (`chore: release vX.Y.Z`) carries no information, so the default is the subject of the most recent commit whose message does NOT start with `chore: release ` — i.e. the most recent substantive commit on the branch. If no such commit is found within the lookback (e.g. lookback of 20 commits), fall back to `"deskwork v<version>"`. Operator-overridable:

```
Tag message? [default: deskwork v0.9.0 — concurrency hardening + bin/script dedup]
>
```

Operator types message or accepts default. Skill creates annotated tag:
```bash
git tag -a v<version> -m "<message>"
```

**Pause 4 — Final push confirmation**

Skill checks the published-tag gate:
```bash
git ls-remote --tags origin v<version>
```
- If non-empty: hard abort. Re-tag is forbidden once published. Skill prints: *"v<version> already exists on origin. Re-tagging silently mutates what adopters fetch. Bump to v<next-patch> instead and re-run."*

Skill prints exactly the push command and what it will do:

```
About to run:
  git push --follow-tags origin HEAD:main HEAD:refs/heads/feature/deskwork-plugin

This pushes:
  - HEAD (9610ad0) → origin/main
  - HEAD → origin/feature/deskwork-plugin
  - tag v0.9.0 → origin

This is non-reversible after success: v0.9.0 will be visible to adopters
running '/plugin marketplace update deskwork'.

Run push? [y/N]
>
```

- On `y`: skill calls `release_atomic_push v<version>`.
- On push success: skill runs `gh release view v<version>` and reports the release URL + auto-generated notes preview. Workflow trigger noted; operator can run `gh run watch` separately if they want.
- On push fail: hard abort. Local commit + tag intact. Skill prints git's stderr and a recovery hint (e.g., "if origin/main moved, fetch + rebase, then re-run; the existing local v<version> tag will be reused via the local-tag pause").
- On `n`: hard abort. Local state preserved. Operator can re-run later.

### Helper contracts (`lib/release-helpers.sh`)

```bash
release_check_preconditions
# Verifies (in order):
#   1. Working tree is clean (no uncommitted changes, no staged changes,
#      no untracked tracked-shaped files — same definition as `git diff
#      --quiet && git diff --cached --quiet && [ -z "$(git ls-files
#      --others --exclude-standard)" ]`)
#   2. `git fetch origin` succeeds (we want fresh refs before checking
#      branch-up-to-date status)
#   3. HEAD has origin/main as ancestor (i.e. fast-forward to origin/main
#      is possible from HEAD): `git merge-base --is-ancestor origin/main HEAD`
#   4. Local branch is up-to-date with its tracking remote (no commits on
#      origin/<branch> that we don't have)
# Outputs: human-readable status line on stdout (5-6 lines, see Pause 1
# example).
# Exit codes: 0 if all pass; 1 if any fail with explanation on stderr.

release_atomic_push <tag>
# Single-RPC push:
#   git push --follow-tags origin HEAD:main HEAD:refs/heads/<current-branch>
# (--follow-tags pushes annotated tags reachable from the pushed commits;
# our annotated <tag> rides along since it points at HEAD.)
#
# DELIBERATE PRE-1.0 VELOCITY DECISION — see the long comment at the top
# of this function for the reasoning and revisit-at-1.0 trigger.
#
# Exit codes: 0 on success; 1 on failure (preserves local state — caller
# can decide recovery).

release_validate_version <version> <last-tag>
# Checks:
#   - <version> matches ^\d+\.\d+\.\d+$
#   - <version> is strictly greater than <last-tag> (after stripping the
#     leading 'v' from <last-tag>); semver-aware comparison
# Exit codes: 0 if valid; 1 with reason on stderr if not.
```

Three functions. ~50–80 lines of bash total. Each function is `bash -n` syntax-checkable as part of the same workflow that already validates other shell scripts.

### Failure modes and recovery

| Failure | Skill behavior | Operator action |
|---|---|---|
| Working tree dirty | Hard abort before any state change | Commit/stash, re-run |
| HEAD diverges from origin/main | Hard abort | Rebase or merge first, re-run |
| Branch behind tracking remote | Hard abort | Pull/fetch, re-run |
| Version invalid (format) | Hard abort | Re-run with valid version |
| Version not strictly > last tag | Hard abort | Re-run with strictly-greater version |
| `npm run version:bump` fails | Hard abort, run `git restore` | Investigate, re-run |
| Operator declines bump diff | Hard abort, leave bumped state | Operator decides: revert manually + re-run, or fix and proceed manually |
| Smoke fails | Hard abort, keep release-prep commit + bumped state | Fix bug → `git commit --amend` → re-run |
| Tag already published on origin | Hard abort with bump-patch instruction | Re-run with `<version+patch>` |
| Local tag exists from prior failed run | Pause 4-2 asks "re-use existing tag? [y/N]" | y to push as-is; n to delete (`git tag -d`) and re-run |
| Push fails (non-FF, network, auth) | Hard abort, local commit + tag intact | Fix issue, re-run (skill detects existing tag and offers re-push) |
| Workflow fails after push | Skill exits success (push succeeded); reports workflow URL | Bump-patch is canonical recovery (re-tag forbidden) |

**Re-tag prevention is the most important hard gate.** Skill checks the remote authoritatively via `git ls-remote --tags origin v<version>` (not just `git tag -l` — local refs can be stale).

### RELEASING.md rewrite

The doc gets shorter and shifts focus from procedure to architecture.

**Survives (architectural background — the *why*):**
- "Vendor materialize mechanism" — why the workflow does what it does
- "What gets released" — git tag IS the release
- "Operator update path" — consumer-facing
- "Pre-push hook" — separate from releases

**New top section: "To release: `/release`"** — short pointer to the skill.

**New section: "Maturity stance"** — explicit pre-1.0 direct-to-main rationale, mirrors the long-form comment in `release-helpers.sh::release_atomic_push`. Ends with `"Revisit at 1.0 stabilization"`.

**Removed:**
- The numbered procedure (now in skill)
- Re-tag advice from line 60 (skill enforces by refusal — operator never has to remember)
- Direct tag command examples

### Maturity comment

The full long-form comment lives at the top of `release_atomic_push` in `release-helpers.sh`:

```bash
# DELIBERATE PRE-1.0 VELOCITY DECISION. Direct-to-main push (rather than
# PR-merge) is intentional. Reasoning:
#   - Solo-maintainer project; PRs add drag without catching real bugs
#     (agent code-review already runs pre-commit)
#   - CI on this project is brutally slow; PR + CI gate adds friction the
#     project can't afford pre-1.0
#   - Smoke (scripts/smoke-marketplace.sh) is the real release-blocking
#     gate and runs locally before this function executes
#
# REVISIT AT 1.0 STABILIZATION. Once the project stabilizes, the case for
# PR-merge / CI-as-second-gate / branch protection grows substantially:
#   - Adopter base widens; CI catching regression before tag-push protects them
#   - Multi-contributor work becomes plausible; PR is established muscle
#   - Branch protection on main becomes appropriate
# When this happens, replace this function with a PR-merge flow and
# remove this comment.
```

A shorter form of the same comment goes in:
- `SKILL.md` near the push pause (3-4 lines)
- `RELEASING.md` "Maturity stance" section (1-2 paragraphs)

Three places isn't redundant — each surface has a different reader.

### Testing

**Helper unit tests (`scripts/test-release-helpers.sh`)** — bash test script that rigs tmp git repos and exercises each helper. Mirrors the `scripts/test-materialize-vendor.sh` pattern. Coverage:

- `release_check_preconditions`:
  - clean tree + FF over fake-origin/main + branch up-to-date → pass
  - dirty tree → fail with explanation
  - untracked file → fail
  - HEAD has commits not in fake-origin/main, fake-origin/main has commits not in HEAD (divergence) → fail
  - branch behind tracking remote → fail
- `release_validate_version`:
  - `0.9.0` > `0.8.7` → pass
  - `0.8.6` > `0.8.7` → fail
  - `0.9.0` == `0.9.0` → fail (strictly greater required)
  - `0.9` (malformed) → fail
  - `1.0.0-beta` (extra suffix) → fail
- `release_atomic_push`:
  - rigged tmp local + tmp bare-remote with FF state → push succeeds, remote has commit + tag + branch ref
  - rigged divergence → push fails non-FF, function exits 1, local state unchanged

~10 cases. Local-only per project rules (no CI).

**Manual integration smoke** — once before declaring the skill ready: dispatch `/release` against the actual repo with a fake version (e.g. `v0.0.0-test`) targeting a sandbox remote (a tmp bare repo as `origin`), then clean up. Verifies operator-prompt orchestration, end-to-end. One-time check, not part of recurring CI.

**No CI-side tests** — per `.claude/rules/agent-discipline.md` "No test infrastructure in CI."

### v0.9.0 sequencing

The skill is built first. **v0.9.0 is the first canonical run of `/release`.** No "ship v0.9.0 manually then build the skill" exception. This is the consistent application of the operator's principle that "just for now" decisions become conventional canon.

This implies a concrete sequence:

1. Build skill + helper script
2. Build helper unit tests; run them
3. Run the manual integration smoke against a sandbox remote
4. Update `RELEASING.md`
5. Use `/release` to ship v0.9.0 — the first real run

If the manual smoke surfaces issues, fix and re-run before v0.9.0.

### Open questions for implementation

These don't change the design — they're details to verify when implementing:

- **Does `npm run version:bump` exist as a script today?** RELEASING.md references it; need to verify it's wired up correctly. If it's a bash one-liner or a TS script, the skill calls whatever the project ships.
- **Semver comparison in pure bash:** the helper for `release_validate_version` needs a portable semver-greater-than. Either `sort -V` (GNU + recent BSD; we can probe like the stat-flavor probe in `materialize-vendor.sh`), or a small awk function that splits on `.` and compares numerically.
- **`gh release view` race after push:** the GitHub release is created by `.github/workflows/release.yml`, which runs asynchronously. If we run `gh release view <tag>` immediately after the push, the workflow may not have finished. Acceptable behavior: skill reports the workflow URL and exits success without blocking; operator can `gh run watch` if they want to follow it.
