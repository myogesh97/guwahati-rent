// Boot (SPEC §8). The page shell paints first; MapLibre is loaded afterwards via dynamic import.
import { BACKEND_READY, SITE_URL } from './config';
import { fetchBoards, fetchPins } from './api';
import { loadLocalities, nearestLocality } from './localities';
import { applyFilters, type Filters } from './filters';
import { readUrlState, writeUrlState } from './state';
import { setupFiltersDialog } from './ui/filters-dialog';
import { setupListView } from './ui/list-view';
import { setupStats } from './ui/stats';
import { setupReport } from './ui/report';
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
  /** Filters, Map/List and the monsoon layer, mirrored in the URL (NEXT-PHASES §4.3). */
  url: readUrlState(),
  /** Locality names by slug (public/localities.json), for the list view. */
  names: new Map<string, string>(),
};

const isDemo = (): boolean => Boolean(document.getElementById('demo-banner'));
const localityLabel = (slug: string | null): string => (slug && state.names.get(slug)) || '';
let list: ReturnType<typeof setupListView> | null = null;
let filtersUi: ReturnType<typeof setupFiltersDialog> | null = null;

function setStatus(text: string | null): void {
  const el = $('map-status');
  el.textContent = text ?? '';
  el.hidden = !text;
}

/** Draws the filtered rents on the map (pins + monsoon heatmap) and in the list. */
function renderPins(): void {
  const f = state.url.filters;
  const visible = applyFilters(state.pins, f);
  state.map?.setPins(visible);
  state.map?.setWaterPins(visible);
  state.map?.setBoards(f.boards ? state.boards : []);
  const n = visible.length;
  const total = state.pins.length;
  const what = isDemo() ? 'DEMO pin' : 'rent';
  const s = (k: number) => (k === 1 ? '' : 's');
  $('pin-count').textContent = !total
    ? ''
    : n === total
      ? `${n.toLocaleString('en-IN')} ${what}${s(n)}${isDemo() ? '' : ' pinned'}`
      : `${n.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} ${what}s shown`;
  list?.setPins(visible, n === total ? '' : ` (of ${total.toLocaleString('en-IN')}, filtered)`);
  filtersUi?.sync();
}

function setFilters(f: Filters): void {
  state.url.filters = f;
  writeUrlState(state.url);
  renderPins();
}

function setView(view: 'map' | 'list'): void {
  state.url.view = view;
  writeUrlState(state.url);
  document.body.classList.toggle('view-list', view === 'list');
  $('btn-view-map').setAttribute('aria-pressed', String(view === 'map'));
  $('btn-view-list').setAttribute('aria-pressed', String(view === 'list'));
  list?.show(view === 'list');
  if (view === 'map') state.map?.resize();
}

function setWater(on: boolean): void {
  state.url.water = on;
  writeUrlState(state.url);
  $('btn-water').setAttribute('aria-pressed', String(on));
  $('water-legend').hidden = !on;
  state.map?.showWater(on);
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
  if (state.url.view === 'list') setView('map'); // you place a pin on the map
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
    rentForm.open(state.draft, await nearestLocality(lat, lng));
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
    onUpdated(pin) {
      const i = state.pins.findIndex((p) => p.id === pin.id);
      if (i >= 0) state.pins[i] = Object.assign(state.pins[i], pin);
      renderPins();
      state.map?.select(pin.id);
      toast('Saved. Thanks for keeping it up to date.');
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

  const report = setupReport();
  const pinCard = setupPinCard({
    onEdit(pin, token) {
      rentForm.edit(pin, token, localityLabel(pin.locality_slug) || null);
    },
    onReport(pin, trigger) {
      report.open(pin.id, trigger);
    },
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

  // ---------- map tools: filters, list, stats, monsoon ----------
  void loadLocalities().then((ls) => {
    state.names = new Map(ls.map((l) => [l.slug, l.name]));
    renderPins();
  });
  list = setupListView({
    localityName: localityLabel,
    onOpen(pin, trigger) {
      void pinCard.open(pin, trigger);
    },
  });
  filtersUi = setupFiltersDialog({
    get: () => state.url.filters,
    set: setFilters,
    count: (f) => applyFilters(state.pins, f).length,
  });
  const stats = setupStats({
    demo: isDemo,
    bounds: () => state.map?.getBounds() ?? null,
    localityName: (slug) => localityLabel(slug) || slug,
  });
  $('btn-stats').addEventListener('click', (e) => stats.open(e.currentTarget as HTMLElement));
  $('btn-view-map').addEventListener('click', () => setView('map'));
  $('btn-view-list').addEventListener('click', () => setView('list'));
  $('btn-water').addEventListener('click', () => setWater(!state.url.water));
  setView(state.url.view);
  $('btn-water').setAttribute('aria-pressed', String(state.url.water));
  $('water-legend').hidden = !state.url.water;

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
  state.map.showWater(state.url.water);
  renderPins();
  // Boards are a separate layer; if they fail (e.g. before migration 0004) rents still show.
  if (!demo) {
    void fetchBoards()
      .then((boards) => {
        state.boards = boards;
        renderPins();
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
