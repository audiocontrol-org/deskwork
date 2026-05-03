/**
 * Transient status toast for the scrapbook viewer. Pinned to the bottom-
 * right of the page; auto-dismisses after a short hold. Used to surface
 * the result of mutation handlers (rename, save, delete, mark-secret,
 * upload, create) without requiring a banner element in the server
 * markup.
 *
 * Kept in its own module so the orchestration in scrapbook-client.ts
 * stays under the file-size cap.
 */

export type ToastKind = 'info' | 'error';

export function flashInfo(host: HTMLElement, text: string): void {
  flash(host, text, 'info');
}

export function flashError(host: HTMLElement, text: string): void {
  flash(host, text, 'error');
}

function flash(host: HTMLElement, text: string, kind: ToastKind): void {
  let toast = host.querySelector<HTMLElement>('.scrap-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'scrap-toast';
    toast.setAttribute('role', 'status');
    toast.style.position = 'fixed';
    toast.style.bottom = '1.5rem';
    toast.style.right = '1.5rem';
    toast.style.padding = '0.5rem 0.8rem';
    toast.style.color = 'var(--er-paper)';
    toast.style.fontFamily = 'var(--er-font-mono)';
    toast.style.fontSize = '0.75rem';
    toast.style.borderRadius = '2px';
    toast.style.zIndex = '99';
    toast.style.boxShadow = '0 6px 14px -8px rgba(26, 22, 20, 0.4)';
    host.appendChild(toast);
  }
  toast.textContent = text;
  toast.dataset.kind = kind;
  toast.style.background = kind === 'error' ? 'var(--er-red-pencil)' : 'var(--er-ink)';
  toast.hidden = false;
  window.setTimeout(() => { if (toast) toast.hidden = true; }, 3200);
}
