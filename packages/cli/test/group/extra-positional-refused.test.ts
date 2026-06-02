/**
 * deskwork CLI `group` verbs reject extra positional arguments.
 *
 * Phase 0 Task 0.69 (graphical-entries) — closes AUDIT-20260530-94
 * (cross-model: AUDIT-BARRAGE-codex-P7T7.2). The handlers previously
 * checked only minimum positional counts and silently discarded
 * extras: `deskwork group <root> archive group-a group-b` archived
 * only `group-a`; `group create slug accidental --lane default`
 * created `slug` and dropped `accidental`. Because these verbs mutate
 * state, the project convention is explicit refusal over hiding
 * operator typos.
 *
 * Each test runs a verb with the correct positional count + one
 * extra and asserts exit code 2 (usage error) + a stderr message
 * naming the extras. The happy-path arities are covered by the
 * per-verb test files; this file's purpose is the upper-bound gate.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  assertDeskworkBinPresent,
  destroyProject,
  group,
  makeProject,
  writeSidecar,
} from './helpers.ts';

beforeAll(() => { assertDeskworkBinPresent(); });

let project: string;
beforeEach(() => { project = makeProject(); });
afterEach(() => { destroyProject(project); });

describe('deskwork group — extra positional refusal', () => {
  it('show: refuses an extra positional', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440701', 'g-show', {
      members: ['550e8400-e29b-41d4-a716-446655440702'],
    });
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440702', 'm-show');
    const res = group(project, 'show', 'g-show', 'extra-arg');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/extras/);
    expect(res.stderr).toMatch(/extra-arg/);
  });

  it('create: refuses an extra positional', () => {
    const res = group(
      project,
      'create',
      'g-create',
      'accidental',
      '--lane',
      'default',
    );
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/extras/);
    expect(res.stderr).toMatch(/accidental/);
  });

  it('update: refuses an extra positional', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440711', 'g-update', {
      members: ['550e8400-e29b-41d4-a716-446655440712'],
    });
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440712', 'm-update');
    const res = group(project, 'update', 'g-update', 'spurious');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/extras/);
    expect(res.stderr).toMatch(/spurious/);
  });

  it('add-member: refuses an extra positional', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440721', 'g-add', {
      members: [],
    });
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440722', 'm-add');
    const res = group(project, 'add-member', 'g-add', 'm-add', 'oops');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/extras/);
    expect(res.stderr).toMatch(/oops/);
  });

  it('remove-member: refuses an extra positional', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440731', 'g-rem', {
      members: ['550e8400-e29b-41d4-a716-446655440732'],
    });
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440732', 'm-rem');
    const res = group(project, 'remove-member', 'g-rem', 'm-rem', 'extra');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/extras/);
    expect(res.stderr).toMatch(/extra/);
  });

  it('archive: refuses an extra positional', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440741', 'g-arch', {
      members: ['550e8400-e29b-41d4-a716-446655440742'],
    });
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440742', 'm-arch');
    const res = group(project, 'archive', 'g-arch', 'g-other');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/extras/);
    expect(res.stderr).toMatch(/g-other/);
  });

  it('restore: refuses an extra positional', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440751', 'g-rest', {
      members: ['550e8400-e29b-41d4-a716-446655440752'],
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440752', 'm-rest');
    const res = group(project, 'restore', 'g-rest', 'g-also');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/extras/);
    expect(res.stderr).toMatch(/g-also/);
  });

  it('happy paths unchanged: each verb still accepts its documented arity', () => {
    // Sanity sweep: confirm the new upper-bound gate did not regress
    // the at-arity case. Each verb gets one minimal invocation that
    // should still succeed.
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440761', 'h-mem-1');
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440762', 'h-grp-1', {
      members: ['550e8400-e29b-41d4-a716-446655440761'],
    });

    const showRes = group(project, 'show', 'h-grp-1');
    expect(showRes.code).toBe(0);

    const updateRes = group(project, 'update', 'h-grp-1', '--title', 'New');
    expect(updateRes.code).toBe(0);

    const archRes = group(project, 'archive', 'h-grp-1');
    expect(archRes.code).toBe(0);

    const restRes = group(project, 'restore', 'h-grp-1');
    expect(restRes.code).toBe(0);
  });
});
