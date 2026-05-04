---
name: feature-implement
description: "Core implementation loop: select next workplan task, delegate to appropriate agent, review output, update progress."
user_invocable: true
---

# Feature Implement

## 0. Verify the PRD is approved (STRICT GATE — DO NOT BYPASS)

Before any implementation work:

- Identify the feature slug from the worktree/branch.
- Read the PRD at `docs/1.0/001-IN-PROGRESS/<slug>/prd.md`. Extract the `deskwork.id` from frontmatter.
- Find the deskwork workflow for this PRD: `deskwork review-help --site <site>` lists open workflows; cross-reference the entry id.
- If the workflow's state is **not `applied`**, refuse to proceed with a clear message:
  > Workplan implementation blocked. The PRD's deskwork workflow is in state `<state>`. Iterate and approve via the deskwork pipeline before running /feature-implement. Studio review URL: /dev/editorial-review/entry/<entry-uuid>.
- If no deskwork workflow exists for the PRD at all (legacy feature predating the deskwork-baked workflow): refuse the same way and direct the operator to `/feature-extend` (which will register the PRD with deskwork) or `deskwork ingest` + `deskwork review-start` directly.
- This gate is **strict**, not a warning. Implementation against an un-reviewed PRD is the "started before the operator finished thinking" failure mode. No `--force` flag in the current iteration; if the gate is too strict in practice, relax later with explicit operator approval.

## 1. Identify current feature
- Extract slug from worktree/branch

## 2. Find next task
- Read workplan, find first unchecked acceptance criteria
- If all complete, report "all workplan tasks complete" and stop

## 3. Analyze task
- Read acceptance criteria
- Identify relevant source files
- Determine which tests cover this area

## 4. Select agent
- TypeScript logic/components -> typescript-pro
- Documentation/content -> documentation-engineer
- Code review -> code-reviewer
- Architecture decisions -> architect-reviewer

## 5. Delegate
Launch selected agent with:
- Task description and acceptance criteria
- File paths to read and modify
- Test command: `npm test`
- Instruction: "Use the Write/Edit tool to persist all changes to disk"

## 6. Review
- Read modified files
- Run: `npm test`
- If tests fail: re-delegate with error output

## 7. Update progress
- Check off completed criteria in workplan
- Update feature README if phase changed
- Close GitHub issues as appropriate

## 8. Commit and push
- Stage changes, commit with descriptive message, push

## 9. Repeat or stop
- More tasks in current phase: continue
- Phase complete: report, ask user before next phase
- All phases complete: report feature implementation complete
