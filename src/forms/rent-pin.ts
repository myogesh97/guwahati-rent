// Rent pin form (SPEC §8.7 + living conditions, migration 0003).
// Browser checks are for convenience; the Edge Function re-checks everything.
import { submitPin, ApiError, type SubmitPinResult } from '../api';
import { browserId } from '../tokens';
import { $dialog, closeDialog, openDialog } from '../ui/dialog';
import { TurnstileWidget } from '../ui/turnstile';
import {
  LIMITS,
  NO_BHK_TYPES,
  WATER_SCHEDULED,
  conditionProblems,
  rentProblem,
  type Conditions,
  type PropertyType,
} from '../../supabase/functions/_shared/rules';

interface Options {
  onSubmitted(result: SubmitPinResult): void;
  onMoveRequested(): void;
}

type Problem = { field: string; message: string };

const NUMBER_FIELDS = [
  'rent',
  'parking_cars',
  'deposit_months',
  'sqft',
  'water_litres',
  'maintenance_amount',
] as const;
const BOOL_FIELDS = ['gated', 'maintenance_incl', 'pg_meals', 'water_shared'] as const;
const LIST_FIELDS = ['waterlog_where'] as const;
const TEXT_FIELDS = [
  'property_type',
  'furnishing',
  'society_name',
  'water_availability',
  'water_hours',
  'water_extra_cost',
  'drinking_water',
  'water_note',
  'waterlog_answer',
  'waterlog_severity',
  'waterlog_duration',
  'road_in_rain',
  'floor_level',
  'waterlog_note',
  'conditions_as_of',
  'power_backup',
  'power_cuts',
  'occupants',
  'pg_gender',
  'one_liner',
] as const;

/** Whole-number range check with messages people understand. */
function intProblem(
  field: string,
  value: number | undefined,
  { min, max }: { min: number; max: number },
  what: string,
): Problem | null {
  if (value === undefined) return null;
  if (!Number.isInteger(value)) return { field, message: `Enter ${what} as a whole number.` };
  if (value < min || value > max) {
    return {
      field,
      message: `Enter ${what} between ${min.toLocaleString('en-IN')} and ${max.toLocaleString('en-IN')}.`,
    };
  }
  return null;
}

