---
id: TASK-31
title: >-
  scope-discovery: discovery agents act as pattern inventory; miss novel
  anti-patterns
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-315
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`/scope-inventory` and the underlying discovery-agent fleet are **inventory scanners**, not **pattern discovery**. They catalogue occurrences of a fixed list of pre-named patterns; they have no mechanism to surface anti-patterns that haven't been registered. As a result, novel holdouts from a design-system migration sail through `/scope-inventory` invisibly and only surface when an operator catches them by eye. This issue documents the incident concretely so the deskwork team can figure out how to make the discovery tooling actually discover.

Companion issue: #314 (canonicalize a visual-verification gate). That issue covers operator-side catch via screenshot review; this issue covers the upstream failure — discovery tooling that should have caught the holdout BEFORE it reached operator review.

## The incident

`audiocontrol-org/audiocontrol` `feature/akai-harmonization`, 2026-05-25 → 2026-05-26.

Component: `modules/akai-s3k-editor/src/components/programs/KeygroupSummary.tsx`.

The component:

- Predated the akai-harmonization design-system migration (Phase 2).
- Used Tailwind utility classes throughout for chrome:
  ```tsx
  <div className="border border-gray-700 rounded-lg overflow-hidden mb-3">
    <div className="bg-gray-800 px-3 py-2 text-sm font-medium ...">
      <span>Keygroups ({keygroupCount})</span>
    </div>
    <div className="divide-y divide-gray-800">
      ...
      <button className="opacity-0 group-hover:opacity-100 ...">
        <DeleteIcon />
      </button>
    </div>
  </div>
  ```
- Consumed ZERO `.ac-*` design-system primitives.
- Rendered as illegible cream-on-cream on the akai canvas surface, with hover-only affordances invisible/unreachable on touch.
- Survived Phase 2 (AUDIT-20260524-…), Phase 3 (closeout), Phase 4 visual-fidelity review (AUDIT-20260525-24/25/26/27 + fixes). All structural test gates passed. All scope-discovery agents ran clean against it.
- Was caught when the operator looked at a screenshot on 2026-05-26 morning and asked, verbatim: *"how did we miss the regime holdouts you just fixed"*.

## What `/scope-inventory` actually saw

The discovery run lives at `docs/1.0/001-IN-PROGRESS/akai-harmonization/scope-inventory/runs/2026-05-24T08-10-55-119Z-epa17r/findings/`. Per-agent results for `KeygroupSummary.tsx`:

### `ast-grep-matrix.json`

The matrix DID emit hits for the offending lines:

```json
{
  "file": "modules/akai-s3k-editor/src/components/programs/KeygroupSummary.tsx",
  "line": 37,
  "snippet": "<span className=\"text-gray-500 w-8 text-right shrink-0\">{index + 1}</span>"
},
{
  "file": "modules/akai-s3k-editor/src/components/programs/KeygroupSummary.tsx",
  "line": 38,
  "snippet": "<span className=\"text-gray-300 font-mono w-28 shrink-0\">{noteRange}</span>"
},
...
```

But the snippets were filed under pattern id **`magic-number`** — because the agent's only pattern that matched `w-8` / `w-28` / `gray-500` was "inline numeric literal ≥ 2." That pattern returned **2117 total hits across the entire repo**. KeygroupSummary's holdout shape was buried inside 2117 entries of mostly-noise. No human or downstream consumer would extract the signal.

### `prd-themed-pattern-hunter.json`

Flagged the file solely because it `import { DeleteIcon } from '@audiocontrol/editor-core'` — and "delete" happened to be a PRD theme word. Not a meaningful finding.

### `regime-holdout-detector.json`

Found NOTHING for the file. The detector fuses four scanners (anti-patterns, adopter-manifests, editor-symmetry, deprecations) — all of which require a REGISTERED entry to match. No entry matched the file's actual problems.

### `ui-route-enumerator.json` / `clone-detector-reader.json`

Not file-applicable. KeygroupSummary doesn't define a route; it didn't share a clone group with anything.

## Why it failed: the agents' actual capability vocabulary

`ast-grep-matrix.ts` has a HARDCODED list of FIVE regex patterns:

