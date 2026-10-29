// Native <dialog> helpers (SPEC §8.6): focus moves in on open and back to the trigger on close.
const returnFocus = new WeakMap<HTMLDialogElement, HTMLElement | null>();

export function $dialog(id: string): HTMLDialogElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLDialogElement)) throw new Error(`#${id} is not a <dialog>`);
  return el;
}

export function openDialog(dlg: HTMLDialogElement, trigger?: HTMLElement | null): void {
  for (const other of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) {
    if (other !== dlg) other.close();
  }
  returnFocus.set(dlg, trigger ?? (document.activeElement as HTMLElement | null));
  if (!dlg.open) dlg.showModal();
  const first = dlg.querySelector<HTMLElement>(
    '[autofocus], input:not([type=hidden]), select, textarea, button',
  );
  first?.focus();
}

export function closeDialog(dlg: HTMLDialogElement): void {
  if (dlg.open) dlg.close();
}

/** Wire every [data-close] button and backdrop click, once, for all dialogs on the page. */
export function wireDialogs(): void {
  for (const dlg of document.querySelectorAll<HTMLDialogElement>('dialog')) {
    dlg.addEventListener('close', () => {
      const t = returnFocus.get(dlg);
      if (t && document.contains(t)) t.focus();
    });
    dlg.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === dlg && dlg.dataset.backdropClose !== 'false') dlg.close(); // backdrop
      if (target.closest('[data-close]')) dlg.close();
    });
  }
}
