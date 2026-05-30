/**
 * Members-section bucketing logic. Splits a group's resolved members
 * into:
 *
 *   - per-lane buckets (one `LaneScopedBucket` per lane the members
 *     span, each carrying the lane's full template stage sequence so
 *     empty columns render with `is-empty`);
 *
 *   - an `unbucketed` tail for members the bucketer couldn't route
 *     into a (lane, stage) cell — see AUDIT-20260529-37 for the
 *     failure modes the unbucketed tail surfaces.
 *
 * Extracted from `members-section.ts` to keep that file under the
 * 500-line cap; the bucketing pass is the natural piece to lift out
 * because it has no DOM/HTML concerns — pure data shaping.
 */

import type { Entry } from '@deskwork/core/schema/entry';
import type { StrictLaneConfig } from '@deskwork/core/lanes';
import type { StrictPipelineTemplate } from '@deskwork/core/pipelines';

export interface LaneScopedBucket {
  readonly lane: StrictLaneConfig;
  readonly template: StrictPipelineTemplate;
  /** Stage → members-of-this-group-in-this-lane-at-this-stage. */
  readonly byStage: ReadonlyMap<string, readonly Entry[]>;
  readonly memberCount: number;
}

/**
 * Result of bucketing members into lanes scoped to this group's member
 * set. Carries the per-lane buckets PLUS an `unbucketed` tail for
 * members the bucketer couldn't route into a (lane, stage) cell — so
 * stage/template mismatches and broken-template lanes surface inline
 * instead of silently dropping (AUDIT-20260529-37).
 */
export interface BucketingResult {
  readonly buckets: readonly LaneScopedBucket[];
  /**
   * Members that didn't route into any lane bucket. Either:
   *   - the member's `lane` is undefined (no lane assignment);
   *   - the member's `lane` isn't present in `laneConfigsById` (lane
   *     config missing on disk, OR template load failed and the
   *     loader correctly withheld the lane registration);
   *   - the member's `currentStage` isn't in its lane template's
   *     `linearStages + offPipelineStages` (legacy stage / operator
   *     typo / template was trimmed).
   *
   * Order: preserved from the input `members` array.
   */
  readonly unbucketed: readonly Entry[];
}

/**
 * Bucket members into lane → stage scoped to this group's member set.
 *
 * Members are placed in one of two buckets:
 *
 *   - A per-lane bucket (`buckets[]`) when (a) `member.lane` is defined,
 *     (b) `laneConfigsById` carries that lane, AND (c) the member's
 *     `currentStage` is one of the lane template's
 *     `linearStages + offPipelineStages`.
 *
 *   - The `unbucketed` tail otherwise. Per AUDIT-20260529-37, any of
 *     the three conditions above failing previously caused the member
 *     to silently vanish from the composed view. The unbucketed-tail
 *     surface keeps the member visible inline so stage/template/lane
 *     mismatches don't disappear.
 *
 * Lanes are emitted in the operator-configured lane order, which the
 * caller threads in via the iteration order of `laneConfigsById`.
 */
export function bucketMembersByLane(
  members: readonly Entry[],
  laneConfigsById: ReadonlyMap<string, StrictLaneConfig>,
  templatesById: ReadonlyMap<string, StrictPipelineTemplate>,
): BucketingResult {
  // First pass: route members into per-lane stage maps, collecting
  // anyone the bucketer can't place into `unbucketed`.
  const buckets = new Map<string, Map<string, Entry[]>>();
  const unbucketed: Entry[] = [];

  // Build a per-lane set of template-known stages so we can detect
  // stage-not-in-template members in the first pass (rather than
  // discovering them only when the second pass emits the stages and
  // their bucketed entries get silently orphaned).
  const stagesByLaneId = new Map<string, ReadonlySet<string>>();
  for (const [laneId, lane] of laneConfigsById) {
    const tpl = templatesById.get(lane.pipelineTemplate);
    if (tpl === undefined) continue;
    const stages = new Set<string>([...tpl.linearStages, ...tpl.offPipelineStages]);
    stagesByLaneId.set(laneId, stages);
  }

  for (const member of members) {
    if (member.lane === undefined) {
      unbucketed.push(member);
      continue;
    }
    if (!laneConfigsById.has(member.lane)) {
      unbucketed.push(member);
      continue;
    }
    const knownStages = stagesByLaneId.get(member.lane);
    if (knownStages === undefined || !knownStages.has(member.currentStage)) {
      // Lane present but its template wasn't (caught above via the
      // stagesByLaneId map being empty for the lane), OR the stage
      // isn't in the template. Either way the member would silently
      // drop without the unbucketed tail — surface it inline.
      unbucketed.push(member);
      continue;
    }
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

  // Second pass: emit one lane block per laneConfigsById entry that
  // received at least one member. Iterates in operator-configured
  // lane order (the iteration order of `laneConfigsById`).
  const out: LaneScopedBucket[] = [];
  for (const [laneId, lane] of laneConfigsById) {
    const stageMap = buckets.get(laneId);
    if (stageMap === undefined) continue;
    const template = templatesById.get(lane.pipelineTemplate);
    // Defensive: template absence is already filtered upstream (members
    // of a template-less lane went to unbucketed), but the bucket map
    // entry only exists if at least one member routed in — which can
    // only happen when the template was present. Keep the guard so the
    // type narrowing is explicit.
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
  return { buckets: out, unbucketed };
}
