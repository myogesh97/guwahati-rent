// One To-Let board (NEXT-PHASES §2a.8): photo, age, time left (§1b), "Board is gone".
import { ApiError, boardImageUrl, reportTolet } from '../api';
import { expiresIn, relativeDate } from '../format';
import { browserId } from '../tokens';
import type { PublicBoard } from '../types';
import { $dialog, openDialog } from './dialog';
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
  const reported = new Set<string>();
  let current: PublicBoard | null = null;

  img.addEventListener('error', () => {
    if (!img.getAttribute('src')) return;
    hint.textContent = 'The photo could not load. Check your connection.';
    hint.hidden = false;
    photoBtn.disabled = true;
  });

  photoBtn.addEventListener('click', () => {
    if (!current?.public_photo_path) return;
    img.src = boardImageUrl(current.public_photo_path);
    hint.hidden = true;
    photoBtn.disabled = true;
  });

  gone.addEventListener('click', async () => {
    if (!current) return;
    if (report.hidden) {
      report.hidden = false;
      gone.textContent = 'Yes, the board is gone';
      turnstile.mount().catch((e: Error) => (status.textContent = e.message));
      return;
    }
    gone.disabled = true;
    status.textContent = 'Sending…';
    try {
      const token = await turnstile.waitForToken();
      if (!token) throw new ApiError('Please complete the spam check, then try again.', 0);
      await reportTolet(current.id, browserId(), token);
      reported.add(current.id);
      report.hidden = true;
      status.textContent = 'Thanks. Boards reported gone by 3 people are taken off the map.';
    } catch (e) {
      gone.disabled = false;
      status.textContent = e instanceof ApiError ? e.message : 'Could not send. Please try again.';
      turnstile.reset();
    }
  });

  return {
    open(board: PublicBoard, trigger?: HTMLElement | null): void {
      current = board;
      const thumb = board.public_thumb_path ?? board.public_photo_path;
      if (thumb) img.src = boardImageUrl(thumb);
      else img.removeAttribute('src');
      hint.textContent = 'Tap to see the full photo';
      hint.hidden = !board.public_photo_path || !board.public_thumb_path;
      photoBtn.disabled = hint.hidden;
      meta.textContent = `Pinned ${relativeDate(board.created_at)} · ${expiresIn(board.expires_at)}`;
      report.hidden = true;
      gone.textContent = 'Board is gone';
      gone.disabled = reported.has(board.id);
      status.textContent = reported.has(board.id) ? 'You reported this board as gone.' : '';
      openDialog(dlg, trigger);
    },
  };
}
