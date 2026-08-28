import { Hono } from 'hono';
import type { Bindings } from '../types';
import { renderPublicPage } from '../lib/html';
import { getNavData, publicNav } from '../lib/store';

export const publicRoutes = new Hono<{ Bindings: Bindings }>();

publicRoutes.get('/', async (c) => {
  const nav = await getNavData(c.env.BOOKMARKS_KV);
  const html = renderPublicPage(nav);
  c.header('Cache-Control', 'public, max-age=30');
  return c.html(html);
});

publicRoutes.get('/api/public/nav', async (c) => {
  const nav = publicNav(await getNavData(c.env.BOOKMARKS_KV));
  c.header('Cache-Control', 'public, max-age=30');
  return c.json(nav);
});
