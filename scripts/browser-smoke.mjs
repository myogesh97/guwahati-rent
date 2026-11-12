#!/usr/bin/env node
// Browser smoke test in headless Chrome, no dependencies (Node's WebSocket + the DevTools protocol).
//   npm run build && npm run test:browser          # results: stdout + <out>/results.json, screenshots
// Env: CHROME=<path to Chrome>  OUT=<dir for screenshots/results>  ONLY=prod|demo
//
// Two servers are started here: `vite preview` (the production build, with netlify.toml's real CSP
// injected) and `vite` (dev; the only place demo mode exists). Every write to Supabase (any
// /functions/v1/ call or non-GET) is BLOCKED, so this never changes production data. Reads of the
// public views do go to the project in .env, exactly as the site does.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.OUT ?? join(tmpdir(), 'gr-browser-smoke');
const ONLY = process.env.ONLY ?? 'all';
const PREVIEW = 'http://localhost:4319';
const DEV = 'http://localhost:5319';
const DEBUG_PORT = 9339;
const VIEWPORTS = [
  [375, 812],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1366, 768],
  [1440, 900],
];
const DEMOS = process.env.DEMOS?.split(',') ?? [
  'normal',
  'dense',
  'stress',
  'crowded',
  'packed',
  'max',
  'full',
];
const CSP = /Content-Security-Policy = "([^"]+)"/.exec(readFileSync('netlify.toml', 'utf8'))?.[1];

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let failures = 0;
function record(group, name, status, detail = '') {
  results.push({ group, name, status, detail });
  if (status === 'FAIL') failures++;
  console.log(`${status.padEnd(5)} ${group.padEnd(22)} ${name}${detail ? `  (${detail})` : ''}`);
}

// ---------- processes ----------
const procs = [];
function start(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  procs.push(p);
  return p;
}
async function waitHttp(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${url}`);
}
function shutdown() {
  for (const p of procs) p.kill('SIGTERM');
}
process.on('exit', shutdown);

// ---------- minimal CDP client ----------
class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method) for (const h of this.handlers.get(msg.method) ?? []) h(msg.params);
    });
  }
  static async open() {
    const t = await (
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' })
    ).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.addEventListener('open', r);
      ws.addEventListener('error', j);
    });
    const p = new Page(ws);
    p.targetId = t.id;
    return p;
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  on(method, fn) {
    this.handlers.set(method, [...(this.handlers.get(method) ?? []), fn]);
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value;
  }
  async waitFor(expr, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try {
        if (await this.eval(expr)) return true;
      } catch {}
      await sleep(100);
    }
    return false;
  }
  /** Real (trusted) click at an element's centre, so Event Timing measures it like a user tap. */
  async click(selector) {
    const box = await this
      .eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!box) throw new Error(`no element ${selector}`);
    for (const type of ['mousePressed', 'mouseReleased'])
      await this.send('Input.dispatchMouseEvent', {
        type,
        x: box.x,
        y: box.y,
        button: 'left',
        clickCount: 1,
      });
  }
  async key(key) {
    for (const type of ['keyDown', 'keyUp'])
      await this.send('Input.dispatchKeyEvent', {
        type,
        key,
        code: key,
        windowsVirtualKeyCode: key === 'Escape' ? 27 : 0,
      });
  }
  async close() {
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${this.targetId}`).catch(() => {});
    this.ws.close();
  }
}

// Injected before any page script: Web Vitals style observers + CSP violation log.
const PERF = `
window.__perf = { lcp: 0, cls: 0, inp: 0, longest: 0, csp: [] };
try {
  new PerformanceObserver((l) => { for (const e of l.getEntries()) __perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) __perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) __perf.inp = Math.max(__perf.inp, e.duration); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) __perf.longest = Math.max(__perf.longest, e.duration); }).observe({ type: 'longtask', buffered: true });
} catch {}
document.addEventListener('securitypolicyviolation', (e) => __perf.csp.push(e.violatedDirective + ' ' + e.blockedURI));
`;

