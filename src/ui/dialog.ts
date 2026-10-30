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
  // Focus the title (announced by screen readers) unless a control asks for it with
  // [autofocus]. Focusing the first control would put a focus ring on the ✕ every time.
  const target =
    dlg.querySelector<HTMLElement>('[autofocus]') ?? dlg.querySelector<HTMLElement>('h2');
  if (target?.tagName === 'H2') target.tabIndex = -1;
  target?.focus();
}

export function closeDialog(dlg: HTMLDialogElement): void {
  if (dlg.open) dlg.close();
}

/** Wire every [data-close] button and backdrop click, once, for all dialogs on the page. */
export function wireDialogs(): void {
  for (const dlg of document.querySelectorAll<HTMLDialogElement>('dialog')) {
    dlg.addEventListener('close', () => {
      // Hand focus back to what opened the dialog, but only if focus hasn't already moved on
      // (the close event fires a moment later; never pull focus away from where the user is).
      const active = document.activeElement;
      const stillHere = !active || active === document.body || dlg.contains(active);
      const t = returnFocus.get(dlg);
      if (stillHere && t && document.contains(t)) t.focus();
    });
    dlg.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === dlg && dlg.dataset.backdropClose !== 'false') dlg.close(); // backdrop
      if (target.closest('[data-close]')) dlg.close();
    });
  }
}
