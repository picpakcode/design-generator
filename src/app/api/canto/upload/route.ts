import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadAsset } from '@/lib/canto'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { dataUrl, filename, albumId, tags, keywords, description } =
    body as {
      dataUrl: string; filename: string; albumId: string
      tags?: string[]; keywords?: string[]; description?: string
    }

  if (!dataUrl || !filename || !albumId) {
    return NextResponse.json({ error: 'dataUrl, filename, and albumId are required' }, { status: 400 })
  }

  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')

  try {
    const result = await uploadAsset(buffer, filename, albumId, { tags, keywords, description }, user.id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status  = message.includes('permission denied') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
