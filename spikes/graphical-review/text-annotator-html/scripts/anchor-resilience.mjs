// Step 1.3.3 — anchor-resilience probe.
//
// Drives the spike, pins annotations to several regions, then programmatically
// edits the iframe DOM (rename a class, add a sibling, reorder children),
// and ASSERTS whether the resolver still finds the original target via the
// fallback selector chain.
//
// For each pin, we test all THREE anchoring layers independently:
//   1. CssSelector (primary)
//   2. TextQuoteSelector (fallback 1)
//   3. FragmentSelector pixel-offset (fallback 2)
//
// The findings doc records concrete behavior of each: when does CSS resolution
// break (e.g. when an id is renamed)? Does TextQuote pick up the change
// (e.g. when text content is unchanged)? Does FragmentSelector still work
// after layout shifts (e.g. when a sibling is inserted above)?

import { chromium } from 'playwright';

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

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error('pageerror', err));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('console.error', msg.text());
  });
  await page.goto(SPIKE_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => Boolean(window.__spike?.iframeDoc) && Boolean(window.__spikeIframe?.anno),
    null,
    { timeout: 8000 }
  );

  // ---- Pin three DOM regions: each one tests a different anchor type ----
  await page.click('#tool-dom');
  const frame = page.frameLocator('#fixture-iframe');
  for (const sel of ['#page-title', '#thumb-hero', '#decorative-rule']) {
    const el = frame.locator(sel);
    await el.scrollIntoViewIfNeeded();
    await el.click({ force: true });
    await page.waitForTimeout(100);
  }

  const initial = await page.evaluate(() => window.__spike.state.domAnnotations);
  assert(
    'three DOM-region annotations were created',
    initial.length === 3,
    initial.length
  );

  // Snapshot resolution BEFORE edits — each annotation should resolve via
  // CssSelector (primary anchor).
  const beforeEdit = await page.evaluate(() => {
    const anns = window.__spike.state.domAnnotations;
    return anns.map((a) => ({
      cssValue: a.target.selector.find((s) => s.type === 'CssSelector')?.value,
      resolution: window.__spike.resolveDomAnnotation(a)
    }));
  });
  console.log('\nresolution BEFORE edits:');
  console.log(JSON.stringify(beforeEdit.map((r) => ({
    css: r.cssValue,
    via: r.resolution.resolvedVia,
    found: Boolean(r.resolution.element)
  })), null, 2));

  for (const r of beforeEdit) {
    assert(
      `before edits: ${r.cssValue} resolves via CssSelector`,
      r.resolution.resolvedVia === 'css' && Boolean(r.resolution.element),
      r.resolution
    );
  }

  // ---- EDIT 1: rename `#page-title` to `#page-title-renamed` ----
  // The CssSelector for the title pin will no longer match; the resolver
  // should fall back through the chain.
  await page.evaluate(() => {
    const doc = window.__spike.iframeDoc;
    const el = doc.getElementById('page-title');
    if (!el) throw new Error('rename probe: #page-title not found pre-edit');
    el.id = 'page-title-renamed';
  });

  // ---- EDIT 2: add a sibling <h2> BEFORE the published lane's heading ----
  // Tests that nth-of-type changes don't break the resolver for elements
  // identified by id (#thumb-hero is unaffected, but layout shifts).
  await page.evaluate(() => {
    const doc = window.__spike.iframeDoc;
    const publishedLane = doc.querySelector('[data-lane="published"]');
    if (!publishedLane) throw new Error('sibling probe: published lane not found');
    const stub = doc.createElement('h2');
    stub.textContent = 'Inserted sibling';
    stub.className = 'lane-title injected';
    publishedLane.insertBefore(stub, publishedLane.firstChild);
  });

  // ---- EDIT 3: rename `#decorative-rule` class but keep id ----
  // Confirms that id-anchored elements survive class rename (the CSS
  // selector for #decorative-rule used #id, not .class).
  await page.evaluate(() => {
    const doc = window.__spike.iframeDoc;
    const el = doc.getElementById('decorative-rule');
    if (!el) throw new Error('class-rename probe: #decorative-rule not found');
    el.className = 'totally-renamed-class';
  });

  await page.waitForTimeout(150);

  const afterEdit = await page.evaluate(() => {
    const anns = window.__spike.state.domAnnotations;
    return anns.map((a) => ({
      cssValue: a.target.selector.find((s) => s.type === 'CssSelector')?.value,
      hasTextQuote: a.target.selector.some((s) => s.type === 'TextQuoteSelector'),
      hasFragment: a.target.selector.some((s) => s.type === 'FragmentSelector'),
      resolution: window.__spike.resolveDomAnnotation(a)
    }));
  });
  console.log('\nresolution AFTER edits:');
  console.log(JSON.stringify(afterEdit.map((r) => ({
    css: r.cssValue,
    via: r.resolution.resolvedVia,
    found: Boolean(r.resolution.element)
  })), null, 2));

  // ---- Anchor-resilience claims ----

  // Annotation #1 — #page-title (renamed away)
  const renamedAnn = afterEdit.find((r) => r.cssValue === '#page-title');
  assert(
    'after id rename: #page-title CssSelector no longer matches (primary anchor broken — expected)',
    renamedAnn && renamedAnn.resolution.resolvedVia !== 'css',
    renamedAnn?.resolution
  );
  assert(
    'after id rename: resolver falls back to TextQuoteSelector (text content unchanged)',
    renamedAnn && renamedAnn.hasTextQuote && renamedAnn.resolution.resolvedVia === 'quote' &&
      Boolean(renamedAnn.resolution.element),
    renamedAnn?.resolution
  );

  // Annotation #2 — #thumb-hero (unchanged id, but sibling inserted before)
  const thumbAnn = afterEdit.find((r) => r.cssValue === '#thumb-hero');
  assert(
    'after sibling insertion: #thumb-hero CssSelector still resolves (id-based selectors survive sibling shifts)',
    thumbAnn && thumbAnn.resolution.resolvedVia === 'css' &&
      Boolean(thumbAnn.resolution.element),
    thumbAnn?.resolution
  );

  // Annotation #3 — #decorative-rule (class renamed, id intact)
  const decorAnn = afterEdit.find((r) => r.cssValue === '#decorative-rule');
  assert(
    'after class rename: #decorative-rule CssSelector still resolves (id-based selectors survive class renames)',
    decorAnn && decorAnn.resolution.resolvedVia === 'css' &&
      Boolean(decorAnn.resolution.element),
    decorAnn?.resolution
  );

  // ---- EDIT 4: tear down ALL the resolution paths for a single annotation
  // ---- to test the FragmentSelector pixel-offset fallback in isolation.
  // We rename the original element, change its text, then ask the resolver
  // what it finds.
  await page.evaluate(() => {
    const doc = window.__spike.iframeDoc;
    const el = doc.getElementById('page-title-renamed');
    if (!el) throw new Error('full-teardown probe: renamed element not found');
    el.id = 'gone-completely';
    el.textContent = 'Replaced text — no longer matches the quote';
  });
  await page.waitForTimeout(100);

  const finalRenamed = await page.evaluate(() => {
    const anns = window.__spike.state.domAnnotations;
    const a = anns.find((x) =>
      x.target.selector.some((s) => s.type === 'CssSelector' && s.value === '#page-title')
    );
    return {
      hasFragment: a?.target.selector.some((s) => s.type === 'FragmentSelector') ?? false,
      resolution: window.__spike.resolveDomAnnotation(a)
    };
  });

  console.log('\nresolution AFTER total teardown of #page-title:');
  console.log(JSON.stringify({
    via: finalRenamed.resolution.resolvedVia,
    found: Boolean(finalRenamed.resolution.element),
    hasFragment: finalRenamed.hasFragment
  }, null, 2));

  // FragmentSelector is the LAST fallback. After id + class + text removal,
  // the FragmentSelector pixel-offset lookup is what's left. Note: pixel-
  // offset resolution returns the *topmost element at that coordinate*,
  // which after layout reflow may or may not be the original element. We
  // assert that it AT LEAST returns *some* element (i.e. the fallback
  // chain doesn't crash), and that resolvedVia is 'fragment'.
  assert(
    'after total teardown: FragmentSelector pixel-offset fallback finds *some* element (graceful degradation)',
    finalRenamed.hasFragment &&
      finalRenamed.resolution.resolvedVia === 'fragment' &&
      Boolean(finalRenamed.resolution.element),
    finalRenamed.resolution
  );

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
