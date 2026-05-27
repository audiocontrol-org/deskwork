/**
 * detectArtifactKind tests.
 *
 * Each supported case gets one test; refusal-on-unsupported has its
 * own block. Tests touch the real filesystem for the html-mockup case
 * (where the function probes for `<dir>/index.html`); other cases are
 * purely extension-based and don't touch disk.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectArtifactKind } from '../../src/lanes/detection.ts';

describe('detectArtifactKind', () => {
  describe('extension-based dispatch (no filesystem probe)', () => {
    it('classifies .md as markdown', () => {
      expect(detectArtifactKind('/path/to/post.md')).toBe('markdown');
    });

    it('classifies .html as single-file-html', () => {
      expect(detectArtifactKind('/path/to/mockup.html')).toBe('single-file-html');
    });

    it('classifies .png as image', () => {
      expect(detectArtifactKind('/path/to/sketch.png')).toBe('image');
    });

    it('classifies .jpg as image', () => {
      expect(detectArtifactKind('/path/to/photo.jpg')).toBe('image');
    });

    it('classifies .jpeg as image', () => {
      expect(detectArtifactKind('/path/to/photo.jpeg')).toBe('image');
    });

    it('classifies .gif as image', () => {
      expect(detectArtifactKind('/path/to/anim.gif')).toBe('image');
    });

    it('classifies .webp as image', () => {
      expect(detectArtifactKind('/path/to/img.webp')).toBe('image');
    });

    it('classifies .svg as image', () => {
      expect(detectArtifactKind('/path/to/logo.svg')).toBe('image');
    });

    it('is case-insensitive on the extension', () => {
      expect(detectArtifactKind('/path/Post.MD')).toBe('markdown');
      expect(detectArtifactKind('/path/Sketch.PNG')).toBe('image');
    });
  });

  describe('html-mockup directory detection', () => {
    let projectRoot: string;

    beforeEach(() => {
      projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-detect-'));
    });

    afterEach(() => {
      rmSync(projectRoot, { recursive: true, force: true });
    });

    it('classifies a directory containing index.html as html-mockup', () => {
      const dir = join(projectRoot, 'mockup-dir');
      mkdirSync(dir);
      writeFileSync(join(dir, 'index.html'), '<!doctype html>', 'utf8');
      expect(detectArtifactKind(dir)).toBe('html-mockup');
    });

    it('refuses a directory without index.html', () => {
      const dir = join(projectRoot, 'plain-dir');
      mkdirSync(dir);
      expect(() => detectArtifactKind(dir)).toThrow(/has no index\.html/);
    });

    it('refuses a directory with only an index.htm (no .html)', () => {
      const dir = join(projectRoot, 'htm-dir');
      mkdirSync(dir);
      writeFileSync(join(dir, 'index.htm'), '<html/>', 'utf8');
      expect(() => detectArtifactKind(dir)).toThrow(/has no index\.html/);
    });
  });

  describe('refusal path', () => {
    it('refuses unrecognized extensions with a clear listing-style error', () => {
      expect(() => detectArtifactKind('/path/to/file.pdf'))
        .toThrow(/unsupported artifact extension/);
      expect(() => detectArtifactKind('/path/to/file.pdf'))
        .toThrow(/\.md.*\.html.*\.png/s);
    });

    it('refuses paths with no extension', () => {
      expect(() => detectArtifactKind('/path/to/Makefile'))
        .toThrow(/unsupported artifact extension/);
    });

    it('refuses paths with the wrong audio/video extension', () => {
      expect(() => detectArtifactKind('/path/to/song.mp3'))
        .toThrow(/unsupported artifact extension/);
      expect(() => detectArtifactKind('/path/to/clip.mp4'))
        .toThrow(/unsupported artifact extension/);
    });
  });
});
