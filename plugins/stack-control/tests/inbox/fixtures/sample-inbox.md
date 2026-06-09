---
doc-grammar: design-inbox
---

# stack-control — design inbox (test fixture)

A committed, valid governed design-inbox fixture for the inbox mutation + verb
tests. A few `captured` entries plus one terminal (`promoted`) entry, so tests
can exercise capture, promote/drop, list, refusals, and lean-keeping reuse.

### Try a TUI inbox view
- **Surfaced:** 2026-06-08, while sketching the capture verb.
- **Context:** Browsing inbox entries by hand is clumsy.
- **Idea:** A terminal browser for inbox entries with status filters.
- **Provisional home:** multi/control-plane-frontend.
- **Status:** **captured**

### Audit-barrage cost telemetry
- **Surfaced:** 2026-06-08, mid spec-governance loop.
- **Context:** No visibility into per-model barrage token cost.
- **Idea:** Record per-model token spend per barrage run for the diminishing-returns log.
- **Provisional home:** governance enhancement.
- **Status:** **captured**

### Inbox entry pinning
- **Surfaced:** 2026-06-08.
- **Context:** Some captured ideas are higher-signal than others.
- **Idea:** A pin marker that floats an entry to the top of `inbox list`.
- **Provisional home:** design/insight-capture follow-up.
- **Status:** **promoted** → `stack-control-roadmap.md` `design:gap/inbox-pinning`, 2026-06-08.
