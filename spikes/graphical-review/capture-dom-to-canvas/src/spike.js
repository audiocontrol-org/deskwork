// Phase 1 Task 1.4.2 — html-to-image DOM-to-PNG capture spike.
//
// Renders the fidelity-stress fixture to a PNG via html-to-image,
// surfaces it in the preview pane, allows downloading.
//
// Spike constraints (per Architecture A):
//  - No fallbacks outside test code: if html-to-image throws or returns
//    an empty data URL, surface the error visibly. Do NOT synthesize a
//    placeholder image.
//  - No uploads. The captured PNG stays in-memory; download via Blob URL.

import { toPng } from 'html-to-image';

const STATUS_ID = 'status';
const META_ID = 'capture-meta';
const CAPTURE_BTN_ID = 'capture-btn';
const DOWNLOAD_BTN_ID = 'download-btn';
const CLEAR_BTN_ID = 'clear-btn';
const PREVIEW_CONTAINER_ID = 'preview-container';
const TARGET_ID = 'capture-target';

const STATE = {
  capturedDataUrl: null,
  capturedNaturalWidth: 0,
  capturedNaturalHeight: 0,
  capturedRenderedWidth: 0,
  capturedRenderedHeight: 0,
  // Path-taken enum for probe introspection.
  // Values: 'idle' | 'captured' | 'error'.
  lastPath: 'idle',
  lastError: null,
  // Per-feature fidelity check results, populated when a capture
  // succeeds. The probe asserts each clause from the findings doc.
  fidelity: null
};

function requireElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(
      `DOM-to-canvas spike: required DOM element #${id} is missing from index.html.`
    );
  }
  return el;
}

function setStatus(message, isError = false) {
  const el = requireElement(STATUS_ID);
  el.textContent = message;
  el.classList.toggle('error', isError);
}

function setMeta(text) {
  requireElement(META_ID).textContent = text;
}

function clearPreview() {
  const container = requireElement(PREVIEW_CONTAINER_ID);
  container.innerHTML = '<p class="placeholder">No capture yet — click the button.</p>';
}

function renderPreview(dataUrl, naturalWidth, naturalHeight) {
  const container = requireElement(PREVIEW_CONTAINER_ID);
  container.innerHTML = '';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = `Captured fixture frame, ${naturalWidth}x${naturalHeight}px`;
  img.id = 'preview-image';
  img.width = naturalWidth;
  img.height = naturalHeight;
  container.appendChild(img);
}

function recordFidelity(target) {
  // Snapshot the LIVE rendered state of the fixture's known-tricky
  // sub-elements. The probe compares these recordings against the
  // captured PNG's effective rendering. Recording happens just before
  // capture so the comparison is honest.
  const computedFont = (el) => {
    const cs = window.getComputedStyle(el);
    return cs.fontFamily;
  };
  const titleEl = target.querySelector('.fx-title');
  const cardEl = target.querySelector('.fx-card--published');
  const cardBefore = cardEl ? window.getComputedStyle(cardEl, '::before') : null;
  const cardAfter = cardEl ? window.getComputedStyle(cardEl, '::after') : null;
  const dividerEl = target.querySelector('.fx-divider');
  const dividerAfter = dividerEl ? window.getComputedStyle(dividerEl, '::after') : null;
  const asideEl = target.querySelector('.fx-aside p');
  const svgEl = target.querySelector('.fx-icon svg');
  const targetRect = target.getBoundingClientRect();
  return {
    target: {
      width: Math.round(targetRect.width),
      height: Math.round(targetRect.height)
    },
    title: {
      fontFamily: titleEl ? computedFont(titleEl) : null,
      // 'LoraTest' is declared but the URL 404s, so the actual font
      // RESOLVED by the browser is the fallback (Georgia, serif). The
      // computed-style still reports 'LoraTest' as first-in-stack —
      // there is no W3C API to read which font BoxFont selected on the
      // glyph level. The probe records first-in-stack for diff.
      text: titleEl ? titleEl.textContent.trim() : null
    },
    cardPseudo: {
      beforeContent: cardBefore ? cardBefore.getPropertyValue('content') : null,
      beforeBackground: cardBefore ? cardBefore.getPropertyValue('background-color') : null,
      afterContent: cardAfter ? cardAfter.getPropertyValue('content') : null,
      afterColor: cardAfter ? cardAfter.getPropertyValue('color') : null
    },
    dividerPseudo: {
      afterContent: dividerAfter ? dividerAfter.getPropertyValue('content') : null
    },
    aside: {
      text: asideEl ? asideEl.textContent.replace(/\s+/g, ' ').trim() : null,
      // Approximate line count from rendered height / line-height.
      heightPx: asideEl ? Math.round(asideEl.getBoundingClientRect().height) : null
    },
    svg: {
      present: Boolean(svgEl),
      viewBox: svgEl ? svgEl.getAttribute('viewBox') : null
    }
  };
}

