// flatpickr calendar for date fields. Loaded on demand (dynamic import) so the map page
// doesn't download it. The original <input> keeps name + YYYY-MM-DD value for the form;
// flatpickr's visible "alt" input shows "29 Oct 2026" and takes over the label and errors.
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import type { Instance } from 'flatpickr/dist/types/instance';

export function attachDatePicker(input: HTMLInputElement, onChange: () => void): Instance {
  const id = input.id;
  const describedBy = input.getAttribute('aria-describedby');
  const today = new Date();
  const fp = flatpickr(input, {
    dateFormat: 'Y-m-d', // what the form submits (and the server/DB validate)
    altInput: true,
    altFormat: 'j M Y',
    minDate: input.min || '2000-01-01',
    maxDate: today,
    disableMobile: true, // same calendar on phones (the owner asked for it)
    // Render inside the field, not on <body>: a modal <dialog> sits in the top layer, so a
    // body-level calendar would open *behind* it and could not be clicked.
    static: true,
    monthSelectorType: 'static',
    onChange: () => onChange(),
  });
  // Move id/label/description to the visible field so <label for> and errors still work.
  const alt = fp.altInput!;
  input.removeAttribute('id');
  alt.id = id;
  if (describedBy) alt.setAttribute('aria-describedby', describedBy);
  alt.placeholder = 'Pick a date';
  alt.readOnly = true;
  // Keyboard: the calendar opens when the field gets focus; Enter, Space or Down then moves into
  // it on the chosen day (or today), so the arrow keys work at once. flatpickr's own Enter also
  // submitted the whole form, and its Down jumped a week ahead. Capture phase, so this runs
  // before flatpickr's handler on the same field. Inside the calendar flatpickr does the rest:
  // arrows move, Enter picks, Escape closes back to this field.
  alt.addEventListener(
    'keydown',
    (e) => {
      if (!['Enter', ' ', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      fp.open();
      const day = (sel: string) => fp.calendarContainer.querySelector<HTMLElement>(sel);
      (
        day('.flatpickr-day.selected') ??
        day('.flatpickr-day.today') ??
        day('.flatpickr-day:not(.flatpickr-disabled):not(.prevMonthDay)')
      )?.focus();
    },
    { capture: true },
  );
  return fp;
}
