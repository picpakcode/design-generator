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
import TexturePicker from './TexturePicker'
import type { CantoPick } from './CantoAssetPicker'
import { FolderConfig } from '@/lib/canto-folders'

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotTemplate = '5050-right' | '5050-left' | 'icons'
interface SlotConfig { template: SlotTemplate }

interface TemplateSlotState {
  title: string
  desc: string
  iconLabels: [string, string, string, string]
  iconCount: 2 | 3 | 4
  photoAsset?: UploadedAsset
  iconAssets: (UploadedAsset | undefined)[]
}

type ProductStatus = 'draft' | 'rendering' | 'done' | 'error'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LOGO_ID    = 'gjj53olkh15rd0vdvpq29ngf75'
const DEFAULT_LOGO_NAME  = 'DocsDiesel-Logo-Wordmark-RedWhite-Vector 1'
const DEFAULT_LOGO_ALBUM = 'QH34D'

const FRAME_GAP = 32
const SLOT_GAP  = 80
const CANVAS_W  = 1464 + FRAME_GAP + 600  // 2096

const TEMPLATE_LABELS: Record<SlotTemplate, string> = {
  '5050-right': 'Img | Txt',
  '5050-left':  'Txt | Img',
  icons:        'Icons',
}

function slotLabel(i: number) { return String.fromCharCode(65 + i) + '1' }

function defaultSlotConfigs(n: number): SlotConfig[] {
  return Array.from({ length: n }, (_, i) => ({
    template: i === 1 ? 'icons' : (i % 2 === 0 ? '5050-right' : '5050-left'),
  }))
}

function emptySlotState(): TemplateSlotState {
  return { title: '', desc: '', iconLabels: ['', '', '', ''], iconCount: 4, iconAssets: [undefined, undefined, undefined, undefined] }
}

