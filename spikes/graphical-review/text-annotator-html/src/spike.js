// Phase 1 Task 1.3 — @recogito/text-annotator HTML-annotation spike.
//
// Wires @recogito/text-annotator against the iframe-loaded fixture mockup,
// emits W3C Web Annotation Data Model JSON-LD via the bundled W3CTextFormat
// adapter for text-range pins.
//
// Library gotcha (load-bearing for v1 architecture):
// @recogito/text-annotator attaches its selection listeners to the JS realm's
// `document` (not the container's ownerDocument). Running the library in the
// HOST page against an iframe's body therefore does NOT capture selections
// inside the iframe. The spike works around this by ALSO loading
// `src/iframe-annotator.js` as a module inside the iframe document (same-
// origin via Vite); that script creates a second annotator instance in the
// iframe's JS realm and exposes annotations to the host via
// `window.parent.__spike.onIframeTextAnnotationsChanged(...)`.
//
// For non-text DOM regions (icon buttons, <img>, decorative <div>s), the
// host spike layers a thin hand-rolled DOM-selector resolver (src/dom-anchor.js)
// on top, because @recogito/text-annotator is a text-range annotator and has
// no native concept of pinning to a non-text element.
//
// Spike constraints:
//  - No fallbacks: if the iframe fixture fails to load, throw with a
//    descriptive message (per project rule against silent fallbacks).
//  - Iframe is same-origin (served by Vite from `/fixture/index.html`).

import {
  buildDomAnnotation,
  resolveDomAnnotation
} from './dom-anchor.js';

const FIXTURE_IFRAME_ID = 'fixture-iframe';
const FIXTURE_SOURCE_URI = 'urn:deskwork-spike:fixture-html-mockup';
const PAYLOAD_ELEMENT_ID = 'payload';
const PAYLOAD_META_ID = 'payload-meta';
const DOWNLOAD_BUTTON_ID = 'download';

const TOOL_BUTTONS = [
  { id: 'tool-text', mode: 'text' },
  { id: 'tool-dom', mode: 'dom' }
];

const state = {
  mode: 'text',
  textAnnotations: [],
  domAnnotations: []
};

function requireElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(
      `text-annotator spike: required DOM element #${id} is missing from index.html.`
    );
  }
  return el;
}

function ensureIframeLoaded(iframe) {
  return new Promise((resolve, reject) => {
    const onReady = () => {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) {
        reject(
          new Error(
            'text-annotator spike: iframe loaded but contentDocument.body is null. ' +
              'The fixture must be served same-origin so the annotator can ' +
              'access the inner DOM. Confirm Vite is serving /fixture/index.html.'
          )
        );
        return;
      }
      resolve(doc);
    };
    if (
      iframe.contentDocument &&
      iframe.contentDocument.readyState === 'complete' &&
      iframe.contentDocument.body
    ) {
      onReady();
      return;
    }
    iframe.addEventListener('load', onReady, { once: true });
    iframe.addEventListener(
      'error',
      () => {
        reject(
          new Error(
            `text-annotator spike: iframe fixture at src="${iframe.getAttribute('src')}" failed to load. ` +
              'Confirm fixture/index.html exists alongside index.html — the spike requires a real fixture, ' +
              'never a fallback or placeholder.'
          )
        );
      },
      { once: true }
    );
  });
}

function renderPayload() {
  const pre = requireElement(PAYLOAD_ELEMENT_ID);
  const meta = requireElement(PAYLOAD_META_ID);
  const all = [...state.textAnnotations, ...state.domAnnotations];
  pre.textContent = JSON.stringify(all, null, 2);
  meta.textContent =
    all.length === 0
      ? 'No annotations yet.'
      : `${all.length} annotation${all.length === 1 ? '' : 's'} ` +
        `(${state.textAnnotations.length} text-range · ${state.domAnnotations.length} DOM-region; W3C Web Annotation Data Model)`;
}

function downloadAnnotations() {
  const all = [...state.textAnnotations, ...state.domAnnotations];
  const blob = new Blob([JSON.stringify(all, null, 2)], {
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

function wireToolbar(iframeDoc) {
  const buttons = TOOL_BUTTONS.map((entry) => ({
    button: requireElement(entry.id),
    mode: entry.mode
  }));
  buttons.forEach(({ button, mode }) => {
    button.addEventListener('click', () => {
      state.mode = mode;
      buttons.forEach(({ button: other, mode: otherMode }) => {
        other.setAttribute('aria-pressed', String(otherMode === mode));
      });
      // Toggle the iframe annotator's annotating-enabled flag if available.
      if (window.__spikeIframe?.anno?.setAnnotatingEnabled) {
        window.__spikeIframe.anno.setAnnotatingEnabled(mode === 'text');
      }
      iframeDoc.body.style.cursor = mode === 'dom' ? 'crosshair' : '';
    });
  });
  requireElement('tool-clear').addEventListener('click', () => {
    if (window.__spikeIframe?.anno) {
      window.__spikeIframe.anno.clearAnnotations();
    }
    state.textAnnotations = [];
    state.domAnnotations = [];
    renderPayload();
  });
}

function wireDomPinning(iframeDoc) {
  iframeDoc.addEventListener(
    'click',
    (evt) => {
      if (state.mode !== 'dom') return;
      const el = evt.target;
      if (!el || el === iframeDoc.body || el === iframeDoc.documentElement) {
        return;
      }
      evt.preventDefault();
      evt.stopPropagation();
      const ann = buildDomAnnotation(el, FIXTURE_SOURCE_URI);
      state.domAnnotations.push(ann);
      renderPayload();
    },
    true
  );
}

async function waitForIframeAnnotator(timeoutMs = 5000) {
  const start = Date.now();
  while (!window.__spikeIframe?.anno) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        'text-annotator spike: iframe-side annotator did not initialize within ' +
          `${timeoutMs}ms. Confirm /src/iframe-annotator.js was loaded inside the iframe ` +
          'and Vite resolved @recogito/text-annotator for that module too.'
      );
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function main() {
  const iframe = requireElement(FIXTURE_IFRAME_ID);
  const iframeDoc = await ensureIframeLoaded(iframe);

  // Expose the host-side callback BEFORE the iframe-side annotator boots.
  window.__spike = window.__spike ?? {};
  window.__spike.iframeDoc = iframeDoc;
  window.__spike.state = state;
  window.__spike.resolveDomAnnotation = (ann) =>
    resolveDomAnnotation(iframeDoc, ann);
  window.__spike.buildDomAnnotation = (el) =>
    buildDomAnnotation(el, FIXTURE_SOURCE_URI);
  window.__spike.onIframeTextAnnotationsChanged = (annotations) => {
    state.textAnnotations = Array.isArray(annotations) ? annotations : [];
    renderPayload();
  };

  await waitForIframeAnnotator();

  wireToolbar(iframeDoc);
  wireDomPinning(iframeDoc);

  requireElement(DOWNLOAD_BUTTON_ID).addEventListener(
    'click',
    downloadAnnotations
  );

  renderPayload();
}

main().catch((err) => {
  console.error(err);
  const banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.style.cssText =
    'background:#7a1f1f;color:#fff;padding:1rem;font-family:Georgia,serif;';
  banner.textContent = `Spike failed to initialise: ${err.message}`;
  document.body.prepend(banner);
});
