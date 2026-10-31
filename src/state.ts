// View state that lives in the URL (NEXT-PHASES §4.3: shareable). Filters own their keys
// (src/filters.ts); this adds `view=list` and `water=1`. replaceState, so Back leaves the site
// instead of stepping through every filter tap.
import { parseFilters, writeFilters, type Filters } from './filters';

export interface UrlState {
  filters: Filters;
  view: 'map' | 'list';
  water: boolean;
}

export function readUrlState(search = location.search): UrlState {
  const q = new URLSearchParams(search);
  return {
    filters: parseFilters(q),
    view: q.get('view') === 'list' ? 'list' : 'map',
    water: q.get('water') === '1',
  };
}

export function writeUrlState(s: UrlState): void {
  const q = writeFilters(s.filters, new URLSearchParams(location.search));
  if (s.view === 'list') q.set('view', 'list');
  else q.delete('view');
  if (s.water) q.set('water', '1');
  else q.delete('water');
  const qs = q.toString();
  history.replaceState(
    history.state,
    '',
    `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`,
  );
}
