import { NextResponse } from 'next/server'
import { searchAssets } from '@/lib/canto'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 })

  try {
    // Search by the filename (strip extension for broader match)
    const stem = name.replace(/\.[^.]+$/, '')
    const results = await searchAssets(stem, 5)

    // Find exact or closest match by filename
    const match = results.find(r => r.name === name)
      ?? results.find(r => r.name.startsWith(stem))
      ?? results[0]

    if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 })

    // Return proxy URL so browser can load it CORS-free
    const direct = match.url?.directUrlPreview ?? match.url?.preview ?? ''
    const proxyUrl = direct
      ? `/api/canto/proxy?url=${encodeURIComponent(direct)}`
      : null

    return NextResponse.json({ proxyUrl, name: match.name, id: match.id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
