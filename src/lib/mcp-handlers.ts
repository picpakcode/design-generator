// Shared MCP tool logic — used by both the remote /mcp endpoint and the
// internal /api/mcp/* routes (which are kept for the local Claude Desktop server).
// All functions take a userId so every query is scoped to that user.

import { createAdminClient } from '@/lib/supabase/admin'
import { searchAssets, getFolders } from '@/lib/canto'
import { loadTemplateState, saveTemplateState } from '@/lib/db'
import { parseCSV } from '@/lib/csv'
import type {
  TemplateShareState,
  TemplateShareSlotConfig,
  TemplateShareGalleryConfig,
  TemplateShareSlotState,
  UploadedAsset,
} from '@/types'
import type { BulkProduct } from '@/lib/csv'

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

function emptySlot(): TemplateShareSlotState {
  return { title: '', desc: '', iconLabels: ['', '', '', ''], iconCount: 3, photoAsset: undefined, iconAssets: [] }
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

export async function toolRenameProject(
  projectId: string, userId: string, name: string,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const { error } = await admin.from('projects').update({ name }).eq('id', projectId).eq('user_id', userId)
  if (error) return fail(error.message)
  return ok({ ok: true, name })
}

export async function toolDeleteProject(
  projectId: string, userId: string,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const { error } = await admin.from('projects').delete().eq('id', projectId).eq('user_id', userId)
  if (error) return fail(error.message)
  return ok({ ok: true, deleted: projectId })
}

export async function toolGetProjectSettings(projectId: string, userId: string): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
  if (!ts) return fail('Project not found or no template state')
  return ok({
    aplus_slots:     ts.aplusSlots,
    gallery_count:   ts.galleryCount,
    slot_configs:    ts.slotConfigs,
    gallery_configs: ts.galleryConfigs,
    logo:    ts.logoAsset    ? { id: ts.logoAsset.id,    name: ts.logoAsset.name,    url: ts.logoAsset.url    } : null,
    texture: ts.textureAsset ? { id: ts.textureAsset.id, name: ts.textureAsset.name, url: ts.textureAsset.url } : null,
  })
}

export async function toolSetProjectAsset(
  projectId: string, userId: string,
  assetType: 'logo' | 'texture',
  assetId: string, assetName: string, assetUrl: string,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
  if (!ts) return fail('Project not found or no template state')

  const asset: UploadedAsset = { id: assetId, name: assetName, url: assetUrl, type: 'image' }
  const newTs: TemplateShareState = {
    ...ts,
    logoAsset:    assetType === 'logo'    ? asset : ts.logoAsset,
    textureAsset: assetType === 'texture' ? asset : ts.textureAsset,
  }
  await saveTemplateState(admin, projectId, newTs, userId)
  return ok({ ok: true, asset_type: assetType, asset: { id: assetId, name: assetName } })
}

export async function toolListProducts(projectId: string, userId: string): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
  if (!ts?.products?.length) {
    return ok({ products: [], note: 'No Template Mode data — upload a CSV in the app first.' })
  }
  return ok({
    products: ts.products.map(p => ({
      sku: p.sku,
      name: p.productName,
      aplus_slots:   p.slots.length,
      gallery_slots: p.gallerySlots?.length ?? 0,
    })),
  })
}

export async function toolAddProduct(
  projectId: string, userId: string, sku: string, productName: string,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
  if (!ts) return fail('Project not found or no template state')
  if (!ts.products?.length) return fail('Project has no template state yet — upload a CSV in the app first to initialize the template.')
  if (ts.products.some(p => p.sku === sku)) return fail(`SKU "${sku}" already exists`)

  const rowIndex  = ts.products.length
  const productId = `${sku}-${rowIndex}`

  const newProduct = {
    id:          productId,
    sku,
    productName,
    photos:      [],
    slots:       Array.from({ length: ts.aplusSlots   }, () => ({ title: '', desc: '', iconCallouts: ['', '', '', ''] as [string, string, string, string] })),
    gallerySlots: Array.from({ length: ts.galleryCount }, () => ({ title: '', desc: '', iconCallouts: ['', '', '', ''] as [string, string, string, string] })),
    warnings:    [],
  }

  const newTs: TemplateShareState = {
    ...ts,
    products:        [...ts.products, newProduct],
    allSlots:        { ...ts.allSlots,        [productId]: Array.from({ length: ts.aplusSlots   }, emptySlot) },
    allGallerySlots: { ...ts.allGallerySlots,  [productId]: Array.from({ length: ts.galleryCount }, emptySlot) },
  }

  await saveTemplateState(admin, projectId, newTs, userId)
  return ok({ ok: true, sku, product_id: productId, aplus_slots: ts.aplusSlots, gallery_slots: ts.galleryCount })
}

