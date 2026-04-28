---
name: feature-define
description: "Interview the user to define a new feature: problem, scope, approach, and tasks. Writes a feature-definition.md file that /feature-setup consumes."
user_invocable: true
---

# Feature Define

Interactive interview to define a new feature before creating infrastructure. Produces a structured definition file that `/feature-setup` consumes.

**Do NOT create branches, worktrees, or docs directories.** This skill only interviews and writes the definition file.

## Interview Process

### Step 1: Feature Identity
- **What problem does this feature solve?**
- **Feature slug** — Suggest one (2-4 words, lowercase, hyphen-separated). Let the user override.

### Step 2: Scope
- **What does "done" look like?** — Concrete acceptance criteria.
- **What's explicitly out of scope?**

### Step 3: Approach
Propose a technical approach:
- Which files/components are affected?
- General implementation strategy?
- Dependencies on other features or external systems?
- Open questions needing investigation?

Present and ask user to confirm or adjust.

### Step 4: Task Breakdown
Propose implementation phases and tasks:
- Each phase has a clear deliverable
- Each task is 1-2 days max
- Tasks start with a verb
- Include acceptance criteria per phase

### Step 5: Write Definition File
Write to `/tmp/feature-definition-<slug>.md`:

```markdown
# Feature Definition: <slug>

## Problem Statement
## Feature Slug
## Acceptance Criteria
## Out of Scope
## Technical Approach
### Files Affected
### Strategy
### Dependencies
### Open Questions
## Implementation Phases
### Phase 1: [Title]
**Deliverable:** [what ships]
Tasks:
- [ ] [Task]
**Acceptance Criteria:**
- [criterion]
## Labels
```

### Step 6: Report and Hand Off
- Summary of what was defined
- Path to the definition file
- Next step: run `/feature-setup <slug>` — this will create the docs files (PRD with `deskwork.id` frontmatter, workplan, README), register the PRD with deskwork's review pipeline, and report the studio review URL.
- Canonical sequence going forward (per `.claude/CLAUDE.md` "Feature Lifecycle"):
  1. `/feature-setup <slug>` — creates files + registers PRD with deskwork
  2. Operator iterates the PRD via the studio (margin notes → `/deskwork:iterate` → approval) until the workflow is `applied`
  3. `/feature-issues` — files GitHub issues from the (now-stable) workplan
  4. `/feature-implement` — begins implementation. Refuses to start if the PRD's deskwork workflow is not `applied`.
