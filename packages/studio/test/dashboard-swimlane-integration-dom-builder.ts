/**
 * Multi-lane DOM synthesis helper for Phase 5 Task 5.6's jsdom client
 * integration test.
 *
 * Builds a structural mirror of the server's `/dev/editorial-studio`
 * output for the canonical "3 lanes × 2 entries" fixture from
 * `dashboard-swimlane-integration-fixture.ts`. Every attribute and
 * class the server emits is reproduced here so the client controllers
 * (`initSwimlane`, `initSwimlaneCollapse`, `initSwimlaneViewToggle`,
 * `initSwimlaneCompose`) bind and exercise as they would in
 * production.
 *
 * The split between this file and the test file keeps the test file
 * under the 500-line cap. The split between this file and the
 * server-side `*-fixture.ts` follows the env split: that file imports
 * `@deskwork/core` (node-side filesystem writes); this file is pure
 * DOM (jsdom).
 */

import {
  UUID_DEFAULT_DRAFTING,
  UUID_DEFAULT_FINAL,
  UUID_MOCKUPS_SKETCHED,
  UUID_MOCKUPS_APPROVED,
  UUID_QA_DRAFTED,
  UUID_QA_REVIEWED,
} from './dashboard-swimlane-integration-fixture';

/** Stable project key — controllers namespace localStorage by it. */
export const PROJECT_KEY = 'task-5-6-integration';

interface EntrySpec {
  readonly uuid: string;
  readonly slug: string;
  readonly stage: string;
  readonly title: string;
}

export interface LaneSpec {
  readonly id: string;
  readonly name: string;
  readonly templateId: 'editorial' | 'visual' | 'qa-plan';
  readonly firstStage: string;
  readonly linearStages: readonly string[];
  readonly lockedStages: readonly string[];
  readonly offPipelineStages: readonly string[];
  readonly entries: readonly EntrySpec[];
}

/** The canonical 3-lane spec — mirrors the on-disk fixture. */
export const LANES: readonly LaneSpec[] = [
  {
    id: 'default',
    name: 'Editorial',
    templateId: 'editorial',
    firstStage: 'Ideas',
    linearStages: ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'],
    lockedStages: ['Final'],
    offPipelineStages: ['Blocked', 'Cancelled'],
    entries: [
      { uuid: UUID_DEFAULT_DRAFTING, slug: 'default-1', stage: 'Drafting', title: 'Default Drafting' },
      { uuid: UUID_DEFAULT_FINAL, slug: 'default-2', stage: 'Final', title: 'Default Final' },
    ],
  },
  {
    id: 'mockups',
    name: 'Mockups',
    templateId: 'visual',
    firstStage: 'Sketched',
    linearStages: ['Sketched', 'Iterating', 'Approved', 'Shipped'],
    lockedStages: ['Approved'],
    offPipelineStages: ['Blocked', 'Cancelled', 'Archived'],
    entries: [
      { uuid: UUID_MOCKUPS_SKETCHED, slug: 'mockups-1', stage: 'Sketched', title: 'Mockups Sketched' },
      { uuid: UUID_MOCKUPS_APPROVED, slug: 'mockups-2', stage: 'Approved', title: 'Mockups Approved' },
    ],
  },
  {
    id: 'qa',
    name: 'QA',
    templateId: 'qa-plan',
    firstStage: 'Drafted',
    linearStages: ['Drafted', 'Reviewed', 'Tested', 'Approved'],
    lockedStages: ['Reviewed'],
    offPipelineStages: ['Blocked', 'Cancelled', 'Archived'],
    entries: [
      { uuid: UUID_QA_DRAFTED, slug: 'qa-1', stage: 'Drafted', title: 'QA Drafted' },
      { uuid: UUID_QA_REVIEWED, slug: 'qa-2', stage: 'Reviewed', title: 'QA Reviewed' },
    ],
  },
];

