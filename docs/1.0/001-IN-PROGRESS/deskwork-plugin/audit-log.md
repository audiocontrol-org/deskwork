# deskwork-plugin — audit log

Durable record of `/dw-lifecycle:review` findings for the deskwork-plugin feature.

**Operator contract:**

- Findings are actionable work, not bookkeeping.
- This audit log is the source of truth for current finding state — not commit messages, not GitHub alone.
- Findings are never deleted. Update entries in place by changing `Status:` and appending resolution / verification notes under the same stable `Finding-ID`.
- `fixed-<sha>` is NOT `verified-<date>`. A fix is verified only after the surface is actually re-exercised.

**Canonical grep queue:**

```bash
# unfinished work
grep -nE "^Status:[[:space:]]+(open|acknowledged|fixed-)" docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md
# new findings
grep -nE "^Status:[[:space:]]+open" docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md
# awaiting verification
grep -nE "^Status:[[:space:]]+fixed-" docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md
```

---

## 2026-05-29 — Phase 38 sub-phase 38·1 (clone-gate hygiene, #354), commit 37683c8

**Track 1 (independent verification, re-run by the controller):**
- `clone-detector.gitignore.test.ts` → 4/4 pass.
- All three committed `.jscpd.json` paths (root symlink, scope-discovery real file, adopter template seed) report `gitignore === true` via `node -e JSON.parse`.
- 16/16 sibling harness-dependent clone tests pass (no harness regression).
- `tsc --noEmit -p plugins/dw-lifecycle/tsconfig.json` → exit 0, 0 errors.
- Pre-commit clone gate at commit time: 174 groups detected, 0 NEW.

**Clone detector (Step 3):** the `check-clones --gate-mode` pass ran in the pre-commit hook at commit 37683c8 — 0 NEW clone groups. Not re-run here (documented `--no-clone-check` exception: detector already produced its report in-session at commit time).

**Tracks 2+3 (dispatched `feature-dev:code-reviewer`, return-grammar validated):** no blocking or high findings. The reviewer confirmed spec compliance (#354 deliverable met; both test guards faithful), harness backward-compatibility (default-arg path is a no-op on the base config), correct REPO_ROOT resolution, and zero project-rule violations (`as`/`any`/`@ts-ignore`/file-size all clean).

---

Finding-ID: AUDIT-20260529-01
Status:     informational
Severity:   informational
Surface:    .dw-lifecycle/scope-discovery/.jscpd.json (+ template seed)

jscpd's `gitignore: true` option reads ONLY `process.cwd()/.gitignore`
(verified in `node_modules/jscpd/dist/chunk-YESFMRRG.js:86-89`). It does
NOT read `.git/info/exclude`, the user's global `core.excludesFile`, or
nested `.gitignore` files in subdirectories.

Expected vs actual: the fix prevents the #354 recurrence for any sandbox
listed in the repo-root `.gitignore`. The real reproducer `/.audiocontrol.org/`
IS in `.gitignore:97`, so the lived incident is covered. A *future* sandbox
excluded only via `.git/info/exclude` or a global excludesfile would NOT be
skipped by this flag — an operator could be misled by "we already set
gitignore:true."

Remediation: none required. The limitation is jscpd's, not deskwork's; the
practical risk is low (the documented adopter pattern is a committed
`.gitignore` entry). The caveat is recorded in the test file header
(`clone-detector.gitignore.test.ts`) and the workplan 38·1 entry. If a
recurrence ever happens via a non-`.gitignore` mechanism, the disposition is
to add the path to the committed `.gitignore` (not to change jscpd config).
