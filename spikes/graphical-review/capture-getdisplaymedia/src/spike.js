// Phase 1 Task 1.4.1 — getDisplayMedia() single-frame capture spike.
//
// Wires the Screen Capture API to a one-shot frame grab: request a
// MediaStream, draw the first video frame into a <canvas>, immediately
// stop the stream tracks, render the frame, expose a PNG download.
//
// Spike constraints (per Architecture A):
//  - No fallbacks outside test code: if getDisplayMedia is unsupported
//    or the user denies, surface the error visibly. Do NOT polyfill with
//    a synthetic image.
//  - No uploads. The captured PNG stays in-memory; the download path uses
//    an in-process Blob URL the operator can save to disk.

const STATUS_ID = 'status';
const CAPTURE_BTN_ID = 'capture-btn';
const DOWNLOAD_BTN_ID = 'download-btn';
const CLEAR_BTN_ID = 'clear-btn';
const PREVIEW_CANVAS_ID = 'preview-canvas';
const META_ID = 'capture-meta';

const STATE = {
  capturedDataUrl: null,
  capturedWidth: 0,
  capturedHeight: 0,
  // Records WHICH code path actually ran when capture was attempted.
  // Values: 'unsupported' | 'rejected' | 'captured' | 'idle'.
  lastPath: 'idle'
};

function requireElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(
      `getDisplayMedia spike: required DOM element #${id} is missing from index.html.`
    );
  }
  return el;
}

function setStatus(message, isError = false) {
  const el = requireElement(STATUS_ID);
  el.textContent = message;
  el.classList.toggle('error', isError);
}

function setMeta(width, height) {
  const el = requireElement(META_ID);
  if (width === 0 || height === 0) {
    el.textContent = 'Dimensions: not captured yet.';
  } else {
    el.textContent = `Dimensions: ${width}×${height}px · format: PNG`;
  }
}

function isApiAvailable() {
  return (
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices !== undefined &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  );
}

async function captureOneFrame(stream) {
  // Render the first video frame to a canvas via an offscreen <video>.
  // Returns { canvas, width, height }. Stops the stream tracks before
  // returning so the browser's "is being shared" indicator clears.
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  try {
    await video.play();
    // One-frame wait. requestVideoFrameCallback is the modern path; fall
    // through to a raf if unavailable (Firefox / older Safari).
    await new Promise((resolve) => {
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => resolve());
      } else {
        requestAnimationFrame(() => resolve());
      }
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) {
      throw new Error(
        'Captured stream reported zero dimensions. The browser may have refused the capture or the source has no video track.'
      );
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to obtain 2D context on the offscreen canvas.');
    }
    ctx.drawImage(video, 0, 0, width, height);
    return { canvas, width, height };
  } finally {
    // ALWAYS stop tracks — keeps the browser's screen-share indicator
    // off after the snapshot.
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}

function renderToPreview(canvas) {
  const preview = requireElement(PREVIEW_CANVAS_ID);
  preview.width = canvas.width;
  preview.height = canvas.height;
  const ctx = preview.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to obtain 2D context on the preview canvas.');
  }
  ctx.drawImage(canvas, 0, 0);
}

function exportPng(canvas) {
  return canvas.toDataURL('image/png');
}

function downloadFromDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function onCaptureClick() {
  if (!isApiAvailable()) {
    STATE.lastPath = 'unsupported';
    setStatus(
      'getDisplayMedia is not available in this browser. The spike requires a Chromium / Firefox / Safari desktop browser served over HTTPS or http://localhost.',
      true
    );
    return;
  }
  setStatus('Requesting screen capture — choose a tab, window, or screen in the OS prompt…');
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });
    const { canvas, width, height } = await captureOneFrame(stream);
    renderToPreview(canvas);
    STATE.capturedDataUrl = exportPng(canvas);
    STATE.capturedWidth = width;
    STATE.capturedHeight = height;
    STATE.lastPath = 'captured';
    requireElement(DOWNLOAD_BTN_ID).disabled = false;
    requireElement(CLEAR_BTN_ID).disabled = false;
    setStatus(`Captured ${width}×${height}px frame. PNG ready to download.`);
    setMeta(width, height);
  } catch (err) {
    STATE.lastPath = 'rejected';
    // NotAllowedError: user denied the OS prompt.
    // NotFoundError: no capture source available (rare; headless).
    // AbortError: programmatic abort during selection.
    setStatus(`Capture failed: ${err && err.name ? err.name + ': ' : ''}${err && err.message ? err.message : err}`, true);
  }
}

function onDownloadClick() {
  if (!STATE.capturedDataUrl) {
    setStatus('No capture to download. Click "Capture screen" first.', true);
    return;
  }
  const filename = `capture-${STATE.capturedWidth}x${STATE.capturedHeight}.png`;
  downloadFromDataUrl(STATE.capturedDataUrl, filename);
}

function onClearClick() {
  STATE.capturedDataUrl = null;
  STATE.capturedWidth = 0;
  STATE.capturedHeight = 0;
  const preview = requireElement(PREVIEW_CANVAS_ID);
  const ctx = preview.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, preview.width, preview.height);
  requireElement(DOWNLOAD_BTN_ID).disabled = true;
  requireElement(CLEAR_BTN_ID).disabled = true;
  setStatus('Cleared. Ready for another capture.');
  setMeta(0, 0);
}

function main() {
  // Probe-introspectable state — captures path-taken assertions per the
  // ui-verification.md "explicit path-taken assertions" rule.
  window.__spike = {
    state: STATE,
    isApiAvailable: isApiAvailable(),
    // Surface for the probe to call without user activation.
    triggerCapture: onCaptureClick
  };
  requireElement(CAPTURE_BTN_ID).addEventListener('click', onCaptureClick);
  requireElement(DOWNLOAD_BTN_ID).addEventListener('click', onDownloadClick);
  requireElement(CLEAR_BTN_ID).addEventListener('click', onClearClick);
  if (!isApiAvailable()) {
    setStatus(
      'getDisplayMedia is not available in this browser context. The Capture button will error when clicked.',
      true
    );
  } else {
    setStatus('Ready. Click "Capture screen" to start.');
  }
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
