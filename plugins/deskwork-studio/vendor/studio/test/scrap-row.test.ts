/**
 * Tests for the shared scrap-row renderer.
 *
 * v0.6.0 (#29) — image scrap rows must carry the `data-kind="img"`
 * attribute and a `.scrap__thumb-link` wrapper so the lightbox
 * listener (`initScrapbookLightbox`) can find them.
 */

import { describe, it, expect } from 'vitest';
import {
  renderReadOnlyScrapbookRow,
  scrapbookViewerUrl,
} from '../src/components/scrapbook-item.ts';
import type { ScrapbookItem } from '@deskwork/core/scrapbook';

function img(name: string): ScrapbookItem {
  return {
    name,
    kind: 'img',
    size: 12345,
    mtime: '2026-04-26T00:00:00.000Z',
  };
}

describe('renderReadOnlyScrapbookRow — image rows (#29 lightbox bind targets)', () => {
  it('marks image rows with data-kind="img" and a thumb-link', () => {
    const html = renderReadOnlyScrapbookRow(
      { site: 'wc', path: 'the-outbound/characters' },
      img('cover.png'),
    ).__raw;
    expect(html).toContain('data-kind="img"');
    expect(html).toContain('data-filename="cover.png"');
    expect(html).toContain('class="scrap__thumb-link"');
    expect(html).toContain('class="scrap__thumb"');
  });

  it('points the thumb-link at the read-only binary endpoint', () => {
    const html = renderReadOnlyScrapbookRow(
      { site: 'wc', path: 'the-outbound' },
      img('hero.jpg'),
    ).__raw;
    // The lightbox preempts navigation, but the link still points at
    // the file URL as a graceful fallback.
    expect(html).toContain('/api/dev/scrapbook-file');
    expect(html).toContain('site=wc');
    expect(html).toContain('path=the-outbound');
    expect(html).toContain('name=hero.jpg');
  });

  it('renders mtime and size text the lightbox uses for the caption', () => {
    const html = renderReadOnlyScrapbookRow(
      { site: 'wc', path: 'p' },
      img('a.gif'),
    ).__raw;
    // The lightbox reads `.scrap__size` and `.scrap__mtime` for caption
    // segments — verify they're emitted.
    expect(html).toContain('class="scrap__size"');
    expect(html).toContain('class="scrap__mtime"');
  });

  it('non-image rows do not get the img-specific markup', () => {
    const item: ScrapbookItem = {
      name: 'notes.md',
      kind: 'md',
      size: 100,
      mtime: '2026-04-26T00:00:00.000Z',
    };
    const html = renderReadOnlyScrapbookRow(
      { site: 'wc', path: 'p' },
      item,
    ).__raw;
    expect(html).not.toContain('data-kind="img"');
    expect(html).not.toContain('class="scrap__thumb-link"');
  });
});

describe('scrapbookViewerUrl', () => {
  it('builds /dev/scrapbook/<site>/<path> URLs', () => {
    const url = scrapbookViewerUrl({ site: 'wc', path: 'the-outbound/characters' });
    expect(url).toBe('/dev/scrapbook/wc/the-outbound/characters');
  });
});
