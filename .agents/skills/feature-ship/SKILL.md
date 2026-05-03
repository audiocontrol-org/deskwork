---
name: feature-ship
description: Prepare a feature for merge by verifying completion, running tests and review, pushing the branch, and opening a PR without merging it.
---

# Feature Ship

1. Verify the workplan is complete.
2. Run the relevant tests.
3. Run a review pass.
4. For release-shaped work, bump the version using the repo's canonical version-bump flow.
5. Push the branch.
6. Open a pull request with summary and test plan.
7. Stop at PR creation. The operator owns the merge decision.
8. If the operator later confirms merge, handle the post-merge tag/release step separately.
