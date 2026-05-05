/**
 * Phase 35 (issue #199) — affordance placement check.
 *
 * Per `.claude/rules/affordance-placement.md`, the Edit + Delete
 * affordances live ON the comment card, NOT in a toolbar. This test
 * pins the wiring at the source-text boundary so a regression where
 * someone moves them into a toolbar gets caught at unit-test time
 * (without needing a Playwright walk).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SIDEBAR_RENDER_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts',
);
const COMMENT_EDIT_DELETE_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/src/entry-review/comment-edit-delete.ts',
);
const ANNOTATIONS_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/src/entry-review/annotations.ts',
);
const CSS_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/css/editorial-review.css',
);

describe('comment card affordances (Phase 35 / issue #199)', () => {
  it('renders an Edit button on each comment card with data-action="edit-comment"', () => {
    const ts = readFileSync(SIDEBAR_RENDER_PATH, 'utf8');
    expect(ts).toMatch(/editBtn\.textContent\s*=\s*['"]Edit['"]/);
    expect(ts).toMatch(/editBtn\.dataset\.action\s*=\s*['"]edit-comment['"]/);
  });

  it('renders a Delete button on each comment card with data-action="delete-comment"', () => {
    const ts = readFileSync(SIDEBAR_RENDER_PATH, 'utf8');
    expect(ts).toMatch(/deleteBtn\.textContent\s*=\s*['"]Delete['"]/);
    expect(ts).toMatch(/deleteBtn\.dataset\.action\s*=\s*['"]delete-comment['"]/);
  });

  it('appends both Edit and Delete affordances to the per-card actions row', () => {
    const ts = readFileSync(SIDEBAR_RENDER_PATH, 'utf8');
    // Both buttons get appended to `actions` (the per-card actions row),
    // not to a toolbar element. The actions row IS the on-component
    // affordance home per affordance-placement.md.
    expect(ts).toMatch(/actions\.appendChild\(editBtn\)/);
    expect(ts).toMatch(/actions\.appendChild\(deleteBtn\)/);
  });

  it('Delete uses the destructive variant class (visually distinct from Resolve)', () => {
    const ts = readFileSync(SIDEBAR_RENDER_PATH, 'utf8');
    expect(ts).toMatch(/er-marginalia-action--destructive/);
  });

  it('CSS defines the destructive variant for the Delete button', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(/\.er-marginalia-action--destructive\b/);
  });

  it('Delete button uses inlineConfirm (not native confirm/prompt)', () => {
    const ts = readFileSync(COMMENT_EDIT_DELETE_PATH, 'utf8');
    // The destructive path goes through the project's existing
    // inline-prompt helper, not the native browser dialog.
    expect(ts).toMatch(/inlineConfirm\(/);
    // Defense-in-depth: no native dialog calls in this module.
    expect(ts).not.toMatch(/window\.confirm\(/);
    expect(ts).not.toMatch(/window\.prompt\(/);
  });

  it('Edit form is in-card (an inline textarea + Save/Cancel), not a modal', () => {
    const ts = readFileSync(COMMENT_EDIT_DELETE_PATH, 'utf8');
    // The inline edit form replaces the note paragraph in place
    // and gets dropped after Save/Cancel. Inserting via
    // `insertAdjacentElement('afterend', form)` after the note
    // element keeps the form *inside* the same card.
    expect(ts).toMatch(/createElement\(['"]textarea['"]\)/);
    expect(ts).toMatch(/insertAdjacentElement\(['"]afterend['"],\s*form\)/);
  });

  it('PATCH/DELETE targets the new entry-keyed routes', () => {
    const ts = readFileSync(COMMENT_EDIT_DELETE_PATH, 'utf8');
    expect(ts).toMatch(/\/api\/dev\/editorial-review\/entry/);
    expect(ts).toMatch(/method:\s*['"]PATCH['"]/);
    expect(ts).toMatch(/method:\s*['"]DELETE['"]/);
  });

  it('annotations controller wires the edit + delete handlers from the helper module', () => {
    const ts = readFileSync(ANNOTATIONS_PATH, 'utf8');
    expect(ts).toMatch(/createCommentEditApi/);
    expect(ts).toMatch(/createEditDeleteHandlers/);
    // The handlers come from comment-edit-delete.ts — ensures the
    // separation is real, not a re-export-of-controller-logic.
    expect(ts).toMatch(
      /from\s+['"]\.\/comment-edit-delete\.ts['"]/,
    );
  });

  it('does NOT introduce an Edit/Delete control in any toolbar', () => {
    // Affordance-placement.md: per-component affordances live ON the
    // component. We assert the new actions are NOT created in any of
    // the toolbar-rendering files.
    const candidateToolbarFiles = [
      resolve(
        __dirname,
        '../../../plugins/deskwork-studio/public/src/entry-review-client.ts',
      ),
      resolve(
        __dirname,
        '../../../plugins/deskwork-studio/public/src/entry-review/decision.ts',
      ),
      resolve(
        __dirname,
        '../../../plugins/deskwork-studio/public/src/entry-review/edit-mode.ts',
      ),
    ];
    for (const path of candidateToolbarFiles) {
      const src = readFileSync(path, 'utf8');
      // The on-card affordance is identified by the dataset action
      // values; assert these strings don't leak into toolbar-host
      // files.
      expect(src).not.toMatch(/data-action="edit-comment"/);
      expect(src).not.toMatch(/data-action="delete-comment"/);
    }
  });
});
