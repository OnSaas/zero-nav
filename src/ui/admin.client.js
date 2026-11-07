(() => {
  const csrf = document.querySelector('meta[name="csrf"]')?.content || document.body?.dataset?.csrf || '';

  async function api(path, opts = {}) {
    const headers = Object.assign({ 'x-csrf': csrf }, opts.headers || {});
    if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
      headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, Object.assign({ credentials: 'same-origin' }, opts, { headers }));
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
      throw new Error('数据已在别处修改，请刷新页面后重试');
    }
    if (!res.ok) throw new Error(data.error || res.statusText || '请求失败');
    return data;
  }

  function toast(msg, kind = 'ok') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'msg';
      const wrap = document.querySelector('.wrap');
      if (wrap) wrap.prepend(el);
      else document.body.prepend(el);
    }
    el.className = 'msg ' + kind;
    el.textContent = msg;
  }

  function openDialog(title, cancelValue, build) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'ui-overlay';
      const card = document.createElement('div');
      card.className = 'ui-dialog card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      if (title) {
        const heading = document.createElement('h3');
        heading.textContent = title;
        card.appendChild(heading);
      }
      overlay.appendChild(card);
      const previous = document.activeElement;
      let closed = false;
      function finish(value) {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        if (previous && typeof previous.focus === 'function') previous.focus();
        resolve(value);
      }
      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(cancelValue);
        }
      }
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) finish(cancelValue);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      build(card, finish);
    });
  }

  function uiConfirm(message, opts) {
    const danger = !!(opts && opts.danger);
    return openDialog('', false, (card, finish) => {
      const text = document.createElement('p');
      text.className = 'ui-message';
      text.textContent = message;
      card.appendChild(text);
      const actions = document.createElement('div');
      actions.className = 'ui-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ghost';
      cancelBtn.textContent = '取消';
      cancelBtn.addEventListener('click', () => finish(false));
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      if (danger) okBtn.className = 'danger';
      okBtn.textContent = '确定';
      okBtn.addEventListener('click', () => finish(true));
      actions.append(cancelBtn, okBtn);
      card.appendChild(actions);
      okBtn.focus();
    });
  }

  function closeSelects(except) {
    document.querySelectorAll('.ui-select.open').forEach((root) => {
      if (root === except) return;
      root.classList.remove('open');
      const btn = root.querySelector('.ui-select-btn');
      const menu = root.querySelector('.ui-select-menu');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (menu) menu.hidden = true;
    });
  }

  function applySelectValue(root, value) {
    const hidden = root.querySelector('input[type="hidden"]');
    if (!hidden) return;
    hidden.value = value;
    const options = [...root.querySelectorAll('.ui-select-option')];
    const chosen = options.find((o) => o.dataset.value === value);
    const label = root.querySelector('.ui-select-label');
    if (chosen && label) label.textContent = chosen.textContent;
    options.forEach((o) => {
      const on = o === chosen;
      o.classList.toggle('selected', on);
      o.setAttribute('aria-selected', String(on));
    });
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  document.addEventListener('click', (e) => {
    const option = e.target.closest('.ui-select-option');
    if (option) {
      applySelectValue(option.closest('.ui-select'), option.dataset.value);
      closeSelects();
      return;
    }
    const btn = e.target.closest('.ui-select-btn');
    if (btn) {
      const root = btn.closest('.ui-select');
      const wasOpen = root.classList.contains('open');
      closeSelects();
      if (wasOpen) return;
      root.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      const menu = root.querySelector('.ui-select-menu');
      if (menu) menu.hidden = false;
      return;
    }
    if (!e.target.closest('.ui-select')) closeSelects();
  });

  document.addEventListener('change', (e) => {
    const hidden = e.target;
    if (!hidden || hidden.type !== 'hidden' || typeof hidden.closest !== 'function') return;
    const root = hidden.closest('.ui-select');
    if (!root) return;
    const chosen = [...root.querySelectorAll('.ui-select-option')].find((o) => o.dataset.value === hidden.value);
    const label = root.querySelector('.ui-select-label');
    if (chosen && label) label.textContent = chosen.textContent;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSelects();
  });

  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      if (form.dataset.confirmed === '1') return;
      e.preventDefault();
      if (await uiConfirm(form.dataset.confirm, { danger: true })) {
        form.dataset.confirmed = '1';
        form.requestSubmit();
      }
    });
  });

  const fetchBtn = document.getElementById('fetch-meta');
  if (fetchBtn) {
    fetchBtn.addEventListener('click', async () => {
      const url = document.getElementById('item-url')?.value?.trim();
      if (!url) return;
      fetchBtn.disabled = true;
      try {
        const data = await api('/api/admin/fetch-meta?url=' + encodeURIComponent(url));
        const title = document.getElementById('item-title');
        const icon = document.getElementById('icon-value');
        const type = document.getElementById('icon-type');
        if (title && data.title && !title.value) title.value = data.title;
        if (title && data.title && title.value === '新链接') title.value = data.title;
        if (icon && data.favicon) icon.value = data.favicon;
        if (type) {
          type.value = 'favicon';
          type.dispatchEvent(new Event('change', { bubbles: true }));
        }
        toast('已抓取标题和图标');
      } catch (e) {
        toast(e.message, 'err');
      } finally {
        fetchBtn.disabled = false;
      }
    });
  }

  document.querySelectorAll('[data-preview-import]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const form = btn.closest('form');
      const payload = form.querySelector('[name=payload]')?.value || '';
      const format = form.querySelector('[name=format]')?.value || 'json';
      const replace = form.querySelector('[name=replace]')?.checked || false;
      const out = form.querySelector('.preview-box');
      try {
        const data = await api('/api/admin/import', {
          method: 'POST',
          body: { format, replace, payload, preview: true },
        });
        out.textContent = `将新增 ${data.itemsToAdd} 条链接，重复 ${data.duplicates} 条`;
      } catch (e) {
        out.textContent = e.message;
      }
    });
  });

  const workspace = document.getElementById('workspace');
  if (!workspace) return;

  const raw = document.getElementById('nav-data');
  let nav = raw ? JSON.parse(raw.textContent) : { items: [], site: {} };

  const itemBox = document.getElementById('item-box');
  const searchInput = document.getElementById('item-search');
  const selected = new Set();

  function render() {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const items = (nav.items || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((it) => {
        if (!query) return true;
        return [it.title, it.url, it.description].join(' ').toLowerCase().includes(query);
      });
    if (itemBox) {
      itemBox.innerHTML = items
        .map((it) => {
          const icon =
            it.icon?.type === 'svg'
              ? it.icon.value
              : it.icon?.value
                ? `<img class="icon-sm" src="${escapeAttr(it.icon.value)}" alt="">`
                : '';
          return `<li class="item-row ${it.visible ? '' : 'hidden-row'}" draggable="true" data-id="${it.id}">
            <input type="checkbox" class="check" data-act="select" ${selected.has(it.id) ? 'checked' : ''}>
            ${icon}
            <span class="grow"><span class="title">${escapeHtml(it.title)}</span>
            <div class="url">${escapeHtml(it.url)}</div></span>
            <button class="ghost icon-btn" data-act="toggle-item" title="${it.visible ? '隐藏' : '显示'}" aria-label="${it.visible ? '隐藏' : '显示'}">${icon(it.visible ? 'eye' : 'eye-off')}</button>
            <a class="btn ghost icon-btn" href="/admin/items/${encodeURIComponent(it.id)}" title="编辑" aria-label="编辑">${icon('pencil')}</a>
            <button class="danger icon-btn" data-act="del-item" title="删除" aria-label="删除">${icon('trash')}</button>
          </li>`;
        })
        .join('') || '<li class="muted" style="padding:12px">还没有链接</li>';
    }
    bindDrag();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function icon(name) {
    const attrs = 'viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const paths = {
      eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
      'eye-off': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
      pencil: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
      trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    };
    return `<svg ${attrs}>${paths[name] || ''}</svg>`;
  }

  itemBox?.addEventListener('click', async (e) => {
    const li = e.target.closest('.item-row');
    if (!li) return;
    const id = li.dataset.id;
    const act = e.target.dataset.act;
    if (act === 'select') {
      if (e.target.checked) selected.add(id);
      else selected.delete(id);
      return;
    }
    if (act === 'toggle-item') {
      const found = (nav.items || []).find((i) => i.id === id);
      try {
        const data = await api('/api/admin/items/' + id, { method: 'PATCH', body: { visible: !found.visible } });
        nav = data.data;
        if (data.duplicates?.length) toast('存在重复 URL', 'warn');
        render();
      } catch (err) {
        toast(err.message, 'err');
      }
    }
    if (act === 'del-item') {
      if (!(await uiConfirm('确定删除这条链接？', { danger: true }))) return;
      try {
        const data = await api('/api/admin/items/' + id + '/delete', { method: 'POST', body: {} });
        nav = data.data;
        selected.delete(id);
        render();
      } catch (err) {
        toast(err.message, 'err');
      }
    }
  });

  document.getElementById('bulk-del')?.addEventListener('click', async () => {
    if (!selected.size) return toast('先勾选链接', 'warn');
    if (!(await uiConfirm(`删除 ${selected.size} 条链接？`, { danger: true }))) return;
    try {
      const data = await api('/api/admin/items/bulk-delete', { method: 'POST', body: { ids: [...selected] } });
      nav = data.data;
      selected.clear();
      render();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  searchInput?.addEventListener('input', render);

  function bindDrag() {
    itemBox?.querySelectorAll('.item-row').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/item', el.dataset.id);
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const itemId = e.dataTransfer.getData('text/item');
        if (!itemId) return;
        const ids = [...itemBox.querySelectorAll('.item-row')].map((n) => n.dataset.id);
        const from = ids.indexOf(itemId);
        const to = ids.indexOf(el.dataset.id);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, itemId);
        try {
          const data = await api('/api/admin/items/reorder', { method: 'POST', body: { ids } });
          nav = data.data;
          render();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });
  }

  render();
})();
