// Keyboard-accessibility probe — focuses the SVG overlay, snapshots the
// keyboard surface, and ASSERTS the gaps documented in the findings doc
// § "Accessibility — keyboard" (decision-draft.md).
//
// The findings doc records that Annotorious's SVG overlay is focusable
// (role="application", tabindex="0") but individual annotation <g>
// elements lack tabindex/role/aria-label, so a keyboard user cannot
// Tab between annotations. These assertions confirm the gap still holds
// against the resolved Annotorious version; if any flips, the findings
// doc needs to be re-verified.
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
  await page.goto(SPIKE_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const img = document.getElementById('fixture-image');
    return img && img.complete && img.naturalWidth > 0;
  });
  const box = await page.locator('#fixture-image').boundingBox();
  const x = box.x + 200;
  const y = box.y + 150;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 70, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  await page.mouse.click(box.x + 10, box.y + 10);
  await page.waitForTimeout(150);

  const focusable = await page.evaluate(() => {
    const svg = document.querySelector('svg.a9s-annotationlayer');
    if (!svg) return null;
    svg.focus();
    return {
      activeTag: document.activeElement?.tagName ?? null,
      activeClass: document.activeElement?.getAttribute?.('class') ?? null,
      svgTabindex: svg.getAttribute('tabindex'),
      svgRole: svg.getAttribute('role'),
      annotations: Array.from(svg.querySelectorAll('.a9s-annotation')).map((g) => ({
        tag: g.tagName,
        classes: g.getAttribute('class'),
        tabindex: g.getAttribute('tabindex'),
        role: g.getAttribute('role'),
        ariaLabel: g.getAttribute('aria-label')
      }))
    };
  });
  console.log('focus snapshot:', JSON.stringify(focusable, null, 2));

  console.log('\nassertions:');
  assert(
    'Annotorious SVG annotation layer exists in the DOM',
    focusable !== null,
    focusable
  );
  if (focusable !== null) {
    assert(
      'SVG layer is focusable (tabindex="0")',
      focusable.svgTabindex === '0',
      `svgTabindex=${focusable.svgTabindex}`
    );
    assert(
      'at least one annotation was rendered for the probe',
      focusable.annotations.length > 0,
      `annotations.length=${focusable.annotations.length}`
    );
    assert(
      'finding holds: annotation <g> elements have no tabindex (not in tab order)',
      focusable.annotations.every((g) => g.tabindex === null),
      focusable.annotations.map((g) => g.tabindex)
    );
    assert(
      'finding holds: annotation <g> elements have no role',
      focusable.annotations.every((g) => g.role === null),
      focusable.annotations.map((g) => g.role)
    );
    assert(
      'finding holds: annotation <g> elements have no aria-label',
      focusable.annotations.every((g) => g.ariaLabel === null),
      focusable.annotations.map((g) => g.ariaLabel)
    );
  }

  await page.keyboard.press('Tab');
  const afterTab = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? null,
    classes: document.activeElement?.getAttribute?.('class') ?? null
  }));
  console.log('after Tab from SVG layer:', JSON.stringify(afterTab, null, 2));

  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const payload = await page.evaluate(() => document.querySelector('#payload')?.textContent);
  console.log('payload after Tab/Enter/Escape sequence (annotation should still be present):');
  console.log(payload);
  assert(
    'Tab/Enter/Escape sequence on idle state does not destroy the drawn annotation',
    payload && payload.includes('"type": "Annotation"'),
    payload?.slice(0, 200)
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
