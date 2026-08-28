import { Hono } from 'hono';
import type { Bindings, Item, NavData, Variables } from '../types';
import { newId } from '../types';
import {
  assertNotLocked,
  clearLoginFail,
  clientIp,
  createSession,
  csrfOk,
  destroySession,
  headerTokenOk,
  recordLoginFail,
  requireAdmin,
  tokensEqual,
} from '../lib/auth';
import { fetchMeta } from '../lib/fetch-meta';
import { exportLegacyYaml, exportYaml, mergeNav, payloadToNav, previewImport } from '../lib/import-export';
import { findCategory, findItem, getNavData, listHistory, reindex, restoreHistory, saveNav, sortNav } from '../lib/store';
import { ValidateError, findDuplicates, parseIcon, parseItem, parseNavData, parseSite } from '../lib/validate';
import { isHttpUrl, slugify } from '../lib/sanitize';

export const adminApi = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function writePayload(nav: NavData, extra: Record<string, unknown> = {}) {
  return { success: true, v: nav.v, updatedAt: nav.updatedAt, data: sortNav(nav), ...extra };
}

adminApi.use('/api/admin/*', async (c, next) => {
  if (c.req.path === '/api/admin/login') return next();
  if (!(await requireAdmin(c))) return c.json({ error: 'Unauthorized' }, 401);
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return next();
  if (c.req.path === '/api/admin/logout') return next();
  if (csrfOk(c) || (await headerTokenOk(c))) return next();
  return c.json({ error: 'CSRF token missing or invalid' }, 403);
});

adminApi.post('/api/admin/login', async (c) => {
  const ip = clientIp(c);
  try {
    await assertNotLocked(c.env.BOOKMARKS_KV, ip);
  } catch (e) {
    const retry = (e as Error & { retryAfter?: number }).retryAfter || 900;
    return c.json({ error: 'Too many login attempts', retryAfter: retry }, 429);
  }
  const body = await c.req.json<{ token?: string }>().catch(() => ({ token: '' }));
  const token = body.token || c.req.header('x-admin-token') || '';
  if (!c.env.ADMIN_TOKEN || !(await tokensEqual(token, c.env.ADMIN_TOKEN))) {
    const rec = await recordLoginFail(c.env.BOOKMARKS_KV, ip);
    return c.json({ error: rec.lockedUntil ? 'Locked' : 'Unauthorized' }, rec.lockedUntil ? 429 : 401);
  }
  await clearLoginFail(c.env.BOOKMARKS_KV, ip);
  const session = await createSession(c);
  return c.json({ success: true, csrf: session.csrf });
});

adminApi.post('/api/admin/logout', async (c) => {
  await destroySession(c);
  return c.json({ success: true });
});

adminApi.get('/api/admin/nav', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  return c.json(writePayload(nav));
});

adminApi.post('/api/admin/categories', async (c) => {
  const body = await c.req.json<{ name?: string; icon?: string }>();
  const name = (body.name || '').trim();
  if (!name) return c.json({ error: '分类名称不能为空' }, 400);
  const current = await getNavData(c.env.BOOKMARKS_KV);
  const category = {
    id: newId('cat'),
    name,
    slug: slugify(name),
    icon: body.icon,
    order: current.categories.length,
    visible: true,
    items: [],
  };
  current.categories.push(category);
  const saved = await saveNav(c.env.BOOKMARKS_KV, current);
  return c.json(writePayload(saved, { id: category.id }));
});

adminApi.patch('/api/admin/categories/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<{ name: string; icon: string; visible: boolean; slug: string }>>();
  const current = await getNavData(c.env.BOOKMARKS_KV);
  const cat = findCategory(current, id);
  if (!cat) return c.json({ error: '分类不存在' }, 404);
  if (typeof body.name === 'string') {
    if (!body.name.trim()) return c.json({ error: '分类名称不能为空' }, 400);
    cat.name = body.name.trim();
  }
  if (typeof body.icon === 'string') cat.icon = body.icon;
  if (typeof body.visible === 'boolean') cat.visible = body.visible;
  if (typeof body.slug === 'string') cat.slug = body.slug;
  const saved = await saveNav(c.env.BOOKMARKS_KV, current);
  return c.json(writePayload(saved));
});

