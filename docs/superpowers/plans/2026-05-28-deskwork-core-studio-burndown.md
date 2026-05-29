# Deskwork Core + Studio Burndown — Phase 38 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Burn down the open-issue backlog for the two largest lanes — `@deskwork/core`/`@deskwork/cli` and `@deskwork/studio` — per the 2026-05-29 hygiene burndown sheets, starting with the approve/publish verb-model unification (#246) and the studio Publish affordance it unblocks (#230).

**Architecture:** The burndown sheets (`docs/1.0/burndown/deskwork-core.md`, `docs/1.0/burndown/deskwork-studio.md`) ARE the canonical task source — categorized by effort with per-issue action/size/deps. This plan details the first ready sub-phase (38a, the verb model) to full TDD granularity; sub-phases 38b–38h are enumerated from the burndown and expanded to bite-sized steps just-in-time as `/dwi` reaches each, because several depend on findings from earlier fixes (e.g. #234 depends on #232's chosen approach) and the design-driven items need `/frontend-design` first.

**Tech Stack:** TypeScript (strict), Vitest, Hono (studio server), esbuild (studio client), tsx runner. `@/` import pattern. Files < 500 lines.

---

## Operating rules for every sub-phase

- **TDD always** — failing test first, watch it fail, minimal code, watch it pass, commit. (Per `/dwi` Step 4.)
- **One issue per commit** where practical; commit message names the issue and what was verified (per `ui-verification.md` commit discipline).
- **Closure stays the operator's call** — fixes land as "fix-landed," issues are NOT closed until verified in a formally-installed release (per `agent-discipline.md`).
- **Gated items are NOT turnkey.** Operator-triage issues need a decision before code; design-driven issues need a `/frontend-design` pass first. The plan marks each; `/dwi` pauses at gates.
- **UI changes** follow `ui-verification.md` (dual-viewport before/after measurement) and `affordance-placement.md`.

---

## Sub-phase 38·0 — Blast-radius review against `feature/graphical-entries` (#301) [GATING]

**Runs before any other sub-phase.** graphical-entries (#301) is in flight and generalizes the pipeline into per-lane templates, rebuilds the dashboard ("Press Bay" swimlanes), adds a graphical review surface + extended annotation schema, and reworks the scrapbook. Its blast radius covers the stage model #246/38a touches and much of the studio lane.

- [ ] Read `feature/graphical-entries`: `docs/1.0/001-IN-PROGRESS/graphical-entries/{prd.md,workplan.md,scope-manifest.yaml}`.
- [ ] Classify every core+studio burndown issue HIGH/MEDIUM/LOW overlap (initial assessment in the PRD's Coordination subsection). Validate against the live branch state — implementation may have moved past the PRD.
- [ ] Mark HIGH/MEDIUM issues **Blocked** via `gh issue edit <n> --add-label blocked` (create the label if absent) + a comment referencing #301 and the specific superseding surface.
- [ ] Record the confirmed LOW-overlap unblocked work set; it is the starting point for 38b/38c/38d.
- [ ] **Reclassify 38a:** gated on #301 coordination. The `SUCCESSOR`/`nextStage` change is the same surface graphical-entries replaces with per-lane templates — coordinate before implementing (do not blindly ship the hardcoded-map edit if #301 is about to delete that map).

**Result:** the unblocked work set + a Blocked-issue list. Only then proceed; start with 38b/38c/38d (LOW overlap), defer 38a until the #246-vs-#301 coordination is resolved.

## Sub-phase 38a — Verb-model unification (#246 + #230) — GATED on 38·0 / #301 coordination

> **Gate:** Do not start until 38·0 confirms #246's `SUCCESSOR`/`nextStage` edit won't be superseded by graphical-entries' pipeline-template generalization. If #301 is replacing the hardcoded stage map imminently, coordinate the verb-model change into that work instead of editing the soon-to-be-deleted map.


Make `approve` universal: it handles `Final → Published` with the same uniform mechanics as every other stage transition (snapshot + comment-archive), plus the Published-specific concerns (`datePublished`, artifact check). `publishEntry` keeps its Final-only guards + error messages but delegates the mutation to `approveEntryStage`. The studio's Final-stage affordance gains a stage-aware Publish control.

**Operator decisions already made:** approve becomes universal (option a); Final→Published applies uniform mechanics (snapshot + archive).

### File structure (38a)

- `packages/core/src/schema/entry.ts` — flip `Final`'s successor from `null` to `'Published'`.
- `packages/core/src/entry/approve.ts` — handle the `→ Published` transition: optional `date`/`requireArtifact` opts; set `datePublished`; run artifact check; extend `ApproveResult`.
- `packages/core/src/entry/publish.ts` — keep guards/messages; delegate mutation to `approveEntryStage`.
- `packages/core/test/schema/entry.test.ts` — update `nextStage('Final')` assertions.
- `packages/core/test/entry/approve.test.ts` — replace the "refuses from Final" test with universal-behavior tests.
- `packages/core/test/entry/publish.test.ts` — stays green (guards/messages unchanged).
- `packages/studio/src/lib/stage-affordances.ts` — Final stage surfaces a `publish` control.
- `packages/studio/src/pages/entry-review/decision-strip.ts` — render the Publish button (clipboard-copies `/deskwork:publish <slug>`).
- `packages/studio/test/...` — decision-strip / stage-affordance regression.
- `DESKWORK-STATE-MACHINE.md`, `plugins/deskwork/skills/approve/SKILL.md`, `plugins/deskwork/skills/publish/SKILL.md` — canonical contract docs.

### Task 1 — `nextStage('Final')` returns `'Published'`

**Files:**
- Modify: `packages/core/src/schema/entry.ts:16-25`
- Test: `packages/core/test/schema/entry.test.ts:27-39`

- [ ] **Step 1: Update the failing test first.** In `entry.test.ts`, move `Final` out of the "no forward successor" assertion and into the linear-successor test:

```typescript
  it('nextStage returns the linear successor', () => {
    expect(nextStage('Ideas')).toBe('Planned');
    expect(nextStage('Planned')).toBe('Outlining');
    expect(nextStage('Outlining')).toBe('Drafting');
    expect(nextStage('Drafting')).toBe('Final');
    expect(nextStage('Final')).toBe('Published');   // approve is universal (#246)
  });

  it('nextStage returns null for stages without a forward successor', () => {
    expect(nextStage('Published')).toBe(null);
    expect(nextStage('Blocked')).toBe(null);
    expect(nextStage('Cancelled')).toBe(null);
  });
```

- [ ] **Step 2: Run, verify it fails.** `npm --workspace @deskwork/core test -- entry.test` → FAIL: `nextStage('Final')` expected `'Published'`, got `null`.

- [ ] **Step 3: Minimal impl.** In `entry.ts` `SUCCESSOR`:

```typescript
  Drafting: 'Final',
  Final: 'Published',   // #246 — approve is universal; publish delegates here
  Published: null,
```

- [ ] **Step 4: Run, verify it passes.** Same command → PASS.

- [ ] **Step 5: Commit.** `feat(core): nextStage(Final) → Published — approve becomes universal (#246)`

### Task 2 — `approveEntryStage` handles `Final → Published`

**Files:**
- Modify: `packages/core/src/entry/approve.ts`
- Test: `packages/core/test/entry/approve.test.ts`

- [ ] **Step 1: Write failing tests.** Replace the existing `'refuses to approve from Final'` test (approve.test.ts:89-92) with:

```typescript
  it('graduates Final → Published, stamps datePublished', async () => {
    await setupEntry({ currentStage: 'Final' });
    const result = await approveEntryStage(projectRoot, { uuid, requireArtifact: false });
    expect(result.toStage).toBe('Published');
    expect(result.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.currentStage).toBe('Published');
    expect(sidecar.datePublished).toBe(result.datePublished);
  });

  it('honors date on the Published transition', async () => {
    await setupEntry({ currentStage: 'Final' });
    const result = await approveEntryStage(projectRoot, { uuid, date: '2025-12-31', requireArtifact: false });
    expect(result.datePublished).toBe('2025-12-31T00:00:00.000Z');
  });

  it('refuses Final → Published when the artifact is missing (requireArtifact default true)', async () => {
    await setupEntry({ currentStage: 'Final', artifactPath: 'docs/missing/index.md' });
    await expect(approveEntryStage(projectRoot, { uuid })).rejects.toThrow(/artifact missing/i);
    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.currentStage).toBe('Final'); // no mutation on failure
  });

  it('snapshots index.md → scrapbook/final.md on Final → Published (uniform mechanics)', async () => {
    await setupEntry({ currentStage: 'Final', slug: 'pub-doc', artifactPath: 'docs/pub-doc/index.md' });
    await mkdir(join(projectRoot, 'docs', 'pub-doc'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'pub-doc', 'index.md'), '# final body\n');
    const result = await approveEntryStage(projectRoot, { uuid });
    expect(result.snapshotted).toBe(true);
    const snap = await readFile(join(projectRoot, 'docs', 'pub-doc', 'scrapbook', 'final.md'), 'utf8');
    expect(snap).toContain('final body');
  });

  it('archives active comments on Final → Published (uniform mechanics)', async () => {
    await setupEntry({ currentStage: 'Final', slug: 'pub-arch', artifactPath: 'docs/pub-arch/index.md' });
    await mkdir(join(projectRoot, 'docs', 'pub-arch'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'pub-arch', 'index.md'), '# body\n');
    const comment: DraftAnnotation = mintEntryAnnotation({
      type: 'comment', workflowId: uuid, version: 1, range: { start: 0, end: 4 }, text: 'c',
    });
    await addEntryAnnotation(projectRoot, uuid, comment);
    const result = await approveEntryStage(projectRoot, { uuid });
    expect(result.archivedComments).toBe(1);
  });
```

- [ ] **Step 2: Run, verify it fails.** `npm --workspace @deskwork/core test -- approve.test` → FAIL (approve currently throws on Final; `ApproveResult` has no `datePublished`).

- [ ] **Step 3: Minimal impl.** In `approve.ts`:
  - Extend `ApproveOptions`: add `readonly date?: string;` and `readonly requireArtifact?: boolean;` (documented as Published-transition-only).
  - Extend `ApproveResult`: add `readonly datePublished?: string;` and `readonly artifactPath?: string;`.
  - Remove the `from === 'Final'` throw (lines 61-63). Keep the `Published` terminal + `Blocked`/`Cancelled` guards.
  - After computing `to = nextStage(from)`, when `to === 'Published'` run the artifact check (lifted from `publish.ts:66-76`) BEFORE the snapshot, so a missing artifact fails fast with no side effects.
  - Compute `datePublished` when `to === 'Published'` (`opts.date ?? at.slice(0,10)` → ISO midnight) and set it on the `updated` sidecar.
  - Snapshot + comment-archive run unchanged for all transitions (uniform mechanics).
  - Return `datePublished`/`artifactPath` in the result when `to === 'Published'`.

```typescript
  // after `to` is resolved and before snapshot:
  let artifactAbs: string | undefined;
  let datePublishedIso: string | undefined;
  if (to === 'Published') {
    const requireArtifact = opts.requireArtifact ?? true;
    if (requireArtifact && sidecar.artifactPath !== undefined) {
      artifactAbs = join(projectRoot, sidecar.artifactPath);
      if (!existsSync(artifactAbs)) {
        throw new Error(
          `Cannot publish: artifact missing at ${sidecar.artifactPath}. ` +
            `Write the file before publishing.`,
        );
      }
    }
    const datePublished = opts.date ?? at.slice(0, 10);
    datePublishedIso = `${datePublished}T00:00:00.000Z`;
  }
```

  (Add `import { existsSync } from 'node:fs';` and `import { join } from 'node:path';` to approve.ts. `at` must be computed before this block.) Thread `datePublished: datePublishedIso` into the `updated` sidecar object when defined.

- [ ] **Step 4: Run, verify it passes.** `npm --workspace @deskwork/core test -- approve.test` → PASS. Also run the full core suite: `npm --workspace @deskwork/core test` → all green.

- [ ] **Step 5: Commit.** `feat(core): approveEntryStage handles Final → Published with uniform mechanics (#246)`

### Task 3 — `publishEntry` delegates to `approveEntryStage`

**Files:**
- Modify: `packages/core/src/entry/publish.ts`
- Test: `packages/core/test/entry/publish.test.ts` (must stay green — no edits)

- [ ] **Step 1: Confirm the existing publish tests are the contract.** `publish.test.ts` asserts: Final→Published sets currentStage+datePublished; `--date` honored; refuses non-Final with `/cannot publish from stage/i`; refuses Published with `/already Published/i`; refuses Blocked/Cancelled with `/induct/i`; artifact-missing throws; artifact-present passes; stage-transition event; calendar regen. These stay.

- [ ] **Step 2: Run them against the current impl to confirm green baseline.** `npm --workspace @deskwork/core test -- publish.test` → PASS (pre-refactor).

- [ ] **Step 3: Refactor publish.ts to delegate.** Keep the three guards (they produce the publish-specific messages the tests assert), then delegate:

```typescript
export async function publishEntry(
  projectRoot: string,
  opts: PublishOptions,
): Promise<PublishResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const from = sidecar.currentStage;
  if (from === 'Published') {
    throw new Error('Cannot publish: entry is already Published.');
  }
  if (from === 'Blocked' || from === 'Cancelled') {
    throw new Error(
      `Cannot publish: entry is ${from}; induct it back into the pipeline first.`,
    );
  }
  if (from !== 'Final') {
    throw new Error(
      `Cannot publish from stage ${from}. Approve through to Final first ` +
        `(Final is the only valid pre-Published state).`,
    );
  }
  const result = await approveEntryStage(projectRoot, {
    uuid: opts.uuid,
    ...(opts.date !== undefined ? { date: opts.date } : {}),
    ...(opts.requireArtifact !== undefined ? { requireArtifact: opts.requireArtifact } : {}),
  });
  return {
    entryId: result.entryId,
    fromStage: 'Final',
    toStage: 'Published',
    datePublished: result.datePublished as string,
    ...(result.artifactPath !== undefined ? { artifactPath: result.artifactPath } : {}),
  };
}
```

  Delete the now-unused snapshot-free body (the manual sidecar write, journal append, calendar regen now live in `approveEntryStage`). Remove now-unused imports (`writeSidecar`, `appendJournalEvent`, `regenerateCalendar`, `Entry`) if no longer referenced; keep `existsSync`/`join` only if still used (they are not after delegation — remove them).

- [ ] **Step 4: Run, verify green.** `npm --workspace @deskwork/core test -- publish.test` → PASS (all existing assertions). Full core suite → green.

- [ ] **Step 5: Commit.** `refactor(core): publishEntry delegates to approveEntryStage; publish stays the named release verb (#246)`

### Task 4 — Canonical contract docs

**Files:**
- Modify: `DESKWORK-STATE-MACHINE.md` (Commandment II area + the `Final: null // publish, not approve` mental model)
- Modify: `plugins/deskwork/skills/approve/SKILL.md` (stage map: Final → Published is now an approve transition)
- Modify: `plugins/deskwork/skills/publish/SKILL.md` (publish is the named release verb; mechanically delegates to approve)

- [ ] **Step 1: Read each doc's current claims** about Final/Published and the approve-vs-publish split. (No test — docs.)
- [ ] **Step 2: Edit** so the canonical contract reads: approve is universal across all linear transitions including Final→Published; publish is the operator-facing release verb that delegates to approve while enforcing the artifact check + datePublished. Note the uniform-mechanics behavior (snapshot final.md + archive comments at publish).
- [ ] **Step 3: Commit.** `docs(state-machine): approve is universal; publish delegates (#246)`

### Task 5 — Studio Publish affordance (#230)

**Files:**
- Modify: `packages/studio/src/lib/stage-affordances.ts:40-43`
- Modify: `packages/studio/src/pages/entry-review/decision-strip.ts`
- Test: `packages/studio/test/<stage-affordances + decision-strip specs>`

- [ ] **Step 1: Failing test for the affordance set.** Add to the stage-affordances spec:

```typescript
  it('Final stage surfaces a publish control', () => {
    const entry = { ...baseEntry, currentStage: 'Final' as const };
    expect(getAffordances(entry).controls).toContain('publish');
  });
  it('pre-Final pipeline stages do NOT surface publish', () => {
    const entry = { ...baseEntry, currentStage: 'Drafting' as const };
    expect(getAffordances(entry).controls).not.toContain('publish');
  });
```

- [ ] **Step 2: Run, verify fail.** `npm --workspace @deskwork/studio test -- stage-affordances` → FAIL.

- [ ] **Step 3: Minimal impl.** In `getAffordances`, when `entry.currentStage === 'Final'`, append `'publish'` to the controls array:

```typescript
  const controls = ['save', 'iterate', 'approve', 'reject', 'historical-stage-dropdown'];
  if (entry.currentStage === 'Final') controls.push('publish');
  return { mutable: true, controls };
```

- [ ] **Step 4: Run, verify pass.** Same command → PASS.

- [ ] **Step 5: Decision-strip render — failing test.** Add a decision-strip spec asserting the Publish button renders at Final and its clipboard payload is `/deskwork:publish <slug>` (per THESIS Consequence 2 clipboard-copy pattern; mirror the existing approve button's copy mechanism in `decision-strip.ts`). Run → FAIL.

- [ ] **Step 6: Implement** the Publish button in `decision-strip.ts`, gated on the `publish` control, clipboard-copying `/deskwork:publish <slug>`. Mirror the existing approve-button markup + copy handler. Run → PASS.

- [ ] **Step 7: Live UI verification (ui-verification.md).** Boot the studio (no `--no-tailscale`), open the entry-review surface for a Final-stage entry at desktop (≥1280px) AND phone (≤390px). Confirm the Publish button renders, the clipboard payload is correct, and no layout regression vs a Drafting-stage entry. Record before/after per the protocol.

- [ ] **Step 8: Commit.** `feat(studio): stage-aware Publish button at Final (#230)`

### 38a wrap

- [ ] Run full workspace suite: `npm --workspaces test` → all green.
- [ ] Run `/dw-lifecycle:review` on the 38a diff; integrate or defer findings (each deferral → workplan task + GitHub issue).
- [ ] Post fix-landed comments on #246 and #230 (issues stay open pending release verification).

---

## Sub-phase 38b — Core quick fixes

Dep-free, ~1hr each. Source: `docs/1.0/burndown/deskwork-core.md` Quick fixes. Each = failing test → minimal impl → commit.

- [ ] #256 — CLI `--version`/`-v`/`version` subcommand (`@deskwork/cli`; read `package.json` version). ~10 LOC.
- [ ] #221 — ingest slug: `.` → `-` for path-derived slugs; keep strict rejection for explicit `--slug` (`core/src/ingest-derive.ts`). ~5 LOC + 3 cases.
- [ ] #232 — `regenerateCalendar` reads `config.calendarPath` instead of hardcoded `.deskwork/calendar.md`. ~10 LOC. **Decide the approach here; #234 (38c) follows it.**
- [ ] #198 — iterate `--dispositions` for longform/outline (already works for shortform); remove the `// Future:` TODO. ~20 LOC + 2 tests.

## Sub-phase 38c — Core doctor-rule family + ingest/approve mediums

Source: `deskwork-core.md` Medium. Several share a fix shape — group them.

- [ ] #219 + #300 + #65 — `missing-frontmatter-id` / `orphan-frontmatter-id` stage-exclusion gate (Ideas/Planned + non-blog kinds); #65 auto-resolution when exactly one candidate. Shared gate.
- [ ] #218 — implement the `legacy-calendar-to-sidecars` doctor rule MIGRATING.md claims ships. ~150 LOC + integration.
- [ ] #223 + #234 — align ingest-side and approve-side calendar regen on one `renderCalendar()` helper + the configured `calendarPath` (#234 depends on #232's approach from 38b).
- [ ] #267 — `deskwork pending-annotations <entry>` CLI enumerator. ~60 LOC.
- [ ] #226 — iterate `--auto-dispositions=<value>` (depends on #198's code path from 38b).
- [ ] #62 — ingest no-frontmatter defaults documented + `--require-frontmatter` flag.
- [ ] #64 — ingest title-derivation precedence (frontmatter > H1 > slug).
- [ ] #58 — `/deskwork:add` redirects to ingest when file exists.
- [ ] #59 — `deskwork remove <entry>` (refuses on entries with history).
- [ ] #215 — approve journal/sidecar drift audit (verify whether 38a's rework already closes it; may be subsumed).

## Sub-phase 38d — Studio quick fixes

Source: `deskwork-studio.md` Quick fixes. Dep-free, ~1hr each.

- [ ] #68 — dashboard polls `/api/dev/editorial-studio/state-signature` (404): add the route OR remove the poll; deliver the documented auto-refresh contract.
- [ ] #98 — dashboard scaffold button 404s on `/api/dev/editorial-calendar/draft`: add route OR remove button (check skill prose first).
- [ ] #71 — content tree fabricates `/blog/<slug>` URL for host-less collections: gate `publicUrlHint` on `collection.host !== undefined`. **Foundational "collections not websites" fix.** ~5 LOC.
- [ ] #233 — rename `/deskwork:doctor` (collides with CC built-in `/doctor`) → `/deskwork:check` or `/deskwork:doctor-calendar`.
- [ ] #229 — drop chrome divider when followed by a sibling `<hr>`. ~10 LOC CSS.
- [ ] #177 — align index vs dashboard width on `--er-container-wide`. ~5 LOC CSS.

## Sub-phase 38e — Studio medium

Source: `deskwork-studio.md` Medium. Single-PR each; surface design choices in advance. (#230 already shipped in 38a.)

- [ ] #103 (content-detail "no frontmatter/body" false report), #193 (induct-to picker on Final + pipeline stages), #231 (runtime-cache key includes studio version), #272 (cache freshness walks import graph), #216 (stale-process 404 breadcrumb), #114 (jargon hover glossary), #191 (scrapbook mutations route through `scrapbookDirForEntry`), #202 (`scrapbook-mutations.ts` 620→<500 LOC split — refactor, behavior-neutral; clone-gate sensitive), #186 (multi-item add), #204 (marginalia category-edit client UI), #262 (About modal), #263 (shortform-row ⋮ popover), #299 (addressed-in diff affordance), #240 (phone horizontal-scroll — verify on WebKit via `scripts/probe-ios-overflow.mjs`), #245 (mobile scrapbook sheet inert handlers).

## Sub-phase 38f — Sprint / design-driven (GATED on `/frontend-design`)

Source: both sheets, Larger column. Each needs a `/frontend-design` pass + operator direction-pick BEFORE implementation (per `agent-discipline.md` "use /frontend-design for all design tasks").

- [ ] #154 (review surface design), #161 (scrapbook UI umbrella; #164 deferred-by-design), #179 (content-view layout outlier), #180 (compositor's-desk vs manual cohesion), #54 (agent-reply margin notes), #82 (editable voice catalog), #85 (version diff view), #87 (skinnable studio), #73 (verify TOC drawer already covers it), #170/#171 (Phase 34 umbrella — margin-note authoring + version strip verification; gated on #173/#174), #84 (iterate Step 2 documented agent path; couples to #267), #217 (auto-open studio URL), #57 (SEO keywords for internal docs), #61 (calendar auto-advance — depends on #246, now decided), #60 + #72 (content-type / platform vocabulary — depend on #56 triage).

## Sub-phase 38g — Operator-triage gates (DECISION required before code)

These block downstream work and need an operator pick. Surface each; do NOT pre-decide. Source: `docs/1.0/burndown/operator-triage.md`.

- [ ] #246 — **DECIDED: make approve universal (option a).** Implemented in 38a.
- [ ] #266 — `DraftWorkflowState` uses retired `ReviewState` union: drift-fix vs intentional-separation.
- [ ] #56 — content collections vocabulary migration (`sites`→`collections`): full vs host-optional-only vs per-sub-phase. Blocks #60, #72.
- [ ] #222 — single-doc-evolves + scrapbook-snapshots architecture: confirm Option B+hybrid vs find-a-gap.
- [ ] #173 — entry-keyed reject semantics (studio): annotation vs auto-induct-to-Blocked vs remove.
- [ ] #174 — entry-keyed save semantics (studio): mint-revision-via-iterate vs direct-write vs remove.
- [ ] #164 — expanded-secret-card visual continuity (deferred-by-design): revive vs leave.

## Sub-phase 38h — Release + verification

- [ ] Run `/release` for the accumulated fixes (operator-gated 5-pause flow).
- [ ] Post-release: `/plugin marketplace update deskwork`, walk the touched surfaces against the installed artifact, then close fix-landed issues per the operator's call.

---

## Self-review notes

- **Spec coverage:** Every issue in `deskwork-core.md` and `deskwork-studio.md` (excluding the already-closed #142 and the audit-closed "informational" sets) maps to a sub-phase 38a–38h.
- **Gates are explicit:** operator-triage (38g) and design-driven (38f) items are flagged as non-turnkey; `/dwi` pauses there.
- **Just-in-time expansion:** 38b–38h list issues at burndown altitude; each task is expanded to full bite-sized TDD steps when `/dwi` reaches it, because downstream approaches depend on upstream decisions (#234←#232, #226←#198, #61←#246, #60/#72←#56) and design items depend on `/frontend-design` output.
