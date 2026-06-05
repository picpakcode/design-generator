'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { toPng, toJpeg } from 'html-to-image'
import { BulkProduct, ParseResult, parseCSV, downloadTemplate } from '@/lib/csv'
import { DesignState, UploadedAsset } from '@/types'
import { CanvasContent, CanvasContentIcons, CanvasContentGallery, CanvasContentGalleryIcons } from './CanvasRenderers'
import CantoPhotoPickerModal, { PhotoPick } from './CantoPhotoPickerModal'
import CantoIconPickerModal from './CantoIconPickerModal'
import TexturePicker from './TexturePicker'
import type { CantoPick } from './CantoAssetPicker'
import { FolderConfig } from '@/lib/canto-folders'
import { useAppSettings } from '@/hooks/useAppSettings'

const RichTextEditor = dynamic(() => import('./RichTextEditor'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotTemplate    = '5050-right' | '5050-left' | 'icons' | 'icons-text'
type GalleryTemplate = 'gallery-hero' | 'gallery-icons' | 'gallery-icons-text'

interface SlotConfig        { template: SlotTemplate; mobileShowDesc?: boolean }
interface GallerySlotConfig { template: GalleryTemplate }

interface TemplateSlotState {
  title: string                               // HTML (tiptap output)
  desc: string                                // HTML (tiptap output)
  iconLabels: [string, string, string, string]
  iconCount: 2 | 3 | 4
  photoAsset?: UploadedAsset
  iconAssets: (UploadedAsset | undefined)[]
}

type ProductStatus = 'draft' | 'rendering' | 'done' | 'error'

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY        = 'template-mode-v2'
const DEFAULT_LOGO_ID    = 'gjj53olkh15rd0vdvpq29ngf75'
const DEFAULT_LOGO_NAME  = 'DocsDiesel-Logo-Wordmark-RedWhite-Vector 1'
const DEFAULT_LOGO_ALBUM = 'QH34D'

const FRAME_GAP  = 32
const SLOT_GAP   = 80
const COL_GAP    = 120
const APLUS_W    = 1464 + FRAME_GAP + 600   // 2096
const GALLERY_W  = 1500
const CANVAS_W   = APLUS_W + COL_GAP + GALLERY_W  // 3716

const APLUS_LABELS: Record<SlotTemplate, string> = {
  '5050-right': 'Img | Txt',
  '5050-left':  'Txt | Img',
  'icons':      'Icons',
  'icons-text': 'Icn+Txt',
}

const GALLERY_LABELS: Record<GalleryTemplate, string> = {
  'gallery-hero':        'Hero',
  'gallery-icons':       'Icons',
  'gallery-icons-text':  'Icn+Txt',
}

function slotLabel(i: number)   { return String.fromCharCode(65 + i) + '1' }
function galleryLabel(i: number){ return `G${i + 1}` }

function defaultSlotConfigs(n: number): SlotConfig[] {
  return Array.from({ length: n }, (_, i) => ({
    template: (i === 1 ? 'icons' : i % 2 === 0 ? '5050-right' : '5050-left') as SlotTemplate,
  }))
}

function defaultGalleryConfigs(n: number): GallerySlotConfig[] {
  return Array.from({ length: n }, () => ({ template: 'gallery-hero' as GalleryTemplate }))
}

function emptySlotState(): TemplateSlotState {
  return { title: '', desc: '', iconLabels: ['', '', '', ''], iconCount: 4, iconAssets: [undefined, undefined, undefined, undefined] }
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

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
    const opts = { includeQueryParams: true, cacheBust: true, onImageErrorHandler: () => {} }
    return format === 'jpeg'
      ? await toJpeg(div, { quality: 0.95, backgroundColor: '#ffffff', ...opts })
      : await toPng(div, opts)
  } catch { return null }
  finally { root.unmount(); document.body.removeChild(wrapper) }
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

interface PreviewProps {
  open: boolean
  onClose: () => void
  aplusDesigns:   { design: DesignState; cfg: SlotConfig;        label: string }[]
  galleryDesigns: { design: DesignState; cfg: GallerySlotConfig; label: string }[]
  designState: DesignState
}

function TemplateModePreviewModal({ open, onClose, aplusDesigns, galleryDesigns, designState }: PreviewProps) {
  const { settings } = useAppSettings()
  const isDark = settings.theme === 'dark'
  const [tab, setTab] = useState<'desktop' | 'mobile' | 'gallery'>('desktop')

  const dRef = useRef<HTMLDivElement>(null)
  const mRef = useRef<HTMLDivElement>(null)
  const gRef = useRef<HTMLDivElement>(null)
  const [ds, setDs] = useState(0.4)
  const [ms, setMs] = useState(0.5)
  const [gs, setGs] = useState(0.3)

  useEffect(() => {
    if (!open) return
    const measure = () => {
      if (dRef.current) setDs(dRef.current.clientWidth / 1464)
      if (mRef.current) setMs(mRef.current.clientWidth / 600)
      if (gRef.current) setGs(gRef.current.clientWidth / 1500)
    }
    const t = setTimeout(measure, 30)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [open, tab])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  const dark = isDark
  const panelBg = dark ? 'bg-gray-950 border-white/8' : 'bg-white border-gray-200'
  const hdrBg   = dark ? 'bg-gray-900 border-white/8' : 'bg-gray-50 border-gray-200'
  const hdrTxt  = dark ? 'text-white' : 'text-gray-900'
  const subTxt  = dark ? 'text-gray-500' : 'text-gray-400'
  const closeBtn= dark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
  const tabActive   = dark ? 'bg-white/10 text-white' : 'bg-white text-gray-900 shadow-sm'
  const tabInactive = dark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-700'
  const bodyBg  = dark ? 'bg-gray-950' : 'bg-white'

  return (
    <>
      <div className={`fixed inset-0 z-50 ${dark ? 'bg-black/80' : 'bg-black/40'} backdrop-blur-sm`} onClick={onClose} />
      <div className={`fixed inset-4 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl border ${panelBg}`}>
        {/* Header */}
        <div className={`shrink-0 flex items-center justify-between px-5 py-3.5 border-b ${hdrBg}`}>
          <div className="flex items-center gap-3">
            <svg className={`w-4 h-4 ${subTxt}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className={`font-semibold text-sm ${hdrTxt}`}>Preview</span>
            <div className={`flex items-center ${dark ? 'bg-white/8' : 'bg-gray-100'} rounded p-0.5`}>
              {(['desktop', 'mobile', 'gallery'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`h-6 px-3 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all ${tab === t ? tabActive : tabInactive}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] hidden sm:block ${subTxt}`}>Esc to close</span>
            <button onClick={onClose} className={`ml-2 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${closeBtn}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={`flex-1 overflow-y-auto ${bodyBg} px-6 pt-5 pb-8`}>
          {tab === 'desktop' && (
            <div ref={dRef}>
              {aplusDesigns.map(({ design: sd, cfg, label }) => {
                const flip = cfg.template === '5050-left'
                const isIcons = cfg.template === 'icons' || cfg.template === 'icons-text'
                return (
                  <div key={label} style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label} — Desktop · 1464×600</p>
                    <div style={{ width: '100%', height: 600 * ds, position: 'relative', overflow: 'hidden', borderRadius: 4 }}>
                      <div style={{ width: 1464, height: 600, transform: `scale(${ds})`, transformOrigin: 'top left', position: 'absolute' }}>
                        {isIcons
                          ? <CanvasContentIcons design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                          : <CanvasContent      design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                        }
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {tab === 'mobile' && (
            <div ref={mRef} style={{ maxWidth: 600, margin: '0 auto' }}>
              {aplusDesigns.map(({ design: sd, cfg, label }) => {
                const flip = cfg.template === '5050-left'
                const isIcons = cfg.template === 'icons' || cfg.template === 'icons-text'
                return (
                  <div key={label} style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label} — Mobile · 600×450</p>
                    <div style={{ width: '100%', height: 450 * ms, position: 'relative', overflow: 'hidden', borderRadius: 4 }}>
                      <div style={{ width: 600, height: 450, transform: `scale(${ms})`, transformOrigin: 'top left', position: 'absolute' }}>
                        {isIcons
                          ? <CanvasContentIcons design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                          : <CanvasContent      design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                        }
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {tab === 'gallery' && (
            <div ref={gRef} style={{ maxWidth: 800, margin: '0 auto' }}>
              {galleryDesigns.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No gallery slides configured. Add g1_title columns to your CSV or adjust the Gallery Slides count.</p>
              )}
              {galleryDesigns.map(({ design: gd, cfg, label }) => {
                const isGIcons = cfg.template === 'gallery-icons' || cfg.template === 'gallery-icons-text'
                return (
                  <div key={label} style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label} · 1500×1500</p>
                    <div style={{ width: '100%', height: 1500 * gs, position: 'relative', overflow: 'hidden', borderRadius: 4 }}>
                      <div style={{ width: 1500, height: 1500, transform: `scale(${gs})`, transformOrigin: 'top left', position: 'absolute' }}>
                        {isGIcons
                          ? <CanvasContentGalleryIcons design={gd} settings={{ ...designState.gallery, layoutFlipped: false }} />
                          : <CanvasContentGallery      design={gd} settings={{ ...designState.gallery, layoutFlipped: false }} />
                        }
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TemplateModeProps {
  projectId?: string
  designState: DesignState
  folderConfig: FolderConfig
  exportFnRef: React.MutableRefObject<() => void>
  exportCurrentFnRef: React.MutableRefObject<() => void>
  renderAllFnRef: React.MutableRefObject<() => void>
  previewFnRef: React.MutableRefObject<() => void>
  onCanExportChange: (can: boolean) => void
  onCanExportCurrentChange: (can: boolean) => void
  onRenderingAllChange: (v: boolean) => void
  onStatsChange: (rendered: number, total: number) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemplateMode({
  projectId,
  designState, folderConfig,
  exportFnRef, exportCurrentFnRef, renderAllFnRef, previewFnRef,
  onCanExportChange, onCanExportCurrentChange, onRenderingAllChange, onStatsChange,
}: TemplateModeProps) {
  // Per-project storage key — isolates state between Dashboard projects
  const storageKey = projectId ? `${STORAGE_KEY}-${projectId}` : STORAGE_KEY
  const storageKeyRef = useRef(storageKey)
  storageKeyRef.current = storageKey

  // Restore from sessionStorage on first mount (lazy, synchronous)
  const _svRef = useRef<Record<string, unknown> | undefined>(undefined)
  if (_svRef.current === undefined) {
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) : null
      _svRef.current = raw ? JSON.parse(raw) as Record<string, unknown> : {}
    } catch { _svRef.current = {} }
  }
  const sv = _svRef.current

  // CSV
  const [parseResult, setParseResult] = useState<ParseResult | null>((sv.parseResult as ParseResult) ?? null)
  const [csvFilename, setCsvFilename] = useState<string>(typeof sv.csvFilename === 'string' ? sv.csvFilename : '')
  const [isDragging, setIsDragging]   = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Selection
  const [selectedId, setSelectedId]             = useState<string | null>(typeof sv.selectedId === 'string' ? sv.selectedId : null)
  const [activeSlotIdx, setActiveSlotIdx]       = useState(typeof sv.activeSlotIdx === 'number' ? sv.activeSlotIdx : 0)
  const [activeIsGallery, setActiveIsGallery]   = useState(typeof sv.activeIsGallery === 'boolean' ? sv.activeIsGallery : false)
  const [activeGalleryIdx, setActiveGalleryIdx] = useState(typeof sv.activeGalleryIdx === 'number' ? sv.activeGalleryIdx : 0)

  // Per-product per-slot state
  const [allSlots, setAllSlots]               = useState<Record<string, TemplateSlotState[]>>((sv.allSlots as Record<string, TemplateSlotState[]>) ?? {})
  const [allGallerySlots, setAllGallerySlots] = useState<Record<string, TemplateSlotState[]>>((sv.allGallerySlots as Record<string, TemplateSlotState[]>) ?? {})

  // Per-product editable name overrides (affects export naming)
  const [productNames, setProductNames] = useState<Record<string, string>>((sv.productNames as Record<string, string>) ?? {})

  // Per-product render status
  const [statuses, setStatuses] = useState<Record<string, ProductStatus>>({})

  // Slot config (global)
  const [aplusSlots, setAplusSlots]         = useState(typeof sv.aplusSlots === 'number' ? sv.aplusSlots : 5)
  const [slotConfigs, setSlotConfigs]       = useState<SlotConfig[]>(Array.isArray(sv.slotConfigs) ? sv.slotConfigs as SlotConfig[] : defaultSlotConfigs(5))
  const [galleryCount, setGalleryCount]     = useState(typeof sv.galleryCount === 'number' ? sv.galleryCount : 2)
  const [galleryConfigs, setGalleryConfigs] = useState<GallerySlotConfig[]>(Array.isArray(sv.galleryConfigs) ? sv.galleryConfigs as GallerySlotConfig[] : defaultGalleryConfigs(2))
  const [outputFormat, setOutputFormat]     = useState<'png' | 'jpeg'>(sv.outputFormat === 'jpeg' ? 'jpeg' : 'png')

  // Global branding
  const [logoAsset, setLogoAsset]       = useState<UploadedAsset | null>((sv.logoAsset as UploadedAsset) ?? null)
  const [textureAsset, setTextureAsset] = useState<UploadedAsset | null>((sv.textureAsset as UploadedAsset) ?? null)

  // Pickers
  const [photoPickerOpen, setPhotoPickerOpen]     = useState(false)
  const [iconPickerOpen, setIconPickerOpen]       = useState(false)
  const [iconPickerSlotIdx, setIconPickerSlotIdx] = useState(0)

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false)

  // Render / export
  const [renderingAll, setRenderingAll] = useState(false)
  const capturedRef   = useRef<Map<string, string>>(new Map())
  const cancelRef     = useRef(false)
  const [captureVersion, setCaptureVersion] = useState(0)  // bumped on any capture mutation

  // ── Canvas zoom / pan ─────────────────────────────────────────────────────────
  const [zoom, setZoom]               = useState(0.12)
  const [pan, setPan]                 = useState({ x: 40, y: 40 })
  const zoomRef                       = useRef(0.12)
  const [spaceDown, setSpaceDown]     = useState(false)
  const [isPanDragging, setIsPanDragging] = useState(false)
  const panOriginRef  = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const wrapperRef    = useRef<HTMLDivElement | null>(null)
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null)
  const wrapperRefCallback = useCallback((el: HTMLDivElement | null) => {
    wrapperRef.current = el
    setCanvasEl(el)
  }, [])

  const fitView = useCallback(() => {
    const el = wrapperRef.current; if (!el) return
    const vw = el.clientWidth; const vh = el.clientHeight
    const PADDING = 56
    const aplusH  = aplusSlots  * 600  + Math.max(0, aplusSlots  - 1) * SLOT_GAP
    const galH    = galleryCount * 1500 + Math.max(0, galleryCount - 1) * SLOT_GAP
    const totalH  = Math.max(aplusH, galH, 600)
    const z = Math.min((vw - PADDING * 2) / CANVAS_W, (vh - PADDING * 2) / totalH, 1)
    const px = Math.max(PADDING, (vw - CANVAS_W * z) / 2)
    const py = Math.max(PADDING, (vh - totalH * z) / 2)
    zoomRef.current = z; setZoom(z); setPan({ x: px, y: py })
  }, [aplusSlots, galleryCount])

  const adjustZoom = (factor: number) => {
    const el = wrapperRef.current; if (!el) return
    const cx = el.clientWidth / 2; const cy = el.clientHeight / 2
    const prevZ = zoomRef.current
    const newZ  = Math.max(0.05, Math.min(4, prevZ * factor))
    const ratio = newZ / prevZ
    zoomRef.current = newZ; setZoom(newZ)
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
    const o = panOriginRef.current; if (!o) return
    setPan({ x: o.px + (e.clientX - o.mx), y: o.py + (e.clientY - o.my) })
  }
  const handleViewportMouseUp = () => { panOriginRef.current = null; setIsPanDragging(false) }

  useEffect(() => {
    const el = canvasEl; if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const rect  = el.getBoundingClientRect()
        const cx    = e.clientX - rect.left; const cy = e.clientY - rect.top
        const factor = Math.exp(-e.deltaY * 0.008)
        const prevZ  = zoomRef.current
        const newZ   = Math.max(0.05, Math.min(4, prevZ * factor))
        const ratio  = newZ / prevZ
        zoomRef.current = newZ; setZoom(newZ)
        setPan(p => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }))
      } else {
        setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [canvasEl])

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (canvasEl) fitView() }, [canvasEl])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedId && canvasEl) fitView() }, [selectedId])

  // ── Init ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!logoAsset) {
      fetch(`/api/canto/folder?albumId=${DEFAULT_LOGO_ALBUM}`)
        .then(r => r.json())
        .then((items: { id: string; name: string; previewUrl: string }[]) => {
          const logo = items.find(i => i.id === DEFAULT_LOGO_ID) ?? items.find(i => i.name === DEFAULT_LOGO_NAME)
          if (logo) setLogoAsset({ id: logo.id, name: logo.name, url: logo.previewUrl, type: 'image' })
        })
        .catch(() => {})
    }
    if (!textureAsset) {
      const blocks = [...(designState.blocks ?? []), ...(designState.galleryBlocks ?? [])]
      const active  = designState.blocks?.find(b => b.id === designState.activeBlockId)
      const tex     = (active?.assets ?? blocks[0]?.assets ?? designState.assets)?.[1]
      if (tex?.url) setTextureAsset(tex)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist template mode state to localStorage
  useEffect(() => {
    try {
      if (!parseResult) { sessionStorage.removeItem(storageKeyRef.current); return }
      sessionStorage.setItem(storageKeyRef.current, JSON.stringify({
        parseResult, csvFilename, allSlots, allGallerySlots, productNames,
        aplusSlots, galleryCount, slotConfigs, galleryConfigs, outputFormat,
        selectedId, activeSlotIdx, activeIsGallery, activeGalleryIdx, logoAsset, textureAsset,
      }))
    } catch { /* ignore quota errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseResult, csvFilename, allSlots, allGallerySlots, productNames, aplusSlots, galleryCount, slotConfigs, galleryConfigs, outputFormat, selectedId, activeSlotIdx, activeIsGallery, activeGalleryIdx, logoAsset, textureAsset])

  useEffect(() => {
    setSlotConfigs(prev => defaultSlotConfigs(aplusSlots).map((d, i) => prev[i] ?? d))
  }, [aplusSlots])

  useEffect(() => {
    if (activeSlotIdx >= aplusSlots) setActiveSlotIdx(aplusSlots - 1)
  }, [aplusSlots, activeSlotIdx])

  useEffect(() => {
    setGalleryConfigs(prev => defaultGalleryConfigs(galleryCount).map((d, i) => prev[i] ?? d))
  }, [galleryCount])

  useEffect(() => {
    if (activeGalleryIdx >= galleryCount) setActiveGalleryIdx(Math.max(0, galleryCount - 1))
  }, [galleryCount, activeGalleryIdx])

  // ── Callbacks to parent ───────────────────────────────────────────────────────

  useEffect(() => {
    const products = parseResult?.products ?? []
    const rendered = products.filter(p => statuses[p.id] === 'done').length
    onStatsChange(rendered, products.length)
    onCanExportChange(products.length > 0)
    // Enable "Export Current" whenever a product is selected — handleExportCurrent auto-renders if needed
    onCanExportCurrentChange(!!selectedId && (parseResult?.products ?? []).some(p => p.id === selectedId))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, parseResult, selectedId, captureVersion])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onRenderingAllChange(renderingAll) }, [renderingAll])

  useEffect(() => { previewFnRef.current = () => setPreviewOpen(true) }, [previewFnRef])

  // ── CSV ───────────────────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) return
    setCsvFilename(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const result = parseCSV(e.target?.result as string, { requireSku: false })

      // Derive slot/gallery counts from the new CSV — never inherit from a previous project
      const first = result.products[0]
      const newAplusSlots   = Math.max(1, first?.slots.length ?? 5)
      const newGalleryCount = Math.max(0, first?.gallerySlots?.length ?? 0)

      setParseResult(result)
      setSelectedId(result.products[0]?.id ?? null)
      setActiveSlotIdx(0)
      setActiveIsGallery(false)
      setActiveGalleryIdx(0)
      setProductNames({})
      setAplusSlots(newAplusSlots)
      setGalleryCount(newGalleryCount)

      const initSlots:   Record<string, TemplateSlotState[]> = {}
      const initGallery: Record<string, TemplateSlotState[]> = {}

      for (const product of result.products) {
        initSlots[product.id] = Array.from({ length: newAplusSlots }, (_, j) => {
          const s = product.slots[j]
          const callouts = (s?.iconCallouts ?? ['', '', '', '']) as [string, string, string, string]
          const filled   = callouts.filter(Boolean).length
          return {
            title:      s?.title ? `<p>${s.title}</p>` : '',
            desc:       s?.desc  ? `<p>${s.desc}</p>`  : '',
            iconLabels: callouts,
            iconCount:  (Math.min(Math.max(filled, 2), 4)) as 2 | 3 | 4,
            iconAssets: [undefined, undefined, undefined, undefined],
          }
        })
        initGallery[product.id] = Array.from({ length: newGalleryCount }, (_, g) => {
          const s = product.gallerySlots?.[g]
          const callouts = (s?.iconCallouts ?? ['', '', '', '']) as [string, string, string, string]
          const filled   = callouts.filter(Boolean).length
          return {
            title:      s?.title ? `<p>${s.title}</p>` : '',
            desc:       s?.desc  ? `<p>${s.desc}</p>`  : '',
            iconLabels: callouts,
            iconCount:  (Math.min(Math.max(filled, 2), 4)) as 2 | 3 | 4,
            iconAssets: [undefined, undefined, undefined, undefined],
          }
        })
      }

      // Auto-detect slot templates from first product's slot data
      if (first) {
        const detectedAplus: SlotConfig[] = Array.from({ length: newAplusSlots }, (_, j) => {
          const s = first.slots[j]
          const hasIcons = s?.iconCallouts.some(Boolean) ?? false
          const hasDesc  = Boolean(s?.desc)
          let template: SlotTemplate
          if (hasIcons && hasDesc) template = 'icons-text'
          else if (hasIcons)       template = 'icons'
          else if (j % 2 === 0)   template = '5050-right'
          else                    template = '5050-left'
          return { template }
        })
        setSlotConfigs(detectedAplus)

        const detectedGallery: GallerySlotConfig[] = Array.from({ length: newGalleryCount }, (_, g) => {
          const s = first.gallerySlots?.[g]
          const hasIcons = s?.iconCallouts.some(Boolean) ?? false
          const hasDesc  = Boolean(s?.desc)
          let template: GalleryTemplate
          if (hasIcons && hasDesc) template = 'gallery-icons-text'
          else if (hasIcons)       template = 'gallery-icons'
          else                     template = 'gallery-hero'
          return { template }
        })
        setGalleryConfigs(detectedGallery)
      }

      setAllSlots(initSlots)
      setAllGallerySlots(initGallery)
      setStatuses({})
      capturedRef.current.clear()
      setCaptureVersion(0)
      onCanExportChange(false)
      onCanExportCurrentChange(false)
      onStatsChange(0, result.products.length)
    }
    reader.readAsText(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCanExportChange, onCanExportCurrentChange, onStatsChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])

  const handleClear = () => {
    setParseResult(null); setCsvFilename(''); setSelectedId(null)
    setAllSlots({}); setAllGallerySlots({}); setStatuses({})
    setProductNames({})
    setAplusSlots(5); setSlotConfigs(defaultSlotConfigs(5))
    setGalleryCount(2); setGalleryConfigs(defaultGalleryConfigs(2))
    capturedRef.current.clear(); setCaptureVersion(0)
    onCanExportChange(false); onCanExportCurrentChange(false); onStatsChange(0, 0)
    if (fileInputRef.current) fileInputRef.current.value = ''
    try { sessionStorage.removeItem(storageKeyRef.current) } catch { /* ignore */ }
  }

  // ── Slot state helpers ────────────────────────────────────────────────────────

  const getSlotState = (productId: string, slotIdx: number): TemplateSlotState =>
    allSlots[productId]?.[slotIdx] ?? emptySlotState()

  const patchSlotState = (productId: string, slotIdx: number, patch: Partial<TemplateSlotState>) => {
    setAllSlots(prev => {
      const existing = prev[productId] ?? Array.from({ length: aplusSlots }, emptySlotState)
      return { ...prev, [productId]: existing.map((s, i) => i === slotIdx ? { ...s, ...patch } : s) }
    })
    setStatuses(prev => ({ ...prev, [productId]: 'draft' }))
    Array.from(capturedRef.current.keys()).filter(k => k.startsWith(`${productId}/`)).forEach(k => capturedRef.current.delete(k))
    setCaptureVersion(v => v + 1)
  }

  const getGallerySlotState = (productId: string, slotIdx: number): TemplateSlotState =>
    allGallerySlots[productId]?.[slotIdx] ?? emptySlotState()

  const patchGallerySlotState = (productId: string, slotIdx: number, patch: Partial<TemplateSlotState>) => {
    setAllGallerySlots(prev => {
      const existing = prev[productId] ?? Array.from({ length: galleryCount }, emptySlotState)
      return { ...prev, [productId]: existing.map((s, i) => i === slotIdx ? { ...s, ...patch } : s) }
    })
    setStatuses(prev => ({ ...prev, [productId]: 'draft' }))
    Array.from(capturedRef.current.keys()).filter(k => k.startsWith(`${productId}/`)).forEach(k => capturedRef.current.delete(k))
    setCaptureVersion(v => v + 1)
  }

  const deleteAplusSlot = (idx: number) => {
    setAplusSlots(n => Math.max(1, n - 1))
    setSlotConfigs(prev => [...prev.slice(0, idx), ...prev.slice(idx + 1)])
    setAllSlots(prev => {
      const result: Record<string, TemplateSlotState[]> = {}
      for (const pid of Object.keys(prev)) {
        const slots = prev[pid] ?? []
        result[pid] = [...slots.slice(0, idx), ...slots.slice(idx + 1)]
      }
      return result
    })
    setActiveSlotIdx(a => a > idx ? a - 1 : Math.min(a, Math.max(0, aplusSlots - 2)))
  }

  const deleteGallerySlot = (idx: number) => {
    setGalleryCount(n => Math.max(0, n - 1))
    setGalleryConfigs(prev => [...prev.slice(0, idx), ...prev.slice(idx + 1)])
    setAllGallerySlots(prev => {
      const result: Record<string, TemplateSlotState[]> = {}
      for (const pid of Object.keys(prev)) {
        const slots = prev[pid] ?? []
        result[pid] = [...slots.slice(0, idx), ...slots.slice(idx + 1)]
      }
      return result
    })
    setActiveGalleryIdx(a => a > idx ? a - 1 : Math.min(a, Math.max(0, galleryCount - 2)))
  }

  const fallbackAsset = (slotIndex: number): UploadedAsset | undefined => {
    const blocks = [...(designState.blocks ?? []), ...(designState.galleryBlocks ?? [])]
    const active  = designState.blocks?.find(b => b.id === designState.activeBlockId)
    const seen    = new Set<string>()
    for (const b of [...(active ? [active] : []), ...blocks]) {
      if (seen.has(b.id)) continue; seen.add(b.id)
      const a = (b.assets ?? [])[slotIndex]; if (a?.url) return a
    }
    return undefined
  }

  const buildSlotDesign = (productId: string, slotIdx: number): DesignState => {
    const s = getSlotState(productId, slotIdx)
    const cfg = slotConfigs[slotIdx] ?? { template: '5050-right' }
    // 'icons' template shows no description; only 'icons-text', '5050-right', '5050-left' do
    const showDesc = cfg.template !== 'icons'
    return {
      ...designState,
      assets: [s.photoAsset, textureAsset ?? fallbackAsset(1), logoAsset ?? fallbackAsset(2), s.iconAssets[0], s.iconAssets[1], s.iconAssets[2], s.iconAssets[3]] as UploadedAsset[],
      title: s.title || '<p></p>', subtitleHtml: showDesc ? (s.desc || '') : '', iconLabels: s.iconLabels, iconCount: s.iconCount,
      iconsMobileShowDesc: cfg.mobileShowDesc ?? true,
    }
  }

  const buildGallerySlotDesign = (productId: string, slotIdx: number): DesignState => {
    const s = getGallerySlotState(productId, slotIdx)
    const cfg = galleryConfigs[slotIdx] ?? { template: 'gallery-hero' }
    return {
      ...designState,
      assets: [s.photoAsset, textureAsset ?? fallbackAsset(1), logoAsset ?? fallbackAsset(2), s.iconAssets[0], s.iconAssets[1], s.iconAssets[2], s.iconAssets[3]] as UploadedAsset[],
      title: s.title || '<p></p>', subtitleHtml: s.desc || '', iconLabels: s.iconLabels, iconCount: s.iconCount,
      galleryIconsShowDescription: cfg.template === 'gallery-icons-text',
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const renderProduct = useCallback(async (product: BulkProduct) => {
    setStatuses(prev => ({ ...prev, [product.id]: 'rendering' }))
    Array.from(capturedRef.current.keys()).filter(k => k.startsWith(`${product.id}/`)).forEach(k => capturedRef.current.delete(k))

    // A+ slots: desktop + mobile
    for (let j = 0; j < aplusSlots; j++) {
      if (cancelRef.current) break
      const cfg  = slotConfigs[j] ?? { template: '5050-right' }
      const flip = cfg.template === '5050-left'
      const isIcons = cfg.template === 'icons' || cfg.template === 'icons-text'
      const sd  = buildSlotDesign(product.id, j)
      const lbl = slotLabel(j).toLowerCase()

      const d = await captureToDataUrl(
        isIcons
          ? <CanvasContentIcons design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
          : <CanvasContent      design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />,
        1464, 600, outputFormat)
      if (d) capturedRef.current.set(`${product.id}/${lbl}-desktop`, d)

      const m = await captureToDataUrl(
        isIcons
          ? <CanvasContentIcons design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
          : <CanvasContent      design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />,
        600, 450, outputFormat)
      if (m) capturedRef.current.set(`${product.id}/${lbl}-mobile`, m)
    }

    // Gallery slides
    for (let g = 0; g < galleryCount; g++) {
      if (cancelRef.current) break
      const cfg     = galleryConfigs[g] ?? { template: 'gallery-hero' }
      const isGIcons = cfg.template === 'gallery-icons' || cfg.template === 'gallery-icons-text'
      const gd      = buildGallerySlotDesign(product.id, g)

      const gi = await captureToDataUrl(
        isGIcons
          ? <CanvasContentGalleryIcons design={gd} settings={{ ...designState.gallery, layoutFlipped: false }} />
          : <CanvasContentGallery      design={gd} settings={{ ...designState.gallery, layoutFlipped: false }} />,
        1500, 1500, outputFormat)
      if (gi) capturedRef.current.set(`${product.id}/g${g + 1}-gallery`, gi)
    }

    const ok = !cancelRef.current
    setStatuses(prev => ({ ...prev, [product.id]: ok ? 'done' : 'draft' }))
    setCaptureVersion(v => v + 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplusSlots, slotConfigs, galleryCount, galleryConfigs, outputFormat, designState, textureAsset, logoAsset, allSlots, allGallerySlots])

  const renderAll = useCallback(async () => {
    if (renderingAll) { cancelRef.current = true; return }
    if ((parseResult?.products ?? []).length === 0) return
    cancelRef.current = false
    setRenderingAll(true)
    for (const p of parseResult!.products) {
      if (cancelRef.current) break
      await renderProduct(p)
    }
    setRenderingAll(false)
  }, [renderingAll, parseResult, renderProduct])

  // ── Export ────────────────────────────────────────────────────────────────────

  const handleExportAll = useCallback(async () => {
    if (!parseResult?.products.length) return

    // Auto-render any products not yet captured
    const unrendered = parseResult.products.filter(p => statuses[p.id] !== 'done')
    if (unrendered.length > 0) {
      cancelRef.current = false
      setRenderingAll(true)
      for (const p of unrendered) {
        if (cancelRef.current) break
        await renderProduct(p)
      }
      setRenderingAll(false)
    }

    if (capturedRef.current.size === 0) return
    const JSZip = (await import('jszip')).default
    const zip   = new JSZip()
    const ext   = outputFormat === 'jpeg' ? 'jpg' : 'png'
    capturedRef.current.forEach((dataUrl, key) => {
      const slash = key.indexOf('/')
      const pid   = key.slice(0, slash)
      const lbl   = key.slice(slash + 1)
      const product = parseResult?.products.find(p => p.id === pid)
      const name = (productNames[pid] !== undefined && productNames[pid] !== ''
        ? productNames[pid]
        : product?.productName) || product?.sku || pid
      zip.folder(name)!.file(`${name}-${lbl}.${ext}`, dataUrl.split(',')[1], { base64: true })
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'template-export.zip' })
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href)
  }, [outputFormat, parseResult, productNames, statuses, renderProduct])

  const handleExportCurrent = useCallback(async () => {
    if (!selectedId) return
    const product = parseResult?.products.find(p => p.id === selectedId)
    if (!product) return
    // Auto-render current product if not yet done
    if (statuses[selectedId] !== 'done') {
      await renderProduct(product)
    }
    const entries = Array.from(capturedRef.current.entries()).filter(([k]) => k.startsWith(`${selectedId}/`))
    if (entries.length === 0) return
    const JSZip = (await import('jszip')).default
    const zip   = new JSZip()
    const ext   = outputFormat === 'jpeg' ? 'jpg' : 'png'
    const effectiveName = (productNames[selectedId] !== undefined && productNames[selectedId] !== ''
      ? productNames[selectedId]
      : product.productName) || product.sku || selectedId
    entries.forEach(([k, d]) => zip.file(`${effectiveName}-${k.slice(k.indexOf('/') + 1)}.${ext}`, d.split(',')[1], { base64: true }))
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${effectiveName}.zip` })
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href)
  }, [outputFormat, parseResult, selectedId, productNames, statuses, renderProduct])

  // Wire refs for parent
  useEffect(() => { exportFnRef.current    = handleExportAll     }, [exportFnRef, handleExportAll])
  useEffect(() => { exportCurrentFnRef.current = handleExportCurrent }, [exportCurrentFnRef, handleExportCurrent])
  useEffect(() => { renderAllFnRef.current = renderAll           }, [renderAllFnRef, renderAll])

  // ── Derived ───────────────────────────────────────────────────────────────────

  const products      = parseResult?.products ?? []
  const selected      = products.find(p => p.id === selectedId) ?? null
  const selectedIdx   = selected ? products.indexOf(selected) : -1
  const selectedStatus= selected ? (statuses[selected.id] ?? 'draft') : 'draft'

  // Active slot state
  const activeSlot = selected
    ? (activeIsGallery ? getGallerySlotState(selected.id, activeGalleryIdx) : getSlotState(selected.id, activeSlotIdx))
    : emptySlotState()

  const activeCfgAplus   = slotConfigs[activeSlotIdx]   ?? { template: '5050-right' }
  const activeCfgGallery = galleryConfigs[activeGalleryIdx] ?? { template: 'gallery-hero' }
  const isIconsSlot = activeIsGallery
    ? activeCfgGallery.template === 'gallery-icons' || activeCfgGallery.template === 'gallery-icons-text'
    : activeCfgAplus.template === 'icons' || activeCfgAplus.template === 'icons-text'
  const showDescription = activeIsGallery
    ? activeCfgGallery.template !== 'gallery-icons'
    : activeCfgAplus.template !== 'icons'

  const patchActive = (patch: Partial<TemplateSlotState>) => {
    if (!selected) return
    if (activeIsGallery) patchGallerySlotState(selected.id, activeGalleryIdx, patch)
    else                 patchSlotState(selected.id, activeSlotIdx, patch)
  }

  // Build preview data
  const aplusPreviewDesigns = selected
    ? slotConfigs.slice(0, aplusSlots).map((cfg, i) => ({ design: buildSlotDesign(selected.id, i), cfg, label: slotLabel(i) }))
    : []
  const galleryPreviewDesigns = selected
    ? galleryConfigs.slice(0, galleryCount).map((cfg, i) => ({ design: buildGallerySlotDesign(selected.id, i), cfg, label: galleryLabel(i) }))
    : []

  const StatusDot = ({ status }: { status: ProductStatus }) => {
    if (status === 'rendering') return (
      <svg className="animate-spin w-3 h-3 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    )
    if (status === 'done')  return <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
    if (status === 'error') return <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
    return <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-200 dark:border-gray-600 shrink-0" />
  }

  // ─── CSV upload empty state ───────────────────────────────────────────────────

  if (!parseResult) {
    return (
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: upload form ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-16 py-12 bg-white dark:bg-gray-900">
          <div className="w-full max-w-sm">

            {/* Heading */}
            <div className="mb-8">
              <h1 className="text-[26px] font-bold text-gray-900 dark:text-white leading-tight mb-2.5">
                Batch-generate product<br />slides in minutes.
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Upload a CSV with your product data to generate A+ content and gallery slides for every SKU — all at once.
              </p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full rounded-xl border-2 p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                isDragging
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-gray-50 dark:bg-gray-800/40 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                isDragging ? 'bg-indigo-100 dark:bg-indigo-900/60' : 'bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700'
              }`}>
                <svg className={`w-6 h-6 transition-colors ${isDragging ? 'text-indigo-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {isDragging ? 'Drop to import' : 'Drop your CSV here'}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  or <span className="text-indigo-500 dark:text-indigo-400 font-medium">click to browse</span>
                </p>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>

            {/* Column reference */}
            <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
              <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                <span className="font-semibold text-gray-500 dark:text-gray-400">A+:</span>{' '}
                <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded border border-gray-200 dark:border-gray-700 text-[10px]">a1_title</code>{' '}
                <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded border border-gray-200 dark:border-gray-700 text-[10px]">a1_desc</code>{' '}
                <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded border border-gray-200 dark:border-gray-700 text-[10px]">b1_title</code>…
                <br />
                <span className="font-semibold text-gray-500 dark:text-gray-400">Gallery:</span>{' '}
                <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded border border-gray-200 dark:border-gray-700 text-[10px]">g1_title</code>{' '}
                <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded border border-gray-200 dark:border-gray-700 text-[10px]">g1_desc</code>{' '}
                <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded border border-gray-200 dark:border-gray-700 text-[10px]">g2_title</code>…
              </p>
            </div>

            {/* Download template */}
            <button
              onClick={e => { e.stopPropagation(); downloadTemplate() }}
              className="mt-3 w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-[12px] font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 border border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17a9 9 0 1118 0H3z" />
              </svg>
              Download template CSV
            </button>
          </div>
        </div>

        {/* ── Right: placeholder ── */}
        <div className="w-[45%] shrink-0 relative overflow-hidden border-l border-gray-100 dark:border-gray-800 bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50 dark:from-indigo-950/50 dark:via-purple-950/30 dark:to-blue-950/40 flex items-center justify-center">
          {/* Dot grid */}
          <div className="absolute inset-0 opacity-30 dark:opacity-15" style={{
            backgroundImage: 'radial-gradient(circle, #6366f1 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />
          {/* Fake slide previews */}
          <div className="relative flex flex-col items-center gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.22, transform: `scale(${1 - i * 0.06})` }}>
                <div className="w-48 h-20 rounded-lg bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/90 dark:border-gray-700/60 shadow-md flex items-center gap-3 px-3 overflow-hidden">
                  <div className="w-14 h-14 rounded-md bg-indigo-100 dark:bg-indigo-900/50 shrink-0 flex items-center justify-center">
                    <svg className="w-6 h-6 text-indigo-300 dark:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-600 w-full" />
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 w-3/4" />
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 w-1/2" />
                  </div>
                </div>
                <div className="w-10 h-10 rounded-lg bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/90 dark:border-gray-700/60 shadow-md flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-indigo-200 dark:text-indigo-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            ))}
            <p className="mt-2 text-[11px] font-semibold text-indigo-300 dark:text-indigo-600 uppercase tracking-widest">Your slides will appear here</p>
          </div>
        </div>

      </div>
    )
  }

  // ─── Main layout ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ══ LEFT SIDEBAR ══════════════════════════════════════════════════════════ */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm z-10">

        {/* Product navigator */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSelectedId(products[selectedIdx - 1]?.id ?? null); setActiveSlotIdx(0); setActiveIsGallery(false) }}
              disabled={selectedIdx <= 0}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex-1 min-w-0">
              {selected ? (
                <>
                  <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate leading-tight">
                    {selected.productName || `Product ${selectedIdx + 1}`}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {selectedIdx + 1} of {products.length}
                    {selectedStatus === 'done'      && ' · Rendered'}
                    {selectedStatus === 'rendering' && ' · Rendering…'}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-gray-400">No product selected</p>
              )}
            </div>
            <button
              onClick={() => { setSelectedId(products[selectedIdx + 1]?.id ?? null); setActiveSlotIdx(0); setActiveIsGallery(false) }}
              disabled={selectedIdx >= products.length - 1 || !selected}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          {/* Editable export name — overrides CSV productName in export file/folder naming */}
          {selected && (
            <div className="mt-2">
              <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 block mb-1">Export Name</label>
              <input
                type="text"
                value={productNames[selected.id] !== undefined ? productNames[selected.id] : (selected.productName || '')}
                onChange={e => setProductNames(prev => ({ ...prev, [selected.id]: e.target.value }))}
                placeholder={selected.sku || 'export-folder-name'}
                className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
              />
            </div>
          )}
        </div>

        {/* Slot tabs — A+ and Gallery */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-700 space-y-2.5">
          {/* A+ slots */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">A+ Slots</p>
            <div className="flex gap-1 flex-wrap">
              {slotConfigs.slice(0, aplusSlots).map((cfg, idx) => (
                <div key={idx} className="relative group">
                  <button
                    onClick={() => { setActiveSlotIdx(idx); setActiveIsGallery(false) }}
                    className={`flex flex-col items-center px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                      !activeIsGallery && idx === activeSlotIdx
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span>{slotLabel(idx)}</span>
                    <span className={`text-[8px] mt-0.5 font-medium ${!activeIsGallery && idx === activeSlotIdx ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}>
                      {APLUS_LABELS[cfg.template]}
                    </span>
                  </button>
                  {aplusSlots > 1 && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteAplusSlot(idx) }}
                      title="Remove slot"
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-gray-400 dark:bg-gray-500 text-white items-center justify-center hidden group-hover:flex hover:bg-red-500 transition-colors"
                    >
                      <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {aplusSlots < 10 && (
                <button
                  onClick={() => setAplusSlots(n => Math.min(10, n + 1))}
                  title="Add A+ slot"
                  className="flex items-center justify-center px-2 py-1 rounded text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 transition-all"
                >
                  +
                </button>
              )}
            </div>
          </div>
          {/* Gallery slots */}
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">Gallery</p>
            <div className="flex gap-1 flex-wrap">
              {galleryConfigs.slice(0, galleryCount).map((cfg, idx) => (
                <div key={idx} className="relative group">
                  <button
                    onClick={() => { setActiveGalleryIdx(idx); setActiveIsGallery(true) }}
                    className={`flex flex-col items-center px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                      activeIsGallery && idx === activeGalleryIdx
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span>{galleryLabel(idx)}</span>
                    <span className={`text-[8px] mt-0.5 font-medium ${activeIsGallery && idx === activeGalleryIdx ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}>
                      {GALLERY_LABELS[cfg.template]}
                    </span>
                  </button>
                  {galleryCount > 1 && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteGallerySlot(idx) }}
                      title="Remove slide"
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-gray-400 dark:bg-gray-500 text-white items-center justify-center hidden group-hover:flex hover:bg-red-500 transition-colors"
                    >
                      <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {galleryCount < 10 && (
                <button
                  onClick={() => setGalleryCount(n => Math.min(10, n + 1))}
                  title="Add gallery slide"
                  className="flex items-center justify-center px-2 py-1 rounded text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 transition-all"
                >
                  +
                </button>
              )}
            </div>
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
                {/* Gallery template switcher */}
                {activeIsGallery && (
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Template</label>
                    <div className="flex gap-1">
                      {(['gallery-hero', 'gallery-icons', 'gallery-icons-text'] as const).map(t => (
                        <button key={t}
                          onClick={() => setGalleryConfigs(prev => prev.map((c, i) => i === activeGalleryIdx ? { template: t } : c))}
                          className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all ${activeCfgGallery.template === t ? 'bg-gray-900 dark:bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'}`}
                        >
                          {GALLERY_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Title — rich text */}
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Title</label>
                  <RichTextEditor
                    value={activeSlot.title}
                    onChange={html => patchActive({ title: html })}
                    placeholder="Slot title…"
                  />
                </div>

                {/* Description — rich text (non-icons and icons-text variants) */}
                {showDescription && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</label>
                      {/* Mobile description toggle — only for A+ icons-text slots */}
                      {!activeIsGallery && activeCfgAplus.template === 'icons-text' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-gray-400 dark:text-gray-500">Mobile</span>
                          <button
                            onClick={() => setSlotConfigs(prev => prev.map((c, i) => i === activeSlotIdx ? { ...c, mobileShowDesc: !(c.mobileShowDesc ?? true) } : c))}
                            title="Show description on mobile"
                            className={`relative w-8 h-4 rounded-full transition-colors ${(activeCfgAplus.mobileShowDesc ?? true) ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}
                          >
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${(activeCfgAplus.mobileShowDesc ?? true) ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                      )}
                    </div>
                    <RichTextEditor
                      value={activeSlot.desc}
                      onChange={html => patchActive({ desc: html })}
                      placeholder="Product description…"
                    />
                  </div>
                )}

                {/* Icon labels (icons slots) */}
                {isIconsSlot && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Icon Labels</label>
                      <div className="flex gap-1">
                        {([2, 3, 4] as const).map(n => (
                          <button key={n} onClick={() => patchActive({ iconCount: n })}
                            className={`w-6 h-6 rounded text-[10px] font-bold transition-all ${activeSlot.iconCount === n ? 'bg-gray-900 dark:bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'}`}
                          >{n}</button>
                        ))}
                      </div>
                    </div>
                    {Array.from({ length: activeSlot.iconCount }, (_, i) => (
                      <input key={i} type="text" value={activeSlot.iconLabels[i]}
                        onChange={e => {
                          const next = [...activeSlot.iconLabels] as [string, string, string, string]
                          next[i] = e.target.value
                          patchActive({ iconLabels: next })
                        }}
                        placeholder={`Icon ${i + 1} label…`}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 placeholder:text-gray-300 transition-all"
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
                {/* Product photo — shown for all slot types */}
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Product Photo</p>
                  {activeSlot.photoAsset ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 h-8 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={activeSlot.photoAsset.url} alt={activeSlot.photoAsset.name} className="w-full h-full object-cover" />
                      </div>
                      <button onClick={() => setPhotoPickerOpen(true)} className="flex-1 text-left text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 truncate transition-colors" title={activeSlot.photoAsset.name}>{activeSlot.photoAsset.name}</button>
                      <button onClick={() => patchActive({ photoAsset: undefined })}
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setPhotoPickerOpen(true)}
                      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-dashed border-gray-300 dark:border-gray-600 text-[10px] text-gray-400 hover:border-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      Pick from library
                    </button>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Background Texture</p>
                  <TexturePicker albumId={null} value={textureAsset} onChange={asset => setTextureAsset(asset)} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Brand Logo</p>
                  <TexturePicker albumId="QH34D" value={logoAsset} onChange={asset => setLogoAsset(asset)} placeholder="Pick logo…" thumbnailFit="contain" />
                </div>
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
                            <span className="text-[9px] font-semibold text-gray-400 w-12 shrink-0 truncate" title={iconLabel}>{iconLabel || `Icon ${i + 1}`}</span>
                            <div className="flex-1 flex items-center gap-1.5">
                              {iconAsset ? (
                                <>
                                  <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center overflow-hidden shrink-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={iconAsset.url} alt={iconAsset.name} className="max-w-full max-h-full object-contain p-0.5" />
                                  </div>
                                  <button onClick={() => { setIconPickerSlotIdx(i); setIconPickerOpen(true) }} className="flex-1 text-left text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 truncate transition-colors" title={iconAsset.name}>{iconAsset.name}</button>
                                  <button onClick={() => {
                                      const newIcons = [...activeSlot.iconAssets] as (UploadedAsset | undefined)[]
                                      newIcons[i] = undefined
                                      patchActive({ iconAssets: newIcons })
                                    }}
                                    className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => { setIconPickerSlotIdx(i); setIconPickerOpen(true) }}
                                  disabled={!folderConfig.iconsAlbumId}
                                  className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-dashed border-gray-300 dark:border-gray-600 text-[10px] text-gray-400 hover:border-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
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

          {/* Settings — moved from top bar */}
          <Section title="Settings" defaultOpen={false}>
            <div className="space-y-4">
              {/* A+ Slots stepper */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">A+ Slots</label>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setAplusSlots(n => Math.max(1, n - 1))}
                    className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors font-bold">−</button>
                  <span className="w-6 text-center text-[13px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">{aplusSlots}</span>
                  <button onClick={() => setAplusSlots(n => Math.min(10, n + 1))}
                    className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors font-bold">+</button>
                </div>
              </div>

              {/* Gallery Slides stepper */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Gallery Slides</label>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setGalleryCount(n => Math.max(0, n - 1))}
                    className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors font-bold">−</button>
                  <span className="w-6 text-center text-[13px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">{galleryCount}</span>
                  <button onClick={() => setGalleryCount(n => Math.min(10, n + 1))}
                    className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors font-bold">+</button>
                </div>
              </div>

              {/* Output format */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Output Format</label>
                <div className="flex gap-1">
                  {(['png', 'jpeg'] as const).map(f => (
                    <button key={f} onClick={() => setOutputFormat(f)}
                      className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all ${outputFormat === f ? 'bg-gray-900 dark:bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* CSV info + clear */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">CSV File</label>
                <div className="flex items-center gap-2 p-2.5 rounded bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                  <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span className="flex-1 min-w-0 text-[10px] text-gray-600 dark:text-gray-400 truncate">{csvFilename}</span>
                  <button onClick={handleClear} className="text-[10px] text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0 font-semibold">Clear</button>
                </div>
              </div>
            </div>
          </Section>
        </div>
        {/* No render button — use Export dropdown in header */}
      </aside>

      {/* ══ MAIN CANVAS AREA ════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50 dark:bg-gray-950">

        {/* ── Canvas viewport ── */}
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
          {spaceDown && <div className="absolute inset-0 z-20" style={{ cursor: isPanDragging ? 'grabbing' : 'grab' }} />}

          {!selected ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-gray-400">Select a product from the sidebar</p>
            </div>
          ) : (
            <div style={{
              position: 'absolute', top: 0, left: 0,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}>
              {/* Two columns: A+ (left) and Gallery (right) */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: COL_GAP }}>

                {/* ── Left: A+ slots ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: SLOT_GAP }}>
                  {slotConfigs.slice(0, aplusSlots).map((cfg, slotIdx) => {
                    const isActive = !activeIsGallery && slotIdx === activeSlotIdx
                    const isIcons  = cfg.template === 'icons' || cfg.template === 'icons-text'
                    const flip     = cfg.template === '5050-left'
                    const sd       = buildSlotDesign(selected.id, slotIdx)

                    const activeOutline  = '2px solid #3B82F6'
                    const activeShadow   = '0 0 0 4px rgba(59,130,246,0.15), 0 4px 24px rgba(0,0,0,0.18)'
                    const inactiveOutline= '2px solid transparent'
                    const inactiveShadow = '0 2px 12px rgba(0,0,0,0.10)'

                    return (
                      <div key={slotIdx}>
                        {/* Slot header — left anchor: label + template picker; right anchor: resolution + delete */}
                        <div style={{ height: `${28/zoom}px`, position: 'relative', marginBottom: `${8/zoom}px` }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, display: 'flex', alignItems: 'center', gap: 8, transform: `scale(${1/zoom})`, transformOrigin: 'top left' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#3B82F6' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', userSelect: 'none' }}>
                              {slotLabel(slotIdx)}
                            </span>
                            <div style={{ display: 'flex', gap: 2, background: '#E5E7EB', borderRadius: 4, padding: 2 }}>
                              {(['5050-right', '5050-left', 'icons', 'icons-text'] as SlotTemplate[]).map(t => (
                                <button key={t}
                                  onClick={e => {
                                    e.stopPropagation()
                                    setSlotConfigs(prev => prev.map((c, i) => i === slotIdx ? { template: t } : c))
                                    setActiveSlotIdx(slotIdx)
                                    setActiveIsGallery(false)
                                  }}
                                  style={{
                                    padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: 'none',
                                    background: cfg.template === t ? '#fff' : 'transparent',
                                    color: cfg.template === t ? '#111827' : '#6B7280',
                                    boxShadow: cfg.template === t ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                                    cursor: 'pointer',
                                  }}>
                                  {APLUS_LABELS[t]}
                                </button>
                              ))}
                            </div>
                          </div>
                          {aplusSlots > 1 && (
                            <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', alignItems: 'center', transform: `scale(${1/zoom})`, transformOrigin: 'top right' }}>
                              <button
                                onClick={e => { e.stopPropagation(); deleteAplusSlot(slotIdx) }}
                                title="Remove slot"
                                style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid #E5E7EB', background: 'white', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                              >
                                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Desktop + Mobile frames */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: FRAME_GAP }}>
                          <div onClick={() => { setActiveSlotIdx(slotIdx); setActiveIsGallery(false) }}
                            style={{ width: 1464, height: 600, position: 'relative', overflow: 'hidden', borderRadius: 4, flexShrink: 0, outline: isActive ? activeOutline : inactiveOutline, outlineOffset: 2, boxShadow: isActive ? activeShadow : inactiveShadow, cursor: 'pointer' }}>
                            {isIcons
                              ? <CanvasContentIcons design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                              : <CanvasContent      design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                            }
                          </div>
                          <div onClick={() => { setActiveSlotIdx(slotIdx); setActiveIsGallery(false) }}
                            style={{ width: 600, height: 450, position: 'relative', overflow: 'hidden', borderRadius: 4, flexShrink: 0, outline: isActive ? activeOutline : inactiveOutline, outlineOffset: 2, boxShadow: isActive ? activeShadow : inactiveShadow, cursor: 'pointer' }}>
                            {isIcons
                              ? <CanvasContentIcons design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                              : <CanvasContent      design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                            }
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ── Right: Gallery slides ── */}
                {galleryCount > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SLOT_GAP }}>
                    {/* Column label */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SLOT_GAP }}>
                      {galleryConfigs.slice(0, galleryCount).map((cfg, gIdx) => {
                        const isActive = activeIsGallery && gIdx === activeGalleryIdx
                        const isGIcons = cfg.template === 'gallery-icons' || cfg.template === 'gallery-icons-text'
                        const gd       = buildGallerySlotDesign(selected.id, gIdx)

                        const activeOutline  = '2px solid #3B82F6'
                        const activeShadow   = '0 0 0 4px rgba(59,130,246,0.15), 0 4px 24px rgba(0,0,0,0.18)'
                        const inactiveOutline= '2px solid transparent'
                        const inactiveShadow = '0 2px 12px rgba(0,0,0,0.10)'

                        return (
                          <div key={gIdx}>
                            {/* Gallery slot header — left anchor: label + picker; right anchor: resolution + delete */}
                            <div style={{ height: `${28/zoom}px`, position: 'relative', marginBottom: `${8/zoom}px` }}>
                              <div style={{ position: 'absolute', top: 0, left: 0, display: 'flex', alignItems: 'center', gap: 8, transform: `scale(${1/zoom})`, transformOrigin: 'top left' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#3B82F6' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', userSelect: 'none' }}>
                                  {galleryLabel(gIdx)}
                                </span>
                                <div style={{ display: 'flex', gap: 2, background: '#E5E7EB', borderRadius: 4, padding: 2 }}>
                                  {(['gallery-hero', 'gallery-icons', 'gallery-icons-text'] as GalleryTemplate[]).map(t => (
                                    <button key={t}
                                      onClick={e => {
                                        e.stopPropagation()
                                        setGalleryConfigs(prev => prev.map((c, i) => i === gIdx ? { template: t } : c))
                                        setActiveGalleryIdx(gIdx)
                                        setActiveIsGallery(true)
                                      }}
                                      style={{
                                        padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: 'none',
                                        background: cfg.template === t ? '#fff' : 'transparent',
                                        color: cfg.template === t ? '#111827' : '#6B7280',
                                        boxShadow: cfg.template === t ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                                        cursor: 'pointer',
                                      }}>
                                      {GALLERY_LABELS[t]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {galleryCount > 1 && (
                                <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', alignItems: 'center', transform: `scale(${1/zoom})`, transformOrigin: 'top right' }}>
                                  <button
                                    onClick={e => { e.stopPropagation(); deleteGallerySlot(gIdx) }}
                                    title="Remove slide"
                                    style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid #E5E7EB', background: 'white', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                  >
                                    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Gallery frame */}
                            <div onClick={() => { setActiveGalleryIdx(gIdx); setActiveIsGallery(true) }}
                              style={{ width: 1500, height: 1500, position: 'relative', overflow: 'hidden', borderRadius: 4, flexShrink: 0, outline: isActive ? activeOutline : inactiveOutline, outlineOffset: 2, boxShadow: isActive ? activeShadow : inactiveShadow, cursor: 'pointer' }}>
                              {isGIcons
                                ? <CanvasContentGalleryIcons design={gd} settings={{ ...designState.gallery, layoutFlipped: false }} />
                                : <CanvasContentGallery      design={gd} settings={{ ...designState.gallery, layoutFlipped: false }} />
                              }
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Zoom HUD — matches Design mode style */}
          <div className="absolute bottom-4 right-4 z-10 flex items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden">
            <button onClick={() => adjustZoom(1 / 1.25)}
              className="w-7 h-7 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-bold transition-colors"
              title="Zoom out">−</button>
            <button onClick={fitView}
              className="h-7 px-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors tabular-nums min-w-[44px] text-center"
              title="Fit view (F)">{Math.round(zoom * 100)}%</button>
            <button onClick={() => adjustZoom(1.25)}
              className="w-7 h-7 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-bold transition-colors"
              title="Zoom in">+</button>
          </div>
        </main>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      <CantoPhotoPickerModal
        open={photoPickerOpen}
        onClose={() => setPhotoPickerOpen(false)}
        initialQuery={selected?.sku ?? ''}
        onSelect={(pick: PhotoPick) => {
          if (!selected) return
          const asset: UploadedAsset = { id: pick.id, name: pick.name, url: pick.previewUrl, type: 'image' }
          if (activeIsGallery) patchGallerySlotState(selected.id, activeGalleryIdx, { photoAsset: asset })
          else                 patchSlotState(selected.id, activeSlotIdx, { photoAsset: asset })
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
          if (activeIsGallery) patchGallerySlotState(selected.id, activeGalleryIdx, { iconAssets: newIcons })
          else                 patchSlotState(selected.id, activeSlotIdx, { iconAssets: newIcons })
        }}
      />

      <TemplateModePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        aplusDesigns={aplusPreviewDesigns}
        galleryDesigns={galleryPreviewDesigns}
        designState={designState}
      />
    </div>
  )
}
