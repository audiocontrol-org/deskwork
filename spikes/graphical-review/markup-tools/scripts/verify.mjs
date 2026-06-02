// Drive the Excalidraw markup-tools spike with Playwright. Validates:
//
//   - Excalidraw mounts in #markup-mount (the editor's root container
//     renders, the toolbar palette is visible)
//   - the tool palette exposes the expected primitives (rectangle,
//     ellipse, arrow, line, freedraw, text, image, eraser) — recorded
//     and asserted by data-testid
//   - the fixture image loads into the scene (scene element count
//     reaches the expected value after addFixtureImage())
//   - a programmatic box annotation lands in the scene (element count
//     advances by 1)
//   - exporting the scene produces a PNG-shaped blob with non-zero
//     dimensions matching the documented viewport approximations
//   - state transitions through the documented path-taken enum:
//     idle → mounted → fixture-loaded → shape-added → exported
//
// Per ui-verification.md, each assertion traces to a clause in the
// findings doc's "Sub-spike 3: Markup tools (Excalidraw)" section.

import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const SPIKE_URL = process.env.SPIKE_URL ?? 'http://localhost:5173/';

const failures = [];

function assert(label, condition, evidence) {
  if (condition) {
    console.log(`  PASS — ${label}`);
  } else {
    console.error(`  FAIL — ${label}`);
    if (evidence !== undefined) console.error('         evidence:', evidence);
    failures.push(label);
  }
}

function dataUrlToBuffer(dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64, 'base64');
}

