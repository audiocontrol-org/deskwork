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

### Spec-compliance probes: assertions are derived from the spec, not from the implementation

When writing or running a "spec-compliance probe" (a script that claims to verify an implementation matches an accepted design / spec / brief), every assertion in the probe MUST trace back to a literal clause in the spec, expressed as something an operator can perceive on screen. CSS computed-style assertions, transform values, z-index numbers, and class-name checks count only when they are the *measurement* used to verify a spec-derived visual claim — never as the claim itself.

**Why:** the 2026-05-11 v0.20 row affordance session shipped a "17/17 spec assertions pass" probe that:

- Asserted `fg.transform === 'matrix(1, 0, 0, 1, -192, 0)'` and `shell.classList.contains('is-swiped')` for the latched state.
- Did NOT assert that the 3 chips the spec promises (`approve · cancel · SCRPBK` for Final stage) were each visible AND unobstructed.
- Saved a screenshot showing only 2 chips visible (the third occluded by the compose FAB).
- The agent looked at that screenshot and reported "matches the spec." The operator caught the missing third chip by counting in their phone screenshot — the agent's "spec compliance" claim was self-confirming, not falsifying.

The probe verified the *mechanism* it imagined would deliver the contract — not the contract itself. A passing probe of the wrong assertions is worse than no probe, because it underwrites a false claim with computed-style evidence.

**How to apply:**

1. **Open the spec while writing the probe.** Read each sentence. For every visual promise (*"drawer slides in with N chips,"* *"row is clean at rest,"* *"menu drops downward over the row,"* *"all chips are tappable"*), write at least one assertion that an operator could re-run with their eyes — *"there are exactly N elements matching `<selector>` with width > 0 and height > 0,"* *"the row has zero descendants matching the drawer-chip selector with non-empty bounding rect,"* *"each chip's center point's `elementsFromPoint(...)` returns the chip itself, not a higher-z-index element."*

2. **One spec clause → at least one operator-perceivable assertion.** If the spec says *"drawer reveals 3 chips for Final stage,"* the probe asserts (a) `drawer.querySelectorAll('.chip').length === 3`, (b) every chip has `getBoundingClientRect()` within the viewport with width × height > 0, AND (c) every chip is the topmost element at its own center point (`document.elementsFromPoint(cx, cy)[0]` is the chip). All three. Don't skip (c) because *"if the z-index is right, of course no element covers it"* — that's the assumption the operator's last screenshot just falsified.

3. **For each visible artifact the spec promises, count it in every screenshot before reporting "matches."** Out loud: *"Spec says 3 chips. I count: 1 — approve. 2 — cancel. 3 — ... I don't see a third. FAIL."* This is the adversarial pass. If the count doesn't match, the probe is missing an assertion AND the implementation is wrong; fix both before reporting.

4. **Implementation-level assertions are debugging aids, not spec compliance.** *"`transform === -192px`"* is useful when the visible chips test fails and you need to know why. It's NOT a substitute for the visible-chips test itself. Keep both; don't let the lower-level one substitute for the higher-level one.

5. **The probe's name is a claim.** If a script is named `probe-spec-compliance.mjs`, every passing run is implicitly the claim *"the implementation matches the spec."* Don't run such a probe and report passing without confirming, for each visual clause in the spec, that the corresponding operator-perceivable assertion is in the probe AND passing. If you find a spec clause without an assertion, the probe isn't ready — either add the assertion or rename the probe to scope what it actually verifies.

### Why this rule exists

This rule was written after the 2026-05-02 session in which six separate prompts were needed to extract grounded verification from the agent. Each shallow claim cost an operator turn, polluted git history with misleading "fix" commits, and required a follow-up commit to actually fix what the prior commit claimed. The cumulative cost — operator attention, code-quality regression, trust erosion — is exactly what this rule prevents.

The spec-derived-assertion section was added after the 2026-05-11 v0.20 row affordance session in which a "17/17 spec assertions pass" probe missed the missing-third-chip bug because none of its assertions tested the spec's visible promise — they tested the agent's mental model of the mechanism. The operator extracted the failure in one prompt by asking how many chips the spec required and counting in the screenshot. The probe should have done that counting itself.

The verification cost is small. The cost of skipping it is enormous and compounds.
