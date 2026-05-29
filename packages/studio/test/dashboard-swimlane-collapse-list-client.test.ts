/**
 * @vitest-environment jsdom
 *
 * Phase 5 Task 5.1B extension — list-body (.lb-group) collapse client
 * behavior. The Task 5.1A controller (`initSwimlaneCollapse`) was
 * extended to handle BOTH `.stage-col` (kanban) AND `.lb-group` (list)
 * as the toggle parent; this file covers the list-side and the cross-
 * view shared-state contract.
 *
 *   - Clicking an `.lb-group-head` chevron toggles `.lb-group.
 *     collapsed` + persists per-stage state in localStorage.
 *   - List-body + kanban share per-stage collapse state — collapsing
 *     a stage in either view restores both on reload.
 *
 * Originally part of `dashboard-swimlane-collapse-client.test.ts`;
 * split out per AUDIT-20260528-14 to satisfy the project's 300-500
 * line file-size cap. Each test builds its own DOM inline (the
 * markup shape diverges from the lane/stage kanban shape in the
 * main file's `buildShell`).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initSwimlaneCollapse } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-collapse';

describe('swimlane collapse client — Task 5.1B list-body extension', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dev/editorial-studio');
  });

  it('Task 5.1B extension: clicking an `.lb-group-head` chevron toggles `.lb-group.collapsed` + persists per-stage', () => {
    // Mirror of the per-stage kanban test, scoped to the list-body
    // shape. Task 5.1B extended `swimlane-collapse.ts` to handle
    // both `.stage-col` AND `.lb-group` as the toggle parent.
    const storageKey = 'deskwork:dashboard:task-5-1a-test-key:stage-collapse';
    document.body.innerHTML = '';
    window.localStorage.clear();
    const shell = document.createElement('section');
    shell.classList.add('bay-shell');
    shell.dataset.bayShell = '';
    shell.dataset.projectKey = 'task-5-1a-test-key';
    const swim = document.createElement('article');
    swim.classList.add('swim', 'view-list');
    swim.dataset.laneId = 'default';
    // Stub swim-head so the controller's swim-head handler doesn't
    // misroute clicks (the test never touches the lane chevron).
    const head = document.createElement('div');
    head.classList.add('swim-head');
    swim.appendChild(head);
    // List body with one .lb-group + chevron.
    const list = document.createElement('div');
    list.classList.add('list-body');
    list.dataset.listBody = '';
    const group = document.createElement('div');
    group.classList.add('lb-group');
    group.dataset.lbGroup = 'Drafting';
    const groupHead = document.createElement('div');
    groupHead.classList.add('lb-group-head');
    const chev = document.createElement('button');
    chev.type = 'button';
    chev.classList.add('collapse-chev');
    chev.setAttribute('aria-expanded', 'true');
    chev.setAttribute('aria-label', 'Collapse Drafting group');
    chev.dataset.collapseTarget = 'stage';
    chev.dataset.laneId = 'default';
    chev.dataset.stageName = 'Drafting';
    chev.textContent = '▾';
    groupHead.appendChild(chev);
    group.appendChild(groupHead);
    // A row that should NOT trigger group collapse.
    const row = document.createElement('a');
    row.classList.add('lb-row');
    row.href = '#';
    row.textContent = 'Entry row';
    group.appendChild(row);
    list.appendChild(group);
    swim.appendChild(list);
    shell.appendChild(swim);
    document.body.appendChild(shell);

    initSwimlaneCollapse();
    // Initial state: expanded.
    expect(group.classList.contains('collapsed')).toBe(false);
    expect(chev.getAttribute('aria-expanded')).toBe('true');
    // Click the chevron — collapses.
    chev.click();
    expect(group.classList.contains('collapsed')).toBe(true);
    expect(chev.getAttribute('aria-expanded')).toBe('false');
    // Persisted to localStorage as { default: ["Drafting"] }.
    const stored: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    expect(stored).toEqual({ default: ['Drafting'] });
    // Click the row — does NOT toggle the group (row navigates via
    // its own `<a>` semantics).
    chev.click(); // re-expand first
    expect(group.classList.contains('collapsed')).toBe(false);
    row.click();
    expect(group.classList.contains('collapsed')).toBe(false);
  });

  it('Task 5.1B extension: list-body and kanban share per-stage collapse state', () => {
    // Build a swim that carries BOTH a kanban `.stage-col` AND a
    // list-body `.lb-group` for the same stage. Persisting one
    // collapses the other on reload — shared state per lane:stage.
    const storageKey = 'deskwork:dashboard:task-5-1a-test-key:stage-collapse';
    window.localStorage.setItem(storageKey, JSON.stringify({ default: ['Drafting'] }));
    document.body.innerHTML = '';
    const shell = document.createElement('section');
    shell.classList.add('bay-shell');
    shell.dataset.bayShell = '';
    shell.dataset.projectKey = 'task-5-1a-test-key';
    const swim = document.createElement('article');
    swim.classList.add('swim', 'view-kanban');
    swim.dataset.laneId = 'default';
    const head = document.createElement('div');
    head.classList.add('swim-head');
    swim.appendChild(head);
    // Kanban stage-col.
    const grid = document.createElement('div');
    grid.classList.add('stage-grid');
    const col = document.createElement('section');
    col.classList.add('stage-col');
    col.dataset.stageCol = 'Drafting';
    const colHead = document.createElement('div');
    colHead.classList.add('stage-head');
    col.appendChild(colHead);
    grid.appendChild(col);
    swim.appendChild(grid);
    // List-body lb-group with the same stage name.
    const list = document.createElement('div');
    list.classList.add('list-body');
    const group = document.createElement('div');
    group.classList.add('lb-group');
    group.dataset.lbGroup = 'Drafting';
    list.appendChild(group);
    swim.appendChild(list);
    shell.appendChild(swim);
    document.body.appendChild(shell);

    initSwimlaneCollapse();
    // Both kanban col AND list group restore to collapsed from the
    // shared lane:stage state.
    expect(col.classList.contains('collapsed')).toBe(true);
    expect(group.classList.contains('collapsed')).toBe(true);
  });
});
