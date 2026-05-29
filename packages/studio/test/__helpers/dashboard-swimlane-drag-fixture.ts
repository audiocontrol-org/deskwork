/**
 * Shared jsdom fixture + DnD helpers for the swimlane-drag client
 * tests. Originally inlined in `dashboard-swimlane-drag-client.test
 * .ts` (741 lines); split out per AUDIT-20260528-14 to satisfy the
 * 300-500 line per-file cap. Importing modules:
 *
 *   - `dashboard-swimlane-drag-client.test.ts` — the drag-controller
 *     describe (dragstart / dragover / drop / dragend semantics).
 *   - `dashboard-swimlane-drag-client-reorder-buttons.test.ts` — the
 *     AUDIT-20260528-31 reorder buttons describe.
 *   - `dashboard-swimlane-drag-client-pure.test.ts` — the
 *     `computeReorder` pure-function describe.
 *
 * jsdom does NOT implement HTML5 DnD's DataTransfer object — the
 * helper builds a real DragEvent with a synthesised DataTransfer
 * (via Object.defineProperty so the controller can read/write the
 * field without runtime errors).
 */

// jsdom lacks `CSS.escape`. Per AUDIT-20260528-28 the drag controller
// escapes lane ids in querySelector calls; the test installs an
// identity shim mirroring the pattern in
// `dashboard-swimlane-client.test.ts`. Real browsers ship
// `CSS.escape`; this is a jsdom-only gap.
interface CSSShim {
  escape: (id: string) => string;
}
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS: CSSShim }).CSS = { escape: (s: string) => s };
}

export const PROJECT_KEY = 'task-5-4-drag-test-key';
export const ORDER_STORAGE_KEY = `deskwork:dashboard:${PROJECT_KEY}:lane-order`;

export interface FakeDataTransfer {
  effectAllowed: string;
  dropEffect: string;
  data: Map<string, string>;
  setData(format: string, value: string): void;
  getData(format: string): string;
}

export function makeFakeDataTransfer(): FakeDataTransfer {
  return {
    effectAllowed: '',
    dropEffect: '',
    data: new Map(),
    setData(format: string, value: string): void {
      this.data.set(format, value);
    },
    getData(format: string): string {
      return this.data.get(format) ?? '';
    },
  };
}

export interface DragEventOptions {
  readonly target: HTMLElement;
  readonly clientY: number;
  readonly dataTransfer?: FakeDataTransfer;
  readonly relatedTarget?: HTMLElement | null;
}

export function dispatchDragEvent(
  type: string,
  options: DragEventOptions,
): Event {
  // jsdom's DragEvent constructor exists but does not populate
  // DataTransfer; we attach our fake via defineProperty so the
  // controller reads/writes it without "as" casts. clientY is also
  // not honored by jsdom's MouseEvent init for DragEvent, so we
  // pin it via defineProperty too.
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'target', {
    value: options.target,
    configurable: true,
  });
  Object.defineProperty(ev, 'clientY', {
    value: options.clientY,
    configurable: true,
  });
  Object.defineProperty(ev, 'dataTransfer', {
    value: options.dataTransfer ?? null,
    configurable: true,
  });
  if (options.relatedTarget !== undefined) {
    Object.defineProperty(ev, 'relatedTarget', {
      value: options.relatedTarget,
      configurable: true,
    });
  }
  options.target.dispatchEvent(ev);
  return ev;
}

export function buildShell(lanes: readonly string[]): HTMLElement {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = PROJECT_KEY;
  document.body.appendChild(shell);

  // Lane rail. Each row carries the AUDIT-20260528-31 up/down button
  // affordance pair (`.r-move-up-btn` / `.r-move-down-btn`) so the
  // keyboard reorder tests below can exercise click + keydown on
  // them. Top row's up + bottom row's down are server-rendered as
  // `disabled` to mirror the renderer in `swimlane-rail.ts`; the
  // controller's init pass refreshes the disabled state from the
  // post-reconciled order.
  const rail = document.createElement('aside');
  rail.classList.add('lane-rail');
  rail.dataset.laneRail = '';
  const lastIdx = lanes.length - 1;
  for (let i = 0; i < lanes.length; i += 1) {
    const id = lanes[i];
    if (id === undefined) continue;
    const row = document.createElement('div');
    row.classList.add('rail-lane');
    row.setAttribute('draggable', 'true');
    row.dataset.railLane = id;
    row.dataset.laneVisible = 'true';
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.classList.add('r-move-up-btn');
    upBtn.setAttribute('aria-label', `Move lane ${id} up`);
    if (i === 0) {
      upBtn.disabled = true;
      upBtn.setAttribute('aria-disabled', 'true');
    } else {
      upBtn.setAttribute('aria-disabled', 'false');
    }
    row.appendChild(upBtn);
    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.classList.add('r-move-down-btn');
    downBtn.setAttribute('aria-label', `Move lane ${id} down`);
    if (i === lastIdx) {
      downBtn.disabled = true;
      downBtn.setAttribute('aria-disabled', 'true');
    } else {
      downBtn.setAttribute('aria-disabled', 'false');
    }
    row.appendChild(downBtn);
    rail.appendChild(row);
  }
  shell.appendChild(rail);

  // Focus strip with one chip per lane (plus a non-lane "All" chip).
  const strip = document.createElement('nav');
  strip.classList.add('focus-strip');
  strip.dataset.focusStrip = '';
  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.classList.add('focus-chip', 'all');
  allChip.dataset.focusChipAll = '';
  strip.appendChild(allChip);
  for (const id of lanes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.classList.add('focus-chip');
    chip.dataset.focusChip = id;
    strip.appendChild(chip);
  }
  shell.appendChild(strip);

  // Bay column holding head + swim+stub pairs.
  const bay = document.createElement('main');
  bay.classList.add('bay');
  bay.dataset.bay = '';
  const bayHead = document.createElement('div');
  bayHead.classList.add('bay-head');
  bay.appendChild(bayHead);
  for (const id of lanes) {
    const swim = document.createElement('article');
    swim.classList.add('swim');
    swim.dataset.laneId = id;
    bay.appendChild(swim);
    const stub = document.createElement('button');
    stub.type = 'button';
    stub.classList.add('swim-stub');
    stub.dataset.swimStub = id;
    bay.appendChild(stub);
  }
  shell.appendChild(bay);

  return rail;
}

export function getLaneOrder(): readonly string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-rail-lane]'),
  ).map((el) => el.dataset.railLane ?? '');
}

export function getChipOrder(): readonly string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-focus-chip]'),
  ).map((el) => el.dataset.focusChip ?? '');
}

export function getSwimOrder(): readonly string[] {
  const bay = document.querySelector<HTMLElement>('[data-bay]');
  if (bay === null) return [];
  const out: string[] = [];
  for (const child of Array.from(bay.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains('swim')) {
      out.push(child.dataset.laneId ?? '');
    }
  }
  return out;
}

export function getRow(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-rail-lane="${id}"]`);
  if (el === null) throw new Error(`row ${id} not found`);
  // Mock getBoundingClientRect — every row 32px tall, sequential top.
  const ids = getLaneOrder();
  const idx = ids.indexOf(id);
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: (): DOMRect => ({
      top: idx * 32,
      bottom: idx * 32 + 32,
      left: 0,
      right: 200,
      height: 32,
      width: 200,
      x: 0,
      y: idx * 32,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
  return el;
}
