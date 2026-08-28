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
        if (type) type.value = 'favicon';
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
        out.textContent = `将新增 ${data.categoriesToAdd} 个分类 / ${data.itemsToAdd} 条链接，重复 ${data.duplicates} 条` +
          (data.categoryNames?.length ? `\n分类：${data.categoryNames.join('、')}` : '');
      } catch (e) {
        out.textContent = e.message;
      }
    });
  });

  const workspace = document.getElementById('workspace');
  if (!workspace) return;

  const raw = document.getElementById('nav-data');
  let nav = raw ? JSON.parse(raw.textContent) : { categories: [], site: {} };
  let currentCat = nav.categories[0]?.id || '';
  const q = new URLSearchParams(location.search);
  if (q.get('cat') && nav.categories.some((c) => c.id === q.get('cat'))) currentCat = q.get('cat');

  const catBox = document.getElementById('cat-box');
  const itemBox = document.getElementById('item-box');
  const mobileSelect = document.getElementById('mobile-cat');
  const searchInput = document.getElementById('item-search');
  const selected = new Set();

  function catById(id) {
    return nav.categories.find((c) => c.id === id);
  }

  function render() {
    const query = (searchInput?.value || '').trim().toLowerCase();
    if (catBox) {
      catBox.innerHTML = nav.categories
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(
          (c) => `<li class="cat-item ${c.id === currentCat ? 'active' : ''} ${c.visible ? '' : 'hidden-row'}" draggable="true" data-id="${c.id}">
            <span class="grow"><span class="title">${escapeHtml(c.name)}</span>
            <div class="url">${c.items.length} 条${c.visible ? '' : ' · 隐藏'}</div></span>
            <button class="ghost" data-act="toggle-cat" title="显隐">${c.visible ? '显' : '隐'}</button>
          </li>`,
        )
        .join('');
    }
    if (mobileSelect) {
      mobileSelect.innerHTML = nav.categories
        .map((c) => `<option value="${c.id}" ${c.id === currentCat ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
        .join('');
    }
    const cat = catById(currentCat);
    const items = (cat?.items || [])
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
            <button class="ghost" data-act="toggle-item">${it.visible ? '显' : '隐'}</button>
            <a class="btn ghost" href="/admin/items/${encodeURIComponent(it.id)}">改</a>
            <button class="danger" data-act="del-item">删</button>
          </li>`;
        })
        .join('') || '<li class="muted" style="padding:12px">这个分类还没有链接</li>';
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

  catBox?.addEventListener('click', async (e) => {
    const li = e.target.closest('.cat-item');
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.dataset.act === 'toggle-cat') {
      const cat = catById(id);
      try {
        const data = await api('/api/admin/categories/' + id, { method: 'PATCH', body: { visible: !cat.visible } });
        nav = data.data;
        render();
      } catch (err) {
        toast(err.message, 'err');
      }
      return;
    }
    currentCat = id;
    selected.clear();
    render();
  });

  mobileSelect?.addEventListener('change', () => {
    currentCat = mobileSelect.value;
    selected.clear();
    render();
  });

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
      const found = catById(currentCat)?.items.find((i) => i.id === id);
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
      if (!confirm('确定删除这条链接？')) return;
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

  document.getElementById('add-cat')?.addEventListener('click', async () => {
    const name = prompt('分类名称');
    if (!name) return;
    try {
      const data = await api('/api/admin/categories', { method: 'POST', body: { name } });
      nav = data.data;
      currentCat = data.id || currentCat;
      render();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  document.getElementById('rename-cat')?.addEventListener('click', async () => {
    const cat = catById(currentCat);
    if (!cat) return;
    const name = prompt('分类名称', cat.name);
    if (!name) return;
    try {
      const data = await api('/api/admin/categories/' + cat.id, { method: 'PATCH', body: { name } });
      nav = data.data;
      render();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  document.getElementById('del-cat')?.addEventListener('click', async () => {
    const cat = catById(currentCat);
    if (!cat) return;
    if (!confirm(`删除分类「${cat.name}」及其 ${cat.items.length} 条链接？`)) return;
    try {
      const data = await api('/api/admin/categories/' + cat.id + '/delete', { method: 'POST', body: {} });
      nav = data.data;
      currentCat = nav.categories[0]?.id || '';
      render();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  document.getElementById('bulk-del')?.addEventListener('click', async () => {
    if (!selected.size) return toast('先勾选链接', 'warn');
    if (!confirm(`删除 ${selected.size} 条链接？`)) return;
    try {
      const data = await api('/api/admin/items/bulk-delete', { method: 'POST', body: { ids: [...selected] } });
      nav = data.data;
      selected.clear();
      render();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  document.getElementById('bulk-move')?.addEventListener('click', async () => {
    if (!selected.size) return toast('先勾选链接', 'warn');
    const names = nav.categories.map((c) => c.name).join('\n');
    const name = prompt('移动到分类（输入名称）：\n' + names);
    const cat = nav.categories.find((c) => c.name === name);
    if (!cat) return;
    try {
      const data = await api('/api/admin/items/move', { method: 'POST', body: { ids: [...selected], toCategoryId: cat.id } });
      nav = data.data;
      currentCat = cat.id;
      selected.clear();
      render();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  searchInput?.addEventListener('input', render);

  function bindDrag() {
    catBox?.querySelectorAll('.cat-item').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/cat', el.dataset.id);
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
        const catId = e.dataTransfer.getData('text/cat');
        if (itemId) {
          try {
            const data = await api('/api/admin/items/move', { method: 'POST', body: { ids: [itemId], toCategoryId: el.dataset.id } });
            nav = data.data;
            currentCat = el.dataset.id;
            render();
          } catch (err) {
            toast(err.message, 'err');
          }
          return;
        }
        if (!catId) return;
        const ids = [...catBox.querySelectorAll('.cat-item')].map((n) => n.dataset.id);
        const from = ids.indexOf(catId);
        const to = ids.indexOf(el.dataset.id);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, catId);
        try {
          const data = await api('/api/admin/categories/reorder', { method: 'POST', body: { ids } });
          nav = data.data;
          render();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });
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
        if (!itemId || !currentCat) return;
        const ids = [...itemBox.querySelectorAll('.item-row')].map((n) => n.dataset.id);
        const from = ids.indexOf(itemId);
        const to = ids.indexOf(el.dataset.id);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, itemId);
        try {
          const data = await api('/api/admin/items/reorder', { method: 'POST', body: { categoryId: currentCat, ids } });
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
