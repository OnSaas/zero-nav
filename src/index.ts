import { Hono } from 'hono';
import type { Bindings, Variables } from './types';
import { publicRoutes } from './routes/public';
import { adminPages } from './routes/admin-pages';
import { adminApi } from './routes/admin-api';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route('/', publicRoutes);
app.route('/', adminApi);
app.route('/', adminPages);

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
  return c.text('Not found', 404);
});

export default app;
