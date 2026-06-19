import { checkMcpAuth, getMcpUserId, unauthorized } from '../../../../../_auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveTemplateState, loadTemplateState } from '@/lib/db'
import type { TemplateShareState } from '@/types'

// PATCH /api/mcp/projects/[id]/products/[sku]/name  — rename a product
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; sku: string } },
) {
  if (!checkMcpAuth(req)) return unauthorized()
  const userId = getMcpUserId(req)
  if (!userId) return unauthorized('X-User-Id header is required')

  const body = await req.json() as { name: string }
  if (!body.name?.trim()) return Response.json({ error: 'name is required' }, { status: 400 })

  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, params.id)
  if (!ts) return Response.json({ error: 'Project not found or no template state' }, { status: 404 })

  const productIdx = ts.products.findIndex(p => p.sku === params.sku)
  if (productIdx === -1) return Response.json({ error: `SKU "${params.sku}" not found` }, { status: 404 })

  const product = ts.products[productIdx]
  const newName = body.name.trim()

  // Update both the canonical productName in the products array and the
  // productNames override map (used by the app for display and export filenames)
  const newProducts = [...ts.products]
  newProducts[productIdx] = { ...product, productName: newName }

  const newProductNames = { ...(ts.productNames ?? {}), [product.id]: newName }

  const newTs: TemplateShareState = {
    ...ts,
    products: newProducts,
    productNames: newProductNames,
  }

  await saveTemplateState(admin, params.id, newTs)

  return Response.json({ ok: true, sku: params.sku, name: newName })
}
