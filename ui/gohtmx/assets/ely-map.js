(() => {
  const MAX_LAT = 85.05112878;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const wrap = value => ((value % 1) + 1) % 1;
  const project = (lat, lon) => { const phi = clamp(Number(lat), -MAX_LAT, MAX_LAT) * Math.PI / 180; return [(Number(lon) + 180) / 360, (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2]; };
  const unproject = (x, y) => [Math.atan(Math.sinh(Math.PI * (1 - 2 * clamp(y, 0, 1)))) * 180 / Math.PI, wrap(x) * 360 - 180];
  const coordinate = (lat, lon) => `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`;
  const written = (lat, lon, format = 'decimal') => [lat, lon].map((number, index) => { const seconds = Math.round(Math.abs(number) * 3600), body = format === 'dms' ? `${Math.floor(seconds / 3600)}°${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}′${String(seconds % 60).padStart(2, '0')}″` : `${Math.abs(number).toFixed(4)}°`; const zero = !/[1-9]/.test(body); return `${body} ${index ? number < 0 && !zero ? 'W' : 'E' : number < 0 && !zero ? 'S' : 'N'}`; }).join(', ');
  const parseCoordinate = value => { const match = String(value || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/); return match && Math.abs(Number(match[1])) <= 90 && Math.abs(Number(match[2])) <= 180 ? [Number(match[1]), Number(match[2])] : null; };
  const clusterKey = (lat, lon, zoom) => project(lat, lon).map(value => Math.floor(value * 256 * 2 ** zoom / 56)).join(':');
  const panCenter = (center, zoom, dx, dy, height) => { const side = 256 * 2 ** zoom, [x, y] = project(...center), half = height / side / 2; return unproject(x - dx / side, side >= height ? clamp(y - dy / side, half, 1 - half) : .5); };
  const zoomAbout = (center, zoom, next, x, y, width, height) => { const [cx, cy] = project(...center), oldSide = 256 * 2 ** zoom, newSide = 256 * 2 ** next, dx = x - width / 2, dy = y - height / 2; return panCenter(unproject(cx + dx / oldSide - dx / newSide, cy + dy / oldSide - dy / newSide), next, 0, 0, height); };
  const heatDensity = (points, width, height, cell = 4, reach = 28) => { const columns = Math.ceil(width / cell), rows = Math.ceil(height / cell), values = new Float64Array(columns * rows); for (const [x, y, weight] of points) { if (!Number.isFinite(weight) || weight < 0) continue; for (let row = Math.max(0, Math.floor((y - reach) / cell)); row < Math.min(rows, Math.ceil((y + reach) / cell)); row++) for (let column = Math.max(0, Math.floor((x - reach) / cell)); column < Math.min(columns, Math.ceil((x + reach) / cell)); column++) { const near = (((column + .5) * cell - x) ** 2 + ((row + .5) * cell - y) ** 2) / reach ** 2; if (near < 1) values[row * columns + column] += weight * (1 - near) ** 2; } } let max = 0; for (const value of values) max = Math.max(max, value); if (max) for (let i = 0; i < values.length; i++) values[i] /= max; return {columns, rows, values, cell}; };
  const linePath = coordinates => { let previous; return coordinates.map(([lon, lat], index) => { let [x, y] = project(lat, lon); x *= 100; y *= 100; if (previous !== undefined) x += Math.round((previous - x) / 100) * 100; previous = x; return `${index ? 'L' : 'M'}${x} ${y}`; }).join(' '); };
  const polygonPath = rings => rings.map(ring => `${linePath(ring)} Z`).join(' ');
  const pathFor = geometry => geometry?.type === 'Polygon' ? polygonPath(geometry.coordinates) : geometry?.type === 'MultiPolygon' ? geometry.coordinates.map(polygonPath).join(' ') : geometry?.type === 'LineString' ? linePath(geometry.coordinates) : geometry?.type === 'MultiLineString' ? geometry.coordinates.map(linePath).join(' ') : '';
  // Port of gpui's maps/geo.rs::tiles at da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721.
  // Round each shared edge, rather than rounding a tile's width independently.
  const tilePlacements = (center, zoom, width, height, minZoom, maxZoom) => {
    if (![...center, zoom, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return [];
    const z = clamp(Math.round(zoom), minZoom, maxZoom), count = 2 ** z;
    const side = 256 * 2 ** (zoom - z), [cx, cy] = project(...center);
    const left = width / 2 - cx * 256 * 2 ** zoom, top = height / 2 - cy * 256 * 2 ** zoom;
    const west = Math.floor(-left / side), east = Math.ceil((width - left) / side) - 1;
    const north = Math.max(0, Math.floor(-top / side)), south = Math.min(count - 1, Math.ceil((height - top) / side) - 1);
    // A hostile viewport/source range must not allocate millions of placements.
    if ((east - west + 1) * Math.max(0, south - north + 1) > 256) throw new RangeError('Map tile coverage exceeds 256 placements');
    // Rust rounds half away from zero, whereas Math.round rounds negative ties up.
    const edge = value => Math.sign(value) * Math.round(Math.abs(value));
    const laid = [];
    for (let column = west; column <= east; column++) for (let row = north; row <= south; row++) {
      const x = edge(left + column * side), y = edge(top + row * side);
      laid.push({z, tileX: ((column % count) + count) % count, tileY: row, column, x, y, w: edge(left + (column + 1) * side) - x, h: edge(top + (row + 1) * side) - y});
    }
    return laid;
  };
  // GeoJSON contract: maps/geojson.rs at da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721.
  // Browser safety envelope (whole input, never truncate): 1 MiB UTF-8, 64 JSON
  // levels, 100000 JSON values, 4096 features/geometries, 20000 positions.
  const readGeoJSON = text => {
    const fail = message => { throw new Error(`Invalid GeoJSON: ${message}`); };
    if (typeof text !== 'string' || text.length > 1048576) fail('input exceeds 1 MiB');
    let bytes = 0;
    for (const char of text) { const cp = char.codePointAt(0); bytes += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4; }
    if (bytes > 1048576) fail('input exceeds 1 MiB');
    // Keep numeric lexemes until feature IDs have been extracted. JSON.parse
    // alone silently rounds IDs such as 9007199254740993 in older browsers.
    class Numeric { constructor(raw) { this.raw = raw; this.value = Number(raw); if (!Number.isFinite(this.value)) fail('non-finite number'); } }
    let cursor = 0, nodes = 0, geometries = 0, points = 0;
    const whitespace = () => { while (/[\x20\t\r\n]/.test(text[cursor] || '\0')) cursor++; };
    const string = () => { const start = cursor++; while (cursor < text.length) { const char = text[cursor++]; if (char === '\\') cursor++; else if (char === '"') { try { const decoded = JSON.parse(text.slice(start, cursor)); for (const unit of decoded) { const cp = unit.codePointAt(0); if (cp >= 0xd800 && cp <= 0xdfff) fail('unpaired Unicode surrogate'); } return decoded; } catch { fail('invalid JSON string'); } } } fail('unterminated JSON string'); };
    const value = depth => {
      if (depth > 64) fail('JSON depth exceeds 64');
      if (++nodes > 100000) fail('JSON values exceed 100000');
      whitespace(); const char = text[cursor];
      if (char === '"') return string();
      if (char === '[' || char === '{') {
        const array = char === '[', result = array ? [] : Object.create(null), end = array ? ']' : '}'; cursor++; whitespace();
        if (text[cursor] === end) { cursor++; return result; }
        while (true) {
          whitespace(); let key;
          if (!array) { if (text[cursor] !== '"') fail('expected object key'); key = string(); whitespace(); if (text[cursor++] !== ':') fail('expected colon'); }
          const item = value(depth + 1); if (array) result.push(item); else result[key] = item;
          whitespace(); const delimiter = text[cursor++]; if (delimiter === end) return result; if (delimiter !== ',') fail('expected JSON delimiter');
        }
      }
      for (const [token, decoded] of [['null', null], ['true', true], ['false', false]]) if (text.startsWith(token, cursor)) { cursor += token.length; return decoded; }
      const match = text.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (!match) fail('not JSON'); cursor += match[0].length; return new Numeric(match[0]);
    };
    const json = value(1); whitespace(); if (cursor !== text.length) fail('trailing JSON data');
    const object = item => item !== null && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Numeric);
    const kind = item => { if (!object(item) || typeof item.type !== 'string') fail('object without a type'); return item.type; };
    const list = (item, each) => { if (!Array.isArray(item)) fail('coordinates must be a list'); return item.map(each); };
    const position = item => {
      if (++points > 20000) fail('positions exceed 20000');
      if (!Array.isArray(item) || !(item[0] instanceof Numeric) || !(item[1] instanceof Numeric)) fail('position needs longitude and latitude numbers');
      const lon = item[0].value, lat = item[1].value;
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) fail('position past the globe');
      return [lon, lat];
    };
    const line = item => { const result = list(item, position); if (result.length < 2) fail('line needs two positions'); return result; };
    const ring = item => { const result = list(item, position); if (result.length < 4) fail('ring needs four or more positions'); if (result[0][0] !== result.at(-1)[0] || result[0][1] !== result.at(-1)[1]) fail('ring does not close'); return result; };
    const geometry = item => {
      if (++geometries > 4096) fail('geometries exceed 4096');
      const type = kind(item), coordinates = item.coordinates;
      switch (type) {
        case 'Point': return {type, coordinates: position(coordinates)};
        case 'MultiPoint': return {type, coordinates: list(coordinates, position)};
        case 'LineString': return {type, coordinates: line(coordinates)};
        case 'MultiLineString': return {type, coordinates: list(coordinates, line)};
        case 'Polygon': return {type, coordinates: list(coordinates, ring)};
        case 'MultiPolygon': return {type, coordinates: list(coordinates, polygon => list(polygon, ring))};
        case 'GeometryCollection': if (!Array.isArray(item.geometries)) fail('collection needs geometries'); return {type, geometries: item.geometries.map(geometry)};
        default: fail('unknown geometry type');
      }
    };
    const plain = item => item instanceof Numeric ? item.value : Array.isArray(item) ? item.map(plain) : object(item) ? Object.fromEntries(Object.entries(item).map(([key, val]) => [key, plain(val)])) : item;
    const feature = item => {
      if (kind(item) !== 'Feature') fail('expected a Feature');
      let id = item.id ?? null;
      if (id instanceof Numeric) {
        // Rust serde_json integer range. Floats/exponents (and -0) have a Rust
        // formatting contract we do not emulate: callers must use string IDs.
        if (!/^-?(?:0|[1-9]\d*)$/.test(id.raw) || id.raw === '-0') fail('numeric IDs must be integer literals; use a string ID for floats/exponents');
        const exact = BigInt(id.raw); if (exact < -9223372036854775808n || exact > 18446744073709551615n) fail('numeric ID exceeds 64-bit integer range; use a string ID');
        id = id.raw;
      } else if (id !== null && typeof id !== 'string') fail('id must be text or a number');
      if (!Object.hasOwn(item, 'geometry')) fail('Feature without geometry');
      if (item.properties != null && !object(item.properties)) fail('properties must be an object');
      return {type: 'Feature', id, properties: plain(item.properties ?? {}), geometry: item.geometry === null ? null : geometry(item.geometry)};
    };
    if (kind(json) === 'FeatureCollection') { if (!Array.isArray(json.features)) fail('collection needs features'); if (json.features.length > 4096) fail('features exceed 4096'); return json.features.map(feature); }
    return kind(json) === 'Feature' ? [feature(json)] : [{type: 'Feature', id: null, properties: {}, geometry: geometry(json)}];
  };
  const geometryParts = geometry => !geometry ? [] : geometry.type === 'GeometryCollection' ? geometry.geometries.flatMap(geometryParts) : [geometry];
  // DOM starts here; geometry above is also exercised by the deterministic Node tests.
  const ns = 'http://www.w3.org/2000/svg';
  const svg = (name, attrs = {}) => { const node = document.createElementNS(ns, name); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value)); return node; };
  // Only trusted host JavaScript can register providers. Screens select an ID.
  const tileProviders = new Map();
  const registerTileProvider = (id, options) => {
    if (typeof id !== 'string' || !/^[a-zA-Z][\w.-]{0,63}$/.test(id)) throw new TypeError('Invalid map tile provider ID');
    if (!options || Object.keys(options).some(key => !['revision', 'minZoom', 'maxZoom', 'attribution', 'urlTemplate'].includes(key))) throw new TypeError('Invalid map tile provider options');
    const {revision, minZoom, maxZoom, attribution, urlTemplate} = options;
    if (typeof revision !== 'string' || !revision.trim() || revision.length > 128 || typeof attribution !== 'string' || !attribution.trim() || attribution.length > 1024 || !Number.isInteger(minZoom) || !Number.isInteger(maxZoom) || minZoom < 0 || maxZoom > 19 || minZoom > maxZoom) throw new TypeError('Invalid map tile provider metadata');
    if (typeof urlTemplate !== 'string' || urlTemplate.length > 2048 || !['{z}', '{x}', '{y}'].every(token => urlTemplate.includes(token)) || /[{}]/.test(urlTemplate.replaceAll(/\{[zxy]\}/g, '0'))) throw new TypeError('Invalid map tile URL template');
    const authority = urlTemplate.match(/^(?:[a-zA-Z][a-zA-Z\d+.-]*:)?\/\/([^/?#]*)/)?.[1];
    if (authority && /[{}]/.test(authority)) throw new TypeError('Map tile tokens must be in the path or query');
    const sample = new URL(urlTemplate.replaceAll(/\{[zxy]\}/g, '0'), document.baseURI), origin = document.location.origin;
    if (new URL(urlTemplate.replaceAll(/\{[zxy]\}/g, '1'), document.baseURI).origin !== sample.origin) throw new TypeError('Map tile tokens must be in the path or query');
    if (sample.username || sample.password || sample.hash || (sample.protocol !== 'https:' && !(sample.protocol === 'http:' && sample.origin === origin))) throw new TypeError('Map tiles require a same-origin or HTTPS URL');
    if (!tileProviders.has(id) && tileProviders.size >= 32) throw new RangeError('At most 32 map tile providers can be registered');
    const provider = Object.freeze({id, revision, minZoom, maxZoom, attribution, urlTemplate, baseURI: document.baseURI, origin});
    const notify = () => document.dispatchEvent(new CustomEvent('ely:map-provider', {detail: {id}}));
    tileProviders.set(id, provider); notify();
    // An old disposer cannot remove a newer registration with the same ID/revision.
    return () => { if (tileProviders.get(id) === provider) { tileProviders.delete(id); notify(); } };
  };
  const abortable = (promise, signal) => new Promise((resolve, reject) => {
    const finish = (fn, value) => { signal.removeEventListener('abort', cancel); fn(value); };
    const cancel = () => finish(reject, new Error('Map tile load cancelled'));
    // Always observe the supplied promise, even when cancellation came first.
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, {once: true});
  });
  const mountTileLayer = (root, layer, attribution, signal) => {
    let provider, providerID, generation = 0, active = 0, alive = true, lastView;
    let cache = new Map(), placements = new Map();
    const originalAttribution = attribution?.textContent || '', status = root.querySelector('[data-map-tile-status]');
    const report = message => { if (status) { status.textContent = message; status.hidden = !message; } };
    const owned = entry => alive && root.isConnected && entry.generation === generation && cache.get(entry.key) === entry;
    const release = entry => { entry.controller?.abort(); clearTimeout(entry.timer); if (entry.url) URL.revokeObjectURL(entry.url); entry.url = null; entry.bytes = 0; entry.pixels = 0; };
    // Retained encoded bytes and decoded pixels are bounded independently of count.
    const reserve = (entry, field, value, limit) => {
      entry[field] = value;
      let total = [...cache.values()].reduce((sum, item) => sum + (item[field] || 0), 0);
      for (const [key, item] of cache) { if (total <= limit) break; if (!placements.has(key)) { total -= item[field] || 0; release(item); cache.delete(key); } }
      if (total > limit) throw new Error('Map tile memory budget exceeded');
    };
    const reset = () => { generation++; cache.forEach(release); cache = new Map(); placements = new Map(); layer.replaceChildren(); active = 0; };
    const paint = entry => {
      if (!owned(entry)) return;
      for (const slot of placements.get(entry.key) || []) {
        slot.dataset.mapTileState = entry.state; slot.replaceChildren();
        if (entry.state === 'ready') { const image = document.createElement('img'); image.alt = ''; image.draggable = false; image.src = entry.url; slot.append(image); }
        else if (entry.state === 'error') { const mark = document.createElement('span'); mark.textContent = '×'; mark.setAttribute('aria-label', 'Map tile unavailable'); slot.append(mark); }
      }
    };
    const summary = () => {
      if (!alive || !root.isConnected) return;
      const entries = [...placements.keys()].map(key => cache.get(key));
      root.dataset.mapTilesState = entries.some(entry => entry.state === 'error') ? 'error' : entries.some(entry => entry.state !== 'ready') ? 'pending' : 'ready';
      layer.setAttribute('aria-busy', String(entries.some(entry => entry.state === 'pending' || entry.state === 'queued')));
      report(entries.some(entry => entry.state === 'error') ? 'Some map tiles are unavailable.' : '');
    };
    const pump = () => {
      if (!alive || !root.isConnected) return;
      for (const entry of cache.values()) {
        if (active >= 8) break;
        if (entry.state !== 'queued' || !placements.has(entry.key)) continue;
        entry.state = 'pending'; entry.controller = new AbortController(); active++;
        entry.timer = setTimeout(() => entry.controller.abort(), 15000); paint(entry);
        const current = provider;
        Promise.resolve().then(async () => {
          if (!owned(entry)) return;
          const resolved = new URL(current.urlTemplate.replaceAll('{z}', entry.z).replaceAll('{x}', entry.tileX).replaceAll('{y}', entry.tileY), current.baseURI);
          if (resolved.username || resolved.password || resolved.hash || (resolved.protocol !== 'https:' && !(resolved.protocol === 'http:' && resolved.origin === current.origin))) throw new TypeError('Invalid map tile URL');
          const url = resolved.href;
          const response = await abortable(fetch(url, {signal: entry.controller.signal, credentials: 'same-origin', referrerPolicy: 'no-referrer'}), entry.controller.signal);
          if (!response.ok) throw new Error('Map tile unavailable');
          const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
          if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(type) || Number(response.headers.get('content-length')) > 4 * 1024 * 1024) throw new Error('Invalid raster tile');
          const reader = response.body.getReader(), chunks = []; let size = 0;
          try {
            while (true) { const {done, value} = await abortable(reader.read(), entry.controller.signal); if (done) break; size += value.byteLength; if (size > 4 * 1024 * 1024) { await abortable(reader.cancel(), entry.controller.signal); throw new Error('Raster tile exceeds 4 MiB'); } chunks.push(value); }
          } finally { reader.releaseLock(); }
          const blob = new Blob(chunks, {type});
          if (!owned(entry)) return;
          reserve(entry, 'bytes', blob.size, 32 * 1024 * 1024);
          entry.url = URL.createObjectURL(blob);
          const image = new Image(); image.src = entry.url; await abortable(image.decode(), entry.controller.signal);
          if (!owned(entry)) return;
          if (image.naturalWidth > 1024 || image.naturalHeight > 1024 || !image.naturalWidth || !image.naturalHeight) throw new Error('Invalid raster tile dimensions');
          reserve(entry, 'pixels', image.naturalWidth * image.naturalHeight, 16 * 1024 * 1024);
          entry.state = 'ready'; paint(entry);
        }).catch(() => { if (owned(entry)) { release(entry); entry.state = 'error'; paint(entry); } }).finally(() => {
          clearTimeout(entry.timer);
          // Stale completions do not alter the new provider's concurrency budget.
          if (entry.generation === generation && alive) { active--; summary(); pump(); }
        });
      }
    };
    const update = (center, zoom, width, height) => {
      if (!alive || !root.isConnected) return;
      lastView = [center, zoom, width, height];
      const id = root.dataset.mapTileProvider || '', next = tileProviders.get(id);
      if (provider !== next || providerID !== id) { reset(); provider = next; providerID = id; }
      layer.hidden = !id;
      if (attribution) { attribution.textContent = id ? provider?.attribution || '' : originalAttribution; attribution.hidden = !attribution.textContent; }
      if (!id) { delete root.dataset.mapTilesState; report(''); return; }
      if (!provider) { root.dataset.mapTilesState = 'unknown-provider'; report('Map tile provider is unavailable.'); layer.setAttribute('aria-busy', 'false'); return; }
      let laid;
      try { laid = tilePlacements(center, zoom, width, height, provider.minZoom, provider.maxZoom); }
      catch { reset(); root.dataset.mapTilesState = 'coverage-limit'; report('Map tile coverage exceeds the supported limit.'); layer.setAttribute('aria-busy', 'false'); return; }
      placements = new Map(); layer.replaceChildren();
      for (const tile of laid) {
        const key = `${provider.id}:${provider.revision}:${tile.z}/${tile.tileX}/${tile.tileY}`;
        const slot = document.createElement('div'); slot.className = 'ely-map__tile'; slot.dataset.mapTile = `${tile.z}/${tile.tileX}/${tile.tileY}`; slot.dataset.mapTileColumn = String(tile.column);
        Object.assign(slot.style, {left: `${tile.x}px`, top: `${tile.y}px`, width: `${tile.w}px`, height: `${tile.h}px`});
        layer.append(slot); if (!placements.has(key)) placements.set(key, []); placements.get(key).push(slot);
        let entry = cache.get(key);
        if (!entry) { entry = {...tile, key, generation, state: 'queued'}; cache.set(key, entry); }
        // Insertion order is LRU; repeated world copies still refer to one entry.
        cache.delete(key); cache.set(key, entry);
      }
      for (const [key, entry] of cache) if (!placements.has(key) && (entry.state === 'pending' || entry.state === 'queued' || cache.size > 128)) { release(entry); cache.delete(key); }
      for (const key of placements.keys()) paint(cache.get(key));
      summary(); pump();
    };
    document.addEventListener('ely:map-provider', event => { if (event.detail?.id === root.dataset.mapTileProvider && lastView) update(...lastView); }, {signal});
    signal.addEventListener('abort', () => { alive = false; reset(); report(''); if (attribution) { attribution.textContent = originalAttribution; attribution.hidden = !originalAttribution; } delete root.dataset.mapTilesState; }, {once: true});
    return {update};
  };
  const number = (value, fallback = 0) => value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : fallback;
  const mounts = new WeakMap(), copies = new WeakMap();
  const ownerOf = root => root.closest('[data-ely-family]') || root;
  const dispatch = (root, type, detail) => { const owner = ownerOf(root); if (root.dataset.mapDisabled === 'true' || owner.dataset.elyDisabled === 'true') return; owner.dispatchEvent(new CustomEvent(type, {bubbles: true, cancelable: true, detail: {...detail, id: owner.id, component: owner.dataset.elyComponent || 'maps/MapView'}})); };
  const localFeatures = async signal => { const response = await fetch('/assets/ely/world-land.json', {credentials: 'same-origin', signal}); if (!response.ok) throw new Error('world map unavailable'); const data = await response.json(); if (data.provenance?.source !== 'Natural Earth' || !Array.isArray(data.features)) throw new Error('invalid world map'); return data.features; };
  const initCopy = root => { if (copies.has(root)) return; const controller = new AbortController(); copies.set(root, controller); root.querySelector('[data-map-copy]').addEventListener('click', async () => { const button = root.querySelector('[data-map-copy]'); if (button.disabled || ownerOf(root).dataset.elyDisabled === 'true' || root.closest('[data-map-disabled]')) return; const value = root.querySelector('[data-map-coordinate]').textContent; try { await navigator.clipboard.writeText(value); if (!controller.signal.aborted) { root.querySelector('[data-map-copy-status]').textContent = 'Copied'; dispatch(root, 'ely:action', {action: 'copy-coordinate', value}); } } catch { if (!controller.signal.aborted) root.querySelector('[data-map-copy-status]').textContent = 'Copy unavailable. Select and copy the coordinates.'; } }, {signal: controller.signal}); };
  const init = root => {
    if (mounts.has(root)) return;
    const controller = new AbortController(), {signal} = controller, q = selector => root.querySelector(selector);
    const canvas = q('[data-map-canvas]'), viewport = q('[data-map-viewport]'), markers = q('[data-map-markers]'), popup = q('[data-map-popup]'), output = q('.ely-map__footer [data-map-coordinate]'), input = q('[data-map-value]'), legend = q('[data-map-legend]'), status = q('[data-map-status]');
    const tileLayer = q('[data-map-tiles]'), tileRenderer = tileLayer ? mountTileLayer(root, tileLayer, q('[data-map-attribution]'), signal) : null;
    const mode = root.dataset.mapMode || 'markers', markerPoints = () => [...markers.querySelectorAll('[data-map-point]')], disabled = () => root.dataset.mapDisabled === 'true' || ownerOf(root).dataset.elyDisabled === 'true';
    const initialCenter = root.dataset.mapLatitude !== '' && root.dataset.mapLatitude != null ? [clamp(number(root.dataset.mapLatitude), -MAX_LAT, MAX_LAT), number(root.dataset.mapLongitude)] : parseCoordinate(input?.value) || [0, 0];
    const initialZoom = clamp(number(root.dataset.mapInitialZoom, 1), 0, 19); let center = initialCenter.slice(), zoom = initialZoom, width, height, scale, offset, drag, popupTrigger, resize, cancelled = false;
    const clearGenerated = () => root.querySelectorAll('[data-map-generated]').forEach(node => node.remove());
    const restoreMarkers = () => markerPoints().forEach(marker => { marker.hidden = false; delete marker.dataset.cluster; delete marker._mapMembers; marker.querySelector('[data-map-count]')?.remove(); marker.setAttribute('aria-label', marker.dataset.mapLabel || marker.dataset.key || 'Location'); });
    const cleanup = () => { if (mounts.get(root)?.cleanup !== cleanup) return; cancelled = true; controller.abort(); resize?.disconnect(); clearGenerated(); restoreMarkers(); popup.hidden = true; mounts.delete(root); delete root.dataset.mapReady; };
    mounts.set(root, {cleanup}); clearGenerated(); root.dataset.mapReady = 'pending'; status.hidden = true; status.textContent = '';
    const listen = (target, type, handler, options = {}) => target?.addEventListener(type, handler, {...options, signal});
    root.style.maxWidth = `${Math.max(1, number(root.dataset.mapWidth, 720))}px`; canvas.style.height = `${Math.max(1, number(root.dataset.mapHeight, 360))}px`;
    const measure = () => { width = canvas.clientWidth; height = canvas.clientHeight; q('[data-map-svg]').setAttribute('viewBox', `0 0 ${width} ${height}`); };
    const at = (lat, lon) => { const [x, y] = project(lat, lon), [cx, cy] = project(...center), side = 256 * 2 ** zoom; return [((x - cx + .5 + 1) % 1 - .5) * side + width / 2, (y - cy) * side + height / 2]; };
    const place = (marker, lat, lon) => { const [x, y] = at(lat, lon); marker.style.left = `${x}px`; marker.style.top = `${y}px`; marker.hidden = x < 0 || x > width || y < 0 || y > height; marker.tabIndex = marker.hidden ? -1 : 0; };
    const updateClusters = () => { if (mode !== 'clusters') return; const groups = new Map(); markerPoints().forEach(marker => { const key = clusterKey(marker.dataset.lat, marker.dataset.lon, zoom); groups.set(key, [...(groups.get(key) || []), marker]); }); groups.forEach(group => { if (group.length < 2) return; const first = group[0], mean = group.map(marker => project(marker.dataset.lat, marker.dataset.lon)).reduce((sum, point) => [sum[0] + point[0] / group.length, sum[1] + point[1] / group.length], [0, 0]); group.slice(1).forEach(marker => { marker.hidden = true; marker.tabIndex = -1; }); first._mapMembers = group; first.dataset.cluster = group.length; const count = document.createElement('b'); count.dataset.mapCount = ''; count.textContent = group.length; first.append(count); first.setAttribute('aria-label', `${group.length} locations`); place(first, ...unproject(...mean)); }); };
    const updateHeat = () => { if (mode !== 'heatmap') return; const layer = q('[data-map-heat]'), side = 256 * 2 ** zoom, points = markerPoints().flatMap(marker => { const [x, y] = at(marker.dataset.lat, marker.dataset.lon); return [-1, 0, 1].map(copy => [x + copy * side, y, number(marker.dataset.value, 1)]); }), heat = heatDensity(points, width, height); layer.replaceChildren(); layer.setAttribute('transform', `translate(${-offset[0] / scale} ${-offset[1] / scale}) scale(${1 / scale})`); heat.values.forEach((value, index) => { if (value > .001) layer.append(svg('rect', {x: index % heat.columns * heat.cell, y: Math.floor(index / heat.columns) * heat.cell, width: heat.cell, height: heat.cell, opacity: value * .8, 'data-map-generated': '', 'data-map-heat-spot': value})); }); };
    const updateCoordinate = notify => { if (mode !== 'location') return; const value = coordinate(...center); if (input) { input.value = value; if (notify) input.dispatchEvent(new Event('input', {bubbles: true})); } if (output) output.textContent = written(...center, root.dataset.mapFormat || 'decimal'); if (notify) { dispatch(root, 'ely:change', {name: input?.name || 'location', value, latitude: center[0], longitude: center[1]}); dispatch(root, 'ely:action', {action: root.dataset.mapPickAction || 'pick-location', value, latitude: center[0], longitude: center[1]}); } };
    const apply = (notify = false) => { measure(); tileRenderer?.update(center, zoom, width, height); const [cx, cy] = project(...center), side = 256 * 2 ** zoom; scale = side / 100; offset = [width / 2 - cx * side, height / 2 - cy * side]; viewport.setAttribute('transform', `translate(${offset[0]} ${offset[1]}) scale(${scale})`); root.dataset.mapZoom = String(zoom); root.dataset.mapCenter = coordinate(...center); restoreMarkers(); markerPoints().forEach(marker => place(marker, marker.dataset.lat, marker.dataset.lon)); updateClusters(); root.querySelectorAll('[data-map-geojson-point]').forEach(point => point.setAttribute('r', 4 / scale)); if (['world', 'choropleth', 'heatmap'].includes(mode)) markerPoints().forEach(marker => marker.hidden = true); updateHeat(); updateCoordinate(notify); q('[data-map-zoom="in"]').disabled = disabled() || zoom >= 19; q('[data-map-zoom="out"]').disabled = disabled() || zoom <= 0; if (popupTrigger && !popup.hidden) { popup.style.left = `${clamp(parseFloat(popupTrigger.style.left), 8, Math.max(8, width - 248))}px`; popup.style.top = `${clamp(parseFloat(popupTrigger.style.top) + 8, 8, Math.max(8, height - 100))}px`; } if (notify) dispatch(root, 'ely:action', {action: root.dataset.mapViewportAction || 'change-viewport', viewport: {latitude: center[0], longitude: center[1], zoom}, value: coordinate(...center)}); };
    const zoomTo = (next, x = width / 2, y = height / 2) => { if (disabled()) return; const before = zoom; next = clamp(next, 0, 19); center = zoomAbout(center, zoom, next, x, y, width, height); zoom = next; if (mode === 'clusters' && before !== zoom && markers.contains(document.activeElement)) canvas.focus(); apply(true); };
    const closePopup = () => { const held = popupTrigger; popup.hidden = true; popupTrigger = null; held?.focus(); dispatch(root, 'ely:action', {action: 'close-map-popup', key: held?.dataset.key || held?.dataset.mapLabel || ''}); };
    const showPopup = marker => { popupTrigger = marker; popup.hidden = false; q('[data-map-popup-label]').textContent = marker.dataset.mapLabel || marker.dataset.key || 'Location'; q('[data-map-popup-value]').textContent = marker.dataset.value; q('[data-map-popup-coordinate]').textContent = written(number(marker.dataset.lat), number(marker.dataset.lon), 'dms'); q('[data-map-popup-members]').hidden = true; apply(); q('[data-map-close]').focus(); dispatch(root, 'ely:action', {action: root.dataset.mapMarkerAction || 'select-marker', key: marker.dataset.key || marker.dataset.mapLabel, value: marker.dataset.value, latitude: number(marker.dataset.lat), longitude: number(marker.dataset.lon)}); };
    const fitCluster = marker => { const points = marker._mapMembers.map(item => project(item.dataset.lat, item.dataset.lon)), xs = points.map(point => point[0]), ys = points.map(point => point[1]), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys); center = unproject((minX + maxX) / 2, (minY + maxY) / 2); const next = Math.min(Math.log2(Math.max(1, width - 64) / (256 * (maxX - minX || Number.EPSILON))), Math.log2(Math.max(1, height - 64) / (256 * (maxY - minY || Number.EPSILON)))); zoom = clamp(Math.max(zoom, next), 0, 19); canvas.focus(); apply(true); };
    const valueByKey = new Map(markerPoints().map(marker => [String(marker.dataset.key || marker.dataset.mapLabel || marker.getAttribute('aria-label')).toLowerCase(), number(marker.dataset.value)]));
    const span = [...valueByKey.values()], least = span.length ? Math.min(...span) : 0, most = span.length ? Math.max(...span) : 0;
    const appendGeoJSON = (features, land = false) => {
      const layer = q(land ? '[data-map-land]' : '[data-map-geojson-layer]');
      for (const feature of features) {
        const props = feature.properties || {};
        // Property objects are untrusted data, never invoke their coercion hooks.
        const key = String([props.region, props.iso_a2, feature.id, props.name].find(value => typeof value === 'string' && value !== '' || typeof value === 'number') ?? '').toLowerCase();
        const value = valueByKey.get(key), colored = !land && ['world', 'choropleth'].includes(mode);
        for (const geometry of geometryParts(feature.geometry)) for (const shift of [-200, -100, 0, 100, 200]) {
          if (['Point', 'MultiPoint'].includes(geometry.type)) {
            const places = geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates;
            places.forEach(([lon, lat]) => { const [x, y] = project(lat, lon); layer.append(svg('circle', {cx: x * 100 + shift, cy: y * 100, r: 4 / scale, 'data-map-geojson-point': '', 'data-map-generated': ''})); });
            continue;
          }
          const d = pathFor(geometry); if (!d.trim()) continue;
          const path = svg('path', {d, transform: `translate(${shift} 0)`, 'fill-rule': 'evenodd', 'data-map-generated': ''});
          if (colored) {
            path.dataset.mapChoropleth = value === undefined ? 'empty' : 'value';
            path.style.setProperty('--ely-map-share', String(value === undefined ? 0 : most > least ? .15 + .85 * (value - least) / (most - least) : 1));
          } else if (!land) path.dataset.mapGeojsonFeature = geometry.type;
          layer.append(path);
        }
      }
    };
    mounts.get(root).refreshTiles = () => tileRenderer?.update(center, zoom, width, height);
    const source = q('template[data-map-geojson]'), inline = source?.content.textContent;
    apply();
    Promise.resolve().then(async () => { const features = source ? readGeoJSON(inline) : null; const land = await localFeatures(signal); if (cancelled || !root.isConnected) return; if (['world', 'choropleth'].includes(mode) && !source) appendGeoJSON(land); else { appendGeoJSON(land, true); if (features) appendGeoJSON(features); } if (['world', 'choropleth'].includes(mode)) { legend.hidden = false; q('[data-map-legend-low]').textContent = least.toLocaleString('en-US'); q('[data-map-legend-high]').textContent = most.toLocaleString('en-US'); } root.dataset.mapReady = 'true'; }).catch(error => { if (cancelled || error.name === 'AbortError') return; root.dataset.mapReady = 'error'; status.hidden = false; status.textContent = error.message.startsWith('Invalid GeoJSON:') ? error.message : 'Map geometry is unavailable.'; });
    root.querySelectorAll('[data-map-route]').forEach(route => { const points = [...route.querySelectorAll('[data-map-point]')].map(stop => [number(stop.dataset.lon), number(stop.dataset.lat)]); if (points.length > 1) for (const shift of [-200, -100, 0, 100, 200]) q('[data-map-routes]').append(svg('path', {d: linePath(points), transform: `translate(${shift} 0)`, 'data-map-generated': ''})); });
    listen(markers, 'click', event => { const marker = event.target.closest('[data-map-point]'); if (!marker || marker.hidden || disabled()) return; if (marker._mapMembers) fitCluster(marker); else showPopup(marker); });
    listen(q('[data-map-close]'), 'click', () => { if (!disabled()) closePopup(); });
    listen(q('[data-map-zoom="in"]'), 'click', () => zoomTo(zoom + 1)); listen(q('[data-map-zoom="out"]'), 'click', () => zoomTo(zoom - 1)); listen(q('[data-map-zoom="reset"]'), 'click', () => { if (!disabled()) { center = initialCenter.slice(); zoom = initialZoom; apply(true); } });
    const stopDrag = () => { drag = null; canvas.classList.remove('is-dragging'); };
    listen(canvas, 'pointerdown', event => { if (disabled() || event.button !== 0 || event.target.closest('button,[data-map-popup],[data-map-legend]')) return; drag = [event.clientX, event.clientY, center.slice()]; if (event.isTrusted) canvas.setPointerCapture?.(event.pointerId); canvas.focus(); canvas.classList.add('is-dragging'); });
    listen(canvas, 'pointermove', event => { if (!drag || disabled()) return; center = panCenter(drag[2], zoom, event.clientX - drag[0], event.clientY - drag[1], height); apply(true); }); listen(canvas, 'pointerup', stopDrag); listen(canvas, 'pointercancel', stopDrag); listen(canvas, 'lostpointercapture', stopDrag);
    listen(canvas, 'wheel', event => { if (disabled()) return; event.preventDefault(); const box = canvas.getBoundingClientRect(), unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1; if (event.ctrlKey || event.metaKey) zoomTo(zoom - event.deltaY * unit / 240 * Math.LOG2E, event.clientX - box.left, event.clientY - box.top); else { center = panCenter(center, zoom, -event.deltaX * unit, -event.deltaY * unit, height); apply(true); } }, {passive: false});
    listen(canvas, 'keydown', event => { if (disabled()) return; if (event.key === 'Escape' && !popup.hidden) { event.preventDefault(); closePopup(); return; } if (event.target !== canvas || event.altKey || event.ctrlKey || event.metaKey) return; if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); zoomTo(zoom + (event.key === '-' ? -1 : 1)); } else if (event.key === '0') { event.preventDefault(); center = initialCenter.slice(); zoom = initialZoom; apply(true); } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const step = Math.min(width, height) / 4; center = panCenter(center, zoom, event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0, event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0, height); apply(true); } });
    const receiveViewport = value => { if (!value || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) || !Number.isFinite(value.zoom)) return; center = [clamp(value.latitude, -MAX_LAT, MAX_LAT), wrap((value.longitude + 180) / 360) * 360 - 180]; zoom = clamp(value.zoom, 0, 19); apply(); };
    listen(ownerOf(root), 'ely:map-viewport', event => { if (event.target === ownerOf(root)) receiveViewport(event.detail); });
    listen(ownerOf(root), 'ely:result', event => { if (event.target === ownerOf(root)) receiveViewport(event.detail?.result?.viewport); });
    if (typeof ResizeObserver !== 'undefined') { resize = new ResizeObserver(() => { if (!cancelled) apply(); }); resize.observe(canvas); }
  };
  const rootsIn = (scope, selector) => [...(scope?.matches?.(selector) ? [scope] : []), ...(scope || document).querySelectorAll(selector)];
  const start = (scope = document) => { rootsIn(scope, '[data-ui-component="map-view"]').forEach(init); rootsIn(scope, '[data-map-copyable]').forEach(initCopy); };
  globalThis.ElyMap = Object.freeze({registerTileProvider});
  start(); document.addEventListener('htmx:after:swap', event => start(event.target));
  new MutationObserver(records => { records.forEach(record => { if (record.type === 'attributes') { mounts.get(record.target)?.refreshTiles(); return; } record.addedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE) start(node); }); record.removedNodes.forEach(node => { if (node.nodeType !== Node.ELEMENT_NODE) return; const maps = rootsIn(node, '[data-ui-component="map-view"]'), copyRoots = rootsIn(node, '[data-map-copyable]'); queueMicrotask(() => { maps.forEach(root => { if (!root.isConnected) mounts.get(root)?.cleanup(); }); copyRoots.forEach(root => { if (!root.isConnected) { copies.get(root)?.abort(); copies.delete(root); } }); }); }); }); }).observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-map-tile-provider']});
})();
