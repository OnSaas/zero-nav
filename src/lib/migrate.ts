import type { Category, Item, LegacySiteData, NavData, YamlConfig } from '../types';
import { defaultNavData, newId } from '../types';
import { faviconUrlFor, sanitizeSvg } from './sanitize';

function itemFromSite(
  title: string,
  url: string,
  description: string,
  iconRaw: string | undefined,
  order: number,
): Item {
  const svg = iconRaw ? sanitizeSvg(iconRaw) : null;
  return {
    id: newId('item'),
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
  const groups = new Map<string, NonNullable<LegacySiteData['bookmarks']>>();
  for (const b of data.bookmarks || []) {
    if (!b?.url) continue;
    const tag = (b.tags && b.tags[0]) || '未分类';
    const list = groups.get(tag) || [];
    list.push(b);
    groups.set(tag, list);
  }

  let order = 0;
  const categories: Category[] = [];
  for (const [name, bookmarks] of groups) {
    const sorted = [...bookmarks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    categories.push({
      id: newId('cat'),
      name,
      order: order++,
      visible: true,
      items: sorted.map((b, i) => itemFromSite(b.title, b.url, '', undefined, i)),
    });
  }

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
    categories,
  };
}

export function fromYamlConfig(data: YamlConfig): NavData {
  const categories: Category[] = [];
  (data.categories || []).forEach((cat, ci) => {
    const name = (cat.name || '').trim();
    if (!name) return;
    const sites = cat.sites || [];
    const icon = cat.icon ? sanitizeSvg(cat.icon) || undefined : undefined;
    categories.push({
      id: newId('cat'),
      name,
      icon,
      order: ci,
      visible: true,
      items: sites
        .filter((s) => s?.url)
        .map((s, i) => itemFromSite(s.title || '', s.url || '', s.description || '', s.icon, i)),
    });
  });

  const base = defaultNavData();
  return { ...base, categories };
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

export function looksLikeNavData(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const cats = (raw as { categories?: unknown }).categories;
  if (!Array.isArray(cats)) return false;
  if (cats.length === 0) return true;
  return Array.isArray((cats[0] as { items?: unknown })?.items);
}
