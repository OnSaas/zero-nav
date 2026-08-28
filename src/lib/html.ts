import type { Category, Item, ItemIcon, NavData } from '../types';
import { statsOf } from '../types';
import { escapeAttr, escapeHtml, sanitizeSvg } from './sanitize';
import { publicNav, sortNav } from './store';
import siteCss from '../ui/site.css';
import adminCss from '../ui/admin.css';
import adminJs from '../ui/admin.client.js';

const DEFAULT_ICON = `<svg class="icon" viewBox="0 0 1024 1024" width="24" height="24"><path d="M904 120H120c-30.9 0-56 25.1-56 56v560c0 30.9 25.1 56 56 56h280v56h-84c-15.5 0-28 12.5-28 28s12.5 28 28 28h392c15.5 0 28-12.5 28-28s-12.5-28-28-28h-84v-56h280c30.9 0 56-25.1 56-56V176c0-30.9-25.1-56-56-56zM568 848H456v-56h112v56z m336-112H120v-56h784v56zM120 624V176h784v448H120z" fill="currentColor"></path></svg>`;

export function renderIcon(icon: ItemIcon | undefined, className = 'site-icon'): string {
  if (!icon || !icon.value) return DEFAULT_ICON;
  if (icon.type === 'svg') {
    return sanitizeSvg(icon.value) || DEFAULT_ICON;
  }
  return `<img class="${className}" src="${escapeAttr(icon.value)}" alt="" width="24" height="24">`;
}

export function renderCategoryIcon(icon: string | undefined): string {
  if (!icon) return '';
  const svg = sanitizeSvg(icon);
  if (svg) return `<span class="category-icon">${svg}</span>`;
  if (/^https?:\/\//i.test(icon)) {
    return `<span class="category-icon"><img class="site-icon" src="${escapeAttr(icon)}" alt=""></span>`;
  }
  return '';
}

export function renderPublicPage(nav: NavData): string {
  const data = publicNav(nav);
  const title = escapeHtml(data.site.title || data.site.headerText);
  const header = escapeHtml(data.site.headerText);
  const footer = escapeHtml(data.site.footerText);
  const theme = escapeAttr(data.site.themeColor || '#774cb2');

  const blocks = data.categories
    .map((cat) => {
      const items = cat.items
        .map((item) => {
          const desc = data.site.showDescription && item.description
            ? `<span class="site-description">${escapeHtml(item.description)}</span>`
            : '';
          return `<li><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${renderIcon(item.icon)}<span class="site-name">${escapeHtml(item.title)}</span>${desc}</a></li>`;
        })
        .join('');
      const heading = data.site.showCategoryTitle
        ? `<h2 class="category-title">${renderCategoryIcon(cat.icon)}${escapeHtml(cat.name)}</h2>`
        : '';
      return `<div class="category-block">${heading}<ul class="category-list">${items}</ul></div>`;
    })
    .join('');

  const body = blocks || '<div class="empty">empty</div>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>:root{--color-text-hover:${theme}}</style>
  <style>${siteCss}</style>
</head>
<body>
  <main>
    <h1><a href="#">${header}</a></h1>
    <div id="content">${body}</div>
  </main>
  <footer><div>${footer}</div></footer>
</body>
</html>`;
}

type NavKey = 'dash' | 'categories' | 'items' | 'settings' | 'import' | 'export' | 'history';

export function adminLayout(opts: {
  title: string;
  csrf: string;
  active: NavKey;
  nav?: NavData;
  body: string;
}): string {
  const s = opts.nav ? statsOf(opts.nav) : null;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf" content="${escapeAttr(opts.csrf)}">
  <title>${escapeHtml(opts.title)}</title>
  <style>${adminCss}</style>
</head>
<body class="admin" data-csrf="${escapeAttr(opts.csrf)}">
  <header class="topbar">
    <div class="brand">zero-nav 后台</div>
    <nav>
      <a href="/admin" class="${opts.active === 'dash' ? 'active' : ''}">工作台</a>
      <a href="/admin/categories" class="${opts.active === 'categories' ? 'active' : ''}">分类</a>
      <a href="/admin/items" class="${opts.active === 'items' ? 'active' : ''}">链接</a>
      <a href="/admin/settings" class="${opts.active === 'settings' ? 'active' : ''}">设置</a>
      <a href="/admin/import" class="${opts.active === 'import' ? 'active' : ''}">导入</a>
      <a href="/admin/export" class="${opts.active === 'export' ? 'active' : ''}">导出</a>
      <a href="/admin/history" class="${opts.active === 'history' ? 'active' : ''}">历史</a>
      <a href="/" target="_blank" rel="noopener">预览前台</a>
    </nav>
    <form method="post" action="/admin/logout" style="margin:0">
      <input type="hidden" name="csrf" value="${escapeAttr(opts.csrf)}">
      <button class="ghost" type="submit">退出</button>
    </form>
  </header>
  <div class="wrap">
    ${s ? `<div class="cards">
      <div class="card"><div class="n">${s.categories}</div><div class="l">分类</div></div>
      <div class="card"><div class="n">${s.items}</div><div class="l">链接</div></div>
      <div class="card"><div class="n">${s.hiddenCategories + s.hiddenItems}</div><div class="l">隐藏条数</div></div>
      <div class="card"><div class="n" style="font-size:14px;line-height:1.4">${escapeHtml(opts.nav?.updatedAt || '')}</div><div class="l">上次更新</div></div>
    </div>` : ''}
    ${opts.body}
  </div>
  ${opts.nav ? `<script type="application/json" id="nav-data">${JSON.stringify(sortNav(opts.nav)).replace(/</g, '\\u003c')}</script>` : ''}
  <script>${adminJs}</script>
</body>
</html>`;
}

