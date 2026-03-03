import type { SiteData } from './types';
import { DEFAULT_SITE_DATA, normalizeSiteData } from './types';

const KV_KEY = 'site:bookmarks';

export async function getSiteData(kv: KVNamespace): Promise<SiteData> {
  try {
    const data = await kv.get(KV_KEY, 'json');
    if (data) {
      return normalizeSiteData(data as SiteData);
    }
  } catch (error) {
    console.error('Failed to get site data from KV:', error);
  }
  return normalizeSiteData(DEFAULT_SITE_DATA);
}

export async function saveSiteData(kv: KVNamespace, data: SiteData): Promise<void> {
  // Backup before save
  await backupSiteData(kv, data);

  // Update version and timestamp
  const updatedData: SiteData = {
    ...normalizeSiteData(data),
    version: data.version + 1,
    updatedAt: new Date().toISOString(),
  };

  await kv.put(KV_KEY, JSON.stringify(updatedData));
}

export async function backupSiteData(kv: KVNamespace, data: SiteData): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupKey = `${KV_KEY}:history:${timestamp}`;
  await kv.put(backupKey, JSON.stringify(data), {
    expirationTtl: 60 * 60 * 24 * 30, // 30 days
  });
}

export function nextVersion(currentVersion: number): number {
  return currentVersion + 1;
}
