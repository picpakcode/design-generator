import { checkMcpAuth, unauthorized } from '../../../../_auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveTemplateState, loadTemplateState } from '@/lib/db'
import type { TemplateShareState, TemplateShareSlotState, UploadedAsset } from '@/types'

function findProduct(ts: TemplateShareState, sku: string) {
  const idx = ts.products.findIndex(p => p.sku === sku)
  if (idx === -1) return null
  const product = ts.products[idx]
  return { product, productId: product.id }
}

// GET /api/mcp/projects/[id]/products/[sku]  — get all slot content
export async function GET(
  req: Request,
  { params }: { params: { id: string; sku: string } },
) {
  if (!checkMcpAuth(req)) return unauthorized()

  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, params.id)
  if (!ts) return Response.json({ error: 'Project not found or no template state' }, { status: 404 })

  const found = findProduct(ts, params.sku)
  if (!found) return Response.json({ error: `SKU "${params.sku}" not found` }, { status: 404 })

  const { product, productId } = found
  const aplusSlots = (ts.allSlots[productId] ?? []).map((s, i) => ({
    index: i,
    label: `${String.fromCharCode(97 + i)}1`,
    title: s.title,
    desc: s.desc,
    icon_callouts: s.iconLabels,
    photo: s.photoAsset ? { id: s.photoAsset.id, name: s.photoAsset.name, url: s.photoAsset.url } : null,
  }))

  const gallerySlots = (ts.allGallerySlots[productId] ?? []).map((s, i) => ({
    index: i,
    label: `g${i + 1}`,
    title: s.title,
    desc: s.desc,
    icon_callouts: s.iconLabels,
    photo: s.photoAsset ? { id: s.photoAsset.id, name: s.photoAsset.name, url: s.photoAsset.url } : null,
  }))

  return Response.json({
    sku: product.sku,
    name: product.productName,
    aplus_slots: aplusSlots,
    gallery_slots: gallerySlots,
  })
}

// PATCH /api/mcp/projects/[id]/products/[sku]  — update slot content
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; sku: string } },
) {
  if (!checkMcpAuth(req)) return unauthorized()

  const body = await req.json() as {
    slot_index: number
    is_gallery?: boolean
    title?: string
    desc?: string
    icon_callouts?: string[]
  }

  const { slot_index, is_gallery = false } = body
  if (typeof slot_index !== 'number') {
    return Response.json({ error: 'slot_index is required' }, { status: 400 })
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

  const slot = slots[slot_index]
  const updated: TemplateShareSlotState = {
    ...slot,
    title:      body.title       !== undefined ? body.title      : slot.title,
    desc:       body.desc        !== undefined ? body.desc       : slot.desc,
    iconLabels: body.icon_callouts !== undefined
      ? (body.icon_callouts.slice(0, 4).concat(['', '', '', '']).slice(0, 4) as [string, string, string, string])
      : slot.iconLabels,
  }

  const newSlots = [...slots]
  newSlots[slot_index] = updated

  const newTs: TemplateShareState = {
    ...ts,
    allSlots:        is_gallery ? ts.allSlots        : { ...ts.allSlots,        [productId]: newSlots },
    allGallerySlots: is_gallery ? { ...ts.allGallerySlots, [productId]: newSlots } : ts.allGallerySlots,
  }

  await saveTemplateState(admin, params.id, newTs)

  const label = is_gallery ? `g${slot_index + 1}` : `${String.fromCharCode(97 + slot_index)}1`
  return Response.json({ ok: true, updated_slot: label, title: updated.title, desc: updated.desc })
}
