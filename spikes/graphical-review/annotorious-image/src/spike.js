// Phase 1 Task 1.2 — Annotorious image-annotation spike.
//
// Wires Annotorious v3 against a self-contained SVG fixture, emits W3C
// Web Annotation Data Model JSON-LD via the bundled W3CImageFormat
// adapter, mirrors the payload into the page, and offers a download.
//
// Spike constraints:
//  - No fallbacks: if the fixture image fails to load, throw with a
//    descriptive message (per project rule against silent fallbacks).
//  - Use the W3CImageFormat adapter so lifecycle events receive W3C
//    objects directly, not Annotorious's internal model.

import { createImageAnnotator, W3CImageFormat } from '@annotorious/annotorious';
import '@annotorious/annotorious/annotorious.css';

const FIXTURE_ELEMENT_ID = 'fixture-image';
const FIXTURE_SOURCE_URI = 'urn:deskwork-spike:fixture.svg';
const PAYLOAD_ELEMENT_ID = 'payload';
const PAYLOAD_META_ID = 'payload-meta';
const DOWNLOAD_BUTTON_ID = 'download';
const TOOL_BUTTONS = [
  { id: 'tool-rectangle', tool: 'rectangle' },
  { id: 'tool-polygon', tool: 'polygon' }
];

function requireElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(
      `Annotorious spike: required DOM element #${id} is missing from index.html.`
    );
  }
  return el;
}

function ensureFixtureLoaded(img) {
  return new Promise((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) {
      resolve();
      return;
    }
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener(
      'error',
      () => {
        reject(
          new Error(
            `Annotorious spike: fixture image at src="${img.getAttribute('src')}" failed to load. ` +
              'Confirm fixture.svg exists alongside index.html — the spike requires a real fixture, ' +
              'never a fallback or placeholder.'
          )
        );
      },
      { once: true }
    );
  });
}

function renderPayload(annotations) {
  const pre = requireElement(PAYLOAD_ELEMENT_ID);
  const meta = requireElement(PAYLOAD_META_ID);
  pre.textContent = JSON.stringify(annotations, null, 2);
  meta.textContent =
    annotations.length === 0
      ? 'No annotations yet.'
      : `${annotations.length} annotation${annotations.length === 1 ? '' : 's'} (W3C Web Annotation Data Model)`;
}

function downloadAnnotations(annotations) {
  const blob = new Blob([JSON.stringify(annotations, null, 2)], {
    type: 'application/ld+json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'annotations.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function wireToolbar(anno) {
  const buttons = TOOL_BUTTONS.map((entry) => ({
    button: requireElement(entry.id),
    tool: entry.tool
  }));
  buttons.forEach(({ button, tool }) => {
    button.addEventListener('click', () => {
      anno.setDrawingTool(tool);
      buttons.forEach(({ button: other, tool: otherTool }) => {
        other.setAttribute('aria-pressed', String(otherTool === tool));
      });
    });
  });
  requireElement('tool-clear').addEventListener('click', () => {
    anno.clearAnnotations();
  });
}

function wireGlobalKeyboardShortcuts(anno) {
  document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      anno.cancelDrawing();
    }
  });
}

function snapshotAnnotations(anno) {
  // anno.getAnnotations() returns adapter-serialized (W3C) objects when
  // an adapter is configured. Capturing via the getter avoids drifting
  // out of sync with internal state on update/delete events.
  return anno.getAnnotations();
}

async function main() {
  const img = requireElement(FIXTURE_ELEMENT_ID);
  await ensureFixtureLoaded(img);

  const anno = createImageAnnotator(FIXTURE_ELEMENT_ID, {
    adapter: W3CImageFormat(FIXTURE_SOURCE_URI),
    drawingEnabled: true,
    theme: 'light',
    userSelectAction: 'EDIT'
  });

  anno.setDrawingTool('rectangle');

  const refresh = () => renderPayload(snapshotAnnotations(anno));

  anno.on('createAnnotation', refresh);
  anno.on('updateAnnotation', refresh);
  anno.on('deleteAnnotation', refresh);

  wireToolbar(anno);
  wireGlobalKeyboardShortcuts(anno);

  requireElement(DOWNLOAD_BUTTON_ID).addEventListener('click', () => {
    downloadAnnotations(snapshotAnnotations(anno));
  });

  renderPayload([]);

  // Surface for browser-console exploration.
  window.__spike = { anno };
}

main().catch((err) => {
  // Surface the error visibly — never silently fall back.
  console.error(err);
  const body = document.body;
  const banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.style.cssText =
    'background:#7a1f1f;color:#fff;padding:1rem;font-family:Georgia,serif;';
  banner.textContent = `Spike failed to initialise: ${err.message}`;
  body.prepend(banner);
});
