import { checkMcpAuth, unauthorized } from '../../../../../_auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveTemplateState, loadTemplateState } from '@/lib/db'
import type { TemplateShareState, TemplateShareSlotState, UploadedAsset } from '@/types'

function findProduct(ts: TemplateShareState, sku: string) {
  const idx = ts.products.findIndex(p => p.sku === sku)
  if (idx === -1) return null
  return { product: ts.products[idx], productId: ts.products[idx].id }
}

// PATCH /api/mcp/projects/[id]/products/[sku]/photo  — assign Canto photo to slot
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; sku: string } },
) {
  if (!checkMcpAuth(req)) return unauthorized()

  const body = await req.json() as {
    slot_index?: number
    is_gallery?: boolean
    canto_asset_id: string
    canto_asset_name: string
    canto_asset_url: string
  }

  const { slot_index = 0, is_gallery = false } = body
  if (!body.canto_asset_id || !body.canto_asset_url) {
    return Response.json({ error: 'canto_asset_id and canto_asset_url are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, params.id)
  if (!ts) return Response.json({ error: 'Project not found or no template state' }, { status: 404 })

  const found = findProduct(ts, params.sku)
  if (!found) return Response.json({ error: `SKU "${params.sku}" not found` }, { status: 404 })

  const { productId } = found
  const slotMap = is_gallery ? ts.allGallerySlots : ts.allSlots
  const slots: TemplateShareSlotState[] = slotMap[productId] ?? []

  if (slot_index < 0 || slot_index >= slots.length) {
    return Response.json(
      { error: `slot_index ${slot_index} out of range (0–${slots.length - 1})` },
      { status: 400 },
    )
  }

  const photoAsset: UploadedAsset = {
    id:   body.canto_asset_id,
    name: body.canto_asset_name,
    url:  body.canto_asset_url,
    type: 'image',
  }

  const newSlots = [...slots]
  newSlots[slot_index] = { ...slots[slot_index], photoAsset }

  const newTs: TemplateShareState = {
    ...ts,
    allSlots:        is_gallery ? ts.allSlots        : { ...ts.allSlots,        [productId]: newSlots },
    allGallerySlots: is_gallery ? { ...ts.allGallerySlots, [productId]: newSlots } : ts.allGallerySlots,
  }

  await saveTemplateState(admin, params.id, newTs)

  const label = is_gallery ? `g${slot_index + 1}` : `${String.fromCharCode(97 + slot_index)}1`
  return Response.json({
    ok: true,
    assigned_to: label,
    photo: { id: photoAsset.id, name: photoAsset.name },
  })
}
