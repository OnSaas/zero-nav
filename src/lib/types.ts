export interface Bookmark {
  id: string;
  title: string;
  url: string;
  tags: string[];
  order: number;
  icon?: string;
  description?: string;
}

export interface CustomElements {
  headerText: string;
  footerText: string;
  subtitleText: string;
}

export interface SiteData {
  version: number;
  updatedAt: string;
  bookmarks: Bookmark[];
  meta: {
    customElements: CustomElements;
  };
}

export const DEFAULT_SITE_DATA: SiteData = {
  version: 1,
  updatedAt: new Date().toISOString(),
  bookmarks: [],
  meta: {
    customElements: {
      headerText: '在线服务',
      footerText: 'Powered by zero-nav-next',
      subtitleText: '高频网站快捷导航',
    },
  },
};

export function normalizeSiteData(input: Partial<SiteData> | null | undefined): SiteData {
  const bookmarks = (input?.bookmarks || []).map((bookmark, index) => ({
    id: bookmark.id || `b_${Date.now()}_${index}`,
    title: bookmark.title || '未命名书签',
    url: bookmark.url || '#',
    tags: bookmark.tags || [],
    order: typeof bookmark.order === 'number' ? bookmark.order : index + 1,
    icon: bookmark.icon || '',
    description: bookmark.description || '',
  }));

  return {
    version: input?.version || DEFAULT_SITE_DATA.version,
    updatedAt: input?.updatedAt || new Date().toISOString(),
    bookmarks,
    meta: {
      customElements: {
        headerText: input?.meta?.customElements?.headerText || DEFAULT_SITE_DATA.meta.customElements.headerText,
        footerText: input?.meta?.customElements?.footerText || DEFAULT_SITE_DATA.meta.customElements.footerText,
        subtitleText: input?.meta?.customElements?.subtitleText || DEFAULT_SITE_DATA.meta.customElements.subtitleText,
      },
    },
  };
}
