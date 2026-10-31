// admin.html (NEXT-PHASES §2a.8): magic-link login + approve/reject pending To-Let boards.
// supabase-js is used on this page ONLY (the public map uses plain fetch, see src/api.ts).
// Everything privileged happens in the admin-review Edge Function, which checks `admins`.
import { createClient, type Session } from '@supabase/supabase-js';
import { BACKEND_READY, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { escapeHtml, expiresIn, relativeDate } from '../format';

interface PendingBoard {
  id: string;
  created_at: string;
  expires_at: string;
  lat?: number;
  lng?: number;
  thumbUrl: string | null;
  fullUrl: string | null;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $('admin-status');
const say = (t: string) => (statusEl.textContent = t);

if (!BACKEND_READY) {
  say('The database is not connected (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
} else {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true },
  });
  let session: Session | null = null;

  async function review(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-review`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token ?? ''}`, // the admin's own login, not a key
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 403) throw new Error('This account is not an admin.');
    if (!res.ok || !data?.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
    return data;
  }

  function card(b: PendingBoard): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'board';
    const map =
      b.lat != null && b.lng != null
        ? `<a href="https://www.openstreetmap.org/?mlat=${b.lat}&mlon=${b.lng}#map=18/${b.lat}/${b.lng}" target="_blank" rel="noopener">Open on map</a>`
        : 'No location';
    li.innerHTML = `
      ${b.fullUrl ? `<a href="${escapeHtml(b.fullUrl)}" target="_blank" rel="noopener">` : ''}
        <img src="${escapeHtml(b.thumbUrl ?? b.fullUrl ?? '')}" alt="Uploaded To-Let board photo" loading="lazy" />
      ${b.fullUrl ? '</a>' : ''}
      <div class="board-body">
        <span>Uploaded ${relativeDate(b.created_at)} · ${expiresIn(b.expires_at)}</span>
        <span>${map}</span>
      </div>
      <div class="board-actions">
        <button type="button" class="a-btn a-btn-primary" data-act="approve">Approve</button>
        <button type="button" class="a-btn a-btn-danger" data-act="reject">Reject</button>
      </div>`;
    for (const btn of li.querySelectorAll<HTMLButtonElement>('[data-act]')) {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.act!;
        if (action === 'reject' && !confirm('Reject this board and delete its photo?')) return;
        li.querySelectorAll('button').forEach((x) => (x.disabled = true));
        try {
          await review({ action, boardId: b.id });
          li.remove();
          say(
            action === 'approve' ? 'Approved. It is now on the map.' : 'Rejected. Photo deleted.',
          );
          updateTitle();
        } catch (e) {
          say((e as Error).message);
          li.querySelectorAll('button').forEach((x) => (x.disabled = false));
        }
      });
    }
    return li;
  }

  function updateTitle(): void {
    const n = $('boards').children.length;
    $('pending-title').textContent = n ? `Waiting for review (${n})` : 'Nothing waiting for review';
  }

  async function load(): Promise<void> {
    say('Loading…');
    try {
      const data = await review({ action: 'list' });
      const boards = (data.boards as PendingBoard[]) ?? [];
      $('boards').replaceChildren(...boards.map(card));
      updateTitle();
      say(boards.length ? 'Photo links work for 10 minutes. Refresh if they stop loading.' : '');
    } catch (e) {
      $('boards').replaceChildren();
      say((e as Error).message);
    }
  }

  function render(s: Session | null): void {
    session = s;
    $('signed-out').hidden = Boolean(s);
    $('signed-in').hidden = !s;
    if (s) {
      $('who').textContent = `Signed in as ${s.user.email ?? 'admin'}`;
      void load();
    }
  }

  $<HTMLFormElement>('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $<HTMLInputElement>('login-email').value.trim();
    say('Sending…');
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/admin.html`, shouldCreateUser: true },
    });
    say(error ? error.message : 'Check your email for the login link. Open it in this browser.');
  });
  $('sign-out').addEventListener('click', () => void sb.auth.signOut());
  $('refresh').addEventListener('click', () => void load());

  sb.auth.onAuthStateChange((_event, s) => {
    if (s?.access_token !== session?.access_token) render(s);
  });
  void sb.auth.getSession().then(({ data }) => render(data.session));
}
