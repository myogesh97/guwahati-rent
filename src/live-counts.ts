// "<N> rents · <M> localities · updated <date>" (PHASE-2C §2c.1-E). Counted at run time from
// the public_pins view, never typed into copy. Hidden below POLICY.liveCountsMin: no inflated,
// rounded-up or "+" numbers, and never a sum of rents.
import { POLICY } from './config';

export interface LiveCounts {
  rents: number;
  localities: number;
  /** created_at of the newest rent, or null when there are none. */
  latest: string | null;
}

export function liveCounts(
  pins: { locality_slug: string | null; created_at: string }[],
): LiveCounts {
  let latest: string | null = null;
  const localities = new Set<string>();
  for (const p of pins) {
    if (p.locality_slug) localities.add(p.locality_slug);
    if (!latest || p.created_at > latest) latest = p.created_at;
  }
  return { rents: pins.length, localities: localities.size, latest };
}

/** The strip's text, or null when it must stay hidden. */
export function liveCountsText(c: LiveCounts, min: number = POLICY.liveCountsMin): string | null {
  if (c.rents < min || c.rents < 2 || !c.latest) return null; // so "rents" is always plural
  const updated = new Date(c.latest).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const places =
    c.localities === 1 ? '1 locality' : `${c.localities.toLocaleString('en-IN')} localities`;
  return `${c.rents.toLocaleString('en-IN')} rents · ${places} · updated ${updated}`;
}

/** Shows or hides a strip element. */
export function renderLiveCounts(el: HTMLElement | null, c: LiveCounts): void {
  if (!el) return;
  const text = liveCountsText(c);
  el.textContent = text ?? '';
  el.hidden = !text;
}