adminApi.post('/api/admin/categories/:id/delete', async (c) => {
  const id = c.req.param('id');
  const current = await getNavData(c.env.BOOKMARKS_KV);
  if (!findCategory(current, id)) return c.json({ error: '分类不存在' }, 404);
  current.categories = current.categories.filter((x) => x.id !== id);
  reindex(current.categories);
  const saved = await saveNav(c.env.BOOKMARKS_KV, current);
  return c.json(writePayload(saved));
});

adminApi.post('/api/admin/categories/reorder', async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  if (!Array.isArray(ids)) return c.json({ error: 'ids 必须是数组' }, 400);
  const current = await getNavData(c.env.BOOKMARKS_KV);
  const map = new Map(current.categories.map((c) => [c.id, c]));
  const next = ids.map((id) => map.get(id)).filter(Boolean) as typeof current.categories;
  for (const cat of current.categories) if (!ids.includes(cat.id)) next.push(cat);
  reindex(next);
  current.categories = next;
  const saved = await saveNav(c.env.BOOKMARKS_KV, current);
  return c.json(writePayload(saved));
});

adminApi.post('/api/admin/items', async (c) => {
  try {
    const body = await c.req.json<Record<string, unknown>>();
    const current = await getNavData(c.env.BOOKMARKS_KV);
    const categoryId = String(body.categoryId || '');
    const cat = findCategory(current, categoryId);
    if (!cat) return c.json({ error: '分类不存在' }, 400);
    const item = parseItem({ ...body, order: cat.items.length }, cat.items.length);
    const duplicates = findDuplicates(current, item.url);
    cat.items.push(item);
    const saved = await saveNav(c.env.BOOKMARKS_KV, current);
    return c.json(writePayload(saved, { id: item.id, duplicates: duplicates.map((d) => d.id) }));
  } catch (e) {
    const msg = e instanceof ValidateError ? e.message : '无法创建链接';
    return c.json({ error: msg }, 400);
  }
});

adminApi.patch('/api/admin/items/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<Record<string, unknown>>();
    const current = await getNavData(c.env.BOOKMARKS_KV);
    const found = findItem(current, id);
    if (!found) return c.json({ error: '链接不存在' }, 404);
    const item = found.item;
    if (typeof body.title === 'string') item.title = body.title.trim();
    if (typeof body.url === 'string') {
      if (!isHttpUrl(body.url)) return c.json({ error: 'URL 必须是 http(s)' }, 400);
      item.url = body.url.trim();
    }
    if (typeof body.description === 'string') item.description = body.description;
    if (typeof body.visible === 'boolean') item.visible = body.visible;
    if (body.icon) item.icon = parseIcon(body.icon, item.url);
    if (typeof body.categoryId === 'string' && body.categoryId !== found.category.id) {
      const dest = findCategory(current, body.categoryId);
      if (!dest) return c.json({ error: '目标分类不存在' }, 400);
      found.category.items.splice(found.index, 1);
      reindex(found.category.items);
      item.order = dest.items.length;
      dest.items.push(item);
    }
    if (!item.title) return c.json({ error: '标题不能为空' }, 400);
    const duplicates = findDuplicates(current, item.url, item.id);
    const saved = await saveNav(c.env.BOOKMARKS_KV, current);
    return c.json(writePayload(saved, { duplicates: duplicates.map((d) => ({ id: d.id, title: d.title })) }));
  } catch (e) {
    const msg = e instanceof ValidateError ? e.message : '无法更新链接';
    return c.json({ error: msg }, 400);
  }
});

adminApi.post('/api/admin/items/:id/delete', async (c) => {
  const id = c.req.param('id');
  const current = await getNavData(c.env.BOOKMARKS_KV);
  const found = findItem(current, id);
  if (!found) return c.json({ error: '链接不存在' }, 404);
  found.category.items.splice(found.index, 1);
  reindex(found.category.items);
  const saved = await saveNav(c.env.BOOKMARKS_KV, current);
  return c.json(writePayload(saved));
});

adminApi.post('/api/admin/items/reorder', async (c) => {
  const { categoryId, ids } = await c.req.json<{ categoryId: string; ids: string[] }>();
  const current = await getNavData(c.env.BOOKMARKS_KV);
  const cat = findCategory(current, categoryId);
  if (!cat) return c.json({ error: '分类不存在' }, 404);
  const map = new Map(cat.items.map((i) => [i.id, i]));
  const next = (ids || []).map((id) => map.get(id)).filter(Boolean) as Item[];
  for (const it of cat.items) if (!ids.includes(it.id)) next.push(it);
  reindex(next);
  cat.items = next;
  const saved = await saveNav(c.env.BOOKMARKS_KV, current);
  return c.json(writePayload(saved));
});

