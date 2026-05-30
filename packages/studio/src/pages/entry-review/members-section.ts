/**
 * Members section for the entry-keyed press-check surface (Phase 7
 * Tasks 7.3 + 7.4 — Direction B: Composed multi-lane default with
 * list toggle).
 *
 * Rendered AFTER the existing `er-draft-frame` body content when the
 * resolved entry is a group (i.e. has a `members` array). The section
 * has four mutually-exclusive shapes:
 *
 *   1. Populated group + composed mode (DEFAULT) — reuses the Phase 5
 *      swimlane chrome scoped to the group's member set. One `.swim`
 *      block per lane the members span; empty stages render with
 *      `is-empty` per the dashboard convention so the pipeline shape
 *      stays visible. Lanes that contain zero members of this group
 *      are NOT rendered (chrome doesn't pay for what doesn't apply).
 *   2. Populated group + list mode — flat list, one row per member
 *      sorted in `group.members[]` insertion order. Each row carries
 *      slug, title, lane tag, stage glyph + name, and a clipboard-copy
 *      link to the member's own review surface.
 *   3. Empty group (`members: []`) with no `artifactPath` — centered
 *      empty-state CTA per the accepted mockup. CTA clipboard-copies a
 *      `/deskwork:group add-member <group-slug> <member-slug>` template
 *      via the client controller.
 *   4. Empty group (`members: []`) WITH `artifactPath` — return '' (the
 *      existing artifactPath body renderer remains the fallback).
 *
 * Non-group entries (no `members` field) skip the section entirely.
 *
 * Per `.claude/rules/affordance-placement.md`: the composed↔list toggle
 * pill lives ON the section head (component-attached), mirroring the
 * editorial-review `.er-marginalia-tab` / `.er-outline-tab` precedent.
 * The client controller (`group-members-section.ts`) flips the toggle
 * state + persists the operator's choice to localStorage keyed on the
 * group's UUID.
 *
 * Per DESKWORK-STATE-MACHINE.md Commandment III: stage names are
 * surfaced via press-check glyphs (◇ § ⊹ ✎ ※ ✓ ⊘ ✗). No `reviewState`,
 * no review-state labels.
 *
 * Per the project's "no fallback" rule: missing-member sidecars are NOT
 * silently dropped — they surface as a "missing" row in list mode (and
 * the composed view simply skips them, since the row would have no lane
 * to bucket into). Doctor's `group-member-missing` rule (Task 7.5.2)
 * is the loud signal; this surface communicates the same signal
 * inline rather than crashing the render.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import { stageGlyph } from '../dashboard/swimlane-stage-glyph.ts';
import { isGroupEntry, isPopulatedGroupEntry } from '@deskwork/core/groups';
import type { Entry } from '@deskwork/core/schema/entry';
import { LANE_ID_REGEX, type StrictLaneConfig } from '@deskwork/core/lanes';
import type { StrictPipelineTemplate } from '@deskwork/core/pipelines';

export type MembersViewMode = 'composed' | 'list';

export interface RenderMembersSectionInput {
  /** The group entry (or non-group; in which case nothing renders). */
  readonly group: Entry;
  /** Resolved members in `group.members[]` order. May be empty. */
  readonly members: readonly Entry[];
  /** UUIDs from `group.members[]` that didn't resolve to a sidecar. */
  readonly missingMemberUuids: readonly string[];
  /**
   * Lane configs keyed by lane id; the section needs the lane's display
   * name + template binding to render the swim-head correctly.
   */
  readonly laneConfigsById: ReadonlyMap<string, StrictLaneConfig>;
  /**
   * Resolved pipeline templates keyed by template id (NOT lane id). The
   * section uses each lane's `pipelineTemplate` field to look up the
   * template once and walk its `linearStages` + `offPipelineStages`.
   */
  readonly templatesById: ReadonlyMap<string, StrictPipelineTemplate>;
  /** Initial view mode rendered server-side (client may flip post-load). */
  readonly initialViewMode: MembersViewMode;
}

interface LaneScopedBucket {
  readonly lane: StrictLaneConfig;
  readonly template: StrictPipelineTemplate;
  /** Stage → members-of-this-group-in-this-lane-at-this-stage. */
  readonly byStage: ReadonlyMap<string, readonly Entry[]>;
  readonly memberCount: number;
}

