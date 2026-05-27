// Drive the Annotorious spike with Playwright at desktop + mobile.
// Emits payload + a11y snapshots AND asserts each spec-derived claim
// from the findings doc § "Image annotation spike (Task 1.2)" in
// docs/studio-design/PROPOSED/2026-05-25-graphical-review-prior-art/decision-draft.md.
//
// Per the project's ui-verification.md rule, a script named "verify" is a
// claim of spec compliance: every clause in the findings doc that
// asserts something verifiable maps to at least one operator-perceivable
// assertion below.
import { chromium, devices } from 'playwright';

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

async function pinRectangle(page, x, y, w, h) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + w, y + h, { steps: 12 });
  await page.mouse.up();
}

async function snapshotAccessibility(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.a9s-annotationlayer, .a9s-svg-layer, .a9s-annotation, svg');
    const allAnnoNodes = Array.from(
      document.querySelectorAll(
        '.a9s-annotationlayer, .a9s-annotation, .a9s-svg-layer, .a9s-handle, [class*="a9s"]'
      )
    );
    const touchHandles = document.querySelectorAll('.a9s-touch-handle, .a9s-touch-halo');
    const sample = allAnnoNodes.slice(0, 8).map((n) => ({
      tag: n.tagName,
      classes: n.getAttribute('class') ?? null,
      role: n.getAttribute('role') ?? null,
      ariaLabel: n.getAttribute('aria-label') ?? null,
      ariaDescribedby: n.getAttribute('aria-describedby') ?? null,
      tabindex: n.getAttribute('tabindex') ?? null
    }));
    return {
      hasOverlay: Boolean(root),
      countAnnoNodes: allAnnoNodes.length,
      countTouchHandles: touchHandles.length,
      sample
    };
  });
}

async function snapshotPayload(page) {
  return page.evaluate(() => {
    const pre = document.querySelector('#payload');
    return pre ? pre.textContent : null;
  });
}

async function run() {
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const mobile = await browser.newContext({ ...devices['iPhone 13'] });

  for (const [name, ctx] of [
    ['desktop-1280x800', desktop],
    ['mobile-iphone13', mobile]
  ]) {
    const page = await ctx.newPage();
    page.on('pageerror', (err) => console.error(`[${name}] pageerror`, err));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[${name}] console.error`, msg.text());
    });
    await page.goto(SPIKE_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      const img = document.getElementById('fixture-image');
      return img && img.complete && img.naturalWidth > 0;
    });
    const box = await page.locator('#fixture-image').boundingBox();
    const x0 = box.x + Math.round(box.width * 0.25);
    const y0 = box.y + Math.round(box.height * 0.25);
    const w = Math.max(40, Math.round(box.width * 0.15));
    const h = Math.max(40, Math.round(box.height * 0.15));
    await pinRectangle(page, x0, y0, w, h);
    await page.waitForFunction(() => {
      const pre = document.querySelector('#payload');
      return pre && pre.textContent && pre.textContent.trim() !== '[]';
    }, null, { timeout: 5000 });
    const payload = await snapshotPayload(page);
    const a11y = await snapshotAccessibility(page);
    console.log(`\n=== ${name} ===`);
    console.log('payload:');
    console.log(payload);
    console.log('a11y snapshot:');
    console.log(JSON.stringify(a11y, null, 2));

    console.log(`\nassertions [${name}]:`);
    // W3C alignment — each clause from findings doc § "W3C alignment — actual emitted payload"
    assert(
      'payload carries the canonical W3C JSON-LD @context',
      payload.includes('"@context": "http://www.w3.org/ns/anno.jsonld"'),
      payload?.slice(0, 200)
    );
    assert(
      'payload carries type: "Annotation" root',
      payload.includes('"type": "Annotation"'),
      payload?.slice(0, 200)
    );
    assert(
      'rectangle pin emits a FragmentSelector',
      payload.includes('"type": "FragmentSelector"'),
      payload?.slice(0, 300)
    );
    assert(
      'FragmentSelector value uses xywh=pixel: per W3C media-frags',
      payload.includes('xywh=pixel:'),
      payload?.slice(0, 300)
    );
    assert(
      'target.source resolves to the fixture URI',
      payload.includes('urn:deskwork-spike:fixture.svg'),
      payload?.slice(0, 300)
    );
    // Overlay rendering — each context renders Annotorious's SVG overlay
    assert(
      'Annotorious renders an SVG overlay on the fixture',
      a11y.hasOverlay === true,
      a11y
    );
    assert(
      'Annotorious renders a non-zero set of a9s-* nodes after the pin',
      a11y.countAnnoNodes > 0,
      `countAnnoNodes=${a11y.countAnnoNodes}`
    );
    // Touch code path — only relevant on the mobile context. The findings
    // doc claims: "Annotorious renders extra `.a9s-touch-handle` and
    // `.a9s-touch-halo` elements specifically on touch contexts —
    // concrete evidence of a touch-aware code path."
    if (name === 'mobile-iphone13') {
      assert(
        'mobile context renders touch-specific handles (.a9s-touch-handle / .a9s-touch-halo)',
        a11y.countTouchHandles > 0,
        `countTouchHandles=${a11y.countTouchHandles}`
      );
    }
    await page.close();
  }

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
