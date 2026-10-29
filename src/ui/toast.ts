let timer: number | undefined;

/** Announces to screen readers via the polite live region in index.html. */
export function toast(message: string, kind: 'info' | 'error' = 'info', ms = 4500): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    el.hidden = true;
  }, ms);
}
