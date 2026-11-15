// PII filter for public free text (PHASE-2C §2c.2-A; SECURITY_AUDIT_REPORT.md M-3).
// Dependency-free, so the browser (src/, via rules.ts) and the Edge Functions run the same checks.
// It rejects, never silently strips: the renter sees which answer to fix and why.
// Report messages are private (moderators only) and are NOT run through this.

export type PiiKind = 'contact' | 'url' | 'unit';

export const PII_MESSAGE: Record<PiiKind, string> = {
  contact: 'Please remove phone numbers and email addresses. Everything here is shown publicly.',
  url: 'Please remove web links. Everything here is shown publicly.',
  unit: 'Please give only the building or society name, without a flat, house or door number.',
};

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
// Digits with at most one space, dot, dash or bracket between them: "98640 12345", "+91-98640-12345".
const DIGIT_RUN = /\d(?:[\s.\-()]?\d)+/g;
// A mobile number with digits masked or partly typed: "98xxxxxxxx", "+91 98xxx xxxxx".
const MASKED_PHONE = /(?<![\w])(?:\+?91[\s-]?|0)?[6-9][\dx*](?:[\s-]?[\dx*]){8}(?![\w])/i;

function looksLikePhone(digits: string): boolean {
  let d = digits;
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2); // +91 98640 12345
  else if (d.length === 11 && d.startsWith('0')) return true; // 0361 2345678, 098640 12345
  return d.length === 10 && /^[6-9]/.test(d); // Indian mobile
}

/** True when the text holds an email address or an Indian phone number (even a masked one). */
export function hasContactInfo(s: string): boolean {
  if (EMAIL.test(s) || MASKED_PHONE.test(s)) return true;
  for (const [run] of s.matchAll(DIGIT_RUN)) {
    // The whole run ("98640 12345") and each unbroken block in it ("rent 9000 9864012345").
    const parts = [run, ...run.split(/[\s.\-()]/)];
    if (parts.some((x) => looksLikePhone(x.replace(/\D/g, '')))) return true;
  }
  return false;
}

const URL =
  /\b(?:https?:\/\/|www\.)\S|\b[a-z0-9-]+\.(?:com|in|net|org|co|io|info|me|app|xyz|site|online)\b/i;

/**
 * Flat, house or door numbers. Only for the building/society name: there a number points at one
 * home, while in notes "500 L tank" or "5 min walk" are fine.
 */
const UNIT = [
  // "Flat A-302", "Flat no. 3B", "H.No. 12", "Apt 4C", "door #7"
  /\b(?:flat|unit|apt|apartment|house|h\.?\s?no|door|plot|room)\b\.?\s*(?:no\b\.?|number)?\s*[#:]?\s*[a-z]?\s*[-/]?\s*\d+/i,
  // "A-302", "B12", "C 1203"
  /\b[a-z]\s?[-/]?\s?\d{2,4}\b/i,
  // "701 Avalon Heights", "302A"
  /\b\d{3,4}[a-z]?\b/i,
  // "Tower X 1203"
  /\btower\s+[a-z0-9]{1,2}\b[\s,-]*\d{3,4}\b/i,
];

export type Scrubbed =
  { ok: true; value: string | null } | { ok: false; kind: PiiKind; message: string };

/**
 * Checks one public free-text answer. `units` adds the flat/unit-number rules (society name).
 * Returns the trimmed value (null when empty), or why it can't be published.
 */
export function scrubPublicText(
  s: string | null | undefined,
  { units = false }: { units?: boolean } = {},
): Scrubbed {
  const value = (s ?? '').trim() || null;
  if (!value) return { ok: true, value: null };
  const kind: PiiKind | null = hasContactInfo(value)
    ? 'contact'
    : URL.test(value)
      ? 'url'
      : units && UNIT.some((r) => r.test(value))
        ? 'unit'
        : null;
  return kind ? { ok: false, kind, message: PII_MESSAGE[kind] } : { ok: true, value };
}
