import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import {
  assertNotLocked,
  clearLoginFail,
  clientIp,
  createSession,
  csrfFromForm,
  destroySession,
  readSession,
  recordLoginFail,
  tokensEqual,
} from '../lib/auth';
import { adminLayout, itemForm, loginPage } from '../lib/html';
import { findItem, getNavData, listHistory, restoreHistory, saveNav } from '../lib/store';
import { parseIcon } from '../lib/validate';
import { isHttpUrl, escapeAttr, escapeHtml } from '../lib/sanitize';
import { mergeNav, payloadToNav } from '../lib/import-export';
import { LOGIN_MAX_FAILS, newId, statsOf } from '../types';

export const adminPages = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function guard(c: Parameters<typeof readSession>[0], next: () => Promise<void>) {
  if (c.req.path === '/admin/login') return next();
  const session = await readSession(c);
  if (!session) return c.redirect('/admin/login');
  c.set('sessionId', session.sid);
  c.set('csrf', session.record.csrf);
  c.set('authMode', 'cookie');
  return next();
}

adminPages.use('/admin/*', (c, next) => guard(c, next));
adminPages.use('/admin', (c, next) => guard(c, next));

adminPages.get('/admin/login', async (c) => {
  if (await readSession(c)) return c.redirect('/admin');
  return c.html(loginPage());
});

adminPages.post('/admin/login', async (c) => {
  const ip = clientIp(c);
  try {
    await assertNotLocked(c.env.BOOKMARKS_KV, ip);
  } catch (e) {
    const retry = (e as Error & { retryAfter?: number }).retryAfter || 900;
    return c.html(loginPage(`尝试过多，请 ${retry} 秒后再试`), 429);
  }
  const body = await c.req.parseBody();
  const token = String(body.token || '');
  if (!c.env.ADMIN_TOKEN || !(await tokensEqual(token, c.env.ADMIN_TOKEN))) {
    const rec = await recordLoginFail(c.env.BOOKMARKS_KV, ip);
    const left = Math.max(0, LOGIN_MAX_FAILS - rec.count);
    return c.html(loginPage(rec.lockedUntil ? '已锁定 15 分钟' : `令牌错误，还剩 ${left} 次`), 401);
  }
  await clearLoginFail(c.env.BOOKMARKS_KV, ip);
  await createSession(c);
  return c.redirect('/admin');
});

adminPages.post('/admin/logout', async (c) => {
  await destroySession(c);
  return c.redirect('/admin/login');
});

adminPages.get('/admin', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const csrf = c.get('csrf');
  const body = `
    <div class="toolbar">
      <input type="search" id="item-search" placeholder="搜索标题 / URL / 描述" style="max-width:280px">
      <a class="btn" href="/admin/items/new">新建链接</a>
      <button type="button" id="add-cat" class="secondary">新建分类</button>
      <button type="button" id="rename-cat" class="ghost">重命名分类</button>
      <button type="button" id="del-cat" class="danger">删除分类</button>
      <button type="button" id="bulk-move" class="secondary">移动所选</button>
      <button type="button" id="bulk-del" class="danger">删除所选</button>
    </div>
    <div class="mobile-only field"><label>分类</label><select id="mobile-cat"></select></div>
    <div class="layout" id="workspace">
      <div class="card cats desktop-only"><ul class="cat-list" id="cat-box"></ul></div>
      <div class="card"><ul class="item-list" id="item-box"></ul></div>
    </div>`;
  return c.html(adminLayout({ title: '工作台', csrf, active: 'dash', nav, body }));
});

adminPages.get('/admin/categories', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const csrf = c.get('csrf');
  const rows = nav.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(
      (cat) => `<tr>
        <td>${escapeHtml(cat.name)}</td>
        <td>${cat.items.length}</td>
        <td>${cat.visible ? '显示' : '隐藏'}</td>
        <td><a href="/admin?cat=${encodeURIComponent(cat.id)}">管理链接</a></td>
      </tr>`,
    )
    .join('');
  const body = `<div class="card"><p class="muted">拖拽排序请到工作台。这里是分类总览。</p>
    <table><thead><tr><th>分类</th><th>链接</th><th>状态</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4">暂无分类</td></tr>'}</tbody></table></div>`;
  return c.html(adminLayout({ title: '分类', csrf, active: 'categories', nav, body }));
});

