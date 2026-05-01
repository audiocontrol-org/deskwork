/**
 * Wire entry-stage action buttons on the per-entry review surface to
 * their POST endpoints (#146).
 *
 * Buttons emitted by the page renderer carry:
 *   - data-control="approve" | "block" | "cancel" | "reject" | "iterate" | "save"
 *   - data-entry-uuid="<uuid>"
 *
 * Selects emit:
 *   - select[name="induct-to"][data-entry-uuid="<uuid>"]
 *
 * Mapping (Phase 30 / #146):
 *   approve → POST /entry/<uuid>/approve  (graduate to next stage)
 *   block   → POST /entry/<uuid>/block    (off-pipeline)
 *   cancel  → POST /entry/<uuid>/cancel
 *   reject  → POST /entry/<uuid>/cancel   (legacy label, same target)
 *   induct-to → POST /entry/<uuid>/induct with body { targetStage }
 *
 * iterate / save are content-level actions; not wired here. They land in
 * a separate sprint when the entry-iterate endpoint ships.
 */

const ENTRY_API = '/api/dev/editorial-review/entry';

type EntryAction = 'approve' | 'block' | 'cancel';

const CONTROL_TO_ACTION: Readonly<Record<string, EntryAction>> = {
  approve: 'approve',
  block: 'block',
  cancel: 'cancel',
  reject: 'cancel',
};

async function postEntryAction(uuid: string, action: EntryAction): Promise<void> {
  const res = await fetch(`${ENTRY_API}/${encodeURIComponent(uuid)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    alert(`${action} failed: ${reason}`);
    return;
  }
  window.location.reload();
}

async function postInduct(uuid: string, targetStage: string): Promise<void> {
  const res = await fetch(`${ENTRY_API}/${encodeURIComponent(uuid)}/induct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetStage }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    alert(`induct failed: ${reason}`);
    return;
  }
  window.location.reload();
}

document.addEventListener('click', async (e) => {
  const target = e.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const control = target.dataset.control;
  const uuid = target.dataset.entryUuid;
  if (!control || !uuid) return;
  const action = CONTROL_TO_ACTION[control];
  if (action === undefined) return;
  e.preventDefault();
  target.setAttribute('disabled', 'true');
  try {
    await postEntryAction(uuid, action);
  } finally {
    target.removeAttribute('disabled');
  }
});

document.addEventListener('change', async (e) => {
  const target = e.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.name !== 'induct-to') return;
  const uuid = target.dataset.entryUuid;
  if (!uuid) return;
  const targetStage = target.value;
  if (!targetStage) return;
  await postInduct(uuid, targetStage);
});
