---
name: feature-ship
description: "Prepare feature for merge: verify acceptance criteria, run tests, create PR. Stops short of merge — operator decides when to merge."
user_invocable: true
---

# Feature Ship

This skill prepares a feature for merge and tagging. It stops at PR creation. The **operator is the merge gate** — review the PR, run any operator verification (writingcontrol smoke, manual UI checks, etc.), then merge yourself. After the merge, instruct me to run the tag-and-release step (Step 10).

1. **Identify feature** from worktree/branch.

2. **Verify workplan completeness:**
   - Read workplan, check all acceptance criteria are marked complete
   - If unchecked criteria remain, report and ask user

3. **Run tests:**
   - `npm test`
   - `npm run test:integration`
   - `npm run test:e2e`
   - If tests fail, report and stop

4. **Run code review** (delegate to code-reviewer or invoke `/feature-review` logic).

5. **Bump version** (release-shaped phases only — skip for docs-only or refactor PRs):
   - Determine the bump per `RELEASING.md` heuristic: **minor** for new user-visible capability, **patch** for a fix that keeps behavior compatible. The plugin is `0.x.y` so judgment-based, not strict semver.
   - Run: `npm run version:bump <semver>` (writes 9 manifests atomically: root + 3 workspace `package.json`, 2 plugin shell `package.json`, 2 `plugin.json`, marketplace.json top-level + per-plugin entries).
   - Verify the diff (`git diff` should touch only version strings). Commit as `chore: release v<semver>`.
   - **Do NOT tag here** — tagging happens after the operator merges, in step 10.

6. **Push branch:**
   - `git push -u origin feature/<slug>`

7. **Create pull request:**
   ```bash
   gh pr create --title "<title>" --body "## Summary
   [1-3 bullets]

   ## Test plan
   - [ ] [acceptance criteria as checklist]"
   ```
   - No Claude attribution in PR body

8. **Update README** with PR URL.

9. **Stop and report.** Do **not** merge. The operator owns the merge decision — they may want to:
   - Review the PR diff themselves
   - Run operator verification (host-app smoke, writingcontrol acceptance, manual UI checks) before code lands on `main`
   - Add follow-up commits to the PR (it's still open and editable)
   - Decide that something else needs to change before merge
   
   Report:
   - PR URL
   - Test results, code review summary
   - Version bumped (and that the bump is in the PR, not yet tagged)
   - Status checks state (`gh pr checks <n>`)
   - Any operator verification still pending (from the workplan)
   - Explicit reminder: **after you merge, tell me to run the tag step, or invoke `/feature-tag <semver>`** (or whichever post-merge skill applies).
   
   Wait for the operator to merge. Do not poll. Do not enable auto-merge. The operator will tell you when it's merged.

---

## Step 10 — Tag the release (executed only after operator confirms merge)

When the operator confirms the PR is merged to `main`:

```bash
git fetch origin
git tag -a v<semver> origin/main -m "Release v<semver>

- <highlight 1>
- <highlight 2>"
git push origin v<semver>
```

The tag push triggers `.github/workflows/release.yml`, which runs build + tests and creates the GitHub release with auto-generated notes. Watch the run with `gh run watch <run-id>` or via the Monitor tool. Verify the release lands at `https://github.com/<org>/<repo>/releases/tag/v<semver>`.

If the operator asks to run merge-conflict resolution before they merge (the recurring pattern: prior squash-merge collides with the version bump on manifests), help them with that — keep `ours/0.x.y` from the feature branch for the version-string conflicts. But do not run `gh pr merge` yourself.

11. **Final report:** PR URL, test results, review status, version released, GitHub release URL, next steps.