export async function toolRemoveProduct(
  projectId: string, userId: string, sku: string,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
  if (!ts) return fail('Project not found or no template state')

  const found = findProduct(ts, sku)
  if (!found) return fail(`SKU "${sku}" not found`)

  const { productId } = found
  const newAllSlots        = { ...ts.allSlots }
  const newAllGallerySlots = { ...ts.allGallerySlots }
  delete newAllSlots[productId]
  delete newAllGallerySlots[productId]

  await saveTemplateState(admin, projectId, {
    ...ts,
    products:        ts.products.filter(p => p.sku !== sku),
    allSlots:        newAllSlots,
    allGallerySlots: newAllGallerySlots,
  }, userId)
  return ok({ ok: true, removed: sku })
}

export async function toolGetProductSlots(projectId: string, userId: string, sku: string): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
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
  projectId: string, userId: string, sku: string,
  slotIndex: number, isGallery: boolean,
  title?: string, desc?: string, iconCallouts?: string[],
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
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
    title:      title        !== undefined ? title       : slot.title,
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

  await saveTemplateState(admin, projectId, newTs, userId)
  const label = isGallery ? `g${slotIndex + 1}` : `${String.fromCharCode(97 + slotIndex)}1`
  return ok({ ok: true, updated_slot: label, title: updated.title, desc: updated.desc })
}

export async function toolBulkUpdateSlots(
  projectId: string, userId: string,
  slotIndex: number, isGallery: boolean,
  title?: string, desc?: string, iconCallouts?: string[], skus?: string[],
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
  if (!ts) return fail('Project not found or no template state')

  const targets = skus?.length ? ts.products.filter(p => skus.includes(p.sku)) : ts.products
  if (!targets.length) return fail('No matching products found')

  const newSlotMap = { ...(isGallery ? ts.allGallerySlots : ts.allSlots) }
  const updated: string[] = []
  const skipped: string[] = []

  for (const product of targets) {
    const slots: TemplateShareSlotState[] = newSlotMap[product.id] ?? []
    if (slotIndex < 0 || slotIndex >= slots.length) { skipped.push(product.sku); continue }

    const slot = slots[slotIndex]
    const newSlot: TemplateShareSlotState = {
      ...slot,
      title:      title        !== undefined ? title       : slot.title,
      desc:       desc         !== undefined ? desc        : slot.desc,
      iconLabels: iconCallouts !== undefined
        ? (iconCallouts.slice(0, 4).concat(['', '', '', '']).slice(0, 4) as [string, string, string, string])
        : slot.iconLabels,
    }
    const newSlots = [...slots]
    newSlots[slotIndex] = newSlot
    newSlotMap[product.id] = newSlots
    updated.push(product.sku)
  }

  const newTs: TemplateShareState = {
    ...ts,
    allSlots:        isGallery ? ts.allSlots        : newSlotMap,
    allGallerySlots: isGallery ? newSlotMap          : ts.allGallerySlots,
  }

  await saveTemplateState(admin, projectId, newTs, userId)
  const label = isGallery ? `g${slotIndex + 1}` : `${String.fromCharCode(97 + slotIndex)}1`
  return ok({ ok: true, slot: label, updated_count: updated.length, skus: updated, ...(skipped.length ? { skipped } : {}) })
}

