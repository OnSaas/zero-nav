import { NextRequest, NextResponse } from 'next/server';
import { getSiteData, saveSiteData } from '@/lib/kv';
import { assertAdminAuth } from '@/lib/auth';
import type { SiteData, Bookmark } from '@/lib/types';
import { normalizeSiteData } from '@/lib/types';

interface CloudflareEnv {
  BOOKMARKS_KV: KVNamespace;
  ADMIN_TOKEN: string;
}

// Helper to get env from request context
function getEnv(request: NextRequest): CloudflareEnv {
  // @ts-ignore - Cloudflare Workers specific
  return request.ctx?.env || process.env;
}

export async function GET(request: NextRequest) {
  try {
    const env = getEnv(request);
    assertAdminAuth(request, env);

    const data = await getSiteData(env.BOOKMARKS_KV);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error fetching bookmarks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookmarks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const env = getEnv(request);
    assertAdminAuth(request, env);

    const body = await request.json();
    const { action, item, data } = body;

    let currentData = normalizeSiteData(await getSiteData(env.BOOKMARKS_KV));

    if (action === 'upsert' && item) {
      // Upsert bookmark
      const bookmark: Bookmark = {
        ...item,
        icon: item.icon || '',
        description: item.description || '',
      };
      const existingIndex = currentData.bookmarks.findIndex(b => b.id === bookmark.id);

      if (existingIndex >= 0) {
        // Update
        currentData.bookmarks[existingIndex] = bookmark;
      } else {
        // Insert
        currentData.bookmarks.push(bookmark);
      }
    } else if (action === 'replace' && data) {
      // Replace entire dataset (for import)
      currentData = normalizeSiteData(data);
    } else {
      return NextResponse.json(
        { error: 'Invalid action or missing data' },
        { status: 400 }
      );
    }

    currentData = normalizeSiteData(currentData);
    await saveSiteData(env.BOOKMARKS_KV, currentData);

    return NextResponse.json({ success: true, data: currentData });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error updating bookmarks:', error);
    return NextResponse.json(
      { error: 'Failed to update bookmarks' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const env = getEnv(request);
    assertAdminAuth(request, env);

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing id parameter' },
        { status: 400 }
      );
    }

    let currentData = await getSiteData(env.BOOKMARKS_KV);
    currentData.bookmarks = currentData.bookmarks.filter(b => b.id !== id);

    currentData = normalizeSiteData(currentData);
    await saveSiteData(env.BOOKMARKS_KV, currentData);

    return NextResponse.json({ success: true, data: currentData });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Error deleting bookmark:', error);
    return NextResponse.json(
      { error: 'Failed to delete bookmark' },
      { status: 500 }
    );
  }
}
