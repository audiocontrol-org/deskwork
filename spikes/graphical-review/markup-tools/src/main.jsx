// Phase 1 Task 1.4.3 — Excalidraw markup-tools spike entry.
//
// Mounts Excalidraw via React into #markup-mount, wires the Save and
// Reset buttons to imperatively interact with the Excalidraw API,
// records the path-taken state machine + last export bytes for the
// Playwright probe.
//
// Spike constraints (per Architecture A):
//  - No fallbacks outside test code: if Excalidraw fails to mount,
//    surface the error visibly. Do NOT swap in a hand-rolled canvas.
//  - No uploads. The composed PNG stays in-memory; download via Blob URL.

import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

const FIXTURE_URL = '/fixture.svg';
const FIXTURE_WIDTH = 600;
const FIXTURE_HEIGHT = 400;
const STATUS_ID = 'status';
const EXPORT_BTN_ID = 'export-btn';
const RESET_BTN_ID = 'reset-btn';
const EXPORT_PREVIEW_ID = 'export-preview';

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

async function loadFixtureAsBinaryFile(api) {
  // Excalidraw represents images as binary 'files' on the scene; the
  // image element references the file by id. We fetch the fixture SVG,
  // convert to a data URL, and add it via the public addFiles + scene
  // update path.
  const response = await fetch(FIXTURE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch fixture from ${FIXTURE_URL}: HTTP ${response.status}.`
    );
  }
  const svgText = await response.text();
  const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`;
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

function buildImageElement(fileId, x, y, width, height) {
  // Excalidraw element shape (minimal). The library fills in defaults
  // for missing fields; we provide the load-bearing ones.
  return {
    id: `el-${Math.random().toString(36).slice(2)}`,
    type: 'image',
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 100000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 100000),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: true,
    fileId,
    scale: [1, 1],
    status: 'saved'
  };
}

function buildBoxAnnotation(x, y, width, height) {
  return {
    id: `el-${Math.random().toString(36).slice(2)}`,
    type: 'rectangle',
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: '#e03131',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    // Wider stroke + clean (non-rough) lines so the box is easy to pixel-
    // sample in the exported PNG. A roughness-1 stroke creates hand-drawn
    // squiggles whose positions depend on `seed` — fine for adopters, but
    // makes the probe's pixel-fidelity assertion flaky.
    strokeWidth: 4,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false
  };
}

function App() {
  const apiRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    setStatus('Markup editor mounted. Add the fixture image…');
    STATE.lastPath = 'mounted';
  }, [mounted]);

  // Probe-introspectable handle exposed once the API is available.
  useEffect(() => {
    window.__spike = {
      state: STATE,
      getApi: () => apiRef.current,
      // Imperative helpers the probe drives.
      addFixtureImage,
      addBoxAnnotation,
      exportScene,
      resetScene,
      // Reports the list of tools Excalidraw's UI exposes (queried from
      // the rendered DOM, so this is verifiable evidence not a claim).
      readToolPalette
    };
  }, [mounted]);

  function refreshSceneState() {
    const api = apiRef.current;
    if (!api) return;
    const els = api.getSceneElementsIncludingDeleted();
    STATE.sceneElementCount = els.filter((e) => !e.isDeleted).length;
  }

  async function addFixtureImage() {
    const api = apiRef.current;
    if (!api) throw new Error('Excalidraw API not yet available.');
    try {
      const { fileId } = await loadFixtureAsBinaryFile(api);
      // Place the fixture at scene origin.
      const imageEl = buildImageElement(fileId, 100, 80, FIXTURE_WIDTH, FIXTURE_HEIGHT);
      const current = api.getSceneElementsIncludingDeleted();
      api.updateScene({
        elements: [...current, imageEl]
      });
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

  function addBoxAnnotation(x, y, w, h) {
    const api = apiRef.current;
    if (!api) throw new Error('Excalidraw API not yet available.');
    const box = buildBoxAnnotation(x, y, w, h);
    const current = api.getSceneElementsIncludingDeleted();
    api.updateScene({ elements: [...current, box] });
    STATE.lastPath = 'shape-added';
    refreshSceneState();
    setStatus(`Added box annotation at (${x},${y},${w},${h}).`);
    return box.id;
  }

  async function exportScene() {
    const api = apiRef.current;
    if (!api) throw new Error('Excalidraw API not yet available.');
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
      // Read into data URL for probe inspection.
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('FileReader failed on exported blob.'));
        reader.readAsDataURL(blob);
      });
      STATE.lastExportDataUrl = typeof dataUrl === 'string' ? dataUrl : null;
      // Read natural dimensions.
      const dims = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error('Image() load failed on exported data URL.'));
        img.src = dataUrl;
      });
      STATE.lastExportNaturalWidth = dims.w;
      STATE.lastExportNaturalHeight = dims.h;
      STATE.lastPath = 'exported';
      // Render preview.
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

  function resetScene() {
    const api = apiRef.current;
    if (!api) throw new Error('Excalidraw API not yet available.');
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

  function readToolPalette() {
    // Excalidraw renders its toolbar buttons with data-testid attrs.
    // We enumerate them rather than asserting a specific count — the
    // probe records whatever is present and the findings doc reports it.
    const buttons = Array.from(document.querySelectorAll('[data-testid^="toolbar-"]'));
    return buttons.map((b) => ({
      testid: b.getAttribute('data-testid'),
      title: b.getAttribute('title') ?? null,
      ariaLabel: b.getAttribute('aria-label') ?? null
    }));
  }

  return React.createElement(Excalidraw, {
    excalidrawAPI: (api) => {
      apiRef.current = api;
      setMounted(true);
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

function main() {
  const mount = document.getElementById('markup-mount');
  if (!mount) {
    throw new Error('Markup spike: #markup-mount is missing from index.html.');
  }
  const root = createRoot(mount);
  root.render(React.createElement(App));

  // Wire the top-level toolbar buttons to spike helpers.
  const exportBtn = document.getElementById(EXPORT_BTN_ID);
  const resetBtn = document.getElementById(RESET_BTN_ID);
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      if (!window.__spike || typeof window.__spike.exportScene !== 'function') {
        setStatus('Editor not ready yet.', true);
        return;
      }
      try {
        await window.__spike.exportScene();
      } catch (e) {
        // Status already updated.
      }
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!window.__spike || typeof window.__spike.resetScene !== 'function') return;
      window.__spike.resetScene();
    });
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
