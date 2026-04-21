---
name: analyze-session
description: "Analyze recent session patterns from DEVELOPMENT-NOTES.md and report correction trends."
user_invocable: true
---

# Analyze Session

Review recent development sessions and report patterns:

1. **Read DEVELOPMENT-NOTES.md** (last 5 entries)

2. **Categorize corrections:**
   - Count by tag: [PROCESS], [UX], [COMPLEXITY], [FABRICATION], [DOCUMENTATION]
   - Identify recurring patterns across sessions

3. **Calculate metrics:**
   - Average corrections per session
   - Most common correction category
   - Sessions with highest correction count
   - Trends (improving or worsening)

4. **Report to user:**
   - Top correction categories with counts
   - Recurring patterns
   - Improvement suggestions based on patterns
   - Comparison with earlier sessions (if enough data)

5. **Optionally update DEVELOPMENT-NOTES.md:**
   - Add an analysis entry summarizing findings
