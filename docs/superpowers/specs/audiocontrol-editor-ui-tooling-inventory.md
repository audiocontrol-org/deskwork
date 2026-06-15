# Audiocontrol Editor UI Tooling Inventory

**Status:** Research — read-only exploration of audiocontrol editor monorepo
**Date:** 2026-06-04
**Scope:** Visual-regression tooling, UI testing process, design governance, traced UI update workflow, component/surface structure, repeatable sane-update loop

---

## 1. Visual-Regression Tooling

### Baseline Capture & Storage

**Files:**
- `/Users/orion/work/audiocontrol-work/audiocontrol/scripts/visual-compare.mjs` — SHA256 hash comparison (lines 1-73)
- `/Users/orion/work/audiocontrol-work/audiocontrol/scripts/visual-update-baseline.mjs` — baseline directory sync (lines 1-17)

**Baseline Layout** (per module):
```
modules/<editor>/
├── artifacts/visual/baseline/           # Source of truth — canonical screenshots
│   ├── after-s330-connect.png
│   ├── after-s330-patches.png
│   ├── after-s330-tones.png
│   └── after-s330-play.png
└── test-results/visual/current/         # Ephemeral — generated on each test run
    ├── after-s330-connect.png
    ├── after-s330-patches.png
    ├── after-s330-tones.png
    └── after-s330-play.png
```

### Comparison & Diffing Model

**Tolerance:** None — exact byte-level SHA256 hash match required. (`visual-compare.mjs:51-57`)
- Baseline hash computed via `createHash('sha256').update(data).digest('hex')`
- Current hash computed identically
- If hashes differ: file flagged as `Mismatch: <file> (baseline <size> bytes vs current <size> bytes)`
- If current file missing from baseline: flagged as "Missing current image"
- If baseline file absent in current: flagged as "Extra current image without baseline"

**Exit Code Semantics:**
- `0` (PASS) — all baselines match current, file counts match
- `1` (FAIL) — any hash mismatch, size difference, or file-count mismatch

### Screenshot Capture Pipeline

**File:** `/Users/orion/work/audiocontrol-work/audiocontrol/modules/roland-sxx0-editor/visual/capture.playwright.ts` (lines 1-25)

**Entry Point:** 
```
modules/roland-sxx0-editor/src/testing/playwrightHarness.ts:21
export async function captureEditorFixtureScreenshots(
  page: PlaywrightPageLike,
  fixture: VisualEditorFixture,
  options: CaptureFixtureOptions
)
```

**Fixture Definition** (lines 1-28 of `modules/roland-sxx0-editor/src/testing/visualFixtures.ts`):
```typescript
export const s330VisualFixture: VisualEditorFixture = {
  editorId: 's330',
  pages: [
    {
      id: 'connect',
      path: buildVisualRoute('/roland/s330/editor/'),
      readySelector: 'h2:has-text("Connect to S-330")',
    },
    {
      id: 'play',
      path: buildVisualRoute('/roland/s330/editor/play'),
      readySelector: 'h2:has-text("Play")',
    },
    {
      id: 'patches',
      path: buildVisualRoute('/roland/s330/editor/patches'),
      readySelector: 'h2:has-text("Patches")',
    },
    {
      id: 'tones',
      path: buildVisualRoute('/roland/s330/editor/tones'),
      readySelector: 'h2:has-text("Tones")',
    },
  ],
};
```

**Rendering Flow** (`playwrightHarness.ts:21-46`):
1. Set viewport size (default 1366×768)
2. Navigate to page.path
3. Wait for readySelector with 15-second timeout
4. Optional waitMs delay for animations to settle
5. Take full-page screenshot to `${outputDir}/${filePrefix}-${editorId}-${pageId}.png`

### CLI Invocation & npm Scripts

**Root level** (`/Users/orion/work/audiocontrol-work/audiocontrol/package.json:13-16`):
```bash
pnpm visual:capture        # Invokes playwright on all editors
pnpm visual:compare        # Hash comparison of all editors
pnpm visual:check          # capture + compare (full cycle)
pnpm visual:baseline:update # Copy current → baseline
```

**Module level** (`modules/roland-sxx0-editor/package.json`):
```bash
pnpm visual:capture        # playwright test -c playwright.visual.config.ts
pnpm visual:compare        # node ../../scripts/visual-compare.mjs .
pnpm visual:baseline:update # node ../../scripts/visual-update-baseline.mjs .
```

### Playwright Config

**File:** `/Users/orion/work/audiocontrol-work/audiocontrol/modules/roland-sxx0-editor/playwright.visual.config.ts` (lines 1-35)

