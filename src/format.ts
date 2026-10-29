import type { PublicPin } from './types';

export const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Short label for map pins: ₹8.5k, ₹14k, ₹1.2L */
export function shortRupees(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
  if (n >= 1000) {
    const k = n / 1000;
    return `₹${k >= 10 ? Math.round(k) : k.toFixed(k % 1 === 0 ? 0 : 1)}k`;
  }
  return `₹${n}`;
}

const TYPE_LABEL: Record<PublicPin['property_type'], string> = {
  flat: 'Flat',
  independent: 'Independent house',
  pg: 'PG',
  '1rk': '1RK',
  room: 'Room',
  studio: 'Studio',
};

export function homeLabel(p: Pick<PublicPin, 'property_type' | 'bhk'>): string {
  if (p.bhk && p.bhk > 0) {
    const bhk = p.bhk >= 5 ? '5+ BHK' : `${p.bhk} BHK`;
    return p.property_type === 'flat'
      ? `${bhk} flat`
      : `${bhk} ${TYPE_LABEL[p.property_type].toLowerCase()}`;
  }
  return TYPE_LABEL[p.property_type];
}

export const FURNISHING_LABEL: Record<PublicPin['furnishing'], string> = {
  furnished: 'Furnished',
  semi: 'Semi-furnished',
  unfurnished: 'Unfurnished',
};

export const WATERLOG_LABEL: Record<PublicPin['waterlogging'], string> = {
  none: 'No waterlogging',
  road_only: 'Road waterlogs in monsoon',
  enters_premises: 'Water enters the premises in monsoon',
  unknown: 'Not reported',
};

export const WATER_LABEL: Record<NonNullable<PublicPin['water_supply']>, string> = {
  '24x7': '24×7',
  timed: 'Fixed hours',
  tanker: 'Tanker',
  unknown: 'Not sure',
};

export const POWER_LABEL: Record<NonNullable<PublicPin['power_backup']>, string> = {
  full: 'Full backup',
  partial: 'Partial backup',
  none: 'No backup',
  unknown: 'Not sure',
};

export function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
