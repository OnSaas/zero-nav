import { Hono } from 'hono';
import type { Bindings, Variables } from './types';
import { PayloadTooLargeError, RevConflictError } from './lib/store';
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

app.onError((err, c) => {
  if (err instanceof RevConflictError) return c.json({ error: 'conflict', rev: err.rev }, 409);
  if (err instanceof PayloadTooLargeError) return c.json({ error: err.message }, 413);
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
