// Server-side check of uploaded To-Let photos (SECURITY_AUDIT_REPORT.md L-3). The browser re-encodes
// photos through a canvas, which drops all metadata; this catches a client that skipped that step.
// It only reads container structure (no decoding): the bytes must be the declared format and must
// carry no XMP and no EXIF GPS block. Canvas output never has either.

export type ImageVerdict = 'ok' | 'wrong-type' | 'metadata';

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

/** True when a TIFF/EXIF block's first IFD has a GPSInfo pointer (tag 0x8825). */
function exifHasGps(b: Uint8Array, start: number, end: number): boolean {
  if (end - start < 8) return false;
  const order = ascii(b, start, 2);
  if (order !== 'II' && order !== 'MM') return false;
  const v = new DataView(b.buffer, b.byteOffset + start, end - start);
  const le = order === 'II';
  const ifd = v.getUint32(4, le);
  if (ifd + 2 > v.byteLength) return true; // malformed: treat as suspicious
  const count = v.getUint16(ifd, le);
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    if (at + 2 > v.byteLength) return true;
    if (v.getUint16(at, le) === 0x8825) return true;
  }
  return false;
}

function inspectJpeg(b: Uint8Array): ImageVerdict {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return 'wrong-type';
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end of image: no more headers
    const len = (b[i + 2] << 8) | b[i + 3];
    const body = i + 4;
    if (marker === 0xe1) {
      if (ascii(b, body, 6) === 'Exif\0\0' && exifHasGps(b, body + 6, i + 2 + len)) return 'metadata';
      if (ascii(b, body, 28) === 'http://ns.adobe.com/xap/1.0/') return 'metadata'; // XMP
    }
    if (marker === 0xed) return 'metadata'; // APP13: Photoshop / IPTC
    i += 2 + len;
  }
  return 'ok';
}

function inspectWebp(b: Uint8Array): ImageVerdict {
  if (b.length < 16 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return 'wrong-type';
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 12;
  while (i + 8 <= b.length) {
    const fourcc = ascii(b, i, 4);
    const size = v.getUint32(i + 4, true);
    if (fourcc === 'XMP ') return 'metadata';
    if (fourcc === 'EXIF') {
      let s = i + 8;
      if (ascii(b, s, 6) === 'Exif\0\0') s += 6;
      if (exifHasGps(b, s, Math.min(b.length, i + 8 + size))) return 'metadata';
    }
    i += 8 + size + (size % 2);
  }
  return 'ok';
}

export function inspectImage(bytes: Uint8Array, ext: 'webp' | 'jpg'): ImageVerdict {
  return ext === 'webp' ? inspectWebp(bytes) : inspectJpeg(bytes);
}