adminApi.post('/api/admin/items/move', async (c) => {
  const { ids, toCategoryId } = await c.req.json<{ ids: string[]; toCategoryId: string }>();
  const current = await getNavData(c.env.BOOKMARKS_KV);
  const dest = findCategory(current, toCategoryId);
  if (!dest) return c.json({ error: '目标分类不存在' }, 400);
  for (const id of ids || []) {
    const found = findItem(current, id);
    if (!found) continue;
    if (found.category.id === dest.id) continue;
    found.category.items.splice(found.index, 1);
    reindex(found.category.items);
    found.item.order = dest.items.length;
    dest.items.push(found.item);
  }
  const saved = await saveNav(c.env.BOOKMARKS_KV, current);
  return c.json(writePayload(saved));
});

adminApi.post('/api/admin/items/bulk-delete', async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  const set = new Set(ids || []);
  const current = await getNavData(c.env.BOOKMARKS_KV);
  for (const cat of current.categories) {
    cat.items = cat.items.filter((i) => !set.has(i.id));
    reindex(cat.items);
  }
  const saved = await saveNav(c.env.BOOKMARKS_KV, current);
  return c.json(writePayload(saved));
});

adminApi.post('/api/admin/settings', async (c) => {
  try {
    const body = await c.req.json<{ site?: unknown }>();
    const current = await getNavData(c.env.BOOKMARKS_KV);
    current.site = parseSite({ ...current.site, ...(body.site || {}) });
    const saved = await saveNav(c.env.BOOKMARKS_KV, current);
    return c.json(writePayload(saved));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '设置无效' }, 400);
  }
});

adminApi.post('/api/admin/import', async (c) => {
  try {
    const body = await c.req.json<{
      format?: string;
      replace?: boolean;
      payload?: string;
      preview?: boolean;
    }>();
    const format = body.format === 'yaml' || body.format === 'netscape' ? body.format : 'json';
    const payload = body.payload || '';
    if (!payload.trim()) return c.json({ error: '缺少 payload' }, 400);
    const incoming = payloadToNav(format, payload);
    const current = await getNavData(c.env.BOOKMARKS_KV);
    const preview = previewImport(current, incoming, !!body.replace);
    preview.format = format;
    if (body.preview) return c.json(preview);
    const merged = body.replace
      ? { ...parseNavData(incoming), site: incoming.site || current.site }
      : mergeNav(current, incoming);
    const saved = await saveNav(c.env.BOOKMARKS_KV, merged);
    return c.json(writePayload(saved, preview));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '导入失败' }, 400);
  }
});

adminApi.get('/api/admin/export', async (c) => {
  const format = c.req.query('format') || 'json';
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  if (format === 'yaml') {
    return c.body(exportYaml(nav), 200, {
      'content-type': 'text/yaml; charset=utf-8',
      'content-disposition': 'attachment; filename="nav.yaml"',
    });
  }
  if (format === 'legacy-yaml') {
    return c.body(exportLegacyYaml(nav), 200, {
      'content-type': 'text/yaml; charset=utf-8',
      'content-disposition': 'attachment; filename="config.yml"',
    });
  }
  return c.body(JSON.stringify(nav, null, 2), 200, {
    'content-type': 'application/json; charset=utf-8',
    'content-disposition': 'attachment; filename="nav.json"',
  });
});

adminApi.get('/api/admin/history', async (c) => {
  const items = await listHistory(c.env.BOOKMARKS_KV);
  return c.json({ items });
});

adminApi.post('/api/admin/history/restore', async (c) => {
  const { key } = await c.req.json<{ key?: string }>();
  if (!key) return c.json({ error: '缺少 key' }, 400);
  try {
    const saved = await restoreHistory(c.env.BOOKMARKS_KV, key);
    return c.json(writePayload(saved));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '回滚失败' }, 400);
  }
});

adminApi.get('/api/admin/fetch-meta', async (c) => {
  const url = c.req.query('url') || '';
  try {
    const meta = await fetchMeta(url);
    return c.json(meta);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '抓取失败' }, 400);
  }
});