adminPages.get('/admin/items', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const csrf = c.get('csrf');
  const filter = c.req.query('category') || '';
  const q = (c.req.query('q') || '').toLowerCase();
  const rows = nav.categories
    .flatMap((cat) => cat.items.map((it) => ({ cat, it })))
    .filter(({ cat, it }) => {
      if (filter && cat.id !== filter) return false;
      if (q && ![it.title, it.url, it.description].join(' ').toLowerCase().includes(q)) return false;
      return true;
    })
    .map(
      ({ cat, it }) => `<tr>
        <td>${escapeHtml(it.title)}</td>
        <td><a href="${escapeAttr(it.url)}" target="_blank" rel="noopener">${escapeHtml(it.url)}</a></td>
        <td>${escapeHtml(cat.name)}</td>
        <td>${it.visible ? '显示' : '隐藏'}</td>
        <td><a href="/admin/items/${encodeURIComponent(it.id)}">编辑</a></td>
      </tr>`,
    )
    .join('');
  const opts = nav.categories.map((c) => `<option value="${escapeAttr(c.id)}" ${c.id === filter ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  const body = `<form class="toolbar" method="get" action="/admin/items">
      <select name="category" style="max-width:200px"><option value="">全部分类</option>${opts}</select>
      <input type="search" name="q" value="${escapeAttr(c.req.query('q') || '')}" placeholder="搜索" style="max-width:240px">
      <button type="submit" class="secondary">筛选</button>
      <a class="btn" href="/admin/items/new">新建</a>
    </form>
    <div class="card"><table><thead><tr><th>标题</th><th>URL</th><th>分类</th><th>状态</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">没有匹配的链接</td></tr>'}</tbody></table></div>`;
  return c.html(adminLayout({ title: '链接', csrf, active: 'items', nav, body }));
});

adminPages.get('/admin/items/new', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  if (!nav.categories.length) {
    return c.html(adminLayout({
      title: '新建链接',
      csrf: c.get('csrf'),
      active: 'items',
      nav,
      body: '<div class="msg warn">请先在工作台新建一个分类。</div>',
    }));
  }
  const body = itemForm({ csrf: c.get('csrf'), categories: nav.categories, categoryId: c.req.query('category') || nav.categories[0].id });
  return c.html(adminLayout({ title: '新建链接', csrf: c.get('csrf'), active: 'items', nav, body }));
});

adminPages.get('/admin/items/:id', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const found = findItem(nav, c.req.param('id'));
  if (!found) return c.text('Not found', 404);
  const body = itemForm({ csrf: c.get('csrf'), categories: nav.categories, item: found.item, categoryId: found.category.id });
  return c.html(adminLayout({ title: '编辑链接', csrf: c.get('csrf'), active: 'items', nav, body }));
});

adminPages.post('/admin/items/new', async (c) => {
  const body = await c.req.parseBody();
  if (!(await csrfFromForm(c, body))) return c.text('CSRF', 403);
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const cat = nav.categories.find((x) => x.id === String(body.categoryId));
  if (!cat) return c.text('分类不存在', 400);
  const url = String(body.url || '').trim();
  if (!isHttpUrl(url)) return c.text('URL 必须是 http(s)', 400);
  cat.items.push({
    id: newId('item'),
    title: String(body.title || '').trim() || url,
    url,
    description: String(body.description || ''),
    icon: parseIcon({ type: String(body.iconType || 'favicon'), value: String(body.iconValue || '') }, url),
    order: cat.items.length,
    visible: body.visible === 'on',
  });
  await saveNav(c.env.BOOKMARKS_KV, nav);
  return c.redirect('/admin?cat=' + encodeURIComponent(cat.id));
});

