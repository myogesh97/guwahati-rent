// #dlg-report (NEXT-PHASES §4.1): reason (required) + optional private note + spam check +
// explicit consent (PHASE-2C §2c.1-C: "Report" stays disabled until it is ticked).
import { ApiError, reportPin, type ReportReason } from '../api';
import { browserId } from '../tokens';
import { $dialog, closeDialog, keepFocus, openDialog } from './dialog';
import { toast } from './toast';
import { TurnstileWidget } from './turnstile';

export function setupReport() {
  const dlg = $dialog('dlg-report');
  const form = document.getElementById('report-form') as HTMLFormElement;
  const msg = document.getElementById('report-message') as HTMLTextAreaElement;
  const count = document.getElementById('report-count') as HTMLElement;
  const err = document.getElementById('err-reason') as HTMLElement;
  const formErr = document.getElementById('report-error') as HTMLElement;
  const submit = document.getElementById('report-submit') as HTMLButtonElement;
  const consent = document.getElementById('report-consent') as HTMLInputElement;
  const turnstile = new TurnstileWidget(document.getElementById('report-turnstile')!);
  let pinId: string | null = null;
  let busy = false;
  const syncSubmit = () => (submit.disabled = busy || !consent.checked);
  consent.addEventListener('change', syncSubmit);

  const radios = () => [...form.querySelectorAll<HTMLInputElement>('input[name="reason"]')];
  const showError = (t: string | null) => {
    formErr.textContent = t ?? '';
    formErr.hidden = !t;
  };
  const reasonError = (t: string | null) => {
    err.textContent = t ?? '';
    err.hidden = !t;
    for (const r of radios()) {
      if (t) r.setAttribute('aria-invalid', 'true');
      else r.removeAttribute('aria-invalid');
    }
  };

  msg.addEventListener('input', () => {
    count.textContent = `${msg.value.length} / 300. Only moderators see this.`;
  });
  form.addEventListener('change', () => reasonError(null));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || !pinId || !consent.checked) return;
    const reason = radios().find((r) => r.checked)?.value as ReportReason | undefined;
    if (!reason) {
      reasonError('Choose what is wrong with this pin.');
      radios()[0].focus();
      return;
    }
    busy = true;
    const refocus = keepFocus(submit);
    submit.disabled = true;
    submit.textContent = 'Sending…';
    showError(null);
    try {
      const token = await turnstile.waitForToken();
      if (!token) throw new ApiError('Please complete the spam check, then try again.', 0);
      const r = await reportPin({
        pinId,
        reason,
        message: msg.value.trim() || undefined,
        browserId: browserId(),
        turnstileToken: token,
        consent: true,
      });
      closeDialog(dlg);
      toast(r.already ? "You've already reported this." : "Thanks, we'll review it.");
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Could not send. Please try again.');
      turnstile.reset();
    } finally {
      busy = false;
      syncSubmit();
      submit.textContent = 'Report';
      refocus();
    }
  });

  return {
    open(id: string, trigger?: HTMLElement | null): void {
      pinId = id;
      form.reset();
      syncSubmit();
      msg.dispatchEvent(new Event('input'));
      reasonError(null);
      showError(null);
      openDialog(dlg, trigger);
      turnstile.mount().catch((e: Error) => showError(e.message));
    },
  };
}
