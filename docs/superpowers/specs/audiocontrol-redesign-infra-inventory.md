# Audiocontrol.org UX/UI Redesign Infrastructure — Inventory

**Repository roots surveyed:**
- Primary (design-rich): `/Users/orion/work/audiocontrol.org-work/audiocontrol.org-design-system-foundation`
- Secondary: `/Users/orion/work/audiocontrol.org` (live production)
- Secondary: `/Users/orion/work/audiocontrol-work/audiocontrol.org-audiocontrol-redesign`

**Last surveyed:** 2026-06-04  
**Status:** Load-bearing infrastructure (in active use across multiple sites)

---

## 1. Design Governance — Two-Doc Model

### Files

| Path | Role |
|------|------|
| `/audiocontrol.org-design-system-foundation/DESIGN-DECISIONS-PROTOCOL.md` (lines 1–151) | Repo-root protocol governing design decision discovery, archiving, and governance |
| `/audiocontrol.org-design-system-foundation/src/sites/audiocontrol/DESIGN-SYSTEM.md` (lines 1–195) | Audiocontrol.org site-specific settled design language (tokens, typography, components) |
| `/audiocontrol.org-design-system-foundation/src/sites/editorialcontrol/DESIGN-SYSTEM.md` (lines 1–210) | Editorialcontrol.org site-specific settled design language |
| `/audiocontrol.org-design-system-foundation/.claude/rules/design-discipline.md` (lines 1–34) | Operational read-before/update-with rule for designers & implementers |

### Two-Doc Contract

**`DESIGN-DECISIONS-PROTOCOL.md`** (repo-root):
- **Records what is *explored***
- Archive layout: `docs/<version>/<status>/<slug>/explorations/{ACCEPTED,REJECTED}/<YYYY-MM-DD>-<slug>/`
- Every decision gets a `brief.md` (frontmatter + 4 fixed sections: What, Why, When, Feature reference)
- **Brief frontmatter contract** (lines 80–104):
  ```markdown
  ---
  proposal: <short description>
  status: ACCEPTED | REJECTED
  date: YYYY-MM-DD
  feature: <relative path to feature dir, or N/A>
  visual: "self-contained: ./mockup.html" | <relative path> | "N/A — non-visual"
  ---
  ```
- Single-pass rejections matter: each variant the operator passed over gets a REJECTED entry
- Visual single-source-of-truth: either self-contained in the entry or referenced elsewhere, never duplicated
- Governance principle: **read the protocol before picking/rejecting a direction; update it in the same commit** (lines 125–135)

**Per-site `DESIGN-SYSTEM.md`** (each site has one in `src/sites/<site>/`):
- **Records what is *settled***
- Ground truth for that site's design language
- Read this doc before any UI design or implementation work on that site
- If a choice is documented there, do not re-propose it silently; update the doc if revisiting is needed

### Archive Structure (Concrete Example)

Path: `/audiocontrol.org-design-system-foundation/docs/1.0/001-IN-PROGRESS/design-system-foundation/explorations/`

```
explorations/
├── ACCEPTED/
│   └── 2026-06-02-s3000xl-available-card/
│       └── brief.md                          # Accepted decision to promote S3000XL as real available card
├── REJECTED/
│   └── 2026-06-02-s3000xl-launching-state/
│       └── brief.md                          # Rejected proposal for a third "launching" status
└── [other sketches, no archive entries]
```

**Brief examples** (lines 1–41 of each):
- **ACCEPTED**: "Promote Akai S3000XL as a real `available` ProjectCard" — decision rationale, operator framing captured
- **REJECTED**: "A third `launching` ProjectCard status" — why superseded by the accepted direction; prevents re-proposal

---

## 2. Design System Foundation — Tokens & Consumption

### Design Tokens Files

| Path | Role | Authority |
|------|------|-----------|
| `/audiocontrol.org-design-system-foundation/src/shared/design-tokens-base.css` (lines 1–81) | Shared structural tokens (identical across both sites) | Authoritative for shared values |
| `/audiocontrol.org-design-system-foundation/src/sites/audiocontrol/styles/design-tokens.css` (lines 1–100+) | Audiocontrol.org site-specific tokens (colors, fonts, glow) | Authoritative for audiocontrol |
| `/audiocontrol.org-design-system-foundation/src/sites/editorialcontrol/styles/design-tokens.css` | Editorialcontrol.org site-specific tokens | Authoritative for editorialcontrol |

