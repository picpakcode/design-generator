import { NextResponse } from 'next/server'
import { searchAssets, proxyUrl, CantoAsset } from '@/lib/canto'

const STOP = new Set(['with', 'from', 'and', 'for', 'the', 'kit', 'set', 'pack', 'pair', 'rear', 'front'])
const LIFESTYLE_TAGS = new Set(['lifestyle', 'photoshoot'])

function isLifestyle(a: CantoAsset): boolean {
  return [...(a.tag ?? []), ...(a.keyword ?? [])].some(t => LIFESTYLE_TAGS.has(t.toLowerCase()))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sku   = searchParams.get('sku')   ?? ''
  const name  = searchParams.get('name')  ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '25'), 60)

  // Search with a larger internal pool so lifestyle filtering still yields enough results
  const fetchLimit = limit * 3

  try {
    const pool: CantoAsset[] = []
    const seen = new Set<string>()

    const addImages = (assets: CantoAsset[]) => {
      for (const a of assets) {
        if (a.scheme === 'image' && !seen.has(a.id)) {
          seen.add(a.id)
          pool.push(a)
        }
      }
    }

    // Primary: search by SKU — part numbers like D3932C map directly to Canto tags
    if (sku) {
      addImages(await searchAssets(sku, fetchLimit))
    }

    // Secondary: always also search by product name keywords to expand the photo pool
    if (name) {
      const keywords = name
        .split(/[\s,&—–\-/]+/)
        .map(w => w.toLowerCase())
        .filter(w => w.length > 3 && !STOP.has(w))
        .slice(0, 4)
        .join(' ')
      if (keywords) {
        addImages(await searchAssets(keywords, fetchLimit))
      }
    }

    // Put lifestyle-tagged photos first, then fill with remaining images for maximum uniqueness
    const lifestyle    = pool.filter(isLifestyle)
    const nonLifestyle = pool.filter(a => !isLifestyle(a))
    const final = [...lifestyle, ...nonLifestyle].slice(0, limit)

    return NextResponse.json(
      final.map(a => ({
        id: a.id,
        name: a.name,
        previewUrl: proxyUrl(a.url?.directUrlPreview ?? a.url?.preview ?? ''),
      }))
    )
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
