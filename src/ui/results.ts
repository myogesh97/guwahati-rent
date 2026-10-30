// "Rents in this area": the pins inside the current map view, nearest first, with medians.
// Desktop: a side panel. Phone: a pull-up sheet (collapsed it shows the one-line summary).
// Also the accessible, non-map way to browse pins (SPEC §8.6).
import { homeLabel, relativeDate, rupees, FURNISHING_LABEL } from '../format';
import { loadLocalities } from '../localities';
import type { PublicPin } from '../types';

const MAX_ITEMS = 60;
const MIN_FOR_MEDIAN = 3; // SPEC §5.10: no stats from fewer than 3 pins

type Bounds = { west: number; south: number; east: number; north: number };
type Point = { lat: number; lng: number };

interface Options {
  onSelect(pin: PublicPin): void;
  /** Highlight a pin on the map while its row is hovered/focused (null = clear). */
  onPreview(id: string | null): void;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Buckets people compare rents by. Rooms, PG beds and 1RKs are one bucket. */
const BUCKETS: { label: string; test: (p: PublicPin) => boolean }[] = [
  { label: 'Room / PG / 1RK', test: (p) => (p.bhk ?? 0) === 0 },
  { label: '1 BHK', test: (p) => p.bhk === 1 },
  { label: '2 BHK', test: (p) => p.bhk === 2 },
  { label: '3 BHK+', test: (p) => (p.bhk ?? 0) >= 3 },
];

export function setupResults({ onSelect, onPreview }: Options) {
  const panel = document.getElementById('results') as HTMLElement;
  const summary = document.getElementById('results-summary') as HTMLElement;
  const stats = document.getElementById('results-stats') as HTMLElement;
  const list = document.getElementById('results-list') as HTMLOListElement;
  const more = document.getElementById('results-more') as HTMLElement;
  const empty = document.getElementById('results-empty') as HTMLElement;
  const toggle = document.getElementById('results-toggle') as HTMLButtonElement;

  let names = new Map<string, string>();
  void loadLocalities().then((ls) => (names = new Map(ls.map((l) => [l.slug, l.name]))));

  function setExpanded(open: boolean): void {
    panel.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.sr-only')!.textContent = open
      ? 'Hide the list of rents'
      : 'Show the list of rents';
  }
  toggle.addEventListener('click', () => setExpanded(!panel.classList.contains('is-open')));

  function render(all: PublicPin[], view: Bounds, center: Point, canAdd: boolean): void {
    const inView = all.filter(
      (p) => p.lng >= view.west && p.lng <= view.east && p.lat >= view.south && p.lat <= view.north,
    );
    const n = inView.length;

    // Medians per bucket, only where there are enough pins.
    const rows = BUCKETS.map((b) => {
      const rents = inView.filter(b.test).map((p) => p.rent);
      return {
        label: b.label,
        n: rents.length,
        med: rents.length >= MIN_FOR_MEDIAN ? median(rents) : null,
      };
    }).filter((r) => r.med !== null);
    const top = [...rows].sort((a, b) => b.n - a.n)[0];

    summary.textContent = n
      ? `${n.toLocaleString('en-IN')} rent${n === 1 ? '' : 's'} here${top ? ` · ${top.label} median ${rupees(top.med!)}` : ''}`
      : 'No rents pinned here yet';

    stats.innerHTML = rows.length
      ? `<dl class="medians">${rows
          .map(
            (r) =>
              `<div><dt>${r.label}</dt><dd>${rupees(r.med!)}</dd><dd class="medians-n">${r.n} rents</dd></div>`,
          )
          .join('')}</dl><p class="medians-note">Medians of what renters here pay.</p>`
      : n
        ? `<p class="medians-note">Not enough rents here for a median yet (needs ${MIN_FOR_MEDIAN} of a kind).</p>`
        : '';

    // Nearest first. Squared degree distance, longitude scaled for latitude, is plenty here.
    const k = Math.cos((center.lat * Math.PI) / 180);
    const nearest = inView
      .map((p) => ({ p, d: (p.lat - center.lat) ** 2 + ((p.lng - center.lng) * k) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_ITEMS)
      .map((x) => x.p);

    list.replaceChildren(...nearest.map((p) => item(p)));
    more.hidden = n <= MAX_ITEMS;
    more.textContent = `Showing the ${MAX_ITEMS} nearest of ${n.toLocaleString('en-IN')}. Zoom in to narrow it down.`;

    empty.hidden = n > 0;
    empty.innerHTML = n
      ? ''
      : `<p><strong>No rents pinned in this part of the map yet.</strong></p><p>Zoom out to see more${canAdd ? ', or be the first to add yours.' : '.'}</p>`;
  }

  function item(p: PublicPin): HTMLLIElement {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'result';
    const where = p.locality_slug ? names.get(p.locality_slug) : null;
    const warn =
      p.waterlogging === 'enters_premises'
        ? 'Water enters in heavy rain'
        : p.waterlogging === 'road_only'
          ? 'Road waterlogs'
          : null;
    b.innerHTML = `
      <span class="result-rent">${rupees(p.rent)}<span>/mo</span></span>
      <span class="result-main">${homeLabel(p)} · ${FURNISHING_LABEL[p.furnishing]}</span>
      <span class="result-sub">${where ? `Near ${where} · ` : ''}${p.gated ? 'Gated · ' : ''}${relativeDate(p.created_at)}</span>
      ${warn ? `<span class="result-flag">${warn}</span>` : ''}`;
    b.addEventListener('click', () => {
      setExpanded(false);
      onSelect(p);
    });
    b.addEventListener('mouseenter', () => onPreview(p.id));
    b.addEventListener('focus', () => onPreview(p.id));
    b.addEventListener('mouseleave', () => onPreview(null));
    b.addEventListener('blur', () => onPreview(null));
    li.append(b);
    return li;
  }

  return {
    render,
    setExpanded,
    setLoading(text: string) {
      summary.textContent = text;
    },
  };
}
