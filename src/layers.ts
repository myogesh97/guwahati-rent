// Pin source + layers (SPEC §8.3). One GeoJSON source, GPU-drawn layers. Never DOM markers.
import type { LayerSpecification } from 'maplibre-gl';

export const PIN_SOURCE = 'pins';
export const DRAFT_SOURCE = 'draft';
export const TOLET_SOURCE = 'tolet';
export const WATER_SOURCE = 'waterlog';
export const TOLET_ICON = 'tolet-sign';

export const COLOR = {
  ink: '#102a35', // label text
  pin: '#0b5566', // gated rents + clusters: brand deep teal, distinct from the basemap's colours
  pin2: '#087f98', // hover
  line: '#087f98', // outline of a not-gated tag
  white: '#ffffff',
  draft: '#ea580c', // action orange as a mark: your new pin, the selected pin
  selected: '#d14400', // selected tag fill (white text on it stays AA)
  board: '#f59e0b', // To-Let boards: amber square sign (shape, not just colour, sets them apart)
} as const;

/** Price-tag images (stretchable, drawn in map.ts): fill / outline / text per state. */
export const TAGS = {
  'tag-gated': { fill: COLOR.pin, stroke: null, text: COLOR.white },
  'tag-open': { fill: COLOR.white, stroke: COLOR.line, text: COLOR.ink },
  'tag-hover': { fill: COLOR.pin2, stroke: null, text: COLOR.white },
  'tag-selected': { fill: COLOR.selected, stroke: null, text: COLOR.white },
} as const;
export type TagName = keyof typeof TAGS;

const FONT = ['Noto Sans Medium'];

const isPoint: ['!', ['has', string]] = ['!', ['has', 'point_count']];

// Monsoon waterlogging (NEXT-PHASES §4.5): a heatmap of renters' reports, under the pins and
// hidden until toggled. Weight: none 0, road only 0.5, water enters the property 1.
// Blues read as water and stay apart from the teal pins and the orange accent.
export const WATER_RAMP = ['#c6dbef', '#6baed6', '#2171b5', '#08306b'] as const;
export const waterLayer: LayerSpecification = {
  id: 'waterlog-heat',
  type: 'heatmap',
  source: WATER_SOURCE,
  layout: { visibility: 'none' },
  paint: {
    'heatmap-weight': ['match', ['get', 'w'], 'road_only', 0.5, 'enters_premises', 1, 0],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 2],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 14, 13, 24, 16, 40],
    'heatmap-color': [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0,
      'rgba(198,219,239,0)',
      0.15,
      WATER_RAMP[0],
      0.4,
      WATER_RAMP[1],
      0.7,
      WATER_RAMP[2],
      1,
      WATER_RAMP[3],
    ],
    'heatmap-opacity': 0.72,
  },
};

const tagLayout = (image: TagName): LayerSpecification['layout'] => ({
  'icon-image': image,
  'icon-text-fit': 'both',
  'icon-text-fit-padding': [3, 7, 3, 7],
  'text-field': ['get', 'label'],
  'text-font': FONT,
  'text-size': 12,
  'text-anchor': 'bottom',
  'text-offset': [0, -0.95],
  'text-padding': 2,
  'symbol-sort-key': ['get', 'rent'],
});

// Rents: a small dot marks the spot; from street-ish zoom a price tag sits just above it.
// Gated = filled teal tag + filled dot. Not gated = white tag with a teal outline + ring dot.
// Shape and fill carry the meaning, never colour alone (SPEC §8.6). Tags that would overlap
// are dropped by MapLibre's collision detection and reappear as you zoom in.
export const pinLayers: LayerSpecification[] = [
  {
    id: 'clusters',
    type: 'circle',
    source: PIN_SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': COLOR.pin,
      'circle-radius': ['step', ['get', 'point_count'], 13, 10, 16, 50, 20, 200, 24],
      'circle-stroke-width': 2,
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
      'text-size': 12,
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
        ['literal', [0, 1.9]],
        50,
        ['literal', [0, 2.4]],
        200,
        ['literal', [0, 2.8]],
      ],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': COLOR.ink,
      'text-halo-color': COLOR.white,
      'text-halo-width': 1.5,
    },
  },
  {
    id: 'pin-dot',
    type: 'circle',
    source: PIN_SOURCE,
    filter: isPoint,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 6.5],
      'circle-color': ['case', ['get', 'gated'], COLOR.pin, COLOR.white],
      'circle-stroke-color': ['case', ['get', 'gated'], COLOR.white, COLOR.pin],
      'circle-stroke-width': ['case', ['get', 'gated'], 1.5, 2.5],
    },
  },
  {
    id: 'pin-tag',
    type: 'symbol',
    source: PIN_SOURCE,
    filter: isPoint,
    minzoom: 11.5,
    layout: {
      ...tagLayout('tag-open'),
      'icon-image': ['case', ['get', 'gated'], 'tag-gated', 'tag-open'],
    },
    paint: { 'text-color': ['case', ['get', 'gated'], COLOR.white, COLOR.ink] },
  },
  // Hover and selected: the same tag redrawn on top (always shown, even if it would collide).
  {
    id: 'pin-hover',
    type: 'symbol',
    source: PIN_SOURCE,
    minzoom: 11.5,
    filter: ['==', ['get', 'id'], ''],
    layout: { ...tagLayout('tag-hover'), 'icon-allow-overlap': true, 'text-allow-overlap': true },
    paint: { 'text-color': COLOR.white },
  },
  {
    id: 'pin-selected',
    type: 'circle',
    source: PIN_SOURCE,
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 16, 7.5],
      'circle-color': COLOR.draft,
      'circle-stroke-color': COLOR.white,
      'circle-stroke-width': 2,
    },
  },
  {
    id: 'pin-selected-tag',
    type: 'symbol',
    source: PIN_SOURCE,
    filter: ['==', ['get', 'id'], ''],
    layout: {
      ...tagLayout('tag-selected'),
      'icon-allow-overlap': true,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': COLOR.white },
  },
  {
    id: 'draft-pin',
    type: 'circle',
    source: DRAFT_SOURCE,
    paint: {
      'circle-radius': 8,
      'circle-color': COLOR.draft,
      'circle-stroke-color': COLOR.white,
      'circle-stroke-width': 2.5,
    },
  },
];

/** Stretchable rounded-rectangle tag, drawn at 2× (MapLibre fits it around the price text). */
export function tagImage(name: TagName): {
  data: ImageData;
  options: { pixelRatio: number; stretchX: [number, number][]; stretchY: [number, number][] };
} {
  const { fill, stroke } = TAGS[name];
  const w = 32;
  const h = 28;
  const r = 10; // 5 px on screen
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const inset = stroke ? 1.5 : 0;
  g.beginPath();
  g.roundRect(inset, inset, w - 2 * inset, h - 2 * inset, r);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = 3; // 1.5 px on screen
    g.strokeStyle = stroke;
    g.stroke();
  }
  return {
    data: g.getImageData(0, 0, w, h),
    options: { pixelRatio: 2, stretchX: [[r, w - r]], stretchY: [[r, h - r]] },
  };
}

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

export const CLICKABLE_LAYERS = [
  'tolet-icon',
  'clusters',
  'pin-selected-tag',
  'pin-hover',
  'pin-tag',
  'pin-dot',
];
