'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { toPng, toJpeg } from 'html-to-image'
import { BulkProduct, ParseResult, parseCSV } from '@/lib/csv'
import { DesignState, UploadedAsset } from '@/types'
import { CanvasContent, CanvasContentIcons, CanvasContentGallery, CanvasContentGalleryIcons } from './CanvasRenderers'
import CantoPhotoPickerModal, { PhotoPick } from './CantoPhotoPickerModal'
import CantoIconPickerModal from './CantoIconPickerModal'
import type { CantoPick } from './CantoAssetPicker'
import { FolderConfig } from '@/lib/canto-folders'

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotTemplate = '5050-right' | '5050-left' | 'icons'
interface SlotConfig { template: SlotTemplate }

interface TemplateSlotAssets {
  photoAsset?: UploadedAsset
  iconAssets: (UploadedAsset | undefined)[]
}

type ProductStatus = 'draft' | 'rendering' | 'done' | 'error'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LOGO_ID    = 'gjj53olkh15rd0vdvpq29ngf75'
const DEFAULT_LOGO_NAME  = 'DocsDiesel-Logo-Wordmark-RedWhite-Vector 1'
const DEFAULT_LOGO_ALBUM = 'QH34D'

const TEMPLATE_LABELS: Record<SlotTemplate, string> = {
  '5050-right': 'Img | Txt',
  '5050-left':  'Txt | Img',
  icons:        'Icons',
}

function slotLabel(i: number) { return String.fromCharCode(65 + i) + '1' }  // A1, B1…

function defaultSlotConfigs(n: number): SlotConfig[] {
  return Array.from({ length: n }, (_, i) => ({
    template: i === 1 ? 'icons' : (i % 2 === 0 ? '5050-right' : '5050-left'),
  }))
}

function emptySlotAssets(): TemplateSlotAssets {
  return { iconAssets: [undefined, undefined, undefined, undefined] }
}

// ─── Capture helper ───────────────────────────────────────────────────────────

