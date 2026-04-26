/*
 * editorial-review-editor.ts — CodeMirror 6 markdown editor for the
 * review surface's edit mode.
 *
 * Not 2005. Replaces a raw <textarea> with a CodeMirror 6 instance
 * configured for markdown: syntax highlighting (headings, bold,
 * italic, code, links, lists), soft-wrap, a press-check-desk theme
 * that reads like a proof rather than a code window, and a tight
 * keyboard binding for save (Cmd/Ctrl+Enter).
 *
 * The client code that manages edit mode only needs two things from
 * this module: a `mount()` that initializes the editor inside a host
 * element and returns a handle, and the handle's `setValue()` /
 * `getValue()` / `focus()` methods.
 *
 * Preview rendering is handled by the caller — the editor only emits
 * `onChange` whenever the document changes, passing the current
 * markdown source. Keeps this module pure: markdown in, markdown out.
 */

import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export interface EditorHandle {
  view: EditorView;
  getValue: () => string;
  setValue: (md: string) => void;
  focus: () => void;
  destroy: () => void;
  /**
   * Place the cursor at the given document offset and scroll it
   * into view. Used by the review surface to jump the editor to
   * the spot the operator double-clicked in the rendered prose,
   * instead of landing at position 0.
   */
  setCursor: (pos: number) => void;
}

export interface MountOptions {
  /** Host element the editor attaches to. The div gets filled. */
  host: HTMLElement;
  /** Initial markdown source. */
  doc: string;
  /** Fires on every change with the current full source. */
  onChange: (md: string) => void;
  /** Fires on Cmd/Ctrl+Enter. Optional. */
  onSave?: () => void;
  /** Fires on Esc. Optional. */
  onCancel?: () => void;
}

/**
 * Syntax-highlighting style tuned for markdown-as-prose. Structural
 * markers (`#`, `**`, `-`, `>`, `` ` ``) render in a mono face with a
 * dimmed ink color so they read as annotation rather than body.
 * Bold / italic render visually as bold / italic in the source —
 * closer to a typographer's proof than a code window.
 */
const pressCheckHighlight = HighlightStyle.define([
  // Structural / meta tokens — dimmed, mono (via CSS variable).
  { tag: tags.processingInstruction, color: 'var(--er-faded)', fontFamily: 'var(--er-font-mono)', fontWeight: 500 },
  { tag: tags.meta, color: 'var(--er-faded-2)' },

  // Headings — scale up + weight via h1/h2/h3/h4 tags.
  { tag: tags.heading1, color: 'var(--er-ink)', fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--er-font-display)', lineHeight: '1.25' },
  { tag: tags.heading2, color: 'var(--er-ink)', fontSize: '1.3rem', fontWeight: 600, fontFamily: 'var(--er-font-display)', lineHeight: '1.3' },
  { tag: tags.heading3, color: 'var(--er-ink)', fontSize: '1.1rem', fontWeight: 600, fontFamily: 'var(--er-font-display)' },
  { tag: tags.heading4, color: 'var(--er-ink)', fontSize: '1rem', fontWeight: 600, fontFamily: 'var(--er-font-display)' },

  // Emphasis renders inline so the source feels like prose.
  { tag: tags.strong, color: 'var(--er-ink)', fontWeight: 700 },
  { tag: tags.emphasis, color: 'var(--er-ink)', fontStyle: 'italic' },

  // Links — blue-pencil treatment.
  { tag: tags.link, color: 'var(--er-proof-blue)', textDecoration: 'underline', textUnderlineOffset: '2px' },
  { tag: tags.url, color: 'var(--er-proof-blue)', fontFamily: 'var(--er-font-mono)', fontSize: '0.85em' },

  // Inline code + fences.
  { tag: tags.monospace, color: 'var(--er-ink-soft)', fontFamily: 'var(--er-font-mono)', fontSize: '0.85em' },

  // Block quotes — red-pencil bar handled in CSS; token color stays soft.
  { tag: tags.quote, color: 'var(--er-ink-soft)', fontStyle: 'italic' },

  // Lists — bullet / number markers.
  { tag: tags.list, color: 'var(--er-ink)' },

  // Hidden comments (HTML comment syntax) — faded out so they don't shout.
  { tag: tags.comment, color: 'var(--er-faded-2)', fontStyle: 'italic' },
]);

/**
 * Theme tuned to the press-check-desk aesthetic. CodeMirror 6
 * themes are just `EditorView.theme({...})` — the class hooks are
 * stable across versions.
 */
const pressCheckTheme = EditorView.theme(
  {
    '&': {
      fontFamily: 'var(--er-font-body)',
      fontSize: '1rem',
      lineHeight: '1.55',
      color: 'var(--er-ink)',
      backgroundColor: 'var(--er-paper)',
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily: 'var(--er-font-body)',
      overflow: 'auto',
      padding: 'var(--er-space-2) 0',
    },
    '.cm-content': {
      padding: '0 var(--er-space-3)',
      caretColor: 'var(--er-red-pencil)',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--er-red-pencil)', borderLeftWidth: '2px' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--er-faded-2)',
      border: 'none',
      fontFamily: 'var(--er-font-mono)',
      fontSize: '0.65rem',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--er-highlight) 60%, transparent) !important',
    },
    '.cm-focused': { outline: 'none' },
    '.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--er-highlight) 60%, transparent) !important',
    },
    '.cm-line': { padding: '0' },
  },
  { dark: false },
);

export function mountEditor(opts: MountOptions): EditorHandle {
  const state = EditorState.create({
    doc: opts.doc,
    extensions: [
      lineNumbers(),
      history(),
      highlightActiveLine(),
      markdown({ base: markdownLanguage, codeLanguages: [] }),
      syntaxHighlighting(pressCheckHighlight),
      pressCheckTheme,
      EditorView.lineWrapping,
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            opts.onSave?.();
            return true;
          },
        },
        {
          key: 'Escape',
          run: () => {
            opts.onCancel?.();
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          opts.onChange(update.state.doc.toString());
        }
      }),
    ],
  });

  const view = new EditorView({
    state,
    parent: opts.host,
  });

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue: (md: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: md },
      });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
    setCursor: (pos: number) => {
      const clamped = Math.max(0, Math.min(pos, view.state.doc.length));
      view.dispatch({
        selection: { anchor: clamped },
        scrollIntoView: true,
      });
    },
  };
}