export function loginPage(error = ''): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登录 · zero-nav</title>
  <style>${adminCss}</style>
</head>
<body class="admin login">
  <div class="box card">
    <h1 style="margin-top:0">管理登录</h1>
    <p class="muted">输入 ADMIN_TOKEN</p>
    ${error ? `<div class="msg err">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/admin/login">
      <div class="field"><label>令牌</label><input type="password" name="token" required autofocus></div>
      <button type="submit">登录</button>
    </form>
    <p class="muted" style="margin-top:16px"><a href="/">← 返回前台</a></p>
  </div>
</body>
</html>`;
}

export function itemForm(opts: {
  csrf: string;
  categories: Category[];
  item?: Item;
  categoryId?: string;
}): string {
  const it = opts.item;
  const action = it ? `/admin/items/${encodeURIComponent(it.id)}` : '/admin/items/new';
  const catOpts = opts.categories
    .map((c) => `<option value="${escapeAttr(c.id)}" ${c.id === opts.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
    .join('');
  return `<form class="card" method="post" action="${action}" id="item-form">
    <input type="hidden" name="csrf" value="${escapeAttr(opts.csrf)}">
    <div class="row">
      <div class="field"><label>URL</label><input type="url" name="url" id="item-url" value="${escapeAttr(it?.url || '')}" required placeholder="https://"></div>
      <div class="field" style="flex:0 0 auto;align-self:end"><button type="button" class="secondary" id="fetch-meta">抓取信息</button></div>
    </div>
    <div class="field"><label>标题</label><input type="text" name="title" id="item-title" value="${escapeAttr(it?.title || '')}" required></div>
    <div class="field"><label>描述</label><input type="text" name="description" value="${escapeAttr(it?.description || '')}"></div>
    <div class="row">
      <div class="field"><label>分类</label><select name="categoryId">${catOpts}</select></div>
      <div class="field"><label>图标类型</label>
        <select name="iconType" id="icon-type">
          <option value="favicon" ${!it || it.icon.type === 'favicon' ? 'selected' : ''}>自动 favicon</option>
          <option value="url" ${it?.icon.type === 'url' ? 'selected' : ''}>图片 URL</option>
          <option value="svg" ${it?.icon.type === 'svg' ? 'selected' : ''}>内联 SVG</option>
        </select>
      </div>
    </div>
    <div class="field"><label>图标值</label><textarea name="iconValue" id="icon-value">${escapeHtml(it?.icon.value || '')}</textarea></div>
    <div class="field"><label><input type="checkbox" name="visible" ${it?.visible !== false ? 'checked' : ''}> 前台显示</label></div>
    <button type="submit">保存</button>
    <a class="btn secondary" href="/admin">取消</a>
  </form>`;
}
