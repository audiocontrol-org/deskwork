---
name: review-report
description: Voice-drift signal — aggregates comment categories across completed review cycles to surface which voice-skill principles are catching the most operator corrections.
---

## Review Report

Build the voice-drift report from the review journal. Counts terminal workflows only by default (in-flight workflows don't represent settled signal).

### Input

```
/deskwork:review-report
/deskwork:review-report --site <slug>
/deskwork:review-report --include-active
/deskwork:review-report --format text
```

### Steps

1. Invoke the helper:

```
deskwork review-report [--site <slug>] [--include-active] [--format text|json]
```

2. Report the result. `--format text` gives a human-readable pre-formatted block; `--format json` (default) returns structured data for further aggregation.

### Categories tracked

- `voice-drift` — drift from the voice skill's voice/register guidance
- `missing-receipt` — claims without supporting evidence
- `tutorial-framing` — posts written as tutorials when they should be something else
- `saas-vocabulary` — corporate-software register creeping in
- `fake-authority` — unwarranted authoritative tone
- `structural` — structural problems (organization, flow)
- `other` — catch-all

### Use

Run periodically (weekly, monthly) to see which voice principles need reinforcement. **The signal surfaces; revising the voice skills themselves stays human-driven.**
