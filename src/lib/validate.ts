import type { Item, ItemIcon, NavData, SiteSettings } from '../types';
import { defaultNavData, newId } from '../types';
import { faviconUrlFor, isHttpUrl, sanitizeSvg } from './sanitize';

export class ValidateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidateError';
  }
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asBool(v: unknown, fallback = true): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function parseIcon(raw: unknown, pageUrl: string): ItemIcon {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const type = obj.type === 'url' || obj.type === 'svg' || obj.type === 'favicon' ? obj.type : 'favicon';
  let value = asString(obj.value);

  if (type === 'svg') {
    const svg = sanitizeSvg(value);
    if (!svg) throw new ValidateError('图标 SVG 无效或过大（最大 8KB）');
    return { type, value: svg };
  }

  if (type === 'url') {
    if (value && !isHttpUrl(value)) throw new ValidateError('图标 URL 必须是 http(s)');
    return { type, value };
  }

  if (!value) value = faviconUrlFor(pageUrl);
  return { type: 'favicon', value };
}

export function parseItem(raw: unknown, index: number): Item {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const title = asString(obj.title).trim();
  const url = asString(obj.url).trim();
  if (!title) throw new ValidateError('链接标题不能为空');
  if (!isHttpUrl(url)) throw new ValidateError(`链接 URL 必须是 http(s)：${url || '(空)'}`);

  const id = asString(obj.id).startsWith('item_') ? asString(obj.id) : newId();
  return {
    id,
    title,
    url,
    description: asString(obj.description).trim(),
    icon: parseIcon(obj.icon, url),
    order: asNum(obj.order, index),
    visible: asBool(obj.visible, true),
  };
}

export function parseSite(raw: unknown): SiteSettings {
  const fallback = defaultNavData().site;
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const themeColor = asString(obj.themeColor, fallback.themeColor).trim() || fallback.themeColor;
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(themeColor)) {
    throw new ValidateError('主题色必须是 #RGB 或 #RRGGBB');
  }
  return {
    title: asString(obj.title, fallback.title).trim() || fallback.title,
    headerText: asString(obj.headerText, fallback.headerText).trim() || fallback.headerText,
    footerText: asString(obj.footerText, fallback.footerText),
    themeColor,
    showDescription: asBool(obj.showDescription, fallback.showDescription),
  };
}

function sortByOrder(raw: unknown[], indexOf: (value: unknown, i: number) => number): unknown[] {
  return raw
    .map((value, i) => ({ value, order: indexOf(value, i) }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.value);
}

function legacyItems(categoriesRaw: unknown[]): unknown[] {
  const categories = sortByOrder(categoriesRaw, (value, i) => {
    const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    return asNum(obj.order, i);
  });
  const flat: unknown[] = [];
  for (const category of categories) {
    const obj = category && typeof category === 'object' ? (category as Record<string, unknown>) : {};
    const items = Array.isArray(obj.items) ? obj.items : [];
    flat.push(...sortByOrder(items, (value, i) => {
      const entry = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
      return asNum(entry.order, i);
    }));
  }
  return flat;
}

export function parseNavData(raw: unknown): NavData {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const flatRaw = Array.isArray(obj.items)
    ? obj.items
    : legacyItems(Array.isArray(obj.categories) ? obj.categories : []);
  const items = flatRaw.map((item, i) => parseItem(item, i));
  items.forEach((item, i) => {
    item.order = i;
  });
  return {
    v: 2,
    rev: asNum(obj.rev, 0),
    updatedAt: asString(obj.updatedAt) || new Date().toISOString(),
    site: parseSite(obj.site),
    items,
  };
}

export function findDuplicates(nav: NavData, url: string, exceptId?: string): Item[] {
  const target = url.trim().toLowerCase().replace(/\/+$/, '');
  const hits: Item[] = [];
  for (const item of nav.items) {
    if (exceptId && item.id === exceptId) continue;
    const u = item.url.trim().toLowerCase().replace(/\/+$/, '');
    if (u === target) hits.push(item);
  }
  return hits;
}
