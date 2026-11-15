// Consistency guard (PHASE-2C §2c.1-G): every number in policy or copy comes from POLICY in
// src/config.ts, matches what the server enforces, and reads the same on every page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { POLICY } from '../src/config.ts';
import { aboutShareText, fillHtml, pinShareText, whatsappUrl } from '../src/html-vars.ts';
import {
  round3,
  round4,
  SQFT_BANDS,
  sqftBand,
  TOLET_LIFETIME_DAYS,
} from '../supabase/functions/_shared/rules.ts';

const SITE = 'https://example.test';
const PAGES = ['index.html', 'about.html', 'privacy.html', 'terms.html', '404.html'];
const POLICY_PAGES = ['about.html', 'privacy.html', 'terms.html'];
const page = (f: string) => fillHtml(readFileSync(f, 'utf8'), SITE);
/** Visible text plus JSON-LD, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'));
/** The newest migration that (re)defines `name`. */
const latest = (name: RegExp) => {
  const m = migrations.filter((sql) => name.test(sql)).at(-1);
  assert.ok(m, `no migration defines ${name}`);
  return m;
};

test('POLICY matches what the server enforces', () => {
  const x = 91.123456;
  assert.equal(round3(x), Number(x.toFixed(POLICY.pinDecimals)));
  assert.equal(round4(x), Number(x.toFixed(POLICY.boardDecimals)));
  // 1/10^d of a degree of latitude, in metres (111 km per degree), to within 10%.
  for (const [d, m] of [
    [POLICY.pinDecimals, POLICY.pinRoundingM],
    [POLICY.boardDecimals, POLICY.boardRoundingM],
  ])
    assert.ok(Math.abs(m - 111_320 / 10 ** d) / m < 0.1, `${m} m for ${d} dp`);
  assert.equal(TOLET_LIFETIME_DAYS, POLICY.boardExpiryDays);
  assert.match(
    latest(/add column if not exists expires_at/),
    new RegExp(`interval '${POLICY.boardExpiryDays} days'`),
  );

  const stats = latest(/create or replace view public\.public_stats_locality/);
  assert.match(stats, new RegExp(`interval '${POLICY.statsWindowMonths} months'`));
  assert.match(stats, new RegExp(`count\\(\\*\\) >= ${POLICY.minSample}\\b`));
  assert.match(stats, new RegExp(`report_count < ${POLICY.reportThreshold}\\b`));
  const reports = latest(/function public\.bump_report_count/);
  assert.match(reports, new RegExp(`open_count >= ${POLICY.reportThreshold}\\b`));
  assert.match(reports, new RegExp(`interval '${POLICY.reportNoteRetentionDays} days'`));
  assert.match(
    latest(/view public\.public_tolet/),
    new RegExp(`gone_reports < ${POLICY.reportThreshold}\\b`),
  );
});

test('policy pages take their numbers from POLICY, never typed in', () => {
  for (const f of [...POLICY_PAGES, '404.html']) {
    const src = text(readFileSync(f, 'utf8'));
    const typed = src.match(/\b\d+\s+(m|metres|days|months|people|rents)\b/g);
    assert.equal(typed, null, `${f} types a number into copy: ${typed}`);
    assert.doesNotMatch(src, /\b(three|several) (people|reports)\b/i, f);
  }
});

test('every placeholder is filled, and an unknown one fails the build', () => {
  for (const f of PAGES) assert.doesNotMatch(page(f), /%[A-Z_]+(\.\w+)?%/, f);
  assert.throws(() => fillHtml('%POLICY.nope%', SITE), /Unknown placeholder/);
});

test('privacy, terms and about state the same numbers', () => {
  const [about, privacy, terms] = POLICY_PAGES.map((f) => text(page(f)));
  const P = POLICY;
  for (const s of [
    `about ${P.pinRoundingM} metres`,
    `about ${P.boardRoundingM} metres`,
    `after ${P.boardExpiryDays} days`,
    `If ${P.reportThreshold} people report a board gone`,
    `A pin reported by ${P.reportThreshold} people is hidden`,
    `deleted ${P.reportNoteRetentionDays} days after the report is resolved`,
  ])
    assert.ok(privacy.includes(s), `privacy.html: "${s}"`);
  assert.ok(terms.includes(`A pin reported by ${P.reportThreshold} people is hidden`));
  for (const s of [
    `about ${P.pinRoundingM} metres`,
    `after ${P.boardExpiryDays} days`,
    `last ${P.statsWindowMonths} months`,
    `at least ${P.minSample} rents`,
    `A pin reported by ${P.reportThreshold} people is hidden`,
  ])
    assert.ok(about.includes(s), `about.html: "${s}"`);
  // Every "about N metres" on any page is one of the two roundings.
  for (const f of PAGES)
    for (const [, n] of text(page(f)).matchAll(/about (\d+) (?:m|metres)\b/g))
      assert.ok([P.pinRoundingM, P.boardRoundingM].includes(Number(n) as 110 | 11), `${f}: ${n} m`);
});