**Key Settings:**
- `testDir: './visual'` — specs at `modules/<editor>/visual/*.playwright.ts`
- `testMatch: '**/*.playwright.ts'`
- `fullyParallel: false; workers: 1` — serial execution, deterministic order
- `baseURL: http://localhost:4330` (S-330 editor; port per `VISUAL_PORT` env var)
- `webServer` auto-starts `pnpm dev --host --port 4330` (Vite dev server)
- `reuseExistingServer: true` — skips restart if already running
- Browser: Chromium desktop

**Viewport:** 1366×768 (set in fixture, line 26 of `playwrightHarness.ts`)

### Baseline Update Workflow

**After intentional UI change:**

1. Make UI code change
2. Run `pnpm visual:capture` — generates new screenshots to `test-results/visual/current/`
3. Visually inspect current screenshots (confirm expected change)
4. Run `pnpm visual:baseline:update` — copies `test-results/visual/current/* → artifacts/visual/baseline/*`
5. Commit both the UI code change + the updated baseline PNG files

**Script behavior** (`visual-update-baseline.mjs`):
```javascript
await rm(baselineDir, { recursive: true, force: true });           // Delete old baseline
await mkdir(path.dirname(baselineDir), { recursive: true });       // Ensure parent exists
await cp(currentDir, baselineDir, { recursive: true });            // Atomic copy
```

---

## 2. TESTING-UI.md Process

**File:** `/Users/orion/work/audiocontrol-work/audiocontrol/TESTING-UI.md`

### What Gets Tested

**UI Components in Isolation** — no hardware required:
- Test harness pages with hardcoded data + local `useState` for interactions
- Real components rendered with factory-generated realistic data
- Drag interactions (mousedown → mousemove → mouseup)
- Zoom controls and scroll-wheel handling
- Selection state changes in list + detail panes
- Zone creation via drag-to-create

**Test Harness Pages** (lines 9-72):
- Located at `src/pages/Test<Feature>Page.tsx`
- Registered as routes under `/<editor>/test/<feature>` path
- Use factory helpers (e.g., `makeKeygroupHeader`) to provide data
- Vite dev server HMR enables tight feedback loop

**Example Harness** (lines 64-82):
- Route: `/akai/s3000xl/editor/test/keygroups`
- File: `modules/akai-s3k-editor/src/pages/TestKeygroupsPage.tsx`
- Factory: `modules/akai-s3k-editor/src/test-helpers/keygroup-factory.ts`
- Data: 4 hardcoded keygroups with overlapping ranges, velocity zones

### Developer Workflow

**Before claiming a UI change works** (lines 83-137):

1. **Create test harness** if not exists:
   - `src/test-helpers/<thing>-factory.ts` — exports `make<Thing>(overrides?)`
   - `src/pages/Test<Feature>Page.tsx` — imports real components + factory, wires interactions via `useState`/`useCallback`
   - Add `<Route path="/test/<feature>" element={<Test<Feature>Page />} />` in `App.tsx`

2. **Verify with screenshots**:
   ```bash
   cd modules/<editor>
   pnpm dev                    # Start Vite server
   # In another terminal:
   ./node_modules/.bin/playwright screenshot \
     --ignore-https-errors --full-page \
     "https://localhost:3300/akai/s3000xl/editor/test/keygroups" \
     /tmp/keygroups-test.png
   ```

3. **Write Playwright test specs** for every manual verification (lines 93-137):
   - File: `test/ui/<feature>.spec.ts`
   - Config: `playwright.test-harness.config.ts`
   - Run: `make test-ui-<editor>` (e.g., `test-ui-s3k`)
   
   **Example Spec** (lines 119-137):
   ```typescript
   test.describe('ZoneOverview drag interactions', () => {
     test.beforeEach(async ({ page }) => {
       await page.goto('/akai/s3000xl/editor/test/keygroups');
       await page.waitForLoadState('networkidle');
     });
   
     test('zoom fit narrows range to keygroup data', async ({ page }) => {
       await page.click('button:text("Fit")');
       // Assert range label changed from 0-127
     });
   });
   ```

**Rule:** Every interaction verified by screenshot must become a test spec. Ad-hoc screenshots without corresponding specs are throwaway work.

---

## 3. Design Governance Model

### Two Complementary Documents

**File 1:** `/Users/orion/work/audiocontrol-work/audiocontrol/DESIGN-SYSTEM.md` (1028 lines)
- **Records:** What is *settled* — tokens, vocabulary, retired patterns, load-bearing contracts
- **Read before:** Any UI design or implementation work
- **Update rule:** In the same commit as the implementation change, if global impact
- **Process:** Update this doc when a design decision has global impact (changes vocabulary, alters how a class of element looks/behaves, applies across multiple pages, differs between desktop/mobile)