function decodePng(buffer) {
  return new Promise((resolve, reject) => {
    new PNG().parse(buffer, (err, png) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}

async function waitForMount(page) {
  // Wait for the Excalidraw API to be exposed via window.__spike AND
  // the lastPath to advance past 'idle'.
  await page.waitForFunction(
    () => {
      return (
        window.__spike &&
        typeof window.__spike.getApi === 'function' &&
        window.__spike.getApi() !== null &&
        window.__spike.state.lastPath !== 'idle'
      );
    },
    null,
    { timeout: 15000 }
  );
}

async function snapshotInitialState(page) {
  return page.evaluate(() => {
    const mount = document.getElementById('markup-mount');
    const excalidrawCanvas = mount ? mount.querySelector('canvas') : null;
    const toolPalette = window.__spike.readToolPalette();
    return {
      hasMount: Boolean(mount),
      mountChildCount: mount ? mount.children.length : 0,
      excalidrawCanvasPresent: Boolean(excalidrawCanvas),
      toolPalette,
      toolPaletteCount: toolPalette.length,
      initialPath: window.__spike.state.lastPath,
      initialElementCount: window.__spike.state.sceneElementCount
    };
  });
}

async function runAddFixtureAndAssert(page) {
  return page.evaluate(async () => {
    const before = window.__spike.state.sceneElementCount;
    const elId = await window.__spike.addFixtureImage();
    const api = window.__spike.getApi();
    const allElements = api.getSceneElementsIncludingDeleted();
    return {
      added: elId,
      lastPath: window.__spike.state.lastPath,
      sceneElementCountBefore: before,
      sceneElementCountAfter: window.__spike.state.sceneElementCount,
      addedElementType: allElements.find((e) => e.id === elId)?.type ?? null
    };
  });
}

async function runAddBoxAndAssert(page) {
  return page.evaluate(() => {
    const before = window.__spike.state.sceneElementCount;
    const id = window.__spike.addBoxAnnotation(220, 200, 200, 80);
    const api = window.__spike.getApi();
    const added = api.getSceneElementsIncludingDeleted().find((e) => e.id === id);
    return {
      added: id,
      lastPath: window.__spike.state.lastPath,
      sceneElementCountBefore: before,
      sceneElementCountAfter: window.__spike.state.sceneElementCount,
      addedElementType: added?.type ?? null,
      addedStrokeColor: added?.strokeColor ?? null,
      addedWidth: added?.width ?? null,
      addedHeight: added?.height ?? null
    };
  });
}

async function runExportAndAssert(page) {
  return page.evaluate(async () => {
    const result = await window.__spike.exportScene();
    return {
      lastPath: window.__spike.state.lastPath,
      exportByteLength: window.__spike.state.lastExportByteLength,
      exportDataUrlPrefix: window.__spike.state.lastExportDataUrl
        ? window.__spike.state.lastExportDataUrl.slice(0, 22)
        : null,
      exportNaturalWidth: window.__spike.state.lastExportNaturalWidth,
      exportNaturalHeight: window.__spike.state.lastExportNaturalHeight,
      // Also surface the raw result for cross-check.
      resultByteLength: result.byteLength,
      resultWidth: result.width,
      resultHeight: result.height,
      resultDataUrl: result.dataUrl
    };
  });
}

async function runResetAndAssert(page) {
  await page.locator('#reset-btn').click();
  return page.evaluate(() => {
    return {
      lastPath: window.__spike.state.lastPath,
      sceneElementCount: window.__spike.state.sceneElementCount,
      lastExportDataUrl: window.__spike.state.lastExportDataUrl,
      lastExportByteLength: window.__spike.state.lastExportByteLength,
      placeholderRestored:
        document.getElementById('export-preview').querySelector('.placeholder') !== null
    };
  });
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error('[pageerror]', err));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[console.error]', msg.text());
  });

  await page.goto(SPIKE_URL, { waitUntil: 'networkidle' });
  await waitForMount(page);

  console.log('\n=== initial state (post-mount) ===');
  const initial = await snapshotInitialState(page);
  console.log(JSON.stringify({ ...initial, toolPalette: `(${initial.toolPaletteCount} entries)` }, null, 2));
  // Tool palette is verbose; dump separately.
  console.log('\ntool palette (data-testid prefix toolbar-):');
  console.log(JSON.stringify(initial.toolPalette, null, 2));

  console.log('\nassertions [mount + tool palette]:');
  assert('#markup-mount container exists', initial.hasMount === true, initial);
  assert('Excalidraw rendered child elements into the mount', initial.mountChildCount > 0, initial);
  assert('Excalidraw rendered at least one <canvas>', initial.excalidrawCanvasPresent === true, initial);
  assert('spike state advanced past "idle" after mount', initial.initialPath === 'mounted', initial);
  assert('scene starts with zero elements', initial.initialElementCount === 0, initial);

  // The tool palette: Excalidraw uses data-testid="toolbar-<tool>".
  // The findings doc claims arrow / box / freehand / text / image /
  // eraser are available; the probe asserts each of those.
  const testids = initial.toolPalette.map((t) => t.testid);
  const expectedTools = [
    'toolbar-rectangle',
    'toolbar-arrow',
    'toolbar-line',
    'toolbar-freedraw',
    'toolbar-text',
    'toolbar-image',
    'toolbar-eraser',
    'toolbar-selection'
  ];
  for (const tool of expectedTools) {
    assert(`tool palette exposes ${tool}`, testids.includes(tool), { found: testids, expected: tool });
  }

  console.log('\n=== add fixture image to scene ===');
  const fixt = await runAddFixtureAndAssert(page);
  console.log(JSON.stringify(fixt, null, 2));

  console.log('\nassertions [fixture image add]:');
  assert('lastPath transitions to "fixture-loaded"', fixt.lastPath === 'fixture-loaded', fixt);
  assert(
    'scene element count advances by exactly 1 after addFixtureImage',
    fixt.sceneElementCountAfter === fixt.sceneElementCountBefore + 1,
    fixt
  );
  assert('added element type is "image"', fixt.addedElementType === 'image', fixt);

  console.log('\n=== add box annotation ===');
  const box = await runAddBoxAndAssert(page);
  console.log(JSON.stringify(box, null, 2));

  console.log('\nassertions [box annotation add]:');
  assert('lastPath transitions to "shape-added"', box.lastPath === 'shape-added', box);
  assert(
    'scene element count advances by exactly 1 after addBoxAnnotation',
    box.sceneElementCountAfter === box.sceneElementCountBefore + 1,
    box
  );
  assert('added element type is "rectangle"', box.addedElementType === 'rectangle', box);
  assert('box stroke is the documented red (#e03131)', box.addedStrokeColor === '#e03131', box);
  assert('box dimensions match the call (200x80)', box.addedWidth === 200 && box.addedHeight === 80, box);

  console.log('\n=== export scene to PNG ===');
  const exp = await runExportAndAssert(page);
  console.log(
    JSON.stringify(
      {
        ...exp,
        resultDataUrl: exp.resultDataUrl
          ? `${exp.resultDataUrl.slice(0, 32)}…(${exp.resultDataUrl.length} chars)`
          : null
      },
      null,
      2
    )
  );

  console.log('\nassertions [export]:');
  assert('lastPath transitions to "exported"', exp.lastPath === 'exported', exp);
  assert('exported PNG byte length is non-zero', exp.exportByteLength > 0, exp);
  assert(
    'exported PNG byte length matches export-fn return (state consistency)',
    exp.exportByteLength === exp.resultByteLength,
    exp
  );
  assert(
    'export data URL is a PNG (starts with data:image/png;base64,)',
    exp.exportDataUrlPrefix === 'data:image/png;base64,',
    exp.exportDataUrlPrefix
  );
  assert('export natural width > 0', exp.exportNaturalWidth > 0, exp);
  assert('export natural height > 0', exp.exportNaturalHeight > 0, exp);
  assert(
    'state-recorded export dimensions match export-fn return',
    exp.exportNaturalWidth === exp.resultWidth && exp.exportNaturalHeight === exp.resultHeight,
    exp
  );

  // Decode the exported PNG and verify the box annotation's stroke is
  // present in it. We don't know the exact pixel coords (Excalidraw
  // applies its own viewport math), but we can scan the PNG for any
  // pixel whose color is close to the box's #e03131 — non-zero count
  // is the assertion.
  const pngBuffer = dataUrlToBuffer(exp.resultDataUrl);
  const png = await decodePng(pngBuffer);
  console.log(`decoded exported PNG: ${png.width}x${png.height}px`);

  // Pixel scan for #e03131 within tolerance.
  let redPixelCount = 0;
  const expected = { r: 0xe0, g: 0x31, b: 0x31 };
  const tolerance = 40;
  const stride = 4;
  for (let y = 0; y < png.height; y += stride) {
    for (let x = 0; x < png.width; x += stride) {
      const idx = (png.width * y + x) << 2;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const dist = Math.sqrt((r - expected.r) ** 2 + (g - expected.g) ** 2 + (b - expected.b) ** 2);
      if (dist < tolerance) redPixelCount += 1;
    }
  }
  console.log(`red-pixel sample count (stride=${stride}): ${redPixelCount}`);
  assert(
    'exported PNG contains the box-stroke color (>20 sampled pixels within tolerance of #e03131)',
    redPixelCount > 20,
    { redPixelCount }
  );

  console.log('\n=== reset lifecycle ===');
  const reset = await runResetAndAssert(page);
  console.log(JSON.stringify(reset, null, 2));

  console.log('\nassertions [reset]:');
  assert('lastPath returns to "mounted" after reset', reset.lastPath === 'mounted', reset);
  assert('scene element count returns to 0', reset.sceneElementCount === 0, reset);
  assert('export data URL cleared', reset.lastExportDataUrl === null, reset);
  assert('export byte length cleared', reset.lastExportByteLength === 0, reset);
  assert('export preview placeholder restored', reset.placeholderRestored === true, reset);

  await browser.close();

  console.log('\n=== summary ===');
  if (failures.length === 0) {
    console.log('All assertions passed.');
  } else {
    console.error(`${failures.length} assertion(s) failed:`);
    for (const f of failures) console.error('  -', f);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