adminPages.post('/admin/items/:id', async (c) => {
  const body = await c.req.parseBody();
  if (!(await csrfFromForm(c, body))) return c.text('CSRF', 403);
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const found = findItem(nav, c.req.param('id'));
  if (!found) return c.text('Not found', 404);
  const url = String(body.url || '').trim();
  if (!isHttpUrl(url)) return c.text('URL 必须是 http(s)', 400);
  found.item.title = String(body.title || '').trim() || url;
  found.item.url = url;
  found.item.description = String(body.description || '');
  found.item.visible = body.visible === 'on';
  found.item.icon = parseIcon({ type: String(body.iconType || 'favicon'), value: String(body.iconValue || '') }, url);
  const destId = String(body.categoryId || found.category.id);
  if (destId !== found.category.id) {
    const dest = nav.categories.find((x) => x.id === destId);
    if (dest) {
      found.category.items.splice(found.index, 1);
      found.item.order = dest.items.length;
      dest.items.push(found.item);
    }
  }
  await saveNav(c.env.BOOKMARKS_KV, nav);
  return c.redirect('/admin?cat=' + encodeURIComponent(destId));
});

adminPages.get('/admin/settings', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const s = nav.site;
  const csrf = c.get('csrf');
  const body = `<form class="card" method="post" action="/admin/settings">
    <input type="hidden" name="csrf" value="${escapeAttr(csrf)}">
    <div class="field"><label>站点标题</label><input name="title" value="${escapeAttr(s.title)}"></div>
    <div class="field"><label>页头文案</label><input name="headerText" value="${escapeAttr(s.headerText)}"></div>
    <div class="field"><label>页脚</label><input name="footerText" value="${escapeAttr(s.footerText)}"></div>
    <div class="field"><label>主题色</label><input type="color" name="themeColor" value="${escapeAttr(s.themeColor)}"></div>
    <div class="field"><label><input type="checkbox" name="showDescription" ${s.showDescription ? 'checked' : ''}> 显示描述</label></div>
    <div class="field"><label><input type="checkbox" name="showCategoryTitle" ${s.showCategoryTitle ? 'checked' : ''}> 显示分类标题</label></div>
    <button type="submit">保存设置</button>
  </form>`;
  return c.html(adminLayout({ title: '设置', csrf, active: 'settings', nav, body }));
});

adminPages.post('/admin/settings', async (c) => {
  const body = await c.req.parseBody();
  if (!(await csrfFromForm(c, body))) return c.text('CSRF', 403);
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  nav.site = {
    title: String(body.title || nav.site.title),
    headerText: String(body.headerText || nav.site.headerText),
    footerText: String(body.footerText || ''),
    themeColor: String(body.themeColor || nav.site.themeColor),
    showDescription: body.showDescription === 'on',
    showCategoryTitle: body.showCategoryTitle === 'on',
  };
  await saveNav(c.env.BOOKMARKS_KV, nav);
  return c.redirect('/admin/settings');
});

adminPages.get('/admin/import', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const csrf = c.get('csrf');
  const body = `<div class="card">
    <p>导入会先预览解析结果，确认后再写入。三种格式分开展示。</p>
    ${['json', 'yaml', 'netscape'].map((format, i) => {
      const label = format === 'json' ? '本系统 JSON / 旧 site:bookmarks' : format === 'yaml' ? 'YAML（含旧 config.yml）' : '浏览器书签 HTML（Netscape）';
      return `<form class="field" style="margin-top:20px">
        <input type="hidden" name="csrf" value="${escapeAttr(csrf)}">
        <input type="hidden" name="format" value="${format}">
        <h3>${i + 1}. ${label}</h3>
        <textarea name="payload" placeholder="粘贴内容"></textarea>
        <label><input type="checkbox" name="replace"> 覆盖全部（否则按 URL 去重合并）</label>
        <div class="toolbar">
          <button type="button" class="secondary" data-preview-import>预览解析</button>
          <button type="submit" formmethod="post" formaction="/admin/import">确认导入</button>
        </div>
        <div class="preview-box muted">预览结果会显示在这里</div>
      </form>`;
    }).join('')}
  </div>`;
  return c.html(adminLayout({ title: '导入', csrf, active: 'import', nav, body }));
});