export function setupRentForm({ onSubmitted, onMoveRequested }: Options) {
  const dlg = $dialog('dlg-rent-pin');
  const form = document.getElementById('rent-form') as HTMLFormElement;
  const errorBox = document.getElementById('rent-error') as HTMLElement;
  const bhkField = document.getElementById('bhk-field') as HTMLFieldSetElement;
  const pgFields = document.getElementById('pg-fields') as HTMLElement;
  const waterSchedule = document.getElementById('water-schedule') as HTMLFieldSetElement;
  const waterlogDetail = document.getElementById('waterlog-detail') as HTMLFieldSetElement;
  const maintAmount = document.getElementById('maint-amount-row') as HTMLFieldSetElement;
  const litresLabel = document.getElementById('water-litres-label') as HTMLElement;
  const litresHelp = document.getElementById('water-litres-help') as HTMLElement;
  const asOf = document.getElementById('as-of') as HTMLInputElement;
  const asOfClear = document.getElementById('as-of-clear') as HTMLButtonElement;
  let datePicker: { clear(): void; set(k: 'maxDate', v: Date): void } | null = null;
  const localityHint = document.getElementById('rent-locality') as HTMLElement;
  const submitBtn = document.getElementById('rent-submit') as HTMLButtonElement;
  const turnstile = new TurnstileWidget(document.getElementById('rent-turnstile') as HTMLElement);

  let point: { lat: number; lng: number } | null = null;
  let busy = false;

  const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const value = (name: string): string => String(new FormData(form).get(name) ?? '');

  /** Show/hide a conditional group. Disabled fieldsets are left out of FormData, but their
   *  inputs keep what was typed, so switching an answer back restores it. */
  function toggle(group: HTMLFieldSetElement | HTMLElement, show: boolean): void {
    group.hidden = !show;
    if (group instanceof HTMLFieldSetElement) group.disabled = !show;
  }

  function syncConditional(): void {
    const type = (value('property_type') || 'flat') as PropertyType;
    toggle(bhkField, !NO_BHK_TYPES.includes(type));
    pgFields.hidden = type !== 'pg';

    const availability = value('water_availability');
    toggle(waterSchedule, WATER_SCHEDULED.includes(availability));
    if (availability === 'alternate_day') {
      litresLabel.textContent = 'Litres on each supply day';
      litresHelp.textContent =
        'Water comes every other day. Enter how much comes on a supply day (e.g. 500), not a daily average. Leave blank if unsure.';
    } else if (availability === 'irregular') {
      litresLabel.textContent = 'Litres when water comes';
      litresHelp.textContent = "Roughly how much each time. Leave blank if you don't know.";
    } else {
      litresLabel.textContent = 'Litres per day';
      litresHelp.textContent = "Leave blank if you don't know.";
    }

    toggle(waterlogDetail, value('waterlog_answer') === 'yes');
    toggle(maintAmount, value('maintenance_incl') === 'false');
  }

  function collect(): Record<string, unknown> {
    const fd = new FormData(form); // skips disabled (hidden conditional) groups
    const out: Record<string, unknown> = { kind: 'rent' };
    for (const k of NUMBER_FIELDS) {
      const v = String(fd.get(k) ?? '').trim();
      if (v !== '') out[k] = Number(v);
    }
    for (const k of BOOL_FIELDS) {
      const v = fd.get(k);
      if (v === 'true' || v === 'false') out[k] = v === 'true';
    }
    for (const k of LIST_FIELDS) {
      const v = fd.getAll(k).map(String);
      if (v.length) out[k] = v;
    }
    for (const k of TEXT_FIELDS) {
      const v = String(fd.get(k) ?? '').trim();
      if (v !== '') out[k] = v;
    }
    const t = out.property_type as PropertyType;
    out.bhk = NO_BHK_TYPES.includes(t) ? 0 : Number(fd.get('bhk') ?? 1);
    out.parking_cars ??= 0;
    return out;
  }

  function validate(body: Record<string, unknown>): Problem[] {
    const problems: Problem[] = [];
    // A number input holding non-numeric text reports '' to FormData; catch it here.
    for (const name of NUMBER_FIELDS) {
      const input = form.elements.namedItem(name) as HTMLInputElement | null;
      if (input && !input.disabled && input.validity.badInput) {
        problems.push({ field: name, message: 'Enter digits only.' });
      }
    }
    const bad = new Set(problems.map((p) => p.field));

    const rent = body.rent as number | undefined;
    if (!bad.has('rent')) {
      if (rent === undefined) {
        problems.push({ field: 'rent', message: 'Enter your monthly rent in rupees.' });
      } else if (!Number.isInteger(rent)) {
        problems.push({ field: 'rent', message: 'Enter the rent as a whole number of rupees.' });
      } else {
        const p = rentProblem(body.property_type as PropertyType, body.bhk as number, rent);
        if (p) problems.push({ field: 'rent', message: p });
      }
    }

    const deposit = body.deposit_months as number | undefined;
    if (
      !bad.has('deposit_months') &&
      deposit !== undefined &&
      deposit > LIMITS.deposit.max &&
      deposit >= 500
    ) {
      problems.push({
        field: 'deposit_months',
        message: `That looks like an amount in rupees. Enter the number of months instead, e.g. ${Math.min(12, Math.max(1, Math.round(deposit / (rent || deposit))))} for ${rupees(deposit)}.`,
      });
    } else if (!bad.has('deposit_months')) {
      const p = intProblem('deposit_months', deposit, LIMITS.deposit, 'the number of months');
      if (p) problems.push(p);
    }

    const checks: [string, { min: number; max: number }, string][] = [
      ['parking_cars', LIMITS.parking, 'the number of parking spots'],
      ['sqft', LIMITS.sqft, 'the size in sq ft'],
      ['water_litres', LIMITS.waterLitres, 'litres'],
      ['maintenance_amount', LIMITS.maintenance, 'the monthly maintenance in ₹'],
    ];
    for (const [field, range, what] of checks) {
      if (bad.has(field)) continue;
      const p = intProblem(field, body[field] as number | undefined, range, what);
      if (p) problems.push(p);
    }

    problems.push(...conditionProblems(body as Conditions));
    return problems;
  }

  function clearErrors(): void {
    errorBox.hidden = true;
    errorBox.textContent = '';
    for (const el of form.querySelectorAll<HTMLElement>('.field-error')) {
      el.hidden = true;
      el.textContent = '';
    }
    for (const el of form.querySelectorAll('[aria-invalid="true"]'))
      el.removeAttribute('aria-invalid');
  }

  function clearFieldError(name: string): void {
    const err = document.getElementById(`err-${name}`);
    if (err) {
      err.hidden = true;
      err.textContent = '';
    }
    for (const el of form.querySelectorAll(`[name="${name}"]`)) el.removeAttribute('aria-invalid');
    if (!form.querySelector('.field-error:not([hidden])')) errorBox.hidden = true;
  }

  /** Inline message next to each field + a summary at the top; focuses the first problem. */
  function showProblems(problems: Problem[], summary?: string): void {
    clearErrors();
    let first: HTMLElement | null = null;
    const unplaced: string[] = [];
    for (const { field, message } of problems) {
      const err = document.getElementById(`err-${field}`);
      // A flatpickr field submits through a hidden input; mark and focus the visible one.
      const inputs = [...form.querySelectorAll<HTMLInputElement>(`[name="${field}"]`)].map(
        (i) =>
          (i as HTMLInputElement & { _flatpickr?: { altInput?: HTMLInputElement } })._flatpickr
            ?.altInput ?? i,
      );
      if (err && !err.textContent) {
        err.textContent = message;
        err.hidden = false;
      } else if (!err) {
        unplaced.push(message);
      }
      for (const input of inputs) {
        input.setAttribute('aria-invalid', 'true');
        // Reveal the field if it sits in the collapsed "More details" section.
        const details = input.closest('details');
        if (details) details.open = true;
      }
      first ??= inputs[0] ?? null;
    }
    const n = problems.length;
    errorBox.textContent =
      summary ??
      (unplaced.length
        ? unplaced.join(' ')
        : n === 1
          ? `Please fix this: ${problems[0].message}`
          : `Please fix the ${n} highlighted answers below.`);
    errorBox.hidden = false;
    if (first) {
      first.focus();
      first.scrollIntoView({ block: 'center' });
    } else {
      errorBox.focus();
      errorBox.scrollIntoView({ block: 'nearest' });
    }
  }

  function showMessage(msg: string): void {
    clearErrors();
    errorBox.textContent = msg;
    errorBox.hidden = false;
    errorBox.focus();
    errorBox.scrollIntoView({ block: 'nearest' });
  }

  // Optional chip groups have no "—" option, so tapping the chosen chip again clears it.
  let wasChecked: HTMLInputElement | null = null;
  form.addEventListener('pointerdown', (e) => {
    const input = (e.target as HTMLElement).closest('label')?.querySelector('input');
    wasChecked =
      input?.type === 'radio' && input.checked && input.closest('[data-optional]') ? input : null;
  });
  form.addEventListener('click', (e) => {
    const input = (e.target as HTMLElement).closest('label')?.querySelector('input');
    if (input && input === wasChecked) {
      input.checked = false;
      wasChecked = null;
      form.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  asOfClear.addEventListener('click', () => {
    datePicker?.clear();
    asOf.value = '';
    asOfClear.hidden = true;
    clearFieldError('conditions_as_of');
  });

  form.addEventListener('change', (e) => {
    syncConditional();
    const name = (e.target as HTMLInputElement).name;
    if (name) clearFieldError(name);
  });
  form.addEventListener('input', (e) => {
    const name = (e.target as HTMLInputElement).name;
    if (name) clearFieldError(name);
  });

  document.getElementById('rent-move')?.addEventListener('click', () => {
    closeDialog(dlg);
    onMoveRequested();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || !point) return;
    const body = collect();

    const problems = validate(body);
    if (problems.length) return showProblems(problems);

    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';
    clearErrors();
    try {
      const token = await turnstile.waitForToken();
      if (!token) {
        showMessage('Please complete the spam check below the form, then tap Add my rent again.');
        return;
      }
      const result = await submitPin({
        ...body,
        lat: point.lat,
        lng: point.lng,
        turnstileToken: token,
        browserId: browserId(),
      });
      form.reset();
      datePicker?.clear();
      asOfClear.hidden = true;
      syncConditional();
      closeDialog(dlg);
      onSubmitted(result);
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) {
        showProblems(
          err.fields.map((field) => ({ field, message: 'Check this answer.' })),
          err.message,
        );
      } else {
        showMessage(
          err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
        );
      }
      turnstile.reset(); // tokens are single-use
    } finally {
      busy = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add my rent';
    }
  });

  syncConditional();

  return {
    open(at: { lat: number; lng: number }, locality: string | null) {
      point = at;
      localityHint.textContent = locality
        ? `Near ${locality}. Your rent stays anonymous.`
        : 'Your rent stays anonymous.';
      const d = new Date();
      asOf.max = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // Calendar (flatpickr) is loaded the first time the form opens, not with the map.
      if (datePicker) datePicker.set('maxDate', d);
      else
        void import('../ui/datepicker')
          .then(({ attachDatePicker }) => {
            datePicker ??= attachDatePicker(asOf, () => {
              asOfClear.hidden = !asOf.value;
              clearFieldError('conditions_as_of');
            });
          })
          .catch(() => {
            /* plain date input keeps working */
          });
      clearErrors();
      openDialog(dlg);
      turnstile.mount().catch((err: Error) => showMessage(err.message));
    },
  };
}