async function newPage({ width, height, touch, injectCsp }) {
  const p = await Page.open();
  const log = { errors: [], thirdParty: [], failed: [], blockedWrites: 0, requests: [] };
  await Promise.all([
    p.send('Runtime.enable'),
    p.send('Log.enable'),
    p.send('Network.enable'),
    p.send('Page.enable'),
    p.send('Performance.enable'),
  ]);
  await p.send('Page.addScriptToEvaluateOnNewDocument', { source: PERF });
  await p.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: touch,
  });
  if (touch)
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // Every page starts as a first visit (no consent, no edit tokens) even though Chrome's profile is shared.
  for (const origin of [PREVIEW, DEV])
    await p.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }).catch(() => {});
  const third = (u = '') => /challenges\.cloudflare\.com/.test(u);
  p.on('Runtime.exceptionThrown', (e) =>
    log.errors.push(e.exceptionDetails?.exception?.description?.split('\n')[0] ?? 'exception'),
  );
  p.on('Runtime.consoleAPICalled', (e) => {
    if (e.type !== 'error') return;
    const text = e.args.map((a) => a.value ?? a.description ?? '').join(' ');
    (third(e.stackTrace?.callFrames?.[0]?.url) ? log.thirdParty : log.errors).push(
      text.slice(0, 200),
    );
  });
  p.on('Log.entryAdded', ({ entry }) => {
    if (entry.level !== 'error') return;
    if (/ERR_BLOCKED_BY_CLIENT|net::ERR_FAILED/.test(entry.text) && log.blockedWrites) return;
    (third(entry.url) ? log.thirdParty : log.errors).push(
      `${entry.source}: ${entry.text}`.slice(0, 200),
    );
  });
  const reqs = new Map();
  p.on('Network.requestWillBeSent', ({ requestId, request }) => {
    reqs.set(requestId, request);
    log.requests.push(`${request.method} ${request.url.slice(0, 120)}`);
  });
  p.on('Network.loadingFailed', ({ requestId, errorText, canceled }) => {
    const r = reqs.get(requestId);
    if (canceled || errorText === 'net::ERR_ABORTED' || errorText === 'net::ERR_BLOCKED_BY_CLIENT')
      return;
    log.failed.push(`${errorText} ${r?.method} ${r?.url?.slice(0, 120)}`);
  });
  p.on('Network.responseReceived', ({ response }) => {
    if (response.status >= 400 && !/favicon/.test(response.url))
      log.failed.push(`${response.status} ${response.url.slice(0, 120)}`);
  });
  // Block every write to Supabase; inject the production CSP into preview documents.
  const patterns = [{ urlPattern: '*supabase.co*', requestStage: 'Request' }];
  if (injectCsp && CSP)
    patterns.push({
      urlPattern: `${PREVIEW}/*`,
      resourceType: 'Document',
      requestStage: 'Response',
    });
  await p.send('Fetch.enable', { patterns });
  p.on('Fetch.requestPaused', async (e) => {
    try {
      if (e.responseStatusCode !== undefined) {
        const body = await p.send('Fetch.getResponseBody', { requestId: e.requestId });
        const headers = e.responseHeaders.filter(
          (h) => h.name.toLowerCase() !== 'content-security-policy',
        );
        headers.push({ name: 'Content-Security-Policy', value: CSP });
        await p.send('Fetch.fulfillRequest', {
          requestId: e.requestId,
          responseCode: e.responseStatusCode,
          responseHeaders: headers,
          body: body.body,
        });
      } else if (
        (e.request.method !== 'GET' &&
          e.request.method !== 'HEAD' &&
          e.request.method !== 'OPTIONS') ||
        /\/functions\/v1\//.test(e.request.url)
      ) {
        // area_stats is a read-only POST RPC; everything else that is not a GET is blocked.
        if (/\/rest\/v1\/rpc\/area_stats/.test(e.request.url))
          await p.send('Fetch.continueRequest', { requestId: e.requestId });
        else {
          log.blockedWrites++;
          await p.send('Fetch.failRequest', {
            requestId: e.requestId,
            errorReason: 'BlockedByClient',
          });
        }
      } else await p.send('Fetch.continueRequest', { requestId: e.requestId });
    } catch {}
  });
  return { p, log };
}

async function screenshot(p, name) {
  const { data } = await p.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}

const MAP_READY = `document.getElementById('map-status').hidden && !!document.querySelector('canvas.maplibregl-canvas')`;