**File 2:** `/Users/orion/work/audiocontrol-work/audiocontrol/DESIGN-DECISIONS-PROTOCOL.md` (110 lines)
- **Records:** What was *explored* — archive layout + brief format for ACCEPTED / REJECTED entries
- **Prevents re-litigation:** Every operator-approved design pick gets filed with rationale
- **When to file:** Same commit as implementation (ACCEPTED) or retirement commit (REJECTED)

### Archive Layout & Governance

**Per-Feature Design Decision Archive** (lines 28-40 of DESIGN-DECISIONS-PROTOCOL.md):
```
docs/<version>/<status>/<feature-slug>/explorations/
├── <single-direction sketches, early mockups>…
├── ACCEPTED/
│   └── <YYYY-MM-DD>-<slug>/
│       ├── brief.md              # required
│       ├── mockup.html           # canonical visual (or relative ref)
│       └── …                     # supporting assets
└── REJECTED/
    └── <YYYY-MM-DD>-<slug>/
        ├── brief.md              # required
        ├── mockup.html
        └── …
```

**Brief.md Frontmatter + Body** (lines 50-77):
```markdown
---
proposal: <short description>
status: ACCEPTED | REJECTED
date: YYYY-MM-DD
feature: <relative path to feature dir>
visual: <"self-contained: ./mockup.html" | relative path | "N/A">
---

# <proposal>

## What
<one paragraph — what the proposal is>

## Why <accepted | rejected>
<one to three paragraphs — the rationale>

## When
<commit SHA + date if known>

## Feature reference
<link to motivating feature dir>
```

**Visual Reference Contract** (lines 81-90):
- **Self-contained:** Visual file lives inside entry directory (default for unique proposals)
- **Relative reference:** Brief points at path elsewhere (use when same visual backs multiple entries)
- Never copy + leave duplicate elsewhere
- Non-visual decisions: `visual: N/A — non-visual decision`

### Design System Contents

**Highlights from DESIGN-SYSTEM.md:**

**Typed Capability Contracts** (lines 61-136):
- `ErrorReporter` — every error logged + displayed; required on hooks that can fail
- `RefreshNotifier` — trigger data refresh after mutations
- `ProgressReporter` — structured progress via `OperationProgress` interface
- `StrategyResult` — discriminated union `{ handled: true } | { handled: false }` (replaces boolean)

**Dialog Components** (lines 140-186):
- `ConfirmDialog` — destructive actions; stays open during async op
- `SlideDrawer` — complex forms, connection settings
- `SteppedProgressDrawer` — multi-step operations with live step log
- `SaveDialog` — save-to-library with directory picker
- `MoveDialog` — relocate items in library tree

**Optimistic Updates** (lines 190-205):
1. Update local state immediately
2. Send to device in background
3. On success: invalidate device-side cache (NOT full reload)
4. On failure: revert by reloading from device + error banner

**Layout Primitives** (lines 309-424):
- **CSS Design Tokens:** `--ac-` prefix; defined in `editor-core/src/design/tokens.css`
- **Page Shell Pattern:** Fixed-viewport flex column with internal scrolls (lines 404-498)
  - Outer `<main>` is `display: flex; flex-direction: column` with `height: calc(100dvh - header - padding)`
  - List + detail columns use `overflow: auto` for internal scrolling
  - NO `position: sticky` on page chrome (fragile inside `overflow: hidden` ancestors)
- **Modifier:** `.ac-page-shell--fixed-viewport` for list-detail pages; omit for landing pages

**v3 Atomic Control Primitives** (lines 680-938) — from validated `/frontend-design` mockups:
- `.ac-field-label` — uppercase eyebrow labels
- `.ac-select` (enhanced) — native select + custom chevron + accent focus glow
- `.ac-checkbox` — styled checkbox with check glyph
- `.ac-slider` + `.ac-range-bar` — parameter row (label | bar | readout); linear/bipolar/enum variants
- `.ac-number-input` — display-font numeric readout (read-only or editable)
- `.ac-envelope` — 8-segment VFD-glow editor (graph + meta + table)

**List Primitives** (lines 942-990) — promoted during Phase 9 Task 4:
- `.ac-list` — outer container
- `.ac-list-scroll` — inner scroll region
- `.ac-list-bank-header` — sticky uppercase header
- `.ac-list-slot` — mono slot identifier
- `.ac-list-name` / `.ac-list-name--placeholder` / `.ac-list-name--empty`
- `.ac-list-action` — hover-revealed action button

