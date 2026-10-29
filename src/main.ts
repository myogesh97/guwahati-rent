// Boot (SPEC §8). The page shell paints first; MapLibre is loaded afterwards via dynamic import.
import { BACKEND_READY, SITE_URL } from './config';
import { fetchPins } from './api';
import { loadLocalities } from './localities';
import { hasConsented, recordConsent, saveEditToken } from './tokens';
import { $dialog, closeDialog, openDialog, wireDialogs } from './ui/dialog';
import { toast } from './ui/toast';
import { setupRentForm } from './forms/rent-pin';
import { setupPinCard } from './ui/pin-card';
import { inGuwahati } from '../supabase/functions/_shared/rules';
import type { MapView } from './map';
import type { PublicPin } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  pins: [] as PublicPin[],
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

// ---------- placement mode ----------
function startPlacement(): void {
  if (!state.map) return;
  $('placement-banner').hidden = false;
  $('btn-add').hidden = true;
  state.map.setPlacing(true);
  $<HTMLButtonElement>('placement-cancel').focus();
}

function stopPlacement(): void {
  $('placement-banner').hidden = true;
  $('btn-add').hidden = false;
  state.map?.setPlacing(false);
}

function shareText(): string {
  return `What do people in Guwahati actually pay in rent? I just added mine, anonymously. See your area and add yours: ${SITE_URL}/`;
}

async function boot(): Promise<void> {
  wireDialogs();

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
      startPlacement();
    },
  });

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
  if (!BACKEND_READY) {
    $('readonly-banner').hidden = false;
    $<HTMLButtonElement>('btn-add').disabled = true;
  }

  $('btn-add').addEventListener('click', (e) =>
    openDialog($dialog('dlg-add'), e.currentTarget as HTMLElement),
  );
  $('choose-rent').addEventListener('click', () => {
    closeDialog($dialog('dlg-add'));
    startPlacement();
  });
  $('placement-cancel').addEventListener('click', () => {
    stopPlacement();
    state.draft = null;
    state.map?.setDraft(null);
    $('btn-add').focus();
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
        $('btn-add').hidden = true; // a disabled, translucent button over pins looks broken
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

  state.map.onMapClick(async (lat, lng) => {
    if (!inGuwahati(lat, lng)) {
      toast('That spot is outside Guwahati. Only Guwahati pins are accepted for now.', 'error');
      return;
    }
    stopPlacement();
    state.draft = { lat, lng };
    state.map?.setDraft(state.draft);
    rentForm.open(state.draft, await nearestLocalityName(lat, lng));
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
