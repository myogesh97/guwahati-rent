let timer: number | undefined;

/** Announces to screen readers via the polite live region in index.html. The region is never
 *  `hidden`: text that arrives together with its region is often not read out. Empty = not shown. */
export function toast(message: string, kind: 'info' | 'error' = 'info', ms = 4500): void {
  const el = document.getElementById('toast');
  if (!el) return;
  window.clearTimeout(timer);
  el.dataset.kind = kind;
  // Empty first, then the message, so the same message twice is announced twice.
  el.textContent = '';
  timer = window.setTimeout(() => {
    el.textContent = message;
    timer = window.setTimeout(() => (el.textContent = ''), ms);
  }, 50);
}
