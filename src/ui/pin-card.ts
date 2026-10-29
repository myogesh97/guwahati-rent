import { ApiError, deletePin } from '../api';
import { SITE_URL } from '../config';
import {
  FURNISHING_LABEL,
  POWER_LABEL,
  WATER_LABEL,
  WATERLOG_LABEL,
  escapeHtml,
  homeLabel,
  relativeDate,
  rupees,
} from '../format';
import { localityName } from '../localities';
import { browserId, forgetEditToken, getEditToken } from '../tokens';
import type { PublicPin } from '../types';
import { $dialog, closeDialog, openDialog } from './dialog';
import { toast } from './toast';

interface Options {
  onDeleted(id: string): void;
}

export function setupPinCard({ onDeleted }: Options) {
  const dlg = $dialog('dlg-pin');
  const body = document.getElementById('pin-body') as HTMLElement;
  const actions = document.getElementById('pin-actions') as HTMLElement;

  function row(label: string, value: string | null | undefined): string {
    return value ? `<div class="kv"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>` : '';
  }

  async function open(pin: PublicPin, trigger?: HTMLElement | null): Promise<void> {
    const locality = await localityName(pin.locality_slug);
    const pg = pin.property_type === 'pg';

    body.innerHTML = `
      <p class="pin-rent">${rupees(pin.rent)}<span>/month</span></p>
      <p class="pin-home">${escapeHtml(homeLabel(pin))} · ${FURNISHING_LABEL[pin.furnishing]} · ${pin.gated ? 'Gated society' : 'Not gated'}</p>
      ${pin.is_outlier ? '<p class="note-warn">This rent is unusually far from others nearby. Treat it with caution.</p>' : ''}
      <dl class="kvs">
        ${row('Area', locality ? `Near ${locality}` : null)}
        ${row('Building', pin.society_name)}
        ${row('Monsoon', pin.waterlogging !== 'unknown' ? WATERLOG_LABEL[pin.waterlogging] : null)}
        ${row('Water', pin.water_supply ? WATER_LABEL[pin.water_supply] : null)}
        ${row('Power', pin.power_backup ? POWER_LABEL[pin.power_backup] : null)}
        ${row('Deposit', pin.deposit_months != null ? `${pin.deposit_months} month${pin.deposit_months === 1 ? '' : 's'}` : null)}
        ${row('Size', pin.sqft ? `${pin.sqft} sq ft` : null)}
        ${row('Parking', pin.parking_cars > 0 ? `${pin.parking_cars} car${pin.parking_cars > 1 ? 's' : ''}` : null)}
        ${row('Maintenance', pin.maintenance_incl == null ? null : pin.maintenance_incl ? 'Included' : 'Paid separately')}
        ${row('Lives here', pin.occupants ? (pin.occupants === 'family' ? 'Family' : 'Bachelor(s)') : null)}
        ${pg ? row('Meals', pin.pg_meals == null ? null : pin.pg_meals ? 'Included' : 'Not included') : ''}
        ${pg ? row('PG for', pin.pg_gender ? pin.pg_gender[0].toUpperCase() + pin.pg_gender.slice(1) : null) : ''}
      </dl>
      ${pin.one_liner ? `<blockquote class="oneliner">“${escapeHtml(pin.one_liner)}”</blockquote>` : ''}
      <p class="fine">Pinned ${relativeDate(pin.created_at)} by a renter. This is what they pay, not an ad. The flat may not be available.</p>
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

  return { open };
}
