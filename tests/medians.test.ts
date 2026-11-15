// Medians, never means (SPEC §5.10, PHASE-2C §2c.1-A / F1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PIN_CLUSTER, pinLayers } from '../src/layers.ts';
import { fillHtml } from '../src/html-vars.ts';

const MEAN_WORDS = /\b(average[sd]?|averaging|avg|mean)\b/i;

test('rent clusters carry no rent sum, so no mean can be drawn', () => {
  assert.equal('clusterProperties' in PIN_CLUSTER, false);
  const json = JSON.stringify(pinLayers);
  assert.doesNotMatch(json, /rentSum|cluster-avg/);
  // The only cluster text is the count.
  const labels = pinLayers.filter(
    (l) => l.type === 'symbol' && JSON.stringify(l.filter) === '["has","point_count"]',
  );
  assert.deepEqual(
    labels.map((l) => JSON.stringify((l.layout as Record<string, unknown>)['text-field'])),
    ['["to-string",["get","point_count"]]'],
  );
});

/** Visible text of an HTML page: no comments, scripts (except JSON-LD) or tags. */
function htmlText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

/** String literals in a TypeScript file (comments dropped first). */
function tsStrings(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  return [...code.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map(
    (m) => m[0],
  );
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

test('no page says average or mean', () => {
  for (const page of ['index.html', 'about.html', 'privacy.html', 'terms.html', '404.html']) {
    const text = htmlText(fillHtml(readFileSync(page, 'utf8'), 'https://example.test'));
    assert.doesNotMatch(text, MEAN_WORDS, page);
  }
});

test('no user-facing string in src/ says average or mean', () => {
  for (const file of walk('src').filter((f) => f.endsWith('.ts'))) {
    const hits = tsStrings(readFileSync(file, 'utf8')).filter((s) => MEAN_WORDS.test(s));
    assert.deepEqual(hits, [], file);
  }
});
