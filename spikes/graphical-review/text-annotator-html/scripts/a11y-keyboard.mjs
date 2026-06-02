// Keyboard-accessibility probe — snapshots the rendered keyboard surface of
// @recogito/text-annotator's highlights INSIDE the iframe document. ASSERTS
// the gaps documented in the findings doc § "Accessibility — keyboard"
// (decision-draft.md).
//
// text-annotator renders text-range highlights as overlay spans or via the
// browser's CSS Custom Highlight API (depending on the configured renderer).
// The findings doc records whether highlights carry tabindex / role /
// aria-label, and whether keyboard users can Tab between annotations. The
// probe drives the spike to a known state (one text-range pin via the
// imperative API), then inspects the iframe DOM.
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
    () => Boolean(window.__spike) && Boolean(window.__spikeIframe?.anno),
    null,
    { timeout: 8000 }
  );

  // Pin one text-range annotation via the iframe-side annotator's
  // imperative API. The W3CTextFormat adapter is configured, so addAnnotation
  // takes a W3C-shaped object and parses it into the internal model. Using
  // TextPositionSelector + TextQuoteSelector covers the spec-canonical
  // pinning path.
  await page.evaluate(() => {
    const iframe = document.getElementById('fixture-iframe');
    const doc = iframe.contentDocument;
    const p = doc.querySelector('[data-lane="drafting"] p');
    if (!p) throw new Error('a11y probe: drafting <p> not found');
    const exact = (p.firstChild.textContent ?? '').slice(0, 60);
    window.__spikeIframe.anno.addAnnotation({
      '@context': 'http://www.w3.org/ns/anno.jsonld',
      id: 'urn:uuid:' + crypto.randomUUID(),
      type: 'Annotation',
      body: [],
      target: {
        source: 'urn:deskwork-spike:fixture-html-mockup',
        type: 'SpecificResource',
        selector: [
          { type: 'TextQuoteSelector', exact },
          { type: 'TextPositionSelector', start: 0, end: exact.length }
        ]
      }
    });
    window.__spikeIframe.refresh();
  });
  await page.waitForTimeout(200);

  const snap = await page.evaluate(() => {
    const iframe = document.getElementById('fixture-iframe');
    const doc = iframe.contentDocument;
    // text-annotator renders highlights as overlay spans (default 'SPANS'
    // renderer) or via the browser's CSS Custom Highlight API.
    // Only count nodes whose class starts with "r6o-" — text-annotator's
    // CSS namespace. The library also sets tabindex="-1" on the container
    // body for keyboard-event capture; we deliberately exclude the body
    // from the highlight-node count.
    const highlightNodes = Array.from(
      doc.querySelectorAll('[class^="r6o-"], [class*=" r6o-"]')
    );
    const highlightLayer = doc.querySelector(
      '.r6o-annotationlayer, .r6o-overlay, .r6o-text-annotation-layer'
    );
    const sample = highlightNodes.slice(0, 8).map((n) => ({
      tag: n.tagName,
      classes: n.getAttribute('class') ?? null,
      role: n.getAttribute('role') ?? null,
      ariaLabel: n.getAttribute('aria-label') ?? null,
      tabindex: n.getAttribute('tabindex') ?? null
    }));
    return {
      hasHighlightLayer: Boolean(highlightLayer),
      highlightLayerTag: highlightLayer?.tagName ?? null,
      highlightLayerRole: highlightLayer?.getAttribute('role') ?? null,
      highlightLayerTabindex: highlightLayer?.getAttribute('tabindex') ?? null,
      countHighlightNodes: highlightNodes.length,
      sample,
      bodyHasHighlightApi: 'highlights' in CSS
    };
  });

  console.log('a11y snapshot:');
  console.log(JSON.stringify(snap, null, 2));

  console.log('\nassertions:');
  // The fundamental claim: text-annotator renders some kind of overlay or
  // uses the CSS Custom Highlight API. Either way, no annotation node is
  // independently focusable / labeled by default.
  assert(
    'iframe contains text-annotator output (either overlay nodes OR CSS Custom Highlight API in use)',
    snap.countHighlightNodes > 0 || snap.bodyHasHighlightApi,
    snap
  );
  if (snap.countHighlightNodes > 0) {
    // `.r6o-annotation` spans are the actual per-annotation overlay nodes.
    // The body carries tabindex="-1" + class "r6o-annotatable" for the
    // library's keyboard-event capture; that is a container-level mark,
    // NOT a per-annotation focus affordance. We narrow the assertion to
    // the per-annotation nodes.
    const annotationNodes = snap.sample.filter(
      (n) => n.classes && n.classes.split(/\s+/).includes('r6o-annotation')
    );
    assert(
      'at least one .r6o-annotation overlay span was captured',
      annotationNodes.length > 0,
      snap.sample.map((n) => n.classes)
    );
    assert(
      'finding holds: .r6o-annotation overlay nodes have no tabindex (per-annotation nodes are not in tab order)',
      annotationNodes.every((n) => n.tabindex === null),
      annotationNodes.map((n) => ({ tag: n.tag, tabindex: n.tabindex }))
    );
    assert(
      'finding holds: .r6o-annotation overlay nodes have no aria-label',
      annotationNodes.every((n) => n.ariaLabel === null),
      annotationNodes.map((n) => ({ tag: n.tag, ariaLabel: n.ariaLabel }))
    );
    assert(
      'finding holds: .r6o-annotation overlay nodes have no role attribute',
      annotationNodes.every((n) => n.role === null),
      annotationNodes.map((n) => ({ tag: n.tag, role: n.role }))
    );
    assert(
      'iframe body carries class "r6o-annotatable" + tabindex="-1" (container-level keyboard-event capture; not per-annotation tab order)',
      snap.sample.some(
        (n) =>
          n.tag === 'BODY' &&
          (n.classes ?? '').includes('r6o-annotatable') &&
          n.tabindex === '-1'
      ),
      snap.sample.find((n) => n.tag === 'BODY')
    );
  }
  if (snap.bodyHasHighlightApi) {
    // CSS Custom Highlight API renders entirely outside the DOM tree —
    // there are no focusable nodes at all. Tab navigation between
    // annotations is structurally impossible without host scaffolding.
    console.log('  NOTE: CSS Custom Highlight API is available; text-annotator may render via it.');
  }

  // Tab from the iframe body and confirm we don't land on a highlight node.
  await page.evaluate(() => {
    const iframe = document.getElementById('fixture-iframe');
    iframe.contentDocument.body.focus();
  });
  await page.keyboard.press('Tab');
  const afterTab = await page.evaluate(() => {
    const iframe = document.getElementById('fixture-iframe');
    const active = iframe.contentDocument.activeElement;
    return {
      tag: active?.tagName ?? null,
      classes: active?.getAttribute?.('class') ?? null,
      isHighlight:
        active?.getAttribute?.('class')?.includes('r6o-') ?? false
    };
  });
  console.log('\nafter Tab from iframe body:', JSON.stringify(afterTab, null, 2));
  assert(
    'Tab from iframe body does not focus an annotation overlay node (highlights are not in tab order)',
    !afterTab.isHighlight,
    afterTab
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
