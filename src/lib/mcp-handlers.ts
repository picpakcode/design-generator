// Shared MCP tool logic — used by both the remote /mcp endpoint and the
// internal /api/mcp/* routes (which are kept for the local Claude Desktop server).
// All functions take a userId so every query is scoped to that user.

import { createAdminClient } from '@/lib/supabase/admin'
import { searchAssets, getFolders } from '@/lib/canto'
import { loadTemplateState, saveTemplateState } from '@/lib/db'
import type { TemplateShareState, TemplateShareSlotState, UploadedAsset } from '@/types'

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function fail(msg: string): ToolResult {
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true }
}

function findProduct(ts: TemplateShareState, sku: string) {
  const idx = ts.products.findIndex(p => p.sku === sku)
  if (idx === -1) return null
  return { product: ts.products[idx], productId: ts.products[idx].id, idx }
}

const LIFESTYLE_TAGS = new Set(['lifestyle', 'photoshoot'])

// ─── Tool implementations ─────────────────────────────────────────────────────

export async function toolListProjects(userId: string): Promise<ToolResult> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('projects')
    .select('id, name, project_type, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) return fail(error.message)
  return ok((data ?? []).map(p => ({
    id: p.id,
    name: p.name,
    type: p.project_type ?? 'amazon',
    updated_at: p.updated_at,
  })))
}

export async function toolListProducts(projectId: string): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId)
  if (!ts?.products?.length) {
    return ok({ products: [], note: 'No Template Mode data — upload a CSV in the app first.' })
  }
  return ok({
    products: ts.products.map(p => ({
      sku: p.sku,
      name: p.productName,
      aplus_slots: p.slots.length,
      gallery_slots: p.gallerySlots?.length ?? 0,
    })),
  })
}

export async function toolGetProductSlots(projectId: string, sku: string): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId)
  if (!ts) return fail('Project not found or no template state')

  const found = findProduct(ts, sku)
  if (!found) return fail(`SKU "${sku}" not found`)

  const { product, productId } = found
  const aplusSlots = (ts.allSlots[productId] ?? []).map((s, i) => ({
    index: i, label: `${String.fromCharCode(97 + i)}1`,
    title: s.title, desc: s.desc, icon_callouts: s.iconLabels,
    photo: s.photoAsset ? { id: s.photoAsset.id, name: s.photoAsset.name, url: s.photoAsset.url } : null,
  }))
  const gallerySlots = (ts.allGallerySlots[productId] ?? []).map((s, i) => ({
    index: i, label: `g${i + 1}`,
    title: s.title, desc: s.desc, icon_callouts: s.iconLabels,
    photo: s.photoAsset ? { id: s.photoAsset.id, name: s.photoAsset.name, url: s.photoAsset.url } : null,
  }))
  return ok({ sku: product.sku, name: product.productName, aplus_slots: aplusSlots, gallery_slots: gallerySlots })
}

export async function toolUpdateProductSlot(
  projectId: string, sku: string,
  slotIndex: number, isGallery: boolean,
  title?: string, desc?: string, iconCallouts?: string[],
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId)
  if (!ts) return fail('Project not found or no template state')

  const found = findProduct(ts, sku)
  if (!found) return fail(`SKU "${sku}" not found`)

  const { productId } = found
  const slotMap = isGallery ? ts.allGallerySlots : ts.allSlots
  const slots: TemplateShareSlotState[] = slotMap[productId] ?? []

  if (slotIndex < 0 || slotIndex >= slots.length) {
    return fail(`slot_index ${slotIndex} out of range (0–${slots.length - 1})`)
  }

  const slot = slots[slotIndex]
  const updated: TemplateShareSlotState = {
    ...slot,
    title:      title        !== undefined ? title      : slot.title,
    desc:       desc         !== undefined ? desc        : slot.desc,
    iconLabels: iconCallouts !== undefined
      ? (iconCallouts.slice(0, 4).concat(['', '', '', '']).slice(0, 4) as [string, string, string, string])
      : slot.iconLabels,
  }

  const newSlots = [...slots]
  newSlots[slotIndex] = updated
  const newTs: TemplateShareState = {
    ...ts,
    allSlots:        isGallery ? ts.allSlots        : { ...ts.allSlots,        [productId]: newSlots },
    allGallerySlots: isGallery ? { ...ts.allGallerySlots, [productId]: newSlots } : ts.allGallerySlots,
  }

  await saveTemplateState(admin, projectId, newTs)
  const label = isGallery ? `g${slotIndex + 1}` : `${String.fromCharCode(97 + slotIndex)}1`
  return ok({ ok: true, updated_slot: label, title: updated.title, desc: updated.desc })
}

