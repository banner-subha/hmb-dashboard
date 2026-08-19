// Build-time pre-simplification of per-state district boundary files.
//
// Loads each public/geo/{state}.json (TopoJSON), converts to GeoJSON with
// topojson-client, runs the SAME Douglas-Peucker simplification used at
// runtime in src/pages/GeoIntelligence.jsx (shared via src/utils/geoSimplify.js),
// and re-encodes the simplified geometry back into compact TopoJSON (via
// topojson-server) written to public/geo-simplified/{state}.json.
//
// Runtime impact: geo-simplified files carry the same { objects, arcs, transform }
// shape the app already decodes with topojson-client feature(), so the component
// only needs to skip its own simplify pass for these files.
//
// Usage: node scripts/pre-simplify-geo.mjs [stateSlug...]
//   No args        -> process every public/geo/*.json except india_state.geojson
//   With args      -> only process the given slugs (e.g. tamilnadu westbengal)

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import { simplifyFeatureCollection } from '../src/utils/geoSimplify.js';

const TOLERANCE = 0.01;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEO_DIR = join(ROOT, 'public', 'geo');
const OUT_DIR = join(ROOT, 'public', 'geo-simplified');
const SKIP = new Set(['india_state.geojson']);

function simplifyFile(slug) {
  const inPath = join(GEO_DIR, `${slug}.json`);
  if (!existsSync(inPath)) {
    console.error(`[skip] ${slug}: ${inPath} not found`);
    return;
  }
  const origText = readFileSync(inPath, 'utf8');
  const topo = JSON.parse(origText);

  const key = Object.keys(topo.objects || {})[0];
  if (!key) {
    console.error(`[skip] ${slug}: no objects in TopoJSON`);
    return;
  }

  const geo = feature(topo, topo.objects[key]);
  const simplified = simplifyFeatureCollection(geo.features, TOLERANCE);

  // Re-encode simplified GeoJSON -> TopoJSON. The objects key is preserved
  // so the runtime's feature(topo, topo.objects[key]) lookup keeps working.
  const outTopo = topology({ [key]: { type: 'FeatureCollection', features: simplified } });

  const outBytes = Buffer.byteLength(JSON.stringify(outTopo));
  const origBytes = Buffer.byteLength(origText);
  const pct = origBytes ? Math.round(((origBytes - outBytes) / origBytes) * 100) : 0;

  // Only ship files that are actually smaller pre-simplified. The rest stay
  // untouched so the runtime keeps its feature()+simplify path for them.
  if (outBytes >= origBytes) {
    console.log(`[keep] ${slug}: pre-simplified ${formatBytes(outBytes)} >= original ${formatBytes(origBytes)} — not writing`);
    return;
  }

  const outPath = join(OUT_DIR, `${slug}.json`);
  writeFileSync(outPath, JSON.stringify(outTopo));
  console.log(`[ok] ${slug}: ${formatBytes(origBytes)} -> ${formatBytes(outBytes)} (${pct >= 0 ? '−' : '+'}${Math.abs(pct)}%)`);
}

function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function main() {
  const args = process.argv.slice(2);
  mkdirSync(OUT_DIR, { recursive: true });

  if (args.length > 0) {
    for (const slug of args) simplifyFile(slug);
    return;
  }

  const files = readdirSync(GEO_DIR).filter(f => f.endsWith('.json') && !SKIP.has(f));
  for (const f of files.sort()) {
    const slug = basename(f, '.json');
    simplifyFile(slug);
  }
}

main();
