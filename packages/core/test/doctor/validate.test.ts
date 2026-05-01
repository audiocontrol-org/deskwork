import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAll } from '@/doctor/validate';

describe('validateAll - schema', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, 'docs'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), '# Editorial Calendar\n\n## Ideas\n*No entries.*\n');
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('passes a clean state', async () => {
    const result = await validateAll(projectRoot);
    expect(result.failures).toEqual([]);
  });

  it('fails when a sidecar is schema-invalid', async () => {
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', '550e8400-e29b-41d4-a716-446655440000.json'),
      JSON.stringify({ uuid: '550e8400-e29b-41d4-a716-446655440000', currentStage: 'NotAStage' })
    );
    const result = await validateAll(projectRoot);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures.some(f => f.category === 'schema')).toBe(true);
  });
});
