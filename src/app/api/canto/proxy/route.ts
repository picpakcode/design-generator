import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })

  // Only proxy Canto domains
  if (!url.includes('canto.com') && !url.includes('canto.global')) {
    return NextResponse.json({ error: 'domain not allowed' }, { status: 403 })
  }

  const res = await fetch(url)
  if (!res.ok) return NextResponse.json({ error: 'upstream failed' }, { status: 502 })

  const blob = await res.blob()
  return new NextResponse(blob, {
    headers: {
      'Content-Type':  res.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
