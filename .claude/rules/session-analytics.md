---
name: session-analytics
description: "Per-session metrics and correction tracking for development journal entries"
---

# Session Analytics

## Per-Session Metrics

Each DEVELOPMENT-NOTES.md entry should include:

| Metric | Description |
|--------|-------------|
| Messages | Approximate user messages in the session |
| Commits | Number of commits made |
| Corrections | Number of times the user corrected the agent's approach |
| Files changed | Number of files modified |

## Correction Categories

Tag each correction in the "Course Corrections" section:

| Tag | Meaning |
|-----|---------|
| [PROCESS] | Wrong workflow, skipped steps, didn't delegate |
| [UX] | UI/UX issue caught by user |
| [COMPLEXITY] | Over-engineered, too many files, unnecessary abstraction |
| [FABRICATION] | Claimed something untrue, made up data |
| [DOCUMENTATION] | Missing or incorrect documentation |

## Tracking Patterns

Over time, look for:
- Recurring correction categories (systemic issue)
- Decreasing corrections per session (improvement)
- Sessions with zero corrections (celebrate and learn why)
- Correlation between session length and correction count
