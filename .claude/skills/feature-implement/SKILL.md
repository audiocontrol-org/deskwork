---
name: feature-implement
description: "Core implementation loop: select next workplan task, delegate to appropriate agent, review output, update progress."
user_invocable: true
---

# Feature Implement

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
