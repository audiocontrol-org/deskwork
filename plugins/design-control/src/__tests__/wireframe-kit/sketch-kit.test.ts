import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SKETCH_KIT_DIR,
  SKETCH_KIT_CSS_PATH,
  SKETCH_KIT_SAMPLE_PATH,
  SKETCH_KIT_THEMES,
  DEFAULT_SKETCH_KIT_THEME,
  SK_VOCABULARY,
  SKETCH_KIT_FONTS,
  SKETCH_KIT_ROOT_CLASS,
  SKETCH_KIT_BANNER_CLASS,
  SKETCH_KIT_BANNER_LABEL,
  SKETCH_KIT_IMG_CLASS,
} from '@/wireframe-kit/sketch-kit';

const css = (): string => readFileSync(SKETCH_KIT_CSS_PATH, 'utf8');
const sample = (): string => readFileSync(SKETCH_KIT_SAMPLE_PATH, 'utf8');

describe('sketch-kit closed `.sk-*` vocabulary', () => {
  it('every vocabulary token is namespaced under `sk`', () => {
    for (const token of SK_VOCABULARY) {
      expect(token).toMatch(/^sk(-[a-z0-9]+)*$/);
    }
  });

  it('has no duplicate tokens', () => {
    expect(new Set(SK_VOCABULARY).size).toBe(SK_VOCABULARY.length);
  });

  it('includes the root, banner, image, card and button anchors', () => {
    for (const anchor of [
      SKETCH_KIT_ROOT_CLASS,
      SKETCH_KIT_BANNER_CLASS,
      SKETCH_KIT_IMG_CLASS,
      'sk-card',
      'sk-btn',
    ]) {
      expect(SK_VOCABULARY).toContain(anchor);
    }
  });

  it('includes all three theme classes (multi-theme decision)', () => {
    for (const theme of SKETCH_KIT_THEMES) {
      expect(SK_VOCABULARY).toContain(theme);
    }
  });
});

describe('sketch-kit themes', () => {
  it('ships exactly the three adopter-selectable themes', () => {
    expect([...SKETCH_KIT_THEMES]).toEqual([
      'sk-theme-marker',
      'sk-theme-blueprint',
      'sk-theme-grayscale',
    ]);
  });

  it('the default theme is one of the shipped themes', () => {
    expect(SKETCH_KIT_THEMES).toContain(DEFAULT_SKETCH_KIT_THEME);
  });

  it('defines a selector for every theme in the single stylesheet', () => {
    const text = css();
    for (const theme of SKETCH_KIT_THEMES) {
      expect(text).toContain(`.${theme}`);
    }
  });
});

describe('sketch-kit.css is self-contained (lint precondition: single local stylesheet)', () => {
  it('exists and is non-empty', () => {
    expect(existsSync(SKETCH_KIT_CSS_PATH)).toBe(true);
    expect(css().trim().length).toBeGreaterThan(0);
  });

  it('references no remote resources (no http/https)', () => {
    expect(css()).not.toMatch(/https?:\/\//);
  });

  it('embeds no data: URIs', () => {
    expect(css().toLowerCase()).not.toContain('url(data:');
    expect(css().toLowerCase()).not.toContain('data:');
  });

  it('pulls in no external stylesheet via @import', () => {
    expect(css()).not.toMatch(/@import/);
  });

  it('every url(...) target resolves to a bundled file on disk', () => {
    const text = css();
    const urls = [...text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0); // the @font-face rules reference local fonts
    for (const u of urls) {
      const onDisk = resolve(SKETCH_KIT_DIR, u);
      expect(existsSync(onDisk), `referenced asset missing: ${u}`).toBe(true);
    }
  });

  it('declares one @font-face per bundled font weight', () => {
    const faces = (css().match(/@font-face/g) ?? []).length;
    expect(faces).toBe(SKETCH_KIT_FONTS.length);
  });
});

describe('bundled OFL fonts', () => {
  it('every declared font file + its OFL license is present on disk', () => {
    for (const font of SKETCH_KIT_FONTS) {
      expect(existsSync(resolve(SKETCH_KIT_DIR, font.file)), font.file).toBe(true);
      expect(existsSync(resolve(SKETCH_KIT_DIR, font.license)), font.license).toBe(true);
    }
  });

  it('every bundled woff2 is referenced by the stylesheet', () => {
    const text = css();
    for (const font of SKETCH_KIT_FONTS) {
      const base = font.file.split('/').pop()!;
      expect(text, `unreferenced font ${base}`).toContain(base);
    }
  });
});

describe('self-labeling WIREFRAME banner + crossed image placeholder', () => {
  it('styles the banner class', () => {
    expect(css()).toContain(`.${SKETCH_KIT_BANNER_CLASS}`);
  });

  it('draws the .sk-img placeholder as a crossed box (gradient diagonals)', () => {
    const text = css();
    const imgBlock = text.slice(text.indexOf(`.${SKETCH_KIT_IMG_CLASS}`));
    expect(imgBlock).toMatch(/linear-gradient/);
  });
});

describe('example wireframe demonstrates the kit honestly', () => {
  it('exists and references exactly one sketch-kit stylesheet', () => {
    expect(existsSync(SKETCH_KIT_SAMPLE_PATH)).toBe(true);
    const links = [...sample().matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)];
    expect(links).toHaveLength(1);
    expect(links[0][0]).toContain('sketch-kit.css');
  });

  it('sets the root class and a shipped theme on the body', () => {
    const body = sample().match(/<body[^>]*class=["']([^"']+)["']/i);
    expect(body, 'body[class] present').not.toBeNull();
    const tokens = body![1].split(/\s+/);
    expect(tokens).toContain(SKETCH_KIT_ROOT_CLASS);
    expect(tokens.some((t) => (SKETCH_KIT_THEMES as readonly string[]).includes(t))).toBe(true);
  });

  it('self-labels with the WIREFRAME banner text', () => {
    expect(sample()).toContain(SKETCH_KIT_BANNER_LABEL);
  });

  it('uses only class tokens drawn from the closed vocabulary', () => {
    const text = sample();
    const classAttrs = [...text.matchAll(/class=["']([^"']+)["']/g)].flatMap((m) =>
      m[1].split(/\s+/).filter(Boolean),
    );
    const vocab = new Set<string>(SK_VOCABULARY);
    const stray = classAttrs.filter((c) => !vocab.has(c));
    expect(stray, `tokens outside vocabulary: ${[...new Set(stray)].join(', ')}`).toEqual([]);
  });
});