export async function toolClearSlot(
  projectId: string, userId: string, sku: string,
  slotIndex: number, isGallery: boolean,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
  if (!ts) return fail('Project not found or no template state')

  const found = findProduct(ts, sku)
  if (!found) return fail(`SKU "${sku}" not found`)

  const { productId } = found
  const slotMap = isGallery ? ts.allGallerySlots : ts.allSlots
  const slots: TemplateShareSlotState[] = slotMap[productId] ?? []

  if (slotIndex < 0 || slotIndex >= slots.length) {
    return fail(`slot_index ${slotIndex} out of range (0–${slots.length - 1})`)
  }

  const cleared: TemplateShareSlotState = { ...emptySlot(), iconCount: slots[slotIndex].iconCount }
  const newSlots = [...slots]
  newSlots[slotIndex] = cleared

  const newTs: TemplateShareState = {
    ...ts,
    allSlots:        isGallery ? ts.allSlots        : { ...ts.allSlots,        [productId]: newSlots },
    allGallerySlots: isGallery ? { ...ts.allGallerySlots, [productId]: newSlots } : ts.allGallerySlots,
  }

  await saveTemplateState(admin, projectId, newTs, userId)
  const label = isGallery ? `g${slotIndex + 1}` : `${String.fromCharCode(97 + slotIndex)}1`
  return ok({ ok: true, cleared: label, sku })
}

export async function toolSetSlotConfig(
  projectId: string, userId: string,
  slotIndex: number, isGallery: boolean, template: string,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
  if (!ts) return fail('Project not found or no template state')

  if (isGallery) {
    const configs = [...(ts.galleryConfigs ?? [])]
    if (slotIndex < 0 || slotIndex >= configs.length) return fail(`Gallery slot ${slotIndex} out of range (0–${configs.length - 1})`)
    configs[slotIndex] = { ...configs[slotIndex], template }
    await saveTemplateState(admin, projectId, { ...ts, galleryConfigs: configs }, userId)
  } else {
    const configs = [...(ts.slotConfigs ?? [])]
    if (slotIndex < 0 || slotIndex >= configs.length) return fail(`Slot ${slotIndex} out of range (0–${configs.length - 1})`)
    configs[slotIndex] = { ...configs[slotIndex], template }
    await saveTemplateState(admin, projectId, { ...ts, slotConfigs: configs }, userId)
  }

  const label = isGallery ? `g${slotIndex + 1}` : `${String.fromCharCode(97 + slotIndex)}1`
  return ok({ ok: true, slot: label, template })
}

export async function toolUpdateProductName(
  projectId: string, userId: string, sku: string, name: string,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
  if (!ts) return fail('Project not found or no template state')

  const found = findProduct(ts, sku)
  if (!found) return fail(`SKU "${sku}" not found`)

  const { product, idx } = found
  const newProducts = [...ts.products]
  newProducts[idx] = { ...product, productName: name }
  const newProductNames = { ...(ts.productNames ?? {}), [product.id]: name }

  await saveTemplateState(admin, projectId, { ...ts, products: newProducts, productNames: newProductNames }, userId)
  return ok({ ok: true, sku, name })
}

export async function toolAssignPhoto(
  projectId: string, userId: string, sku: string,
  slotIndex: number, isGallery: boolean,
  assetId: string, assetName: string, assetUrl: string,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
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

  await saveTemplateState(admin, projectId, newTs, userId)
  const label = isGallery ? `g${slotIndex + 1}` : `${String.fromCharCode(97 + slotIndex)}1`
  return ok({ ok: true, assigned_to: label, photo: { id: assetId, name: assetName } })
}

// ─── CSV → TemplateShareState (mirrors TemplateMode.tsx initialization) ───────

