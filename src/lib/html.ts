import type { Item, ItemIcon, NavData } from '../types';
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

export function renderPublicPage(nav: NavData): string {
  const data = publicNav(nav);
  const title = escapeHtml(data.site.title || data.site.headerText);
  const header = escapeHtml(data.site.headerText);
  const footer = escapeHtml(data.site.footerText);
  const theme = escapeAttr(data.site.themeColor || '#774cb2');

  const items = data.items
    .map((item) => {
      const desc = data.site.showDescription && item.description
        ? `<span class="site-description">${escapeHtml(item.description)}</span>`
        : '';
      return `<li><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${renderIcon(item.icon)}<span class="site-text"><span class="site-name">${escapeHtml(item.title)}</span>${desc}</span></a></li>`;
    })
    .join('');

  const body = items ? `<ul class="category-list">${items}</ul>` : '<div class="empty">empty</div>';

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

type NavKey = 'dash' | 'items' | 'settings';

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
      <a href="/admin/items" class="${opts.active === 'items' ? 'active' : ''}">链接</a>
      <a href="/admin/settings" class="${opts.active === 'settings' ? 'active' : ''}">设置</a>
    </nav>
    <div class="top-actions">
      <a class="btn ghost" href="/" target="_blank" rel="noopener">前台</a>
      <form method="post" action="/admin/logout" style="margin:0">
        <input type="hidden" name="csrf" value="${escapeAttr(opts.csrf)}">
        <button class="ghost" type="submit">退出</button>
      </form>
    </div>
  </header>
  <div class="wrap">
    ${s ? `<div class="cards">
      <div class="card"><div class="n">${s.items}</div><div class="l">链接</div></div>
      <div class="card"><div class="n">${s.hiddenItems}</div><div class="l">隐藏条数</div></div>
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

const SELECT_CHEVRON = '<svg class="ui-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

export function uiSelect(opts: {
  name: string;
  value?: string;
  options: { value: string; label: string }[];
  id?: string;
  className?: string;
}): string {
  const value = opts.value ?? '';
  const current = opts.options.find((o) => o.value === value);
  const items = opts.options
    .map(
      (o) => `<button type="button" class="ui-select-option${o.value === value ? ' selected' : ''}" role="option" aria-selected="${o.value === value}" data-value="${escapeAttr(o.value)}">${escapeHtml(o.label)}</button>`,
    )
    .join('');
  return `<div class="ui-select${opts.className ? ` ${opts.className}` : ''}"${opts.id ? ` id="${escapeAttr(opts.id)}"` : ''}>
      <input type="hidden" name="${escapeAttr(opts.name)}" value="${escapeAttr(value)}">
      <button type="button" class="ui-select-btn" aria-haspopup="listbox" aria-expanded="false"><span class="ui-select-label">${escapeHtml(current?.label || '')}</span>${SELECT_CHEVRON}</button>
      <div class="ui-select-menu" role="listbox" hidden>${items}</div>
    </div>`;
}

export function itemForm(opts: { csrf: string; item?: Item }): string {
  const it = opts.item;
  const action = it ? `/admin/items/${encodeURIComponent(it.id)}` : '/admin/items/new';
  const iconTypeSelect = uiSelect({
    name: 'iconType',
    id: 'icon-type',
    value: it ? it.icon.type : 'favicon',
    options: [
      { value: 'favicon', label: '自动 favicon' },
      { value: 'url', label: '图片 URL' },
      { value: 'svg', label: '内联 SVG' },
    ],
  });
  return `<form class="card" method="post" action="${action}" id="item-form">
    <input type="hidden" name="csrf" value="${escapeAttr(opts.csrf)}">
    <div class="row">
      <div class="field"><label>URL</label><input type="url" name="url" id="item-url" value="${escapeAttr(it?.url || '')}" required placeholder="https://"></div>
      <div class="field" style="flex:0 0 auto;align-self:end"><button type="button" class="secondary" id="fetch-meta">抓取信息</button></div>
    </div>
    <div class="field"><label>标题</label><input type="text" name="title" id="item-title" value="${escapeAttr(it?.title || '')}" required></div>
    <div class="field"><label>描述</label><input type="text" name="description" value="${escapeAttr(it?.description || '')}"></div>
    <div class="field"><label>图标类型</label>${iconTypeSelect}</div>
    <div class="field"><label>图标值</label><textarea name="iconValue" id="icon-value">${escapeHtml(it?.icon.value || '')}</textarea></div>
    <div class="field"><label><input type="checkbox" name="visible" ${it?.visible !== false ? 'checked' : ''}> 前台显示</label></div>
    <button type="submit">保存</button>
    <a class="btn secondary" href="/admin">取消</a>
  </form>`;
}
