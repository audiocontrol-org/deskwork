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

function isFKey(value: string | undefined): value is FKey {
  return value !== undefined && value in SPECS;
}

function findEditorView(): EditorView | null {
  const root = document.querySelector<HTMLElement>('[data-edit-source] .cm-editor');
  if (!root) return null;
  return EditorView.findFromDOM(root);
}

// Block-level prefixes the toggle-off / replace logic recognizes.
// Order matters — longer prefixes must come first so a `### ` line
// isn't mis-recognized as `## ` or `# `.
const BLOCK_PREFIXES = ['### ', '## ', '# ', '- ', '1. ', '> '];

function strippedLineText(text: string): { stripped: string; removed: string } {
  for (const p of BLOCK_PREFIXES) {
    if (text.startsWith(p)) return { stripped: text.slice(p.length), removed: p };
  }
  return { stripped: text, removed: '' };
}

function applyFKey(key: FKey): boolean {
  const view = findEditorView();
  if (!view) return false;
  const spec = SPECS[key];
  const sel = view.state.selection.main;
  const selected = view.state.sliceDoc(sel.from, sel.to);

  if (spec.block) {
    const firstLine = view.state.doc.lineAt(sel.from);
    const lastLine = view.state.doc.lineAt(sel.to);
    const multiLine = lastLine.number > firstLine.number;

    // Toggle off / replace: when the operator has no selection and the
    // current line already starts with ANY recognized block prefix,
    // strip that prefix and apply the new one. This handles both the
    // tap-twice toggle-off case (prefix matches) and the swap-heading-
    // level case (e.g. tapping H1 on a `### ` line replaces with `# `).
    // Pure toggle-off when the existing prefix matches the requested
    // key's prefix and the operator wants to remove it.
    if (selected.length === 0 && !multiLine) {
      const { stripped, removed } = strippedLineText(firstLine.text);
      if (removed === spec.before) {
        view.dispatch({
          changes: { from: firstLine.from, to: firstLine.from + removed.length, insert: '' },
        });
        view.focus();
        return true;
      }
      if (removed !== '') {
        view.dispatch({
          changes: { from: firstLine.from, to: firstLine.to, insert: spec.before + stripped },
        });
        view.focus();
        return true;
      }
      const body = spec.placeholder;
      const insert = spec.before + body + spec.after;
      view.dispatch({
        changes: { from: firstLine.from, to: sel.to, insert },
        selection: { anchor: firstLine.from + spec.before.length, head: firstLine.from + spec.before.length + body.length },
      });
      view.focus();
      return true;
    }

    if (multiLine) {
      // Prefix every line in the selection. Keeps `from === to` so the
      // selected text is preserved between insertions.
      const changes: Array<{ from: number; to: number; insert: string }> = [];
      for (let n = firstLine.number; n <= lastLine.number; n++) {
        const ln = view.state.doc.line(n);
        const { stripped, removed } = strippedLineText(ln.text);
        if (removed === '') {
          changes.push({ from: ln.from, to: ln.from, insert: spec.before });
        } else if (removed !== spec.before) {
          changes.push({ from: ln.from, to: ln.to, insert: spec.before + stripped });
        }
      }
      if (changes.length > 0) view.dispatch({ changes });
      view.focus();
      return true;
    }

    // Single-line with selection: wrap the selected text on its own line.
    const { stripped, removed } = strippedLineText(firstLine.text);
    if (removed !== '' && removed !== spec.before) {
      view.dispatch({
        changes: { from: firstLine.from, to: firstLine.to, insert: spec.before + stripped },
      });
      view.focus();
      return true;
    }
    const insert = spec.before + selected + spec.after;
    const cursorAt = firstLine.from + spec.before.length + selected.length;
    view.dispatch({
      changes: { from: firstLine.from, to: sel.to, insert },
      selection: { anchor: cursorAt },
    });
    view.focus();
    return true;
  }

  // Inline keys: wrap the selection or insert the placeholder at caret.
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
    const raw = btn.dataset.fkey;
    if (!isFKey(raw)) return;
    ev.preventDefault();
    if (applyFKey(raw)) onAfter?.();
  });
}
