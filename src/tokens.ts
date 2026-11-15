// Edit tokens + browser id in localStorage (SPEC §5.8). Storage can be blocked or empty,
// so every access is wrapped and the app works without it (you just can't delete later).

const TOKENS_KEY = 'gr.editTokens';
const BROWSER_KEY = 'gr.browserId';
// Old name kept so returning visitors don't see the welcome again.
const WELCOME_KEY = 'gr.consent.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: degrade silently */
  }
}

let memoryBrowserId: string | null = null;

/** Random per-browser id used for rate limits and report de-duplication. Not a tracking id. */
export function browserId(): string {
  const existing = read<string | null>(BROWSER_KEY, null);
  if (existing) return existing;
  const id = memoryBrowserId ?? crypto.randomUUID();
  memoryBrowserId = id;
  write(BROWSER_KEY, id);
  return id;
}

export function saveEditToken(pinId: string, token: string): void {
  const all = read<Record<string, string>>(TOKENS_KEY, {});
  all[pinId] = token;
  write(TOKENS_KEY, all);
}

export function getEditToken(pinId: string): string | null {
  return read<Record<string, string>>(TOKENS_KEY, {})[pinId] ?? null;
}

export function forgetEditToken(pinId: string): void {
  const all = read<Record<string, string>>(TOKENS_KEY, {});
  delete all[pinId];
  write(TOKENS_KEY, all);
}

/** The welcome was shown and closed once. It is not consent: each form asks for that. */
export const hasSeenWelcome = (): boolean => read<boolean>(WELCOME_KEY, false);
export const markWelcomeSeen = (): void => write(WELCOME_KEY, true);