**Page-Specific CSS Organization** (lines 991-1005):
- `tokens.css` — design tokens
- `layout-primitives.css` — page shell, site chrome, list-detail grid, tabs, status indicator
- `overlay-primitives.css` — modal + slide-over drawer
- `primitives.css` — buttons, inputs, selects, labels, fields, cards, titles
- `feedback-primitives.css` — alerts, notifications, logs, progress, spinner
- `control-primitives.css` — v3 atomic primitives (`ac-field-label`, `ac-checkbox`, etc.)
- `envelope-primitives.css` — v3 envelope primitive
- `list-primitives.css` — v3 list-pane chrome
- `library.css` — library tree/dialog chrome (separate file, large)

---

## 4. Traced S-550 Editor UI Update (End-to-End Example)

### Feature: S-550 Support (Phase 0 → Phase 9)

**Status:** Phases 1-6 complete; Phase 9 (visual redesign) in progress
**Duration:** ~5 months
**Scope:** Add S-550 sampler support alongside existing S-330, unify editor under device-config registry, apply v3 design language

### Phase Overview

**Phase 0** — Protocol research + capability test suite (DEVELOPMENT-NOTES.md §Decision block)
**Phases 1-6** — Device module extraction, unified editor, hardware validation
**Phase 9** — Visual redesign applying v3 atomic primitives + design-system governance

### Concrete UI Update: Tones Page v3 Polish

**Feature File:** `/Users/orion/work/audiocontrol-work/audiocontrol/docs/1.0/003-COMPLETE/s550-support/`

**Dev Log Entry** (DEVELOPMENT-NOTES.md 2026-05-21, lines 64-112):
> "Multi-turn session driving bug-fix + design-language refinement against the Roland S-330/S-550 editor. Started with BUG-001 (export-to-library silent failure), grew into a full v3 redesign of the export dialogs, then library-tree UX work (selection, scope grouping, collapsible sections, hierarchy v3), then library-move bug fixes, then the chevron architecture rewrite..."
>
> "v3 UX work (accumulated across prior session segments). Export dialogs migrated to SlideDrawer + SteppedProgressDrawer with step-log body (kills BUG-001 empty-catch silent-failure shape). Auto-fetch missing tones during patch export. Auto-refresh library after export. Library tree selection drives preview pane. Device-memory item preview affordances (Edit / Export)."

**Commit:** `51f3149b` (54 files, +3,379/-610)
**Tests Added:** 6 wiring tests (D-LIB-24 through D-LIB-29), 1 e2e test (device-library-roundtrip)

### Files Changed in That Commit

**Tones Page Implementation:**
- `/Users/orion/work/audiocontrol-work/audiocontrol/modules/roland-sxx0-editor/src/pages/TonesPage.tsx` (lines 1-100 visible)
  - Comments cite project memory rules: `feedback_tabbed_detail_pane` (5 tabs), `feedback_live_editing_no_save` (live-edit footer), `feedback_virtual_front_panel` (CRT + front-panel binding)
  - Data cached in `deviceDataStore`; loads first bank by default
  - Detail pane uses 5-tab radio shell (Wave · Pitch · Filter · Amp · LFO)
  - Footer is live-status strip with pulsing LED (no save/cancel/undo)

**Export Dialog Migration:**
- From legacy Radix `Dialog` → v3 `SlideDrawer` + `SteppedProgressDrawer`
- Body extracted into sibling `*DialogBody.tsx` to stay under 500-LOC cap
- Empty-catch silent failures eliminated via try/catch → `setLocalError`

**Library Tree UX:**
- Multi-select with ctrl/shift-click (Bash sets `data-multi-selected` attribute)
- Batch export via `BatchExportDrawer`
- Device-memory preview affordances (Edit / Export buttons)

### Design Decision Records

**Archive Entry:** `/Users/orion/work/audiocontrol-work/audiocontrol/docs/1.0/003-COMPLETE/s550-support/explorations/ACCEPTED/2026-05-11-live-edit-footer/`

**Brief Snippet** (decisions-2026-05-11.md, lines 1-27):
> "Phase 0 Task 10 (the capability test suite) was substantially driven forward this session under the new agent-discipline rule. Five waves were dispatched; four completed cleanly and one shipped partial with an honest BLOCKED return. Six concrete decisions are required from the operator before Phase 0 Task 10 can be marked fully complete and Phase 9 (the actual redesign) can resume."

**Decision 1 — Virtual Front Panel Mounting** (lines 67-121):
- **Status:** RESOLVED (Option B with constraint)
- **Constraint:** VideoCapture mounted on every page (verified at `App.tsx:21` + `Layout.tsx:153`)
- **Work Applied:** 5 D-XX rows struck; memory rule `feedback_virtual_front_panel` updated

