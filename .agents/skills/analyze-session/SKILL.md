---
name: analyze-session
description: Analyze recent `DEVELOPMENT-NOTES.md` entries, summarize correction patterns, and report recurring process or quality issues.
---

# Analyze Session

1. Read the last 5 entries in `DEVELOPMENT-NOTES.md`.
2. Count correction tags from `.agents/rules/session-analytics.md`.
3. Compute:
   - average corrections per session
   - most common correction category
   - sessions with the highest correction count
   - whether the trend is improving or worsening
4. Report:
   - top categories with counts
   - recurring patterns
   - concrete improvement suggestions
5. Optionally append an analysis entry to `DEVELOPMENT-NOTES.md` if the user asks.
