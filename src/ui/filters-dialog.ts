// #dlg-filters: every change applies at once (map + list), the button shows the live count.
import { DEFAULT_FILTERS, activeCount, type Filters } from '../filters';
import { $dialog, openDialog } from './dialog';

interface Options {
  get(): Filters;
  set(f: Filters): void;
  /** How many rents the given filters would show (for the "Show N rents" button). */
  count(f: Filters): number;
}

export function setupFiltersDialog({ get, set, count }: Options) {
  const dlg = $dialog('dlg-filters');
  const form = document.getElementById('filters-form') as HTMLFormElement;
  const done = document.getElementById('filters-done') as HTMLButtonElement;
  const badge = document.getElementById('filters-count') as HTMLElement;
  const trigger = document.getElementById('btn-filters') as HTMLButtonElement;

  const checked = (name: string) =>
    [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map(
      (i) => i.value,
    );
  const num = (name: string) => {
    const v = (form.elements.namedItem(name) as HTMLInputElement).value.trim();
    const n = Number(v);
    return v && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  function read(): Filters {
    const show = checked('show');
    return {
      rents: show.includes('rents'),
      boards: show.includes('boards'),
      bhk: checked('bhk') as Filters['bhk'],
      min: num('min'),
      max: num('max'),
      furnishing: checked('furn') as Filters['furnishing'],
      gated: (checked('gated')[0] ?? 'any') as Filters['gated'],
      types: checked('type') as Filters['types'],
      dry: checked('dry').length > 0,
      since: (checked('since')[0] ?? '18m') as Filters['since'],
    };
  }

  function fill(f: Filters): void {
    const on = (name: string, values: string[]) => {
      for (const i of form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))
        i.checked = values.includes(i.value);
    };
    on('show', [f.rents && 'rents', f.boards && 'boards'].filter(Boolean) as string[]);
    on('bhk', f.bhk);
    on('furn', f.furnishing);
    on('gated', [f.gated]);
    on('type', f.types);
    on('dry', f.dry ? ['1'] : []);
    on('since', [f.since]);
    (form.elements.namedItem('min') as HTMLInputElement).value =
      f.min === null ? '' : String(f.min);
    (form.elements.namedItem('max') as HTMLInputElement).value =
      f.max === null ? '' : String(f.max);
  }

  function sync(f: Filters): void {
    const n = activeCount(f);
    badge.textContent = String(n);
    badge.hidden = n === 0;
    // The badge is just a number; say what it counts (the name still starts with "Filters").
    if (n) trigger.setAttribute('aria-label', `Filters, ${n} active`);
    else trigger.removeAttribute('aria-label');
    trigger.classList.toggle('is-on', n > 0);
    const c = count(f);
    done.textContent = f.rents
      ? `Show ${c.toLocaleString('en-IN')} rent${c === 1 ? '' : 's'}`
      : 'Show results';
  }

  form.addEventListener('input', () => {
    const f = read();
    set(f);
    sync(f);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  document.getElementById('filters-clear')!.addEventListener('click', () => {
    fill(DEFAULT_FILTERS);
    set(DEFAULT_FILTERS);
    sync(DEFAULT_FILTERS);
  });
  trigger.addEventListener('click', () => {
    fill(get());
    sync(get());
    openDialog(dlg, trigger);
  });

  return { sync: () => sync(get()) };
}
