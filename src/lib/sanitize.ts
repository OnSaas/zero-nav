import { SVG_MAX_BYTES } from '../types';

const BLOCKED = /<script|foreignObject|iframe|object|embed|\blink\b|meta|base|textarea|form|javascript:|data:text\/html/i;

export function sanitizeSvg(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length > SVG_MAX_BYTES) return null;
  if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>\s*$/i.test(trimmed)) return null;
  if (BLOCKED.test(trimmed)) return null;
  if (/\son[a-z]+\s*=/i.test(trimmed)) return null;
  return trimmed;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    u.pathname = path;
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function faviconUrlFor(pageUrl: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(pageUrl)}`;
}

export function slugify(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '');
  return s || 'cat';
}
