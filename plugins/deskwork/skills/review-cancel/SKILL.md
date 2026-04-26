---
name: review-cancel
description: Cancel an in-flight review workflow. Moves the workflow to the terminal `cancelled` state; the journal keeps it for audit. Use when a draft is abandoned, a workflow was enqueued by mistake, or a review has been superseded.
---

## Review Cancel

Mark a non-terminal review workflow as cancelled.

### Input

```
/deskwork:review-cancel <slug>                            # longform default
/deskwork:review-cancel --site <s> <slug>
/deskwork:review-cancel <slug> --kind outline
/deskwork:review-cancel <slug> --platform reddit --channel r/foo
```

### Steps

1. Resolve `--site`.
2. Determine the content kind — default is `longform`, `shortform` if `--platform` is set, otherwise use `--kind`.
3. Invoke the helper:

```
deskwork review-cancel [--site <slug>] \
                          [--platform <p>] [--channel <c>] [--kind longform|outline|shortform] \
                          <slug>
```

4. Report the workflow id and the previous state for the operator's confirmation.

### Error handling

- **Workflow already terminal** — helper refuses with the current state. Cancelling a cancelled workflow is a no-op; re-running `/deskwork:review-start <slug>` creates a fresh one.
- **No workflow found** — helper errors. Confirm the slug / content kind / platform.
