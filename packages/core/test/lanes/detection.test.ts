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
  /**
   * Extension-based dispatch fires only once the path is confirmed to
   * exist on disk (AUDIT-20260530-09). Per-test fixtures touch a real
   * tmp file with the relevant extension; the dispatch is then driven
   * by extname.
   */
  describe('extension-based dispatch (existing files)', () => {
    let projectRoot: string;

    beforeEach(() => {
      projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-detect-ext-'));
    });

    afterEach(() => {
      rmSync(projectRoot, { recursive: true, force: true });
    });

    function touch(name: string): string {
      const path = join(projectRoot, name);
      writeFileSync(path, 'fixture-bytes', 'utf8');
      return path;
    }

    it('classifies .md as markdown', () => {
      expect(detectArtifactKind(touch('post.md'))).toBe('markdown');
    });

    it('classifies .html as single-file-html', () => {
      expect(detectArtifactKind(touch('mockup.html'))).toBe('single-file-html');
    });

    it('classifies .png as image', () => {
      expect(detectArtifactKind(touch('sketch.png'))).toBe('image');
    });

    it('classifies .jpg as image', () => {
      expect(detectArtifactKind(touch('photo.jpg'))).toBe('image');
    });

    it('classifies .jpeg as image', () => {
      expect(detectArtifactKind(touch('photo.jpeg'))).toBe('image');
    });

    it('classifies .gif as image', () => {
      expect(detectArtifactKind(touch('anim.gif'))).toBe('image');
    });

    it('classifies .webp as image', () => {
      expect(detectArtifactKind(touch('img.webp'))).toBe('image');
    });

    it('classifies .svg as image', () => {
      expect(detectArtifactKind(touch('logo.svg'))).toBe('image');
    });

    it('is case-insensitive on the extension', () => {
      expect(detectArtifactKind(touch('Post.MD'))).toBe('markdown');
      expect(detectArtifactKind(touch('Sketch.PNG'))).toBe('image');
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
    let projectRoot: string;

    beforeEach(() => {
      projectRoot = mkdtempSync(join(tmpdir(), 'dw-detect-refusal-'));
    });

    afterEach(() => {
      rmSync(projectRoot, { recursive: true, force: true });
    });

    it('refuses an existing file with an unrecognized extension', () => {
      const file = join(projectRoot, 'doc.pdf');
      writeFileSync(file, 'pdf-bytes', 'utf8');
      expect(() => detectArtifactKind(file))
        .toThrow(/unsupported artifact extension/);
      expect(() => detectArtifactKind(file))
        .toThrow(/\.md.*\.html.*\.png/s);
    });

    it('refuses an existing path with no extension', () => {
      const file = join(projectRoot, 'Makefile');
      writeFileSync(file, '# makefile', 'utf8');
      expect(() => detectArtifactKind(file))
        .toThrow(/unsupported artifact extension/);
    });

    it('refuses an existing path with the wrong audio/video extension', () => {
      const mp3 = join(projectRoot, 'song.mp3');
      const mp4 = join(projectRoot, 'clip.mp4');
      writeFileSync(mp3, 'mp3-bytes', 'utf8');
      writeFileSync(mp4, 'mp4-bytes', 'utf8');
      expect(() => detectArtifactKind(mp3))
        .toThrow(/unsupported artifact extension/);
      expect(() => detectArtifactKind(mp4))
        .toThrow(/unsupported artifact extension/);
    });
  });

  /**
   * AUDIT-20260530-09 regression block: the docblock claimed
   * "classifies an on-disk path," but only the html-mockup branch
   * touched disk. .md / .html / image branches dispatched purely on
   * extname with NO existence check. Asymmetric failure modes for
   * the same root cause (missing artifact). Fixed by probing
   * existsSync up-front and refusing non-existent paths with the
   * actionable "artifact does not exist" message.
   */
  describe('existence probe (AUDIT-20260530-09)', () => {
    it('refuses a non-existent .md path with the actionable message', () => {
      expect(() => detectArtifactKind('/definitely-nonexistent/post.md'))
        .toThrow(/artifact does not exist/);
    });

    it('refuses a non-existent .html path with the actionable message', () => {
      expect(() => detectArtifactKind('/definitely-nonexistent/index.html'))
        .toThrow(/artifact does not exist/);
    });

    it('refuses a non-existent image path with the actionable message', () => {
      expect(() => detectArtifactKind('/definitely-nonexistent/icon.png'))
        .toThrow(/artifact does not exist/);
    });

    it('refuses a non-existent directory-shaped path with the actionable message', () => {
      expect(() => detectArtifactKind('/definitely-nonexistent/mockup-dir'))
        .toThrow(/artifact does not exist/);
    });
  });
});
