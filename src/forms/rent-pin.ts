// Rent pin form (SPEC §8.7). Browser checks are for convenience; the Edge Function re-checks everything.
import { submitPin, ApiError, type SubmitPinResult } from '../api';
import { browserId } from '../tokens';
import { $dialog, closeDialog, openDialog } from '../ui/dialog';
import { TurnstileWidget } from '../ui/turnstile';
import {
  NO_BHK_TYPES,
  rentProblem,
  type PropertyType,
} from '../../supabase/functions/_shared/rules';

interface Options {
  onSubmitted(result: SubmitPinResult): void;
  onMoveRequested(): void;
}

const NUMBER_FIELDS = ['rent', 'parking_cars', 'deposit_months', 'sqft'] as const;
const BOOL_FIELDS = ['gated', 'maintenance_incl', 'pg_meals'] as const;
const TEXT_FIELDS = [
  'property_type',
  'furnishing',
  'society_name',
  'waterlogging',
  'water_supply',
  'power_backup',
  'occupants',
  'pg_gender',
  'one_liner',
] as const;

export function setupRentForm({ onSubmitted, onMoveRequested }: Options) {
  const dlg = $dialog('dlg-rent-pin');
  const form = document.getElementById('rent-form') as HTMLFormElement;
  const errorBox = document.getElementById('rent-error') as HTMLElement;
  const bhkField = document.getElementById('bhk-field') as HTMLFieldSetElement;
  const pgFields = document.getElementById('pg-fields') as HTMLElement;
  const localityHint = document.getElementById('rent-locality') as HTMLElement;
  const submitBtn = document.getElementById('rent-submit') as HTMLButtonElement;
  const rentInput = document.getElementById('rent-amount') as HTMLInputElement;
  const turnstile = new TurnstileWidget(document.getElementById('rent-turnstile') as HTMLElement);

  let point: { lat: number; lng: number } | null = null;
  let busy = false;

  const propertyType = (): PropertyType =>
    (new FormData(form).get('property_type') as PropertyType) ?? 'flat';

  function syncTypeFields(): void {
    const t = propertyType();
    const noBhk = NO_BHK_TYPES.includes(t);
    bhkField.hidden = noBhk;
    bhkField.disabled = noBhk;
    pgFields.hidden = t !== 'pg';
  }

  function showError(msg: string | null, focus?: HTMLElement): void {
    errorBox.textContent = msg ?? '';
    errorBox.hidden = !msg;
    rentInput.setAttribute('aria-invalid', String(Boolean(msg && focus === rentInput)));
    if (msg) (focus ?? errorBox).focus?.();
    if (msg && !focus) errorBox.scrollIntoView({ block: 'nearest' });
  }

  function collect(): Record<string, unknown> {
    const fd = new FormData(form);
    const out: Record<string, unknown> = { kind: 'rent' };
    for (const k of NUMBER_FIELDS) {
      const v = String(fd.get(k) ?? '').trim();
      if (v !== '') out[k] = Number(v);
    }
    for (const k of BOOL_FIELDS) {
      const v = fd.get(k);
      if (v === 'true' || v === 'false') out[k] = v === 'true';
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

  form.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).name === 'property_type') syncTypeFields();
  });

  rentInput.addEventListener('input', () => {
    if (!errorBox.hidden) showError(null);
  });

  document.getElementById('rent-move')?.addEventListener('click', () => {
    closeDialog(dlg);
    onMoveRequested();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || !point) return;
    const body = collect();

    const rent = body.rent as number | undefined;
    if (rent === undefined || !Number.isInteger(rent)) {
      return showError('Enter your monthly rent in rupees, as a whole number.', rentInput);
    }
    const problem = rentProblem(body.property_type as PropertyType, body.bhk as number, rent);
    if (problem) return showError(problem, rentInput);

    const token = turnstile.token();
    if (!token) return showError('Please complete the spam check below the form.');

    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';
    showError(null);
    try {
      const result = await submitPin({
        ...body,
        lat: point.lat,
        lng: point.lng,
        turnstileToken: token,
        browserId: browserId(),
      });
      form.reset();
      syncTypeFields();
      closeDialog(dlg);
      onSubmitted(result);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      turnstile.reset(); // tokens are single-use
    } finally {
      busy = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add my rent';
    }
  });

  syncTypeFields();

  return {
    open(at: { lat: number; lng: number }, locality: string | null) {
      point = at;
      localityHint.textContent = locality
        ? `Near ${locality}. Your rent stays anonymous.`
        : 'Your rent stays anonymous.';
      showError(null);
      openDialog(dlg);
      turnstile.mount().catch((err: Error) => showError(err.message));
    },
  };
}