/** Touch-viewport targets under 44 px (SPEC §8.6) among visible, enabled controls outside dialogs. */
const SMALL_TARGETS = `[...document.querySelectorAll('button, a[href], input, select, [role=button], .maplibregl-ctrl button')]
  .filter((e) => !e.closest('dialog') && !e.closest('.maplibregl-ctrl-attrib') && e.offsetParent !== null && !e.disabled && getComputedStyle(e).visibility !== 'hidden')
  .map((e) => [e, e.getBoundingClientRect()])
  .filter(([e, r]) => r.width > 0 && (r.width < 44 || r.height < 44) && !(e.matches('input[type=radio], input[type=checkbox]') && e.closest('label')))
  .map(([e, r]) => (e.id || e.className || e.tagName).toString().slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))`;

/** Overlap between the floating map controls (they must never cover each other). */
const OVERLAPS = `(() => {
  const sel = ['.map-tools', '.legend', '.maplibregl-ctrl-bottom-right', '.maplibregl-ctrl-bottom-left', '#btn-add', '#btn-tolet', '.water-legend', '#map-empty', '.banner:not([hidden])'];
  const boxes = sel.flatMap((s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null && !e.hidden).map((e) => [s, e.getBoundingClientRect()]))
    .filter(([, r]) => r.width && r.height);
  const out = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, r] = boxes[i], [b, q] = boxes[j];
    if (a === b) continue;
    const w = Math.min(r.right, q.right) - Math.max(r.left, q.left), h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
    if (w > 1 && h > 1 && !(r.left >= q.left && r.right <= q.right && r.top >= q.top && r.bottom <= q.bottom) && !(q.left >= r.left && q.right <= r.right && q.top >= r.top && q.bottom <= r.bottom)) out.push(a + ' / ' + b);
  }
  return out; })()`;

