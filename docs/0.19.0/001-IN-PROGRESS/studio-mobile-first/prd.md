---
slug: studio-mobile-first
title: studio-mobile-first
targetVersion: "0.19.0"
date: 2026-05-09
parentIssue: 
deskwork:
  id: 1d9a45d3-fa5b-479e-874e-8718648036b3
---

# PRD: studio-mobile-first

## Problem Statement

The studio has 7 web surfaces. v0.17 + v0.18 brought mobile-first treatment to 1 — entry-review (both review and edit modes, with its scrapbook tab). The remaining 6 surfaces are desktop-shaped: layouts crush on phone, chrome straddles viewport edges, no thumb-reach affordances, no consistent design language. The open #236-#244 dogfood-walk cluster centers on Dashboard specifically; #242 (no Cancel affordance on any studio surface) is cross-cutting. Operators using deskwork on phone via Tailscale magic-DNS hit the friction every session. The work is to extend the press-check vocabulary already shipped (cream paper, JetBrains Mono kickers, Newsreader italic display, red-pencil/proof-blue/stamp-green/kraft accent map) — and the bottom-tab-bar / sheet idiom where it fits — to every remaining studio surface. Per the v0.18 cycle that produced the current quality bar, every UI implementation is gated on `/frontend-design` (mockups → operator picks → implement) and `/dw-lifecycle:review` (parallel reviewers → integrate or defer). Both rules now live in `.claude/rules/agent-discipline.md` (`34306d5` + `ea496d3`); this feature elevates them to non-negotiable.

## Solution

[Describe the proposed solution at a high level. What changes for the user? What is the shape of the deliverable? Again, one or two paragraphs — leave specifics for the Technical Approach section.]

## Acceptance Criteria

- [ ] [First user-visible criterion that must hold for this feature to be considered complete]

## Out of Scope

- [Capability or change that is explicitly NOT part of this feature]

## Technical Approach

Hybrid implementation strategy. Dashboard ships first using the entry-review patterns as-is (rule-of-three deferred — re-use without refactoring, validating that the press-check tab bar / sheet idiom transfers to a non-review surface). After Dashboard ships, extract a shared `mobile-shell` module (mobile-bar, mobile-sheet, press-check CSS tokens, dual-viewport probe scaffolding) so subsequent surfaces compose on top. Every UI implementation in this feature is gated on **`/frontend-design`** (per the global rule in `agent-discipline.md`) — 2-3 HTML mockups per surface, operator walks on phone via Tailscale, picks one, then implementation. Every implementation step is followed by **`/dw-lifecycle:review`** with the implementer-pushback + workplan-and-issue-deferral discipline (also per the global rule). Static doc surfaces (Help, Index) likely diverge from the bottom-tab-bar idiom — they're reading surfaces, not interactive ones. Press-check vocabulary is preserved (paper, fonts, accent map, italic stamps); the idiom adapts to the surface. The mockup cycle confirms the right shape per surface.
