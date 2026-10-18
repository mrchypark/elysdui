// This file is trusted application code. SDUI screens only name this provider.
ElyMap.registerTileProvider('natural-earth', {
  revision: 'ely-da3fdcaf-natural-earth-110m-v1',
  minZoom: 0,
  maxZoom: 3,
  attribution: 'Land: Natural Earth (public domain)',
  urlTemplate: '/assets/ely/tiles/{z}/{x}/{y}.png',
});