// ---------- production build: every viewport ----------
async function prodViewport([width, height]) {
  const g = `prod ${width}x${height}`;
  const touch = width < 1024;
  const { p, log } = await newPage({ width, height, touch, injectCsp: true });
  const t0 = Date.now();
  await p.send('Page.navigate', { url: `${PREVIEW}/` });
  const welcome = await p.waitFor(`document.getElementById('dlg-welcome')?.open`, 15000);
  record(g, 'welcome dialog on first visit', welcome ? 'PASS' : 'FAIL');
  if (welcome) await p.click('#welcome-ok');
  const ready = await p.waitFor(MAP_READY, 40000);
  record(
    g,
    'map renders (canvas, status cleared)',
    ready ? 'PASS' : 'FAIL',
    `${Date.now() - t0} ms`,
  );
  const pinsOk = await p.waitFor(
    `/rent/.test(document.getElementById('pin-count').textContent)`,
    20000,
  );
  const count = await p.eval(`document.getElementById('pin-count').textContent`);
  record(g, 'real pins loaded from public_pins', pinsOk ? 'PASS' : 'FAIL', count);
  await sleep(1500);
  await screenshot(p, `prod-${width}x${height}-map`);

  const hscroll = await p.eval(`document.documentElement.scrollWidth - innerWidth`);
  record(g, 'no horizontal page scroll', hscroll <= 0 ? 'PASS' : 'FAIL', `overflow ${hscroll}px`);
  const overlaps = await p.eval(OVERLAPS);
  record(
    g,
    'floating map controls do not overlap',
    overlaps.length ? 'FAIL' : 'PASS',
    overlaps.join('; '),
  );
  if (touch) {
    const small = await p.eval(SMALL_TARGETS);
    record(g, 'touch targets >= 44 px', small.length ? 'FAIL' : 'PASS', small.join('; '));
    const attrib = await p.eval(
      `[...document.querySelectorAll('.maplibregl-ctrl-attrib a')].filter((e) => e.offsetParent).map((e) => e.textContent.trim() + ' ' + Math.round(e.getBoundingClientRect().height) + 'px tall').join(', ')`,
    );
    if (attrib)
      record(g, 'map attribution links (inline credit text; WCAG 2.5.8 exception)', 'INFO', attrib);
  }
  const addVisible = await p.eval(
    touch
      ? `!document.getElementById('btn-add').hidden && document.getElementById('btn-add').offsetParent !== null`
      : `!document.getElementById('btn-add-top').hidden`,
  );
  record(
    g,
    touch ? 'Pin your rent button (touch)' : 'Pin your rent button (mouse)',
    addVisible ? 'PASS' : 'FAIL',
  );

  // Map -> List -> pin card -> Esc -> Map
  await p.click('#btn-view-list');
  const listOk = await p.waitFor(
    `document.body.classList.contains('view-list') && document.querySelectorAll('#list-body tr').length > 0`,
    5000,
  );
  const rows = await p.eval(`document.querySelectorAll('#list-body tr').length`);
  record(g, 'Map -> List shows the table', listOk ? 'PASS' : 'FAIL', `${rows} rows`);
  if (listOk) {
    await p.click('#list-body .row-open');
    const card = await p.waitFor(
      `document.getElementById('dlg-pin').open && /₹/.test(document.getElementById('dlg-pin').textContent)`,
      10000,
    );
    const focusIn = await p.eval(
      `document.getElementById('dlg-pin').contains(document.activeElement)`,
    );
    record(
      g,
      'list row opens the pin card; focus moves into it',
      card && focusIn ? 'PASS' : 'FAIL',
    );
    await p.key('Escape');
    const closed = await p.waitFor(`!document.getElementById('dlg-pin').open`, 3000);
    const back = await p.eval(`document.activeElement?.classList.contains('row-open')`);
    record(g, 'Esc closes the card; focus returns to the row', closed && back ? 'PASS' : 'FAIL');
    if (width === 390) await screenshot(p, `prod-${width}x${height}-list`);
  }
  await p.click('#btn-view-map');
  record(
    g,
    'List -> Map',
    (await p.waitFor(`!document.body.classList.contains('view-list')`, 3000)) ? 'PASS' : 'FAIL',
  );

  // Filters dialog (+ URL sync) and Stats dialog
  const hasFilters = await p.eval(`document.getElementById('btn-filters').offsetParent !== null`);
  if (hasFilters) {
    await p.click('#btn-filters');
    const open = await p.waitFor(`document.getElementById('dlg-filters').open`, 3000);
    await p.eval(
      `(() => { const b = document.querySelector('#dlg-filters input[name=bhk][value="2"]'); b.click(); })()`,
    );
    const url = await p.eval(`location.search`);
    record(
      g,
      'Filters dialog opens; a filter is written to the URL',
      open && /bhk=2/.test(url) ? 'PASS' : 'FAIL',
      url,
    );
    await p.eval(`document.getElementById('filters-clear').click()`);
    await p.key('Escape');
    await p.waitFor(`!document.getElementById('dlg-filters').open`, 3000);
  } else
    record(g, 'Filters button', 'NOT RUN', 'hidden at this width (reached from the toolbar menu)');
  const hasStats = await p.eval(`document.getElementById('btn-stats').offsetParent !== null`);
  if (hasStats) {
    await p.click('#btn-stats');
    const stats = await p.waitFor(
      `document.getElementById('dlg-stats').open && /median|Median/.test(document.getElementById('dlg-stats').textContent)`,
      10000,
    );
    record(g, 'Stats dialog opens with medians', stats ? 'PASS' : 'FAIL');
    await p.key('Escape');
  }
  // Monsoon heatmap toggle
  await p.click('#btn-water');
  const water = await p.waitFor(
    `!document.getElementById('water-legend').hidden && /water=1/.test(location.search)`,
    3000,
  );
  record(g, 'Monsoon heatmap toggle + legend + URL', water ? 'PASS' : 'FAIL');
  await p.click('#btn-water');

  // Empty state: filters that match nothing
  await p.send('Page.navigate', { url: `${PREVIEW}/?min=490000` });
  await p.waitFor(MAP_READY, 40000);
  const empty = await p.waitFor(`!document.getElementById('map-empty').hidden`, 15000);
  if (empty && width === 390) await screenshot(p, `prod-${width}x${height}-empty`);
  if (empty) await p.click('#map-empty-clear');
  const cleared =
    empty &&
    (await p.waitFor(
      `document.getElementById('map-empty').hidden && !/min=/.test(location.search)`,
      3000,
    ));
  record(
    g,
    'empty state when filters match 0 rents; Clear filters restores',
    empty && cleared ? 'PASS' : 'FAIL',
  );

  // To-Let dialog opens (no upload; writes are blocked anyway)
  const toletBtn = touch ? '#btn-tolet' : '#btn-tolet-top';
  if (
    await p.eval(
      `!!document.querySelector('${toletBtn}') && document.querySelector('${toletBtn}').offsetParent !== null`,
    )
  ) {
    await p.click(toletBtn);
    const tolet = await p.waitFor(`document.getElementById('dlg-tolet').open`, 3000);
    const submitDisabled = await p.eval(`document.getElementById('tolet-submit').disabled`);
    record(
      g,
      'Spot a To-Let opens; submit disabled until a photo is chosen',
      tolet && submitDisabled ? 'PASS' : 'FAIL',
    );
    await p.key('Escape');
  }

  const perf = await p.eval(`window.__perf`);
  record(
    g,
    'LCP (local preview, no throttling)',
    perf.lcp <= 2500 ? 'PASS' : 'FAIL',
    `${Math.round(perf.lcp)} ms`,
  );
  record(g, 'CLS', perf.cls <= 0.1 ? 'PASS' : 'FAIL', perf.cls.toFixed(3));
  record(
    g,
    'longest main-thread task',
    'INFO',
    `${Math.round(perf.longest)} ms (MapLibre style + worker boot; software GL)`,
  );
  record(
    g,
    'slowest interaction (Event Timing, INP proxy)',
    perf.inp <= 200 ? 'PASS' : 'FAIL',
    perf.inp ? `${Math.round(perf.inp)} ms` : 'every interaction < 16 ms',
  );
  record(
    g,
    'CSP violations (netlify.toml policy)',
    perf.csp.length ? 'FAIL' : 'PASS',
    perf.csp.join('; '),
  );
  record(
    g,
    'console errors (app)',
    log.errors.length ? 'FAIL' : 'PASS',
    log.errors.slice(0, 3).join(' | '),
  );
  record(
    g,
    'failed network requests',
    log.failed.length ? 'FAIL' : 'PASS',
    log.failed.slice(0, 3).join(' | '),
  );
  const writes = log.requests.filter(
    (r) =>
      /functions\/v1/.test(r) || (/supabase\.co/.test(r) && !/^GET|^OPTIONS|area_stats/.test(r)),
  );
  record(
    g,
    'no writes attempted while browsing',
    writes.length ? 'FAIL' : 'PASS',
    writes.join('; '),
  );
  await p.close();
}

