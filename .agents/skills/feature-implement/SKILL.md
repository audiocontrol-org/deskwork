---
name: feature-implement
description: "Drive the implementation loop by selecting the next workplan task, verifying PRD/workplan approval, doing the work, and updating progress."
---

# Feature Implement

## Strict Gate

Before implementation:

1. Identify the feature slug.
2. Read the PRD and workplan.
3. Verify the PRD/workplan have been explicitly approved for implementation.
4. If approval is missing or ambiguous, refuse to proceed and ask for confirmation instead of routing through deskwork-plugin dogfooding.

## Loop

1. Find the next unchecked workplan item.
2. Read the relevant code and tests.
3. Implement locally by default.
4. If the user explicitly asked for delegation, split bounded tasks into safe worker/explorer chunks.
5. Run relevant tests.
6. Update the workplan and README.
7. Commit and push when the chunk is complete.