**Decision 6 — Atomic Primitives First** (lines 235-247):
- **Status:** SETTLED (Option A — atomic primitives first, then amend Patches/Tones, then per-page polish)
- **Sequence:** v3 atomic control primitives ship → pages consume via shared primitives → per-page polish lands
- **Blocks:** Phase 9 Task 4 (Patches/Tones pages using new `.ac-*` classes)

### Visual Verification Workflow

**Screenshot Baselines:**
- `/Users/orion/work/audiocontrol-work/audiocontrol/modules/roland-sxx0-editor/artifacts/visual/baseline/`
  - `after-s330-connect.png` (connect page before tone list loads)
  - `after-s330-patches.png` (patch list + detail pane)
  - `after-s330-tones.png` (tone list + detail pane with 5-tab shell)
  - `after-s330-play.png` (multi-part console)

**Fixture Definition** (`modules/roland-sxx0-editor/src/testing/visualFixtures.ts:4-28`):
- Pages: connect, play, patches, tones
- Ready selectors: `h2:has-text("Connect to S-330")`, etc.
- Mock MIDI enabled via `buildVisualRoute()` helper

**Verification Steps (per developer):**
1. Make UI code changes (TonesPage detail pane layout, footer styling, etc.)
2. Run `pnpm visual:capture` (generates test-results/visual/current/*.png)
3. Inspect current screenshots visually (verify expected styling changes)
4. Run `pnpm visual:compare` (hash comparison → pass/fail)
5. If pass: commit code
6. If fail: diff baselines (visual review) → if intentional: `pnpm visual:baseline:update` → commit updated PNGs + code

---

## 5. UI Surface Structure for Sane Iteration

### Component Organization

**Directory Layout** (S-330/S-550 unified editor):
```
modules/roland-sxx0-editor/
├── src/
│   ├── pages/              # List-detail editor pages
│   │   ├── TonesPage.tsx   # Tone editor (list + detail + live-footer)
│   │   ├── PatchesPage.tsx # Patch editor
│   │   ├── PlayPage.tsx    # Multi-part console
│   │   ├── LibraryPage.tsx # Library browser
│   │   └── HomePage.tsx    # Landing page
│   ├── components/
│   │   ├── tones/          # Tone-specific components
│   │   │   ├── ToneList.tsx
│   │   │   └── ToneEditor.tsx
│   │   ├── patches/        # Patch-specific components
│   │   ├── library/        # Library tree + dialogs
│   │   ├── common/         # Shared UI primitives
│   │   │   └── PageTitleRow.tsx
│   │   └── front-panel/    # Virtual front-panel controls
│   ├── pages/
│   │   └── Test<Feature>Page.tsx  # Test harness pages
│   ├── test-helpers/
│   │   └── <thing>-factory.ts     # Fixture factories
│   ├── context/
│   │   └── DeviceConfigContext.tsx # Device config DI
│   ├── stores/
│   │   ├── midiStore.ts
│   │   ├── editorStore.ts
│   │   └── deviceDataStore.ts
│   └── styles/
│       └── *.css            # Scoped page styles + shared
├── visual/
│   └── capture.playwright.ts # Screenshot capture spec
├── test/
│   ├── ui/
│   │   ├── <feature>.spec.ts # Playwright specs
│   │   └── capabilities/     # Capability test specs
│   └── wiring/               # Wiring (unit-ish) tests
├── artifacts/visual/
│   └── baseline/             # Canonical screenshots
├── test-results/visual/
│   └── current/              # Ephemeral current screenshots
└── package.json             # Scripts: visual:capture, visual:compare, etc.
```

### How a "Surface" is Defined

**A surface = page + list-detail split + optional tabbed detail pane + optional footer**

**Example: TonesPage** (TonesPage.tsx, lines 41-100):
1. **Page component:** `export function TonesPage() { … }`
2. **Page shell:** Fixed-viewport flex column (outer `<main class="ac-page ac-page-shell--fixed-viewport">`)
3. **List column:** `<ToneList />` rendering `ac-list` primitives
4. **Detail column:** `<ToneEditor />` with:
   - 5-tab radio shell (Wave / Pitch / Filter / Amp / LFO)
   - Parameter grid inside active tab
   - Live-edit footer (`.ac-detail-live` with pulsing LED)
5. **Layout CSS:** Page-scoped `.tones__app-shell` class defines `grid-template-columns: 22rem minmax(0, 1fr)` (list ratio: detail ratio)

### Mockup-to-Component Mapping

**v3 Mockup Sources** (cited throughout DESIGN-SYSTEM.md):
- `docs/1.0/001-IN-PROGRESS/s550-support/explorations/01-design-language.html` — atomic control primitives
- `docs/1.0/001-IN-PROGRESS/s550-support/explorations/04-tones.html` — tones page layout + envelope editor

**Mockup → Component Path:**

| Mockup artifact | Component file | When shipped |
|---|---|---|
| `.ac-field-label` CSS block (01-design-language.html:497-503) | `editor-core/src/design/control-primitives.css` + exported markup | Phase 9 Task 4.0 |
| `.ac-select` + chevron (01-design-language.html:505-549) | `editor-core/src/design/primitives.css` (enhanced select) | Phase 9 Task 4.0 |
| `.tones__param` 3-column grid (04-tones.html:1465-1547) | `modules/roland-sxx0-editor/src/styles/_shared.css` → `.ac-slider` component | Phase 9 Task 4.0 |
| `.tones__envelope` 8-segment VFD (04-tones.html:1576-1783) | `editor-core/src/components/AcEnvelope.tsx` + `envelope-primitives.css` | Phase 9 Task 4.0 |
| `.tones__param--bipolar` fill from center (04-tones.html:1508-1517) | `AcRangeBar bipolar variant` | Phase 9 Task 4.0 |

**Update Flow:**
1. Designer creates HTML mockup with CSS inline or in `<style>`
2. Controller extracts CSS into shared primitive file (e.g., `control-primitives.css`)
3. React component wraps the CSS (e.g., `<AcSlider label={...} bar={...} />`)
4. Page component consumes via import: `<AcSlider ... />`

### Design Lab / Mockup Preview Surface

**None — mockups live as static HTML in `explorations/` directories, not as a running design-system site or Storybook.**

Alternative approach:
- Test harness pages in `/test/` routes (e.g., `/akai/s3000xl/editor/test/keygroups`) serve as "live mockup" surfaces
- Developer can iterate in-browser via Vite HMR without touching the real data flow
- Fixtures pin data; edits are immediately visible

---

## 6. The Sane UX/UI Update Loop

### Repeatable Workflow (Start to Finish)

#### Phase 1: Scope & Mock

1. **Research existing patterns** (15 min)
   - Read `DESIGN-SYSTEM.md` to understand settled decisions
   - Read `DESIGN-DECISIONS-PROTOCOL.md` to see what was explored + rejected

2. **Create/update design mockup** (1-4 hours depending on scope)
   - Static HTML file in `docs/<version>/<status>/<feature>/explorations/`
   - CSS inline or in `<style>` block
   - Cite the v3 mockup templates (01-design-language.html, 04-tones.html)

3. **File ACCEPTED or REJECTED archive entry** (if globally impactful)
   - Create `docs/<version>/<status>/<feature>/explorations/{ACCEPTED,REJECTED}/<YYYY-MM-DD>-<slug>/brief.md`
   - Include frontmatter + one-paragraph proposal + 1-3 paragraph rationale
   - Point `visual:` field to mockup.html or relative path

#### Phase 2: Component & Test Harness

4. **Extract CSS into shared primitive** (if applicable) (30 min - 2 hours)
   - Move CSS from mockup's `<style>` into `editor-core/src/design/{control,layout,list,envelope,feedback}-primitives.css`
   - Create React component wrapper if complex (e.g., `<AcSlider>`, `<AcCheckbox>`)
   - Export from `editor-core` package

5. **Create test harness page** (1-2 hours)
   - File: `src/pages/Test<Feature>Page.tsx`
   - Factory file: `src/test-helpers/<thing>-factory.ts` with `make<Thing>(overrides?)`
   - Register route in `App.tsx` under `/<editor>/test/` prefix
   - Wire interactions via `useState`/`useCallback`

6. **Take screenshots** (10 min)
   - Start dev server: `pnpm dev`
   - Screenshot test harness: `playwright screenshot --ignore-https-errors https://localhost:3300/<path> /tmp/name.png`
   - Verify visual correctness in `/tmp/`

#### Phase 3: Playwright Spec Suite

7. **Write test spec for every manual screenshot** (2-4 hours)
   - File: `test/ui/<feature>.spec.ts`
   - Config: `playwright.test-harness.config.ts`
   - Spec: goto → waitForSelector → click/drag → assert state change
   - Run: `make test-ui-<editor>`
   - All specs must PASS before code review

#### Phase 4: Implementation

8. **Implement on real page**
   - Update page component (e.g., TonesPage.tsx) to use new primitives
   - Update page-scoped CSS (e.g., tones.css) for layout
   - Reuse existing component hierarchy; don't reinvent

9. **Update DESIGN-SYSTEM.md** (if global impact) (1 hour)
   - Same commit as implementation
   - Document new token, primitive, layout pattern, or retired pattern
   - Cross-reference the ACCEPTED archive entry

#### Phase 5: Visual Regression Verification

10. **Capture current screenshots** (5 min)
    ```bash
    pnpm visual:capture  # generates test-results/visual/current/*.png
    ```

11. **Inspect visually** (10-15 min)
    - Open each PNG in `/tmp/` or image viewer
    - Confirm layout, typography, spacing match mockup
    - If not: iterate code (go to step 8)

12. **Run comparison** (1 min)
    ```bash
    pnpm visual:compare  # SHA256 hash check: pass or fail
    ```

13. **If FAIL (hash mismatch):** Visual diff step
    - Baselines + currents already on disk
    - Side-by-side comparison reveals pixel-level differences
    - If intentional: proceed to step 14
    - If unintended: revert to step 8

14. **Update baselines** (1 min)
    ```bash
    pnpm visual:baseline:update  # cp test-results/visual/current/* → artifacts/visual/baseline/*
    ```

#### Phase 6: Code Review & Commit

15. **Commit (together)**
    - Code changes (TonesPage.tsx, tones.css, new components, test specs, DESIGN-SYSTEM.md update)
    - Updated baseline PNG files (from artifacts/visual/baseline/)
    - Commit message cites design decision + test count + visual changes

---

## 7. Adoptability Analysis for Hono + Server-Rendered HTML Studio

### What Transfers (Directly Usable)

1. **Visual-Regression Tooling** — 100% transferable
   - `scripts/visual-compare.mjs` and `scripts/visual-update-baseline.mjs` are framework-agnostic (pure file I/O + SHA256)
   - Playwright works identically with server-rendered HTML + inline client TS as with React SPAs
   - Baseline layout (artifacts/visual/baseline/ + test-results/visual/current/) unchanged
   - Adoption: Copy both .mjs scripts to deskwork; adapt npm scripts in package.json

2. **Design Governance Model** — 100% transferable
   - DESIGN-SYSTEM.md + DESIGN-DECISIONS-PROTOCOL.md are framework-agnostic
   - Decision archive structure (explorations/{ACCEPTED,REJECTED}/<YYYY-MM-DD>-<slug>/brief.md) applies to any project
   - Typed capability contracts (ErrorReporter, RefreshNotifier, ProgressReporter) generalize to any UI layer
   - Adoption: Clone both docs into deskwork/docs/; adapt studio-specific examples

3. **Atomic CSS Primitives** — Mostly transferable (adapt for HTML)
   - `.ac-field-label`, `.ac-select`, `.ac-checkbox`, `.ac-slider`, `.ac-number-input`, `.ac-range-bar` are vanilla HTML + CSS
   - No React-specific APIs (props, JSX) — all classes apply directly to `<label>`, `<select>`, `<input>`, etc.
   - Envelope visualization (`.ac-envelope`) does use SVG; interactive drag is a small client TS module
   - Design tokens (--ac-color-*, --ac-space-*, --ac-font-*, --ac-tracking-*, --ac-text-*) are pure CSS custom properties
   - Adoption: Copy CSS files from `editor-core/src/design/` into deskwork/styles/; remove React component wrappers; use classes on raw HTML

4. **Page Shell & Layout Primitives** — Mostly transferable
   - `.ac-page-shell`, `.ac-page-shell--fixed-viewport`, `.ac-list`, `.ac-list-scroll`, `.ac-page-title-row` are vanilla CSS
   - Fixed-viewport grid pattern (flex column with internal scrolls) adapts 1:1 to server-rendered HTML
   - Sticky headers, scrollbar styling, layout containment work identically
   - Adoption: Copy `layout-primitives.css` + `list-primitives.css` into deskwork/styles/

5. **Test Harness Pattern** — Partially transferable
   - Factory concept (make<Thing>(overrides?) returning realistic data) applies to any stack
   - Isolated component testing without hardware remains valid
   - Playwright screenshot capture works identically
   - **Adaptation needed:** Replace React `<Test<Feature>Page>` with server-rendered template + embedded client TS
   - Adoption: Use same Playwright CLI; refactor test fixtures from TS factories → YAML/JSON data files served by Hono route handlers

### What Needs Adaptation (Framework-Specific Removals)

1. **React Component Wrappers** — Remove entirely
   - Discard: `<AcSlider>`, `<AcCheckbox>`, `<AcEnvelope>`, etc.
   - Keep: CSS classes + vanilla HTML equivalents
   - Deskwork uses server-rendered templates (Hono) + small client TS modules, not React components
   - Migration: For each React component, document the HTML structure + CSS classes it produces, then hand-write the HTML template

2. **TypeScript Capability Interfaces** — Adapt to server-side equivalents
   - audiocontrol uses `ErrorReporter`, `RefreshNotifier`, `ProgressReporter` as typed capability contracts in React hooks
   - Deskwork's server-rendered approach: capability contracts live in shared TS types but are fulfilled by Hono middleware + client TS event listeners
   - Example: ErrorReporter contract becomes (a) a server endpoint responding with error JSON + (b) a client TS handler `onclick` calling that endpoint + updating the DOM
   - Adoption: Port interface definitions; reimplement in Hono route handlers + vanilla DOM manipulation

3. **Shared Store State (Zustand)** — Replace with server session + client TS state
   - audiocontrol uses `deviceDataStore`, `editorStore` (Zustand stores) for cross-page state caching
   - Deskwork: store state in Hono session cookies (server-side) or client TS module variables (client-side), not a centralized React store
   - Adoption: Identify what state must persist across page navigation; store as session data or JSON in localStorage; fetch on page load

4. **Client Event Handlers** — Rewrite from React to vanilla TS/DOM
   - audiocontrol uses `onClick`, `onChange`, `useCallback` to wire interactions
   - Deskwork: inline `onclick`, `addEventListener`, vanilla event listeners
   - Adoption: For each React handler, translate to `element.addEventListener('click', (e) => { ... })`

5. **Test Harness Rendering** — Refactor from React Router to Hono routes
   - audiocontrol: test harness pages are React components registered in React Router
   - deskwork: test harness pages are Hono GET routes returning HTML + client TS
   - Adoption: Create `/test/<feature>` Hono route that serves template with hardcoded fixture data

### Cost Estimate (Hono/Server-Rendered HTML Studio)

| Component | Effort | Notes |
|---|---|---|
| **Visual-regression tooling** | 30 min | Copy .mjs scripts; update npm scripts |
| **Design governance docs** | 1 hour | Adapt examples to studio context |
| **CSS primitives** | 4-8 hours | Extract from audiocontrol/src/design/*.css; vendor into deskwork/styles/ |
| **Design tokens** | 2 hours | Port --ac-* variables into deskwork token file |
| **Page shell layout** | 2-4 hours | Implement `.ac-page-shell`, `.ac-list`, sticky headers in server templates |
| **Atomic controls** | 8-12 hours | For each primitive, write vanilla HTML template + vanillaJS event handlers |
| **Test harness pattern** | 4-6 hours | Create Hono routes + YAML fixtures; adapt Playwright tests |
| **Total** | ~25-35 hours | Most work is removing React layer, not reimplementing UI logic |

### What's NOT Adoptable (React-Only)

- `<AcSlider>` JSX component (but `.ac-slider` CSS + vanilla HTML is adoptable)
- React Context (DeviceConfigContext) — use Hono DI + template context instead
- Zustand stores — use server session + client TS modules instead
- React Router — already using Hono routing
- React Testing Library — already using Playwright for visual regression

---

## Summary: Exported Discipline for Deskwork Studio

**Minimal viable adoption (≤35 lines of integration guidance):**

1. **Copy visual-regression scripts** — `scripts/{visual-compare,visual-update-baseline}.mjs` to deskwork root
2. **Run on CI/pre-commit** — invoke `pnpm visual:capture && pnpm visual:compare` before every UI PR
3. **Store baselines in git** — `artifacts/visual/baseline/*.png` versioned alongside code
4. **Update baselines after intentional UI changes** — `pnpm visual:baseline:update` when mockup is finalized

5. **Adopt design governance** — maintain `DESIGN-SYSTEM.md` + `DESIGN-DECISIONS-PROTOCOL.md` at deskwork root
   - Read before every UI design work
   - File ACCEPTED/REJECTED archive entries for global-impact decisions
   - Update DESIGN-SYSTEM.md in same commit as implementation

6. **Port CSS primitives** — Extract `editor-core/src/design/{tokens,layout,list,control,feedback,envelope}-primitives.css` into `deskwork/styles/`
   - Remove React component wrappers (keep CSS classes + vanilla HTML examples)
   - Adapt `:root` selector for deskwork's color palette (or preserve Roland blue if cross-product alignment wanted)

7. **Implement test harness pattern** — Create Hono `/test/<surface>` routes with hardcoded fixture data
   - Use existing Playwright visual:capture machinery
   - Write test specs in `test/ui/<feature>.spec.ts`
   - Test harness decouples UI iteration from device/data concerns

**Result:** Deskwork studio gains audiocontrol's sane UX/UI update discipline — deterministic screenshot baselines, design decision records, shared vocabulary, and tight test-first loop — without adopting React or major architectural changes.

