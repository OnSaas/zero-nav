import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Item, NavData, YamlSite } from '../types';
import { defaultNavData, newId } from '../types';
import {
  fromFlatYamlSites,
  fromLegacyBookmarks,
  fromYamlConfig,
  itemFromSite,
  looksLikeFlatYamlSites,
  looksLikeLegacyBookmarks,
  looksLikeNavData,
  looksLikeYamlConfig,
} from './migrate';
import { parseNavData } from './validate';
import { normalizeUrl } from './sanitize';

export type ImportFormat = 'json' | 'yaml' | 'netscape';

export type ImportPreview = {
  format: ImportFormat;
  itemsToAdd: number;
  duplicates: number;
};

function emptyNav(): NavData {
  return defaultNavData();
}

export function parseNetscapeBookmarks(html: string): NavData {
  const nav = emptyNav();
  const dtBlocks = html.split(/<DT>/i).slice(1);
  for (const block of dtBlocks) {
    const a = block.match(/<A[^>]*HREF="([^"]+)"[^>]*>([^<]*)<\/A>/i);
    if (!a) continue;
    const url = a[1];
    const title = a[2] || url;
    if (!/^https?:\/\//i.test(url)) continue;
    nav.items.push(itemFromSite(title, url, '', undefined, nav.items.length));
  }
  return nav;
}

export function payloadToNav(format: ImportFormat, payload: string): NavData {
  if (format === 'netscape') return parseNetscapeBookmarks(payload);

  if (format === 'yaml') {
    const raw = parseYaml(payload);
    if (looksLikeNavData(raw)) return parseNavData(raw);
    if (looksLikeYamlConfig(raw)) return fromYamlConfig(raw);
    if (looksLikeFlatYamlSites(raw)) return fromFlatYamlSites(raw.sites);
    return parseNavData(raw);
  }

  const raw = JSON.parse(payload) as unknown;
  if (looksLikeLegacyBookmarks(raw)) return fromLegacyBookmarks(raw);
  if (looksLikeNavData(raw)) return parseNavData(raw);
  if (looksLikeYamlConfig(raw)) return fromYamlConfig(raw);
  if (looksLikeFlatYamlSites(raw)) return fromFlatYamlSites(raw.sites);
  return parseNavData(raw);
}

export function existingUrls(nav: NavData): Set<string> {
  const set = new Set<string>();
  for (const item of nav.items) set.add(normalizeUrl(item.url));
  return set;
}

export function previewImport(current: NavData, incoming: NavData, replace: boolean): ImportPreview {
  if (replace) {
    return {
      format: 'json',
      itemsToAdd: incoming.items.length,
      duplicates: 0,
    };
  }

  const urls = existingUrls(current);
  let itemsToAdd = 0;
  let duplicates = 0;

  for (const item of incoming.items) {
    if (urls.has(normalizeUrl(item.url))) duplicates += 1;
    else itemsToAdd += 1;
  }

  return { format: 'json', itemsToAdd, duplicates };
}

export function mergeNav(current: NavData, incoming: NavData): NavData {
  const next: NavData = {
    ...current,
    items: current.items.map((item) => ({ ...item })),
  };
  const urls = existingUrls(next);

  for (const item of incoming.items) {
    const key = normalizeUrl(item.url);
    if (urls.has(key)) continue;
    urls.add(key);
    next.items.push({ ...item, id: newId(), order: next.items.length });
  }
  return next;
}

function siteFromItem(item: Item): YamlSite {
  return {
    title: item.title,
    url: item.url,
    description: item.description,
    icon: item.icon.type === 'svg' ? item.icon.value : '',
  };
}

export function exportYaml(nav: NavData): string {
  return stringifyYaml({ sites: nav.items.map(siteFromItem) });
}

export function exportLegacyYaml(nav: NavData): string {
  return stringifyYaml({
    categories: [
      {
        name: nav.site.title,
        icon: '',
        sites: nav.items.map(siteFromItem),
      },
    ],
  });
}
