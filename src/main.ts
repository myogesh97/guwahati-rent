// Boot (SPEC §8). The page shell paints first; MapLibre is loaded afterwards via dynamic import.
import { BACKEND_READY, SITE_URL } from './config';
import { fetchBoards, fetchPins } from './api';
import { loadLocalities } from './localities';
import { hasConsented, recordConsent, saveEditToken } from './tokens';
import { $dialog, closeDialog, openDialog, wireDialogs } from './ui/dialog';
import { toast } from './ui/toast';
import { setupRentForm } from './forms/rent-pin';
import { setupPinCard } from './ui/pin-card';
import { setupToletForm } from './forms/tolet';
import { setupBoardCard } from './ui/board-card';
import { inGuwahati } from '../supabase/functions/_shared/rules';
import type { MapView } from './map';
import type { PublicBoard, PublicPin } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  pins: [] as PublicPin[],
  boards: [] as PublicBoard[],
  /** What the centre pin is being placed for: your rent, or a To-Let board you photographed. */
  placing: 'rent' as 'rent' | 'tolet',
  map: null as MapView | null,
  draft: null as { lat: number; lng: number } | null,
};

function setStatus(text: string | null): void {
  const el = $('map-status');
  el.textContent = text ?? '';
  el.hidden = !text;
}

function renderPins(): void {
  state.map?.setPins(state.pins);
  const n = state.pins.length;
  $('pin-count').textContent = n
    ? `${n.toLocaleString('en-IN')} ${document.getElementById('demo-banner') ? 'DEMO pin' : 'rent'}${n === 1 ? '' : 's'}${document.getElementById('demo-banner') ? '' : ' pinned'}`
    : '';
}

