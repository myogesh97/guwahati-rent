// Cloudflare Turnstile, explicit rendering (SPEC §5.6). Verified server-side in every Edge Function.
import { TURNSTILE_SITE_KEY } from '../config';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
  getResponse(id: string): string | undefined;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Cloudflare's documented always-pass test key. Used ONLY in `npm run dev` when no key is set. */
const DEV_TEST_KEY = '1x00000000000000000000AA';

export const turnstileKey = (): string =>
  TURNSTILE_SITE_KEY || (import.meta.env.DEV ? DEV_TEST_KEY : '');

let loader: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  loader ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile missing'));
    s.onerror = () => {
      loader = null;
      reject(new Error('Could not load the spam check. Check your connection.'));
    };
    document.head.appendChild(s);
  });
  return loader;
}

export class TurnstileWidget {
  private id: string | null = null;
  private api: TurnstileApi | null = null;

  constructor(private readonly el: HTMLElement) {}

  async mount(): Promise<void> {
    const key = turnstileKey();
    if (!key) throw new Error('Spam check is not configured.');
    this.api = await load();
    if (this.id) {
      this.api.reset(this.id);
      return;
    }
    this.id = this.api.render(this.el, {
      sitekey: key,
      theme: 'light',
      size: 'flexible',
      action: 'submit',
    });
  }

  token(): string {
    return (this.id && this.api?.getResponse(this.id)) || '';
  }

  /** The check usually finishes on its own within a few seconds; wait for it instead of
   *  failing a fast tap on Submit. Resolves '' if it still isn't done after `ms`. */
  async waitForToken(ms = 8000): Promise<string> {
    const end = Date.now() + ms;
    for (let t = this.token(); ; t = this.token()) {
      if (t || Date.now() >= end) return t;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  reset(): void {
    if (this.id) this.api?.reset(this.id);
  }
}
