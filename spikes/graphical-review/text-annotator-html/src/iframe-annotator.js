// Iframe-context script.
//
// @recogito/text-annotator attaches its selection listeners to `document` —
// the document of the JS realm where the library code runs. To annotate
// iframe content, we run the library inside the iframe's own JS realm so
// the document references match. The annotator is exposed to the host
// page via `window.parent.__spikeIframe` for the spike to inspect.
//
// Same-origin (Vite serves both host + fixture) so cross-frame access is
// allowed; postMessage is unnecessary.

import {
  createTextAnnotator,
  W3CTextFormat
} from '@recogito/text-annotator';
import '@recogito/text-annotator/text-annotator.css';

const SOURCE = 'urn:deskwork-spike:fixture-html-mockup';

const anno = createTextAnnotator(document.body, {
  adapter: W3CTextFormat(SOURCE, document.body),
  annotatingEnabled: true
});

const state = { annotations: [] };

function refresh() {
  state.annotations = anno.getAnnotations();
  if (window.parent && window.parent.__spike) {
    window.parent.__spike.onIframeTextAnnotationsChanged(state.annotations);
  }
}

anno.on('createAnnotation', refresh);
anno.on('updateAnnotation', refresh);
anno.on('deleteAnnotation', refresh);

// Expose for browser-console + Playwright handle from the host.
window.__spikeIframe = { anno, state, refresh };
// Also expose to parent.
if (window.parent && window.parent !== window) {
  window.parent.__spikeIframe = window.__spikeIframe;
}