### Brand TS Mirror

| Path | Role | Sync |
|------|------|------|
| `/audiocontrol.org-design-system-foundation/src/shared/brand.ts` (lines 1–67) | Shared Brand interface (contract for color/typography structure) | Hand-mirrored by convention |
| `/audiocontrol.org-design-system-foundation/src/sites/audiocontrol/brand.ts` (lines 1–45) | Audiocontrol colors + 3 font stacks | Hand-mirrored; CSS is authoritative |
| `/audiocontrol.org-design-system-foundation/src/sites/editorialcontrol/brand.ts` | Editorialcontrol colors + 3 font stacks | Hand-mirrored; CSS is authoritative |

### Token Structure

**Shared base** (`design-tokens-base.css`, lines 14–42):
- `--container-padding: 2rem`
- `--measure-narrow: 28rem`
- `--rule-hairline: 1px`
- `--rule-medium: 2px`
- `--font-mono`, `--font-heading` (both sites)
- Type scale: `--text-xs` (0.75rem) through `--text-3xl` (2rem)
- Radius scale: `--radius-sm`, `--radius-md`, `--radius-full`
- Three shared utility classes: `.site-container`, `.rule-double`, `.card-glow`, `@keyframes ticker`

**Audiocontrol.org site-specific** (`design-tokens.css`, lines 17–57):
- Layout: `--container-max-width: 1400px`, `--measure-reading: 36rem`
- Colors (HSL): background, card, foreground, primary (phosphor amber), accent (Roland-blue), borders, badges
- Typography: `--font-display` (Departure Mono), `--font-body` (IBM Plex Sans)
- Glow/shadow: `--card-glow`, `--card-glow-hover`, `--phosphor-glow`
- Font faces: self-hosted `@font-face` for Departure Mono (400 only) + IBM Plex Sans (400, 500, 600, 700)

**Editorialcontrol.org site-specific** (`design-tokens.css`):
- Layout: `--container-max-width: 1280px`, `--measure-reading: 34rem`
- Colors (HSL): background, card, foreground, primary (signal-green chartreuse), accent (parchment cream)
- Typography: `--font-display` (Fraunces serif), `--font-body` (Inter) — no `@font-face` declared
- Glow/shadow: `--card-glow`, `--card-glow-hover` (no text glow token)

### Token Consumption Pattern

**In components** (read-only):
- CSS vars: `hsl(var(--primary) / 0.5)` — HSL components stored as `H S% L%` strings in custom properties
- TS type access: import `brand` from site's `brand.ts`, read `colors.primary` or `typography.display` if needed in build scripts

**Known drift** (documented in DESIGN-SYSTEM.md lines 166–187):
- `brand.ts` is a subset mirror: carries only the 9 BrandColors + 3 font stacks
- CSS tokens file is authoritative; badge colors, rule weights, layout/measure, glow, and `--font-heading` exist only in CSS
- `--font-mono` has no `@font-face` in either site (loads via system fallback or elsewhere)
- No general spacing scale (no `--space-1..n`); spacing is hard-coded per class

---

## 3. Mockup Workflow — From Exploration to Implementation

### Directory Layout

**Feature structure** (lines 48–64 of DESIGN-DECISIONS-PROTOCOL.md):
```
docs/<version>/<status>/<slug>/
├── prd.md                                     # Feature PRD
├── workplan.md                                # Implementation workplan
├── README.md                                  # Status table
├── explorations/
│   ├── <misc sketches, early directions>
│   ├── ACCEPTED/
│   │   └── <YYYY-MM-DD>-<slug>/brief.md
│   └── REJECTED/
│       └── <YYYY-MM-DD>-<slug>/brief.md
└── implementation/ or src/                    # Graduated code
```

### Concrete Example — S3000XL Card Redesign

**Feature path:** `/audiocontrol.org-design-system-foundation/docs/1.0/001-IN-PROGRESS/design-system-foundation/`

