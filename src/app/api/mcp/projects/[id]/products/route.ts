import { checkMcpAuth, unauthorized } from '../../../_auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TemplateShareState } from '@/types'

// GET  /api/mcp/projects/[id]/products  — list products in a project
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!checkMcpAuth(req)) return unauthorized()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('projects')
    .select('template_state')
    .eq('id', params.id)
    .single()

  if (error || !data) return Response.json({ error: 'Project not found' }, { status: 404 })

  const ts = data.template_state as unknown as TemplateShareState | null
  if (!ts?.products?.length) {
    return Response.json({ products: [], note: 'No Template Mode data — upload a CSV in the app first.' })
  }

  return Response.json({
    products: ts.products.map(p => ({
      sku: p.sku,
      name: p.productName,
      aplus_slots: p.slots.length,
      gallery_slots: p.gallerySlots?.length ?? 0,
    })),
  })
}
