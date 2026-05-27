// Phase 1 Task 1.4.3 — Excalidraw markup-tools spike entry.
//
// Mounts Excalidraw via React into #markup-mount, wires the Add fixture,
// Save, and Reset buttons to imperatively interact with the Excalidraw
// API, records the path-taken state machine + last export bytes for the
// Playwright probe.
//
// Spike constraints (per Architecture A):
//  - No fallbacks outside test code: if Excalidraw fails to mount,
//    surface the error visibly. Do NOT swap in a hand-rolled canvas.
//  - No uploads. The composed PNG stays in-memory; download via Blob URL.
//
// Element creation routes through Excalidraw's `convertToExcalidrawElements`
// helper so the library owns its internal element invariants (versionNonce,
// seed, roundness, boundElements, ...). The spike supplies only the
// load-bearing skeleton fields per the published API.

import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Excalidraw,
  convertToExcalidrawElements,
  exportToBlob
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

const FIXTURE_URL = '/fixture.svg';
const FIXTURE_WIDTH = 600;
const FIXTURE_HEIGHT = 400;
const STATUS_ID = 'status';
const FIXTURE_BTN_ID = 'fixture-btn';
const EXPORT_BTN_ID = 'export-btn';
const RESET_BTN_ID = 'reset-btn';
const EXPORT_PREVIEW_ID = 'export-preview';

// Module-level handle to the Excalidraw imperative API. Set once when the
// React component receives the api callback. All helpers below read this
// rather than closing over a useRef — keeps the helpers as pure module
// functions instead of per-render closures.
let apiInstance = null;

const STATE = {
  // 'idle' | 'mounted' | 'fixture-loaded' | 'shape-added' | 'exported' | 'error'
  lastPath: 'idle',
  lastError: null,
  // Number of elements in the scene after the last refresh.
  sceneElementCount: 0,
  // Bytes of the last exported PNG (Blob byteLength).
  lastExportByteLength: 0,
  // Data URL of the last exported PNG (for probe inspection).
  lastExportDataUrl: null,
  // Width/height of the last exported PNG (read via Image()).
  lastExportNaturalWidth: 0,
  lastExportNaturalHeight: 0
};

function setStatus(message, isError = false) {
  const el = document.getElementById(STATUS_ID);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', isError);
}

function requireApi() {
  if (!apiInstance) {
    throw new Error(
      'Excalidraw API not yet available. Wait for the mount to complete before invoking spike helpers.'
    );
  }
  return apiInstance;
}

function refreshSceneState() {
  if (!apiInstance) return;
  const els = apiInstance.getSceneElementsIncludingDeleted();
  STATE.sceneElementCount = els.filter((e) => !e.isDeleted).length;
}