**Files involved:**
- `prd.md` — feature motivation (Phase 1 Gate Decisions, PRD §3)
- `workplan.md` — acceptance criteria, Phase 4 task breakdown
- `explorations/ACCEPTED/2026-06-02-s3000xl-available-card/brief.md` — decision to reuse existing `available` card state
- `explorations/REJECTED/2026-06-02-s3000xl-launching-state/brief.md` — why a third `launching` status was not needed
- `src/sites/audiocontrol/pages/index.astro` — implementation: S3000XL now renders as `<ProjectCard status="available" />`

**Flow:**
1. PRD proposes candidate directions (originally: introduce a `launching` status for not-yet-deployed editors)
2. Operator gate interview decides: reuse `available` state instead (June 1, 2026)
3. Decision recorded in two briefs: ACCEPTED (the winner) + REJECTED (the alternative, marked superseded)
4. Implementation branch merges card logic unchanged (no type change to `ProjectCard`)
5. Stand-in `href: "#"` and placeholder image tracked as PRE-MERGE MUST-FIX in workplan

### No "Design Lab" / Gallery

- **Mockups are authored in `mockup.html` files or as relative-path references** — not in a central gallery
- **No dev-server or design-lab service** is present; mockups are static HTML snapshots or references to live pages
- **Playwright is used for e2e testing** (not for visual regression at design-time), invoked by `npm run test:e2e`

---

## 4. Visual Regression & Verification Tooling

### Playwright Configuration

**File:** `/audiocontrol.org-design-system-foundation/playwright.config.ts` (lines 1–23)

```typescript
export default defineConfig({
  testDir: './test/e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
```

- Single project (Chromium desktop only; no iOS/WebKit probes)
- Fully parallel test execution
- Retry policy: CI retries 2x, local runs 0x
- Traces on first retry only

### Invocation

**Package.json scripts** (lines 5–20):
- `npm run test:e2e` → runs Playwright tests (defined in `./test/e2e/`)

### Discovery & Screenshot Tooling

**Discovery document:** `/audiocontrol.org-design-system-foundation/docs/1.0/001-IN-PROGRESS/design-system-foundation/discovery/06-screenshot-probe.md`

| Purpose | Evidence |
|---------|----------|
| **Viability of Roland S-330/S-550 editors for screenshots** | Playwright probe of live `/roland/{s330,s550}/editor` via production proxy paths (not bare Netlify URL) |
| **CONNECT tab renders without hardware** | Yes — front-panel UI + status readout + reference panel (visually attractive, honest) |
| **Data tabs (PLAY/PATCHES/LIBRARY) render without hardware** | No — gated behind live MIDI, show "Not Connected" empty states |
| **Akai S3000XL editor screenshotability** | Module is a Vite app, locally runnable best-effort; populated UI without hardware unverified; safe default = image-less promotion |
| **Evidence screenshots** | `probe-evidence/{s330-connect-state,s550-connect-state,s330-patches-state,s330-library-state}.png` (in discovery dir) |

**Script-based screenshot generation:**
- `/audiocontrol.org-work/audiocontrol.org-design-system-foundation/scripts/generate-og-images.ts` (invoked by `npm run generate-og`) — generates OG (Open Graph) social images, not design-verification screenshots
- No dedicated `screenshot-*`, `visual-*`, `viewport-*`, or `regress-*` scripts for design verification

### Visual Regression & Probing Strategy

**No automated visual regression at design-time.** Instead:
- **Playwright e2e tests** verify functional rendering (test suite in `./test/e2e/`)
- **Manual screenshot probes** when a new component/editor needs viability assessment (example: 06-screenshot-probe.md)
- **Live product screenshots** taken manually from production proxy paths (not synthetic)

---

## 5. Frontend-Design Skill & Design-Task Workflow

### Design Task Initiation

**No dedicated `/frontend-design` skill invocation model found.** Instead, design discipline is enforced via:

1. **Read-before rule** (`.claude/rules/design-discipline.md`, lines 1–34):
   - Before UI/design work, read the relevant per-site `DESIGN-SYSTEM.md`
   - Read the repo-root `DESIGN-DECISIONS-PROTOCOL.md` before picking/rejecting directions
   - If a choice is already documented, do not re-propose it silently

2. **Update-with rule** (lines 19–25):
   - When a design decision has global impact (changes vocabulary, alters element appearance/behavior, applies across pages, differs desktop/mobile), update the relevant `DESIGN-SYSTEM.md` **in the same commit** as implementation
   - The update is part of the work, not a follow-up