function buildTemplateStateFromProducts(
  products: BulkProduct[],
  projectType: 'amazon' | 'shopify',
): TemplateShareState {
  const isShopify = projectType === 'shopify'
  const first      = products[0]

  const aplusSlots   = isShopify ? 0 : Math.max(1, first?.slots.length ?? 5)
  const galleryCount = Math.max(isShopify ? 1 : 0, first?.gallerySlots?.length ?? (isShopify ? 3 : 0))

  const allSlots: Record<string, TemplateShareSlotState[]> = {}
  for (const product of products) {
    allSlots[product.id] = Array.from({ length: aplusSlots }, (_, j) => {
      const s        = product.slots[j]
      const callouts = (s?.iconCallouts ?? ['', '', '', '']) as [string, string, string, string]
      const filled   = callouts.filter(Boolean).length
      return {
        title:      s?.title ? `<p>${s.title}</p>` : '',
        desc:       s?.desc  ? `<p>${s.desc}</p>`  : '',
        iconLabels: callouts,
        iconCount:  (Math.min(Math.max(filled, 2), 4)) as 2 | 3 | 4,
        photoAsset: undefined,
        iconAssets: [],
      }
    })
  }

  const allGallerySlots: Record<string, TemplateShareSlotState[]> = {}
  for (const product of products) {
    allGallerySlots[product.id] = Array.from({ length: galleryCount }, (_, g) => {
      const s        = product.gallerySlots?.[g]
      const callouts = (s?.iconCallouts ?? ['', '', '', '']) as [string, string, string, string]
      const filled   = callouts.filter(Boolean).length
      return {
        title:      s?.title ? `<p>${s.title}</p>` : '',
        desc:       s?.desc  ? `<p>${s.desc}</p>`  : '',
        iconLabels: callouts,
        iconCount:  (Math.min(Math.max(filled, 2), 4)) as 2 | 3 | 4,
        photoAsset: undefined,
        iconAssets: [],
      }
    })
  }

  // Auto-detect slot template from first product's content
  const slotConfigs: TemplateShareSlotConfig[] = Array.from({ length: aplusSlots }, (_, j) => {
    const s        = first?.slots[j]
    const hasIcons = s?.iconCallouts.some(Boolean) ?? false
    const hasDesc  = Boolean(s?.desc)
    let template: string
    if (hasIcons && hasDesc)  template = 'icons-text'
    else if (hasIcons)        template = 'icons'
    else if (j % 2 === 0)    template = '5050-right'
    else                      template = '5050-left'
    return { template }
  })

  const galleryConfigs: TemplateShareGalleryConfig[] = Array.from({ length: galleryCount }, (_, g) => {
    const s        = first?.gallerySlots?.[g]
    const hasIcons = s?.iconCallouts.some(Boolean) ?? false
    const hasDesc  = Boolean(s?.desc)
    let template: string
    if (hasIcons && hasDesc) template = 'gallery-icons-text'
    else if (hasIcons)       template = 'gallery-icons'
    else                     template = 'gallery-hero'
    return { template }
  })

  return {
    products,
    allSlots,
    allGallerySlots,
    slotConfigs,
    galleryConfigs,
    aplusSlots,
    galleryCount,
    logoAsset:    null,
    textureAsset: null,
    productNames: {},
  }
}

export async function toolCreateProject(
  userId: string, name: string, projectType: 'amazon' | 'shopify',
): Promise<ToolResult> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('projects')
    .insert({ user_id: userId, name, project_type: projectType, state: null })
    .select('id')
    .single()
  if (error || !data) return fail(error?.message ?? 'Failed to create project')
  return ok({ ok: true, project_id: data.id, name, type: projectType })
}

export async function toolImportCsv(
  projectId: string, userId: string, csvText: string, projectType: 'amazon' | 'shopify',
): Promise<ToolResult> {
  const admin = createAdminClient()

  // Verify project ownership
  const { data: proj, error: projErr } = await admin
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single()
  if (projErr || !proj) return fail('Project not found or access denied')

  const isShopify = projectType === 'shopify'
  const result    = parseCSV(csvText, { requireSku: false, shopify: isShopify })

  if (result.errors.length > 0) return fail(`CSV errors: ${result.errors.join(', ')}`)
  if (!result.products.length)  return fail('No products found in CSV')

  // Preserve any existing project-level assets and export settings
  const existing  = await loadTemplateState(admin, projectId, userId)
  const newTs     = buildTemplateStateFromProducts(result.products, projectType)
  const merged: TemplateShareState = {
    ...newTs,
    logoAsset:       existing?.logoAsset    ?? null,
    textureAsset:    existing?.textureAsset ?? null,
    exportAlbumId:   existing?.exportAlbumId,
    exportAlbumName: existing?.exportAlbumName,
  }

  await saveTemplateState(admin, projectId, merged, userId)

  const warnings = result.products.flatMap(p => p.warnings.map(w => `${p.sku}: ${w}`))
  return ok({
    ok:           true,
    project_name: proj.name,
    products:     result.products.length,
    aplus_slots:  newTs.aplusSlots,
    gallery_slots: newTs.galleryCount,
    slot_configs:  newTs.slotConfigs,
    gallery_configs: newTs.galleryConfigs,
    skus:         result.products.map(p => p.sku),
    ...(warnings.length ? { warnings } : {}),
  })
}