```ts
const PATTERNS: ReadonlyArray<PatternDef> = [
  { id: 'ac-class-consumer',  regex: /className\s*=\s*[{"`'][^"`'}\n]*\bac-[a-z][a-z0-9-]*/g },
  { id: 'as-type-cast',       regex: /\bas\s+[A-Z][A-Za-z0-9]*\b(?!\s*(?:const|unknown))/g },
  { id: 'any-annotation',     regex: /:\s*any\b/g },
  { id: 'ts-ignore-pragma',   regex: /@ts-(?:ignore|expect-error)\b/g },
  { id: 'magic-number',       regex: /…/g },  // very broad
];
```

That's it. No pattern for:

- Raw Tailwind utility classes (`bg-gray-*`, `text-gray-*`, `opacity-0 group-hover:*`)
- Hardcoded color values (hex / rgb / palette tokens not from the design system)
- Components in editor source with ZERO `.ac-*` consumers (the negative-space query)
- Hover-only affordances on touch-relevant surfaces
- Statistical outliers — components whose className composition diverges from siblings
- "Does this component consume the design system or fight it?" — anything semantic

`prd-themed-pattern-hunter.ts` does keyword extraction from the PRD and greps for those keywords. Domain-relevant when the PRD names domain terms; near-useless for anti-pattern hunting (PRDs describe what should exist, not what shouldn't).

`regime-holdout-detector.ts` fuses the four pre-existing gate scanners — all of which require a registered entry to match. This is reactive by design.

`ui-route-enumerator.ts` and `clone-detector-reader.ts` solve different problems.

So the *collective* discovery capability is: "find occurrences of a fixed list of pre-named patterns + grep for PRD keywords + reflect what the gates already match." Calling this set "discovery" is misleading. It's pattern *inventory*.

## Failure modes catalogued

| Failure mode | What's missing | What it would look like working |
|---|---|---|
| **Novel-anti-pattern blindness** | No mechanism to surface a regex-matchable shape until someone adds it to a pattern catalog | An agent that produces a ranked list of "frequently-occurring shapes that don't match any registered pattern" — operator triages, registered patterns grow over time |
| **Negative-space blindness** | The "components that don't consume canonical primitives" query isn't computed even though the data exists in `ac-class-consumer` results | A computed pattern: files matching `modules/(akai\|roland)*-editor/src/components/**/*.tsx` with ZERO `.ac-*` hits get flagged as design-system holdouts |
| **Signal-in-noise burial** | The `magic-number` pattern catches everything from inline literals to Tailwind class numbers; 2117 hits drown actual findings | Patterns need narrower regexes OR the synthesis layer needs to cluster/dedupe by shape, not just count |
| **No semantic-awareness layer** | Regex agents can't tell "does this code follow the design system or invent its own chrome?" | An LLM-reading agent that reads each component and produces a design-system-adherence score, or surfaces "novel-pattern" semantic clusters |
| **No statistical outlier detection** | Components are scanned in isolation, no comparison to sibling-component shape | A clustering pass per directory — components whose className-token composition is anomalous vs siblings get flagged |
| **No "registry coverage" report** | No visibility into "what fraction of the editor source consumes any canonical primitive?" — would have shown <100% and surfaced the holdouts | A coverage report: per-directory % of components that consume ≥1 .ac-* primitive |
| **No reactive-vs-proactive separation in the output** | Operator can't distinguish "this finding came from a registered pattern" vs "this finding is a candidate new pattern" | Tag every finding with provenance: REGISTERED-PATTERN vs DISCOVERED-CANDIDATE |

## The specific failure that would have caught KeygroupSummary

The cheapest mechanical fix that would have surfaced this exact incident: a **negative-space pattern**.

Pseudocode in `ast-grep-matrix.ts` or a sibling agent:

```ts
// For every .tsx file in modules/(akai|roland)*-editor/src/components/**:
//   count `.ac-*` className hits (already collected by ac-class-consumer pattern)
//   count Tailwind utility className hits (would need a new pattern: \b(bg|text|border|opacity|w|h|p|m|gap|grid|flex)-[a-z0-9-]+)
//   if ac_hits == 0 && tw_hits > 5:
//     emit { file, severity: "high", reason: "design-system holdout — consumes zero .ac-* primitives + N Tailwind utilities" }
```

KeygroupSummary's score on this query: 0 `.ac-*` hits + 14 Tailwind utility class hits. Would have surfaced as the #1 holdout in the next scope-inventory run.

This is one example among many. The broader point: the discovery agents should DERIVE patterns from data, not just match against a hardcoded vocabulary.

## Proposed solution directions (no prescriptions — figure-out-able by the deskwork team)

Roughly increasing effort:

### 1. Add a small set of high-yield "shape" patterns to the inventory

- Tailwind utility regex (per design-system-adoption project that uses Tailwind alongside a token system)
- Hardcoded color values (`#[0-9a-f]{3,6}`, `rgb(`, `hsl(`)
- Hover-only opacity affordances (`opacity-0[\s"]*group-hover:opacity-100`)
- Components-without-canonical-consumers (negative space — emit when `.ac-*` hits = 0 in editor source)

