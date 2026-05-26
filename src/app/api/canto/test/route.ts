import { NextResponse } from 'next/server'
import { getAlbums, searchAssets } from '@/lib/canto'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')

  try {
    if (q) {
      const results = await searchAssets(q, 10)
      return NextResponse.json({ query: q, count: results.length, results })
    }
    const albums = await getAlbums()
    return NextResponse.json({ albums })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
