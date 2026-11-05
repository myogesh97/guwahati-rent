// Map / List (NEXT-PHASES §4.6): an accessible, sortable <table> of the same filtered rents.
// Sorting is done with real <button>s in the headers; aria-sort says which column and direction.
import { FURNISHING_LABEL, escapeHtml, homeLabel, relativeDate, rupees } from '../format';
import type { PublicPin } from '../types';

type Key = 'area' | 'home' | 'rent' | 'furnishing' | 'gated' | 'monsoon' | 'posted';
const PAGE = 100;
const MONSOON: Record<PublicPin['waterlogging'], [string, number]> = {
  none: ['No waterlogging', 0],
  road_only: ['Road waterlogs', 1],
  enters_premises: ['Water comes in', 2],
  unknown: ['Not reported', -1],
};
const LABEL: Record<Key, string> = {
  area: 'Area',
  home: 'Home',
  rent: 'Rent',
  furnishing: 'Furnishing',
  gated: 'Gated',
  monsoon: 'Monsoon',
  posted: 'Posted',
};

interface Options {
  onOpen(pin: PublicPin, trigger: HTMLElement): void;
  localityName(slug: string | null): string;
}

export function setupListView({ onOpen, localityName }: Options) {
  const section = document.getElementById('list-view') as HTMLElement;
  const body = document.getElementById('list-body') as HTMLTableSectionElement;
  const caption = document.getElementById('list-caption') as HTMLElement;
  const empty = document.getElementById('list-empty') as HTMLElement;
  const more = document.getElementById('list-more') as HTMLButtonElement;
  const heads = [...section.querySelectorAll<HTMLButtonElement>('th button[data-sort]')];

  let pins: PublicPin[] = [];
  let note = '';
  let sortKey: Key = 'posted';
  let dir: 1 | -1 = -1;
  let shown = PAGE;
  /** Sorted copy of `pins`; null when pins or the sort changed. Switching Map/List reuses it. */
  let sorted: PublicPin[] | null = null;

  const value = (p: PublicPin, k: Key): string | number => {
    switch (k) {
      case 'area':
        return localityName(p.locality_slug) || '~';
      case 'home':
        return `${p.bhk ?? 0}-${homeLabel(p)}`;
      case 'rent':
        return p.rent;
      case 'furnishing':
        return ['unfurnished', 'semi', 'furnished'].indexOf(p.furnishing);
      case 'gated':
        return p.gated ? 1 : 0;
      case 'monsoon':
        return MONSOON[p.waterlogging][1];
      case 'posted':
        return p.created_at;
    }
  };

  function sort(): PublicPin[] {
    // Compute each pin's sort value once (20k pins x ~15 comparisons each otherwise).
    const keyed = pins.map((p) => ({ p, v: value(p, sortKey) }));
    keyed.sort(
      (a, b) =>
        (a.v < b.v ? -1 : a.v > b.v ? 1 : 0) * dir || (a.p.created_at < b.p.created_at ? 1 : -1),
    );
    return keyed.map((k) => k.p);
  }

  /** The rows on screen are out of date (new pins arrived while the list was hidden). */
  let stale = true;

  function render(): void {
    sorted ??= sort();
    stale = false;
    const n = pins.length;
    caption.textContent = `${n.toLocaleString('en-IN')} rent${n === 1 ? '' : 's'}${note}, sorted by ${LABEL[sortKey].toLowerCase()} (${dir === 1 ? 'ascending' : 'descending'})`;
    body.replaceChildren(
      ...sorted.slice(0, shown).map((p) => {
        const tr = document.createElement('tr');
        const area = localityName(p.locality_slug);
        tr.innerHTML = `
          <td>${area ? escapeHtml(area) : '<span class="muted">Not near a listed area</span>'}</td>
          <td><button type="button" class="link-btn row-open">${escapeHtml(homeLabel(p))}</button></td>
          <td class="num">${rupees(p.rent)}</td>
          <td>${FURNISHING_LABEL[p.furnishing]}</td>
          <td>${p.gated ? 'Yes' : 'No'}</td>
          <td>${MONSOON[p.waterlogging][0]}</td>
          <td>${relativeDate(p.created_at)}</td>`;
        const btn = tr.querySelector<HTMLButtonElement>('.row-open')!;
        btn.setAttribute('aria-label', `${homeLabel(p)}, ${rupees(p.rent)} a month: details`);
        btn.addEventListener('click', () => onOpen(p, btn));
        return tr;
      }),
    );
    empty.hidden = n > 0;
    empty.textContent = n
      ? ''
      : 'No rents match. Try "Clear all" in Filters, or "Posted within: All".';
    more.hidden = n <= shown;
    more.textContent = `Show ${Math.min(PAGE, n - shown)} more (${(n - shown).toLocaleString('en-IN')} left)`;
    for (const b of heads) {
      const th = b.closest('th')!;
      th.setAttribute(
        'aria-sort',
        b.dataset.sort === sortKey ? (dir === 1 ? 'ascending' : 'descending') : 'none',
      );
    }
  }

  for (const b of heads) {
    b.addEventListener('click', () => {
      const k = b.dataset.sort as Key;
      if (k === sortKey) dir = dir === 1 ? -1 : 1;
      else {
        sortKey = k;
        dir = k === 'posted' || k === 'rent' ? -1 : 1;
      }
      shown = PAGE;
      sorted = null;
      render();
    });
  }
  more.addEventListener('click', () => {
    const firstNew = body.rows.length;
    shown += PAGE;
    render();
    body.rows[firstNew]?.querySelector<HTMLButtonElement>('.row-open')?.focus();
  });

  return {
    setPins(next: PublicPin[], extra = '') {
      if (next !== pins) sorted = null;
      stale = true;
      pins = next;
      note = extra;
      shown = PAGE;
      if (!section.hidden) render();
    },
    show(on: boolean) {
      section.hidden = !on;
      // Back to the list with the same pins: the rows are still right, keep them.
      if (on && stale) render();
    },
  };
}
