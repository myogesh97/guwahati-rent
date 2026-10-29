// DEV-ONLY. Extra neighbourhood points for the demo generator, read from the OpenStreetMap
// `places` layer of public/tiles/guwahati.pmtiles (Protomaps build 20260922). Not in the
// basemap, so deliberately left out instead of guessed: Rajgarh, Pub Sarania, Panjabari.
export const EXTRA_ANCHORS: { name: string; lat: number; lng: number }[] = [
  { name: 'Hengrabari', lat: 26.1508, lng: 91.8037 },
  { name: 'Fatasil Ambari', lat: 26.1583, lng: 91.7344 },
  { name: 'Rehabari', lat: 26.1702, lng: 91.7512 },
  { name: 'Ambari', lat: 26.1846, lng: 91.754 },
  { name: 'Pan Bazar', lat: 26.1853, lng: 91.7473 },
  { name: 'Bhangagarh', lat: 26.1655, lng: 91.7696 },
  { name: 'Anil Nagar', lat: 26.1673, lng: 91.7732 },
  { name: 'Christian Basti', lat: 26.1542, lng: 91.7796 },
  { name: 'Barsapara', lat: 26.1449, lng: 91.7391 },
  { name: 'Odalbakra', lat: 26.1402, lng: 91.751 },
  { name: 'Wireless', lat: 26.1348, lng: 91.7924 },
  { name: 'Krishnapur', lat: 26.1141, lng: 91.8014 },
  { name: 'Lalmati', lat: 26.1119, lng: 91.7885 },
  { name: 'Japorigog', lat: 26.1578, lng: 91.7888 },
  { name: 'Borbari', lat: 26.158, lng: 91.8091 },
];
