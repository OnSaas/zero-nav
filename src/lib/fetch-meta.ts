import { faviconUrlFor, isHttpUrl } from './sanitize';

export type FetchMeta = {
  title: string;
  favicon: string;
};

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export async function fetchMeta(pageUrl: string): Promise<FetchMeta> {
  if (!isHttpUrl(pageUrl)) {
    throw new Error('URL 必须是 http(s)');
  }

  const fallback: FetchMeta = {
    title: '',
    favicon: faviconUrlFor(pageUrl),
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(pageUrl, {
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'user-agent': 'zero-nav/3 (+https://github.com/hahabye/zero-nav)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) fallback.title = decodeEntities(titleMatch[1]).slice(0, 200);

    const iconMatch =
      html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i) ||
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);
    if (iconMatch) {
      try {
        fallback.favicon = new URL(iconMatch[1], res.url || pageUrl).toString();
      } catch {
        /* keep google favicon */
      }
    }
    return fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
