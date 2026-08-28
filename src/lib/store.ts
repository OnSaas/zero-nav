import type { NavData } from '../types';
import { DATA_KEY, HISTORY_PREFIX, HISTORY_TTL, LEGACY_KEY, defaultNavData, statsOf } from '../types';
import { parseNavData } from './validate';
import { fromLegacyBookmarks, looksLikeLegacyBookmarks } from './migrate';

export type HistoryEntry = {
  key: string;
  updatedAt?: string;
  categories?: number;
  items?: number;
};

export async function getNavData(kv: KVNamespace): Promise<NavData> {
  const current = await kv.get(DATA_KEY, 'json');
  if (current) {
    try {
      return parseNavData(current);
    } catch (error) {
      console.error('nav:data invalid', error);
      return defaultNavData();
    }
  }

  const legacy = await kv.get(LEGACY_KEY, 'json');
  if (legacy && looksLikeLegacyBookmarks(legacy)) {
    const migrated = fromLegacyBookmarks(legacy);
    await kv.put(DATA_KEY, JSON.stringify(migrated));
    return migrated;
  }

  return defaultNavData();
}

export async function backupNav(kv: KVNamespace, data: NavData): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `${HISTORY_PREFIX}${stamp}`;
  const s = statsOf(data);
  await kv.put(key, JSON.stringify(data), {
    expirationTtl: HISTORY_TTL,
    metadata: {
      updatedAt: data.updatedAt,
      categories: s.categories,
      items: s.items,
    },
  });
  return key;
}

export async function saveNav(kv: KVNamespace, data: NavData): Promise<NavData> {
  const previous = await kv.get(DATA_KEY, 'json');
  if (previous) {
    try {
      await backupNav(kv, parseNavData(previous));
    } catch {
      await backupNav(kv, previous as NavData);
    }
  }
  const next: NavData = {
    ...data,
    v: 1,
    updatedAt: new Date().toISOString(),
  };
  await kv.put(DATA_KEY, JSON.stringify(next));
  return next;
}

export async function listHistory(kv: KVNamespace): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: HISTORY_PREFIX, cursor, limit: 100 });
    for (const k of page.keys) {
      const meta = (k.metadata || {}) as Record<string, unknown>;
      entries.push({
        key: k.name,
        updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : undefined,
        categories: typeof meta.categories === 'number' ? meta.categories : undefined,
        items: typeof meta.items === 'number' ? meta.items : undefined,
      });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  entries.sort((a, b) => b.key.localeCompare(a.key));
  return entries;
}

export async function restoreHistory(kv: KVNamespace, key: string): Promise<NavData> {
  if (!key.startsWith(HISTORY_PREFIX)) {
    throw new Error('Invalid history key');
  }
  const raw = await kv.get(key, 'json');
  if (!raw) throw new Error('History not found');
  const snapshot = parseNavData(raw);
  return saveNav(kv, snapshot);
}

export function sortNav(nav: NavData): NavData {
  const categories = [...nav.categories]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      ...c,
      items: [...c.items].sort((a, b) => a.order - b.order),
    }));
  return { ...nav, categories };
}

export function publicNav(nav: NavData): NavData {
  const sorted = sortNav(nav);
  return {
    ...sorted,
    categories: sorted.categories
      .filter((c) => c.visible)
      .map((c) => ({
        ...c,
        items: c.items.filter((i) => i.visible),
      }))
      .filter((c) => c.items.length > 0 || true),
  };
}

export function findCategory(nav: NavData, id: string) {
  return nav.categories.find((c) => c.id === id);
}

export function findItem(nav: NavData, id: string) {
  for (const category of nav.categories) {
    const index = category.items.findIndex((i) => i.id === id);
    if (index >= 0) return { category, item: category.items[index], index };
  }
  return null;
}

export function reindex(list: { order: number }[]) {
  list.forEach((entry, i) => {
    entry.order = i;
  });
}
