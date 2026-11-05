// "Spot a To-Let" (NEXT-PHASES §2a.1): photo -> preview -> compress (+ location) -> spam check -> upload.
// No form fields. The phone number is on the board itself; we never ask for or read it.
import { ApiError, requestToletUpload, submitTolet, uploadToSignedUrl } from '../api';
import { browserId } from '../tokens';
import { $dialog, closeDialog, openDialog } from '../ui/dialog';
import {
  ImageError,
  checkPhoto,
  clearPreview,
  compressBitmap,
  decodePhoto,
  drawPreview,
  type Compressed,
} from '../ui/image';
import { toast } from '../ui/toast';
import { TurnstileWidget } from '../ui/turnstile';
import { inGuwahati } from '../../supabase/functions/_shared/rules';

type Spot = { lat: number; lng: number; from: 'gps' | 'map' };

interface Options {
  /** Hide the dialog and let the user tap where the board is; main.ts calls resume() after. */
  pickOnMap(near: { lat: number; lng: number } | null): void;
  onUploaded(): void;
}

const MAX_ACCURACY_M = 150;

export function setupToletForm({ pickOnMap, onUploaded }: Options) {
  const dlg = $dialog('dlg-tolet');
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const file = $<HTMLInputElement>('tolet-file');
  const pick = $<HTMLButtonElement>('tolet-pick');
  const pickLabel = $('tolet-pick-label');
  const preview = $<HTMLCanvasElement>('tolet-preview');
  const clear = $<HTMLButtonElement>('tolet-clear');
  const where = $('tolet-where');
  const tap = $<HTMLButtonElement>('tolet-tap');
  const status = $('tolet-status');
  const error = $('tolet-error');
  const submit = $<HTMLButtonElement>('tolet-submit');
  const turnstile = new TurnstileWidget($('tolet-turnstile'));

  /** The upload copies; null until compression (after the preview) has finished. */
  let photo: Compressed | null = null;
  /** A photo is on screen (it may still be compressing). */
  let shown = false;
  let preparing = false;
  let spot: Spot | null = null;
  let busy = false;
  let shot = 0; // each photo choice; work for an older choice (or a removed photo) is dropped
  let locating = 0; // ignore a GPS answer that arrives after the user picked on the map
  let locMsg = '';

  const sync = () => {
    submit.disabled = busy || !photo || !spot;
    pick.disabled = busy;
    clear.hidden = !shown || busy;
    pickLabel.textContent = shown ? 'Take it again' : 'Take a photo';
  };
  const say = (text: string) => (status.textContent = text);
  /** Status while not submitting: what is happening now, or what's needed next. */
  const tell = () =>
    say(preparing ? 'Preparing the photo…' : locMsg || (photo && spot ? 'Photo ready.' : ''));
  const showError = (text: string | null) => {
    error.textContent = text ?? '';
    error.hidden = !text;
  };

  function showSpot(): void {
    where.hidden = !spot;
    where.textContent =
      spot?.from === 'gps' ? 'Using your location.' : spot ? 'Using the spot you tapped.' : '';
    tap.hidden = !shown || busy;
    tap.textContent = spot ? 'Move it on the map' : 'Tap the map instead';
  }

  /** Removes the photo at once (and cancels its compression). The location is kept. */
  function removePhoto(): void {
    shot++;
    photo = null;
    shown = false;
    preparing = false;
    file.value = ''; // the same photo can be chosen again
    preview.hidden = true;
    clearPreview(preview);
    showError(null);
    tell();
    showSpot();
    sync();
  }

  function reset(): void {
    removePhoto();
    spot = null;
    busy = false;
    locating++;
    locMsg = '';
    tell();
    showSpot();
    sync();
  }

  function locate(): void {
    const ticket = ++locating;
    const fallback = (why: string) => {
      if (ticket !== locating) return;
      locMsg = `${why} Tap the map to show where the board is.`;
      tell();
      showSpot();
      sync();
    };
    if (!('geolocation' in navigator)) return fallback("Your browser can't share your location.");
    locMsg = 'Finding your location…';
    tell();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (ticket !== locating) return;
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (accuracy > MAX_ACCURACY_M) return fallback("Your location isn't precise enough.");
        if (!inGuwahati(lat, lng)) return fallback('Your location looks outside Guwahati.');
        spot = { lat, lng, from: 'gps' };
        locMsg = '';
        tell();
        showSpot();
        sync();
      },
      () => fallback("We couldn't get your location."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  /** Photo chosen: preview as soon as it's decoded, compress the upload copies after that. */
  async function usePhoto(f: File): Promise<void> {
    try {
      checkPhoto(f); // wrong type / too big: say so now, keep any photo already there
    } catch (e) {
      showError((e as Error).message);
      return;
    }
    const mine = ++shot;
    showError(null);
    photo = null;
    preparing = true;
    tell();
    sync();
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await decodePhoto(f);
      if (mine !== shot) return;
      drawPreview(preview, bitmap, {
        width: preview.parentElement?.clientWidth || 320,
        height: 240,
      });
      preview.hidden = false;
      shown = true;
      showSpot();
      sync();
      if (!spot && !locMsg) locate(); // find the location while the photo compresses
      const done = await compressBitmap(bitmap); // the original file is never uploaded
      if (mine !== shot) return;
      photo = done;
    } catch (e) {
      if (mine !== shot) return;
      removePhoto();
      showError(
        e instanceof ImageError ? e.message : 'This photo could not be used. Please try again.',
      );
    } finally {
      bitmap?.close();
      if (mine === shot) {
        preparing = false;
        tell();
        showSpot();
        sync();
      }
    }
  }

  file.addEventListener('change', () => {
    const f = file.files?.[0];
    file.value = ''; // so choosing the same photo again still fires "change"
    if (f) void usePhoto(f);
  });
  clear.addEventListener('click', () => {
    removePhoto();
    pick.focus(); // the Remove button has just disappeared
  });

  pick.addEventListener('click', () => file.click());
  tap.addEventListener('click', () => {
    locating++;
    closeDialog(dlg);
    pickOnMap(spot);
  });

  submit.addEventListener('click', async () => {
    if (!photo || !spot || busy) return;
    busy = true;
    showError(null);
    sync();
    showSpot();
    try {
      say('Running the spam check…');
      const token = await turnstile.waitForToken();
      if (!token) throw new ApiError('Please complete the spam check above, then try again.', 0);
      const id = browserId();
      const up = await requestToletUpload({
        turnstileToken: token,
        browserId: id,
        lat: spot.lat,
        lng: spot.lng,
        ext: photo.ext,
      });
      say('Uploading the photo…');
      await Promise.all([
        uploadToSignedUrl(up.uploads.full, photo.full),
        uploadToSignedUrl(up.uploads.thumb, photo.thumb),
      ]);
      say('Finishing…');
      await submitTolet(up.boardId, id);
      closeDialog(dlg);
      reset();
      toast(
        "Thanks! Your board appears on the map once it's checked (usually within a day).",
        'info',
        7000,
      );
      onUploaded();
    } catch (e) {
      busy = false;
      say('');
      showError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      turnstile.reset(); // tokens are single-use
      showSpot();
      sync();
    }
  });

  function mountCheck(): void {
    turnstile.mount().catch((e: Error) => showError(e.message));
  }

  return {
    /** From the "Spot a To-Let" button: opens the camera straight away (same tap = user gesture). */
    start(trigger?: HTMLElement | null): void {
      if (!busy) reset();
      openDialog(dlg, trigger);
      mountCheck();
      if (!shown) file.click();
    },
    /** Back from tapping the map. `at` is null when the user cancelled. */
    resume(at: { lat: number; lng: number } | null): void {
      if (at) {
        spot = { ...at, from: 'map' };
        locMsg = '';
        tell();
      }
      openDialog(dlg);
      mountCheck();
      showSpot();
      sync();
    },
  };
}
