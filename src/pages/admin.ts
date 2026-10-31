// admin.html (NEXT-PHASES §2a.8): magic-link login + approve/reject pending To-Let boards.
// supabase-js is used on this page ONLY (the public map uses plain fetch, see src/api.ts).
// Everything privileged happens in the admin-review Edge Function, which checks `admins`.
import { createClient, type Session } from '@supabase/supabase-js';
import { BACKEND_READY, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import {
  FURNISHING_LABEL,
  escapeHtml,
  expiresIn,
  homeLabel,
  relativeDate,
  rupees,
} from '../format';
import type { PublicPin } from '../types';
import { loadLocalities } from '../localities';

interface PendingBoard {
  id: string;
  created_at: string;
  expires_at: string;
  lat?: number;
  lng?: number;
  thumbUrl: string | null;
  fullUrl: string | null;
}

interface ReportedPin {
  id: string;
  kind: PublicPin['kind'];
  property_type: PublicPin['property_type'];
  bhk: number | null;
  rent: number;
  furnishing: PublicPin['furnishing'];
  gated: boolean;
  locality_slug: string | null;
  society_name: string | null;
  one_liner: string | null;
  created_at: string;
  report_count: number;
  hidden: boolean;
  lat?: number;
  lng?: number;
  reports: { reason: string; message: string | null; created_at: string }[];
  firstReport: string | null;
  lastReport: string | null;
}

const REASON: Record<string, string> = {
  fake_rent: 'Rent looks fake',
  broker: 'Broker / advert',
  wrong_location: 'Wrong location',
  rented_out: 'Already rented / outdated',
  offensive: 'Offensive or personal info',
  spam: 'Spam',
  other: 'Other',
};

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

  let names = new Map<string, string>();
  void loadLocalities().then((ls) => (names = new Map(ls.map((l) => [l.slug, l.name]))));

  function reportedCard(p: ReportedPin): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'rp';
    const map =
      p.lat != null && p.lng != null
        ? ` · <a href="/?pin=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">Open on the site</a> · <a href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}" target="_blank" rel="noopener">OSM</a>`
        : '';
    li.innerHTML = `
      <h3>${rupees(p.rent)}/month · ${escapeHtml(homeLabel(p))} · ${FURNISHING_LABEL[p.furnishing]}${p.hidden ? '<span class="rp-hidden">Auto-hidden</span>' : ''}</h3>
      <p class="rp-meta">${escapeHtml([(p.locality_slug && names.get(p.locality_slug)) ?? p.locality_slug ?? 'no locality', p.gated ? 'gated' : 'not gated', p.society_name ?? ''].filter(Boolean).join(' · '))} · pinned ${relativeDate(p.created_at)}${map}</p>
      ${p.one_liner ? `<p class="rp-meta">“${escapeHtml(p.one_liner)}”</p>` : ''}
      <p><strong>${p.reports.length} open report${p.reports.length === 1 ? '' : 's'}</strong>${p.firstReport ? ` · first ${relativeDate(p.firstReport)}, last ${relativeDate(p.lastReport ?? p.firstReport)}` : ''}</p>
      <ul class="rp-reports">${p.reports
        .map(
          (r) =>
            `<li>${escapeHtml(REASON[r.reason] ?? r.reason)} <span class="fine">(${relativeDate(r.created_at)})</span>${r.message ? `<span class="rp-msg">“${escapeHtml(r.message)}”</span>` : ''}</li>`,
        )
        .join('')}</ul>
      <div class="board-actions">
        <button type="button" class="a-btn" data-act="keep_pin">Keep</button>
        <button type="button" class="a-btn a-btn-danger" data-act="remove_pin">Remove</button>
      </div>`;
    for (const btn of li.querySelectorAll<HTMLButtonElement>('[data-act]')) {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.act!;
        if (action === 'remove_pin' && !confirm('Remove this pin from the map for good?')) return;
        li.querySelectorAll('button').forEach((x) => (x.disabled = true));
        try {
          await review({ action, pinId: p.id });
          li.remove();
          say(
            action === 'keep_pin'
              ? 'Kept. The pin is on the map and its reports are closed.'
              : 'Removed.',
          );
          updateReportsTitle();
        } catch (e) {
          say((e as Error).message);
          li.querySelectorAll('button').forEach((x) => (x.disabled = false));
        }
      });
    }
    return li;
  }

  function updateReportsTitle(): void {
    const n = $('reported').children.length;
    $('reports-title').textContent = n ? `Reported pins (${n})` : 'No reported pins';
    $('tab-reports').textContent = n ? `Reported pins (${n})` : 'Reported pins';
  }

  async function loadReports(): Promise<void> {
    try {
      const data = await review({ action: 'list_reports' });
      const pins = (data.pins as ReportedPin[]) ?? [];
      $('reported').replaceChildren(...pins.map(reportedCard));
      updateReportsTitle();
    } catch (e) {
      $('reported').replaceChildren();
      say((e as Error).message);
    }
  }

  // Tabs (WAI-ARIA tabs pattern: arrow keys move between tabs).
  const tabs = [$<HTMLButtonElement>('tab-boards'), $<HTMLButtonElement>('tab-reports')];
  function selectTab(t: HTMLButtonElement, focus = false): void {
    for (const x of tabs) {
      const on = x === t;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      $(x.getAttribute('aria-controls')!).hidden = !on;
    }
    if (focus) t.focus();
  }
  for (const t of tabs) {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = tabs.indexOf(t);
      selectTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true);
    });
  }

  let rendered = false;
  function render(s: Session | null): void {
    // Called by both getSession() and the INITIAL_SESSION event: only act on a real change,
    // or the lists load twice and replace each other mid-review.
    if (rendered && s?.access_token === session?.access_token) return;
    rendered = true;
    session = s;
    $('signed-out').hidden = Boolean(s);
    $('signed-in').hidden = !s;
    if (s) {
      $('who').textContent = `Signed in as ${s.user.email ?? 'admin'}`;
      void load();
      void loadReports();
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
  $('refresh').addEventListener('click', () => {
    void load();
    void loadReports();
  });

  sb.auth.onAuthStateChange((_event, s) => render(s));
  void sb.auth.getSession().then(({ data }) => render(data.session));
}
