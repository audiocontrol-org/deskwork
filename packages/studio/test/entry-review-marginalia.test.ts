/**
 * Phase 34a Layer 2 — marginalia + composer rendering on the entry-keyed
 * surface.
 *
 * Verifies the chrome contract per `.claude/rules/affordance-placement.md`:
 *   - The on-component stow chevron lives in the marginalia head.
 *   - The pull-tab on the right edge is rendered (visibility flips
 *     server-side via the `body[data-marginalia="hidden"]` rule).
 *   - The composer + sidebar list shells are present so the client
 *     can populate them after fetching the entry's annotations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

const KNOWN_UUID = '11111111-1111-4111-8111-111111111111';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'docs',
        calendarPath: 'docs/cal-a.md',
        blogFilenameTemplate: '{slug}.md',
      },
    },
    defaultSite: 'a',
  };
}

function makeEntry(): Entry {
  return {
    uuid: KNOWN_UUID,
    slug: 'hello-world',
    title: 'Hello World',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Drafting: 1 },
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
  };
}

async function seedArtifact(projectRoot: string, slug: string): Promise<void> {
  const dir = join(projectRoot, 'docs', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.md'), '# Hello World\n', 'utf8');
}

describe('entry-review marginalia chrome', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-review-mg-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify(cfg),
    );
    await writeSidecar(projectRoot, makeEntry());
    await seedArtifact(projectRoot, 'hello-world');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('renders both stow affordances (chevron in head + pull-tab on right edge)', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    // Chevron inside the marginalia head — visible when marginalia is.
    expect(html).toContain('class="er-marginalia-stow"');
    expect(html).toMatch(
      /class="er-marginalia-stow"[^>]*data-action="toggle-marginalia"/,
    );
    // Pull-tab on the right edge — visible when marginalia is stowed.
    expect(html).toContain('class="er-marginalia-tab"');
    expect(html).toMatch(
      /class="er-marginalia-tab"[^>]*data-action="toggle-marginalia"/,
    );
  });

  it('renders the composer shell + sidebar list', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    expect(html).toContain('data-comment-composer');
    expect(html).toContain('data-comment-category');
    expect(html).toContain('data-comment-text');
    expect(html).toContain('data-sidebar-list');
    expect(html).toContain('data-sidebar-empty');
    // Composer category options match the legacy surface verbatim.
    for (const cat of ['voice-drift', 'missing-receipt', 'tutorial-framing']) {
      expect(html).toContain(`<option value="${cat}">`);
    }
  });

  it('renders the floating Mark pencil affordance', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    const html = await res.text();
    expect(html).toContain('class="er-pencil-btn"');
    expect(html).toContain('data-add-comment-btn');
  });
});
