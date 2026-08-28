import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Bindings, LoginFailRecord, SessionRecord, Variables } from '../types';
import { LOGIN_FAIL_PREFIX, LOGIN_MAX_FAILS, LOGIN_WINDOW_TTL, SESSION_PREFIX, SESSION_TTL } from '../types';

const COOKIE_NAME = 'nav_session';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

function cookieSecure(c: AppContext): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

export function clientIp(c: AppContext): string {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

export async function tokensEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  const ua = new Uint8Array(ha);
  const ub = new Uint8Array(hb);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

export async function getLoginLock(kv: KVNamespace, ip: string): Promise<LoginFailRecord | null> {
  return (await kv.get(`${LOGIN_FAIL_PREFIX}${ip}`, 'json')) as LoginFailRecord | null;
}

export async function assertNotLocked(kv: KVNamespace, ip: string): Promise<void> {
  const rec = await getLoginLock(kv, ip);
  if (rec?.lockedUntil && rec.lockedUntil > Date.now()) {
    const err = new Error('Too many login attempts');
    (err as Error & { status: number; retryAfter: number }).status = 429;
    (err as Error & { retryAfter: number }).retryAfter = Math.ceil((rec.lockedUntil - Date.now()) / 1000);
    throw err;
  }
}

export async function recordLoginFail(kv: KVNamespace, ip: string): Promise<LoginFailRecord> {
  const key = `${LOGIN_FAIL_PREFIX}${ip}`;
  const rec = ((await kv.get(key, 'json')) as LoginFailRecord | null) || { count: 0 };
  rec.count += 1;
  if (rec.count >= LOGIN_MAX_FAILS) {
    rec.lockedUntil = Date.now() + LOGIN_WINDOW_TTL * 1000;
  }
  await kv.put(key, JSON.stringify(rec), { expirationTtl: LOGIN_WINDOW_TTL });
  return rec;
}

export async function clearLoginFail(kv: KVNamespace, ip: string): Promise<void> {
  await kv.delete(`${LOGIN_FAIL_PREFIX}${ip}`);
}

export async function createSession(c: AppContext): Promise<{ sid: string; csrf: string }> {
  const sid = crypto.randomUUID();
  const csrf = crypto.randomUUID();
  const record: SessionRecord = { csrf, createdAt: new Date().toISOString() };
  await c.env.BOOKMARKS_KV.put(`${SESSION_PREFIX}${sid}`, JSON.stringify(record), {
    expirationTtl: SESSION_TTL,
  });
  setCookie(c, COOKIE_NAME, sid, {
    httpOnly: true,
    secure: cookieSecure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
  return { sid, csrf };
}

export async function destroySession(c: AppContext): Promise<void> {
  const sid = getCookie(c, COOKIE_NAME);
  if (sid) await c.env.BOOKMARKS_KV.delete(`${SESSION_PREFIX}${sid}`);
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}

export async function readSession(c: AppContext): Promise<{ sid: string; record: SessionRecord } | null> {
  const sid = getCookie(c, COOKIE_NAME);
  if (!sid) return null;
  const record = (await c.env.BOOKMARKS_KV.get(`${SESSION_PREFIX}${sid}`, 'json')) as SessionRecord | null;
  if (!record) return null;
  return { sid, record };
}

export async function headerTokenOk(c: AppContext): Promise<boolean> {
  const token = c.req.header('x-admin-token');
  if (!token || !c.env.ADMIN_TOKEN) return false;
  return tokensEqual(token, c.env.ADMIN_TOKEN);
}

export async function requireAdmin(c: AppContext): Promise<boolean> {
  if (await headerTokenOk(c)) {
    c.set('authMode', 'token');
    c.set('csrf', '');
    c.set('sessionId', '');
    return true;
  }

  const session = await readSession(c);
  if (!session) return false;
  c.set('authMode', 'cookie');
  c.set('csrf', session.record.csrf);
  c.set('sessionId', session.sid);
  return true;
}

export function csrfOk(c: AppContext): boolean {
  if (c.get('authMode') === 'token') return true;
  const expected = c.get('csrf');
  if (!expected) return false;
  const got = c.req.header('x-csrf') || '';
  return got === expected;
}

export async function csrfFromForm(c: AppContext, body: FormData | Record<string, string>): Promise<boolean> {
  if (c.get('authMode') === 'token') return true;
  const expected = c.get('csrf');
  if (!expected) return false;
  const got =
    body instanceof FormData ? String(body.get('csrf') || '') : String(body.csrf || c.req.header('x-csrf') || '');
  return got === expected;
}