adminPages.post('/admin/import', async (c) => {
  const body = await c.req.parseBody();
  if (!(await csrfFromForm(c, body))) return c.text('CSRF', 403);
  const formatRaw = String(body.format || 'json');
  const format = formatRaw === 'yaml' || formatRaw === 'netscape' ? formatRaw : 'json';
  try {
    const incoming = payloadToNav(format, String(body.payload || ''));
    const current = await getNavData(c.env.BOOKMARKS_KV);
    const merged = body.replace === 'on' ? incoming : mergeNav(current, incoming);
    await saveNav(c.env.BOOKMARKS_KV, merged);
    return c.redirect('/admin');
  } catch (e) {
    const nav = await getNavData(c.env.BOOKMARKS_KV);
    return c.html(adminLayout({
      title: '导入',
      csrf: c.get('csrf'),
      active: 'import',
      nav,
      body: `<div class="msg err">${escapeHtml(e instanceof Error ? e.message : '导入失败')}</div><p><a href="/admin/import">返回</a></p>`,
    }), 400);
  }
});

adminPages.get('/admin/export', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const csrf = c.get('csrf');
  const body = `<div class="card">
    <p>导出当前完整数据（含隐藏项）。</p>
    <div class="toolbar">
      <a class="btn" href="/api/admin/export?format=json">导出 JSON</a>
      <a class="btn secondary" href="/api/admin/export?format=yaml">导出 YAML</a>
      <a class="btn ghost" href="/api/admin/export?format=legacy-yaml">导出旧版 config.yml</a>
    </div>
  </div>`;
  return c.html(adminLayout({ title: '导出', csrf, active: 'export', nav, body }));
});

adminPages.get('/admin/history', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const items = await listHistory(c.env.BOOKMARKS_KV);
  const csrf = c.get('csrf');
  const now = statsOf(nav);
  const rows = items
    .map((h) => {
      const catDiff = typeof h.categories === 'number' ? h.categories - now.categories : null;
      const itemDiff = typeof h.items === 'number' ? h.items - now.items : null;
      const diff = [
        catDiff !== null ? `分类 ${catDiff >= 0 ? '+' : ''}${catDiff}` : '',
        itemDiff !== null ? `链接 ${itemDiff >= 0 ? '+' : ''}${itemDiff}` : '',
      ].filter(Boolean).join(' / ');
      return `<tr>
        <td>${escapeHtml(h.updatedAt || h.key.replace('nav:history:', ''))}</td>
        <td>${h.categories ?? '-'} / ${h.items ?? '-'}</td>
        <td>${escapeHtml(diff || '—')}</td>
        <td>
          <form method="post" action="/admin/history/restore" onsubmit="return confirm('确认回滚到该版本？当前数据会先备份。')">
            <input type="hidden" name="csrf" value="${escapeAttr(csrf)}">
            <input type="hidden" name="key" value="${escapeAttr(h.key)}">
            <button type="submit" class="secondary">回滚</button>
          </form>
        </td>
      </tr>`;
    })
    .join('');
  const body = `<div class="card">
    <p class="muted">写入前自动备份，保留 30 天。回滚会再写一条「回滚前」历史。</p>
    <table><thead><tr><th>时间</th><th>当时分类 / 链接</th><th>相对现在</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">还没有历史</td></tr>'}</tbody></table>
  </div>`;
  return c.html(adminLayout({ title: '历史', csrf, active: 'history', nav, body }));
});

adminPages.post('/admin/history/restore', async (c) => {
  const body = await c.req.parseBody();
  if (!(await csrfFromForm(c, body))) return c.text('CSRF', 403);
  await restoreHistory(c.env.BOOKMARKS_KV, String(body.key || ''));
  return c.redirect('/admin/history');
});