// ---------- dev server: demo modes ----------
async function demo(scenario, [width, height]) {
  const g = `demo ${scenario} ${width}`;
  const { p, log } = await newPage({ width, height, touch: width < 1024, injectCsp: false });
  await p.send('Page.navigate', { url: `${DEV}/` });
  await p.waitFor(`document.readyState === 'complete'`, 15000);
  await p.eval(`localStorage.setItem('gr.consent.v1', 'true'); true`).catch(() => {});
  const t0 = Date.now();
  await p.send('Page.navigate', { url: `${DEV}/?demo=${scenario}` }); // consent already given: no welcome
  const ready = await p.waitFor(
    `${MAP_READY} && /DEMO/.test(document.getElementById('pin-count').textContent)`,
    60000,
  );
  const ms = Date.now() - t0;
  const count = await p.eval(`document.getElementById('pin-count').textContent`);
  record(
    g,
    'demo pins on the map',
    ready ? 'PASS' : 'FAIL',
    `${count}; ready in ${ms} ms on the dev server (unbundled)`,
  );
  const banner = await p.eval(`!!document.getElementById('demo-banner')`);
  const addOff = await p.eval(
    `['btn-add','btn-add-top','btn-tolet','btn-tolet-top'].every((id) => document.getElementById(id).hidden || document.getElementById(id).disabled)`,
  );
  record(g, 'DEMO banner shown; adding pins off', banner && addOff ? 'PASS' : 'FAIL');
  const markers = await p.eval(`document.querySelectorAll('.maplibregl-marker').length`);
  record(g, 'no DOM markers (one GeoJSON source)', markers === 0 ? 'PASS' : 'FAIL', `${markers}`);
  // Filter + list responsiveness on the full dataset
  // Let the first map frames finish (software GL in headless Chrome makes them slow), as a user would.
  await sleep(1500);
  // Like a user: open Filters (which fills the form from the current state), tick 2 BHK, close.
  await p.eval(`document.getElementById('btn-filters').click(); true`);
  await p.waitFor(`document.getElementById('dlg-filters').open`, 3000);
  const filterMs = await p.eval(
    `(() => { const t = performance.now(); document.querySelector('#dlg-filters input[name=bhk][value="2"]').click(); return performance.now() - t; })()`,
  );
  await p.key('Escape');
  await p.waitFor(`!document.getElementById('dlg-filters').open`, 3000);
  // Click -> rows painted (two animation frames), i.e. what the user waits for.
  const list =
    await p.eval(`(async () => { const t = performance.now(); document.getElementById('btn-view-list').click(); const sync = performance.now() - t;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { sync, ms: performance.now() - t, rows: document.querySelectorAll('#list-body tr').length, count: document.getElementById('pin-count').textContent, url: location.search }; })()`);
  record(
    g,
    'filter change < 50 ms; Map -> List painted < 100 ms',
    filterMs < 50 && list.ms < 100 && list.rows > 0 ? 'PASS' : 'FAIL',
    `filter ${filterMs.toFixed(1)} ms, list ${list.sync.toFixed(1)} ms to render, ${list.ms.toFixed(1)} ms to paint ${list.rows} rows; ${list.count}; ${list.url}`,
  );
  await p.eval(
    `document.getElementById('btn-view-map').click(); document.getElementById('filters-clear').click(); true`,
  );
  const { metrics } = await p.send('Performance.getMetrics');
  const heap = metrics?.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
  const perf = await p.eval(`window.__perf`);
  record(
    g,
    'heap / longest task',
    'INFO',
    `${(heap / 1048576).toFixed(1)} MB, longest task ${Math.round(perf.longest)} ms`,
  );
  record(
    g,
    'console errors',
    log.errors.length ? 'FAIL' : 'PASS',
    log.errors.slice(0, 3).join(' | '),
  );
  if (width === 390 && ['normal', 'max'].includes(scenario))
    await screenshot(p, `demo-${scenario}-${width}`);
  await p.close();
}

