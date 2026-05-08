/**
 * URL builder regression for the scrapbook viewer + file-fetch URL
 * helpers (#205).
 *
 * Both helpers (`scrapbookViewerUrl`, `scrapbookFileUrl`) are now
 * entry-aware: when an `entryId` is present on the address, the URL
 * threads `entryId=<uuid>` so the server resolves the listing /
 * file-fetch via `scrapbookDirForEntry` (matching the entry-aware
 * mutation API). When absent, slug-template addressing is the
 * back-compat fallback for legacy callers and ad-hoc paths.
 */

import { describe, it, expect } from 'vitest';
import {
  scrapbookFileUrl,
  scrapbookViewerUrl,
} from '../src/components/scrapbook-item.ts';

describe('scrapbookViewerUrl — entry-aware vs. slug-template addressing (#205)', () => {
  const SITE = 'wc';
  const PATH = 'the-outbound';
  const ENTRY_UUID = 'b3f20364-969a-4004-87bd-278cd5992e3c';

  it('emits the slug-template URL when no entryId is supplied', () => {
    const url = scrapbookViewerUrl({ site: SITE, path: PATH });
    expect(url).toBe('/dev/scrapbook/wc/the-outbound');
  });

  it('appends ?entryId=<uuid> when entryId is supplied', () => {
    const url = scrapbookViewerUrl({
      site: SITE,
      path: PATH,
      entryId: ENTRY_UUID,
    });
    expect(url).toBe(
      `/dev/scrapbook/wc/the-outbound?entryId=${ENTRY_UUID}`,
    );
  });

  it('treats an empty entryId as absent (slug-template fallback)', () => {
    const url = scrapbookViewerUrl({ site: SITE, path: PATH, entryId: '' });
    expect(url).toBe('/dev/scrapbook/wc/the-outbound');
  });

  it('preserves slash characters in the path segment', () => {
    const url = scrapbookViewerUrl({
      site: SITE,
      path: 'the-outbound/characters/strivers',
    });
    expect(url).toBe('/dev/scrapbook/wc/the-outbound/characters/strivers');
  });

  it('URL-encodes the entryId value', () => {
    // Defensive: the regular UUID shape never needs encoding, but the
    // helper should not naïvely concatenate. A future caller might
    // pass an opaque token; verify the encoding step survives.
    const url = scrapbookViewerUrl({
      site: SITE,
      path: PATH,
      entryId: 'a/b',
    });
    expect(url).toBe('/dev/scrapbook/wc/the-outbound?entryId=a%2Fb');
  });
});

describe('scrapbookFileUrl — entry-aware vs. slug-template addressing (#205)', () => {
  const SITE = 'wc';
  const PATH = 'the-outbound';
  const ENTRY_UUID = 'b3f20364-969a-4004-87bd-278cd5992e3c';

  it('emits path=<slug> when no entryId is supplied', () => {
    const url = scrapbookFileUrl(
      { site: SITE, path: PATH },
      'cover.png',
    );
    expect(url).toContain('site=wc');
    expect(url).toContain('path=the-outbound');
    expect(url).toContain('name=cover.png');
    expect(url).not.toContain('entryId=');
  });

  it('emits entryId=<uuid> when entryId is supplied (path NOT sent)', () => {
    const url = scrapbookFileUrl(
      { site: SITE, path: PATH, entryId: ENTRY_UUID },
      'cover.png',
    );
    expect(url).toContain('site=wc');
    expect(url).toContain(`entryId=${ENTRY_UUID}`);
    expect(url).toContain('name=cover.png');
    // The slug-template `path=` parameter MUST be omitted in entry-aware
    // mode; sending both would let the server choose path-mode and
    // re-introduce the orphan-write asymmetry the entry-aware mode is
    // meant to close.
    expect(url).not.toMatch(/[?&]path=/);
  });

  it('preserves the secret flag in both modes', () => {
    const slugUrl = scrapbookFileUrl(
      { site: SITE, path: PATH },
      'private.md',
      { secret: true },
    );
    expect(slugUrl).toContain('secret=1');

    const entryUrl = scrapbookFileUrl(
      { site: SITE, path: PATH, entryId: ENTRY_UUID },
      'private.md',
      { secret: true },
    );
    expect(entryUrl).toContain('secret=1');
  });

  it('treats an empty entryId as absent (slug-template fallback)', () => {
    const url = scrapbookFileUrl(
      { site: SITE, path: PATH, entryId: '' },
      'cover.png',
    );
    expect(url).toContain('path=the-outbound');
    expect(url).not.toContain('entryId=');
  });
});