function buildSwimHead(lane: LaneSpec): HTMLElement {
  const head = document.createElement('div');
  head.classList.add('swim-head');
  const name = document.createElement('span');
  name.classList.add('name');
  name.textContent = lane.name;
  head.appendChild(name);

  const laneChev = document.createElement('button');
  laneChev.type = 'button';
  laneChev.classList.add('collapse-chev');
  laneChev.setAttribute('aria-expanded', 'true');
  laneChev.setAttribute('aria-label', `Collapse ${lane.name} lane`);
  laneChev.dataset.collapseTarget = 'lane';
  laneChev.dataset.laneId = lane.id;
  laneChev.dataset.laneName = lane.name;
  laneChev.textContent = '▾';
  head.appendChild(laneChev);

  const viewToggle = document.createElement('div');
  viewToggle.classList.add('view-toggle');
  viewToggle.setAttribute('role', 'radiogroup');
  viewToggle.setAttribute('aria-label', `View mode for ${lane.name}`);
  viewToggle.dataset.viewToggle = '';
  viewToggle.dataset.laneId = lane.id;
  for (const mode of ['kanban', 'list'] as const) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.classList.add('vt-cell', `vt-cell--${mode}`);
    if (mode === 'kanban') cell.classList.add('active');
    cell.setAttribute('role', 'radio');
    cell.setAttribute('aria-checked', mode === 'kanban' ? 'true' : 'false');
    cell.setAttribute('aria-disabled', 'false');
    cell.setAttribute(
      'aria-label',
      mode === 'kanban' ? 'Kanban view' : 'List view',
    );
    cell.dataset.viewMode = mode;
    cell.dataset.laneId = lane.id;
    viewToggle.appendChild(cell);
  }
  head.appendChild(viewToggle);

  const compose = document.createElement('button');
  compose.type = 'button';
  compose.classList.add('swim-compose');
  compose.setAttribute('aria-label', `Compose new entry in ${lane.name}`);
  compose.dataset.swimCompose = '';
  compose.dataset.laneId = lane.id;
  compose.dataset.firstStage = lane.firstStage;
  const composeIcon = document.createElement('span');
  composeIcon.classList.add('sc-icon');
  composeIcon.setAttribute('aria-hidden', 'true');
  composeIcon.textContent = '+';
  const composeLabel = document.createElement('span');
  composeLabel.classList.add('sc-label');
  composeLabel.textContent = 'new';
  compose.appendChild(composeIcon);
  compose.appendChild(composeLabel);
  head.appendChild(compose);
  return head;
}

function buildStageCol(lane: LaneSpec, stage: string): HTMLElement {
  const col = document.createElement('section');
  col.classList.add('stage-col');
  if (lane.lockedStages.includes(stage)) col.classList.add('locked');
  if (lane.offPipelineStages.includes(stage)) col.classList.add('off-pipeline');
  col.dataset.stageCol = stage;
  const stageHead = document.createElement('div');
  stageHead.classList.add('stage-head');
  const stageName = document.createElement('span');
  stageName.classList.add('stage-name');
  stageName.textContent = stage;
  stageHead.appendChild(stageName);
  const stageChev = document.createElement('button');
  stageChev.type = 'button';
  stageChev.classList.add('collapse-chev');
  stageChev.setAttribute('aria-expanded', 'true');
  stageChev.setAttribute('aria-label', `Collapse ${stage} stage`);
  stageChev.dataset.collapseTarget = 'stage';
  stageChev.dataset.laneId = lane.id;
  stageChev.dataset.stageName = stage;
  stageChev.textContent = '▾';
  stageHead.appendChild(stageChev);
  col.appendChild(stageHead);
  for (const entry of lane.entries) {
    if (entry.stage !== stage) continue;
    const row = document.createElement('div');
    row.classList.add('er-row-shell');
    row.dataset.uuid = entry.uuid;
    row.dataset.slug = entry.slug;
    row.dataset.stage = stage;
    row.textContent = entry.title;
    col.appendChild(row);
  }
  return col;
}

function buildLbGroup(lane: LaneSpec, stage: string): HTMLElement {
  const group = document.createElement('div');
  group.classList.add('lb-group');
  if (lane.lockedStages.includes(stage)) group.classList.add('locked');
  if (lane.offPipelineStages.includes(stage)) group.classList.add('off-pipeline');
  group.dataset.lbGroup = stage;
  for (const entry of lane.entries) {
    if (entry.stage !== stage) continue;
    const row = document.createElement('a');
    row.classList.add('lb-row');
    row.dataset.uuid = entry.uuid;
    row.dataset.slug = entry.slug;
    row.dataset.stage = stage;
    row.textContent = entry.title;
    group.appendChild(row);
  }
  return group;
}

/**
 * Build a single swim DOM tree for one lane (kanban body +
 * list-body sibling).
 */
function buildSwim(lane: LaneSpec): HTMLElement {
  const swim = document.createElement('article');
  swim.classList.add('swim', `swim--${lane.templateId}`, 'view-kanban');
  swim.dataset.laneId = lane.id;
  swim.appendChild(buildSwimHead(lane));

  const allStages = [...lane.linearStages, ...lane.offPipelineStages];
  const grid = document.createElement('div');
  grid.classList.add('stage-grid');
  for (const stage of allStages) {
    grid.appendChild(buildStageCol(lane, stage));
  }
  swim.appendChild(grid);

  const list = document.createElement('div');
  list.classList.add('list-body');
  list.dataset.listBody = '';
  for (const stage of allStages) {
    list.appendChild(buildLbGroup(lane, stage));
  }
  swim.appendChild(list);

  return swim;
}

