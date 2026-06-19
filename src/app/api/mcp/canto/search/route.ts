import { checkMcpAuth, unauthorized } from '../../_auth'
import { searchAssets } from '@/lib/canto'

const LIFESTYLE_TAGS = new Set(['lifestyle', 'photoshoot'])

export async function GET(req: Request) {
  if (!checkMcpAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const q     = searchParams.get('q') ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)

  if (!q.trim()) return Response.json({ error: 'q is required' }, { status: 400 })

  try {
    const assets = await searchAssets(q, limit * 2)
    const images = assets.filter(a => a.scheme === 'image')

    const isLifestyle = (a: (typeof images)[number]) =>
      [...(a.tag ?? []), ...(a.keyword ?? [])].some(t => LIFESTYLE_TAGS.has(t.toLowerCase()))

    const sorted = [
      ...images.filter(isLifestyle),
      ...images.filter(a => !isLifestyle(a)),
    ].slice(0, limit)

    return Response.json(
      sorted.map(a => ({
        id:          a.id,
        name:        a.name,
        tags:        a.tag ?? [],
        keywords:    a.keyword ?? [],
        width:       a.width,
        height:      a.height,
        preview_url: a.url?.directUrlPreview ?? a.url?.preview ?? '',
        full_url:    a.url?.directUrlOriginal ?? '',
      })),
    )
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
