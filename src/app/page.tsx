'use client';

import { useEffect, useState } from 'react';
import type { SiteData, Bookmark } from '@/lib/types';

function BookmarkIcon({ icon, title }: { icon?: string; title: string }) {
  if (icon) {
    if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/')) {
      return <img src={icon} alt={`${title} icon`} className="icon" width={24} height={24} />;
    }

    return <span className="icon text-lg flex items-center justify-center">{icon}</span>;
  }

  return (
    <svg className="icon" viewBox="0 0 1024 1024" width="24" height="24">
      <path d="M904 120H120c-30.9 0-56 25.1-56 56v560c0 30.9 25.1 56 56 56h280v56h-84c-15.5 0-28 12.5-28 28s12.5 28 28 28h392c15.5 0 28-12.5 28-28s-12.5-28-28-28h-84v-56h280c30.9 0 56-25.1 56-56V176c0-30.9-25.1-56-56-56zM568 848H456v-56h112v56z m336-112H120v-56h784v56zM120 624V176h784v448H120z" fill="currentColor"></path>
    </svg>
  );
}

export default function Home() {
  const [data, setData] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/bookmarks')
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Failed to load bookmarks:', error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <main>
        <h1><a href="#">{data?.meta.customElements.headerText || '在线服务'}</a></h1>
        <div className="loading">loading...</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main>
        <h1><a href="#">在线服务</a></h1>
        <div className="empty">加载失败</div>
      </main>
    );
  }

  const bookmarksByTag: Record<string, Bookmark[]> = {};
  data.bookmarks.forEach(bookmark => {
    const tag = bookmark.tags[0] || '未分类';
    if (!bookmarksByTag[tag]) {
      bookmarksByTag[tag] = [];
    }
    bookmarksByTag[tag].push(bookmark);
  });

  Object.keys(bookmarksByTag).forEach(tag => {
    bookmarksByTag[tag].sort((a, b) => a.order - b.order);
  });

  return (
    <main>
      <h1>
        <a href="#">{data.meta.customElements.headerText}</a>
      </h1>
      {data.meta.customElements.subtitleText && (
        <p className="text-center text-gray-500 text-sm mb-5">{data.meta.customElements.subtitleText}</p>
      )}
      <div id="content">
        {Object.entries(bookmarksByTag).map(([tag, bookmarks]) => (
          <div key={tag} className="category-block">
            {tag !== '未分类' && <h2 className="category-title">{tag}</h2>}
            <ul className="category-list">
              {bookmarks.map(bookmark => (
                <li key={bookmark.id}>
                  <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
                    <BookmarkIcon icon={bookmark.icon} title={bookmark.title} />
                    <span className="site-name">{bookmark.title}</span>
                  </a>
                  {bookmark.description && (
                    <p className="text-xs text-gray-500 ml-9 mt-1">{bookmark.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <footer>
        <div>{data.meta.customElements.footerText}</div>
      </footer>
    </main>
  );
}
