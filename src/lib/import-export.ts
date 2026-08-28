import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Category, Item, NavData } from '../types';
import { defaultNavData, newId } from '../types';
import { looksLikeLegacyBookmarks, looksLikeNavData, looksLikeYamlConfig, fromLegacyBookmarks, fromYamlConfig } from './migrate';
import { parseNavData } from './validate';
import { normalizeUrl } from './sanitize';

export type ImportFormat = 'json' | 'yaml' | 'netscape';

export type ImportPreview = {
  format: ImportFormat;
  categoriesToAdd: number;
  itemsToAdd: number;
  duplicates: number;
  categoryNames: string[];
};

function emptyNav(): NavData {
  return defaultNavData();
}

export function parseNetscapeBookmarks(html: string): NavData {
  const nav = emptyNav();
  const uncategorized: Category = {
    id: newId('cat'),
    name: '导入',
    order: 0,
    visible: true,
    items: [],
  };

  const folderRe = /<H3[^>]*>([^<]+)<\/H3>/gi;
  const folders: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = folderRe.exec(html))) folders.push(m[1].trim());

  const catByName = new Map<string, Category>();
  if (folders.length) {
    folders.forEach((name, i) => {
      if (catByName.has(name)) return;
      const cat: Category = { id: newId('cat'), name, order: i, visible: true, items: [] };
      catByName.set(name, cat);
      nav.categories.push(cat);
    });
  } else {
    nav.categories.push(uncategorized);
    catByName.set(uncategorized.name, uncategorized);
  }

  const dtBlocks = html.split(/<DT>/i).slice(1);
  let currentFolder = nav.categories[0]?.name || '导入';
  for (const block of dtBlocks) {
    const folder = block.match(/<H3[^>]*>([^<]+)<\/H3>/i);
    if (folder) {
      currentFolder = folder[1].trim();
      continue;
    }
    const a = block.match(/<A[^>]*HREF="([^"]+)"[^>]*>([^<]*)<\/A>/i);
    if (!a) continue;
    const url = a[1];
    const title = a[2] || url;
    if (!/^https?:\/\//i.test(url)) continue;
    let cat = catByName.get(currentFolder);
    if (!cat) {
      cat = { id: newId('cat'), name: currentFolder, order: nav.categories.length, visible: true, items: [] };
      catByName.set(currentFolder, cat);
      nav.categories.push(cat);
    }
    const item: Item = {
      id: newId('item'),
      title,
      url,
      description: '',
      icon: { type: 'favicon', value: '' },
      order: cat.items.length,
      visible: true,
    };
    item.icon.value = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
    cat.items.push(item);
  }

  if (nav.categories.length === 0) nav.categories.push(uncategorized);
  nav.categories = nav.categories.filter((c) => c.items.length > 0 || c.name === '导入');
  return nav;
}

export function payloadToNav(format: ImportFormat, payload: string): NavData {
  if (format === 'netscape') return parseNetscapeBookmarks(payload);

  if (format === 'yaml') {
    const raw = parseYaml(payload);
    if (looksLikeYamlConfig(raw) && !looksLikeNavData(raw)) return fromYamlConfig(raw);
    return parseNavData(raw);
  }

  const raw = JSON.parse(payload) as unknown;
  if (looksLikeLegacyBookmarks(raw)) return fromLegacyBookmarks(raw);
  if (looksLikeYamlConfig(raw) && !looksLikeNavData(raw)) return fromYamlConfig(raw);
  return parseNavData(raw);
}

export function existingUrls(nav: NavData): Set<string> {
  const set = new Set<string>();
  for (const cat of nav.categories) {
    for (const item of cat.items) set.add(normalizeUrl(item.url));
  }
  return set;
}

export function previewImport(current: NavData, incoming: NavData, replace: boolean): ImportPreview {
  if (replace) {
    return {
      format: 'json',
      categoriesToAdd: incoming.categories.length,
      itemsToAdd: incoming.categories.reduce((n, c) => n + c.items.length, 0),
      duplicates: 0,
      categoryNames: incoming.categories.map((c) => c.name),
    };
  }

  const urls = existingUrls(current);
  const names = new Set(current.categories.map((c) => c.name));
  let categoriesToAdd = 0;
  let itemsToAdd = 0;
  let duplicates = 0;
  const categoryNames: string[] = [];

  for (const cat of incoming.categories) {
    if (!names.has(cat.name)) {
      categoriesToAdd += 1;
      categoryNames.push(cat.name);
    }
    for (const item of cat.items) {
      if (urls.has(normalizeUrl(item.url))) duplicates += 1;
      else itemsToAdd += 1;
    }
  }

  return { format: 'json', categoriesToAdd, itemsToAdd, duplicates, categoryNames };
}

export function mergeNav(current: NavData, incoming: NavData): NavData {
  const next: NavData = {
    ...current,
    categories: current.categories.map((c) => ({ ...c, items: [...c.items] })),
  };
  const byName = new Map(next.categories.map((c) => [c.name, c]));
  const urls = existingUrls(next);

  for (const cat of incoming.categories) {
    let target = byName.get(cat.name);
    if (!target) {
      target = {
        ...cat,
        id: newId('cat'),
        order: next.categories.length,
        items: [],
      };
      next.categories.push(target);
      byName.set(target.name, target);
    }
    for (const item of cat.items) {
      const key = normalizeUrl(item.url);
      if (urls.has(key)) continue;
      urls.add(key);
      target.items.push({ ...item, id: newId('item'), order: target.items.length });
    }
  }
  return next;
}

export function exportYaml(nav: NavData): string {
  return stringifyYaml(nav);
}

export function exportLegacyYaml(nav: NavData): string {
  return stringifyYaml({
    categories: nav.categories.map((c) => ({
      name: c.name,
      icon: c.icon || '',
      sites: c.items.map((i) => ({
        title: i.title,
        url: i.url,
        description: i.description,
        icon: i.icon.type === 'svg' ? i.icon.value : '',
      })),
    })),
  });
}
