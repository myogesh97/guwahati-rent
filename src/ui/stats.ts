// #dlg-stats (NEXT-PHASES §4.4). Medians only; the views/function already drop groups with
// fewer than 3 rents and (migration 0007) anything older than 18 months.
import { ApiError, fetchAreaStats, fetchCityStats, fetchLocalityStats } from '../api';
import { escapeHtml, homeLabel, rupees } from '../format';
import type { CityStat, PublicPin } from '../types';
import { $dialog, openDialog } from './dialog';

type Bounds = { west: number; south: number; east: number; north: number };

const bhkLabel = (bhk: number) =>
  bhk <= 0 ? 'Room / PG / 1RK' : bhk >= 5 ? '5+ BHK' : `${bhk} BHK`;
const plural = (n: number) =>
  `${Number(n).toLocaleString('en-IN')} rent${Number(n) === 1 ? '' : 's'}`;
const table = (caption: string, head: string[], rows: string[][]) =>
  `<div class="table-scroll"><table class="stats-table"><caption class="sr-only">${caption}</caption><thead><tr>${head
    .map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${h}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr>${r.map((c, i) => (i ? `<td class="num">${c}</td>` : `<th scope="row">${c}</th>`)).join('')}</tr>`,
    )
    .join('')}</tbody></table></div>`;
const none = (what: string) =>
  `<p class="fine">Not enough rents ${what} yet. A group needs at least 3 rents from the last 18 months.</p>`;
const failed = (e: unknown) =>
  `<p class="fine">${escapeHtml(e instanceof ApiError ? e.message : 'Could not load these numbers.')}</p>`;

export function setupStats({
  demo,
  bounds,
  localityName,
}: {
  /** Demo pins aren't in the database, so its medians would not match the map: say so instead. */
  demo(): boolean;
  bounds(): Bounds | null;
  localityName(slug: string): string;
}) {
  const dlg = $dialog('dlg-stats');
  const area = document.getElementById('stats-area')!;
  const city = document.getElementById('stats-city')!;
  const locs = document.getElementById('stats-localities')!;

  async function loadArea(): Promise<void> {
    const b = bounds();
    if (!b) return;
    area.innerHTML = '<p class="fine">Loading…</p>';
    try {
      const rows = (await fetchAreaStats(b)).sort((x, y) => x.bhk - y.bhk);
      area.innerHTML = rows.length
        ? table(
            'Median rent by bedrooms in the area on screen',
            ['Home', 'Median rent', 'Based on'],
            rows.map((r) => [bhkLabel(r.bhk), rupees(r.median_rent), plural(r.n)]),
          )
        : none('in this area');
    } catch (e) {
      area.innerHTML = failed(e);
    }
  }

  async function loadCity(): Promise<void> {
    city.innerHTML = '<p class="fine">Loading…</p>';
    try {
      const rows = (await fetchCityStats()).sort(
        (a: CityStat, b: CityStat) =>
          a.bhk - b.bhk ||
          a.property_type.localeCompare(b.property_type) ||
          Number(b.gated) - Number(a.gated),
      );
      city.innerHTML = rows.length
        ? table(
            'Median rent across Guwahati by type of home and gated society',
            ['Home', 'Gated', 'Median rent', 'Based on'],
            rows.map((r) => [
              escapeHtml(
                homeLabel({
                  property_type: r.property_type as PublicPin['property_type'],
                  bhk: r.bhk,
                }),
              ),
              r.gated ? 'Gated' : 'Not gated',
              rupees(r.median_rent),
              plural(r.n),
            ]),
          )
        : none('across the city');
    } catch (e) {
      city.innerHTML = failed(e);
    }
  }

  async function loadLocalities(): Promise<void> {
    locs.innerHTML = '<p class="fine">Loading…</p>';
    try {
      const rows = [...(await fetchLocalityStats())].sort(
        (a, b) =>
          localityName(a.locality_slug).localeCompare(localityName(b.locality_slug)) ||
          a.bhk - b.bhk,
      );
      locs.innerHTML = rows.length
        ? table(
            'Median rent by locality and bedrooms',
            ['Locality', 'Home', 'Median rent', 'Water comes in', 'Based on'],
            rows.map((r) => [
              escapeHtml(localityName(r.locality_slug)),
              bhkLabel(r.bhk),
              rupees(r.median_rent),
              r.pct_waterlog_severe == null ? '—' : `${Math.round(Number(r.pct_waterlog_severe))}%`,
              plural(r.n),
            ]),
          )
        : none('in any locality');
    } catch (e) {
      locs.innerHTML = failed(e);
    }
  }

  return {
    open(trigger?: HTMLElement | null): void {
      openDialog(dlg, trigger);
      if (demo()) {
        const msg =
          '<p class="fine">Stats come from the real database, so they are off in demo mode (the demo pins are not in it).</p>';
        area.innerHTML = city.innerHTML = locs.innerHTML = msg;
        return;
      }
      void loadArea();
      void loadCity();
      void loadLocalities();
    },
  };
}