async function captureFixture() {
  const target = requireElement(TARGET_ID);
  STATE.fidelity = recordFidelity(target);
  setStatus('Capturing… (html-to-image is cloning DOM into SVG foreignObject)');
  const dataUrl = await toPng(target, {
    // The fixture's CSS lives at the document level. html-to-image's
    // default behaviour inlines computed styles per element AND inlines
    // @font-face rules via font-embed-css. We do NOT customise here —
    // measuring the out-of-the-box adopter experience is the point.
    cacheBust: true,
    pixelRatio: 1
  });
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error(
      `html-to-image returned a non-PNG-data-URL result: ${
        typeof dataUrl === 'string' ? dataUrl.slice(0, 64) : typeof dataUrl
      }`
    );
  }
  // Load the data URL into an Image to read the natural dimensions.
  const naturalDims = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    img.onerror = () => reject(new Error('Captured PNG failed to load into an Image element.'));
    img.src = dataUrl;
  });
  const targetRect = target.getBoundingClientRect();
  return {
    dataUrl,
    naturalWidth: naturalDims.naturalWidth,
    naturalHeight: naturalDims.naturalHeight,
    renderedWidth: Math.round(targetRect.width),
    renderedHeight: Math.round(targetRect.height)
  };
}

async function onCaptureClick() {
  requireElement(CAPTURE_BTN_ID).disabled = true;
  try {
    const result = await captureFixture();
    STATE.capturedDataUrl = result.dataUrl;
    STATE.capturedNaturalWidth = result.naturalWidth;
    STATE.capturedNaturalHeight = result.naturalHeight;
    STATE.capturedRenderedWidth = result.renderedWidth;
    STATE.capturedRenderedHeight = result.renderedHeight;
    STATE.lastPath = 'captured';
    STATE.lastError = null;
    renderPreview(result.dataUrl, result.naturalWidth, result.naturalHeight);
    requireElement(DOWNLOAD_BTN_ID).disabled = false;
    requireElement(CLEAR_BTN_ID).disabled = false;
    setStatus(
      `Captured fixture: rendered ${result.renderedWidth}x${result.renderedHeight}px, ` +
        `PNG natural dimensions ${result.naturalWidth}x${result.naturalHeight}px.`
    );
    setMeta(
      `Rendered: ${result.renderedWidth}x${result.renderedHeight}px · ` +
        `PNG: ${result.naturalWidth}x${result.naturalHeight}px`
    );
  } catch (err) {
    STATE.lastPath = 'error';
    STATE.lastError = err && err.message ? err.message : String(err);
    setStatus(`Capture failed: ${STATE.lastError}`, true);
  } finally {
    requireElement(CAPTURE_BTN_ID).disabled = false;
  }
}

function downloadFromDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function onDownloadClick() {
  if (!STATE.capturedDataUrl) {
    setStatus('No capture to download. Click "Capture rendered fixture" first.', true);
    return;
  }
  const filename = `fixture-capture-${STATE.capturedNaturalWidth}x${STATE.capturedNaturalHeight}.png`;
  downloadFromDataUrl(STATE.capturedDataUrl, filename);
}

function onClearClick() {
  STATE.capturedDataUrl = null;
  STATE.capturedNaturalWidth = 0;
  STATE.capturedNaturalHeight = 0;
  STATE.capturedRenderedWidth = 0;
  STATE.capturedRenderedHeight = 0;
  STATE.lastPath = 'idle';
  STATE.fidelity = null;
  clearPreview();
  requireElement(DOWNLOAD_BTN_ID).disabled = true;
  requireElement(CLEAR_BTN_ID).disabled = true;
  setStatus('Cleared. Ready for another capture.');
  setMeta('Dimensions: not captured yet.');
}

function main() {
  window.__spike = {
    state: STATE,
    triggerCapture: onCaptureClick
  };
  requireElement(CAPTURE_BTN_ID).addEventListener('click', onCaptureClick);
  requireElement(DOWNLOAD_BTN_ID).addEventListener('click', onDownloadClick);
  requireElement(CLEAR_BTN_ID).addEventListener('click', onClearClick);
}

try {
  main();
} catch (err) {
  console.error(err);
  const banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.style.cssText = 'background:#7a1f1f;color:#fff;padding:1rem;font-family:Georgia,serif;';
  banner.textContent = `Spike failed to initialise: ${err.message}`;
  document.body.prepend(banner);
}
