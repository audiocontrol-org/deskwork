# design-control

Portable **UX/UI surface-change discipline**, packaged as a deskwork
marketplace plugin. It is the UX/UI-surface specialization of the sibling
[`stack-control`](../stack-control/README.md) plugin's stance: agents are
capable-but-unreliable, so you get good design outcomes by engineering the
process so the bad outcome can't happen — not by lecturing the agent.

> **Read the thesis first.** Every change to a UI surface flows through a
> wireframe → design-language → implement → archive lifecycle. The WHY beneath
> every decision is [`DESIGN-DISCIPLINE-THESIS.md`](../../DESIGN-DISCIPLINE-THESIS.md),
> starting with *"Why a discipline at all — the lifecycle philosophy."*

## What it does

A UI surface change moves through these waypoints:

1. **Wireframe** (`/design-control:wireframe`) — author a deliberately lo-fi
   wireframe for a named surface. A pinned lint (`check-wireframe`) enforces the
   lo-fi constraint with zero findings before the draft may be presented. The
   optional `/frontend-design` accelerator routes through the same lint.
2. **Translate design-language** (`/design-control:translate-design-language`) —
   draft or maintain the project's design-language spec: the hand-authorable
   markdown that anchors visual identity (palette / type / spacing tokens +
   signature components, each rule linked to live CSS with ≥1 example).
   Hand-authoring is the default and needs **no engine**; the `check-design-spec`
   gate (schema + static link-liveness) judges every draft, engine-authored or
   not.
3. **Implement & archive** — the change is implemented against the approved
   wireframe + design-language, then recorded via the plugin's own archive
   primitive with derived-provenance and a `design-control status` view.

The **referee** — a cross-model design audit-barrage that judges a screenshot /
live interface against wireframe-spirit + design-language-letter — is an
**advisory, gated track**: it ships only once it empirically earns trust, and
its output is optional evidence until then.

## Bin verbs

The plugin ships thin shims under `bin/` that dispatch to the tested TypeScript
core via the workspace `tsx` runner:

| Verb | Purpose |
|---|---|
| `check-wireframe` | Run the pinned lo-fi wireframe lint |
| `check-design-spec` | Validate a design-language spec (schema + link-liveness) |
| `wireframe-provenance` | Record / verify driving + derived wireframe provenance |
| `design-control-status` | Per-surface archive + provenance status view |

## Install

Follow the marketplace install path documented on the
[GitHub releases page](https://github.com/audiocontrol-org/deskwork/releases) —
the release list is the source of truth for the current tag.

## Development

This plugin is an in-tree TypeScript workspace package
(`@deskwork/plugin-design-control`), run via `tsx` — there is no precompiled
bundle. Tests:

```bash
npm --workspace @deskwork/plugin-design-control test   # tsc --noEmit && vitest
```

Licensed GPL-3.0-or-later.