// Convert an SVG string to a base64 data URL safely for Unicode content.
// btoa() throws on non-Latin1; TextEncoder + chunked String.fromCharCode
// preserves any Unicode the fixture may carry. The fixture itself is
// ASCII today but the pattern shouldn't be brittle to future edits.
function svgToDataUrl(svgText) {
  const bytes = new TextEncoder().encode(svgText);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

async function loadFixtureAsBinaryFile() {
  // Excalidraw represents images as binary 'files' on the scene; the
  // image element references the file by id. We fetch the fixture SVG,
  // convert to a data URL, and add it via the public addFiles + scene
  // update path.
  const api = requireApi();
  const response = await fetch(FIXTURE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch fixture from ${FIXTURE_URL}: HTTP ${response.status}.`
    );
  }
  const svgText = await response.text();
  const dataUrl = svgToDataUrl(svgText);
  const fileId = `fixture-${Date.now()}`;
  api.addFiles([
    {
      id: fileId,
      mimeType: 'image/svg+xml',
      dataURL: dataUrl,
      created: Date.now()
    }
  ]);
  return { fileId, dataUrl };
}

export async function addFixtureImage() {
  const api = requireApi();
  try {
    const { fileId } = await loadFixtureAsBinaryFile();
    // Hand the library a skeleton; convertToExcalidrawElements populates
    // every internal field (versionNonce, seed, roundness, ...) at the
    // library's own version-stable boundary.
    const [imageEl] = convertToExcalidrawElements([
      {
        type: 'image',
        x: 100,
        y: 80,
        width: FIXTURE_WIDTH,
        height: FIXTURE_HEIGHT,
        fileId,
        locked: true
      }
    ]);
    const current = api.getSceneElementsIncludingDeleted();
    api.updateScene({ elements: [...current, imageEl] });
    api.scrollToContent(imageEl, { fitToContent: true });
    STATE.lastPath = 'fixture-loaded';
    refreshSceneState();
    setStatus('Fixture loaded. Use the Excalidraw toolbar to draw arrows/boxes/etc.');
    return imageEl.id;
  } catch (err) {
    STATE.lastPath = 'error';
    STATE.lastError = err && err.message ? err.message : String(err);
    setStatus(`Failed to load fixture: ${STATE.lastError}`, true);
    throw err;
  }
}

export function addBoxAnnotation(x, y, width, height) {
  const api = requireApi();
  // Skeleton for a rectangle annotation. Wider stroke + roughness 0 so
  // the box is easy to pixel-sample in the exported PNG (roughness 1
  // produces seed-dependent hand-drawn squiggles).
  const [box] = convertToExcalidrawElements([
    {
      type: 'rectangle',
      x,
      y,
      width,
      height,
      strokeColor: '#e03131',
      backgroundColor: 'transparent',
      strokeWidth: 4,
      roughness: 0
    }
  ]);
  const current = api.getSceneElementsIncludingDeleted();
  api.updateScene({ elements: [...current, box] });
  STATE.lastPath = 'shape-added';
  refreshSceneState();
  setStatus(`Added box annotation at (${x},${y},${width},${height}).`);
  return box.id;
}

export async function exportScene() {
  const api = requireApi();
  try {
    const els = api.getSceneElementsIncludingDeleted().filter((e) => !e.isDeleted);
    const files = api.getFiles();
    const blob = await exportToBlob({
      elements: els,
      files,
      mimeType: 'image/png',
      appState: { exportBackground: true, viewBackgroundColor: '#ffffff' }
    });
    STATE.lastExportByteLength = blob.size;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader failed on exported blob.'));
      reader.readAsDataURL(blob);
    });
    STATE.lastExportDataUrl = typeof dataUrl === 'string' ? dataUrl : null;
    const dims = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error('Image() load failed on exported data URL.'));
      img.src = dataUrl;
    });
    STATE.lastExportNaturalWidth = dims.w;
    STATE.lastExportNaturalHeight = dims.h;
    STATE.lastPath = 'exported';
    const previewContainer = document.getElementById(EXPORT_PREVIEW_ID);
    if (previewContainer) {
      previewContainer.innerHTML = '';
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = `Exported markup, ${dims.w}x${dims.h}`;
      img.id = 'export-preview-img';
      previewContainer.appendChild(img);
    }
    setStatus(`Exported PNG: ${dims.w}x${dims.h}px, ${blob.size} bytes.`);
    return { byteLength: blob.size, width: dims.w, height: dims.h, dataUrl };
  } catch (err) {
    STATE.lastPath = 'error';
    STATE.lastError = err && err.message ? err.message : String(err);
    setStatus(`Export failed: ${STATE.lastError}`, true);
    throw err;
  }
}

export function resetScene() {
  const api = requireApi();
  api.resetScene();
  STATE.lastPath = 'mounted';
  STATE.sceneElementCount = 0;
  STATE.lastExportDataUrl = null;
  STATE.lastExportByteLength = 0;
  const previewContainer = document.getElementById(EXPORT_PREVIEW_ID);
  if (previewContainer) {
    previewContainer.innerHTML = '<p class="placeholder">No export yet.</p>';
  }
  setStatus('Scene reset.');
}

// Excalidraw renders its toolbar buttons with data-testid attrs. We
// enumerate them rather than asserting a specific count — the probe
// records whatever is present and the findings doc reports it.
export function readToolPalette() {
  const buttons = Array.from(document.querySelectorAll('[data-testid^="toolbar-"]'));
  return buttons.map((b) => ({
    testid: b.getAttribute('data-testid'),
    title: b.getAttribute('title') ?? null,
    ariaLabel: b.getAttribute('aria-label') ?? null
  }));
}

function App() {
  useEffect(() => {
    setStatus('Markup editor mounted. Click "Add fixture image" to load it into the scene.');
    STATE.lastPath = 'mounted';
  }, []);

  return React.createElement(Excalidraw, {
    excalidrawAPI: (api) => {
      apiInstance = api;
    },
    initialData: {
      appState: {
        viewBackgroundColor: '#f6f1e8',
        gridSize: null
      },
      scrollToContent: true
    }
  });
}

function wireButton(id, handler) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      await handler();
    } catch (e) {
      // Status already updated inside helper.
    }
  });
}

function main() {
  const mount = document.getElementById('markup-mount');
  if (!mount) {
    throw new Error('Markup spike: #markup-mount is missing from index.html.');
  }
  const root = createRoot(mount);
  root.render(React.createElement(App));

  // Probe-introspectable handle. Exposed once before mounting so the
  // probe can wait on `window.__spike` and then on `apiInstance` via
  // `getApi()`.
  window.__spike = {
    state: STATE,
    getApi: () => apiInstance,
    addFixtureImage,
    addBoxAnnotation,
    exportScene,
    resetScene,
    readToolPalette
  };

  // Wire the top-level toolbar buttons to the spike helpers. addFixture
  // mirrors the carry-over pattern from the other two Task 1.4 spikes
  // (every operator-visible action is reachable from a UI button; no
  // dev-console-only flows).
  wireButton(FIXTURE_BTN_ID, addFixtureImage);
  wireButton(EXPORT_BTN_ID, exportScene);
  wireButton(RESET_BTN_ID, resetScene);
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
