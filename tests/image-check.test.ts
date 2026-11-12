// Server-side upload check (SECURITY_AUDIT_REPORT.md L-3): format sniffing + GPS/XMP detection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectImage } from '../supabase/functions/_shared/image-check.ts';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const u16be = (n: number) => [n >> 8, n & 255];
const u32le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];

/** Little-endian TIFF with one IFD0 entry carrying `tag`. */
const tiff = (tag: number) => [...bytes('II'), 42, 0, ...u32le(8), 1, 0, tag & 255, tag >> 8, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const jpeg = (...segments: number[][]) => bytes([0xff, 0xd8], ...segments, [0xff, 0xda, 0, 2], [0xff, 0xd9]);
const app = (marker: number, payload: number[]) => [0xff, marker, ...u16be(payload.length + 2), ...payload];
const webp = (...chunks: [string, number[]][]) => {
  const body = chunks.flatMap(([cc, data]) => [...bytes(cc), ...u32le(data.length), ...data, ...(data.length % 2 ? [0] : [])]);
  return bytes('RIFF', u32le(4 + body.length), 'WEBP', body);
};

test('canvas-like output passes', () => {
  assert.equal(inspectImage(jpeg(app(0xe0, [...bytes('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0])), 'jpg'), 'ok');
  assert.equal(inspectImage(jpeg(app(0xe2, [...bytes('ICC_PROFILE\0'), 1, 1])), 'jpg'), 'ok');
  assert.equal(inspectImage(webp(['VP8 ', [1, 2, 3, 4]]), 'webp'), 'ok');
  // EXIF without GPS (e.g. orientation only) is allowed
  assert.equal(inspectImage(jpeg(app(0xe1, [...bytes('Exif\0\0'), ...tiff(0x0112)])), 'jpg'), 'ok');
});

test('GPS EXIF, XMP and IPTC are rejected', () => {
  assert.equal(inspectImage(jpeg(app(0xe1, [...bytes('Exif\0\0'), ...tiff(0x8825)])), 'jpg'), 'metadata');
  assert.equal(inspectImage(jpeg(app(0xe1, [...bytes('http://ns.adobe.com/xap/1.0/\0<x/>')])), 'jpg'), 'metadata');
  assert.equal(inspectImage(jpeg(app(0xed, [1, 2])), 'jpg'), 'metadata');
  assert.equal(inspectImage(webp(['VP8X', Array(10).fill(0)], ['VP8 ', [1, 2]], ['EXIF', tiff(0x8825)]), 'webp'), 'metadata');
  assert.equal(inspectImage(webp(['VP8 ', [1, 2]], ['XMP ', [...bytes('<x/>')]]), 'webp'), 'metadata');
});

test('bytes that are not the declared type are rejected', () => {
  assert.equal(inspectImage(bytes('<svg onload=alert(1)>'), 'webp'), 'wrong-type');
  assert.equal(inspectImage(webp(['VP8 ', [1, 2]]), 'jpg'), 'wrong-type');
  assert.equal(inspectImage(jpeg(), 'webp'), 'wrong-type');
});