This is the cheapest fix and would have caught the KeygroupSummary class of holdouts. Probably ~50 LOC of pattern additions per project, configurable via a per-project pattern manifest.

### 2. Compute coverage / outlier metrics in the synthesis layer

After running the registered patterns, the synthesis pass should compute:

- **Design-system adoption percentage** per directory: what fraction of `*.tsx` files consume ≥1 `.ac-*` primitive
- **Outlier components per directory**: which components have anomalous className-token composition vs siblings
- **Pattern novelty score**: which className strings appear frequently but don't match any registered pattern (candidates for new pattern entries)

These aren't new agents — they're synthesis-layer computations over the existing data. Could ship as part of `synthesis.ts`.

### 3. Tag finding provenance

Every finding in the synthesis output should carry a `provenance` field:

- `registered-pattern` — matched a pattern in the catalog (current behavior)
- `discovered-candidate` — surfaced by clustering / outlier analysis; needs operator triage to either register or dismiss
- `coverage-gap` — emerged from a negative-space query
- `prd-theme` — matched a PRD keyword (current behavior; lowest signal)

Operator-facing reports group by provenance. `discovered-candidate` is where the actual discovery value lives.

### 4. LLM-augmented semantic discovery agent (longer-term)

Read each `*.tsx` file. Produce a structured "does this consume the design system or fight it?" assessment. Catches semantic holdouts the regex agents can't reach. Higher cost per run; can be sampled (not every file every run); can be gated to files that scored high on cheaper outlier metrics.

### 5. Discovery agents in the host project, not the plugin

If a project has Tailwind, the Tailwind-utility-class pattern is high-yield. If a project doesn't, that pattern is noise. The dw-lifecycle plugin probably can't ship one-size-fits-all patterns — but it COULD ship a mechanism for adopter projects to define their own pattern catalog that the discovery agents consume. Today, the patterns are hardcoded in the agent source files; making them config-driven (`docs/scope-discovery/discovery-patterns.yaml` per project) would let host projects extend the vocabulary without forking the agent.

## Cross-references

- Incident commits: `885b2d61` → `d6685609` on `feature/akai-harmonization` in `audiocontrol-org/audiocontrol`. `d6685609` specifically is the fix-commit for the KeygroupSummary holdout (rewrote it from scratch using a new `.ac-summary-table` primitive in editor-core).
- Companion issue #314 — canonicalize the visual-verification gate that catches operator-side what discovery missed.
- Companion top-level doc — `VISUAL-VERIFICATION.md` at https://github.com/audiocontrol-org/audiocontrol/blob/feature/akai-harmonization/VISUAL-VERIFICATION.md — the in-repo operational protocol that motivated #314.
- Existing scope-discovery agents — `tools/scope-discovery/discovery-agents/*.ts` in `audiocontrol-org/audiocontrol` (currently host-repo-local; the deskwork team is canonicalizing into the dw-lifecycle plugin).

## Why this matters

The discovery tooling is more pernicious than no tooling at all when it's named *discovery* but acts as *inventory*. An operator (or a downstream agent) trusts the green discovery report as evidence that there are no novel anti-patterns. There were. The discipline that should keep regime drift mechanical instead becomes a false-positive defense — passes the gates, ships the regression, operator catches at review, lesson repeats.

The fix doesn't have to be all of the above. Even option #1 alone (add 4-5 high-yield patterns, especially the negative-space "no ac-* consumer" pattern) would have caught this incident.
<!-- SECTION:DESCRIPTION:END -->