function buildStub(lane: LaneSpec): HTMLElement {
  const stub = document.createElement('button');
  stub.type = 'button';
  stub.classList.add('swim-stub', 'is-focus-hidden');
  stub.dataset.swimStub = lane.id;
  const glyph = document.createElement('span');
  glyph.classList.add('ss-glyph');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = '§';
  stub.appendChild(glyph);
  return stub;
}

function buildFocusStrip(): HTMLElement {
  const strip = document.createElement('nav');
  strip.classList.add('focus-strip');
  for (const lane of LANES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.classList.add('focus-chip', 'active');
    chip.dataset.focusChip = lane.id;
    chip.setAttribute('aria-pressed', 'true');
    strip.appendChild(chip);
  }
  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.classList.add('focus-chip', 'active');
  allChip.dataset.focusChipAll = '';
  allChip.setAttribute('aria-pressed', 'true');
  strip.appendChild(allChip);
  return strip;
}

function buildLaneSheet(): HTMLElement {
  const container = document.createElement('div');
  container.classList.add('lane-sheet-container');
  container.id = 'lane-sheet';
  container.dataset.laneSheet = '';

  const backdrop = document.createElement('div');
  backdrop.classList.add('lane-sheet-backdrop');
  backdrop.dataset.laneSheetBackdrop = '';
  backdrop.setAttribute('aria-hidden', 'true');
  container.appendChild(backdrop);

  const rail = document.createElement('aside');
  rail.classList.add('lane-rail');
  for (const lane of LANES) {
    const row = document.createElement('div');
    row.classList.add('rail-lane', 'focused');
    row.setAttribute('draggable', 'true');
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.dataset.railLane = lane.id;
    row.dataset.laneVisible = 'true';
    row.setAttribute('aria-pressed', 'true');

    const drag = document.createElement('span');
    drag.classList.add('rail-drag');
    drag.setAttribute('aria-hidden', 'true');
    drag.textContent = '⋮⋮';
    row.appendChild(drag);

    const eye = document.createElement('button');
    eye.type = 'button';
    eye.classList.add('r-eye-btn');
    eye.dataset.railEye = lane.id;
    eye.setAttribute('aria-label', `Toggle visibility for ${lane.name} lane`);
    const visGlyph = document.createElement('span');
    visGlyph.classList.add('r-eye-visible');
    visGlyph.setAttribute('aria-hidden', 'true');
    visGlyph.textContent = '●';
    const hidGlyph = document.createElement('span');
    hidGlyph.classList.add('r-eye-hidden');
    hidGlyph.setAttribute('aria-hidden', 'true');
    hidGlyph.textContent = '○';
    eye.appendChild(visGlyph);
    eye.appendChild(hidGlyph);
    row.appendChild(eye);

    const name = document.createElement('span');
    name.classList.add('r-name');
    name.textContent = lane.name;
    row.appendChild(name);

    rail.appendChild(row);
  }
  container.appendChild(rail);
  return container;
}

function buildBayHeadTrigger(): HTMLElement {
  const head = document.createElement('header');
  head.classList.add('bay-head');
  const row1 = document.createElement('div');
  row1.classList.add('bh-row-1');
  const meta = document.createElement('span');
  meta.classList.add('bh-meta');
  meta.textContent = '3 of 3 lanes shown · 6 entries';
  row1.appendChild(meta);
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.classList.add('lane-sheet-trigger');
  trigger.dataset.laneSheetTrigger = '';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'lane-sheet');
  trigger.setAttribute('aria-label', 'Open lane visibility sheet');
  trigger.textContent = 'Lanes';
  row1.appendChild(trigger);
  head.appendChild(row1);
  return head;
}

/**
 * Build the full bay shell into `document.body`: bay-head + focus
 * strip + lane-sheet + every swim + every stub. Mirrors the server's
 * output shape so `mountAllControllers()` exercises a realistic tree.
 */
export function buildShell(): void {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = PROJECT_KEY;
  shell.appendChild(buildBayHeadTrigger());
  shell.appendChild(buildFocusStrip());
  shell.appendChild(buildLaneSheet());
  for (const lane of LANES) {
    shell.appendChild(buildSwim(lane));
    shell.appendChild(buildStub(lane));
  }
  document.body.appendChild(shell);
}