/**
 * Bucket members into lane → stage scoped to this group's member set.
 * Members with `entry.lane === undefined` are skipped (the dashboard
 * loudly warns on lane-less entries via `bucketIntoLanes`; here the
 * Members section is a downstream consumer and we don't repeat the
 * warning). Members referencing a lane id that isn't present in
 * `laneConfigsById` are skipped — same routing-failure mode the
 * dashboard's `unrouted` list captures.
 *
 * Lanes are emitted in the operator-configured lane order, which the
 * caller threads in via the iteration order of `laneConfigsById`.
 */
function bucketMembersByLane(
  members: readonly Entry[],
  laneConfigsById: ReadonlyMap<string, StrictLaneConfig>,
  templatesById: ReadonlyMap<string, StrictPipelineTemplate>,
): readonly LaneScopedBucket[] {
  const buckets = new Map<string, Map<string, Entry[]>>();
  for (const member of members) {
    if (member.lane === undefined) continue;
    if (!laneConfigsById.has(member.lane)) continue;
    let stageMap = buckets.get(member.lane);
    if (stageMap === undefined) {
      stageMap = new Map<string, Entry[]>();
      buckets.set(member.lane, stageMap);
    }
    let arr = stageMap.get(member.currentStage);
    if (arr === undefined) {
      arr = [];
      stageMap.set(member.currentStage, arr);
    }
    arr.push(member);
  }

  const out: LaneScopedBucket[] = [];
  for (const [laneId, lane] of laneConfigsById) {
    const stageMap = buckets.get(laneId);
    if (stageMap === undefined) continue;
    const template = templatesById.get(lane.pipelineTemplate);
    if (template === undefined) continue;
    // Emit every template stage so empty columns inside the lane
    // render with `is-empty` — pipeline shape stays visible per
    // DESIGN-STANDARDS.md § "Favor structure over scrolling".
    const byStage = new Map<string, readonly Entry[]>();
    let memberCount = 0;
    for (const stage of template.linearStages) {
      const arr = stageMap.get(stage) ?? [];
      byStage.set(stage, arr);
      memberCount += arr.length;
    }
    for (const stage of template.offPipelineStages) {
      const arr = stageMap.get(stage) ?? [];
      byStage.set(stage, arr);
      memberCount += arr.length;
    }
    out.push({ lane, template, byStage, memberCount });
  }
  return out;
}

function renderMemberStageCard(member: Entry): RawHtml {
  const reviewLink = `/dev/editorial-review/entry/${member.uuid}`;
  return unsafe(html`
    <a class="er-members-card lane-${member.lane ?? 'default'}"
      href="${reviewLink}"
      data-member-uuid="${member.uuid}"
      title="Open ${member.title}">
      <div class="er-members-card-body">
        <div class="er-members-card-title">${member.title}</div>
        <div class="er-members-card-slug">${member.slug}</div>
      </div>
      <span class="er-members-card-open" aria-hidden="true">↪</span>
    </a>`);
}

function renderComposedLane(bucket: LaneScopedBucket): RawHtml {
  const stages: string[] = [
    ...bucket.template.linearStages,
    ...bucket.template.offPipelineStages,
  ];
  const stagesRaw = stages
    .map((stage) => {
      const entries = bucket.byStage.get(stage) ?? [];
      const isEmpty = entries.length === 0;
      const emptyClass = isEmpty ? ' is-empty' : '';
      const cardsRaw = isEmpty
        ? ''
        : entries.map((m) => renderMemberStageCard(m).__raw).join('');
      const glyph = stageGlyph(stage);
      return html`
        <div class="er-members-stage${unsafe(emptyClass)}" data-stage="${stage}">
          <div class="er-members-stage-head">
            <span class="er-members-stage-glyph" aria-hidden="true">${glyph}</span>
            <span class="er-members-stage-name">${stage}</span>
            <span class="er-members-stage-count">${entries.length}</span>
          </div>
          ${isEmpty ? '' : unsafe(`<div class="er-members-stage-body">${cardsRaw}</div>`)}
        </div>`;
    })
    .join('');

  return unsafe(html`
    <div class="er-members-swim lane-${bucket.lane.id}"
      data-lane-id="${bucket.lane.id}"
      data-template-id="${bucket.template.id}">
      <div class="er-members-swim-head">
        <span class="er-members-swim-name">${bucket.lane.name}</span>
        <span class="er-members-swim-count">${bucket.memberCount} · ${bucket.template.id}</span>
      </div>
      <div class="er-members-swim-stages">${unsafe(stagesRaw)}</div>
    </div>`);
}