export async function toolSetExportAlbum(
  projectId: string, userId: string, albumId: string, albumName: string,
): Promise<ToolResult> {
  const admin = createAdminClient()
  const ts = await loadTemplateState(admin, projectId, userId)
  if (!ts) return fail('Project not found or no template state')

  await saveTemplateState(admin, projectId, { ...ts, exportAlbumId: albumId, exportAlbumName: albumName }, userId)
  return ok({ ok: true, album_id: albumId, album_name: albumName, note: 'Album saved. When you export from the app, select this album in the export dialog.' })
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
    full_url:    a.url?.directUrlOriginal ?? '',
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
      // ── Projects ──────────────────────────────────────────────────────────
      case 'list_projects':
        return await toolListProjects(userId)

      case 'create_project':
        return await toolCreateProject(userId, String(args.name), (args.project_type as 'amazon' | 'shopify') ?? 'amazon')

      case 'import_csv':
        return await toolImportCsv(
          String(args.project_id), userId, String(args.csv_text),
          (args.project_type as 'amazon' | 'shopify') ?? 'amazon',
        )

      case 'rename_project':
        return await toolRenameProject(String(args.project_id), userId, String(args.name))

      case 'delete_project':
        return await toolDeleteProject(String(args.project_id), userId)

      case 'get_project_settings':
        return await toolGetProjectSettings(String(args.project_id), userId)

      case 'set_export_album':
        return await toolSetExportAlbum(
          String(args.project_id), userId, String(args.album_id), String(args.album_name),
        )

      case 'set_project_asset':
        return await toolSetProjectAsset(
          String(args.project_id), userId,
          args.asset_type as 'logo' | 'texture',
          String(args.canto_asset_id), String(args.canto_asset_name), String(args.canto_asset_url),
        )

      // ── Products ──────────────────────────────────────────────────────────
      case 'list_products':
        return await toolListProducts(String(args.project_id), userId)

      case 'add_product':
        return await toolAddProduct(
          String(args.project_id), userId, String(args.sku), String(args.product_name),
        )

      case 'remove_product':
        return await toolRemoveProduct(String(args.project_id), userId, String(args.sku))

      case 'get_product_slots':
        return await toolGetProductSlots(String(args.project_id), userId, String(args.sku))

      case 'update_product_name':
        return await toolUpdateProductName(
          String(args.project_id), userId, String(args.sku), String(args.name),
        )

      // ── Slots ─────────────────────────────────────────────────────────────
      case 'update_product_slot':
        return await toolUpdateProductSlot(
          String(args.project_id), userId, String(args.sku),
          Number(args.slot_index), Boolean(args.is_gallery ?? false),
          args.title        as string | undefined,
          args.desc         as string | undefined,
          args.icon_callouts as string[] | undefined,
        )

      case 'bulk_update_slots':
        return await toolBulkUpdateSlots(
          String(args.project_id), userId,
          Number(args.slot_index), Boolean(args.is_gallery ?? false),
          args.title        as string | undefined,
          args.desc         as string | undefined,
          args.icon_callouts as string[] | undefined,
          args.skus         as string[] | undefined,
        )

      case 'clear_slot':
        return await toolClearSlot(
          String(args.project_id), userId, String(args.sku),
          Number(args.slot_index), Boolean(args.is_gallery ?? false),
        )

      case 'set_slot_config':
        return await toolSetSlotConfig(
          String(args.project_id), userId,
          Number(args.slot_index), Boolean(args.is_gallery ?? false),
          String(args.template),
        )

      // ── Photos ────────────────────────────────────────────────────────────
      case 'assign_photo':
        return await toolAssignPhoto(
          String(args.project_id), userId, String(args.sku),
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