3. **Session lifecycle** (`.claude/CLAUDE.md`, lines 1–47):
   - Before starting: read feature workplan, latest journal entry, open issues
   - After work: update README status, workplan acceptance criteria, write DEVELOPMENT-NOTES.md entry
   - Use `/session-start` or `/feature-pickup` to automate

### Artifacts Produced

| Artifact | Created By | Location | Purpose |
|----------|-----------|----------|---------|
| Feature PRD | project-orchestrator (delegated agent) | `docs/1.0/<status>/<slug>/prd.md` | Feature motivation, acceptance criteria, design decisions |
| Workplan | project-orchestrator | `docs/1.0/<status>/<slug>/workplan.md` | Task breakdown, phase sequencing, tracking |
| Brief (ACCEPTED) | Designer/operator | `docs/<slug>/explorations/ACCEPTED/<YYYY-MM-DD>-<slug>/brief.md` | Decision rationale, visual reference, when implemented |
| Brief (REJECTED) | Designer/operator | `docs/<slug>/explorations/REJECTED/<YYYY-MM-DD>-<slug>/brief.md` | Why alternative was discarded; prevents re-proposal |
| Mockup | Designer | `docs/<slug>/explorations/<...>/mockup.html` or elsewhere | Visual candidate for operator review (self-contained HTML or reference) |
| DEVELOPMENT-NOTES entry | Implementer | `DEVELOPMENT-NOTES.md` | Session summary: goal, accomplished, didn't work, corrections, quantitative |

---

## 6. End-to-End Example — S3000XL Card Promotion

### Traced Files (June 1–2, 2026)

**Decision point** (`prd.md`, Phase 1 Gate):
- Original plan: introduce a third `launching` ProjectCard status for imminent-but-not-deployed editors
- Operator gate decision: *"build a real available card now"* — reuse the existing two-state card

**Briefs filed** (same day as decision):

1. **ACCEPTED entry** (`explorations/ACCEPTED/2026-06-02-s3000xl-available-card/brief.md`):
   - Frontmatter: `status: ACCEPTED`, `date: 2026-06-02`
   - What: Reuse the existing `available` `ProjectCard` state (anchor, dimension-bracket corners, full opacity)
   - Why: Operator chose to treat S3000XL as a real available card on the expectation the editor is ready by ship; avoids a one-off status
   - When: Decision 2026-06-01 (gate), Implementation commit `e6d2381`
   - Visual: `"rendered live — src/sites/audiocontrol/pages/index.astro (homepage) + pages/editors/index.astro"`

2. **REJECTED entry** (`explorations/REJECTED/2026-06-02-s3000xl-launching-state/brief.md`):
   - Frontmatter: `status: REJECTED`, `date: 2026-06-02`
   - What: Proposed third `launching` member of the status union (non-anchor, "Launching soon" CTA)
   - Why: Superseded by the available-card direction; `launching` would add surface that earns its keep only if pattern recurs (it did not)
   - Visual: `"N/A — non-visual decision; the launching state was never mocked"`

**Implementation** (`src/sites/audiocontrol/pages/index.astro`):
- S3000XL moved into `availableProjects` array (no `ProjectCard` type change)
- Carries placeholder `href: "#"` and placeholder image (tracked as PRE-MERGE MUST-FIX)
- Hero count updated: now "03 available · 02 in development"

**Workplan tracking** (`workplan.md`, Phase 4):
- PRE-MERGE MUST-FIX: replace stand-in href with real `/akai/s3000xl/editor` deploy
- PRE-MERGE MUST-FIX: replace placeholder card image with true S3000XL screenshot (or image-less if shot not ready)

**Design system impact:**
- No global-pattern change → no update to `DESIGN-SYSTEM.md` needed
- Card pattern was already documented; no new vocabulary introduced

---

## 7. What Makes This Infrastructure Robust

### Preventive Design Discipline

1. **Two-doc model separates concerns cleanly:**
   - DESIGN-SYSTEM.md (what is settled) prevents silent drift and re-litigation
   - DESIGN-DECISIONS-PROTOCOL.md (what was explored) is durable record of decisions, kills re-proposals

2. **Per-feature brief archive is scoped:**
   - Not in a central design folder; lives alongside feature's `explorations/`
   - Indexed by decision date + slug (e.g., `2026-06-02-s3000xl-available-card`)
   - Single-pass rejections matter: every variant the operator rejected gets its own REJECTED entry