function renderComposedBody(buckets: readonly LaneScopedBucket[]): RawHtml {
  if (buckets.length === 0) {
    return unsafe(html`
      <div class="er-members-composed-empty" data-composed-empty>
        <span class="er-members-composed-empty-msg">No members landed in any configured lane.</span>
      </div>`);
  }
  const laneBlocks = buckets.map((b) => renderComposedLane(b).__raw).join('');
  return unsafe(html`
    <div class="er-members-composed" data-composed>${unsafe(laneBlocks)}</div>`);
}

function renderListRow(
  member: Entry,
  laneConfigsById: ReadonlyMap<string, StrictLaneConfig>,
): RawHtml {
  const reviewLink = `/dev/editorial-review/entry/${member.uuid}`;
  const laneId = member.lane;
  const laneConfig = laneId !== undefined ? laneConfigsById.get(laneId) : undefined;
  const laneLabel = laneConfig !== undefined ? laneConfig.name : (laneId ?? 'unrouted');
  // Validate lane id against LANE_ID_REGEX (`^[a-z0-9][a-z0-9-]*$`) before
  // composing the class attribute — `member.lane` is only Zod-typed as a
  // non-empty string, not regex-bound to the canonical lane-id charset.
  // A malformed sidecar with `lane: 'x" onclick="alert(1)'` would otherwise
  // break out of the class attribute when wrapped in `unsafe(...)`.
  const laneClass =
    laneId !== undefined && LANE_ID_REGEX.test(laneId)
      ? `lane-${laneId}`
      : 'lane-unrouted';
  const glyph = stageGlyph(member.currentStage);
  return unsafe(html`
    <li class="er-member-row ${unsafe(laneClass)}" data-member-uuid="${member.uuid}">
      <a class="er-member-row-link" href="${reviewLink}"
        data-member-copy
        data-member-href="${reviewLink}"
        title="Open ${member.title} (click also copies the URL)">
        <div class="er-member-row-meta">
          <span class="er-member-row-lane">${laneLabel}</span>
          <span class="er-member-row-sep" aria-hidden="true">·</span>
          <span class="er-member-row-glyph" aria-hidden="true">${glyph}</span>
          <span class="er-member-row-stage">${member.currentStage}</span>
        </div>
        <div class="er-member-row-title">${member.title}</div>
        <div class="er-member-row-slug">${member.slug}</div>
      </a>
    </li>`);
}

function renderMissingRow(uuid: string): RawHtml {
  return unsafe(html`
    <li class="er-member-row er-member-row--missing" data-missing-uuid="${uuid}">
      <div class="er-member-row-meta">
        <span class="er-member-row-lane">missing</span>
        <span class="er-member-row-sep" aria-hidden="true">·</span>
        <span class="er-member-row-glyph" aria-hidden="true">⊘</span>
        <span class="er-member-row-stage">unresolved</span>
      </div>
      <div class="er-member-row-title">Member sidecar not found</div>
      <div class="er-member-row-slug">${uuid}</div>
    </li>`);
}

function renderListBody(
  members: readonly Entry[],
  missingMemberUuids: readonly string[],
  laneConfigsById: ReadonlyMap<string, StrictLaneConfig>,
): RawHtml {
  const rowsRaw = members.map((m) => renderListRow(m, laneConfigsById).__raw).join('');
  const missingRaw = missingMemberUuids.map((u) => renderMissingRow(u).__raw).join('');
  return unsafe(html`
    <ul class="er-members-list" data-list>${unsafe(rowsRaw)}${unsafe(missingRaw)}</ul>`);
}

