/**
 * Number inputs are typed only: the mouse wheel and Up/Down arrow keys must not step the value
 * (e.g. rent 50000 -> 49949 while scrolling the form). Spinner arrows are hidden in main.css.
 * Wheel blurs instead of preventDefault so the page/dialog keeps scrolling.
 * Document-level listeners cover every number input, including ones added later.
 */
export function guardNumberInputsFromWheel(): void {
  const isNumber = (el: EventTarget | null): el is HTMLInputElement =>
    el instanceof HTMLInputElement && el.type === 'number';

  document.addEventListener(
    'wheel',
    (e) => {
      if (isNumber(e.target) && e.target === document.activeElement) e.target.blur();
    },
    { passive: true, capture: true },
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (isNumber(e.target) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) e.preventDefault();
    },
    { capture: true },
  );
}
