/**
 * Convert config.yml or a site:bookmarks JSON file into nav:data JSON.
 *
 *   npx tsx scripts/migrate-from-zero-nav.ts
 *   npx tsx scripts/migrate-from-zero-nav.ts config.yml
 *   npx tsx scripts/migrate-from-zero-nav.ts ./bookmarks.json
 *
 * Then:
 *   npx wrangler kv key put nav:data --path=nav-data.json --binding=BOOKMARKS_KV
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { fromLegacyBookmarks, fromYamlConfig, looksLikeLegacyBookmarks, looksLikeNavData, looksLikeYamlConfig } from '../src/lib/migrate';
import { parseNavData } from '../src/lib/validate';
import type { NavData } from '../src/types';

const input = resolve(process.argv[2] || 'config.yml');
const output = resolve(process.argv[3] || 'nav-data.json');
const text = readFileSync(input, 'utf8');
const ext = extname(input).toLowerCase();

let nav: NavData;
if (ext === '.yml' || ext === '.yaml') {
  const raw = parseYaml(text);
  nav = looksLikeNavData(raw) ? parseNavData(raw) : fromYamlConfig(raw);
} else {
  const raw = JSON.parse(text) as unknown;
  if (looksLikeLegacyBookmarks(raw)) nav = fromLegacyBookmarks(raw);
  else if (looksLikeYamlConfig(raw) && !looksLikeNavData(raw)) nav = fromYamlConfig(raw);
  else nav = parseNavData(raw);
}

writeFileSync(output, JSON.stringify(nav, null, 2));
const items = nav.categories.reduce((n, c) => n + c.items.length, 0);
console.log(`Wrote ${output}`);
console.log(`categories=${nav.categories.length} items=${items}`);
