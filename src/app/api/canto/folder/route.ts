import { NextResponse } from 'next/server'
import { getAlbumContents, proxyUrl } from '@/lib/canto'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const albumId = searchParams.get('albumId')
  if (!albumId) return NextResponse.json({ error: 'missing albumId' }, { status: 400 })
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '200'), 1), 1000)

  try {
    const assets = await getAlbumContents(albumId, limit)
    // Filter generic Canto category tags that carry no semantic meaning for matching
    const SKIP = new Set(['Icons', 'Untagged', 'icons', 'untagged'])
    const mapped = assets.map(a => ({
      id: a.id,
      name: a.name,
      previewUrl:  proxyUrl(a.url?.directUrlPreview ?? a.url?.preview ?? ''),
      originalUrl: proxyUrl(a.url?.directUrlOriginal ?? a.url?.directUrlPreview ?? a.url?.preview ?? ''),
      keywords: [...(a.keyword ?? []), ...(a.tag ?? [])].filter(k => k && !SKIP.has(k)),
    }))
    if (mapped.length === 0) {
      console.warn(`[folder route] albumId=${albumId} returned 0 assets. Check server logs for Canto response details.`)
    }
    return NextResponse.json(mapped)
  } catch (err) {
    console.error(`[folder route] albumId=${albumId} threw:`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