test('About FAQ JSON-LD matches the visible FAQ and privacy.html word for word', () => {
  const html = page('about.html');
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]);
  assert.equal(ld['@type'], 'FAQPage');
  assert.ok(ld.mainEntity.length >= 5 && ld.mainEntity.length <= 6);
  const visible = text(html.replace(/<script[\s\S]*?<\/script>/g, ' '));
  const privacy = text(page('privacy.html'));
  for (const q of ld.mainEntity) {
    assert.ok(visible.includes(q.name), `visible question: ${q.name}`);
    assert.ok(visible.includes(q.acceptedAnswer.text), `visible answer: ${q.name}`);
  }
  const all = ld.mainEntity
    .map((q: { acceptedAnswer: { text: string } }) => q.acceptedAnswer.text)
    .join(' ');
  // Facts shared with privacy.html, in the same words.
  for (const s of [
    `rounded to about ${POLICY.pinRoundingM} metres`,
    'A hash cannot be turned back into your IP.',
    'We do not sell data, show ads, or work with brokers.',
    `A pin reported by ${POLICY.reportThreshold} people is hidden from the map until we review it.`,
    'tap the pin and choose Delete my pin',
  ]) {
    assert.ok(all.includes(s), `FAQ: "${s}"`);
    assert.ok(privacy.includes(s), `privacy.html: "${s}"`);
  }
});

test('WhatsApp share: plain wa.me link, live URL, nothing personal', () => {
  for (const t of [pinShareText(SITE), aboutShareText(SITE)]) {
    const url = whatsappUrl(t);
    assert.ok(url.startsWith('https://wa.me/?text='));
    assert.equal(decodeURIComponent(url.slice('https://wa.me/?text='.length)), t);
    assert.ok(t.includes(SITE));
    assert.doesNotMatch(url, /utm_|ref=|fbclid|gclid/);
  }
  assert.equal(
    pinShareText(SITE),
    `I just added my rent anonymously to Guwahati Rent. See what people really pay: ${SITE}`,
  );
  assert.ok(page('about.html').includes(`href="${whatsappUrl(aboutShareText(SITE))}"`));
});

test('meta descriptions and OG text carry no counts', () => {
  let seen = 0;
  for (const f of PAGES) {
    const metas = [
      ...page(f).matchAll(
        /<meta\s+(?:name|property)="(?:description|og:description|twitter:description|og:title|twitter:title)"\s+content="([^"]*)"/g,
      ),
    ];
    for (const [, c] of metas)
      assert.doesNotMatch(c, /\d[\d,]*\+?\s*(rents?|pins?|localities|renters)/i, `${f}: ${c}`);
    seen += metas.length;
  }
  assert.ok(seen >= 10, `only ${seen} meta tags found`);
});

test('the welcome screen asks for no agreement; every form has an unticked consent box', () => {
  const html = readFileSync('index.html', 'utf8');
  const welcome = /<dialog id="dlg-welcome"[\s\S]*?<\/dialog>/.exec(html)![0];
  assert.doesNotMatch(welcome, /agree/i);
  for (const id of ['rent', 'report', 'tolet', 'board']) {
    const box = new RegExp(`<input[^>]*id="${id}-consent"[^>]*>`).exec(html)?.[0];
    assert.ok(box, `#${id}-consent`);
    assert.match(box, /type="checkbox"/);
    assert.match(box, /required/);
    assert.match(box, new RegExp(`aria-describedby="${id}-consent-links"`));
    assert.doesNotMatch(box, /checked/);
    assert.match(
      html,
      new RegExp(`id="${id}-consent-links"[\\s\\S]*?privacy\\.html[\\s\\S]*?terms\\.html`),
    );
  }
});

test('2c.2: society k-anonymity, size buckets and board freshness match migration 0010', () => {
  const sql = latest(/create or replace view public\.public_pins/);
  assert.match(sql, new RegExp(`\\) >= ${POLICY.societyMinPins} then p\\.society_name`));
  assert.match(sql, new RegExp(`\\) <= ${POLICY.societyRadiusM}\\b`));
  // The browser's sqftBand() (submit-pin's echo, demo data) uses 0010's exact buckets.
  for (const [n, band] of [
    [499, 'lt500'],
    [500, '500_800'],
    [799, '500_800'],
    [800, '800_1200'],
    [1199, '800_1200'],
    [1200, '1200_plus'],
  ] as const) {
    assert.equal(sqftBand(n), band, String(n));
    assert.equal(SQFT_BANDS.includes(band), true);
  }
  for (const [lt, band] of [
    [500, 'lt500'],
    [800, '500_800'],
    [1200, '800_1200'],
  ])
    assert.match(sql, new RegExp(`p\\.sqft < ${lt} then '${band}'`));
  assert.match(sql, /else '1200_plus'/);

  const group = `at least ${POLICY.societyMinPins} rents within ${POLICY.societyRadiusM} metres give the same name`;
  assert.ok(text(page('privacy.html')).includes(group), 'privacy.html');
  assert.ok(text(page('about.html')).includes(group), 'about.html FAQ');
  const index = text(page('index.html'));
  assert.ok(
    index.includes(`${POLICY.societyMinPins} or more rents within ${POLICY.societyRadiusM} metres`),
    'index.html society help',
  );
  assert.ok(index.includes(`Spotted ${POLICY.boardStaleDays}+ days ago, may be gone`));
});
