import { NextRequest, NextResponse } from 'next/server';
import { getSiteData } from '@/lib/kv';
import { DEFAULT_SITE_DATA, normalizeSiteData } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    // @ts-ignore - Cloudflare Workers env
    const kv = request.nextUrl.searchParams.get('env')?.BOOKMARKS_KV || process.env.BOOKMARKS_KV;

    if (!kv) {
      // For development, return mock data
      return NextResponse.json(normalizeSiteData(DEFAULT_SITE_DATA));
    }

    const data = await getSiteData(kv as KVNamespace);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookmarks' },
      { status: 500 }
    );
  }
}