3. **Brief contract is fixed & machine-parseable:**
   - Frontmatter (proposal, status, date, feature, visual) is searchable index
   - Four-section body (What, Why, When, Feature reference) keeps briefs short & focused
   - Prevents sprawling design specs that become outdated

4. **Visual single-source-of-truth rule:**
   - Never copy a visual into multiple entries
   - Either self-contained in the entry or referenced elsewhere
   - Non-visual decisions use `visual: N/A`

5. **Governance is actionable:**
   - Read-before: makes settled choices durable (no silent drift)
   - Update-with: forces awareness of global-impact changes (same commit as implementation)
   - Two-site nuance: cross-site decisions called out explicitly so readers of either site's DESIGN-SYSTEM can find shared concerns

### Design Tokens as Load-Bearing Code

1. **Shared base lives in CSS, mirrored in TS:**
   - CSS is authoritative (design-tokens.css)
   - TS mirror (brand.ts) is a consistent subset (hand-mirrored by convention, no generator yet)
   - Consumption pattern: `hsl(var(--primary) / 0.5)` lets designers reason about opacity without re-specifying color

2. **Tokens are co-located with sites:**
   - Not in a separate package; live alongside the site's styles/
   - Each site's DESIGN-SYSTEM.md documents its tokens, making them discoverable

3. **Component patterns are tokens + classes:**
   - `.card-glow`, `.panel-label`, `.rule-accent`, `.phosphor`, `.signal-led` are settled UI vocabulary
   - Defined in tokens file, documented in DESIGN-SYSTEM.md (§5 "Code-only aesthetic motifs")
   - Any new class/pattern gets a DESIGN-SYSTEM.md entry so future designers know what exists

### Mockup Workflow is Low-Friction

1. **Mockups are authored as HTML files or live links:**
   - No design-tool proprietary format (Figma, Sketch, Illustrator)
   - Stored in git, versioned alongside code
   - Can be rendered live from feature pages

2. **No central design-review gallery:**
   - Keeps friction low (designer makes a mockup.html, commits it, asks for review)
   - Prevents a separate "design approval" step that serializes work

3. **Brief is the operator's approval artifact:**
   - Brief contains the rationale, date, and link to motivating feature
   - ACCEPTED/REJECTED status in brief is the durable record (not a Figma comment that rots)

### Testing & Verification

1. **Playwright for e2e, not visual regression:**
   - Functional correctness is automated (test suite in `./test/e2e/`)
   - Visual changes are manually reviewed in briefs + tested on production (screenshot probe example)
   - Reduces brittleness (visual regression tests are maintenance-heavy)

2. **Screenshot probes for high-risk UI:**
   - When a new editor/component needs verification, do a live probe (example: 06-screenshot-probe.md)
   - Document evidence in discovery directory alongside the feature
   - No synthetic data; screenshots are from production paths or realistic dev scenarios

3. **Device targeting is explicit:**
   - Playwright config targets Chromium desktop only (no iOS/WebKit yet)
   - If mobile or multi-device support is added, config gets a new project entry (clear, auditable)

---

## 8. Adoptable Pieces for Deskwork

### Tier 1: Copy & Adapt

1. **Two-doc model + archive layout:**
   - Create `DESIGN-DECISIONS-PROTOCOL.md` in deskwork repo root
   - Create `docs/<version>/<status>/<slug>/explorations/{ACCEPTED,REJECTED}/` dirs (matching your feature structure)
   - Adapt brief.md frontmatter + four-section template to deskwork's feature vocabulary

2. **Design Discipline Rule:**
   - Copy `.claude/rules/design-discipline.md` pattern to deskwork's `.claude/rules/`
   - Customize DESIGN-SYSTEM paths & site names
   - Enforce via pre-UI-work checklist

3. **Per-site DESIGN-SYSTEM.md template:**
   - Create one for each deskwork "site" or major visual surface (e.g., Editor UI, Dashboard, Client UI)
   - Structure: color roles, typography, layout tokens, code-only aesthetic motifs (utility classes), components, known drift
   - Link to the protocol from the DESIGN-SYSTEM ("when picking/rejecting, read the protocol")

