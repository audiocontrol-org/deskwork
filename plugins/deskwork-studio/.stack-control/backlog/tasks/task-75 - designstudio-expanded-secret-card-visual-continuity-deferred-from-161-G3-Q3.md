---
id: TASK-75
title: >-
  design(studio): expanded-secret-card visual continuity (deferred from #161 G3
  Q3)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-164
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What

When a secret scrapbook card expands (`grid-column: 1/-1` per F4 single-expanded invariant), its `.scrap-secret` section header may scroll out of view. Operators landing on a deep-link `#secret-item-N` see the expanded card body without the "you're looking at a secret card" framing context.

## Why this is filed but NOT pre-fixed

Per #161 G3 design review (Q3): explicitly recommended NOT pre-fixing. The Russian-doll principle holds — cards inside `.scrap-secret` inherit the section's purple-fenced semantics. Per-card duplication of secret marking would dilute the section header's signal.

This issue captures the disclosure for future operator-driven decision: **does this become real friction in adopter use, or stays as a non-issue?**

## When to act on this issue

- An adopter posts: "I deep-linked to a private card and got confused about whether it was secret"
- Or: an internal dogfood arc surfaces "I lost track of which section I was reading in" while navigating an expanded secret card

If neither happens within a few release cycles, close as won't-fix.

## Smallest correct intervention if action is needed

~3 lines of TypeScript in `renderCard` (`packages/studio/src/pages/scrapbook.ts`):

```ts
// Inside the .scrap-card-head template, after .scrap-name:
${secret ? unsafe(html`<span class="scrap-secret-glyph" aria-hidden="true">⚿</span>`) : unsafe('')}
```

Plus a CSS rule in `scrapbook.css`:

```css
.scrap-secret-glyph {
  font-family: var(--er-font-display);
  font-style: italic;
  color: var(--er-stamp-purple);
  font-size: 0.7rem;
  margin-left: 0.3rem;
}
```

The `aria-hidden` keeps screen readers focused on the section's `aria-label="secret items"`.

## References

- F5 dispatch: [`457b0a4`](https://github.com/audiocontrol-org/deskwork/commit/457b0a4)
- G3 design review: [`docs/superpowers/plans/2026-05-02-scrapbook-redesign-design-reviews.md`](https://github.com/audiocontrol-org/deskwork/blob/main/docs/superpowers/plans/2026-05-02-scrapbook-redesign-design-reviews.md) Q3 ("Per-card visual diff for secret cards") = "None — rely on the section header"
- F6 final walkthrough doc disclosure: [`docs/superpowers/plans/2026-05-02-scrapbook-redesign-final-walkthrough.md`](https://github.com/audiocontrol-org/deskwork/blob/main/docs/superpowers/plans/2026-05-02-scrapbook-redesign-final-walkthrough.md) "Non-blocking follow-ups" #2
<!-- SECTION:DESCRIPTION:END -->
