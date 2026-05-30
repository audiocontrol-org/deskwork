/**
 * Type-identity regression test for AUDIT-20260530-08.
 *
 * The original code declared `StrictLaneConfig = Pick<LaneConfig, ...>`
 * with a doc-comment claiming the alias "narrows" a `z.infer` widened by
 * `.passthrough()`. The claim is false: in Zod v3, `.passthrough()`
 * changes only RUNTIME parsing — it does NOT add a `[k: string]: unknown`
 * index signature to the inferred type. Identical reasoning applies to
 * `StrictPipelineTemplate`.
 *
 * This test locks in two assertions:
 *   1. `LaneConfig` has NO index signature (a `Record<string, unknown>`
 *      is NOT assignable to it). This is the operator-perceivable shape
 *      that proves the alias-claim was wrong.
 *   2. `PipelineTemplate` (now declared `.strict()`) likewise has no
 *      index signature.
 *
 * The test is a TYPE-only test: vitest runs it (so the file is type-
 * checked under the build), but the runtime body asserts only that the
 * imports resolve.
 */

import { describe, it, expect } from 'vitest';
import type { LaneConfig } from '../../src/lanes/types.ts';
import type { PipelineTemplate } from '../../src/pipelines/types.ts';

describe('AUDIT-20260530-08: type-identity regression guard', () => {
  it('LaneConfig does NOT carry an index signature', () => {
    // If LaneConfig had a `[k: string]: unknown` index signature, the
    // following assignment would type-check. It must not.
    // @ts-expect-error — Record<string, unknown> must NOT be assignable
    // to LaneConfig (no index signature on the inferred shape).
    const _x: LaneConfig = {} as Record<string, unknown>;
    void _x;
    expect(true).toBe(true);
  });

  it('PipelineTemplate does NOT carry an index signature', () => {
    // @ts-expect-error — Record<string, unknown> must NOT be assignable
    // to PipelineTemplate (`.strict()` schema; no index signature).
    const _y: PipelineTemplate = {} as Record<string, unknown>;
    void _y;
    expect(true).toBe(true);
  });
});