// ---------- run ----------
async function main() {
  if (!existsSync(CHROME)) {
    console.log(`NOT RUN: Chrome not found at ${CHROME} (set CHROME=)`);
    process.exit(2);
  }
  if (ONLY !== 'demo' && !existsSync('dist/index.html')) {
    console.log('NOT RUN: run `npm run build` first');
    process.exit(2);
  }
  const profile = mkdtempSync(join(tmpdir(), 'gr-chrome-'));
  start(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
  ]);
  if (ONLY !== 'demo') start('npx', ['vite', 'preview', '--port', '4319', '--strictPort']);
  if (ONLY !== 'prod') start('npx', ['vite', '--port', '5319', '--strictPort']);
  await waitHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  try {
    if (ONLY !== 'demo') {
      await waitHttp(PREVIEW);
      for (const vp of VIEWPORTS)
        await prodViewport(vp).catch((e) =>
          record(`prod ${vp.join('x')}`, 'run', 'FAIL', e.message),
        );
      // Production build must not contain demo mode.
      const { p } = await newPage({ width: 390, height: 844, touch: true, injectCsp: true });
      await p.send('Page.navigate', { url: `${PREVIEW}/?demo=max` });
      await p.waitFor(MAP_READY, 40000);
      await sleep(1500);
      const leaked = await p.eval(
        `!!document.getElementById('demo-banner') || /DEMO/.test(document.getElementById('pin-count').textContent)`,
      );
      record('prod', '?demo=max is ignored in the production build', leaked ? 'FAIL' : 'PASS');
      await p.close();
    }
    if (ONLY !== 'prod') {
      await waitHttp(DEV);
      for (const s of DEMOS)
        for (const vp of [
          [390, 844],
          [1366, 768],
        ])
          await demo(s, vp).catch((e) => record(`demo ${s}`, 'run', 'FAIL', e.message));
    }
  } finally {
    writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
    shutdown();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true });
  }
  const n = (s) => results.filter((r) => r.status === s).length;
  console.log(
    `\n${n('PASS')} PASS, ${n('FAIL')} FAIL, ${n('NOT RUN')} NOT RUN, ${n('INFO')} INFO. Screenshots + results.json in ${OUT}`,
  );
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  shutdown();
  process.exit(1);
});
