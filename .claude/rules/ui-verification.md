## UI Verification Protocol

When making any change to the studio UI (CSS, markup, client-side TypeScript) — and especially when reporting that a change is "fixed", "verified", or "working" — follow this protocol. The cost of skipping it is what showed up in the 2026-05-02 session: six rounds of operator-driven corrective oversight, three "fix" commits in a row that didn't fix what they claimed, polluted commit history, eroded trust.

### The non-negotiable checklist

Before writing **any** of the following — commit message claiming a fix, end-of-turn summary saying "verified", issue comment saying "fix landed", reply containing "this works now" — every box must be checked:

1. **Open the exact surface the operator referenced.** Not an adjacent surface that seems similar; the exact URL, entry, viewport size, and mode (read / edit / focus) the operator was looking at. If the operator showed a screenshot, navigate to that page in Playwright at the matching viewport.
2. **Reproduce the reported symptom *before* the fix.** Take a measurement that captures the symptom — a `getBoundingClientRect()` overlap, a `getComputedStyle()` font-family, a class on a child element. Record the numeric value. If the symptom doesn't reproduce, stop and ask the operator — you may be looking at the wrong surface.
3. **Apply the fix.**
4. **Reproduce the same measurement *after* the fix.** Same selector, same surface, same viewport. Show before → after as a delta in the report.
5. **Test on a second instance** if the surface has multiple instances (multiple entries / multiple states / multiple modes). One entry passing isn't proof; structural bugs surface on the second example. The 2026-05-02 Setext-heading bug was caught only when the operator drove a second entry.
6. **For styled-content (CodeMirror, syntax-highlighted markdown, decorated DOM): inspect the *inner styled spans*, not just the line/container element.** Containers inherit theme-level styles; tags applied by syntax highlighters render via inner spans. A `getComputedStyle()` on the container can silently look right while the inner spans render at heading scale.
7. **Drive the surface end-to-end where the change is interactive.** Click the button. Navigate the keyboard shortcut. Toggle the state. Open and close. If a focus mode exists, *enter and exit it*; don't just check that the body class flipped.

If any step is skipped, the report must say so explicitly: *"Verified at step N; not verified at step M because…"*.

### Dual-viewport verification

Any commit that touches CSS or markup on a surface that has both desktop and mobile breakpoints requires explicit before/after measurements at **BOTH a desktop viewport (≥1280px) AND a phone viewport (≤390px)**. This is non-negotiable for the entry-review surface (`/dev/editorial-review/entry/<uuid>`), the dashboard, the scrapbook viewer, and anything else that ships responsive CSS. A "verified at 1920×1080" commit that didn't re-check phone is a likely-regressing commit; same in reverse.

The reason: the entry-review surface has accumulated a layered cascade of media queries. Desktop layout decisions (page max-width, gutter sizing, marginalia column, padding tokens) cross-talk with mobile rules (overflow containment, table/code-block wrap, hidden-strip-children). A change tested only at one viewport can silently regress the other. The 2026-05-08 session shipped nine commits in this pattern (eight desktop-only verifications, two phone-only verifications) and produced an iOS regression the operator caught only by manual phone testing — exactly the failure mode this rule is named to prevent. The operator's framing was *"we can't play whack-a-mole between mobile and desktop ux/ui"*, which is exactly right: each fix tested at one viewport is a coin flip on the other.

**How to apply:**

- Run `scripts/smoke-er-viewport-regressions.mjs` against the running dev studio BEFORE writing the commit message. The script walks N entries at desktop (1920×1080) and phone (390×844), asserts no page-level horizontal overflow, asserts compact-chrome invariants, and reports any fixed-position offender. Exit-zero is the precondition for claiming "verified". A non-zero exit means the change broke at least one of the cross-viewport invariants — fix before committing.
- For interactive scenarios the smoke can't cover (edit-mode keyboard, scroll-context anchoring, click hit-areas), run a second manual pass at the OTHER viewport class. The rule is: never claim "verified" with only one viewport class measured.
- WebKit-specific iOS issues (CSS `overflow: clip` quirks, `position: fixed` + soft keyboard, intrinsic-size flex children) require `scripts/probe-ios-overflow.mjs` against WebKit specifically. Chromium-at-iPhone-viewport is NOT a substitute for WebKit — it hides real iOS bugs. When in doubt, run the WebKit probe.
- If the change is genuinely scoped to a single viewport class (e.g., a desktop-only rule inside `@media (min-width: 80rem)` that cannot affect mobile), the commit message must say so explicitly: *"Mobile not re-checked because the change is gated to ≥80rem."* This makes the scoping decision auditable; "I tested desktop and assume mobile is fine" is not.

### Falsifiable claims

When reporting verification, write the report so the operator can re-run it in 30 seconds:

- Exact URL, including the entry UUID and any query string.
- Exact selector(s) measured.
- Exact value(s) — pixel measurements, computed-style strings, attribute values.
- Before / after columns when the change addresses a measurable defect.

"I confirmed it works" without specifics is the cover that lets shallow verification slide. Don't write that sentence.

### Commit discipline

- **One fix per commit.** Don't bundle "typography swap + Setext purge + marginalia toggle" into a single commit. Each fix lands in its own commit *after* its own verification step. Wrong commits stay smaller; the cost of revert is lower; the diff is reviewable.
- **The commit message describes what was actually verified, not the broad scope of the change.** If a commit fixes A and partially addresses B, the message says exactly that — not "fixes A and B".
- **Don't claim "fixed and verified" in a commit message until the verification protocol above has been followed end-to-end on the live surface.** A passing test suite is a *prerequisite*, not a substitute.

### "Closure" vs "fix landed" — same rule

Per the existing `agent-discipline.md` rule "issue closure requires verification in a formally-installed release", an issue stays open until verified post-release. The same gate applies to *self-claims* of fix-quality at every point the agent might overstate: end-of-turn summaries, commit messages, issue comments, work-plan check-offs. The agent posts evidence; the operator decides whether the claim holds.

### When the operator pushes back

If the operator asks "did you actually verify X?" or "what makes you think Y is functional?" — that is the signal that a previous claim was insufficient. Two things follow:

1. Stop defending the prior claim. Re-run the verification protocol on the specific point challenged. If the prior claim was wrong, *say so directly* before doing anything else.
2. Don't move on until the actual claim is grounded with measurements the operator can re-run.

A single "I was wrong, here is what the live state actually shows" beats three rounds of partial corrections.

### Why this rule exists

This rule was written after the 2026-05-02 session in which six separate prompts were needed to extract grounded verification from the agent. Each shallow claim cost an operator turn, polluted git history with misleading "fix" commits, and required a follow-up commit to actually fix what the prior commit claimed. The cumulative cost — operator attention, code-quality regression, trust erosion — is exactly what this rule prevents.

The verification cost is small. The cost of skipping it is enormous and compounds.
