import { NextResponse } from 'next/server'
import { getAlbumContents, proxyUrl } from '@/lib/canto'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const albumId = searchParams.get('albumId')
  if (!albumId) return NextResponse.json({ error: 'missing albumId' }, { status: 400 })

  try {
    const assets = await getAlbumContents(albumId, 200)
    return NextResponse.json(assets.map(a => ({
      id: a.id,
      name: a.name,
      previewUrl: proxyUrl(a.url?.directUrlPreview ?? a.url?.preview ?? ''),
      keywords: [...(a.keyword ?? []), ...(a.tag ?? [])],
    })))
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
