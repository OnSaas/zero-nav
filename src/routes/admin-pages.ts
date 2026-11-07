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
import { findItem, getNavData, listHistory, restoreHistory, saveNav, sortNav } from '../lib/store';
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
      <input type="search" id="item-search" class="search-input" placeholder="搜索标题 / URL / 描述">
      <a class="btn" href="/admin/items/new">新建链接</a>
      <button type="button" id="bulk-del" class="danger">删除所选</button>
    </div>
    <div id="workspace">
      <div class="card"><ul class="item-list" id="item-box"></ul></div>
    </div>`;
  return c.html(adminLayout({ title: '工作台', csrf, active: 'dash', nav, body }));
});

adminPages.get('/admin/categories', (c) => c.redirect('/admin'));

adminPages.get('/admin/items', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const csrf = c.get('csrf');
  const q = (c.req.query('q') || '').toLowerCase();
  const rows = sortNav(nav)
    .items.filter((it) => {
      if (q && ![it.title, it.url, it.description].join(' ').toLowerCase().includes(q)) return false;
      return true;
    })
    .map(
      (it) => `<tr>
        <td>${escapeHtml(it.title)}</td>
        <td><a href="${escapeAttr(it.url)}" target="_blank" rel="noopener">${escapeHtml(it.url)}</a></td>
        <td>${it.visible ? '显示' : '隐藏'}</td>
        <td><a class="btn ghost icon-btn" href="/admin/items/${encodeURIComponent(it.id)}" title="编辑" aria-label="编辑"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></a></td>
      </tr>`,
    )
    .join('');
  const body = `<form class="toolbar" method="get" action="/admin/items">
      <input type="search" name="q" value="${escapeAttr(c.req.query('q') || '')}" placeholder="搜索" class="search-input sm">
      <button type="submit" class="secondary">筛选</button>
      <a class="btn" href="/admin/items/new">新建</a>
    </form>
    <div class="card"><div class="table-scroll"><table><thead><tr><th>标题</th><th>URL</th><th>状态</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">没有匹配的链接</td></tr>'}</tbody></table></div></div>`;
  return c.html(adminLayout({ title: '链接', csrf, active: 'items', nav, body }));
});

adminPages.get('/admin/items/new', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const body = itemForm({ csrf: c.get('csrf') });
  return c.html(adminLayout({ title: '新建链接', csrf: c.get('csrf'), active: 'items', nav, body }));
});

adminPages.get('/admin/items/:id', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const found = findItem(nav, c.req.param('id'));
  if (!found) return c.text('Not found', 404);
  const body = itemForm({ csrf: c.get('csrf'), item: found.item });
  return c.html(adminLayout({ title: '编辑链接', csrf: c.get('csrf'), active: 'items', nav, body }));
});

adminPages.post('/admin/items/new', async (c) => {
  const body = await c.req.parseBody();
  if (!(await csrfFromForm(c, body))) return c.text('CSRF', 403);
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const url = String(body.url || '').trim();
  if (!isHttpUrl(url)) return c.text('URL 必须是 http(s)', 400);
  nav.items.push({
    id: newId(),
    title: String(body.title || '').trim() || url,
    url,
    description: String(body.description || ''),
    icon: parseIcon({ type: String(body.iconType || 'favicon'), value: String(body.iconValue || '') }, url),
    order: nav.items.length,
    visible: body.visible === 'on',
  });
  await saveNav(c.env.BOOKMARKS_KV, nav);
  return c.redirect('/admin');
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
  await saveNav(c.env.BOOKMARKS_KV, nav);
  return c.redirect('/admin');
});

