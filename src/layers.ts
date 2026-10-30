// Pin source + layers (SPEC §8.3). One GeoJSON source, GPU-drawn layers. Never DOM markers.
import type { LayerSpecification } from 'maplibre-gl';

export const PIN_SOURCE = 'pins';
export const DRAFT_SOURCE = 'draft';

export const COLOR = {
  ink: '#102a35', // label text
  pin: '#0b5566', // pins + clusters: brand deep teal, distinct from the basemap's colours
  pinDark: '#073f4c',
  white: '#ffffff',
  draft: '#d14400', // the one accent: your pin, and the selected pin
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

export const CLICKABLE_LAYERS = ['clusters', 'pin-dot'];
