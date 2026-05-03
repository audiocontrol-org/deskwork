---
name: feature-define
description: "Interview the user to define a feature, then write a structured feature-definition draft under `.agents/.tmp/` for later setup."
---

# Feature Define

Do not create branches, worktrees, or docs directories here.

1. Interview for:
   - problem statement
   - proposed slug
   - acceptance criteria
   - out-of-scope items
   - technical approach
   - affected files/components
   - dependencies and open questions
2. Propose implementation phases with deliverables and acceptance criteria.
3. Write the draft to `.agents/.tmp/feature-definition-<slug>.md`.
4. Report the path and direct the next step to `feature-setup`.
