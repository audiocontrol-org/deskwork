/**
 * Shared jsdom fixture + helpers for the dashboard swimlane client
 * controller tests. Originally inlined in
 * `dashboard-swimlane-client.test.ts` (536 lines); split out per
 * AUDIT-20260528-14 to satisfy the 300-500 line per-file cap.
 *
 * Builds a synthesised DOM mirroring the server-rendered bay-shell
 * markup with a lane rail (eye-button + decorative glyph children),
 * focus chips (per-lane + the All chip), and per-lane swim + stub
 * pairs. Both `dashboard-swimlane-client.test.ts` and
 * `dashboard-swimlane-client-keys.test.ts` import from here.
 */

export function buildShell(lanes: readonly string[]): void {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = 'test-project-key';
  document.body.appendChild(shell);

  // Lane rail rows.
  const rail = document.createElement('aside');
  rail.classList.add('lane-rail');
  for (const id of lanes) {
    const row = document.createElement('div');
    row.classList.add('rail-lane', 'focused');
    row.dataset.railLane = id;
    row.dataset.laneVisible = 'true';
    row.setAttribute('aria-pressed', 'true');

    // F6 a11y: the eye-toggle is a real `<button class="r-eye-btn">`
    // (previously a `<span class="r-eye">`). The inner `<span>`
    // glyphs are decorative children — driven by CSS visibility
    // rules on the parent rail-lane's data-lane-visible attribute.
    const eye = document.createElement('button');
    eye.type = 'button';
    eye.classList.add('r-eye-btn');
    eye.setAttribute('aria-label', `Toggle visibility for ${id} lane`);
    const visGlyph = document.createElement('span');
    visGlyph.classList.add('r-eye-visible');
    visGlyph.setAttribute('aria-hidden', 'true');
    visGlyph.textContent = '●';
    const hidGlyph = document.createElement('span');
    hidGlyph.classList.add('r-eye-hidden');
    hidGlyph.setAttribute('aria-hidden', 'true');
    hidGlyph.textContent = '○';
    eye.appendChild(visGlyph);
    eye.appendChild(hidGlyph);

    row.appendChild(eye);
    rail.appendChild(row);
  }
  shell.appendChild(rail);

  // Focus chips.
  const strip = document.createElement('nav');
  strip.classList.add('focus-strip');
  for (const id of lanes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.classList.add('focus-chip', 'active');
    chip.dataset.focusChip = id;
    chip.setAttribute('aria-pressed', 'true');
    strip.appendChild(chip);
  }
  // "All" chip (server-rendered alongside the per-lane chips).
  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.classList.add('focus-chip', 'all', 'active');
  allChip.dataset.focusChipAll = '';
  allChip.setAttribute('aria-pressed', 'true');
  allChip.textContent = 'All';
  strip.appendChild(allChip);
  shell.appendChild(strip);

  // Per-lane swim + stub pairs.
  for (const id of lanes) {
    const swim = document.createElement('article');
    swim.classList.add('swim', `swim--${id}`);
    swim.dataset.laneId = id;
    shell.appendChild(swim);

    const stub = document.createElement('button');
    stub.type = 'button';
    stub.classList.add('swim-stub', 'is-focus-hidden');
    stub.dataset.swimStub = id;
    shell.appendChild(stub);
  }
}

// jsdom lacks `CSS.escape`. The lane ids we use here are simple
// kebab-case strings, so identity is a safe shim — escape would be a
// no-op anyway. This avoids depending on a browser-only global the
// jsdom environment doesn't ship.
interface CSSShim {
  escape: (id: string) => string;
}
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS: CSSShim }).CSS = { escape: (s: string) => s };
}