export async function toolUpdateProductName(
  projectId: string, sku: string, name: string,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId)
  if (!ts) return fail('Project not found or no template state')

  const found = findProduct(ts, sku)
  if (!found) return fail(`SKU "${sku}" not found`)

  const { product, idx } = found
  const newProducts = [...ts.products]
  newProducts[idx] = { ...product, productName: name }
  const newProductNames = { ...(ts.productNames ?? {}), [product.id]: name }

  await saveTemplateState(admin, projectId, { ...ts, products: newProducts, productNames: newProductNames })
  return ok({ ok: true, sku, name })
}

export async function toolAssignPhoto(
  projectId: string, sku: string,
  slotIndex: number, isGallery: boolean,
  assetId: string, assetName: string, assetUrl: string,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId)
  if (!ts) return fail('Project not found or no template state')

  const found = findProduct(ts, sku)
  if (!found) return fail(`SKU "${sku}" not found`)

  const { productId } = found
  const slotMap = isGallery ? ts.allGallerySlots : ts.allSlots
  const slots: TemplateShareSlotState[] = slotMap[productId] ?? []

  if (slotIndex < 0 || slotIndex >= slots.length) {
    return fail(`slot_index ${slotIndex} out of range (0–${slots.length - 1})`)
  }

  const photoAsset: UploadedAsset = { id: assetId, name: assetName, url: assetUrl, type: 'image' }
  const newSlots = [...slots]
  newSlots[slotIndex] = { ...slots[slotIndex], photoAsset }

  const newTs: TemplateShareState = {
    ...ts,
    allSlots:        isGallery ? ts.allSlots        : { ...ts.allSlots,        [productId]: newSlots },
    allGallerySlots: isGallery ? { ...ts.allGallerySlots, [productId]: newSlots } : ts.allGallerySlots,
  }

  await saveTemplateState(admin, projectId, newTs)
  const label = isGallery ? `g${slotIndex + 1}` : `${String.fromCharCode(97 + slotIndex)}1`
  return ok({ ok: true, assigned_to: label, photo: { id: assetId, name: assetName } })
}

export async function toolSearchCanto(query: string, limit: number): Promise<ToolResult> {
  const assets = await searchAssets(query, limit * 2)
  const images = assets.filter(a => a.scheme === 'image')
  const isLifestyle = (a: typeof images[number]) =>
    [...(a.tag ?? []), ...(a.keyword ?? [])].some(t => LIFESTYLE_TAGS.has(t.toLowerCase()))
  const sorted = [...images.filter(isLifestyle), ...images.filter(a => !isLifestyle(a))].slice(0, limit)
  return ok(sorted.map(a => ({
    id: a.id, name: a.name, tags: a.tag ?? [], keywords: a.keyword ?? [],
    width: a.width, height: a.height,
    preview_url: a.url?.directUrlPreview ?? a.url?.preview ?? '',
    full_url: a.url?.directUrlOriginal ?? '',
  })))
}

export async function toolListCantoAlbums(): Promise<ToolResult> {
  const folders = await getFolders()
  return ok(folders)
}

// ─── Central dispatcher ───────────────────────────────────────────────────────

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'list_projects':
        return await toolListProjects(userId)

      case 'list_products':
        return await toolListProducts(String(args.project_id))

      case 'get_product_slots':
        return await toolGetProductSlots(String(args.project_id), String(args.sku))

      case 'update_product_slot':
        return await toolUpdateProductSlot(
          String(args.project_id), String(args.sku),
          Number(args.slot_index), Boolean(args.is_gallery ?? false),
          args.title as string | undefined,
          args.desc as string | undefined,
          args.icon_callouts as string[] | undefined,
        )

      case 'update_product_name':
        return await toolUpdateProductName(
          String(args.project_id), String(args.sku), String(args.name),
        )

      case 'assign_photo':
        return await toolAssignPhoto(
          String(args.project_id), String(args.sku),
          Number(args.slot_index ?? 0), Boolean(args.is_gallery ?? false),
          String(args.canto_asset_id), String(args.canto_asset_name), String(args.canto_asset_url),
        )

      case 'search_canto':
        return await toolSearchCanto(String(args.query), Math.min(Number(args.limit ?? 20), 100))

      case 'list_canto_albums':
        return await toolListCantoAlbums()

      default:
        return fail(`Unknown tool: ${name}`)
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
}
