// Writes public/geo/world-110m.json, the country shapes the map widget draws (src/components/map-card.tsx):
// { width, height, countries: [{ id: ISO numeric, d: SVG path, box: [x0, y0, x1, y1] }] }, projected once with Equal Earth
// into a 1000 × 500 box, so the app ships no map library. Source: Natural Earth 1:110m (public domain) through the
// world-atlas package (ISC). Antarctica is left out. Regenerate (scratch dependencies, never in package.json):
//   cd E:\Claude\tmp\geo-build && npm i d3-geo topojson-client world-atlas
//   node scripts/build-world-map.mjs --deps E:\Claude\tmp\geo-build\node_modules
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const i = process.argv.indexOf('--deps');
const deps = i > 0 ? process.argv[i + 1] : 'E:/Claude/tmp/geo-build/node_modules';
const require = createRequire(path.join(deps, 'noop.js'));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
const { geoEqualEarth, geoPath } = await load('d3-geo');
const { feature } = await load('topojson-client');
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'));

const WIDTH = 1000;
const HEIGHT = 500;
const all = feature(topo, topo.objects.countries).features.filter((f) => f.id && f.id !== '010');
const projection = geoEqualEarth().fitSize([WIDTH, HEIGHT], { type: 'FeatureCollection', features: all });
const draw = geoPath(projection).digits(1);
const r = (n) => Math.round(n * 10) / 10;

const countries = all
  .map((f) => {
    const [[x0, y0], [x1, y1]] = draw.bounds(f);
    return { id: String(f.id).padStart(3, '0'), d: draw(f), box: [r(x0), r(y0), r(x1), r(y1)] };
  })
  .filter((c) => c.d);

mkdirSync(new URL('../public/geo/', import.meta.url), { recursive: true });
const out = JSON.stringify({ width: WIDTH, height: HEIGHT, countries });
writeFileSync(new URL('../public/geo/world-110m.json', import.meta.url), out);
console.log('countries', countries.length, 'bytes', out.length);
