---
name: extend
description: "Add phases to PRD/workplan; create new GitHub issues for added phases"
---

# /dw-lifecycle:extend

Add new phases to a feature mid-implementation. Mirrors the initial setup pattern but for incremental additions.

## Steps

1. Confirm slug and the new phase content.
2. Invoke `superpowers:writing-plans` to generate the new phase's task breakdown. (Same discipline as initial workplan creation.)
3. Append the phase to `<feature-dir>/workplan.md` and update the README's phase status table.
4. Create new GitHub issues for the added phases (single phase = one new issue, link to parent):

```
gh issue create --title "<phase title>" --body "Part of #<parent>" --label enhancement
```

5. Update the PRD's "Implementation Phases" section to reflect the addition.
6. Optionally record `--retarget <new-version>` to move the feature directory to a different version target. Helper usage:

```
dw-lifecycle transition <slug> --from inProgress --to inProgress --from-target <old-version> --target <new-version>
```

(Note: same-stage transition with version change is the re-target operation; helper handles the directory move + targetVersion frontmatter update.)

## Error handling

- **Cannot retarget if `byVersion: false`.** Skill warns and skips the version-change operation.