// ─── Section component ────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">{title}</span>
        <svg className={`w-3 h-3 text-gray-300 dark:text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 200ms ease' }}>
        <div style={{ overflow: 'hidden' }}>
          <div className="px-4 pb-4 pt-0.5">{children}</div>
        </div>
      </div>
    </div>
  )
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

  // Selection
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [activeSlotIdx, setActiveSlotIdx] = useState(0)

  // Per-product per-slot state (content + assets)
  const [allSlots, setAllSlots] = useState<Record<string, TemplateSlotState[]>>({})

  // Per-product render status
  const [statuses, setStatuses] = useState<Record<string, ProductStatus>>({})

  // Slot config (global)
  const [aplusSlots, setAplusSlots]         = useState(5)
  const [slotConfigs, setSlotConfigs]       = useState<SlotConfig[]>(defaultSlotConfigs(5))
  const [includeGallery, setIncludeGallery] = useState(true)
  const [outputFormat, setOutputFormat]     = useState<'png' | 'jpeg'>('png')

  // Global branding
  const [logoAsset, setLogoAsset]       = useState<UploadedAsset | null>(null)
  const [textureAsset, setTextureAsset] = useState<UploadedAsset | null>(null)

  // Pickers
  const [photoPickerOpen, setPhotoPickerOpen]     = useState(false)
  const [iconPickerOpen, setIconPickerOpen]       = useState(false)
  const [iconPickerSlotIdx, setIconPickerSlotIdx] = useState(0)

  // Render
  const [renderingAll, setRenderingAll] = useState(false)
  const capturedRef = useRef<Map<string, string>>(new Map())
  const cancelRef   = useRef(false)

  // ── Canvas zoom/pan ───────────────────────────────────────────────────────────
  const [zoom, setZoom]               = useState(0.25)
  const [pan, setPan]                 = useState({ x: 40, y: 40 })
  const zoomRef                       = useRef(0.25)
  const [spaceDown, setSpaceDown]     = useState(false)
  const [isPanDragging, setIsPanDragging] = useState(false)
  const panOriginRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const wrapperRef   = useRef<HTMLDivElement | null>(null)
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null)
  const wrapperRefCallback = useCallback((el: HTMLDivElement | null) => {
    wrapperRef.current = el
    setCanvasEl(el)
  }, [])

  const fitView = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    const vw = el.clientWidth
    const vh = el.clientHeight
    const PADDING = 56
    const totalH = aplusSlots * 600 + Math.max(0, aplusSlots - 1) * SLOT_GAP
    const z = Math.min(
      (vw - PADDING * 2) / CANVAS_W,
      (vh - PADDING * 2) / totalH,
      1,
    )
    const px = Math.max(PADDING, (vw - CANVAS_W * z) / 2)
    const py = Math.max(PADDING, (vh - totalH * z) / 2)
    zoomRef.current = z
    setZoom(z)
    setPan({ x: px, y: py })
  }, [aplusSlots])

  const adjustZoom = (factor: number) => {
    const el = wrapperRef.current
    if (!el) return
    const cx = el.clientWidth / 2
    const cy = el.clientHeight / 2
    const prevZ = zoomRef.current
    const newZ = Math.max(0.05, Math.min(4, prevZ * factor))
    const ratio = newZ / prevZ
    zoomRef.current = newZ
    setZoom(newZ)
    setPan(p => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }))
  }

  const handleViewportMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || spaceDown) {
      e.preventDefault()
      panOriginRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
      setIsPanDragging(true)
    }
  }
  const handleViewportMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const o = panOriginRef.current
    if (!o) return
    setPan({ x: o.px + (e.clientX - o.mx), y: o.py + (e.clientY - o.my) })
  }
  const handleViewportMouseUp = () => { panOriginRef.current = null; setIsPanDragging(false) }

  // Wheel: zoom + pan
  useEffect(() => {
    const el = canvasEl
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        const factor = Math.exp(-e.deltaY * 0.008)
        const prevZ = zoomRef.current
        const newZ = Math.max(0.05, Math.min(4, prevZ * factor))
        const ratio = newZ / prevZ
        zoomRef.current = newZ
        setZoom(newZ)
        setPan(p => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }))
      } else {
        setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [canvasEl])

  // Spacebar pan mode + F to fit
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault(); setSpaceDown(true)
      }
      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement)) {
        fitView()
      }
    }
    const onUp = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [fitView])

  // Fit when canvas mounts or when selected product changes
  useEffect(() => {
    if (canvasEl) fitView()
  }, [canvasEl]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedId && canvasEl) fitView()
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Init ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/canto/folder?albumId=${DEFAULT_LOGO_ALBUM}`)
      .then(r => r.json())
      .then((items: { id: string; name: string; previewUrl: string }[]) => {
        const logo = items.find(i => i.id === DEFAULT_LOGO_ID) ?? items.find(i => i.name === DEFAULT_LOGO_NAME)
        if (logo) setLogoAsset({ id: logo.id, name: logo.name, url: logo.previewUrl, type: 'image' })
      })
      .catch(() => {})

    const blocks = [...(designState.blocks ?? []), ...(designState.galleryBlocks ?? [])]
    const active  = designState.blocks?.find(b => b.id === designState.activeBlockId)
    const tex     = (active?.assets ?? blocks[0]?.assets ?? designState.assets)?.[1]
    if (tex?.url) setTextureAsset(tex)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSlotConfigs(prev => defaultSlotConfigs(aplusSlots).map((d, i) => prev[i] ?? d))
  }, [aplusSlots])

  useEffect(() => {
    if (activeSlotIdx >= aplusSlots) setActiveSlotIdx(aplusSlots - 1)
  }, [aplusSlots, activeSlotIdx])

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

      const initialSlots: Record<string, TemplateSlotState[]> = {}
      for (const product of result.products) {
        initialSlots[product.id] = Array.from({ length: aplusSlots }, (_, j) => {
          const csvSlot  = product.slots[j]
          const callouts = (csvSlot?.iconCallouts ?? ['', '', '', '']) as [string, string, string, string]
          const filled   = callouts.filter(Boolean).length
          return {
            title:      csvSlot?.title ?? '',
            desc:       csvSlot?.desc ?? '',
            iconLabels: callouts,
            iconCount:  (Math.min(Math.max(filled, 2), 4)) as 2 | 3 | 4,
            iconAssets: [undefined, undefined, undefined, undefined],
          }
        })
      }
      setAllSlots(initialSlots)
      setStatuses({})
      capturedRef.current.clear()
      onCanExportChange(false)
    }
    reader.readAsText(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplusSlots, onCanExportChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])

  const handleClear = () => {
    setParseResult(null); setCsvFilename(''); setSelectedId(null)
    setAllSlots({}); setStatuses({}); capturedRef.current.clear()
    onCanExportChange(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Slot state helpers ────────────────────────────────────────────────────────

  function getSlotState(productId: string, slotIdx: number): TemplateSlotState {
    return allSlots[productId]?.[slotIdx] ?? emptySlotState()
  }

  function patchSlotState(productId: string, slotIdx: number, patch: Partial<TemplateSlotState>) {
    setAllSlots(prev => {
      const existing = prev[productId] ?? Array.from({ length: aplusSlots }, emptySlotState)
      const updated  = existing.map((s, i) => i === slotIdx ? { ...s, ...patch } : s)
      return { ...prev, [productId]: updated }
    })
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

  function buildSlotDesign(productId: string, slotIdx: number): DesignState {
    const slot = getSlotState(productId, slotIdx)
    return {
      ...designState,
      assets: [
        slot.photoAsset,
        textureAsset ?? fallbackAsset(1),
        logoAsset    ?? fallbackAsset(2),
        slot.iconAssets[0],
        slot.iconAssets[1],
        slot.iconAssets[2],
        slot.iconAssets[3],
      ] as UploadedAsset[],
      title:        `<p>${slot.title}</p>`,
      subtitleHtml: slot.desc ? `<p>${slot.desc}</p>` : '',
      iconLabels:   slot.iconLabels,
      iconCount:    slot.iconCount,
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const renderProduct = async (product: BulkProduct) => {
    setStatuses(prev => ({ ...prev, [product.id]: 'rendering' }))
    Array.from(capturedRef.current.keys())
      .filter(k => k.startsWith(`${product.id}/`))
      .forEach(k => capturedRef.current.delete(k))

    for (let j = 0; j < aplusSlots; j++) {
      if (cancelRef.current) break
      const cfg     = slotConfigs[j] ?? { template: '5050-right' }
      const flip    = cfg.template === '5050-left'
      const isIcons = cfg.template === 'icons'
      const sd      = buildSlotDesign(product.id, j)
      const lbl     = slotLabel(j).toLowerCase()

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

  const renderAll = async () => {
    if (renderingAll) { cancelRef.current = true; return }
    if ((parseResult?.products ?? []).length === 0) return
    cancelRef.current = false
    setRenderingAll(true)
    for (const p of parseResult!.products) {
      if (cancelRef.current) break
      await renderProduct(p)
    }
    setRenderingAll(false)
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  const handleExportAll = useCallback(async () => {
    if (capturedRef.current.size === 0) return
    const JSZip = (await import('jszip')).default
    const zip   = new JSZip()
    const ext   = outputFormat === 'jpeg' ? 'jpg' : 'png'
    capturedRef.current.forEach((dataUrl, key) => {
      const slash = key.indexOf('/')
      const pid   = key.slice(0, slash)
      const lbl   = key.slice(slash + 1)
      const name  = parseResult?.products.find(p => p.id === pid)?.productName || pid
      zip.folder(name)!.file(`${lbl}.${ext}`, dataUrl.split(',')[1], { base64: true })
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'template-export.zip' })
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href)
  }, [outputFormat, parseResult])

  const handleExportProduct = useCallback(async (product: BulkProduct) => {
    const entries = Array.from(capturedRef.current.entries()).filter(([k]) => k.startsWith(`${product.id}/`))
    if (entries.length === 0) return
    const JSZip = (await import('jszip')).default
    const zip   = new JSZip()
    const ext   = outputFormat === 'jpeg' ? 'jpg' : 'png'
    entries.forEach(([k, d]) => zip.file(`${k.slice(k.indexOf('/') + 1)}.${ext}`, d.split(',')[1], { base64: true }))
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${product.productName || product.id}.zip` })
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href)
  }, [outputFormat])

  useEffect(() => { exportFnRef.current = handleExportAll })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onCanExportChange(capturedRef.current.size > 0) }, [statuses])

  // ── Derived ───────────────────────────────────────────────────────────────────

  const products       = parseResult?.products ?? []
  const selected       = products.find(p => p.id === selectedId) ?? null
  const selectedIdx    = selected ? products.indexOf(selected) : -1
  const selectedStatus = selected ? (statuses[selected.id] ?? 'draft') : 'draft'
  const activeSlot     = selected ? getSlotState(selected.id, activeSlotIdx) : emptySlotState()
  const activeCfg      = slotConfigs[activeSlotIdx] ?? { template: '5050-right' }
  const isIconsSlot    = activeCfg.template === 'icons'

  const StatusDot = ({ status }: { status: ProductStatus }) => {
    if (status === 'rendering') return (
      <svg className="animate-spin w-3 h-3 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    )
    if (status === 'done') return <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
    if (status === 'error') return <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
    return <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-200 dark:border-gray-600 shrink-0" />
  }

  // ─── CSV upload empty state ───────────────────────────────────────────────────

  if (!parseResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12">
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full max-w-md rounded border-2 border-dashed p-10 flex flex-col items-center gap-4 cursor-pointer transition-all ${
            isDragging ? 'border-gray-400 bg-gray-50 dark:bg-gray-800/50' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 bg-white dark:bg-gray-900'
          }`}
        >
          <div className="w-14 h-14 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
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

  // ─── Main layout ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ══ LEFT SIDEBAR ══════════════════════════════════════════════════════ */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm z-10">

        {/* Product navigator */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSelectedId(products[selectedIdx - 1]?.id ?? null); setActiveSlotIdx(0) }}
              disabled={selectedIdx <= 0}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              {selected ? (
                <>
                  <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate leading-tight">
                    {selected.productName || `Product ${selectedIdx + 1}`}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {selectedIdx + 1} of {products.length}
                    {selectedStatus === 'done' && ' · Done'}
                    {selectedStatus === 'rendering' && ' · Rendering…'}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-gray-400">No product selected</p>
              )}
            </div>
            <button
              onClick={() => { setSelectedId(products[selectedIdx + 1]?.id ?? null); setActiveSlotIdx(0) }}
              disabled={selectedIdx >= products.length - 1 || !selected}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Slot tabs */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Slot</p>
          <div className="flex gap-1 flex-wrap">
            {slotConfigs.slice(0, aplusSlots).map((cfg, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSlotIdx(idx)}
                className={`flex flex-col items-center px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  idx === activeSlotIdx
                    ? 'bg-gray-900 dark:bg-gray-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <span>{slotLabel(idx)}</span>
                <span className={`text-[8px] mt-0.5 font-medium ${idx === activeSlotIdx ? 'text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                  {TEMPLATE_LABELS[cfg.template]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable sections */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* Content */}
          <Section title="Content" defaultOpen>
            {!selected ? (
              <p className="text-[11px] text-gray-400 text-center py-2">Select a product</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Title</label>
                  <input
                    type="text"
                    value={activeSlot.title}
                    onChange={e => patchSlotState(selected.id, activeSlotIdx, { title: e.target.value })}
                    placeholder="Slot title…"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/20 dark:focus:ring-gray-500/30 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
                  />
                </div>
                {!isIconsSlot && (
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Description</label>
                    <textarea
                      value={activeSlot.desc}
                      onChange={e => patchSlotState(selected.id, activeSlotIdx, { desc: e.target.value })}
                      placeholder="Product description…"
                      rows={4}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/20 dark:focus:ring-gray-500/30 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all resize-none leading-relaxed"
                    />
                  </div>
                )}
                {isIconsSlot && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Icon Labels</label>
                      <div className="flex gap-1">
                        {([2, 3, 4] as const).map(n => (
                          <button key={n} onClick={() => patchSlotState(selected.id, activeSlotIdx, { iconCount: n })}
                            className={`w-6 h-6 rounded text-[10px] font-bold transition-all ${activeSlot.iconCount === n ? 'bg-gray-900 dark:bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'}`}
                          >{n}</button>
                        ))}
                      </div>
                    </div>
                    {Array.from({ length: activeSlot.iconCount }, (_, i) => (
                      <input
                        key={i}
                        type="text"
                        value={activeSlot.iconLabels[i]}
                        onChange={e => {
                          const next = [...activeSlot.iconLabels] as [string, string, string, string]
                          next[i] = e.target.value
                          patchSlotState(selected.id, activeSlotIdx, { iconLabels: next })
                        }}
                        placeholder={`Icon ${i + 1} label…`}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/20 dark:focus:ring-gray-500/30 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Images */}
          <Section title="Images" defaultOpen>
            {!selected ? (
              <p className="text-[11px] text-gray-400 text-center py-2">Select a product</p>
            ) : (
              <div className="space-y-4">

                {/* Product photo */}
                {!isIconsSlot && (
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Product Photo</p>
                    {activeSlot.photoAsset ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-8 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={activeSlot.photoAsset.url} alt={activeSlot.photoAsset.name} className="w-full h-full object-cover" />
                        </div>
                        <button
                          onClick={() => setPhotoPickerOpen(true)}
                          className="flex-1 text-left text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 truncate transition-colors"
                          title={activeSlot.photoAsset.name}
                        >
                          {activeSlot.photoAsset.name}
                        </button>
                        <button
                          onClick={() => patchSlotState(selected.id, activeSlotIdx, { photoAsset: undefined })}
                          className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPhotoPickerOpen(true)}
                        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-dashed border-gray-300 dark:border-gray-600 text-[10px] text-gray-400 hover:border-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                      >
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Pick from library
                      </button>
                    )}
                  </div>
                )}

                {/* Background texture (global) */}
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Background Texture</p>
                  <TexturePicker
                    albumId={null}
                    value={textureAsset}
                    onChange={asset => setTextureAsset(asset)}
                  />
                </div>

                {/* Logo (global) */}
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Brand Logo</p>
                  <TexturePicker
                    albumId="QH34D"
                    value={logoAsset}
                    onChange={asset => setLogoAsset(asset)}
                    placeholder="Pick logo…"
                    thumbnailFit="contain"
                  />
                </div>

                {/* Icon assets (icons slots only) */}
                {isIconsSlot && (
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Icons</p>
                    {!folderConfig.iconsAlbumId && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-500 mb-2">Configure an icons folder in Settings ⚙</p>
                    )}
                    <div className="space-y-1.5">
                      {Array.from({ length: activeSlot.iconCount }, (_, i) => {
                        const iconAsset = activeSlot.iconAssets[i]
                        const iconLabel = activeSlot.iconLabels[i]
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[9px] font-semibold text-gray-400 w-12 shrink-0 truncate" title={iconLabel}>
                              {iconLabel || `Icon ${i + 1}`}
                            </span>
                            <div className="flex-1 flex items-center gap-1.5">
                              {iconAsset ? (
                                <>
                                  <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center overflow-hidden shrink-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={iconAsset.url} alt={iconAsset.name} className="max-w-full max-h-full object-contain p-0.5" />
                                  </div>
                                  <button
                                    onClick={() => { setIconPickerSlotIdx(i); setIconPickerOpen(true) }}
                                    className="flex-1 text-left text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 truncate transition-colors"
                                    title={iconAsset.name}
                                  >
                                    {iconAsset.name}
                                  </button>
                                  <button
                                    onClick={() => {
                                      const newIcons = [...activeSlot.iconAssets] as (UploadedAsset | undefined)[]
                                      newIcons[i] = undefined
                                      patchSlotState(selected.id, activeSlotIdx, { iconAssets: newIcons })
                                    }}
                                    className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => { setIconPickerSlotIdx(i); setIconPickerOpen(true) }}
                                  disabled={!folderConfig.iconsAlbumId}
                                  className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-dashed border-gray-300 dark:border-gray-600 text-[10px] text-gray-400 hover:border-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                >
                                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                  </svg>
                                  Pick icon
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Section>
        </div>

        {/* Action buttons */}
        {selected && (
          <div className="shrink-0 px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex gap-2">
            <button
              onClick={() => renderProduct(selected)}
              disabled={selectedStatus === 'rendering'}
              className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded bg-gray-900 dark:bg-gray-700 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {selectedStatus === 'rendering' ? (
                <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Rendering…</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" /></svg>{selectedStatus === 'done' ? 'Re-render' : 'Render'}</>
              )}
            </button>
            {selectedStatus === 'done' && (
              <button
                onClick={() => handleExportProduct(selected)}
                className="h-9 w-9 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Download ZIP"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ══ MAIN AREA ═════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50 dark:bg-gray-950">

        {/* Settings bar */}
        <div className="shrink-0 px-5 py-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 flex items-center gap-4 flex-wrap">
          {/* Slots stepper */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mr-1">Slots</span>
            <button
              onClick={() => setAplusSlots(n => Math.max(1, n - 1))}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors text-sm font-bold"
            >−</button>
            <span className="w-5 text-center text-[12px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">{aplusSlots}</span>
            <button
              onClick={() => setAplusSlots(n => Math.min(10, n + 1))}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors text-sm font-bold"
            >+</button>
          </div>

          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />

          {/* Format */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mr-1">Format</span>
            {(['png', 'jpeg'] as const).map(f => (
              <button key={f} onClick={() => setOutputFormat(f)}
                className={`px-2.5 h-6 rounded text-[11px] font-bold transition-all ${outputFormat === f ? 'bg-gray-900 dark:bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
              >{f.toUpperCase()}</button>
            ))}
          </div>

          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />

          {/* Gallery toggle */}
          <label className="flex items-center gap-2 cursor-pointer" onClick={() => setIncludeGallery(g => !g)}>
            <div className={`w-8 h-4 rounded-full relative transition-colors ${includeGallery ? 'bg-gray-900 dark:bg-gray-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${includeGallery ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-[11px] text-gray-600 dark:text-gray-400 select-none">Gallery</span>
          </label>

          <div className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
            {csvFilename}
            <button onClick={handleClear} className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline transition-colors">Clear</button>
          </div>
        </div>

        {/* ══ Canvas viewport ══ */}
        <main
          ref={wrapperRefCallback}
          className="flex-1 min-h-0 min-w-0 relative overflow-hidden select-none"
          style={{
            backgroundColor: '#F0F0F0',
            cursor: spaceDown ? (isPanDragging ? 'grabbing' : 'grab') : 'default',
          }}
          onMouseDown={handleViewportMouseDown}
          onMouseMove={handleViewportMouseMove}
          onMouseUp={handleViewportMouseUp}
          onMouseLeave={handleViewportMouseUp}
        >
          {spaceDown && (
            <div className="absolute inset-0 z-20" style={{ cursor: isPanDragging ? 'grabbing' : 'grab' }} />
          )}

          {!selected ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-gray-400">Select a product from the list below</p>
            </div>
          ) : (
            /* Transform layer */
            <div
              style={{
                position: 'absolute',
                top: 0, left: 0,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: SLOT_GAP }}>
                {slotConfigs.slice(0, aplusSlots).map((cfg, slotIdx) => {
                  const isActive  = slotIdx === activeSlotIdx
                  const isIcons   = cfg.template === 'icons'
                  const flip      = cfg.template === '5050-left'
                  const slotDesign = buildSlotDesign(selected.id, slotIdx)

                  return (
                    <div key={slotIdx}>
                      {/* Slot header — scale compensated */}
                      <div style={{ height: `${28/zoom}px`, position: 'relative', marginBottom: `${8/zoom}px` }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, display: 'flex', alignItems: 'center', gap: 8, transform: `scale(${1/zoom})`, transformOrigin: 'top left' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#111827' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', userSelect: 'none' }}>
                            {slotLabel(slotIdx)}
                          </span>
                          {/* Template switcher */}
                          <div style={{ display: 'flex', gap: 2, background: '#E5E7EB', borderRadius: 4, padding: 2 }}>
                            {(['5050-right', '5050-left', 'icons'] as SlotTemplate[]).map(t => (
                              <button
                                key={t}
                                onClick={e => {
                                  e.stopPropagation()
                                  setSlotConfigs(prev => prev.map((c, i) => i === slotIdx ? { template: t } : c))
                                  setActiveSlotIdx(slotIdx)
                                }}
                                style={{
                                  padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: 'none',
                                  background: cfg.template === t ? '#fff' : 'transparent',
                                  color: cfg.template === t ? '#111827' : '#6B7280',
                                  boxShadow: cfg.template === t ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                                  cursor: 'pointer', letterSpacing: '0.01em',
                                }}
                              >
                                {TEMPLATE_LABELS[t]}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Frames row: desktop + mobile */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: FRAME_GAP }}>

                        {/* Desktop */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ height: `${16/zoom}px`, width: 1464, position: 'relative', marginBottom: `${4/zoom}px` }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `scale(${1/zoom})`, transformOrigin: 'top center' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#374151' : '#9CA3AF' }}>Desktop · 1464×600</span>
                            </div>
                          </div>
                          <div
                            onClick={() => setActiveSlotIdx(slotIdx)}
                            style={{
                              width: 1464, height: 600,
                              position: 'relative', overflow: 'hidden', borderRadius: 4, flexShrink: 0,
                              outline: isActive ? '2px solid #111827' : '2px solid transparent',
                              outlineOffset: 2,
                              boxShadow: isActive
                                ? '0 0 0 4px rgba(17,24,39,0.12), 0 4px 24px rgba(0,0,0,0.18)'
                                : '0 2px 12px rgba(0,0,0,0.10)',
                              cursor: 'pointer',
                            }}
                          >
                            {isIcons
                              ? <CanvasContentIcons design={{ ...slotDesign, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                              : <CanvasContent      design={{ ...slotDesign, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                            }
                          </div>
                        </div>

                        {/* Mobile */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ height: `${16/zoom}px`, width: 600, position: 'relative', marginBottom: `${4/zoom}px` }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `scale(${1/zoom})`, transformOrigin: 'top center' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#374151' : '#9CA3AF' }}>Mobile · 600×450</span>
                            </div>
                          </div>
                          <div
                            onClick={() => setActiveSlotIdx(slotIdx)}
                            style={{
                              width: 600, height: 450,
                              position: 'relative', overflow: 'hidden', borderRadius: 4, flexShrink: 0,
                              outline: isActive ? '2px solid #111827' : '2px solid transparent',
                              outlineOffset: 2,
                              boxShadow: isActive
                                ? '0 0 0 4px rgba(17,24,39,0.12), 0 4px 24px rgba(0,0,0,0.18)'
                                : '0 2px 12px rgba(0,0,0,0.10)',
                              cursor: 'pointer',
                            }}
                          >
                            {isIcons
                              ? <CanvasContentIcons design={{ ...slotDesign, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                              : <CanvasContent      design={{ ...slotDesign, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                            }
                          </div>
                        </div>

                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1 z-10">
            <button
              onClick={() => adjustZoom(1 / 1.25)}
              className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-colors text-base font-bold"
            >−</button>
            <button
              onClick={fitView}
              className="h-7 px-2.5 rounded border border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-600 text-[11px] font-mono text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-colors tabular-nums"
              title="Fit view (F)"
            >{Math.round(zoom * 100)}%</button>
            <button
              onClick={() => adjustZoom(1.25)}
              className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-colors text-base font-bold"
            >+</button>
          </div>
        </main>

        {/* Product list bar */}
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {products.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedId(p.id); setActiveSlotIdx(0) }}
              className={`flex items-center gap-1.5 px-3 h-7 rounded border text-[11px] font-semibold whitespace-nowrap shrink-0 transition-all ${
                p.id === selectedId
                  ? 'bg-gray-900 dark:bg-gray-700 text-white border-gray-900 dark:border-gray-700'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              <StatusDot status={statuses[p.id] ?? 'draft'} />
              <span className="max-w-[140px] truncate">{p.productName || `Product ${products.indexOf(p) + 1}`}</span>
            </button>
          ))}
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0 mx-1" />
          <button
            onClick={renderAll}
            className={`flex items-center gap-1.5 px-3 h-7 rounded text-[11px] font-bold uppercase tracking-widest shrink-0 transition-colors ${
              renderingAll
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600'
            }`}
          >
            {renderingAll ? (
              <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Cancel</>
            ) : (
              <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" /></svg>Render All</>
            )}
          </button>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      <CantoPhotoPickerModal
        open={photoPickerOpen}
        onClose={() => setPhotoPickerOpen(false)}
        initialQuery={selected?.productName ?? ''}
        onSelect={(pick: PhotoPick) => {
          if (!selected) return
          patchSlotState(selected.id, activeSlotIdx, {
            photoAsset: { id: pick.id, name: pick.name, url: pick.previewUrl, type: 'image' },
          })
        }}
      />
      <CantoIconPickerModal
        albumId={folderConfig.iconsAlbumId}
        open={iconPickerOpen}
        onClose={() => setIconPickerOpen(false)}
        slotLabel={activeSlot.iconLabels[iconPickerSlotIdx] || `Icon ${iconPickerSlotIdx + 1}`}
        onSelect={(pick: CantoPick) => {
          if (!selected) return
          const newIcons = [...activeSlot.iconAssets] as (UploadedAsset | undefined)[]
          newIcons[iconPickerSlotIdx] = { id: pick.id, name: pick.name, url: pick.originalUrl ?? pick.previewUrl ?? '', type: 'image' }
          patchSlotState(selected.id, activeSlotIdx, { iconAssets: newIcons })
        }}
      />
    </div>
  )
}
