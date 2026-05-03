---
name: feature-implement
description: "Drive the implementation loop by selecting the next workplan task, verifying the PRD gate, doing the work, and updating progress."
---

# Feature Implement

## Strict Gate

Before implementation:

1. Identify the feature slug.
2. Read the PRD and extract `deskwork.id`.
3. Verify the PRD's deskwork workflow is `applied`.
4. If not, refuse to proceed.

## Loop

1. Find the next unchecked workplan item.
2. Read the relevant code and tests.
3. Implement locally by default.
4. If the user explicitly asked for delegation, split bounded tasks into safe worker/explorer chunks.
5. Run relevant tests.
6. Update the workplan and README.
7. Commit and push when the chunk is complete.
