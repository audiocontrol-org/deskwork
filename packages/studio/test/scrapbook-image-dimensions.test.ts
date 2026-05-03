/**
 * #163 Phase 34b — readImageDimensions covers PNG / JPEG / WebP / GIF.
 *
 * Builds synthetic minimal-header buffers for each format and asserts
 * the returned `{ width, height }` matches what the file header
 * encodes. Hits readImageDimensions through the public scrapbook page
 * route (renders `{W} × {H}` next to the image kind chip), so the
 * test exercises the integration path the operator sees.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import type { EditorialCalendar } from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: { d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
    defaultSite: 'd',
  };
}

/**
 * 24-byte minimum-shape PNG header. Width/height encoded big-endian
 * at offsets 16/20. Doesn't include valid IDAT/IEND because the parser
 * never reads past the IHDR chunk.
 */
function makePng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  // PNG signature.
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  // IHDR length (13) + "IHDR".
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/**
 * Minimal GIF89a header. Width/height encoded little-endian at offsets
 * 6/8. Only the first 10 bytes are consumed by the parser.
 */
function makeGif(width: number, height: number): Buffer {
  const buf = Buffer.alloc(13);
  buf.write('GIF89a', 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

/**
 * Minimal JPEG header with one SOF0 marker. SOI (FF D8), then SOF0:
 * marker FF C0, length 17 BE, precision 8, height BE @5, width BE @7,
 * 3 components × 3 bytes. The parser walks markers, so a long JPEG
 * with comments before the SOF would still parse — keep this minimal
 * for the regression case.
 */
function makeJpeg(width: number, height: number): Buffer {
  const buf = Buffer.alloc(2 + 2 + 17);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xc0;
  buf.writeUInt16BE(17, 4);
  buf[6] = 8; // precision
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  return buf;
}

/**
 * Minimal WebP "VP8 " (lossy) header. RIFF wrapper + VP8 chunk header
 * + 3-byte frame tag + signature 9D 01 2A + 14-bit width / height LE.
 */
function makeWebpLossy(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(22, 4); // file size (post-RIFF)
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf.writeUInt32LE(10, 16); // chunk size
  // Frame tag (3 bytes) — content irrelevant for parser.
  buf[20] = 0x00;
  buf[21] = 0x00;
  buf[22] = 0x00;
  // Signature.
  buf[23] = 0x9d;
  buf[24] = 0x01;
  buf[25] = 0x2a;
  // 14-bit width / height LE @26, 28.
  buf.writeUInt16LE(width & 0x3fff, 26);
  buf.writeUInt16LE(height & 0x3fff, 28);
  return buf;
}

/**
 * Minimal WebP "VP8L" (lossless) header. RIFF + VP8L + signature byte
 * 0x2F + 4 bytes packed: width-1 (14 bits) + height-1 (14 bits) +
 * alpha-flag (1 bit) + version (3 bits, total 4 bits).
 */
function makeWebpLossless(width: number, height: number): Buffer {
  const buf = Buffer.alloc(25);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(17, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8L', 12, 'ascii');
  buf.writeUInt32LE(5, 16);
  buf[20] = 0x2f; // signature
  // Packed 32-bit field: width-1 (14b) + height-1 (14b) + flags (4b).
  const packed = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  buf.writeUInt32LE(packed, 21);
  return buf;
}

/**
 * Minimal WebP "VP8X" (extended) header. RIFF + VP8X + flags + reserved
 * + 24-bit width-1 LE + 24-bit height-1 LE.
 */
function makeWebpExtended(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(22, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUInt32LE(10, 16);
  buf[20] = 0x00; // flags
  buf[21] = 0x00; // reserved
  buf[22] = 0x00;
  buf[23] = 0x00;
  const w = width - 1;
  const h = height - 1;
  buf[24] = w & 0xff;
  buf[25] = (w >>> 8) & 0xff;
  buf[26] = (w >>> 16) & 0xff;
  buf[27] = h & 0xff;
  buf[28] = (h >>> 8) & 0xff;
  buf[29] = (h >>> 16) & 0xff;
  return buf;
}

function seedScrapbookWith(
  root: string,
  cfg: DeskworkConfig,
  filename: string,
  buf: Buffer,
): void {
  const cal: EditorialCalendar = { entries: [], distributions: [] };
  mkdirSync(join(root, '.deskwork'), { recursive: true });
  writeCalendar(join(root, cfg.sites.d.calendarPath), cal);
  const dir = join(root, 'docs/img/scrapbook');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), buf);
}

async function fetchPageHtml(
  app: ReturnType<typeof createApp>,
): Promise<string> {
  const res = await app.fetch(
    new Request('http://x/dev/scrapbook/d/img'),
  );
  return res.text();
}

describe('readImageDimensions — PNG / JPEG / WebP / GIF (#163)', () => {
  let root: string;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-img-'));
    cfg = makeConfig();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('parses PNG dimensions from the IHDR chunk', async () => {
    seedScrapbookWith(root, cfg, 'shot.png', makePng(640, 480));
    const app = createApp({ projectRoot: root, config: cfg });
    const html = await fetchPageHtml(app);
    expect(html).toContain('640 × 480');
  });

  it('parses GIF dimensions from the logical screen descriptor', async () => {
    seedScrapbookWith(root, cfg, 'anim.gif', makeGif(320, 200));
    const app = createApp({ projectRoot: root, config: cfg });
    const html = await fetchPageHtml(app);
    expect(html).toContain('320 × 200');
  });

  it('parses JPEG dimensions from the SOF0 marker', async () => {
    seedScrapbookWith(root, cfg, 'photo.jpg', makeJpeg(1920, 1080));
    const app = createApp({ projectRoot: root, config: cfg });
    const html = await fetchPageHtml(app);
    expect(html).toContain('1920 × 1080');
  });

  it('parses WebP lossy (VP8) dimensions', async () => {
    seedScrapbookWith(root, cfg, 'pic.webp', makeWebpLossy(800, 600));
    const app = createApp({ projectRoot: root, config: cfg });
    const html = await fetchPageHtml(app);
    expect(html).toContain('800 × 600');
  });

  it('parses WebP lossless (VP8L) dimensions', async () => {
    seedScrapbookWith(root, cfg, 'pic.webp', makeWebpLossless(1024, 768));
    const app = createApp({ projectRoot: root, config: cfg });
    const html = await fetchPageHtml(app);
    expect(html).toContain('1024 × 768');
  });

  it('parses WebP extended (VP8X) dimensions', async () => {
    seedScrapbookWith(root, cfg, 'pic.webp', makeWebpExtended(2048, 1536));
    const app = createApp({ projectRoot: root, config: cfg });
    const html = await fetchPageHtml(app);
    expect(html).toContain('2048 × 1536');
  });

  it('returns no dimensions (omits meta) for unrecognized magic bytes', async () => {
    // Random bytes that match no known signature. Should NOT throw and
    // should NOT emit `× ` (the dimension separator) anywhere in the
    // card meta block.
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    seedScrapbookWith(root, cfg, 'mystery.png', garbage);
    const app = createApp({ projectRoot: root, config: cfg });
    const html = await fetchPageHtml(app);
    // The card renders, but no dimension meta.
    expect(html).toContain('mystery.png');
    expect(html).not.toMatch(/\d+ × \d+/);
  });
});
