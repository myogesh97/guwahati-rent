import { ApiError, deletePin } from '../api';
import { SITE_URL } from '../config';
import {
  DRINKING_LABEL,
  DURATION_LABEL,
  FLOOR_LABEL,
  FURNISHING_LABEL,
  POWER_CUTS_LABEL,
  POWER_LABEL,
  ROAD_LABEL,
  SEVERITY_LABEL,
  WATER_AVAILABILITY_LABEL,
  WATER_EXTRA_LABEL,
  WATER_LABEL,
  WATER_SOURCE_LABEL,
  WATERLOG_LABEL,
  WATERLOG_PLACE_LABEL,
  escapeHtml,
  homeLabel,
  litres,
  relativeDate,
  rupees,
} from '../format';
import { PREMISES_PLACES } from '../../supabase/functions/_shared/rules';
import { localityName } from '../localities';
import { browserId, forgetEditToken, getEditToken } from '../tokens';
import type { PublicPin } from '../types';
import { $dialog, closeDialog, openDialog } from './dialog';
import { toast } from './toast';

interface Options {
  onDeleted(id: string): void;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One line about water, e.g. "Every other day · 500 L on each supply day · 6–8 am". */
function waterLine(p: PublicPin): string | null {
  if (p.water_availability && p.water_availability !== 'unknown') {
    const parts = [WATER_AVAILABILITY_LABEL[p.water_availability]];
    if (p.water_litres) {
      parts.push(
        p.water_availability === 'alternate_day'
          ? `${litres(p.water_litres)} on each supply day`
          : p.water_availability === 'irregular'
            ? `about ${litres(p.water_litres)} each time`
            : `${litres(p.water_litres)} a day`,
      );
    }
    if (p.water_hours) parts.push(p.water_hours);
    return parts.join(' · ');
  }
  // Pins from before migration 0003 only have the coarse field.
  return p.water_supply && p.water_supply !== 'unknown' ? WATER_LABEL[p.water_supply] : null;
}

function monsoonLine(p: PublicPin): string | null {
  if (p.waterlog_where?.length) {
    const parts = [
      `Water collects at the ${p.waterlog_where.map((w) => WATERLOG_PLACE_LABEL[w]).join(', ')}`,
    ];
    if (p.waterlog_severity) parts.push(SEVERITY_LABEL[p.waterlog_severity]);
    if (p.waterlog_duration) parts.push(DURATION_LABEL[p.waterlog_duration]);
    return parts.join(', ');
  }
  return p.waterlogging !== 'unknown' ? WATERLOG_LABEL[p.waterlogging] : null;
}

/** Short flags for things that change daily life. Worded as reports, never as facts. */
function flags(p: PublicPin): { text: string; warn: boolean }[] {
  const out: { text: string; warn: boolean }[] = [];
  const a = p.water_availability;
  if (a === '24h') out.push({ text: '24-hour water', warn: false });
  if (a === 'alternate_day') out.push({ text: 'Water every other day', warn: true });
  if (a === 'daily_limited') out.push({ text: 'Limited water', warn: true });
  if (a === 'irregular') out.push({ text: 'Irregular water', warn: true });
  if (p.water_extra_cost === 'tanker' || p.water_extra_cost === 'both') {
    out.push({ text: 'Buys tanker water', warn: true });
  }
  const where = p.waterlog_where ?? [];
  if (where.some((w) => PREMISES_PLACES.includes(w)) || p.waterlogging === 'enters_premises') {
    out.push({ text: 'Water enters the property in heavy rain', warn: true });
  } else if (where.includes('access_road') || p.waterlogging === 'road_only') {
    out.push({ text: 'Road waterlogs in heavy rain', warn: true });
  } else if (p.waterlogging === 'none') {
    out.push({ text: 'No waterlogging reported', warn: false });
  }
  return out;
}

export function setupPinCard({ onDeleted }: Options) {
  const dlg = $dialog('dlg-pin');
  const body = document.getElementById('pin-body') as HTMLElement;
  const actions = document.getElementById('pin-actions') as HTMLElement;
  const title = document.getElementById('pin-title') as HTMLElement;

  function row(label: string, value: string | null | undefined): string {
    return value ? `<div class="kv"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>` : '';
  }

  async function open(pin: PublicPin, trigger?: HTMLElement | null): Promise<void> {
    const locality = await localityName(pin.locality_slug);
    const pg = pin.property_type === 'pg';
    const chips = flags(pin);
    const other = [
      row(
        'Deposit',
        pin.deposit_months != null
          ? `${pin.deposit_months} month${pin.deposit_months === 1 ? '' : 's'}`
          : null,
      ),
      row('Size', pin.sqft ? `${pin.sqft} sq ft` : null),
      row(
        'Parking',
        pin.parking_cars > 0 ? `${pin.parking_cars} car${pin.parking_cars > 1 ? 's' : ''}` : null,
      ),
      row(
        'Maintenance',
        pin.maintenance_incl == null
          ? null
          : pin.maintenance_incl
            ? 'Included'
            : pin.maintenance_amount != null
              ? `${rupees(pin.maintenance_amount)}/month, paid separately`
              : 'Paid separately',
      ),
      row(
        'Lives here',
        pin.occupants ? (pin.occupants === 'family' ? 'Family' : 'Bachelor(s)') : null,
      ),
      pg
        ? row('Meals', pin.pg_meals == null ? null : pin.pg_meals ? 'Included' : 'Not included')
        : '',
      pg
        ? row(
            'PG for',
            pin.pg_gender ? pin.pg_gender[0].toUpperCase() + pin.pg_gender.slice(1) : null,
          )
        : '',
    ].join('');
    const hasConditions = Boolean(
      waterLine(pin) ||
      monsoonLine(pin) ||
      pin.water_sources?.length ||
      pin.water_extra_cost ||
      pin.water_shared != null ||
      pin.drinking_water ||
      pin.water_note ||
      pin.road_in_rain ||
      pin.waterlog_note ||
      (pin.power_backup && pin.power_backup !== 'unknown') ||
      pin.power_cuts,
    );
    const asOf = pin.conditions_as_of
      ? `As the renter saw it on ${new Date(`${pin.conditions_as_of}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, for this home only. Other homes nearby may differ.`
      : 'For this home only. Other homes nearby may differ.';

    const demo = pin.id.startsWith('demo-'); // dev-only fixtures (src/demo); real ids are UUIDs
    title.textContent = 'Rent details';
    body.innerHTML = `
      ${demo ? '<p class="demo-flag">DEMO — NOT A REAL RENTAL</p>' : ''}
      <p class="pin-rent">${rupees(pin.rent)}<span>/month</span></p>
      <p class="pin-home">${escapeHtml(homeLabel(pin))} · ${FURNISHING_LABEL[pin.furnishing]} · ${pin.gated ? 'Gated society' : 'Not gated'}</p>
      ${pin.is_outlier ? '<p class="note-warn">This rent is unusually far from others nearby. Treat it with caution.</p>' : ''}
      ${chips.length ? `<ul class="flags" aria-label="Reported conditions">${chips.map((c) => `<li class="flag${c.warn ? ' flag-warn' : ''}">${escapeHtml(c.text)}</li>`).join('')}</ul>` : ''}
      <dl class="kvs">
        ${row('Area', locality ? `Near ${locality}` : null)}
        ${row('Building', pin.society_name)}
        ${row('Floor', pin.floor_level ? FLOOR_LABEL[pin.floor_level] : null)}
      </dl>
      ${
        hasConditions
          ? `<h3 class="kvs-title">Living conditions <span class="badge-unverified">Renter-reported · not verified</span></h3>
      <dl class="kvs">
        ${row('Water', waterLine(pin))}
        ${row('Source', pin.water_sources?.length ? pin.water_sources.map((w) => WATER_SOURCE_LABEL[w]).join(', ') : null)}
        ${row('Water cost', pin.water_extra_cost ? WATER_EXTRA_LABEL[pin.water_extra_cost] : null)}
        ${row('Shared supply', pin.water_shared == null ? null : pin.water_shared ? 'Yes, shared with other homes' : 'No, own supply')}
        ${row('Drinking water', pin.drinking_water ? DRINKING_LABEL[pin.drinking_water] : null)}
        ${row('Water note', pin.water_note)}
        ${row(
          'Monsoon',
          (() => {
            const m = monsoonLine(pin);
            return m ? sentence(m) : null;
          })(),
        )}
        ${row('Road in rain', pin.road_in_rain ? ROAD_LABEL[pin.road_in_rain] : null)}
        ${row('Monsoon note', pin.waterlog_note)}
        ${row('Power backup', pin.power_backup && pin.power_backup !== 'unknown' ? POWER_LABEL[pin.power_backup] : null)}
        ${row('Power cuts', pin.power_cuts ? POWER_CUTS_LABEL[pin.power_cuts] : null)}
      </dl>
      <p class="fine">${asOf}</p>`
          : ''
      }
      ${other ? `<h3 class="kvs-title">Other details</h3><dl class="kvs">${other}</dl>` : ''}
      ${pin.one_liner ? `<blockquote class="oneliner">“${escapeHtml(pin.one_liner)}”</blockquote>` : ''}
      <p class="fine">${demo ? 'Fictional demo record for testing. No such rental exists.' : `Pinned ${relativeDate(pin.created_at)} by a renter. This is what they pay, not an ad. The flat may not be available.`}</p>
    `;

    actions.innerHTML = '';
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'btn btn-ghost';
    share.textContent = 'Copy link';
    share.addEventListener('click', async () => {
      const url = `${SITE_URL}/?pin=${pin.id}`;
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied.');
      } catch {
        toast(url, 'info', 8000);
      }
    });
    actions.append(share);

    const token = getEditToken(pin.id);
    if (token) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-danger';
      del.textContent = 'Delete my pin';
      let armed = false;
      del.addEventListener('click', async () => {
        if (!armed) {
          armed = true;
          del.textContent = 'Tap again to delete';
          return;
        }
        del.disabled = true;
        del.textContent = 'Deleting…';
        try {
          await deletePin(pin.id, token, browserId());
          forgetEditToken(pin.id);
          closeDialog(dlg);
          onDeleted(pin.id);
          toast('Your pin was deleted.');
        } catch (err) {
          toast(err instanceof ApiError ? err.message : 'Could not delete. Try again.', 'error');
          del.disabled = false;
          del.textContent = 'Delete my pin';
          armed = false;
        }
      });
      actions.append(del);
    }

    openDialog(dlg, trigger);
  }

  /** Several pins at one spot: list them, then open the chosen one in the same dialog. */
  async function openMany(pins: PublicPin[], onPick: (p: PublicPin) => void): Promise<void> {
    const sorted = [...pins].sort((a, b) => a.rent - b.rent);
    const locality = await localityName(sorted[0].locality_slug);
    title.textContent = `${sorted.length} rents at this spot`;
    body.innerHTML = `<p class="hint">${locality ? `Near ${escapeHtml(locality)}. ` : ''}Pins are rounded to about 100 m, so homes in the same building share a spot.</p><ul class="pick-list"></ul>`;
    const list = body.querySelector('ul') as HTMLUListElement;
    for (const p of sorted) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick';
      b.innerHTML = `<span class="pick-rent">${rupees(p.rent)}</span><span>${escapeHtml(homeLabel(p))} · ${FURNISHING_LABEL[p.furnishing]}${p.id.startsWith('demo-') ? ' · DEMO' : ''}</span>`;
      b.addEventListener('click', () => {
        onPick(p);
        void open(p);
      });
      li.append(b);
      list.append(li);
    }
    actions.innerHTML = '';
    openDialog(dlg);
  }

  return { open, openMany };
}
