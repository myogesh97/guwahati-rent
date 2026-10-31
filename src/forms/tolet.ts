// "Spot a To-Let" (NEXT-PHASES §2a.1): photo -> compress -> location -> spam check -> upload.
// No form fields. The phone number is on the board itself; we never ask for or read it.
import { ApiError, requestToletUpload, submitTolet, uploadToSignedUrl } from '../api';
import { browserId } from '../tokens';
import { $dialog, closeDialog, openDialog } from '../ui/dialog';
import { ImageError, compressPhoto, type Compressed } from '../ui/image';
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
  const preview = $<HTMLImageElement>('tolet-preview');
  const where = $('tolet-where');
  const tap = $<HTMLButtonElement>('tolet-tap');
  const status = $('tolet-status');
  const error = $('tolet-error');
  const submit = $<HTMLButtonElement>('tolet-submit');
  const turnstile = new TurnstileWidget($('tolet-turnstile'));

  let photo: Compressed | null = null;
  let spot: Spot | null = null;
  let busy = false;
  let previewUrl: string | null = null;
  let locating = 0; // ignore a GPS answer that arrives after the user picked on the map

  const sync = () => {
    submit.disabled = busy || !photo || !spot;
    pick.disabled = busy;
    pickLabel.textContent = photo ? 'Take it again' : 'Take a photo';
  };
  const say = (text: string) => (status.textContent = text);
  const showError = (text: string | null) => {
    error.textContent = text ?? '';
    error.hidden = !text;
  };

  function showSpot(): void {
    where.hidden = !spot;
    where.textContent =
      spot?.from === 'gps' ? 'Using your location.' : spot ? 'Using the spot you tapped.' : '';
    tap.hidden = !photo || busy;
    tap.textContent = spot ? 'Move it on the map' : 'Tap the map instead';
  }

  function reset(): void {
    photo = null;
    spot = null;
    busy = false;
    locating++;
    file.value = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.hidden = true;
    preview.removeAttribute('src');
    say('');
    showError(null);
    showSpot();
    sync();
  }

  function locate(): void {
    const ticket = ++locating;
    const fallback = (why: string) => {
      if (ticket !== locating) return;
      say(`${why} Tap the map to show where the board is.`);
      showSpot();
      sync();
    };
    if (!('geolocation' in navigator)) return fallback("Your browser can't share your location.");
    say('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (ticket !== locating) return;
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (accuracy > MAX_ACCURACY_M) return fallback("Your location isn't precise enough.");
        if (!inGuwahati(lat, lng)) return fallback('Your location looks outside Guwahati.');
        spot = { lat, lng, from: 'gps' };
        say('Photo ready.');
        showSpot();
        sync();
      },
      () => fallback("We couldn't get your location."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    showError(null);
    busy = true;
    sync();
    say('Compressing the photo…');
    try {
      photo = await compressPhoto(f); // the original file is never uploaded
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(photo.thumb);
      preview.src = previewUrl;
      preview.hidden = false;
      busy = false;
      if (spot) say('Photo ready.');
      else locate();
    } catch (e) {
      photo = null;
      busy = false;
      say('');
      showError(
        e instanceof ImageError ? e.message : 'This photo could not be used. Please try again.',
      );
    } finally {
      file.value = '';
      showSpot();
      sync();
    }
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
      if (!photo) file.click();
    },
    /** Back from tapping the map. `at` is null when the user cancelled. */
    resume(at: { lat: number; lng: number } | null): void {
      if (at) {
        spot = { ...at, from: 'map' };
        say('Photo ready.');
      }
      openDialog(dlg);
      mountCheck();
      showSpot();
      sync();
    },
  };
}
