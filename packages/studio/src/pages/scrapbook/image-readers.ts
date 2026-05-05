/**
 * Scrapbook image-format readers — pure functions on Buffer headers.
 *
 * Recognizes PNG, JPEG, WebP, and GIF; returns null for unrecognized
 * signatures or truncated/malformed buffers. Used by the scrapbook
 * card meta to render `{W} × {H}` next to the image kind chip.
 *
 * Each format is parsed from its file-header structure (no external
 * dependency); each branch returns null on any unexpected byte rather
 * than throwing, so a corrupt image still renders with empty meta.
 */

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

/**
 * Read width × height from a buffer. Recognizes PNG, JPEG, WebP, and
 * GIF; returns null for unrecognized signatures or truncated/malformed
 * buffers.
 */
export function readImageDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A then IHDR (chunk-length 4, "IHDR" 4,
  // width 4, height 4 — width@16, height@20).
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) {
    if (buf.length < 24) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // GIF: "GIF87a" or "GIF89a" + logical screen descriptor (width LE @6,
  // height LE @8).
  if (
    buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 &&
    buf[3] === 0x38 && (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61
  ) {
    if (buf.length < 10) return null;
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // JPEG: starts FF D8. Width/height live in a Start-Of-Frame marker
  // (FF C0–CF, excluding DHT C4 / JPG C8 / DAC CC). Walk markers
  // skipping their payloads until the SOF is found.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    return readJpegDimensions(buf);
  }
  // WebP: "RIFF" {size} "WEBP" then a chunk (VP8 / VP8L / VP8X).
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return readWebpDimensions(buf);
  }
  return null;
}

export function readJpegDimensions(buf: Buffer): ImageDimensions | null {
  // Marker walk: skip FF D8 (SOI), then each marker is FF Xn followed
  // by a 2-byte big-endian segment length (which includes its own 2
  // bytes). The SOF segment's payload is: 1 byte precision, 2 bytes
  // height, 2 bytes width (the rest is component info).
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    let marker = buf[i + 1] ?? 0;
    // Skip fill bytes (0xff padding before the actual marker byte).
    while (marker === 0xff && i + 2 < buf.length) {
      i++;
      marker = buf[i + 1] ?? 0;
    }
    i += 2;
    // Standalone markers (no length): RST0–7 (D0–D7) and SOI/EOI/TEM.
    if (marker === 0xd9 || marker === 0xd8 || marker === 0x01) return null;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (i + 2 > buf.length) return null;
    const segLen = buf.readUInt16BE(i);
    // SOF markers carry the dimensions. Exclusions per JPEG spec:
    // C4 (DHT — Huffman tables), C8 (JPG reserved), CC (DAC — arithmetic
    // coding conditioning).
    const isSof =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 7 > buf.length) return null;
      return {
        width: buf.readUInt16BE(i + 5),
        height: buf.readUInt16BE(i + 3),
      };
    }
    i += segLen;
  }
  return null;
}

export function readWebpDimensions(buf: Buffer): ImageDimensions | null {
  // Three sub-formats (per RFC 6386 / VP8L spec / WebP container spec):
  //   - "VP8 " (lossy):     header @20-22: signature 9D 01 2A, then
  //                          14-bit width LE @23, 14-bit height LE @25
  //                          (each masked to 14 bits — top 2 bits are
  //                          horizontal/vertical scale).
  //   - "VP8L" (lossless):  header @20: signature 0x2F, then 32 bits
  //                          packed: width-1 (14 bits) + height-1 (14
  //                          bits) + alpha-flag + version (4 bits).
  //   - "VP8X" (extended):  flags @20, reserved @21-23, width-1 (24
  //                          bits LE) @24, height-1 (24 bits LE) @27.
  // Need at least the RIFF header + chunk fourcc; per-variant length
  // checks below cover the variant-specific payload sizes.
  if (buf.length < 16) return null;
  const fourcc = buf.subarray(12, 16).toString('ascii');
  if (fourcc === 'VP8 ') {
    if (buf.length < 30) return null;
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    const w = buf.readUInt16LE(26) & 0x3fff;
    const h = buf.readUInt16LE(28) & 0x3fff;
    return { width: w, height: h };
  }
  if (fourcc === 'VP8L') {
    if (buf.length < 25) return null;
    if (buf[20] !== 0x2f) return null;
    // Read 4 bytes LE at offset 21, then unpack.
    const packed = buf.readUInt32LE(21);
    const widthMinus1 = packed & 0x3fff;
    const heightMinus1 = (packed >>> 14) & 0x3fff;
    return { width: widthMinus1 + 1, height: heightMinus1 + 1 };
  }
  if (fourcc === 'VP8X') {
    if (buf.length < 30) return null;
    // 24-bit little-endian: low byte + (mid << 8) + (high << 16).
    const w =
      ((buf[24] ?? 0) | ((buf[25] ?? 0) << 8) | ((buf[26] ?? 0) << 16)) + 1;
    const h =
      ((buf[27] ?? 0) | ((buf[28] ?? 0) << 8) | ((buf[29] ?? 0) << 16)) + 1;
    return { width: w, height: h };
  }
  return null;
}
