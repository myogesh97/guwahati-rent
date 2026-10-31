// MapLibre + PMTiles (SPEC §8.2). Loaded with dynamic import() so the page paints first.
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PMTiles, Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { GUWAHATI_CENTER, TILES_URL } from './config';
import { RangeOrWholeSource } from './tiles';
import {
  CLICKABLE_LAYERS,
  DRAFT_SOURCE,
  PIN_SOURCE,
  TOLET_ICON,
  TOLET_SOURCE,
  pinLayers,
  toletIcon,
  toletLayers,
} from './layers';
import { shortRupees } from './format';
import { BBOX } from '../supabase/functions/_shared/rules';
import type { PublicBoard, PublicPin } from './types';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface MapView {
  setPins(pins: PublicPin[]): void;
  setBoards(boards: PublicBoard[]): void;
  select(id: string | null): void;
  selectBoard(id: string | null): void;
  setDraft(point: { lat: number; lng: number } | null): void;
  focus(lat: number, lng: number, zoom?: number): void;
  /** All pins under the tap (more than one when pins share a spot). */
  onPinClick(cb: (ids: string[]) => void): void;
  onBoardClick(cb: (id: string) => void): void;
  /** Click while choosing a spot (placement mode). */
  onMapClick(cb: (lat: number, lng: number) => void): void;
  /** Click on empty map (no pin or cluster under it) outside placement mode. */
  onEmptyClick(cb: (lat: number, lng: number) => void): void;
  getCenter(): { lat: number; lng: number };
  setPlacing(on: boolean): void;
  resize(): void;
}

export async function createMap(container: HTMLElement): Promise<MapView> {
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  const source = new RangeOrWholeSource(new URL(TILES_URL, location.href).href);
  protocol.add(new PMTiles(source));

  const map = new maplibregl.Map({
    container,
    center: GUWAHATI_CENTER,
    zoom: 12,
    minZoom: 10,
    maxZoom: 18,
    maxBounds: [
      [BBOX.minLng - 0.15, BBOX.minLat - 0.1],
      [BBOX.maxLng + 0.15, BBOX.maxLat + 0.1],
    ],
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    style: {
      version: 8,
      // Self-hosted (public/map-assets) so the map has no third-party runtime dependency.
      glyphs: new URL('/map-assets/fonts/{fontstack}/{range}.pbf', location.href).href
        .replace(/%7B/g, '{')
        .replace(/%7D/g, '}'),
      sprite: new URL('/map-assets/sprites/light', location.href).href,
      sources: {
        base: {
          type: 'vector',
          url: `pmtiles://${source.getKey()}`,
          attribution:
            '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
        },
        [PIN_SOURCE]: {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterRadius: 40,
          clusterMaxZoom: 15,
          clusterProperties: { rentSum: ['+', ['get', 'rent']] },
          promoteId: 'id',
        },
        [DRAFT_SOURCE]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        [TOLET_SOURCE]: {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          promoteId: 'id',
        },
      },
      // 'light': the full-colour basemap, untinted (the UI never filters or recolours the map).
      layers: [
        ...layers('base', namedFlavor('light'), { lang: 'en' }),
        ...pinLayers,
        ...toletLayers,
      ],
    },
  });

  map.touchZoomRotate.disableRotation();
  map.addImage(TOLET_ICON, toletIcon(), { pixelRatio: 2 });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: false },
      trackUserLocation: false,
    }),
    'bottom-right',
  );

  await new Promise<void>((resolve) => map.once('load', () => resolve()));
  // Dev-only hook for browser QA scripts; stripped from production builds.
  if (import.meta.env.DEV) (window as unknown as { __grMap?: unknown }).__grMap = map;

  let placing = false;
  let pinClick: ((ids: string[]) => void) | null = null;
  let boardClick: ((id: string) => void) | null = null;
  let mapClick: ((lat: number, lng: number) => void) | null = null;
  let emptyClick: ((lat: number, lng: number) => void) | null = null;

  map.on('click', async (e) => {
    if (placing) {
      mapClick?.(e.lngLat.lat, e.lngLat.lng);
      return;
    }
    const hits: MapGeoJSONFeature[] = map.queryRenderedFeatures(e.point, {
      layers: CLICKABLE_LAYERS,
    });
    const f = hits[0];
    if (!f) {
      emptyClick?.(e.lngLat.lat, e.lngLat.lng);
      return;
    }
    const props = f.properties as Record<string, unknown>;
    if (f.layer.id === 'tolet-icon') {
      if (typeof props.id === 'string') boardClick?.(props.id);
      return;
    }
    const ids = [
      ...new Set(
        hits
          .filter((h) => h.layer.id !== 'tolet-icon')
          .map((h) => (h.properties as Record<string, unknown>).id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    if (props.cluster) {
      const src = map.getSource(PIN_SOURCE) as GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(props.cluster_id as number);
      const [lng, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      map.easeTo({
        center: [lng, lat],
        zoom: Math.min(zoom + 0.5, 17),
        duration: reducedMotion() ? 0 : 500,
      });
    } else if (ids.length) {
      pinClick?.(ids);
    }
  });

  for (const layer of CLICKABLE_LAYERS) {
    map.on('mouseenter', layer, () => !placing && (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => !placing && (map.getCanvas().style.cursor = ''));
  }

  return {
    setPins(pins) {
      (map.getSource(PIN_SOURCE) as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: pins.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: {
            id: p.id,
            rent: p.rent,
            gated: p.gated,
            kind: p.kind,
            label: shortRupees(p.rent),
          },
        })),
      });
    },
    setBoards(boards) {
      (map.getSource(TOLET_SOURCE) as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: boards.map((b) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
          properties: { id: b.id },
        })),
      });
    },
    select(id) {
      map.setFilter('pin-selected', ['==', ['get', 'id'], id ?? '']);
    },
    selectBoard(id) {
      map.setFilter('tolet-selected', ['==', ['get', 'id'], id ?? '']);
    },
    setDraft(point) {
      (map.getSource(DRAFT_SOURCE) as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: point
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
              },
            ]
          : [],
      });
    },
    focus(lat, lng, zoom = 15) {
      const opts = { center: [lng, lat] as [number, number], zoom: Math.max(map.getZoom(), zoom) };
      if (reducedMotion()) map.jumpTo(opts);
      else map.flyTo({ ...opts, duration: 900 });
    },
    onPinClick(cb) {
      pinClick = cb;
    },
    onBoardClick(cb) {
      boardClick = cb;
    },
    onMapClick(cb) {
      mapClick = cb;
    },
    onEmptyClick(cb) {
      emptyClick = cb;
    },
    getCenter() {
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng };
    },
    setPlacing(on) {
      placing = on;
      map.getCanvas().style.cursor = on ? 'crosshair' : '';
      container.classList.toggle('is-placing', on);
    },
    resize() {
      map.resize();
    },
  };
}