async function nearestLocalityName(lat: number, lng: number): Promise<string | null> {
  const list = await loadLocalities();
  let best: string | null = null;
  let bestD = Infinity;
  for (const l of list) {
    const d = (l.lat - lat) ** 2 + ((l.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = l.name;
    }
  }
  return Math.sqrt(bestD) * 111_000 <= 3000 ? best : null;
}

// ---------- adding a pin ----------
// Desktop (mouse): click any empty spot on the map. Phone/keyboard: "Pin your rent" shows a
// fixed pin at the map centre; move the map under it and press "Use this spot".
const hasMouse = (): boolean => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
let canAdd = BACKEND_READY;

function syncAddUi(): void {
  const placing = !$('placement-banner').hidden;
  $('map-hint').hidden = !canAdd || placing || !hasMouse();
  for (const id of ['btn-add', 'btn-add-top', 'btn-tolet', 'btn-tolet-top'])
    $(id).hidden = placing || !canAdd;
  $('map').classList.toggle('can-add', canAdd && hasMouse() && !placing);
}

const PLACEMENT_TEXT = {
  rent: '<strong>Move the map until the pin is on your home.</strong> A nearby spot is fine. We round it to about 100 m.',
  tolet: '<strong>Move the map until the pin is on the board.</strong> Then press "Use this spot".',
};

function startPlacement(
  at?: { lat: number; lng: number } | null,
  purpose: 'rent' | 'tolet' = 'rent',
): void {
  if (!state.map) return;
  state.placing = purpose;
  $('placement-text').innerHTML = PLACEMENT_TEXT[purpose];
  // Street level, so the pin can be lined up with a road (the city view is too coarse).
  const c = at ?? state.map.getCenter();
  state.map.focus(c.lat, c.lng, at ? 16 : 15);
  state.draft = null;
  state.map.setDraft(null); // the centre pin stands in for it
  $('placement-banner').hidden = false;
  $('crosshair').hidden = false;
  document.body.classList.add('is-placing');
  state.map.setPlacing(true);
  syncAddUi();
  $<HTMLButtonElement>('placement-use').focus();
}

function stopPlacement(): void {
  $('placement-banner').hidden = true;
  $('crosshair').hidden = true;
  document.body.classList.remove('is-placing');
  state.map?.setPlacing(false);
  syncAddUi();
}

function shareText(): string {
  return `What do people in Guwahati actually pay in rent? I just added mine, anonymously. See your area and add yours: ${SITE_URL}/`;
}

async function boot(): Promise<void> {
  wireDialogs();

  async function pickSpot({ lat, lng }: { lat: number; lng: number }): Promise<void> {
    if (!inGuwahati(lat, lng)) {
      toast('That spot is outside Guwahati. Only Guwahati pins are accepted for now.', 'error');
      return;
    }
    stopPlacement();
    if (state.placing === 'tolet') {
      toletForm.resume({ lat, lng });
      return;
    }
    state.draft = { lat, lng };
    state.map?.setDraft(state.draft);
    rentForm.open(state.draft, await nearestLocalityName(lat, lng));
  }

  const rentForm = setupRentForm({
    onSubmitted(result) {
      saveEditToken(result.id, result.editToken);
      state.pins = [result.pin, ...state.pins.filter((p) => p.id !== result.id)];
      state.draft = null;
      state.map?.setDraft(null);
      renderPins();
      state.map?.select(result.id);
      const wa = $<HTMLAnchorElement>('share-whatsapp');
      wa.href = `https://wa.me/?text=${encodeURIComponent(shareText())}`;
      openDialog($dialog('dlg-shared'));
    },
    onMoveRequested() {
      startPlacement(state.draft ?? undefined);
    },
  });

  const toletForm = setupToletForm({
    pickOnMap(near) {
      startPlacement(near, 'tolet');
    },
    onUploaded() {
      // Nothing to draw yet: boards appear only after review.
    },
  });
  const boardCard = setupBoardCard();
  $dialog('dlg-board').addEventListener('close', () => state.map?.selectBoard(null));

  const pinCard = setupPinCard({
    onDeleted(id) {
      state.pins = state.pins.filter((p) => p.id !== id);
      state.map?.select(null);
      renderPins();
    },
  });

  $dialog('dlg-pin').addEventListener('close', () => state.map?.select(null));
  $dialog('dlg-rent-pin').addEventListener('close', () => {
    // Closing the form without submitting drops the draft pin (unless we're moving it).
    if ($('placement-banner').hidden) {
      state.draft = null;
      state.map?.setDraft(null);
    }
  });

  // ---------- buttons ----------
  if (!BACKEND_READY) $('readonly-banner').hidden = false;
  syncAddUi();
  window.matchMedia('(hover: hover) and (pointer: fine)').addEventListener('change', syncAddUi);

  for (const id of ['btn-add', 'btn-add-top'])
    $(id).addEventListener('click', () => startPlacement());
  for (const id of ['btn-tolet', 'btn-tolet-top'])
    $(id).addEventListener('click', (e) => toletForm.start(e.currentTarget as HTMLElement));
  $('placement-cancel').addEventListener('click', () => {
    stopPlacement();
    if (state.placing === 'tolet') {
      toletForm.resume(null); // back to the photo, nothing lost
      return;
    }
    state.draft = null;
    state.map?.setDraft(null);
    (hasMouse() ? $('btn-add-top') : $('btn-add')).focus();
  });
  $('placement-use').addEventListener('click', () => {
    if (state.map) void pickSpot(state.map.getCenter());
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('placement-banner').hidden) $('placement-cancel').click();
  });

  $('share-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`${SITE_URL}/`);
      toast('Link copied.');
    } catch {
      toast(`${SITE_URL}/`, 'info', 8000);
    }
  });

  // ---------- welcome ----------
  if (!hasConsented()) openDialog($dialog('dlg-welcome'));
  $('welcome-ok').addEventListener('click', () => {
    recordConsent();
    closeDialog($dialog('dlg-welcome'));
  });

  // ---------- data + map in parallel ----------
  // Demo mode (?demo=normal|dense|stress) exists only in `npm run dev`: in production builds
  // import.meta.env.DEV is false, so this branch and the demo module are removed entirely.
  const demo = import.meta.env.DEV ? new URLSearchParams(location.search).get('demo') : null;
  const pinsPromise = demo
    ? import('./demo/demo-data').then(({ SCENARIOS, demoPins }) => {
        const scenario = (demo in SCENARIOS ? demo : 'dense') as keyof typeof SCENARIOS;
        const banner = document.createElement('div');
        banner.id = 'demo-banner';
        banner.className = 'banner banner-demo';
        banner.setAttribute('role', 'note');
        banner.innerHTML = `<strong>DEMO MODE: fictional rentals, not real listings.</strong> Scenario "${scenario}", ${SCENARIOS[scenario]} pins. Adding pins is off. <a href="/">Exit demo</a>`;
        $('readonly-banner').before(banner);
        $('readonly-banner').hidden = true;
        canAdd = false;
        syncAddUi();
        return demoPins(scenario);
      })
    : fetchPins().catch(() => {
        toast('Could not load rents. Check your connection and refresh.', 'error', 8000);
        return [] as PublicPin[];
      });

  try {
    const { createMap } = await import('./map');
    state.map = await createMap($('map'));
    setStatus(null);
  } catch (err) {
    console.error(err);
    setStatus('The map could not load. Check your connection and refresh the page.');
    return;
  }

  state.pins = await pinsPromise;
  renderPins();
  // Boards are a separate layer; if they fail (e.g. before migration 0004) rents still show.
  if (!demo) {
    void fetchBoards()
      .then((boards) => {
        state.boards = boards;
        state.map?.setBoards(boards);
      })
      .catch((e: Error) => console.warn('To-Let boards not loaded:', e.message));
  }

  state.map.onBoardClick((id) => {
    const board = state.boards.find((b) => b.id === id);
    if (!board) return;
    state.map?.selectBoard(id);
    boardCard.open(board);
  });

  state.map.onPinClick((ids) => {
    const pins = ids
      .map((id) => state.pins.find((p) => p.id === id))
      .filter((p): p is PublicPin => Boolean(p));
    if (!pins.length) return;
    if (pins.length === 1) {
      state.map?.select(pins[0].id);
      void pinCard.open(pins[0]);
    } else {
      // Several rents at the same ~100 m spot (e.g. one building): let the user pick.
      void pinCard.openMany(pins, (p) => state.map?.select(p.id));
    }
  });

  // While choosing a spot, a click/tap picks it directly (same as "Use this spot").
  state.map.onMapClick((lat, lng) => void pickSpot({ lat, lng }));
  // Desktop only: clicking empty map starts a pin right there. On touch screens a tap is
  // usually exploring, so phones use the button + centre pin instead.
  state.map.onEmptyClick((lat, lng) => {
    if (!canAdd || !hasMouse() || document.querySelector('dialog[open]')) return;
    void pickSpot({ lat, lng });
  });

  // Deep links: /?pin=<id> and /?area=<slug>
  const params = new URLSearchParams(location.search);
  const pinId = params.get('pin');
  const area = params.get('area');
  if (pinId) {
    const pin = state.pins.find((p) => p.id === pinId);
    if (pin) {
      state.map.focus(pin.lat, pin.lng, 15);
      state.map.select(pin.id);
      if (hasConsented()) void pinCard.open(pin);
    }
  } else if (area) {
    const loc = (await loadLocalities()).find((l) => l.slug === area);
    if (loc) state.map.focus(loc.lat, loc.lng, 14);
  }
}

void boot();
