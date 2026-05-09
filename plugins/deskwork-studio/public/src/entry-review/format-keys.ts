/**
 * Markdown press-check format keys for the mobile editor's Format sheet.
 *
 * Each key wraps the current selection or inserts a placeholder snippet
 * at the caret in the active CodeMirror editor. Block-level keys also
 * toggle off when invoked on a line that already starts with the prefix.
 *
 * Visual reference:
 * /static/mockups/editor-2-press-check-tabbar.html (frame B).
 *
 * Used only at <48rem viewports. Desktop has full keyboard shortcuts
 * (Cmd+B, Cmd+I, etc.) wired into CodeMirror — no parallel UI needed.
 */
import { EditorView } from '@codemirror/view';

export type FKey =
  | 'h1' | 'h2' | 'h3' | 'hr'
  | 'bold' | 'em' | 'code' | 'link'
  | 'list' | 'ol' | 'quote' | 'fence';

interface InsertSpec {
  readonly before: string;
  readonly after: string;
  readonly placeholder: string;
  readonly block: boolean;
}

const SPECS: Record<FKey, InsertSpec> = {
  h1:    { before: '# ',     after: '',      placeholder: 'Heading',     block: true  },
  h2:    { before: '## ',    after: '',      placeholder: 'Section',     block: true  },
  h3:    { before: '### ',   after: '',      placeholder: 'Subsection',  block: true  },
  hr:    { before: '\n---\n', after: '',     placeholder: '',            block: true  },
  bold:  { before: '**',     after: '**',    placeholder: 'bold',        block: false },
  em:    { before: '*',      after: '*',     placeholder: 'italic',      block: false },
  code:  { before: '`',      after: '`',     placeholder: 'code',        block: false },
  link:  { before: '[',      after: '](https://)', placeholder: 'link text', block: false },
  list:  { before: '- ',     after: '',      placeholder: 'item',        block: true  },
  ol:    { before: '1. ',    after: '',      placeholder: 'item',        block: true  },
  quote: { before: '> ',     after: '',      placeholder: 'quote',       block: true  },
  fence: { before: '```\n',  after: '\n```', placeholder: 'code block',  block: true  },
};

function findEditorView(): EditorView | null {
  const root = document.querySelector<HTMLElement>('[data-edit-source] .cm-editor');
  if (!root) return null;
  return EditorView.findFromDOM(root);
}

function applyFKey(key: FKey): boolean {
  const view = findEditorView();
  if (!view) return false;
  const spec = SPECS[key];
  const sel = view.state.selection.main;
  const selected = view.state.sliceDoc(sel.from, sel.to);

  if (spec.block) {
    const line = view.state.doc.lineAt(sel.from);
    // Toggle off when the line already starts with this prefix and the
    // operator has no active selection — second tap removes the prefix.
    if (selected.length === 0 && line.text.startsWith(spec.before)) {
      view.dispatch({
        changes: { from: line.from, to: line.from + spec.before.length, insert: '' },
      });
      view.focus();
      return true;
    }
    const body = selected.length > 0 ? selected : spec.placeholder;
    const insert = spec.before + body + spec.after;
    const cursorAt = line.from + spec.before.length + body.length;
    view.dispatch({
      changes: { from: line.from, to: sel.to, insert },
      selection: selected.length > 0
        ? { anchor: cursorAt }
        : { anchor: line.from + spec.before.length, head: cursorAt },
    });
    view.focus();
    return true;
  }

  const body = selected.length > 0 ? selected : spec.placeholder;
  const insert = spec.before + body + spec.after;
  const wrapStart = sel.from + spec.before.length;
  const wrapEnd = wrapStart + body.length;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: selected.length > 0
      ? { anchor: wrapEnd }
      : { anchor: wrapStart, head: wrapEnd },
  });
  view.focus();
  return true;
}

/**
 * Wire delegated click handling on the format-sheet host element.
 * `onAfter` fires after a successful insertion (used to close the
 * sheet). No-op when the editor isn't mounted (e.g. tab tapped before
 * edit mode is fully entered).
 */
export function bindFormatKeys(host: HTMLElement, onAfter?: () => void): void {
  host.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const btn = target.closest<HTMLButtonElement>('[data-fkey]');
    if (!btn) return;
    const key = btn.dataset.fkey as FKey | undefined;
    if (!key || !(key in SPECS)) return;
    ev.preventDefault();
    if (applyFKey(key)) onAfter?.();
  });
}