adminPages.get('/admin/settings', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const s = nav.site;
  const csrf = c.get('csrf');
  const importForms = ['json', 'yaml', 'netscape'].map((format, i) => {
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
  }).join('');
  const body = `<form class="card" method="post" action="/admin/settings">
    <input type="hidden" name="csrf" value="${escapeAttr(csrf)}">
    <div class="field"><label>站点标题</label><input name="title" value="${escapeAttr(s.title)}"></div>
    <div class="field"><label>页头文案</label><input name="headerText" value="${escapeAttr(s.headerText)}"></div>
    <div class="field"><label>页脚</label><input name="footerText" value="${escapeAttr(s.footerText)}"></div>
    <div class="field"><label>主题色</label><input type="color" name="themeColor" value="${escapeAttr(s.themeColor)}"></div>
    <div class="field"><label><input type="checkbox" name="showDescription" ${s.showDescription ? 'checked' : ''}> 显示描述</label></div>
    <button type="submit">保存设置</button>
  </form>
  <div class="card" id="export" style="margin-top:14px">
    <h2 class="section-title">导出</h2>
    <p>导出当前完整数据（含隐藏项）。</p>
    <div class="toolbar">
      <a class="btn" href="/api/admin/export?format=json">导出 JSON</a>
      <a class="btn secondary" href="/api/admin/export?format=yaml">导出 YAML</a>
      <a class="btn ghost" href="/api/admin/export?format=legacy-yaml">导出旧版 config.yml</a>
    </div>
  </div>
  <div class="card" id="import" style="margin-top:14px">
    <h2 class="section-title">导入</h2>
    <p>导入会先预览解析结果，确认后再写入。三种格式分开展示。</p>
    ${importForms}
  </div>`;
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
  };
  await saveNav(c.env.BOOKMARKS_KV, nav);
  return c.redirect('/admin/settings');
});

adminPages.get('/admin/import', (c) => c.redirect('/admin/settings#import'));

adminPages.post('/admin/import', async (c) => {
  const body = await c.req.parseBody();
  if (!(await csrfFromForm(c, body))) return c.text('CSRF', 403);
  const formatRaw = String(body.format || 'json');
  const format = formatRaw === 'yaml' || formatRaw === 'netscape' ? formatRaw : 'json';
  try {
    const incoming = payloadToNav(format, String(body.payload || ''));
    const current = await getNavData(c.env.BOOKMARKS_KV);
    const merged = body.replace === 'on' ? { ...incoming, rev: current.rev } : mergeNav(current, incoming);
    await saveNav(c.env.BOOKMARKS_KV, merged);
    return c.redirect('/admin');
  } catch (e) {
    const nav = await getNavData(c.env.BOOKMARKS_KV);
    return c.html(adminLayout({
      title: '导入',
      csrf: c.get('csrf'),
      active: 'settings',
      nav,
      body: `<div class="msg err">${escapeHtml(e instanceof Error ? e.message : '导入失败')}</div><p><a href="/admin/settings#import">返回</a></p>`,
    }), 400);
  }
});

adminPages.get('/admin/export', (c) => c.redirect('/admin/settings#export'));

adminPages.get('/admin/history', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const items = await listHistory(c.env.BOOKMARKS_KV);
  const csrf = c.get('csrf');
  const now = statsOf(nav);
  const rows = items
    .map((h) => {
      const itemDiff = typeof h.items === 'number' ? h.items - now.items : null;
      const diff = itemDiff !== null ? `链接 ${itemDiff >= 0 ? '+' : ''}${itemDiff}` : '';
      return `<tr>
        <td>${escapeHtml(h.updatedAt || h.key.replace('nav:history:', ''))}</td>
        <td>${h.items ?? '-'}</td>
        <td>${escapeHtml(diff || '—')}</td>
        <td>
          <form method="post" action="/admin/history/restore" data-confirm="确认回滚到该版本？当前数据会先备份。">
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
    <div class="table-scroll"><table><thead><tr><th>时间</th><th>当时链接</th><th>相对现在</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">还没有历史</td></tr>'}</tbody></table></div>
  </div>`;
  return c.html(adminLayout({ title: '历史', csrf, active: 'history', nav, body }));
});

adminPages.post('/admin/history/restore', async (c) => {
  const body = await c.req.parseBody();
  if (!(await csrfFromForm(c, body))) return c.text('CSRF', 403);
  await restoreHistory(c.env.BOOKMARKS_KV, String(body.key || ''));
  return c.redirect('/admin/history');
});
