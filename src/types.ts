export type Bindings = {
  BOOKMARKS_KV: KVNamespace;
  ADMIN_TOKEN: string;
};

export type Variables = {
  sessionId: string;
  csrf: string;
  authMode: 'cookie' | 'token';
};

export type IconType = 'url' | 'svg' | 'favicon';

export type ItemIcon = {
  type: IconType;
  value: string;
};

export type Item = {
  id: string;
  title: string;
  url: string;
  description: string;
  icon: ItemIcon;
  order: number;
  visible: boolean;
};

export type Category = {
  id: string;
  name: string;
  slug?: string;
  icon?: string;
  order: number;
  visible: boolean;
  items: Item[];
};

export type SiteSettings = {
  title: string;
  headerText: string;
  footerText: string;
  themeColor: string;
  showDescription: boolean;
  showCategoryTitle: boolean;
};

export type NavData = {
  v: 1;
  updatedAt: string;
  site: SiteSettings;
  categories: Category[];
};

export type SessionRecord = {
  csrf: string;
  createdAt: string;
};

export type LoginFailRecord = {
  count: number;
  lockedUntil?: number;
};

export type LegacyBookmark = {
  id?: string;
  title: string;
  url: string;
  tags?: string[];
  order?: number;
};

export type LegacySiteData = {
  version?: number;
  updatedAt?: string;
  bookmarks?: LegacyBookmark[];
  meta?: {
    customElements?: {
      headerText?: string;
      footerText?: string;
    };
  };
};

export type YamlSite = {
  title?: string;
  url?: string;
  description?: string;
  icon?: string;
};

export type YamlCategory = {
  name?: string;
  icon?: string;
  sites?: YamlSite[];
};

export type YamlConfig = {
  categories?: YamlCategory[];
};

export const DATA_KEY = 'nav:data';
export const LEGACY_KEY = 'site:bookmarks';
export const HISTORY_PREFIX = 'nav:history:';
export const SESSION_PREFIX = 'nav:session:';
export const LOGIN_FAIL_PREFIX = 'nav:login-fail:';

export const SESSION_TTL = 60 * 60 * 24 * 7;
export const HISTORY_TTL = 60 * 60 * 24 * 30;
export const LOGIN_WINDOW_TTL = 60 * 15;
export const LOGIN_MAX_FAILS = 5;

export const SVG_MAX_BYTES = 8192;

export function defaultNavData(): NavData {
  return {
    v: 1,
    updatedAt: new Date().toISOString(),
    site: {
      title: '在线服务',
      headerText: '在线服务',
      footerText: 'Powered by zero-nav',
      themeColor: '#774cb2',
      showDescription: false,
      showCategoryTitle: true,
    },
    categories: [],
  };
}

export function newId(prefix: 'cat' | 'item'): string {
  const raw = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}_${raw}`;
}

export function statsOf(nav: NavData) {
  const categories = nav.categories.length;
  const items = nav.categories.reduce((n, c) => n + c.items.length, 0);
  const hiddenCategories = nav.categories.filter((c) => !c.visible).length;
  const hiddenItems = nav.categories.reduce(
    (n, c) => n + c.items.filter((i) => !i.visible).length,
    0,
  );
  return { categories, items, hiddenCategories, hiddenItems };
}