function renderToggle(initial: MembersViewMode): RawHtml {
  const composedActive = initial === 'composed' ? ' is-active' : '';
  const listActive = initial === 'list' ? ' is-active' : '';
  return unsafe(html`
    <div class="er-members-toggle" role="radiogroup"
      aria-label="Members view mode"
      data-members-toggle>
      <button type="button"
        class="er-members-toggle-cell${unsafe(composedActive)}"
        role="radio"
        aria-checked="${initial === 'composed' ? 'true' : 'false'}"
        data-view-mode="composed">
        <span class="er-members-toggle-glyph" aria-hidden="true">⊞</span>
        <span class="er-members-toggle-label">Composed</span>
      </button>
      <button type="button"
        class="er-members-toggle-cell${unsafe(listActive)}"
        role="radio"
        aria-checked="${initial === 'list' ? 'true' : 'false'}"
        data-view-mode="list">
        <span class="er-members-toggle-glyph" aria-hidden="true">≡</span>
        <span class="er-members-toggle-label">List</span>
      </button>
    </div>`);
}

function renderEmptyStateCta(group: Entry): RawHtml {
  // Clipboard payload per the accepted Direction-B mockup: the
  // operator pastes this string into a Claude Code chat to launch
  // the add-member flow. The literal `<MEMBER-SLUG>` placeholder
  // signals where to substitute.
  const copyText = `/deskwork:group add-member ${group.slug} <MEMBER-SLUG>`;
  return unsafe(html`
    <div class="er-members-empty-state" data-empty-state>
      <div class="er-members-empty-glyph" aria-hidden="true">⊟</div>
      <div class="er-members-empty-head">No members yet</div>
      <p class="er-members-empty-desc">
        this group is metadata-only.<br>
        populate it with <code>/deskwork:group add-member</code>.
      </p>
      <button type="button" class="er-members-empty-cta"
        data-empty-cta
        data-copy-text="${copyText}"
        aria-label="Copy /deskwork:group add-member command to clipboard">
        <span class="er-members-empty-cta-plus" aria-hidden="true">+</span>
        <span class="er-members-empty-cta-label">Add member</span>
      </button>
    </div>`);
}

function renderPopulatedSection(input: RenderMembersSectionInput): RawHtml {
  const buckets = bucketMembersByLane(
    input.members,
    input.laneConfigsById,
    input.templatesById,
  );
  const initial = input.initialViewMode;
  const sectionMode = initial === 'composed' ? 'composed' : 'list';
  const composedBody = renderComposedBody(buckets);
  const listBody = renderListBody(
    input.members,
    input.missingMemberUuids,
    input.laneConfigsById,
  );
  return unsafe(html`
    <section class="er-members-section"
      data-members-section
      data-group-uuid="${input.group.uuid}"
      data-view-mode="${sectionMode}">
      <header class="er-members-head">
        <div class="er-members-head-title">Members</div>
        ${renderToggle(initial)}
      </header>
      <div class="er-members-body-composed" data-body-composed
        ${initial === 'list' ? unsafe('hidden') : ''}>
        ${composedBody}
      </div>
      <div class="er-members-body-list" data-body-list
        ${initial === 'composed' ? unsafe('hidden') : ''}>
        ${listBody}
      </div>
    </section>`);
}

/**
 * Top-level renderer. Returns '' for non-group entries AND for empty
 * groups that have an `artifactPath` (the existing body renderer is the
 * intended fallback in that case per the accepted brief). Returns the
 * empty-state CTA when the group has no members AND no artifactPath.
 * Otherwise renders the populated section.
 */
export function renderMembersSection(input: RenderMembersSectionInput): string {
  const { group } = input;
  if (!isGroupEntry(group)) return '';

  if (!isPopulatedGroupEntry(group)) {
    // Declared group, no members yet. Fall back to the existing
    // artifactPath body when present; render the empty-state CTA when
    // there's nothing to render at all.
    if (group.artifactPath !== undefined && group.artifactPath.length > 0) {
      return '';
    }
    return html`
      <section class="er-members-section er-members-section--empty"
        data-members-section
        data-group-uuid="${group.uuid}"
        data-view-mode="empty">
        ${renderEmptyStateCta(group)}
      </section>`;
  }

  return renderPopulatedSection(input).__raw;
}

/**
 * Parse the `?members=<mode>` query string into a typed initial view
 * mode. The default is `composed` per the accepted brief (Direction B).
 * Unrecognized values fall back to composed.
 */
export function parseMembersViewModeQuery(raw: string | null | undefined): MembersViewMode {
  if (raw === 'list') return 'list';
  return 'composed';
}