4. **Token structure + consumption pattern:**
   - Host tokens in `src/sites/<site>/styles/design-tokens.css` (or similar)
   - Mirror structure in `brand.ts` (or `config.ts`)
   - Document how components read tokens (HSL vars, TS imports, etc.) in DESIGN-SYSTEM.md

### Tier 2: Adapt with Caution

1. **Brief contract frontmatter:**
   - The four fields (proposal, status, date, feature, visual) are generic enough to adopt as-is
   - Visual field can reference mockup.html, live URLs, or Figma links (deskwork may have different tools)

2. **Playwright for e2e:**
   - If you have similar browser-target variety, adopt the config pattern (projects array for different profiles)
   - Keep visual regression manual (screenshot probes) rather than automating it (lower maintenance cost)

3. **Mockup workflow:**
   - If deskwork has a design-tool workflow (Figma, etc.), store mockup references in brief.md (not the file itself)
   - Operator approval = ACCEPTED/REJECTED brief filing (same discipline, different artifact storage)

### Tier 3: Not Ready / Context-Specific

1. **OG image generation scripts:**
   - Audiocontrol uses Satori + Sharp for automated OG image baking
   - Only adopt if deskwork has similar editorial/blog content pipeline

2. **Feature image studio:**
   - Audiocontrol has a specialized studio for generating feature images (editorial publication need)
   - Likely not needed for deskwork unless you have similar content-generation workflows

3. **Multi-site setup:**
   - Audiocontrol serves audiocontrol.org + editorialcontrol.org from one repo
   - Deskwork may not need this; adopt the token-mirroring discipline if you do

---

## Appendix: Files Catalogued

### Governance & Protocol

- `/audiocontrol.org-design-system-foundation/DESIGN-DECISIONS-PROTOCOL.md` — 151 lines, load-bearing
- `/audiocontrol.org-design-system-foundation/src/sites/audiocontrol/DESIGN-SYSTEM.md` — 195 lines, authoritative
- `/audiocontrol.org-design-system-foundation/src/sites/editorialcontrol/DESIGN-SYSTEM.md` — 210 lines, authoritative
- `/audiocontrol.org-design-system-foundation/.claude/rules/design-discipline.md` — 34 lines, operational

### Design Tokens

- `/audiocontrol.org-design-system-foundation/src/shared/design-tokens-base.css` — 81 lines (shared structural)
- `/audiocontrol.org-design-system-foundation/src/sites/audiocontrol/styles/design-tokens.css` — 100+ lines (site-specific)
- `/audiocontrol.org-design-system-foundation/src/sites/editorialcontrol/styles/design-tokens.css` — (site-specific)
- `/audiocontrol.org-design-system-foundation/src/shared/brand.ts` — 67 lines (shared interface)
- `/audiocontrol.org-design-system-foundation/src/sites/audiocontrol/brand.ts` — 45 lines (site-specific mirror)

### Mockup Workflow & Examples

- `/audiocontrol.org-design-system-foundation/docs/1.0/001-IN-PROGRESS/design-system-foundation/explorations/ACCEPTED/2026-06-02-s3000xl-available-card/brief.md` — 41 lines (concrete ACCEPTED)
- `/audiocontrol.org-design-system-foundation/docs/1.0/001-IN-PROGRESS/design-system-foundation/explorations/REJECTED/2026-06-02-s3000xl-launching-state/brief.md` — 36 lines (concrete REJECTED)

### Verification & Playwright

- `/audiocontrol.org-design-system-foundation/playwright.config.ts` — 23 lines (e2e config)
- `/audiocontrol.org-design-system-foundation/docs/1.0/001-IN-PROGRESS/design-system-foundation/discovery/06-screenshot-probe.md` — 85 lines (screenshot viability probe)

### Session Lifecycle & Operational Rules

- `/audiocontrol.org-design-system-foundation/.claude/CLAUDE.md` — 245 lines (session lifecycle, project structure, delegation)
- `/audiocontrol.org-design-system-foundation/package.json` (lines 5–20 scripts) — npm run dev, build, test:e2e, generate-og

---

**End of inventory. Use this as a reference map to understand the infrastructure's shape, governance, and integration points. The two-doc model + archive discipline is the foundation; token structure is the UX substance; Playwright e2e + manual probes are the verification strategy.**
