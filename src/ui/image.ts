// To-Let photo compression (NEXT-PHASES §2a.3). Native canvas only, no library.
// Re-encoding through a canvas drops EXIF (including GPS) and every other metadata block,
// which is required for privacy: the original file is never uploaded.
import type { ToletExt } from '../../supabase/functions/_shared/rules';

export class ImageError extends Error {}

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const FULL = { edge: 1280, qualities: [0.72, 0.6, 0.5], maxBytes: 400 * 1024 };
const THUMB = { edge: 320, qualities: [0.6, 0.5], maxBytes: 60 * 1024 };
const JPEG_QUALITY = 0.75;

export interface Compressed {
  full: Blob;
  thumb: Blob;
  ext: ToletExt;
}

function toBlob(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, q));
}

function draw(bitmap: ImageBitmap, edge: number): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Your browser could not process this photo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Encodes at the first quality that fits. Browsers that can't write WebP return PNG: then JPEG. */
async function encode(
  canvas: HTMLCanvasElement,
  spec: { qualities: number[]; maxBytes: number },
  ext: ToletExt,
): Promise<Blob> {
  const type = ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const qualities = ext === 'webp' ? spec.qualities : [JPEG_QUALITY, ...spec.qualities.slice(1)];
  let blob: Blob | null = null;
  for (const q of qualities) {
    blob = await toBlob(canvas, type, q);
    if (!blob || blob.type !== type) throw new ImageError(`no ${type}`);
    if (blob.size <= spec.maxBytes) return blob;
  }
  if (blob && blob.size <= 500 * 1024) return blob; // still under the 512 KB bucket limit
  throw new ImageError('This photo is too detailed to upload. Please take it again.');
}

async function compressAs(bitmap: ImageBitmap, ext: ToletExt): Promise<Compressed> {
  const full = await encode(draw(bitmap, FULL.edge), FULL, ext);
  const thumb = await encode(draw(bitmap, THUMB.edge), THUMB, ext);
  return { full, thumb, ext };
}

/** Instant checks, before any decoding, so a wrong file is reported straight away. */
export function checkPhoto(file: File): void {
  if (!file.type.startsWith('image/')) throw new ImageError('That file is not a photo.');
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('That photo is too large (over 25 MB).');
}

/** Decodes the photo once (off the main thread). The caller owns the bitmap and must close() it. */
export async function decodePhoto(file: File): Promise<ImageBitmap> {
  checkPhoto(file);
  try {
    // 'from-image' applies the EXIF rotation, so phone photos come out upright.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('This photo could not be opened. Please take it again with the camera.');
  }
}

/**
 * Shows the decoded photo in a <canvas>, sized for the screen it's on. Drawing a bitmap that is
 * already decoded takes a few ms, so the preview appears as soon as decoding finishes: no second
 * decode of the original, no Base64, no extra blob or object URL to clean up.
 */
export function drawPreview(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  box: { width: number; height: number },
): void {
  const scale = Math.min(1, box.width / bitmap.width, box.height / bitmap.height);
  const cssW = Math.max(1, Math.round(bitmap.width * scale));
  const cssH = Math.max(1, Math.round(bitmap.height * scale));
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.min(bitmap.width, Math.round(cssW * dpr));
  canvas.height = Math.min(bitmap.height, Math.round(cssH * dpr));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Your browser could not process this photo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
}

/** Empties a preview canvas (setting the size to 0 also frees its pixel memory). */
export function clearPreview(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
  canvas.style.removeProperty('width');
  canvas.style.removeProperty('height');
}

/** The upload copies (full + thumb). Re-encoding drops EXIF/GPS; the original is never uploaded. */
export async function compressBitmap(bitmap: ImageBitmap): Promise<Compressed> {
  try {
    return await compressAs(bitmap, 'webp');
  } catch (e) {
    // Older Safari can't encode WebP (toBlob returns PNG). Fall back to JPEG + .jpg paths.
    if (e instanceof ImageError && e.message.startsWith('no '))
      return await compressAs(bitmap, 'jpg');
    throw e;
  }
}
