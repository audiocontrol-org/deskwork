// T075 (RED-first, US2, 028) — roadmap.setMarker: write the `design-approved`
// marker (and the symmetric `analyze-clean`); `--clear` negates. WorkItem.
// designApproved / analyzeClean read true after. Unknown node → DocumentModelError
// (exit-2 class); graph re-validated, zero-write on failure (FR-016; contract RM3;
// TASK-298 — the sanctioned verb that writes the marker, no forbidden hand-edit).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { setMarker } from '../../roadmap/edge-mutations.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { DocumentModelError } from '../../document-model/types.js';
import { ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

describe('roadmap.setMarker (T075)', () => {
  it('writes design-approved so WorkItem.designApproved reads true', () => {
    const docPath = writeTempRoadmap(['## design:feature/a', '- status: in-flight']);
    setMarker(docPath, 'design:feature/a', 'design-approved', true, ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('design:feature/a')!.designApproved).toBe(true);
  });

  it('writes analyze-clean (symmetric marker) so WorkItem.analyzeClean reads true', () => {
    const docPath = writeTempRoadmap(['## impl:feature/x', '- status: in-flight']);
    setMarker(docPath, 'impl:feature/x', 'analyze-clean', true, ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:feature/x')!.analyzeClean).toBe(true);
  });

  it('--clear negates an existing design-approved marker (reads false)', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: in-flight',
      '- design-approved: yes',
    ]);
    setMarker(docPath, 'design:feature/a', 'design-approved', false, ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('design:feature/a')!.designApproved).toBe(false);
  });

  it('dry-run (apply=false) writes nothing', () => {
    const docPath = writeTempRoadmap(['## design:feature/a', '- status: in-flight']);
    const before = readFileSync(docPath, 'utf8');
    const result = setMarker(docPath, 'design:feature/a', 'design-approved', true, ROADMAP_OPTS, false);
    expect(result.applied).toBe(false);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an unknown node (exit-2 class) zero-write', () => {
    const docPath = writeTempRoadmap(['## design:feature/a', '- status: in-flight']);
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      setMarker(docPath, 'design:feature/ghost', 'design-approved', true, ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
