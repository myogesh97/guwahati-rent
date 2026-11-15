// One To-Let board (NEXT-PHASES §2a.8): photo, age, time left (§1b), "Board is gone".
import { ApiError, boardImageUrl, reportTolet } from '../api';
import { POLICY } from '../config';
import { expiresIn, relativeDate } from '../format';
import { browserId } from '../tokens';
import type { PublicBoard } from '../types';
import { $dialog, keepFocus, openDialog } from './dialog';
import { TurnstileWidget } from './turnstile';

export function setupBoardCard() {
  const dlg = $dialog('dlg-board');
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const photoBtn = $<HTMLButtonElement>('board-photo');
  const img = $<HTMLImageElement>('board-img');
  const hint = $('board-photo-hint');
  const meta = $('board-meta');
  const report = $('board-report');
  const status = $('board-status');
  const gone = $<HTMLButtonElement>('board-gone');
  const turnstile = new TurnstileWidget($('board-turnstile'));
  // Explicit consent (PHASE-2C §2c.1-C): the second press needs the box ticked.
  const consent = $<HTMLInputElement>('board-consent');
  consent.addEventListener('change', () => {
    if (!report.hidden && current && !reported.has(current.id)) gone.disabled = !consent.checked;
  });
  const reported = new Set<string>();
  let current: PublicBoard | null = null;

  // Once the full photo is showing (or failed), the button has nothing more to do. aria-disabled,
  // not disabled: it was just pressed, and disabling a focused button drops keyboard focus.
  const photoDone = () => photoBtn.setAttribute('aria-disabled', 'true');
  img.addEventListener('error', () => {
    if (!img.getAttribute('src')) return;
    hint.textContent = 'The photo could not load. Check your connection.';
    hint.hidden = false;
    photoDone();
  });

  photoBtn.addEventListener('click', () => {
    if (!current?.public_photo_path || photoBtn.getAttribute('aria-disabled') === 'true') return;
    img.src = boardImageUrl(current.public_photo_path);
    hint.hidden = true;
    photoDone();
  });

  gone.addEventListener('click', async () => {
    if (!current) return;
    if (report.hidden) {
      report.hidden = false;
      gone.textContent = 'Yes, the board is gone';
      gone.disabled = !consent.checked;
      consent.focus(); // the button just became disabled; the box is the next step
      turnstile.mount().catch((e: Error) => (status.textContent = e.message));
      return;
    }
    const refocus = keepFocus(gone);
    gone.disabled = true;
    status.textContent = 'Sending…';
    try {
      const token = await turnstile.waitForToken();
      if (!token) throw new ApiError('Please complete the spam check, then try again.', 0);
      await reportTolet(current.id, browserId(), token);
      reported.add(current.id);
      report.hidden = true;
      status.textContent = `Thanks. Boards reported gone by ${POLICY.reportThreshold} people are taken off the map.`;
      // The button stays disabled (reported); the next step is closing.
      if (document.activeElement === document.body)
        dlg.querySelector<HTMLElement>('.dlg-actions [data-close]')?.focus();
    } catch (e) {
      gone.disabled = !consent.checked;
      refocus();
      status.textContent = e instanceof ApiError ? e.message : 'Could not send. Please try again.';
      turnstile.reset();
    }
  });

  return {
    open(board: PublicBoard, trigger?: HTMLElement | null): void {
      current = board;
      const thumb = board.public_thumb_path ?? board.public_photo_path;
      img.removeAttribute('src'); // never show the previous board's photo while this one loads
      if (thumb) img.src = boardImageUrl(thumb);
      else img.removeAttribute('src');
      hint.textContent = 'Tap to see the full photo';
      hint.hidden = !board.public_photo_path || !board.public_thumb_path;
      photoBtn.disabled = hint.hidden;
      photoBtn.removeAttribute('aria-disabled');
      meta.textContent = `Pinned ${relativeDate(board.created_at)} · ${expiresIn(board.expires_at)}`;
      // Freshness (PHASE-2C §2c.2-D): old boards stay until they expire, with a warning.
      $('board-stale').hidden =
        Date.now() - new Date(board.created_at).getTime() < POLICY.boardStaleDays * 86_400_000;
      report.hidden = true;
      consent.checked = false;
      gone.textContent = 'Board is gone';
      gone.disabled = reported.has(board.id);
      status.textContent = reported.has(board.id) ? 'You reported this board as gone.' : '';
      openDialog(dlg, trigger);
    },
  };
}
