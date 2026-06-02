/**
 * @vitest-environment jsdom
 *
 * Client-controller interaction tests for `/dev/pipelines` (Phase 6
 * Task 6.4).
 *
 * Coverage:
 *   - Edit sub-accordion: opening sub-panel B closes sub-panel A.
 *   - Row View / Edit toggles: single-open accordion across rows
 *     and across panel types.
 *   - Row Delete button (`data-pipeline-copy`) clipboards its
 *     `data-copy` payload.
 *
 * Preview-builder tests live in `pipelines-page-client.test.ts`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initPipelinesPage } from '../../../../plugins/deskwork-studio/public/src/pipelines/pipelines-page';
import {
  buildContainer,
  buildEditPanel,
  buildRow,
  installClipboardStub,
} from './test-helpers.ts';

describe('pipelines-page client controller — interactions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Edit sub-accordion: opening one <details data-pipelines-op> closes the others', () => {
    const container = buildContainer();
    const { panel } = buildEditPanel(container, 'editorial', {
      linearStages: ['Ideas', 'Final'],
      lockedStages: ['Final'],
      offPipelineStages: ['Cancelled'],
    });
    initPipelinesPage();
    const detailsList = Array.from(
      panel.querySelectorAll<HTMLDetailsElement>('[data-pipelines-op]'),
    );
    const add = detailsList.find((d) => d.dataset.pipelinesOp === 'add')!;
    const rename = detailsList.find((d) => d.dataset.pipelinesOp === 'rename')!;

    add.open = true;
    add.dispatchEvent(new Event('toggle'));
    expect(add.open).toBe(true);
    expect(rename.open).toBe(false);

    rename.open = true;
    rename.dispatchEvent(new Event('toggle'));
    expect(rename.open).toBe(true);
    expect(add.open).toBe(false);
  });

  it('Row View toggle reveals the view row + flips aria-expanded', () => {
    const container = buildContainer();
    const { toggleView, viewRow } = buildRow(container, 'editorial');
    initPipelinesPage();
    expect(viewRow.hidden).toBe(true);
    toggleView.click();
    expect(viewRow.hidden).toBe(false);
    expect(toggleView.getAttribute('aria-expanded')).toBe('true');
    toggleView.click();
    expect(viewRow.hidden).toBe(true);
    expect(toggleView.getAttribute('aria-expanded')).toBe('false');
  });

  it('Row single-open accordion: opening Edit on row A closes View on row A', () => {
    const container = buildContainer();
    const { toggleView, toggleEdit, viewRow, editRow } = buildRow(
      container,
      'editorial',
    );
    initPipelinesPage();
    toggleView.click();
    expect(viewRow.hidden).toBe(false);
    toggleEdit.click();
    expect(editRow.hidden).toBe(false);
    expect(viewRow.hidden).toBe(true);
    expect(toggleView.getAttribute('aria-expanded')).toBe('false');
  });

  it('Row single-open accordion: opening row B closes row A', () => {
    const container = buildContainer();
    const a = buildRow(container, 'editorial');
    const b = buildRow(container, 'visual');
    initPipelinesPage();
    a.toggleEdit.click();
    expect(a.editRow.hidden).toBe(false);
    b.toggleEdit.click();
    expect(b.editRow.hidden).toBe(false);
    expect(a.editRow.hidden).toBe(true);
    expect(a.toggleEdit.getAttribute('aria-expanded')).toBe('false');
  });

  it('Row Delete button clipboards its data-copy payload', async () => {
    const container = buildContainer();
    const { deleteBtn } = buildRow(container, 'orphan-custom', {
      withDelete: true,
    });
    const { calls } = installClipboardStub();
    initPipelinesPage();
    expect(deleteBtn).toBeDefined();
    deleteBtn!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe('/deskwork:pipeline delete orphan-custom');
  });
});
