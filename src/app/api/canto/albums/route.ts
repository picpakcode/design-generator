import { NextResponse } from 'next/server'
import { getAlbums } from '@/lib/canto'

export async function GET() {
  try {
    const albums = await getAlbums()
    return NextResponse.json(albums)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
