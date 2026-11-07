import type { Item, LegacySiteData, NavData, YamlConfig, YamlSite } from '../types';
import { defaultNavData, newId } from '../types';
import { faviconUrlFor, sanitizeSvg } from './sanitize';

export function itemFromSite(
  title: string,
  url: string,
  description: string,
  iconRaw: string | undefined,
  order: number,
): Item {
  const svg = iconRaw ? sanitizeSvg(iconRaw) : null;
  return {
    id: newId(),
    title: title || url,
    url,
    description: description || '',
    icon: svg
      ? { type: 'svg', value: svg }
      : { type: 'favicon', value: faviconUrlFor(url) },
    order,
    visible: true,
  };
}

export function fromLegacyBookmarks(data: LegacySiteData): NavData {
  const ordered = (data.bookmarks || [])
    .map((b, i) => ({ b, order: b.order ?? i }))
    .filter(({ b }) => !!b?.url)
    .sort((a, b) => a.order - b.order)
    .map(({ b }) => b);

  const items = ordered.map((b, i) => itemFromSite(b.title, b.url, '', undefined, i));

  const header = data.meta?.customElements?.headerText || '在线服务';
  const footer = data.meta?.customElements?.footerText || 'Powered by zero-nav';
  const base = defaultNavData();
  return {
    ...base,
    updatedAt: data.updatedAt || new Date().toISOString(),
    site: {
      ...base.site,
      title: header,
      headerText: header,
      footerText: footer,
    },
    items,
  };
}

export function itemsFromSites(sites: YamlSite[]): Item[] {
  const items: Item[] = [];
  for (const site of sites) {
    if (!site?.url) continue;
    items.push(
      itemFromSite(site.title || '', site.url, site.description || '', site.icon, items.length),
    );
  }
  return items;
}

export function fromYamlConfig(data: YamlConfig): NavData {
  const sites: YamlSite[] = [];
  (data.categories || []).forEach((cat) => {
    for (const site of cat.sites || []) sites.push(site);
  });

  const base = defaultNavData();
  return { ...base, items: itemsFromSites(sites) };
}

export function fromFlatYamlSites(sites: YamlSite[]): NavData {
  const base = defaultNavData();
  return { ...base, items: itemsFromSites(sites) };
}

export function looksLikeLegacyBookmarks(raw: unknown): raw is LegacySiteData {
  return !!raw && typeof raw === 'object' && Array.isArray((raw as LegacySiteData).bookmarks);
}

export function looksLikeYamlConfig(raw: unknown): raw is YamlConfig {
  if (!raw || typeof raw !== 'object') return false;
  const cats = (raw as YamlConfig).categories;
  if (!Array.isArray(cats) || cats.length === 0) return false;
  return Array.isArray(cats[0]?.sites) || (!('items' in (cats[0] || {})) && 'name' in (cats[0] || {}));
}

export function looksLikeFlatYamlSites(raw: unknown): raw is { sites: YamlSite[] } {
  if (!raw || typeof raw !== 'object') return false;
  return Array.isArray((raw as { sites?: unknown }).sites);
}

export function looksLikeNavData(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.items)) return true;
  const cats = obj.categories;
  if (!Array.isArray(cats)) return false;
  if (cats.length === 0) return true;
  return Array.isArray((cats[0] as { items?: unknown })?.items);
}
