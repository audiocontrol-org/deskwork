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

  // ---- Pin four DOM regions: three id-anchored (test rename / sibling /
  // class mutations) plus one anchored to a no-id paragraph inside the
  // drafting lane (tests pure-reorder of same-tag siblings via nth-of-type
  // CssSelector path). ----
  await page.click('#tool-dom');
  const frame = page.frameLocator('#fixture-iframe');
  for (const sel of [
    '#page-title',
    '#thumb-hero',
    '#decorative-rule',
    '[data-lane="drafting"] p'
  ]) {
    const el = frame.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    await el.click({ force: true });
    await page.waitForTimeout(100);
  }

  const initial = await page.evaluate(() => window.__spike.state.domAnnotations);
  assert(
    'four DOM-region annotations were created (three id-anchored + one nth-of-type)',
    initial.length === 4,
    initial.length
  );

  // Snapshot resolution BEFORE edits — each annotation should resolve via
  // CssSelector (primary anchor). DOM elements cannot cross the
  // page.evaluate boundary, so we capture identifying details (tagName,
  // id, leading textContent) inside the iframe context.
  const beforeEdit = await page.evaluate(() => {
    const anns = window.__spike.state.domAnnotations;
    return anns.map((a) => {
      const cssValue = a.target.selector.find((s) => s.type === 'CssSelector')?.value;
      const hasTextQuote = a.target.selector.some((s) => s.type === 'TextQuoteSelector');
      const hasFragment = a.target.selector.some((s) => s.type === 'FragmentSelector');
      const { element, resolvedVia } = window.__spike.resolveDomAnnotation(a);
      return {
        cssValue,
        hasTextQuote,
        hasFragment,
        resolvedVia,
        elementExists: Boolean(element),
        elementTag: element?.tagName ?? null,
        elementId: element?.id ?? null,
        elementTextStart: element?.textContent?.trim().slice(0, 60) ?? null
      };
    });
  });
  console.log('\nresolution BEFORE edits:');
  console.log(JSON.stringify(beforeEdit, null, 2));

  for (const r of beforeEdit) {
    assert(
      `before edits: ${r.cssValue} resolves via CssSelector`,
      r.resolvedVia === 'css' && r.elementExists,
      r
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
    return anns.map((a) => {
      const cssValue = a.target.selector.find((s) => s.type === 'CssSelector')?.value;
      const hasTextQuote = a.target.selector.some((s) => s.type === 'TextQuoteSelector');
      const hasFragment = a.target.selector.some((s) => s.type === 'FragmentSelector');
      const { element, resolvedVia } = window.__spike.resolveDomAnnotation(a);
      return {
        cssValue,
        hasTextQuote,
        hasFragment,
        resolvedVia,
        elementExists: Boolean(element),
        elementTag: element?.tagName ?? null,
        elementId: element?.id ?? null,
        elementTextStart: element?.textContent?.trim().slice(0, 60) ?? null
      };
    });
  });
  console.log('\nresolution AFTER edits:');
  console.log(JSON.stringify(afterEdit, null, 2));

  // ---- Anchor-resilience claims ----

  // Annotation #1 — #page-title (renamed away). After rename, CssSelector
  // for `#page-title` is broken; TextQuote fallback should land on the
  // *deepest* matching element (the resolver bug-fix from this commit), not
  // on `<body>` even though body.textContent.trim() also starts with the
  // quoted text.
  const renamedAnn = afterEdit.find((r) => r.cssValue === '#page-title');
  assert(
    'after id rename: #page-title CssSelector no longer matches (primary anchor broken — expected)',
    renamedAnn && renamedAnn.resolvedVia !== 'css',
    renamedAnn
  );
  // Combined claim: falls back to TextQuote AND the deepest matching element
  // is the original H1 (with its new id), not `<body>` or `<main>`.
  assert(
    'after id rename: resolver falls back to TextQuote AND lands on the renamed H1 (not a containing ancestor like <body>)',
    renamedAnn &&
      renamedAnn.hasTextQuote &&
      renamedAnn.resolvedVia === 'quote' &&
      renamedAnn.elementTag === 'H1' &&
      renamedAnn.elementId === 'page-title-renamed',
    {
      via: renamedAnn?.resolvedVia,
      tag: renamedAnn?.elementTag,
      id: renamedAnn?.elementId
    }
  );

  // Annotation #2 — #thumb-hero (unchanged id, but sibling inserted before)
  const thumbAnn = afterEdit.find((r) => r.cssValue === '#thumb-hero');
  assert(
    'after sibling insertion: #thumb-hero CssSelector still resolves (id-based selectors survive sibling shifts)',
    thumbAnn && thumbAnn.resolvedVia === 'css' && thumbAnn.elementExists,
    thumbAnn
  );

  // Annotation #3 — #decorative-rule (class renamed, id intact)
  const decorAnn = afterEdit.find((r) => r.cssValue === '#decorative-rule');
  assert(
    'after class rename: #decorative-rule CssSelector still resolves (id-based selectors survive class renames)',
    decorAnn && decorAnn.resolvedVia === 'css' && decorAnn.elementExists,
    decorAnn
  );

  // Annotation #4 — drafting lane's <p>. Its CssSelector uses
  // `main.content > section.card.lane:nth-of-type(1) > p`. Pure-reorder of
  // same-tag siblings (swap drafting<->published) keeps nth-of-type(1)
  // valid as a CSS selector — it just resolves to a DIFFERENT element
  // (the new first section). The resolver does NOT cross-check CSS
  // match against TextQuote; this is the silent-mis-target failure mode
  // the spike surfaces. Phase 10 must add cross-check logic.
  const nthOfTypeBefore = afterEdit.find(
    (r) => r.cssValue && r.cssValue.includes(':nth-of-type(')
  );
  assert(
    'before reorder: nth-of-type CssSelector for drafting <p> resolves correctly (sibling-insertion above did not change nth-of-type(1) target)',
    nthOfTypeBefore &&
      nthOfTypeBefore.resolvedVia === 'css' &&
      nthOfTypeBefore.elementExists &&
      nthOfTypeBefore.elementTag === 'P' &&
      nthOfTypeBefore.elementTextStart?.startsWith('The drafting stage'),
    nthOfTypeBefore
  );

  // ---- EDIT 5: pure-reorder — swap the drafting and published lane sections.
  // After this swap, `:nth-of-type(1)` resolves to published (not drafting).
  // The drafting `<p>` is now at `section.card.lane:nth-of-type(2) > p`.
  await page.evaluate(() => {
    const doc = window.__spike.iframeDoc;
    const main = doc.querySelector('main.content');
    const drafting = doc.querySelector('[data-lane="drafting"]');
    const published = doc.querySelector('[data-lane="published"]');
    if (!main || !drafting || !published) {
      throw new Error('reorder probe: drafting or published lane not found');
    }
    // Swap order: move drafting AFTER published.
    main.insertBefore(published, drafting);
  });
  await page.waitForTimeout(150);

  const afterReorder = await page.evaluate(() => {
    const a = window.__spike.state.domAnnotations.find((x) =>
      x.target.selector.some(
        (s) => s.type === 'CssSelector' && s.value.includes(':nth-of-type(')
      )
    );
    const resolution = window.__spike.resolveDomAnnotation(a);
    const draftingP = window.__spike.iframeDoc.querySelector(
      '[data-lane="drafting"] p'
    );
    return {
      resolvedVia: resolution.resolvedVia,
      tag: resolution.element?.tagName ?? null,
      textStart: resolution.element?.textContent?.trim().slice(0, 60) ?? null,
      matchesDraftingP: resolution.element === draftingP
    };
  });
  console.log('\nresolution AFTER pure-reorder of same-tag siblings:');
  console.log(JSON.stringify(afterReorder, null, 2));
  // Honest finding: nth-of-type CSS continues to RESOLVE after pure-reorder
  // — but to the WRONG element (the new first section's <p>, which is now
  // the published lane, not drafting). The resolver does NOT cross-check
  // the resolved element against the TextQuote, so the mis-target is
  // silent. This is the failure mode the spike surfaces; Phase 10's
  // production resolver must add the cross-check.
  assert(
    'after pure-reorder: nth-of-type CssSelector silently mis-targets (resolver returns the new first section <p>, not the original drafting <p>; CSS resolution does NOT cross-check against TextQuote)',
    afterReorder.resolvedVia === 'css' &&
      afterReorder.tag === 'P' &&
      afterReorder.matchesDraftingP === false &&
      afterReorder.textStart?.startsWith('Published'),
    afterReorder
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
  // which after layout reflow may or may not be the original element. The
  // combined assertion: (a) resolver returns SOME element via fragment,
  // (b) the originally-recorded bbox center remains inside the iframe's
  // viewable region (i.e. the FragmentSelector is still a sensible spatial
  // marker after layout reflow), measured by checking the recorded bbox's
  // centre falls within the iframe's current scrolling viewport.
  const fragmentBbox = await page.evaluate(() => {
    const a = window.__spike.state.domAnnotations.find((x) =>
      x.target.selector.some(
        (s) => s.type === 'CssSelector' && s.value === '#page-title'
      )
    );
    const f = a?.target.selector.find((s) => s.type === 'FragmentSelector');
    if (!f) return null;
    const m = f.value.match(/^xywh=pixel:(\d+),(\d+),(\d+),(\d+)$/);
    if (!m) return null;
    const [x, y, w, h] = m.slice(1).map(Number);
    const iframe = document.getElementById('fixture-iframe');
    const doc = iframe.contentDocument;
    const view = doc.documentElement;
    return {
      cx: x + w / 2,
      cy: y + h / 2,
      viewportW: view.clientWidth,
      viewportH: view.clientHeight
    };
  });
  assert(
    'after total teardown: FragmentSelector pixel-offset fallback resolves to SOME element AND the recorded bbox center remains within the iframe viewport (spatial marker is meaningful)',
    finalRenamed.hasFragment &&
      finalRenamed.resolution.resolvedVia === 'fragment' &&
      Boolean(finalRenamed.resolution.element) &&
      fragmentBbox &&
      fragmentBbox.cx >= 0 &&
      fragmentBbox.cx <= fragmentBbox.viewportW &&
      fragmentBbox.cy >= 0 &&
      fragmentBbox.cy <= fragmentBbox.viewportH,
    { resolution: finalRenamed.resolution, fragmentBbox }
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
