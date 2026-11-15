// Build-time placeholders in the HTML pages, filled by vite.config.ts. Pure, so tests run the
// same transform on the source pages that the build does (tests/policy.test.ts).
import { POLICY } from './config';

/** After a rent pin is added (PHASE-2C §2c.1-D). No tracking parameters, nothing personal. */
export const pinShareText = (siteUrl: string): string =>
  `I just added my rent anonymously to Guwahati Rent. See what people really pay: ${siteUrl}`;

/** About page: the reader may not have pinned yet, so this one doesn't say "I just added". */
export const aboutShareText = (siteUrl: string): string =>
  `See what people in Guwahati really pay in rent, shared anonymously by renters: ${siteUrl}`;

/** wa.me is a plain link (navigation), so it needs no SDK and no CSP change. */
export const whatsappUrl = (text: string): string =>
  `https://wa.me/?text=${encodeURIComponent(text)}`;

/**
 * `%SITE_URL%`, `%WHATSAPP_ABOUT_URL%` and `%POLICY.<key>%` (src/config.ts). An unknown key
 * fails the build, so a typo can never ship as literal placeholder text.
 */
export function fillHtml(html: string, siteUrl: string): string {
  return html
    .replaceAll('%SITE_URL%', siteUrl)
    .replaceAll('%WHATSAPP_ABOUT_URL%', whatsappUrl(aboutShareText(siteUrl)))
    .replace(/%POLICY\.(\w+)%/g, (_, key: string) => {
      if (!(key in POLICY)) throw new Error(`Unknown placeholder %POLICY.${key}%`);
      return String(POLICY[key as keyof typeof POLICY]);
    });
}