async function captureToDataUrl(
  element: React.ReactElement,
  width: number,
  height: number,
  format: 'png' | 'jpeg',
): Promise<string | null> {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:fixed;top:-${height + 100}px;left:0;pointer-events:none;`
  document.body.appendChild(wrapper)
  const div = document.createElement('div')
  div.style.cssText = `width:${width}px;height:${height}px;overflow:hidden;position:relative;`
  wrapper.appendChild(div)
  const root = createRoot(div)
  flushSync(() => root.render(element))
  const imgs = Array.from(div.querySelectorAll('img'))
  await Promise.all(imgs.map(img =>
    img.complete ? Promise.resolve()
      : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() })
  ))
  try {
    const opts = { includeQueryParams: true, onImageErrorHandler: () => {} }
    return format === 'jpeg'
      ? await toJpeg(div, { quality: 0.95, backgroundColor: '#ffffff', ...opts })
      : await toPng(div, opts)
  } catch { return null }
  finally { root.unmount(); document.body.removeChild(wrapper) }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TemplateModeProps {
  designState: DesignState
  folderConfig: FolderConfig
  exportFnRef: React.MutableRefObject<() => void>
  onCanExportChange: (can: boolean) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TemplateMode({ designState, folderConfig, exportFnRef, onCanExportChange }: TemplateModeProps) {
  // CSV
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [csvFilename, setCsvFilename] = useState('')
  const [isDragging, setIsDragging]   = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Product selection
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [activeSlotIdx, setActiveSlotIdx] = useState(0)

  // Per-product per-slot asset selections
  const [allAssets, setAllAssets] = useState<Record<string, TemplateSlotAssets[]>>({})

  // Per-product render status
  const [statuses, setStatuses] = useState<Record<string, ProductStatus>>({})

  // Slot config
  const [aplusSlots, setAplusSlots]         = useState(5)
  const [slotConfigs, setSlotConfigs]       = useState<SlotConfig[]>(defaultSlotConfigs(5))
  const [includeGallery, setIncludeGallery] = useState(true)
  const [outputFormat, setOutputFormat]     = useState<'png' | 'jpeg'>('png')

  // Branding defaults
  const [logoAsset, setLogoAsset]       = useState<UploadedAsset | null>(null)
  const [textureAsset, setTextureAsset] = useState<UploadedAsset | null>(null)

  // Picker modals
  const [photoPickerOpen, setPhotoPickerOpen]   = useState(false)
  const [photoPickerQuery, setPhotoPickerQuery] = useState('')
  const [iconPickerOpen, setIconPickerOpen]     = useState(false)
  const [iconPickerSlotIdx, setIconPickerSlotIdx] = useState(0)   // which icon position (0–3)

  // Render state
  const [renderingAll, setRenderingAll] = useState(false)
  const capturedRef = useRef<Map<string, string>>(new Map())
  const cancelRef   = useRef(false)

  // ── Init ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/canto/folder?albumId=${DEFAULT_LOGO_ALBUM}`)
      .then(r => r.json())
      .then((items: { id: string; name: string; previewUrl: string }[]) => {
        const logo = items.find(i => i.id === DEFAULT_LOGO_ID) ?? items.find(i => i.name === DEFAULT_LOGO_NAME)
        if (logo) setLogoAsset({ id: logo.id, name: logo.name, url: logo.previewUrl, type: 'image' })
      })
      .catch(() => {})

    // Inherit texture from active Design tab block
    const blocks = [...(designState.blocks ?? []), ...(designState.galleryBlocks ?? [])]
    const active  = designState.blocks?.find(b => b.id === designState.activeBlockId)
    const tex     = (active?.assets ?? blocks[0]?.assets ?? designState.assets)?.[1]
    if (tex?.url) setTextureAsset(tex)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSlotConfigs(prev => defaultSlotConfigs(aplusSlots).map((d, i) => prev[i] ?? d))
  }, [aplusSlots])

  // ── CSV ───────────────────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) return
    setCsvFilename(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const result = parseCSV(e.target?.result as string, { requireSku: false })
      setParseResult(result)
      setSelectedId(result.products[0]?.id ?? null)
      setActiveSlotIdx(0)
      setAllAssets({})
      setStatuses({})
      capturedRef.current.clear()
      onCanExportChange(false)
    }
    reader.readAsText(file)
  }, [onCanExportChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])

  const handleClear = () => {
    setParseResult(null); setCsvFilename(''); setSelectedId(null)
    setAllAssets({}); setStatuses({}); capturedRef.current.clear()
    onCanExportChange(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Asset helpers ─────────────────────────────────────────────────────────────

  function getSlotAssets(productId: string, slotIdx: number): TemplateSlotAssets {
    return allAssets[productId]?.[slotIdx] ?? emptySlotAssets()
  }

  function patchSlotAssets(productId: string, slotIdx: number, patch: Partial<TemplateSlotAssets>) {
    setAllAssets(prev => {
      const existing = prev[productId] ?? Array.from({ length: aplusSlots }, emptySlotAssets)
      const updated  = existing.map((s, i) => i === slotIdx ? { ...s, ...patch } : s)
      return { ...prev, [productId]: updated }
    })
    // Invalidate renders for this product on asset change
    setStatuses(prev => ({ ...prev, [productId]: 'draft' }))
    Array.from(capturedRef.current.keys())
      .filter(k => k.startsWith(`${productId}/`))
      .forEach(k => capturedRef.current.delete(k))
    onCanExportChange(capturedRef.current.size > 0)
  }

  function fallbackAsset(slotIndex: number): UploadedAsset | undefined {
    const blocks = [...(designState.blocks ?? []), ...(designState.galleryBlocks ?? [])]
    const active  = designState.blocks?.find(b => b.id === designState.activeBlockId)
    const seen    = new Set<string>()
    for (const b of [...(active ? [active] : []), ...blocks]) {
      if (seen.has(b.id)) continue; seen.add(b.id)
      const a = (b.assets ?? [])[slotIndex]; if (a?.url) return a
    }
    return undefined
  }

  function buildSlotDesign(product: BulkProduct, slotIdx: number): DesignState {
    const slot     = product.slots[slotIdx]
    const assets_  = getSlotAssets(product.id, slotIdx)
    const callouts = (slot?.iconCallouts ?? ['', '', '', '']) as [string, string, string, string]
    const filled    = callouts.filter(Boolean).length
    const iconCount = (Math.min(Math.max(filled, 2), 4)) as 2 | 3 | 4
    return {
      ...designState,
      assets: [
        assets_.photoAsset,
        textureAsset ?? fallbackAsset(1),
        logoAsset    ?? fallbackAsset(2),
        assets_.iconAssets[0],
        assets_.iconAssets[1],
        assets_.iconAssets[2],
        assets_.iconAssets[3],
      ] as UploadedAsset[],
      title:        `<p>${slot?.title ?? ''}</p>`,
      subtitleHtml: slot?.desc ? `<p>${slot.desc}</p>` : '',
      iconLabels:   callouts,
      iconCount,
    }
  }

  // ── Render one product ────────────────────────────────────────────────────────

  const renderProduct = async (product: BulkProduct) => {
    setStatuses(prev => ({ ...prev, [product.id]: 'rendering' }))
    Array.from(capturedRef.current.keys())
      .filter(k => k.startsWith(`${product.id}/`))
      .forEach(k => capturedRef.current.delete(k))

    for (let j = 0; j < aplusSlots; j++) {
      if (cancelRef.current) break
      const cfg    = slotConfigs[j] ?? { template: '5050-right' }
      const flip   = cfg.template === '5050-left'
      const isIcons = cfg.template === 'icons'
      const sd     = buildSlotDesign(product, j)
      const lbl    = slotLabel(j).toLowerCase()  // a1, b1…

      const dt = isIcons
        ? <CanvasContentIcons design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
        : <CanvasContent      design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
      const d = await captureToDataUrl(dt, 1464, 600, outputFormat)
      if (d) capturedRef.current.set(`${product.id}/${lbl}-desktop`, d)

      const mt = isIcons
        ? <CanvasContentIcons design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
        : <CanvasContent      design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
      const m = await captureToDataUrl(mt, 600, 450, outputFormat)
      if (m) capturedRef.current.set(`${product.id}/${lbl}-mobile`, m)

      if (includeGallery) {
        const gt = isIcons
          ? <CanvasContentGalleryIcons design={sd} settings={{ ...designState.gallery, layoutFlipped: false }} />
          : <CanvasContentGallery      design={sd} settings={{ ...designState.gallery, layoutFlipped: false }} />
        const g = await captureToDataUrl(gt, 1500, 1500, outputFormat)
        if (g) capturedRef.current.set(`${product.id}/gallery-${j + 1}`, g)
      }
    }

    const ok = !cancelRef.current
    setStatuses(prev => ({ ...prev, [product.id]: ok ? 'done' : 'draft' }))
    onCanExportChange(capturedRef.current.size > 0)
  }

  // ── Render all products sequentially ─────────────────────────────────────────

  const renderAll = async () => {
    if (renderingAll) { cancelRef.current = true; return }
    const prods = parseResult?.products ?? []
    if (prods.length === 0) return
    cancelRef.current = false
    setRenderingAll(true)
    for (const p of prods) {
      if (cancelRef.current) break
      await renderProduct(p)
    }
    setRenderingAll(false)
  }

  // ── Export ZIP ────────────────────────────────────────────────────────────────

  const handleExportAll = useCallback(async () => {
    if (capturedRef.current.size === 0) return
    const JSZip = (await import('jszip')).default
    const zip   = new JSZip()
    const ext   = outputFormat === 'jpeg' ? 'jpg' : 'png'
    const prods = parseResult?.products ?? []
    capturedRef.current.forEach((dataUrl, key) => {
      const slash = key.indexOf('/')
      const pid   = key.slice(0, slash)
      const lbl   = key.slice(slash + 1)
      const name  = prods.find(p => p.id === pid)?.productName || pid
      zip.folder(name)!.file(`${lbl}.${ext}`, dataUrl.split(',')[1], { base64: true })
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: 'template-export.zip',
    })
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }, [outputFormat, parseResult])

  const handleExportProduct = useCallback(async (product: BulkProduct) => {
    const entries = Array.from(capturedRef.current.entries()).filter(([k]) => k.startsWith(`${product.id}/`))
    if (entries.length === 0) return
    const JSZip = (await import('jszip')).default
    const zip   = new JSZip()
    const ext   = outputFormat === 'jpeg' ? 'jpg' : 'png'
    entries.forEach(([k, d]) => {
      const lbl = k.slice(k.indexOf('/') + 1)
      zip.file(`${lbl}.${ext}`, d.split(',')[1], { base64: true })
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const name  = product.productName || product.id
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: `${name}.zip`,
    })
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }, [outputFormat])

  // Expose export fn to header button
  useEffect(() => { exportFnRef.current = handleExportAll })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onCanExportChange(capturedRef.current.size > 0) }, [statuses])

  // ── Derived ───────────────────────────────────────────────────────────────────

  const products          = parseResult?.products ?? []
  const selected          = products.find(p => p.id === selectedId) ?? null
  const activeCfg         = slotConfigs[activeSlotIdx] ?? { template: '5050-right' }
  const isIconsSlot       = activeCfg.template === 'icons'
  const selectedSlotAssets = selected ? getSlotAssets(selected.id, activeSlotIdx) : emptySlotAssets()
  const selectedStatus    = selected ? (statuses[selected.id] ?? 'draft') : 'draft'
  const selectedIdx       = selected ? products.indexOf(selected) : -1

  // Preview dimensions (desktop canvas = 1464×600)
  const PREVIEW_W     = 700
  const PREVIEW_SCALE = PREVIEW_W / 1464
  const PREVIEW_H     = Math.round(600 * PREVIEW_SCALE)
  const previewDesign = selected ? buildSlotDesign(selected, activeSlotIdx) : null

  // ─── Sub-components ───────────────────────────────────────────────────────────

  const StatusDot = ({ status }: { status: ProductStatus }) => {
    if (status === 'rendering') return (
      <svg className="animate-spin w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    )
    if (status === 'done') return (
      <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    )
    if (status === 'error') return (
      <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
    return <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 dark:border-gray-600 shrink-0" />
  }

  // ─── CSV upload state (no file yet) ──────────────────────────────────────────

  if (!parseResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12">
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full max-w-md rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-4 cursor-pointer transition-all ${
            isDragging ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Drop your CSV here</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
              Columns: <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">product_name</code>,{' '}
              <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">a1_title</code>,{' '}
              <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">a1_desc</code>,{' '}
              <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">b1_title</code>,{' '}
              <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">b1_icon1</code>…
            </p>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
      </div>
    )
  }

  // ─── Main two-pane layout ─────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── Left pane: product list ────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900">

        {/* CSV header */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 truncate">{csvFilename}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {products.length} product{products.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={handleClear} className="shrink-0 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            Clear
          </button>
        </div>

        {/* Settings */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-700 space-y-3">
          <div className="flex items-start gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Slots</p>
              <div className="flex gap-1">
                {[3, 4, 5].map(n => (
                  <button key={n} onClick={() => setAplusSlots(n)}
                    className={`w-8 h-7 rounded text-[11px] font-bold transition-all ${aplusSlots === n ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                  >{n}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Format</p>
              <div className="flex gap-1">
                {(['png', 'jpeg'] as const).map(f => (
                  <button key={f} onClick={() => setOutputFormat(f)}
                    className={`px-2.5 h-7 rounded text-[11px] font-bold transition-all ${outputFormat === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                  >{f.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer" onClick={() => setIncludeGallery(g => !g)}>
            <div className={`w-8 h-4 rounded-full relative transition-colors ${includeGallery ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${includeGallery ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-[11px] text-gray-600 dark:text-gray-400 select-none">Include gallery</span>
          </label>
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto py-2">
          {parseResult.errors.length > 0 && (
            <div className="mx-3 mb-2 p-2.5 bg-red-50 dark:bg-red-900/20 rounded-lg">
              {parseResult.errors.map((e, i) => (
                <p key={i} className="text-[10px] text-red-600 dark:text-red-400">{e}</p>
              ))}
            </div>
          )}
          {products.map((product, idx) => {
            const status    = statuses[product.id] ?? 'draft'
            const isSelected = product.id === selectedId
            return (
              <button
                key={product.id}
                onClick={() => { setSelectedId(product.id); setActiveSlotIdx(0) }}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                  isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <StatusDot status={status} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] font-semibold truncate ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    {product.productName || `Product ${idx + 1}`}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    {product.slots.length} slot{product.slots.length !== 1 ? 's' : ''}
                    {status === 'done' ? ' · Done' : status === 'rendering' ? ' · Rendering…' : ''}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Render all footer */}
        <div className="shrink-0 p-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={renderAll}
            className={`w-full h-9 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 ${
              renderingAll
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                : 'bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600'
            }`}
          >
            {renderingAll ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Cancel
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
                Render All
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── Right pane: configurator ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50 dark:bg-gray-950">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400 dark:text-gray-600">Select a product from the list</p>
          </div>
        ) : (
          <>
            {/* Product header */}
            <div className="shrink-0 px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 flex items-center gap-4">
              {/* Prev / Next navigation */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setSelectedId(products[selectedIdx - 1]?.id ?? null); setActiveSlotIdx(0) }}
                  disabled={selectedIdx <= 0}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => { setSelectedId(products[selectedIdx + 1]?.id ?? null); setActiveSlotIdx(0) }}
                  disabled={selectedIdx >= products.length - 1}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {selected.productName || 'Unnamed Product'}
                </h2>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  {selectedIdx + 1} of {products.length}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedStatus === 'done' && (
                  <button
                    onClick={() => handleExportProduct(selected)}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                )}
                <button
                  onClick={() => renderProduct(selected)}
                  disabled={selectedStatus === 'rendering'}
                  className="flex items-center gap-1.5 px-4 h-8 rounded-lg bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {selectedStatus === 'rendering' ? (
                    <>
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Rendering…
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                      </svg>
                      {selectedStatus === 'done' ? 'Re-render' : 'Render'}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Slot tabs */}
            <div className="shrink-0 px-6 pt-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
              <div className="flex gap-1">
                {slotConfigs.slice(0, aplusSlots).map((cfg, idx) => {
                  const isActive = idx === activeSlotIdx
                  return (
                    <button
                      key={idx}
                      onClick={() => setActiveSlotIdx(idx)}
                      className={`relative flex flex-col items-center px-4 py-2 rounded-t-lg border border-b-0 transition-all text-[11px] font-bold ${
                        isActive
                          ? 'bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white -mb-px z-10'
                          : 'bg-white dark:bg-gray-900 border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                    >
                      <span>{slotLabel(idx)}</span>
                      <span className={`text-[9px] font-medium mt-0.5 ${isActive ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600'}`}>
                        {TEMPLATE_LABELS[cfg.template]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Slot body */}
            <div className="flex-1 overflow-y-auto">
              <div className="flex gap-6 p-6 max-w-6xl">

                {/* Left column: asset pickers + content info */}
                <div className="w-64 shrink-0 space-y-5">

                  {/* Template selector */}
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Template</p>
                    <div className="flex gap-1.5">
                      {(['5050-right', '5050-left', 'icons'] as SlotTemplate[]).map(t => (
                        <button
                          key={t}
                          onClick={() => setSlotConfigs(prev => prev.map((c, i) => i === activeSlotIdx ? { template: t } : c))}
                          className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all border ${
                            activeCfg.template === t
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          {TEMPLATE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* CSV content preview (read-only) */}
                  {selected.slots[activeSlotIdx] && (
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Content</p>
                      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-3 space-y-2">
                        {selected.slots[activeSlotIdx].title && (
                          <div>
                            <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Title</p>
                            <p className="text-[11px] text-gray-700 dark:text-gray-300 font-medium leading-snug">
                              {selected.slots[activeSlotIdx].title}
                            </p>
                          </div>
                        )}
                        {selected.slots[activeSlotIdx].desc && !isIconsSlot && (
                          <div>
                            <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Description</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug line-clamp-4">
                              {selected.slots[activeSlotIdx].desc}
                            </p>
                          </div>
                        )}
                        {isIconsSlot && (
                          <div>
                            <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Icon labels</p>
                            {selected.slots[activeSlotIdx].iconCallouts.filter(Boolean).map((lbl, i) => (
                              <p key={i} className="text-[11px] text-gray-500 dark:text-gray-400">· {lbl}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Photo picker (non-icons slots) */}
                  {!isIconsSlot && (
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Product Photo</p>
                      {selectedSlotAssets.photoAsset ? (
                        <div className="group relative rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={selectedSlotAssets.photoAsset.url} alt={selectedSlotAssets.photoAsset.name}
                            className="w-full object-cover" style={{ height: 120 }} />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors" />
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setPhotoPickerQuery(selected.productName); setPhotoPickerOpen(true) }}
                              className="w-7 h-7 bg-white rounded-lg shadow flex items-center justify-center hover:bg-gray-50 transition-colors" title="Change photo">
                              <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              </svg>
                            </button>
                            <button onClick={() => patchSlotAssets(selected.id, activeSlotIdx, { photoAsset: undefined })}
                              className="w-7 h-7 bg-white rounded-lg shadow flex items-center justify-center hover:bg-red-50 transition-colors" title="Remove photo">
                              <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <div className="px-2.5 py-1.5">
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{selectedSlotAssets.photoAsset.name}</p>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setPhotoPickerQuery(selected.productName); setPhotoPickerOpen(true) }}
                          className="w-full h-24 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 flex flex-col items-center justify-center gap-1.5 transition-all text-gray-400 hover:text-indigo-500"
                        >
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                          <span className="text-[11px] font-semibold">Pick Photo</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Icon pickers (icons slots) */}
                  {isIconsSlot && (
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Icons</p>
                      {!folderConfig.iconsAlbumId && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-500 mb-2">Configure an icons folder in Design mode settings.</p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {([0, 1, 2, 3] as const).map(ic => {
                          const calloutLabel = selected.slots[activeSlotIdx]?.iconCallouts[ic]
                          if (!calloutLabel) return null
                          const iconAsset = selectedSlotAssets.iconAssets[ic]
                          return (
                            <div key={ic} className="flex flex-col gap-1">
                              <p className="text-[9px] text-gray-400 dark:text-gray-500 truncate" title={calloutLabel}>{calloutLabel}</p>
                              {iconAsset ? (
                                <div className="group relative rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 flex items-center justify-center" style={{ height: 52 }}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={iconAsset.url} alt={iconAsset.name} className="w-full h-full object-contain" />
                                  <button
                                    onClick={() => { setIconPickerSlotIdx(ic); setIconPickerOpen(true) }}
                                    className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors rounded-lg"
                                    title="Change icon"
                                  >
                                    <div className="opacity-0 group-hover:opacity-100 bg-white rounded-md shadow p-1 transition-opacity">
                                      <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                      </svg>
                                    </div>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setIconPickerSlotIdx(ic); setIconPickerOpen(true) }}
                                  disabled={!folderConfig.iconsAlbumId}
                                  className="w-full rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 flex items-center justify-center transition-all text-gray-300 dark:text-gray-600 hover:text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                  style={{ height: 52 }}
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right column: live canvas preview */}
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Preview — Desktop</p>
                  {previewDesign && (
                    <div
                      className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm bg-white"
                      style={{ width: PREVIEW_W, height: PREVIEW_H }}
                    >
                      <div style={{
                        width: 1464,
                        height: 600,
                        transform: `scale(${PREVIEW_SCALE})`,
                        transformOrigin: 'top left',
                        pointerEvents: 'none',
                      }}>
                        {isIconsSlot ? (
                          <CanvasContentIcons
                            design={{ ...previewDesign, activeFormat: 'desktop' }}
                            settings={{ ...designState.desktop, layoutFlipped: activeCfg.template === '5050-left' }}
                          />
                        ) : (
                          <CanvasContent
                            design={{ ...previewDesign, activeFormat: 'desktop' }}
                            settings={{ ...designState.desktop, layoutFlipped: activeCfg.template === '5050-left' }}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <CantoPhotoPickerModal
        open={photoPickerOpen}
        onClose={() => setPhotoPickerOpen(false)}
        initialQuery={photoPickerQuery}
        onSelect={(pick: PhotoPick) => {
          if (!selected) return
          patchSlotAssets(selected.id, activeSlotIdx, {
            photoAsset: { id: pick.id, name: pick.name, url: pick.previewUrl, type: 'image' },
          })
        }}
      />
      <CantoIconPickerModal
        albumId={folderConfig.iconsAlbumId}
        open={iconPickerOpen}
        onClose={() => setIconPickerOpen(false)}
        slotLabel={selected?.slots[activeSlotIdx]?.iconCallouts[iconPickerSlotIdx] || `Icon ${iconPickerSlotIdx + 1}`}
        onSelect={(pick: CantoPick) => {
          if (!selected) return
          const asset: UploadedAsset = {
            id:   pick.id,
            name: pick.name,
            url:  pick.originalUrl ?? pick.previewUrl ?? '',
            type: 'image',
          }
          const newIcons = [...selectedSlotAssets.iconAssets] as (UploadedAsset | undefined)[]
          newIcons[iconPickerSlotIdx] = asset
          patchSlotAssets(selected.id, activeSlotIdx, { iconAssets: newIcons })
        }}
      />
    </div>
  )
}
