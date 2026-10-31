// Pin source + layers (SPEC §8.3). One GeoJSON source, GPU-drawn layers. Never DOM markers.
import type { LayerSpecification } from 'maplibre-gl';

export const PIN_SOURCE = 'pins';
export const DRAFT_SOURCE = 'draft';
export const TOLET_SOURCE = 'tolet';
export const TOLET_ICON = 'tolet-sign';

export const COLOR = {
  ink: '#102a35', // label text
  pin: '#0b5566', // pins + clusters: brand deep teal, distinct from the basemap's colours
  pinDark: '#073f4c',
  white: '#ffffff',
  draft: '#d14400', // the one accent: your pin, and the selected pin
  board: '#f59e0b', // To-Let boards: amber square sign (shape, not just colour, sets them apart)
} as const;

const FONT = ['Noto Sans Medium'];

const isPoint: ['!', ['has', string]] = ['!', ['has', 'point_count']];

export const pinLayers: LayerSpecification[] = [
  {
    id: 'clusters',
    type: 'circle',
    source: PIN_SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': COLOR.pin,
      'circle-opacity': 0.95,
      'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26, 200, 32],
      'circle-stroke-width': 3,
      'circle-stroke-color': COLOR.white,
    },
  },
  {
    id: 'cluster-label',
    type: 'symbol',
    source: PIN_SOURCE,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['to-string', ['get', 'point_count']],
      'text-font': FONT,
      'text-size': 14,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': COLOR.white },
  },
  // Rough average under each bubble (visual hint only; real stats use medians, SPEC §5.10).
  {
    id: 'cluster-avg',
    type: 'symbol',
    source: PIN_SOURCE,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': [
        'concat',
        '~₹',
        ['to-string', ['round', ['/', ['/', ['get', 'rentSum'], ['get', 'point_count']], 1000]]],
        'k',
      ],
      'text-font': FONT,
      'text-size': 11,
      'text-offset': [
        'step',
        ['get', 'point_count'],
        ['literal', [0, 2.1]],
        50,
        ['literal', [0, 2.8]],
        200,
        ['literal', [0, 3.3]],
      ],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': COLOR.ink,
      'text-halo-color': COLOR.white,
      'text-halo-width': 2,
    },
  },
  // Gated: solid dot. Not gated: ring. Shape carries the meaning, not colour alone (SPEC §8.6).
  {
    id: 'pin-dot',
    type: 'circle',
    source: PIN_SOURCE,
    filter: isPoint,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7, 15, 10],
      'circle-color': ['case', ['get', 'gated'], COLOR.pin, COLOR.white],
      'circle-stroke-color': ['case', ['get', 'gated'], COLOR.white, COLOR.pin],
      'circle-stroke-width': ['case', ['get', 'gated'], 2.5, 3.5],
    },
  },
  {
    id: 'pin-selected',
    type: 'circle',
    source: PIN_SOURCE,
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 12, 15, 16],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': COLOR.draft,
      'circle-stroke-width': 3,
    },
  },
  {
    id: 'pin-label',
    type: 'symbol',
    source: PIN_SOURCE,
    filter: isPoint,
    // Rent above every pin from city zoom. Labels that would overlap are dropped, so dense
    // areas stay readable; zooming in reveals the rest.
    minzoom: 10,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': FONT,
      'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 15, 14],
      'text-offset': [0, -1.1],
      'text-anchor': 'bottom',
      'text-padding': 1,
    },
    paint: {
      'text-color': COLOR.ink,
      'text-halo-color': COLOR.white,
      'text-halo-width': 2,
    },
  },
  {
    id: 'draft-pin',
    type: 'circle',
    source: DRAFT_SOURCE,
    paint: {
      'circle-radius': 9,
      'circle-color': COLOR.draft,
      'circle-stroke-color': COLOR.white,
      'circle-stroke-width': 3,
    },
  },
];

// To-Let boards: their own source (no clustering), a square sign icon instead of a dot, and a
// "To-Let" label from street zoom. Drawn above rent pins so a board is never hidden by them.
export const toletLayers: LayerSpecification[] = [
  {
    id: 'tolet-icon',
    type: 'symbol',
    source: TOLET_SOURCE,
    layout: {
      'icon-image': TOLET_ICON,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.75, 15, 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['step', ['zoom'], '', 14, 'To-Let'],
      'text-font': FONT,
      'text-size': 11,
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: {
      'text-color': COLOR.ink,
      'text-halo-color': COLOR.white,
      'text-halo-width': 2,
    },
  },
  {
    id: 'tolet-selected',
    type: 'circle',
    source: TOLET_SOURCE,
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': 17,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': COLOR.draft,
      'circle-stroke-width': 3,
    },
  },
];

/** The board icon, drawn once at 2× so it stays crisp: an amber sign with two text lines. */
export function toletIcon(): ImageData {
  const px = 48;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const r = 8;
  const rect = (x: number, y: number, w: number, h: number, rad: number) => {
    g.beginPath();
    g.roundRect(x, y, w, h, rad);
  };
  rect(4, 4, 40, 40, r);
  g.fillStyle = COLOR.white;
  g.fill();
  rect(8, 8, 32, 32, r - 3);
  g.fillStyle = COLOR.board;
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = COLOR.ink;
  g.stroke();
  g.fillStyle = COLOR.ink;
  g.fillRect(14, 17, 20, 4);
  g.fillRect(14, 26, 14, 4);
  return g.getImageData(0, 0, px, px);
}

export const CLICKABLE_LAYERS = ['tolet-icon', 'clusters', 'pin-dot'];
