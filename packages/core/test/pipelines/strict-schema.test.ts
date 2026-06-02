/**
 * AUDIT-20260530-02 — `.passthrough()` on PipelineTemplateSchema silently
 * accepted misspelled optional fields. The fix replaces `.passthrough()`
 * with `.strict()` and declares `$rationale` explicitly so the schema
 * names every allowed top-level key and rejects everything else.
 *
 * These tests anchor the contract from both directions:
 *
 *   - Unknown / mistyped keys at the top level fail loudly. A transposed
 *     `lockdStages` no longer silently resolves to `undefined`.
 *
 *   - The single known extra (`$rationale`) is permitted via an
 *     explicit `z.string().optional()` field, not via `.passthrough()`.
 *     A non-string `$rationale` is rejected.
 *
 *   - Every shipped preset still loads cleanly — the strict schema does
 *     not break presets, which carry `$rationale` only beyond the
 *     declared field set.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PipelineTemplateSchema } from '../../src/pipelines/types.ts';
import {
  loadPipelineTemplate,
  listAvailablePipelineTemplates,
} from '../../src/pipelines/loader.ts';

describe('AUDIT-20260530-02 — PipelineTemplateSchema strict-keys', () => {
  it('rejects a transposed `lockdStages` typo with an actionable error naming the unknown key', () => {
    const result = PipelineTemplateSchema.safeParse({
      id: 'editorial',
      name: 'Editorial',
      description: 'Custom flow with a typo.',
      linearStages: ['Ideas', 'Drafting', 'Final', 'Published'],
      // typo: should have been `lockedStages`.
      lockdStages: ['Final'],
      offPipelineStages: ['Blocked', 'Cancelled'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      // Zod's `.strict()` issue text contains the unrecognized key name
      // so the operator can find the typo. We don't lock the exact
      // wording (it changes across Zod minor versions) — just that the
      // bad key name appears AND the issue path points at the bad key.
      expect(messages.toLowerCase()).toMatch(/unrecognized|unknown/);
      const pathHit = result.error.issues.some((i) =>
        i.path.includes('lockdStages')
        || (typeof (i as { keys?: unknown }).keys === 'object'
            && JSON.stringify((i as { keys?: unknown }).keys).includes('lockdStages'))
        || messages.includes('lockdStages'),
      );
      expect(pathHit).toBe(true);
    }
  });

  it('rejects any other unknown top-level key (no silent passthrough)', () => {
    const result = PipelineTemplateSchema.safeParse({
      id: 'editorial',
      name: 'Editorial',
      description: 'Custom flow.',
      linearStages: ['Ideas', 'Drafting', 'Published'],
      offPipelineStages: ['Cancelled'],
      randomExtra: 'this used to slide through under .passthrough()',
    });
    expect(result.success).toBe(false);
  });

  it('still accepts the declared `$rationale` string', () => {
    const result = PipelineTemplateSchema.safeParse({
      id: 'editorial',
      name: 'Editorial',
      description: 'Custom flow.',
      linearStages: ['Ideas', 'Drafting', 'Published'],
      offPipelineStages: ['Cancelled'],
      $rationale: 'why this pipeline exists',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-string `$rationale` (the field is typed, not blanket-tolerated)', () => {
    const result = PipelineTemplateSchema.safeParse({
      id: 'editorial',
      name: 'Editorial',
      description: 'Custom flow.',
      linearStages: ['Ideas', 'Drafting', 'Published'],
      offPipelineStages: ['Cancelled'],
      $rationale: { wrong: 'shape' },
    });
    expect(result.success).toBe(false);
  });

  it('loads every shipped preset (each carries `$rationale` plus the declared field set)', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-strict-presets-'));
    try {
      const ids = listAvailablePipelineTemplates(projectRoot);
      for (const id of ids) {
        // Throws on Zod failure; that would surface as a regression.
        expect(() => loadPipelineTemplate(id, projectRoot)).not.toThrow();
      }
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects an override JSON containing the typo at load time', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-strict-typo-'));
    try {
      const dir = join(projectRoot, '.deskwork', 'pipelines');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'newsletter.json'),
        JSON.stringify({
          id: 'newsletter',
          name: 'Newsletter',
          description: 'Typo override.',
          linearStages: ['Draft', 'Sent'],
          // The exact typo the audit-log finding documents.
          lockdStages: ['Sent'],
          offPipelineStages: ['Cancelled'],
        }, null, 2),
        'utf8',
      );
      expect(() => loadPipelineTemplate('newsletter', projectRoot))
        .toThrow(/failed Zod validation/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
