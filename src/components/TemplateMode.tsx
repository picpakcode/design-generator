'use client'

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { BulkProduct, ParseResult, parseCSV, productsToCSV, downloadTemplate } from '@/lib/csv'
import { DesignState, UploadedAsset, TemplateShareState } from '@/types'
import { saveTemplateState, loadTemplateState, stripTemplateBlobUrls } from '@/lib/db'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { CanvasContent, CanvasContentIcons, CanvasContentSplit, CanvasContentGallery, CanvasContentGalleryIcons } from './CanvasRenderers'
import { type BlockCommentStatus } from './FeedbackPanel'
import CantoPhotoPickerModal, { PhotoPick } from './CantoPhotoPickerModal'
import CantoIconPickerModal from './CantoIconPickerModal'
import TexturePicker from './TexturePicker'
import type { CantoPick } from './CantoAssetPicker'
import { FolderConfig } from '@/lib/canto-folders'
import { useAppSettings } from '@/hooks/useAppSettings'
import type { CantoExportFile } from './CantoExportModal'

const RichTextEditor  = dynamic(() => import('./RichTextEditor'),  { ssr: false })
const DocsDrawer      = dynamic(() => import('./DocsDrawer'),      { ssr: false })
const CsvEditorModal  = dynamic(() => import('./CsvEditorModal'),  { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotTemplate    = '5050-right' | '5050-left' | 'icons' | 'icons-text' | 'split-right' | 'split-left'
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

type HistorySnap = {
  allSlots: Record<string, TemplateSlotState[]>
  allGallerySlots: Record<string, TemplateSlotState[]>
  productNames: Record<string, string>
  slotConfigs: SlotConfig[]
  galleryConfigs: GallerySlotConfig[]
  shopifyGalleryConfigs: GallerySlotConfig[]
  logoAsset: UploadedAsset | null
  textureAsset: UploadedAsset | null
}

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
  '5050-right':  'Img | Txt',
  '5050-left':   'Txt | Img',
  'icons':       'Icons',
  'icons-text':  'Icn+Txt',
  'split-right': '2P | Txt',
  'split-left':  'Txt | 2P',
}

const GALLERY_LABELS: Record<GalleryTemplate, string> = {
  'gallery-hero':        'Hero',
  'gallery-icons':       'Icons',
  'gallery-icons-text':  'Icn+Txt',
}

const APLUS_ICONS: Record<SlotTemplate, React.ReactNode> = {
  '5050-right': (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
      <rect x="0.5" y="0.5" width="6.5" height="9" rx="1" fill="currentColor" opacity="0.55"/>
      <line x1="9" y1="2" x2="15.5" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="5" x2="15.5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  '5050-left': (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
      <line x1="0.5" y1="2" x2="6" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="0.5" y1="5" x2="6" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="0.5" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="9" y="0.5" width="6.5" height="9" rx="1" fill="currentColor" opacity="0.55"/>
    </svg>
  ),
  'icons': (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
      <circle cx="2.5" cy="5" r="2" fill="currentColor" opacity="0.7"/>
      <circle cx="8" cy="5" r="2" fill="currentColor" opacity="0.7"/>
      <circle cx="13.5" cy="5" r="2" fill="currentColor" opacity="0.7"/>
    </svg>
  ),
  'icons-text': (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
      <circle cx="4" cy="3.5" r="2" fill="currentColor" opacity="0.7"/>
      <circle cx="12" cy="3.5" r="2" fill="currentColor" opacity="0.7"/>
      <line x1="1.5" y1="8.5" x2="6.5" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9.5" y1="8.5" x2="14.5" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  'split-right': (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
      <rect x="0.5" y="0.5" width="6.5" height="3.75" rx="1" fill="currentColor" opacity="0.55"/>
      <rect x="0.5" y="5.75" width="6.5" height="3.75" rx="1" fill="currentColor" opacity="0.55"/>
      <line x1="9" y1="2" x2="15.5" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="5" x2="15.5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  'split-left': (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
      <line x1="0.5" y1="2" x2="6" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="0.5" y1="5" x2="6" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="0.5" y1="8" x2="4" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="9" y="0.5" width="6.5" height="3.75" rx="1" fill="currentColor" opacity="0.55"/>
      <rect x="9" y="5.75" width="6.5" height="3.75" rx="1" fill="currentColor" opacity="0.55"/>
    </svg>
  ),
}

const GALLERY_ICONS: Record<GalleryTemplate, React.ReactNode> = {
  'gallery-hero': (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.5"/>
    </svg>
  ),
  'gallery-icons': (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
      <circle cx="2.5" cy="5" r="2" fill="currentColor" opacity="0.7"/>
      <circle cx="7" cy="5" r="2" fill="currentColor" opacity="0.7"/>
      <circle cx="11.5" cy="5" r="2" fill="currentColor" opacity="0.7"/>
    </svg>
  ),
  'gallery-icons-text': (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
      <circle cx="2.5" cy="3" r="2" fill="currentColor" opacity="0.7"/>
      <circle cx="7" cy="3" r="2" fill="currentColor" opacity="0.7"/>
      <circle cx="11.5" cy="3" r="2" fill="currentColor" opacity="0.7"/>
      <line x1="0.5" y1="8.5" x2="4.5" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="5" y1="8.5" x2="9" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="9.5" y1="8.5" x2="13.5" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
}

const APLUS_TEMPLATES: SlotTemplate[]     = ['5050-right', '5050-left', 'icons', 'icons-text', 'split-right', 'split-left']
const GALLERY_TEMPLATES: GalleryTemplate[] = ['gallery-hero', 'gallery-icons', 'gallery-icons-text']

// ─── Animated segmented picker ────────────────────────────────────────────────

function SegmentedPicker<T extends string>({ options, selected, onSelect, labels, icons }: {
  options: readonly T[]
  selected: T
  onSelect: (t: T) => void
  labels: Record<string, string>
  icons: Record<string, React.ReactNode>
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const idx = options.indexOf(selected)
    const btn = btnRefs.current[idx]
    if (!btn) return
    setPill({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [selected, options])

  return (
    <div style={{ position: 'relative', display: 'inline-flex', gap: 2, background: '#E5E7EB', borderRadius: 5, padding: 2 }}>
      {pill && (
        <div style={{
          position: 'absolute', top: 2, bottom: 2,
          left: pill.left, width: pill.width,
          borderRadius: 4, background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          transition: 'left 160ms cubic-bezier(0.4,0,0.2,1), width 160ms cubic-bezier(0.4,0,0.2,1)',
          pointerEvents: 'none', zIndex: 0,
        }} />
      )}
      {options.map((t, i) => (
        <button
          key={t}
          ref={el => { btnRefs.current[i] = el }}
          onClick={e => { e.stopPropagation(); onSelect(t) }}
          title={labels[t]}
          style={{
            padding: '3px 6px', borderRadius: 4, border: 'none',
            background: 'transparent',
            color: selected === t ? '#1F2937' : '#9CA3AF',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            position: 'relative', zIndex: 1,
            transition: 'color 120ms',
          }}>
          {icons[t]}
        </button>
      ))}
    </div>
  )
}

function slotLabel(i: number)          { return String.fromCharCode(65 + i) + '1' }
function galleryLabel(i: number)       { return `G${i + 1}` }
function shopifyGalleryLabel(i: number){ return `SG${i + 1}` }

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

function slotHasFill(s: TemplateSlotState | undefined): boolean {
  if (!s) return false
  return !!(s.title || s.desc || s.photoAsset || s.iconLabels.some(l => l))
}

function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|br|li|ul|ol|h[1-6])[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function buildLiveCsv(
  products: BulkProduct[],
  allSlots: Record<string, TemplateSlotState[]>,
  allGallerySlots: Record<string, TemplateSlotState[]>,
  aplusSlots: number,
  galleryCount: number,
): string {
  const merged = products.map(p => ({
    ...p,
    slots: Array.from({ length: aplusSlots }, (_, j) => {
      const live = allSlots[p.id]?.[j]
      if (!live) return p.slots[j] ?? { title: '', desc: '', iconCallouts: ['', '', '', ''] as [string, string, string, string] }
      return { title: stripHtml(live.title), desc: stripHtml(live.desc), iconCallouts: live.iconLabels }
    }),
    gallerySlots: Array.from({ length: galleryCount }, (_, g) => {
      const live = allGallerySlots[p.id]?.[g]
      if (!live) return p.gallerySlots?.[g] ?? { title: '', desc: '', iconCallouts: ['', '', '', ''] as [string, string, string, string] }
      return { title: stripHtml(live.title), desc: stripHtml(live.desc), iconCallouts: live.iconLabels }
    }),
  }))
  return productsToCSV(merged, aplusSlots, galleryCount)
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left sticky top-0 z-10 bg-white dark:bg-gray-900"
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
  onBrokenImage?: () => void,
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
  await Promise.all(imgs.map(img => {
    if (img.complete) {
      if (img.naturalWidth === 0 && img.src) onBrokenImage?.()
      return Promise.resolve()
    }
    return new Promise<void>(r => {
      img.onload = () => r()
      img.onerror = () => { onBrokenImage?.(); r() }
    })
  }))
  try {
    const { toPng, toJpeg } = await import('html-to-image')
    const opts = { includeQueryParams: true, cacheBust: true, onImageErrorHandler: () => { onBrokenImage?.() } }
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
  aplusDesigns:          { design: DesignState; cfg: SlotConfig;        label: string }[]
  galleryDesigns:        { design: DesignState; cfg: GallerySlotConfig; label: string }[]
  shopifyGalleryDesigns: { design: DesignState; cfg: GallerySlotConfig; label: string }[]
  showShopifyGallery:    boolean
  designState: DesignState
}

function TemplateModePreviewModal({ open, onClose, aplusDesigns, galleryDesigns, shopifyGalleryDesigns, showShopifyGallery, designState }: PreviewProps) {
  const { settings } = useAppSettings()
  const isDark = settings.theme === 'dark'
  const isGalleryOnly = aplusDesigns.length === 0
  const [tab, setTab]       = useState<'desktop' | 'mobile' | 'gallery'>(isGalleryOnly ? 'gallery' : 'desktop')
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)

  const dRef  = useRef<HTMLDivElement>(null)
  const mRef  = useRef<HTMLDivElement>(null)
  const gRef  = useRef<HTMLDivElement>(null)
  const sgRef = useRef<HTMLDivElement>(null)
  const [ds, setDs] = useState(0.4)
  const [ms, setMs] = useState(0.5)
  const [gs, setGs] = useState(0.3)
  const [sgs, setSgs] = useState(0.3)

  useEffect(() => {
    if (open) { setClosing(false); setMounted(true) }
  }, [open])

  function handleClose() {
    setClosing(true)
    setTimeout(() => { setMounted(false); onClose() }, 300)
  }

  useEffect(() => {
    if (!open) return
    const measure = () => {
      if (dRef.current)  setDs(dRef.current.clientWidth / 1464)
      if (mRef.current)  setMs(mRef.current.clientWidth / 600)
      // Two-column mode: each column fills its flex container; single-column: 2-up grid
      if (gRef.current)  setGs(showShopifyGallery ? (gRef.current.clientWidth - 24) / 1500 : (gRef.current.clientWidth / 2 - 16) / 1500)
      if (sgRef.current) setSgs((sgRef.current.clientWidth - 24) / 1500)
    }
    const t = setTimeout(measure, 30)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, showShopifyGallery])

  useEffect(() => {
    if (!mounted) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  if (!mounted) return null

  const dark = isDark
  const panelBg   = dark ? 'bg-gray-950' : 'bg-[#f8f8f8]'
  const headerBg  = dark ? 'bg-gray-950 border-b border-white/8' : 'bg-white border-b border-gray-200'
  const scrollBg  = dark ? 'bg-gray-900' : 'bg-[#f0f0f0]'
  const titleText = dark ? 'text-white' : 'text-gray-900'
  const dimText   = dark ? 'text-gray-500' : 'text-gray-400'
  const closeBtn  = dark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
  const tabActive   = dark ? 'text-white border-b-2 border-accent-500' : 'text-gray-900 border-b-2 border-accent-600'
  const tabInactive = dark ? 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent' : 'text-gray-400 hover:text-gray-600 border-b-2 border-transparent'
  const pillBg    = dark ? 'bg-white/6 text-gray-400' : 'bg-gray-100 text-gray-500'
  const labelColor = dark ? '#6B7280' : '#9CA3AF'

  const panelAnim    = closing ? 'animate-slide-down-full' : 'animate-slide-up-full'
  const backdropAnim = closing ? 'animate-fade-out' : 'animate-fade-in'

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 dark:bg-black/75 backdrop-blur-sm ${backdropAnim}`}
        onClick={handleClose}
      />

      {/* Sheet — pointer-events-none wrapper lets backdrop clicks pass through */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div
          className={`pointer-events-auto w-full max-w-[1400px] flex flex-col rounded-none overflow-hidden shadow-[0_-8px_48px_rgba(0,0,0,0.28)] ${panelBg} ${panelAnim}`}
          style={{ height: 'calc(100vh - 3rem)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`shrink-0 flex items-center justify-between px-5 py-0 ${headerBg}`} style={{ height: 44 }}>
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-6 rounded-full bg-accent-600 dark:bg-accent-500 shrink-0" />
              <span className={`font-bold text-[13px] ${titleText}`}>Preview</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${pillBg}`}>
                {aplusDesigns.length} block{aplusDesigns.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-stretch gap-0 h-full">
              {(['desktop', 'mobile', 'gallery'] as const).filter(t => !isGalleryOnly || t === 'gallery').map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 h-full text-[11px] font-bold tracking-widest uppercase transition-all ${tab === t ? tabActive : tabInactive}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] hidden sm:block ${dimText}`}>Esc to close</span>
              <button onClick={handleClose} className={`w-7 h-7 flex items-center justify-center rounded-none transition-colors ${closeBtn}`}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className={`flex-1 min-h-0 overflow-hidden`}>
            {tab === 'desktop' && (
              <div className={`h-full overflow-y-auto ${scrollBg}`}>
                <div className="max-w-[1200px] mx-auto px-8 pt-8 pb-12">
                  <div ref={dRef}>
                    {aplusDesigns.map(({ design: sd, cfg, label }) => {
                      const flip = cfg.template === '5050-left' || cfg.template === 'split-left'
                      const isIcons = cfg.template === 'icons' || cfg.template === 'icons-text'
                      const isSplit = cfg.template === 'split-right' || cfg.template === 'split-left'
                      return (
                        <div key={label} className="mb-8">
                          <p style={{ fontSize: 10, fontWeight: 700, color: labelColor, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label} — DESKTOP · 1464×600</p>
                          <div className="overflow-hidden rounded-none shadow-[0_2px_12px_rgba(0,0,0,0.10)]" style={{ width: '100%', height: 600 * ds, position: 'relative' }}>
                            <div style={{ width: 1464, height: 600, transform: `scale(${ds})`, transformOrigin: 'top left', position: 'absolute' }}>
                              {isIcons
                                ? <CanvasContentIcons design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                                : isSplit
                                  ? <CanvasContentSplit design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                                  : <CanvasContent     design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                              }
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {tab === 'mobile' && (
              <div className={`h-full overflow-y-auto ${scrollBg}`}>
                <div className="max-w-[680px] mx-auto px-8 pt-8 pb-12">
                  <div ref={mRef}>
                    {aplusDesigns.map(({ design: sd, cfg, label }) => {
                      const flip = cfg.template === '5050-left' || cfg.template === 'split-left'
                      const isIcons = cfg.template === 'icons' || cfg.template === 'icons-text'
                      const isSplit = cfg.template === 'split-right' || cfg.template === 'split-left'
                      return (
                        <div key={label} className="mb-8">
                          <p style={{ fontSize: 10, fontWeight: 700, color: labelColor, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label} — MOBILE · 600×450</p>
                          <div className="overflow-hidden rounded-none shadow-[0_2px_12px_rgba(0,0,0,0.10)]" style={{ width: '100%', height: 450 * ms, position: 'relative' }}>
                            <div style={{ width: 600, height: 450, transform: `scale(${ms})`, transformOrigin: 'top left', position: 'absolute' }}>
                              {isIcons
                                ? <CanvasContentIcons design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                                : isSplit
                                  ? <CanvasContentSplit design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                                  : <CanvasContent     design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                              }
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {tab === 'gallery' && (
              <div className={`h-full overflow-hidden ${scrollBg}`}>
                {galleryDesigns.length === 0 && !showShopifyGallery && (
                  <p className={`text-[12px] text-center py-16 ${dimText}`}>No gallery slides configured.</p>
                )}
                {/* Two-column layout when Shopify Gallery is enabled */}
                {showShopifyGallery ? (
                  <div className="h-full flex overflow-hidden">
                    {/* Left: Amazon Gallery */}
                    <div className="flex-1 min-w-0 overflow-y-auto border-r border-gray-200 dark:border-gray-700">
                      <div className="px-6 pt-6 pb-10">
                        <p style={{ fontSize: 10, fontWeight: 700, color: labelColor, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Amazon Gallery</p>
                        <div ref={gRef} className="flex flex-col gap-6">
                          {galleryDesigns.map(({ design: gd, cfg, label }) => {
                            const isGIcons = cfg.template === 'gallery-icons' || cfg.template === 'gallery-icons-text'
                            return (
                              <div key={label}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: labelColor, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label} · 1500×1500</p>
                                <div className="overflow-hidden rounded-none shadow-[0_2px_12px_rgba(0,0,0,0.10)]" style={{ width: '100%', height: 1500 * gs, position: 'relative' }}>
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
                      </div>
                    </div>
                    {/* Right: Shopify Gallery */}
                    <div className="flex-1 min-w-0 overflow-y-auto">
                      <div className="px-6 pt-6 pb-10">
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Shopify Gallery</p>
                        <div ref={sgRef} className="flex flex-col gap-6">
                          {shopifyGalleryDesigns.map(({ design: gd, cfg, label }) => {
                            const isGIcons = cfg.template === 'gallery-icons' || cfg.template === 'gallery-icons-text'
                            return (
                              <div key={label}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label} · 1500×1500</p>
                                <div className="overflow-hidden rounded-none shadow-[0_2px_12px_rgba(0,0,0,0.10)]" style={{ width: '100%', height: 1500 * sgs, position: 'relative' }}>
                                  <div style={{ width: 1500, height: 1500, transform: `scale(${sgs})`, transformOrigin: 'top left', position: 'absolute' }}>
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
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Single-column layout when only Amazon Gallery */
                  <div className="h-full overflow-y-auto">
                    <div className="max-w-[1400px] mx-auto px-8 pt-8 pb-12">
                      <div ref={gRef} className="grid grid-cols-2 gap-x-8 gap-y-6">
                        {galleryDesigns.map(({ design: gd, cfg, label }) => {
                          const isGIcons = cfg.template === 'gallery-icons' || cfg.template === 'gallery-icons-text'
                          return (
                            <div key={label}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: labelColor, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label} · 1500×1500</p>
                              <div className="overflow-hidden rounded-none shadow-[0_2px_12px_rgba(0,0,0,0.10)]" style={{ width: '100%', height: 1500 * gs, position: 'relative' }}>
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
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}


// ─── Props ────────────────────────────────────────────────────────────────────

export interface SlotGroup {
  id:    string   // 'a1' | 'b1' | 'g1' | 'sg1' etc.
  label: string   // 'A1' | 'B1' | 'G1' | 'SG1'
  type:  'aplus' | 'gallery' | 'sg'
}

interface TemplateModeProps {
  projectId?: string
  platform?: 'amazon' | 'shopify'
  designState: DesignState
  folderConfig: FolderConfig
  exportFnRef: React.MutableRefObject<() => void>
  exportCurrentFnRef: React.MutableRefObject<() => void>
  cantoFnRef: React.MutableRefObject<() => Promise<CantoExportFile[]>>
  cantoCurrentFnRef: React.MutableRefObject<() => Promise<CantoExportFile[]>>
  getSlotGroupsFnRef: React.MutableRefObject<() => SlotGroup[]>
  exportSelectedFnRef: React.MutableRefObject<(slotIds: string[]) => Promise<void>>
  renderAllFnRef: React.MutableRefObject<() => void>
  previewFnRef: React.MutableRefObject<() => void>
  thumbnailFnRef: React.MutableRefObject<() => Promise<Blob | null>>
  onCanExportChange: (can: boolean) => void
  onCanExportCurrentChange: (can: boolean) => void
  onRenderingAllChange: (v: boolean) => void
  onStatsChange: (rendered: number, total: number) => void
  blockCommentStatus?: BlockCommentStatus
  onOpenFeedback?: () => void
  isDark?: boolean
}

// ─── Sync helpers ────────────────────────────────────────────────────────────

function buildContentHash(
  allSlots: Record<string, TemplateSlotState[]>,
  allGallerySlots: Record<string, TemplateSlotState[]>,
  slotConfigs: SlotConfig[],
  galleryConfigs: GallerySlotConfig[],
  aplusSlots: number,
  galleryCount: number,
  includeGallery: boolean,
  logoAssetId: string | null | undefined,
  textureAssetId: string | null | undefined,
  productNames: Record<string, string>,
): string {
  return JSON.stringify([allSlots, allGallerySlots, slotConfigs, galleryConfigs, aplusSlots, galleryCount, includeGallery, logoAssetId, textureAssetId, productNames])
}

function buildNavHash(selectedId: string | null, activeSlotIdx: number, activeIsGallery: boolean, activeGalleryIdx: number): string {
  return JSON.stringify([selectedId, activeSlotIdx, activeIsGallery, activeGalleryIdx])
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemplateMode({
  projectId,
  platform = 'amazon',
  designState, folderConfig,
  exportFnRef, exportCurrentFnRef, cantoFnRef, cantoCurrentFnRef,
  getSlotGroupsFnRef, exportSelectedFnRef,
  renderAllFnRef, previewFnRef, thumbnailFnRef,
  onCanExportChange, onCanExportCurrentChange, onRenderingAllChange, onStatsChange,
  blockCommentStatus, onOpenFeedback,
  isDark = false,
}: TemplateModeProps) {
  const isShopify = platform === 'shopify'
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

  // True only on first open when sessionStorage was empty and we have a project — we'll fetch from DB
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(!sv.parseResult && !!projectId)

  // CSV
  const [parseResult, setParseResult] = useState<ParseResult | null>((sv.parseResult as ParseResult) ?? null)
  const [csvFilename, setCsvFilename] = useState<string>(typeof sv.csvFilename === 'string' ? sv.csvFilename : '')
  const [rawCsv,      setRawCsv]      = useState<string>(typeof sv.rawCsv === 'string' ? sv.rawCsv : '')
  const [csvEditorOpen, setCsvEditorOpen] = useState(false)
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
  const [aplusSlots, setAplusSlots]         = useState(typeof sv.aplusSlots === 'number' ? sv.aplusSlots : (isShopify ? 0 : 5))
  const [slotConfigs, setSlotConfigs]       = useState<SlotConfig[]>(Array.isArray(sv.slotConfigs) ? sv.slotConfigs as SlotConfig[] : defaultSlotConfigs(5))
  const [galleryCount, setGalleryCount]         = useState(typeof sv.galleryCount === 'number' ? sv.galleryCount : 2)
  const [galleryConfigs, setGalleryConfigs]     = useState<GallerySlotConfig[]>(Array.isArray(sv.galleryConfigs) ? sv.galleryConfigs as GallerySlotConfig[] : defaultGalleryConfigs(2))
  const [shopifyGalleryConfigs, setShopifyGalleryConfigs] = useState<GallerySlotConfig[]>(Array.isArray(sv.shopifyGalleryConfigs) ? sv.shopifyGalleryConfigs as GallerySlotConfig[] : defaultGalleryConfigs(2))
  const [outputFormat, setOutputFormat]         = useState<'png' | 'jpeg'>(sv.outputFormat === 'jpeg' ? 'jpeg' : 'png')
  const [includeGallery, setIncludeGallery]     = useState<boolean>(typeof sv.includeGallery === 'boolean' ? sv.includeGallery as boolean : true)

  // Global branding
  const [logoAsset, setLogoAsset]       = useState<UploadedAsset | null>((sv.logoAsset as UploadedAsset) ?? null)
  const [textureAsset, setTextureAsset] = useState<UploadedAsset | null>((sv.textureAsset as UploadedAsset) ?? null)

  // Pickers
  const [photoPickerOpen, setPhotoPickerOpen]     = useState(false)
  const [photoPickerFor, setPhotoPickerFor]       = useState<'main' | 'split2'>('main')
  const [iconPickerOpen, setIconPickerOpen]       = useState(false)
  const [iconPickerSlotIdx, setIconPickerSlotIdx] = useState(0)

  // Preview / guide
  const [previewOpen, setPreviewOpen]         = useState(false)
  const [guideOpen, setGuideOpen]             = useState(false)
  const [showClearConfirm,    setShowClearConfirm]    = useState(false)
  const [clearConfirmClosing, setClearConfirmClosing] = useState(false)

  // Shopify gallery selection
  const [activeIsShopifyGallery, setActiveIsShopifyGallery] = useState(typeof sv.activeIsShopifyGallery === 'boolean' ? sv.activeIsShopifyGallery as boolean : false)
  const [activeShopifyGalleryIdx, setActiveShopifyGalleryIdx] = useState(typeof sv.activeShopifyGalleryIdx === 'number' ? sv.activeShopifyGalleryIdx as number : 0)

  // Drag-reorder state for slot tabs
  const [aplusDragIdx,    setAplusDragIdx]    = useState<number | null>(null)
  const [aplusDragOver,   setAplusDragOver]   = useState<number | null>(null)
  const [galleryDragIdx,  setGalleryDragIdx]  = useState<number | null>(null)
  const [galleryDragOver, setGalleryDragOver] = useState<number | null>(null)
  const [shopifyDragIdx,  setShopifyDragIdx]  = useState<number | null>(null)
  const [shopifyDragOver, setShopifyDragOver] = useState<number | null>(null)

  // CSV warnings (from parse)
  const [csvWarnings, setCsvWarnings] = useState<string[]>([])
  const [csvWarningsDismissed, setCsvWarningsDismissed] = useState(false)

  // Save indicator
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved')

  // Multi-tab conflict warning
  const [remoteConflict, setRemoteConflict] = useState(false)
  const hasLocalUnsavedRef = useRef(false)

  // Undo / redo history
  const histRef     = useRef<HistorySnap[]>([])
  const histIdxRef  = useRef(-1)
  const skipHistRef = useRef(false)
  const [histVersion, setHistVersion] = useState(0)
  // histVersion is read here to make canUndo/canRedo re-evaluate on each history mutation
  const canUndo = histVersion >= 0 && histIdxRef.current > 0
  const canRedo = histVersion >= 0 && histIdxRef.current < histRef.current.length - 1

  // Render / export
  const [renderBrokenCount, setRenderBrokenCount] = useState(0)
  const [renderingAll, setRenderingAll] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productListOpen, setProductListOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const capturedRef   = useRef<Map<string, string>>(new Map())
  const cancelRef     = useRef(false)
  const [captureVersion, setCaptureVersion] = useState(0)  // bumped on any capture mutation
  // Cross-session sync: track content/nav hashes to prevent echo saves after remote updates
  const lastSavedContentHashRef = useRef<string | null>(null)
  const lastSavedNavHashRef     = useRef<string | null>(null)
  const sessionIdRef            = useRef(`${Date.now()}-${Math.random()}`)
  const syncChannelRef          = useRef<RealtimeChannel | null>(null)

  // Amazon Gallery is always shown for Amazon; Shopify Gallery is toggle-controlled
  const showShopifyGallery = !isShopify && includeGallery

  // Always-current snapshot for thumbnail generation (avoids stale closures in the wired fn)
  const thumbLatest = useRef({ parseResult, selectedId, allSlots, slotConfigs, logoAsset, textureAsset, designState })
  thumbLatest.current = { parseResult, selectedId, allSlots, slotConfigs, logoAsset, textureAsset, designState }

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
    const effectiveW = isShopify
      ? GALLERY_W
      : (CANVAS_W + (includeGallery ? COL_GAP + GALLERY_W : 0))
    const z = Math.min((vw - PADDING * 2) / effectiveW, (vh - PADDING * 2) / totalH, 1)
    const px = Math.max(PADDING, (vw - effectiveW * z) / 2)
    const py = Math.max(PADDING, (vh - totalH * z) / 2)
    zoomRef.current = z; setZoom(z); setPan({ x: px, y: py })
  }, [aplusSlots, galleryCount, isShopify, includeGallery])

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
      const inEditable = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable)
      if (e.code === 'Space' && !e.repeat && !inEditable) {
        e.preventDefault(); setSpaceDown(true)
      }
      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !inEditable) {
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

  // ── Undo / Redo ───────────────────────────────────────────────────────────────

  // Push to history — debounced 500 ms, skipped during undo/redo
  useEffect(() => {
    if (skipHistRef.current) { skipHistRef.current = false; return }
    const snap: HistorySnap = { allSlots, allGallerySlots, productNames, slotConfigs, galleryConfigs, shopifyGalleryConfigs, logoAsset, textureAsset }
    const timer = setTimeout(() => {
      const trimmed = histRef.current.slice(0, histIdxRef.current + 1)
      trimmed.push(snap)
      if (trimmed.length > 51) trimmed.shift()
      histRef.current = trimmed
      histIdxRef.current = trimmed.length - 1
      setHistVersion(v => v + 1)
    }, 500)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSlots, allGallerySlots, productNames, slotConfigs, galleryConfigs, shopifyGalleryConfigs, logoAsset, textureAsset])

  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return
    histIdxRef.current--
    const snap = histRef.current[histIdxRef.current]
    if (!snap) return
    skipHistRef.current = true
    setAllSlots(snap.allSlots)
    setAllGallerySlots(snap.allGallerySlots)
    setProductNames(snap.productNames)
    setSlotConfigs(snap.slotConfigs)
    setGalleryConfigs(snap.galleryConfigs)
    setShopifyGalleryConfigs(snap.shopifyGalleryConfigs)
    setLogoAsset(snap.logoAsset)
    setTextureAsset(snap.textureAsset)
    setHistVersion(v => v + 1)
  }, [])

  const redo = useCallback(() => {
    if (histIdxRef.current >= histRef.current.length - 1) return
    histIdxRef.current++
    const snap = histRef.current[histIdxRef.current]
    if (!snap) return
    skipHistRef.current = true
    setAllSlots(snap.allSlots)
    setAllGallerySlots(snap.allGallerySlots)
    setProductNames(snap.productNames)
    setSlotConfigs(snap.slotConfigs)
    setGalleryConfigs(snap.galleryConfigs)
    setShopifyGalleryConfigs(snap.shopifyGalleryConfigs)
    setLogoAsset(snap.logoAsset)
    setTextureAsset(snap.textureAsset)
    setHistVersion(v => v + 1)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // ── Init ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isShopify) setAplusSlots(0)
  }, [isShopify])

  useEffect(() => {
    if (!isShopify && !logoAsset) {
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
        parseResult, csvFilename, rawCsv, allSlots, allGallerySlots, productNames,
        aplusSlots, galleryCount, includeGallery, slotConfigs, galleryConfigs, shopifyGalleryConfigs, outputFormat,
        selectedId, activeSlotIdx, activeIsGallery, activeGalleryIdx,
        activeIsShopifyGallery, activeShopifyGalleryIdx, logoAsset, textureAsset,
      }))
    } catch { /* ignore quota errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseResult, csvFilename, rawCsv, allSlots, allGallerySlots, productNames, aplusSlots, galleryCount, includeGallery, slotConfigs, galleryConfigs, shopifyGalleryConfigs, outputFormat, selectedId, activeSlotIdx, activeIsGallery, activeGalleryIdx, activeIsShopifyGallery, activeShopifyGalleryIdx, logoAsset, textureAsset])

  // Auto-save template state to Supabase for sharing (debounced 4s)
  useEffect(() => {
    if (!projectId || !parseResult?.products.length) return
    // Mark unsaved immediately so the indicator updates before the timer fires
    setSaveState('unsaved')
    const timer = setTimeout(async () => {
      try {
        // Skip save if content and nav are unchanged — prevents echo saves after receiving
        // a remote update (another session's write would otherwise bounce back forever)
        const contentH = buildContentHash(allSlots, allGallerySlots, slotConfigs, galleryConfigs, aplusSlots, galleryCount, includeGallery, logoAsset?.id, textureAsset?.id, productNames)
        const navH     = buildNavHash(selectedId, activeSlotIdx, activeIsGallery, activeGalleryIdx)
        if (contentH === lastSavedContentHashRef.current && navH === lastSavedNavHashRef.current) {
          setSaveState('saved')
          return
        }

        setSaveState('saving')
        const supabase = createClient()
        const raw: TemplateShareState = {
          products: parseResult.products,
          allSlots, allGallerySlots, slotConfigs, galleryConfigs, shopifyGalleryConfigs,
          aplusSlots, galleryCount, includeGallery, logoAsset, textureAsset,
          selectedId, activeSlotIdx, activeIsGallery, activeGalleryIdx,
          productNames,
        }
        const stripped = stripTemplateBlobUrls(raw)
        await saveTemplateState(supabase, projectId, stripped)
        lastSavedContentHashRef.current = contentH
        lastSavedNavHashRef.current     = navH
        setSaveState('saved')
        setRemoteConflict(false)
        // Include state in broadcast so preview tabs apply it directly (no HTTP round-trip).
        // Skip state payload if it's near Supabase's 1 MB broadcast limit.
        const stateJson = JSON.stringify(stripped)
        syncChannelRef.current?.send({
          type: 'broadcast', event: 'saved',
          payload: {
            sessionId: sessionIdRef.current,
            ...(stateJson.length < 900_000 ? { templateState: stripped } : {}),
          },
        })
      } catch {
        setSaveState('unsaved')
      }
    }, 4000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, parseResult, allSlots, allGallerySlots, slotConfigs, galleryConfigs, shopifyGalleryConfigs, aplusSlots, galleryCount, includeGallery, logoAsset, textureAsset, productNames, selectedId, activeSlotIdx, activeIsGallery, activeGalleryIdx])

  // Keep hasLocalUnsavedRef in sync so the realtime handler (created once) can read it
  useEffect(() => {
    hasLocalUnsavedRef.current = saveState === 'unsaved'
  }, [saveState])

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
    setShopifyGalleryConfigs(prev => defaultGalleryConfigs(galleryCount).map((d, i) => prev[i] ?? d))
  }, [galleryCount])

  useEffect(() => {
    if (activeGalleryIdx >= galleryCount) setActiveGalleryIdx(Math.max(0, galleryCount - 1))
  }, [galleryCount, activeGalleryIdx])

  useEffect(() => {
    if (!showShopifyGallery && activeIsShopifyGallery) setActiveIsShopifyGallery(false)
  }, [showShopifyGallery, activeIsShopifyGallery])


  // On first open when sessionStorage is empty: restore full state from Supabase
  useEffect(() => {
    if (!projectId) { setIsLoadingFromDb(false); return }
    const supabase = createClient()
    // Always load fresh from DB on mount — sessionStorage survives page reloads so
    // sv.parseResult is truthy even after reload, but external changes (e.g. MCP edits)
    // only land in template_state, not sessionStorage. Always fetching ensures we pick
    // up those changes. We only replace parseResult when it isn't already in memory.
    loadTemplateState(supabase, projectId)
      .then(tState => {
        if (!tState?.products?.length) return
        // Always refresh slot content so external edits (MCP) are visible on reload
        setAllSlots((tState.allSlots ?? {}) as Record<string, TemplateSlotState[]>)
        setAllGallerySlots((tState.allGallerySlots ?? {}) as Record<string, TemplateSlotState[]>)
        if (tState.productNames) setProductNames(tState.productNames)
        // Only restore products + config when not already in memory (first-ever load)
        if (!parseResult) {
          setParseResult({ products: tState.products, errors: [] })
          if (typeof tState.aplusSlots === 'number') setAplusSlots(tState.aplusSlots)
          if (typeof tState.galleryCount === 'number') setGalleryCount(tState.galleryCount)
          if (tState.slotConfigs?.length) setSlotConfigs(tState.slotConfigs as unknown as SlotConfig[])
          if (tState.galleryConfigs?.length) setGalleryConfigs(tState.galleryConfigs as unknown as GallerySlotConfig[])
          if (tState.shopifyGalleryConfigs?.length) setShopifyGalleryConfigs(tState.shopifyGalleryConfigs as unknown as GallerySlotConfig[])
          if (tState.logoAsset) setLogoAsset(tState.logoAsset)
          if (tState.textureAsset) setTextureAsset(tState.textureAsset)
          if (typeof tState.includeGallery === 'boolean') setIncludeGallery(tState.includeGallery)
          // Restore navigation state — fall back to first product if selectedId wasn't saved yet
          const restoredId = tState.selectedId ?? tState.products[0].id
          const restoredSlotIdx = typeof tState.activeSlotIdx === 'number' ? tState.activeSlotIdx : 0
          const restoredIsGallery = typeof tState.activeIsGallery === 'boolean' ? tState.activeIsGallery : false
          const restoredGalleryIdx = typeof tState.activeGalleryIdx === 'number' ? tState.activeGalleryIdx : 0
          setSelectedId(restoredId)
          if (typeof tState.activeSlotIdx === 'number') setActiveSlotIdx(restoredSlotIdx)
          if (typeof tState.activeIsGallery === 'boolean') setActiveIsGallery(restoredIsGallery)
          if (typeof tState.activeGalleryIdx === 'number') setActiveGalleryIdx(restoredGalleryIdx)
          lastSavedNavHashRef.current = buildNavHash(restoredId, restoredSlotIdx, restoredIsGallery, restoredGalleryIdx)
        }
        // Seed the content hash from DB so the first auto-save cycle doesn't echo back
        const restoredNames = tState.productNames ?? {}
        const restoredIncludeGallery = typeof tState.includeGallery === 'boolean' ? tState.includeGallery : true
        lastSavedContentHashRef.current = buildContentHash(
          (tState.allSlots ?? {}) as Record<string, TemplateSlotState[]>,
          (tState.allGallerySlots ?? {}) as Record<string, TemplateSlotState[]>,
          (tState.slotConfigs ?? []) as SlotConfig[],
          (tState.galleryConfigs ?? []) as GallerySlotConfig[],
          typeof tState.aplusSlots === 'number' ? tState.aplusSlots : 5,
          typeof tState.galleryCount === 'number' ? tState.galleryCount : 2,
          restoredIncludeGallery,
          tState.logoAsset?.id,
          tState.textureAsset?.id,
          restoredNames,
        )
      })
      .catch(() => {})
      .finally(() => setIsLoadingFromDb(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Real-time sync — broadcast channel lets other open sessions know to reload
  // Uses Supabase broadcast (no DB publication needed, works out of the box)
  useEffect(() => {
    if (!projectId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`tmpl-sync-${projectId}`)
      .on(
        'broadcast' as const,
        { event: 'saved' },
        async (msg: { payload?: { sessionId?: string } }) => {
          // Ignore our own broadcasts
          if (msg.payload?.sessionId === sessionIdRef.current) return
          try {
            const tState = await loadTemplateState(supabase, projectId)
            if (!tState?.products?.length) return
            const incomingContentH = buildContentHash(
              (tState.allSlots ?? {}) as Record<string, TemplateSlotState[]>,
              (tState.allGallerySlots ?? {}) as Record<string, TemplateSlotState[]>,
              (tState.slotConfigs ?? []) as SlotConfig[],
              (tState.galleryConfigs ?? []) as GallerySlotConfig[],
              typeof tState.aplusSlots === 'number' ? tState.aplusSlots : 5,
              typeof tState.galleryCount === 'number' ? tState.galleryCount : 2,
              typeof tState.includeGallery === 'boolean' ? tState.includeGallery : true,
              tState.logoAsset?.id,
              tState.textureAsset?.id,
              tState.productNames ?? {},
            )
            if (incomingContentH === lastSavedContentHashRef.current) return
            // Warn if this tab has unsaved local changes about to be overwritten
            if (hasLocalUnsavedRef.current) setRemoteConflict(true)
            // Apply content — keep each session's own navigation position
            lastSavedContentHashRef.current = incomingContentH
            setParseResult({ products: tState.products, errors: [] })
            setAllSlots((tState.allSlots ?? {}) as Record<string, TemplateSlotState[]>)
            setAllGallerySlots((tState.allGallerySlots ?? {}) as Record<string, TemplateSlotState[]>)
            if (typeof tState.aplusSlots === 'number') setAplusSlots(tState.aplusSlots)
            if (typeof tState.galleryCount === 'number') setGalleryCount(tState.galleryCount)
            if (tState.slotConfigs?.length) setSlotConfigs(tState.slotConfigs as unknown as SlotConfig[])
            if (tState.galleryConfigs?.length) setGalleryConfigs(tState.galleryConfigs as unknown as GallerySlotConfig[])
            if (tState.shopifyGalleryConfigs?.length) setShopifyGalleryConfigs(tState.shopifyGalleryConfigs as unknown as GallerySlotConfig[])
            if (tState.logoAsset) setLogoAsset(tState.logoAsset)
            if (tState.textureAsset) setTextureAsset(tState.textureAsset)
            if (tState.productNames) setProductNames(tState.productNames)
            if (typeof tState.includeGallery === 'boolean') setIncludeGallery(tState.includeGallery)
          } catch { /* silent */ }
        }
      )
      .subscribe()
    syncChannelRef.current = channel
    return () => { supabase.removeChannel(channel); syncChannelRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

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

  // Wire thumbnail generator — always reads latest state via thumbLatest ref
  useEffect(() => {
    thumbnailFnRef.current = async (): Promise<Blob | null> => {
      const { parseResult, selectedId, allSlots, slotConfigs, logoAsset, textureAsset, designState } = thumbLatest.current
      if (!parseResult?.products.length) return null
      const product = parseResult.products.find(p => p.id === selectedId) ?? parseResult.products[0]
      const s   = allSlots[product.id]?.[0] ?? emptySlotState()
      const cfg = slotConfigs[0] ?? { template: '5050-right' as SlotTemplate }
      const showDesc = cfg.template !== 'icons'
      const flip     = cfg.template === '5050-left' || cfg.template === 'split-left'
      const isIcons  = cfg.template === 'icons' || cfg.template === 'icons-text'
      const isSplit  = cfg.template === 'split-right' || cfg.template === 'split-left'
      const blocks   = [...(designState.blocks ?? []), ...(designState.galleryBlocks ?? [])]
      const active   = designState.blocks?.find(b => b.id === designState.activeBlockId)
      const fallback = (idx: number) => {
        const seen = new Set<string>()
        for (const b of [...(active ? [active] : []), ...blocks]) {
          if (seen.has(b.id)) continue; seen.add(b.id)
          const a = (b.assets ?? [])[idx]; if (a?.url) return a
        }
        return undefined
      }
      const sd: DesignState = {
        ...designState,
        activeFormat: 'desktop',
        assets: [s.photoAsset, textureAsset ?? fallback(1), logoAsset ?? fallback(2), s.iconAssets[0], s.iconAssets[1], s.iconAssets[2], s.iconAssets[3]] as UploadedAsset[],
        title: s.title || '<p></p>',
        subtitleHtml: showDesc ? (s.desc || '') : '',
        iconLabels: s.iconLabels,
        iconCount: s.iconCount,
      }
      const element = isIcons
        ? <CanvasContentIcons design={sd} settings={{ ...designState.desktop, layoutFlipped: flip }} />
        : isSplit
          ? <CanvasContentSplit design={sd} settings={{ ...designState.desktop, layoutFlipped: flip }} />
          : <CanvasContent     design={sd} settings={{ ...designState.desktop, layoutFlipped: flip }} />
      const dataUrl = await captureToDataUrl(element, 1464, 600, 'jpeg')
      if (!dataUrl) return null
      const res = await fetch(dataUrl)
      return res.blob()
    }
  }, [thumbnailFnRef])

  // ── CSV ───────────────────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) return
    setCsvFilename(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      setRawCsv(text)
      const result = parseCSV(text, { requireSku: false, shopify: isShopify })

      // Derive slot/gallery counts from the new CSV — never inherit from a previous project
      const first = result.products[0]
      const newAplusSlots   = isShopify ? 0 : Math.max(1, first?.slots.length ?? 5)
      const newGalleryCount = Math.max(isShopify ? 1 : 0, first?.gallerySlots?.length ?? (isShopify ? 3 : 0))

      setParseResult(result)
      setSelectedId(result.products[0]?.id ?? null)
      setActiveSlotIdx(0)
      setActiveIsGallery(false)
      setActiveGalleryIdx(0)
      setProductNames({})
      setAplusSlots(newAplusSlots)
      setGalleryCount(newGalleryCount)
      const allWarnings = result.products.flatMap(p => p.warnings)
      setCsvWarnings(allWarnings)
      setCsvWarningsDismissed(false)

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
    setParseResult(null); setCsvFilename(''); setRawCsv(''); setSelectedId(null)
    setAllSlots({}); setAllGallerySlots({}); setStatuses({})
    setProductNames({})
    setAplusSlots(5); setSlotConfigs(defaultSlotConfigs(5))
    setGalleryCount(2); setGalleryConfigs(defaultGalleryConfigs(2))
    capturedRef.current.clear(); setCaptureVersion(0)
    setCsvWarnings([]); setCsvWarningsDismissed(false)
    setRenderBrokenCount(0)
    onCanExportChange(false); onCanExportCurrentChange(false); onStatsChange(0, 0)
    if (fileInputRef.current) fileInputRef.current.value = ''
    try { sessionStorage.removeItem(storageKeyRef.current) } catch { /* ignore */ }
  }

  // ── Slot state helpers ────────────────────────────────────────────────────────

  const getSlotState = (productId: string, slotIdx: number): TemplateSlotState =>
    allSlots[productId]?.[slotIdx] ?? emptySlotState()

  const patchSlotState = (productId: string, slotIdx: number, patch: Partial<TemplateSlotState>) => {
    setAllSlots(prev => {
      const base = prev[productId] ?? []
      const existing = base.length > slotIdx ? base : [...base, ...Array.from({ length: slotIdx + 1 - base.length }, emptySlotState)]
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
      const base = prev[productId] ?? []
      const existing = base.length > slotIdx ? base : [...base, ...Array.from({ length: slotIdx + 1 - base.length }, emptySlotState)]
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

  const reorderAplusSlots = (from: number, to: number) => {
    if (from === to) return
    const move = <T,>(arr: T[]): T[] => {
      const next = [...arr]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    }
    setSlotConfigs(prev => move(prev))
    setAllSlots(prev => {
      const result: Record<string, TemplateSlotState[]> = {}
      for (const pid of Object.keys(prev)) result[pid] = move(prev[pid] ?? [])
      return result
    })
    setActiveSlotIdx(a => {
      if (a === from) return to
      if (from < to && a > from && a <= to) return a - 1
      if (from > to && a >= to && a < from) return a + 1
      return a
    })
    // Invalidate cached renders — slot labels (a1, b1…) now map to different content
    capturedRef.current.clear()
    setStatuses(prev => Object.fromEntries(Object.keys(prev).map(k => [k, 'draft'])) as Record<string, ProductStatus>)
    setCaptureVersion(v => v + 1)
  }

  const reorderGallerySlots = (from: number, to: number) => {
    if (from === to) return
    const move = <T,>(arr: T[]): T[] => {
      const next = [...arr]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    }
    setGalleryConfigs(prev => move(prev))
    setAllGallerySlots(prev => {
      const result: Record<string, TemplateSlotState[]> = {}
      for (const pid of Object.keys(prev)) result[pid] = move(prev[pid] ?? [])
      return result
    })
    setActiveGalleryIdx(a => {
      if (a === from) return to
      if (from < to && a > from && a <= to) return a - 1
      if (from > to && a >= to && a < from) return a + 1
      return a
    })
    // Invalidate cached renders — slide labels (g1, g2…) now map to different content
    capturedRef.current.clear()
    setStatuses(prev => Object.fromEntries(Object.keys(prev).map(k => [k, 'draft'])) as Record<string, ProductStatus>)
    setCaptureVersion(v => v + 1)
  }

  const applyEditedCsv = useCallback((csvText: string, result: ParseResult, aplusSlots: number, galleryCount: number) => {
    const newAplusSlots   = isShopify ? 0 : aplusSlots
    const newGalleryCount = galleryCount

    setRawCsv(csvText)
    setParseResult(result)
    setAplusSlots(newAplusSlots)
    setGalleryCount(newGalleryCount)
    onStatsChange(0, result.products.length)

    const initSlot = (product: BulkProduct, j: number): TemplateSlotState => {
      const s = product.slots[j]
      const callouts = (s?.iconCallouts ?? ['', '', '', '']) as [string, string, string, string]
      const filled = callouts.filter(Boolean).length
      return {
        title: s?.title ? `<p>${s.title}</p>` : '',
        desc:  s?.desc  ? `<p>${s.desc}</p>`  : '',
        iconLabels: callouts,
        iconCount:  Math.min(Math.max(filled, 2), 4) as 2 | 3 | 4,
        iconAssets: [undefined, undefined, undefined, undefined],
      }
    }

    const initGallerySlot = (product: BulkProduct, g: number): TemplateSlotState => {
      const s = product.gallerySlots?.[g]
      const callouts = (s?.iconCallouts ?? ['', '', '', '']) as [string, string, string, string]
      const filled = callouts.filter(Boolean).length
      return {
        title: s?.title ? `<p>${s.title}</p>` : '',
        desc:  s?.desc  ? `<p>${s.desc}</p>`  : '',
        iconLabels: callouts,
        iconCount:  Math.min(Math.max(filled, 2), 4) as 2 | 3 | 4,
        iconAssets: [undefined, undefined, undefined, undefined],
      }
    }

    // Merge: text/icons always come from CSV (so edits take effect on canvas),
    // uploaded image assets are preserved from the existing state.
    setAllSlots(prev => {
      const merged: Record<string, TemplateSlotState[]> = {}
      for (const product of result.products) {
        const existing = prev[product.id]
        merged[product.id] = Array.from({ length: newAplusSlots }, (_, j) => ({
          ...initSlot(product, j),
          photoAsset: existing?.[j]?.photoAsset,
          iconAssets: existing?.[j]?.iconAssets ?? [undefined, undefined, undefined, undefined],
        }))
      }
      return merged
    })

    setAllGallerySlots(prev => {
      const merged: Record<string, TemplateSlotState[]> = {}
      for (const product of result.products) {
        const existing = prev[product.id]
        merged[product.id] = Array.from({ length: newGalleryCount }, (_, g) => ({
          ...initGallerySlot(product, g),
          photoAsset: existing?.[g]?.photoAsset,
          iconAssets: existing?.[g]?.iconAssets ?? [undefined, undefined, undefined, undefined],
        }))
      }
      return merged
    })

    // Keep current selection if it still exists, else select first product
    setSelectedId(prev =>
      prev && result.products.some(p => p.id === prev) ? prev : (result.products[0]?.id ?? null)
    )

    setStatuses({})
    capturedRef.current.clear()
    setCaptureVersion(0)
    onCanExportChange(false)
    onCanExportCurrentChange(false)
  }, [isShopify, onStatsChange, onCanExportChange, onCanExportCurrentChange])

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

  const buildShopifyGallerySlotDesign = (productId: string, slotIdx: number): DesignState => {
    const s = getGallerySlotState(productId, slotIdx)
    const cfg = galleryConfigs[slotIdx] ?? { template: 'gallery-hero' }
    return {
      ...designState,
      assets: [s.photoAsset, textureAsset ?? fallbackAsset(1), undefined, s.iconAssets[0], s.iconAssets[1], s.iconAssets[2], s.iconAssets[3]] as UploadedAsset[],
      title: s.title || '<p></p>', subtitleHtml: s.desc || '', iconLabels: s.iconLabels, iconCount: s.iconCount,
      galleryIconsShowDescription: cfg.template === 'gallery-icons-text',
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const renderProduct = useCallback(async (product: BulkProduct) => {
    setStatuses(prev => ({ ...prev, [product.id]: 'rendering' }))
    Array.from(capturedRef.current.keys()).filter(k => k.startsWith(`${product.id}/`)).forEach(k => capturedRef.current.delete(k))

    try {
      let brokenImages = 0
      const onBrokenImage = () => { brokenImages++ }

      // A+ slots: desktop + mobile
      for (let j = 0; j < aplusSlots; j++) {
        if (cancelRef.current) break
        const cfg  = slotConfigs[j] ?? { template: '5050-right' }
        const flip = cfg.template === '5050-left' || cfg.template === 'split-left'
        const isIcons = cfg.template === 'icons' || cfg.template === 'icons-text'
        const isSplit = cfg.template === 'split-right' || cfg.template === 'split-left'
        const sd  = buildSlotDesign(product.id, j)
        const lbl = slotLabel(j).toLowerCase()

        const d = await captureToDataUrl(
          isIcons
            ? <CanvasContentIcons design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
            : isSplit
              ? <CanvasContentSplit design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
              : <CanvasContent     design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />,
          1464, 600, outputFormat, onBrokenImage)
        if (d) capturedRef.current.set(`${product.id}/${lbl}-desktop`, d)

        const m = await captureToDataUrl(
          isIcons
            ? <CanvasContentIcons design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
            : isSplit
              ? <CanvasContentSplit design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
              : <CanvasContent     design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />,
          600, 450, outputFormat, onBrokenImage)
        if (m) capturedRef.current.set(`${product.id}/${lbl}-mobile`, m)
      }

      // Amazon Gallery slides (always rendered for Amazon; or gallery slides for Shopify project)
      for (let g = 0; g < galleryCount; g++) {
        if (cancelRef.current) break
        const cfg      = galleryConfigs[g] ?? { template: 'gallery-hero' }
        const isGIcons = cfg.template === 'gallery-icons' || cfg.template === 'gallery-icons-text'
        const gd       = buildGallerySlotDesign(product.id, g)
        const gi = await captureToDataUrl(
          isGIcons
            ? <CanvasContentGalleryIcons design={gd} settings={{ ...designState.gallery, layoutFlipped: false }} />
            : <CanvasContentGallery      design={gd} settings={{ ...designState.gallery, layoutFlipped: false }} />,
          1500, 1500, outputFormat, onBrokenImage)
        if (gi) capturedRef.current.set(`${product.id}/g${g + 1}-gallery`, gi)
      }

      // Shopify Gallery slides (Amazon + includeGallery only; mirrors Amazon Gallery content)
      if (!isShopify && includeGallery) {
        for (let g = 0; g < galleryCount; g++) {
          if (cancelRef.current) break
          const cfg      = galleryConfigs[g] ?? { template: 'gallery-hero' }
          const isGIcons = cfg.template === 'gallery-icons' || cfg.template === 'gallery-icons-text'
          const gd       = buildShopifyGallerySlotDesign(product.id, g)
          const gi = await captureToDataUrl(
            isGIcons
              ? <CanvasContentGalleryIcons design={gd} settings={{ ...designState.gallery, layoutFlipped: false }} />
              : <CanvasContentGallery      design={gd} settings={{ ...designState.gallery, layoutFlipped: false }} />,
            1500, 1500, outputFormat, onBrokenImage)
          if (gi) capturedRef.current.set(`${product.id}/sg${g + 1}`, gi)
        }
      }

      if (brokenImages > 0) setRenderBrokenCount(prev => prev + brokenImages)
      const ok = !cancelRef.current
      setStatuses(prev => ({ ...prev, [product.id]: ok ? 'done' : 'draft' }))
      setCaptureVersion(v => v + 1)
    } catch {
      setStatuses(prev => ({ ...prev, [product.id]: 'error' }))
      setCaptureVersion(v => v + 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplusSlots, slotConfigs, galleryCount, galleryConfigs, shopifyGalleryConfigs, includeGallery, outputFormat, designState, textureAsset, logoAsset, allSlots, allGallerySlots])

  const renderAll = useCallback(async () => {
    if (renderingAll) { cancelRef.current = true; return }
    if ((parseResult?.products ?? []).length === 0) return
    cancelRef.current = false
    setRenderBrokenCount(0)
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

  // Sanitize product names for use as Canto asset names / filenames.
  // Replaces forward/back slashes and other chars that cause API/filesystem rejections.
  function sanitizeForFilename(s: string): string {
    return s.replace(/[/\\:*?"<>|]/g, '-').replace(/-{2,}/g, '-').trim()
  }

  const handleCantoAll = useCallback(async (): Promise<CantoExportFile[]> => {
    if (!parseResult?.products.length) return []
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
    if (capturedRef.current.size === 0) return []
    const ext = outputFormat === 'jpeg' ? 'jpg' : 'png'
    const files: CantoExportFile[] = []
    capturedRef.current.forEach((dataUrl, key) => {
      const slash   = key.indexOf('/')
      const pid     = key.slice(0, slash)
      const lbl     = key.slice(slash + 1)
      const product = parseResult.products.find(p => p.id === pid)
      const rawName = (productNames[pid] !== undefined && productNames[pid] !== ''
        ? productNames[pid]
        : product?.productName) || product?.sku || pid
      const name = sanitizeForFilename(rawName)
      files.push({ filename: `${name}-${lbl}.${ext}`, dataUrl })
    })
    return files
  }, [outputFormat, parseResult, productNames, statuses, renderProduct])

  const handleCantoCurrentProduct = useCallback(async (): Promise<CantoExportFile[]> => {
    if (!selectedId) return []
    const product = parseResult?.products.find(p => p.id === selectedId)
    if (!product) return []
    if (statuses[selectedId] !== 'done') await renderProduct(product)
    const entries = Array.from(capturedRef.current.entries()).filter(([k]) => k.startsWith(`${selectedId}/`))
    if (entries.length === 0) return []
    const ext = outputFormat === 'jpeg' ? 'jpg' : 'png'
    const rawName = (productNames[selectedId] !== undefined && productNames[selectedId] !== ''
      ? productNames[selectedId]
      : product.productName) || product.sku || selectedId
    const effectiveName = sanitizeForFilename(rawName)
    return entries.map(([k, dataUrl]) => ({
      filename: `${effectiveName}-${k.slice(k.indexOf('/') + 1)}.${ext}`,
      dataUrl,
    }))
  }, [outputFormat, parseResult, selectedId, productNames, statuses, renderProduct])

  // ── Selective export ─────────────────────────────────────────────────────────

  const getSlotGroups = useCallback((): SlotGroup[] => {
    if (!selectedId) return []
    const groups: SlotGroup[] = []
    for (let j = 0; j < aplusSlots; j++) {
      const lbl = slotLabel(j)
      groups.push({ id: lbl.toLowerCase(), label: lbl, type: 'aplus' })
    }
    for (let g = 0; g < galleryCount; g++) {
      groups.push({ id: `g${g + 1}`, label: `G${g + 1}`, type: 'gallery' })
    }
    if (!isShopify && includeGallery) {
      for (let g = 0; g < galleryCount; g++) {
        groups.push({ id: `sg${g + 1}`, label: `SG${g + 1}`, type: 'sg' })
      }
    }
    return groups
  }, [selectedId, aplusSlots, galleryCount, isShopify, includeGallery])

  const handleExportSelected = useCallback(async (slotIds: string[]) => {
    if (!selectedId || slotIds.length === 0) return
    const product = parseResult?.products.find(p => p.id === selectedId)
    if (!product) return
    if (statuses[selectedId] !== 'done') await renderProduct(product)

    const slotSet = new Set(slotIds)
    const entries = Array.from(capturedRef.current.entries()).filter(([k]) => {
      if (!k.startsWith(`${selectedId}/`)) return false
      const lbl     = k.slice(k.indexOf('/') + 1)
      // Strip suffixes to get the group id: "a1-desktop" → "a1", "g1-gallery" → "g1", "sg1" → "sg1"
      const groupId = lbl.replace(/-desktop$|-mobile$|-gallery$/, '')
      return slotSet.has(groupId)
    })
    if (entries.length === 0) return

    const JSZip  = (await import('jszip')).default
    const zip    = new JSZip()
    const ext    = outputFormat === 'jpeg' ? 'jpg' : 'png'
    const rawName = (productNames[selectedId] !== undefined && productNames[selectedId] !== ''
      ? productNames[selectedId]
      : product.productName) || product.sku || selectedId
    const effectiveName = rawName
    entries.forEach(([k, d]) => {
      zip.file(`${effectiveName}-${k.slice(k.indexOf('/') + 1)}.${ext}`, d.split(',')[1], { base64: true })
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `${effectiveName}-selected.zip`,
    })
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href)
  }, [outputFormat, parseResult, selectedId, productNames, statuses, renderProduct])

  // Wire refs for parent
  useEffect(() => { exportFnRef.current        = handleExportAll            }, [exportFnRef, handleExportAll])
  useEffect(() => { exportCurrentFnRef.current = handleExportCurrent        }, [exportCurrentFnRef, handleExportCurrent])
  useEffect(() => { cantoFnRef.current         = handleCantoAll             }, [cantoFnRef, handleCantoAll])
  useEffect(() => { cantoCurrentFnRef.current  = handleCantoCurrentProduct  }, [cantoCurrentFnRef, handleCantoCurrentProduct])
  useEffect(() => { getSlotGroupsFnRef.current  = getSlotGroups             }, [getSlotGroupsFnRef, getSlotGroups])
  useEffect(() => { exportSelectedFnRef.current = handleExportSelected      }, [exportSelectedFnRef, handleExportSelected])
  useEffect(() => { renderAllFnRef.current = renderAll           }, [renderAllFnRef, renderAll])

  // ── Derived ───────────────────────────────────────────────────────────────────

  const products      = parseResult?.products ?? []
  const selected      = products.find(p => p.id === selectedId) ?? null
  const selectedIdx   = selected ? products.indexOf(selected) : -1
  const selectedStatus= selected ? (statuses[selected.id] ?? 'draft') : 'draft'

  // Active slot state — three-way: A+, Amazon Gallery, Shopify Gallery (all independent)
  const activeSlot = selected
    ? activeIsShopifyGallery
      ? getGallerySlotState(selected.id, activeShopifyGalleryIdx)
      : activeIsGallery
        ? getGallerySlotState(selected.id, activeGalleryIdx)
        : getSlotState(selected.id, activeSlotIdx)
    : emptySlotState()

  const activeCfgAplus        = slotConfigs[activeSlotIdx]       ?? { template: '5050-right' }
  const activeCfgGallery      = galleryConfigs[activeIsShopifyGallery ? activeShopifyGalleryIdx : activeGalleryIdx] ?? { template: 'gallery-hero' }
  const activeCfgForIcons     = activeIsGallery || activeIsShopifyGallery ? activeCfgGallery : activeCfgAplus
  const isIconsSlot = activeIsShopifyGallery || activeIsGallery
    ? activeCfgForIcons.template === 'gallery-icons' || activeCfgForIcons.template === 'gallery-icons-text'
    : activeCfgAplus.template === 'icons' || activeCfgAplus.template === 'icons-text'
  const showDescription = activeIsShopifyGallery || activeIsGallery
    ? activeCfgForIcons.template !== 'gallery-icons'
    : activeCfgAplus.template !== 'icons'

  const patchActive = (patch: Partial<TemplateSlotState>) => {
    if (!selected) return
    if (activeIsShopifyGallery) {
      patchGallerySlotState(selected.id, activeShopifyGalleryIdx, patch)
    } else if (activeIsGallery) {
      patchGallerySlotState(selected.id, activeGalleryIdx, patch)
    } else {
      patchSlotState(selected.id, activeSlotIdx, patch)
    }
  }

  // Build preview data
  const aplusPreviewDesigns = selected
    ? slotConfigs.slice(0, aplusSlots).map((cfg, i) => ({ design: buildSlotDesign(selected.id, i), cfg, label: slotLabel(i) }))
    : []
  const galleryPreviewDesigns = selected
    ? galleryConfigs.slice(0, galleryCount).map((cfg, i) => ({ design: buildGallerySlotDesign(selected.id, i), cfg, label: galleryLabel(i) }))
    : []
  const shopifyPreviewDesigns = selected && showShopifyGallery
    ? galleryConfigs.slice(0, galleryCount).map((cfg, i) => ({ design: buildShopifyGallerySlotDesign(selected.id, i), cfg, label: shopifyGalleryLabel(i) }))
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

  if (isLoadingFromDb) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
        <svg className="animate-spin w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

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
              className={`w-full rounded-none border-2 p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                isDragging
                  ? 'border-accent-400 bg-accent-50 dark:bg-accent-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-accent-300 dark:hover:border-accent-700 bg-gray-50 dark:bg-gray-800/40 hover:bg-accent-50/40 dark:hover:bg-accent-950/20'
              }`}
            >
              <div className={`w-12 h-12 rounded-none flex items-center justify-center transition-colors ${
                isDragging ? 'bg-accent-100 dark:bg-accent-900/60' : 'bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700'
              }`}>
                <svg className={`w-6 h-6 transition-colors ${isDragging ? 'text-accent-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {isDragging ? 'Drop to import' : 'Drop your CSV here'}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  or <span className="text-accent-500 dark:text-accent-400 font-medium">click to browse</span>
                </p>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>

            {/* Column reference */}
            <div className="mt-4 p-3 rounded-none bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
              <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                {!isShopify && <>
                  <span className="font-semibold text-gray-500 dark:text-gray-400">A+:</span>{' '}
                  <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded-none border border-gray-200 dark:border-gray-700 text-[10px]">a1_title</code>{' '}
                  <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded-none border border-gray-200 dark:border-gray-700 text-[10px]">a1_desc</code>{' '}
                  <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded-none border border-gray-200 dark:border-gray-700 text-[10px]">b1_title</code>…
                  <br />
                </>}
                <span className="font-semibold text-gray-500 dark:text-gray-400">Gallery:</span>{' '}
                <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded-none border border-gray-200 dark:border-gray-700 text-[10px]">g1_title</code>{' '}
                <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded-none border border-gray-200 dark:border-gray-700 text-[10px]">g1_desc</code>{' '}
                <code className="font-mono bg-white dark:bg-gray-900 px-1 py-px rounded-none border border-gray-200 dark:border-gray-700 text-[10px]">g2_title</code>…
              </p>
            </div>

            {/* Download template */}
            <button
              onClick={e => { e.stopPropagation(); downloadTemplate(platform) }}
              className="mt-3 w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-none text-[12px] font-semibold text-gray-500 dark:text-gray-400 hover:text-accent-600 dark:hover:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-950/30 border border-gray-200 dark:border-gray-700 hover:border-accent-200 dark:hover:border-accent-800 transition-all"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17a9 9 0 1118 0H3z" />
              </svg>
              Download template CSV
            </button>

            {/* Docs link */}
            <button
              onClick={() => setGuideOpen(true)}
              className="mt-2 w-full flex items-center justify-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-600 hover:text-accent-500 dark:hover:text-accent-400 transition-colors py-1.5"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Docs
            </button>
          </div>
        </div>

        {/* ── Right: placeholder ── */}
        <div className="w-[45%] shrink-0 relative overflow-hidden border-l border-gray-100 dark:border-gray-800 bg-gradient-to-br from-accent-50 via-accent-50 to-accent-50 dark:from-accent-950/50 dark:via-accent-950/30 dark:to-accent-950/40 flex items-center justify-center">
          {/* Dot grid */}
          <div className="absolute inset-0 opacity-30 dark:opacity-15" style={{
            backgroundImage: 'radial-gradient(circle, #af3939 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />
          {/* Fake slide previews */}
          <div className="relative flex flex-col items-center gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.22, transform: `scale(${1 - i * 0.06})` }}>
                <div className="w-48 h-20 rounded-none bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/90 dark:border-gray-700/60 shadow-md flex items-center gap-3 px-3 overflow-hidden">
                  <div className="w-14 h-14 rounded-none bg-accent-100 dark:bg-accent-900/50 shrink-0 flex items-center justify-center">
                    <svg className="w-6 h-6 text-accent-300 dark:text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-600 w-full" />
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 w-3/4" />
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 w-1/2" />
                  </div>
                </div>
                <div className="w-10 h-10 rounded-none bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/90 dark:border-gray-700/60 shadow-md flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-accent-200 dark:text-accent-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            ))}
            <p className="mt-2 text-[11px] font-semibold text-accent-300 dark:text-accent-600 uppercase tracking-widest">Your slides will appear here</p>
          </div>
        </div>

        <DocsDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
      </div>
    )
  }

  // ─── Main layout ──────────────────────────────────────────────────────────────

  return (
    <>
    <div className="flex flex-1 min-h-0 overflow-hidden animate-fade-in">

      {/* ══ LEFT SIDEBAR ══════════════════════════════════════════════════════════ */}
      <aside className={`shrink-0 flex flex-col border-r border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm z-10 transition-all duration-200 ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden border-r-0'}`} onKeyDown={e => e.stopPropagation()}>

        {/* Product navigator */}
        <div className="shrink-0 px-4 py-2 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSelectedId(products[selectedIdx - 1]?.id ?? null); setActiveSlotIdx(0); setActiveIsGallery(false); setActiveIsShopifyGallery(false) }}
              disabled={selectedIdx <= 0}
              className="w-6 h-6 flex items-center justify-center rounded-none border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex-1 min-w-0">
              {selected ? (
                <>
                  <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate leading-tight">
                    {selected.productName || `Product ${selectedIdx + 1}`}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {selectedIdx + 1} of {products.length}
                      {selectedStatus === 'done'      && ' · Rendered'}
                      {selectedStatus === 'rendering' && ' · Rendering…'}
                    </span>
                    {projectId && (saveState === 'saving' ? (
                      <svg className="w-2 h-2 text-gray-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                      </svg>
                    ) : saveState === 'unsaved' ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" title="Unsaved changes" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Saved" />
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-gray-400">No product selected</p>
              )}
            </div>
            <button
              onClick={() => { setSelectedId(products[selectedIdx + 1]?.id ?? null); setActiveSlotIdx(0); setActiveIsGallery(false); setActiveIsShopifyGallery(false) }}
              disabled={selectedIdx >= products.length - 1 || !selected}
              className="w-6 h-6 flex items-center justify-center rounded-none border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 shrink-0" />
            <button onClick={undo} disabled={!canUndo} title="Undo (⌘Z)"
              className="w-6 h-6 flex items-center justify-center rounded-none text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            <button onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)"
              className="w-6 h-6 flex items-center justify-center rounded-none text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
              </svg>
            </button>
          </div>
          {/* Product search */}
          {products.length > 0 && (
            <div className="relative mt-1.5">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder={`Search ${products.length} products…`}
                className="w-full pl-7 pr-7 py-1.5 text-[11px] border border-gray-200 dark:border-gray-600 rounded-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
              />
              {productSearch && (
                <button onClick={() => setProductSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
              {productSearch && (() => {
                const q = productSearch.toLowerCase()
                const matches = products.filter(p => (p.productName || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
                return (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-none shadow-lg max-h-52 overflow-y-auto">
                    {matches.length === 0 ? (
                      <p className="text-[10px] text-gray-400 text-center py-3">No matches</p>
                    ) : matches.map(p => {
                      const isSel = p.id === selectedId
                      return (
                        <button key={p.id} onClick={() => { setSelectedId(p.id); setActiveSlotIdx(0); setActiveIsGallery(false); setActiveIsShopifyGallery(false); setProductSearch('') }}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${isSel ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                          <StatusDot status={statuses[p.id] ?? 'draft'} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-gray-800 dark:text-gray-200 truncate leading-tight">{p.productName || `Product ${products.indexOf(p) + 1}`}</p>
                            {p.sku && <p className="text-[9px] text-gray-400 dark:text-gray-500 truncate">{p.sku}</p>}
                          </div>
                          {isSel && <svg className="w-3 h-3 text-accent-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}
          {/* Export name — no label, placeholder describes the field */}
          {selected && (
            <input
              type="text"
              value={productNames[selected.id] !== undefined ? productNames[selected.id] : (selected.productName || '')}
              onChange={e => setProductNames(prev => ({ ...prev, [selected.id]: e.target.value }))}
              placeholder={`Export name${selected.sku ? ` · ${selected.sku}` : '…'}`}
              className="mt-1.5 w-full px-2.5 py-1 text-[11px] border border-dashed border-gray-200 dark:border-gray-700 rounded-none bg-transparent text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600 focus:border-gray-300 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
            />
          )}
          {/* Progress bar — only the bar; count shown inline in subtext */}
          {products.length > 0 && (() => {
            const renderedCount = products.filter(p => statuses[p.id] === 'done').length
            const pct = Math.round((renderedCount / products.length) * 100)
            return (pct > 0 || renderingAll) ? (
              <div className="mt-2 h-0.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full bg-accent-500 transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
            ) : null
          })()}
        </div>

        {/* Remote conflict warning */}
        {remoteConflict && (
          <div className="shrink-0 mx-4 my-2 rounded-none border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
            <div className="flex items-start gap-2">
              <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.052 3.378c.866-1.5 3.032-1.5 3.898 0l7.303 12.748zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="flex-1 text-[10px] text-amber-700 dark:text-amber-400 leading-snug">Another tab saved changes to this project. Your edits may have been overwritten.</p>
              <button onClick={() => setRemoteConflict(false)} className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 shrink-0 leading-none">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* CSV parse warnings */}
        {csvWarnings.length > 0 && !csvWarningsDismissed && (
          <div className="shrink-0 mx-4 my-2 rounded-none border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
            <div className="flex items-start gap-2">
              <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.052 3.378c.866-1.5 3.032-1.5 3.898 0l7.303 12.748zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">{csvWarnings.length} import warning{csvWarnings.length !== 1 ? 's' : ''}</p>
                <ul className="mt-1 space-y-0.5 max-h-20 overflow-y-auto">
                  {csvWarnings.map((w, i) => (
                    <li key={i} className="text-[10px] text-amber-600 dark:text-amber-500 leading-snug">{w}</li>
                  ))}
                </ul>
              </div>
              <button onClick={() => setCsvWarningsDismissed(true)} className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 shrink-0 leading-none">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Proxy image load warnings */}
        {renderBrokenCount > 0 && (
          <div className="shrink-0 mx-4 my-2 rounded-none border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 px-3 py-2">
            <div className="flex items-start gap-2">
              <svg className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-400">{renderBrokenCount} image{renderBrokenCount !== 1 ? 's' : ''} failed to load</p>
                <p className="text-[10px] text-orange-600 dark:text-orange-500 mt-0.5">Some renders may have blank photo areas. Re-render after checking photo assignments.</p>
              </div>
              <button onClick={() => setRenderBrokenCount(0)} className="text-orange-400 hover:text-orange-600 dark:hover:text-orange-300 shrink-0 leading-none">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Persistent product list */}
        {products.length > 0 && (
          <div className="shrink-0 border-b border-gray-100 dark:border-gray-700">
            <button
              onClick={() => setProductListOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Products</span>
                <span className="text-[9px] text-gray-300 dark:text-gray-600 tabular-nums">{products.length}</span>
              </div>
              <svg className={`w-3 h-3 text-gray-300 dark:text-gray-600 transition-transform duration-150 ${productListOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div style={{ display: 'grid', gridTemplateRows: productListOpen ? '1fr' : '0fr', transition: 'grid-template-rows 200ms ease' }}>
              <div style={{ overflow: 'hidden' }}>
                <div className="max-h-[200px] overflow-y-auto">
                  {products.map((p, i) => {
                    const status = statuses[p.id] ?? 'draft'
                    const isActive = p.id === selectedId
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedId(p.id); setActiveSlotIdx(0); setActiveIsGallery(false); setActiveIsShopifyGallery(false) }}
                        className={`w-full flex items-center gap-2 px-4 py-1.5 text-left transition-colors ${isActive ? 'bg-accent-50 dark:bg-accent-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                      >
                        <StatusDot status={status} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] truncate leading-tight ${isActive ? 'font-semibold text-accent-700 dark:text-accent-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {p.productName || `Product ${i + 1}`}
                          </p>
                          {p.sku && <p className="text-[9px] text-gray-400 dark:text-gray-500 truncate">{p.sku}</p>}
                        </div>
                        {isActive && (
                          <div className="w-1 h-4 rounded-full bg-accent-500 shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Slot tabs — compact inline rows */}
        <div className="shrink-0 px-3 py-2 border-b border-gray-100 dark:border-gray-700 space-y-1">
          {/* A+ slots */}
          {!isShopify && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 w-5 shrink-0">A+</span>
              <div className="flex gap-1 overflow-x-auto flex-1 pt-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
                {slotConfigs.slice(0, aplusSlots).map((_, idx) => (
                  <div key={idx} className="relative group shrink-0"
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setAplusDragIdx(idx) }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setAplusDragOver(idx) }}
                    onDrop={e => { e.preventDefault(); if (aplusDragIdx !== null) reorderAplusSlots(aplusDragIdx, idx); setAplusDragIdx(null); setAplusDragOver(null) }}
                    onDragEnd={() => { setAplusDragIdx(null); setAplusDragOver(null) }}
                    style={{ opacity: aplusDragIdx === idx ? 0.35 : 1 }}
                  >
                    <button onClick={() => { setActiveSlotIdx(idx); setActiveIsGallery(false); setActiveIsShopifyGallery(false) }}
                      className={`relative flex items-center justify-center w-8 h-6 rounded-none text-[10px] font-bold transition-all cursor-grab active:cursor-grabbing ${
                        !activeIsGallery && idx === activeSlotIdx ? 'bg-accent-600 text-white'
                        : aplusDragOver === idx && aplusDragIdx !== idx ? 'bg-accent-100 dark:bg-accent-900/50 text-accent-700 ring-1 ring-accent-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                      {slotLabel(idx)}
                      {selected && slotHasFill(allSlots[selected.id]?.[idx]) && (
                        <span className={`absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full ${!activeIsGallery && idx === activeSlotIdx ? 'bg-white/60' : 'bg-accent-400'}`} />
                      )}
                    </button>
                    {aplusSlots > 1 && (
                      <button onClick={e => { e.stopPropagation(); deleteAplusSlot(idx) }} title="Remove slot"
                        className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-none bg-gray-400 dark:bg-gray-500 text-white items-center justify-center hidden group-hover:flex hover:bg-red-500 transition-colors">
                        <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}
                {aplusSlots < 10 && (
                  <button onClick={() => setAplusSlots(n => Math.min(10, n + 1))} title="Add A+ slot"
                    className="shrink-0 flex items-center justify-center w-6 h-6 rounded-none text-[11px] font-bold bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 hover:bg-accent-100 border border-accent-200 dark:border-accent-800 transition-all">+</button>
                )}
              </div>
              {selected && (() => {
                const filled = slotConfigs.slice(0, aplusSlots).filter((_, i) => slotHasFill(allSlots[selected.id]?.[i])).length
                return filled > 0 ? <span className="text-[9px] text-gray-300 dark:text-gray-600 tabular-nums shrink-0">{filled}/{aplusSlots}</span> : null
              })()}
            </div>
          )}

          {/* Gallery slots */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 w-5 shrink-0">{isShopify ? 'G' : 'AG'}</span>
            <div className="flex gap-1 overflow-x-auto flex-1 pt-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
              {galleryConfigs.slice(0, galleryCount).map((_, idx) => (
                <div key={idx} className="relative group shrink-0"
                  draggable
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setGalleryDragIdx(idx) }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setGalleryDragOver(idx) }}
                  onDrop={e => { e.preventDefault(); if (galleryDragIdx !== null) reorderGallerySlots(galleryDragIdx, idx); setGalleryDragIdx(null); setGalleryDragOver(null) }}
                  onDragEnd={() => { setGalleryDragIdx(null); setGalleryDragOver(null) }}
                  style={{ opacity: galleryDragIdx === idx ? 0.35 : 1 }}
                >
                  <button onClick={() => { setActiveGalleryIdx(idx); setActiveIsGallery(true); setActiveIsShopifyGallery(false) }}
                    className={`relative flex items-center justify-center w-8 h-6 rounded-none text-[10px] font-bold transition-all cursor-grab active:cursor-grabbing ${
                      activeIsGallery && idx === activeGalleryIdx ? 'bg-accent-600 text-white'
                      : galleryDragOver === idx && galleryDragIdx !== idx ? 'bg-accent-100 dark:bg-accent-900/50 text-accent-700 ring-1 ring-accent-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                    {galleryLabel(idx)}
                    {selected && slotHasFill(allGallerySlots[selected.id]?.[idx]) && (
                      <span className={`absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full ${activeIsGallery && idx === activeGalleryIdx ? 'bg-white/60' : 'bg-accent-400'}`} />
                    )}
                  </button>
                  {galleryCount > 1 && (
                    <button onClick={e => { e.stopPropagation(); deleteGallerySlot(idx) }} title="Remove slide"
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-none bg-gray-400 dark:bg-gray-500 text-white items-center justify-center hidden group-hover:flex hover:bg-red-500 transition-colors">
                      <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
              {galleryCount < 10 && (
                <button onClick={() => setGalleryCount(n => Math.min(10, n + 1))} title="Add gallery slide"
                  className="shrink-0 flex items-center justify-center w-6 h-6 rounded-none text-[11px] font-bold bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 hover:bg-accent-100 border border-accent-200 dark:border-accent-800 transition-all">+</button>
              )}
            </div>
            {selected && (() => {
              const filled = galleryConfigs.slice(0, galleryCount).filter((_, i) => slotHasFill(allGallerySlots[selected.id]?.[i])).length
              return filled > 0 ? <span className="text-[9px] text-gray-300 dark:text-gray-600 tabular-nums shrink-0">{filled}/{galleryCount}</span> : null
            })()}
          </div>

          {/* Shopify Gallery slots */}
          {showShopifyGallery && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-green-500 dark:text-green-600 w-5 shrink-0">SG</span>
              <div className="flex gap-1 overflow-x-auto flex-1 pt-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
                {galleryConfigs.slice(0, galleryCount).map((_, idx) => (
                  <div key={idx} className="relative group shrink-0"
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setShopifyDragIdx(idx) }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setShopifyDragOver(idx) }}
                    onDrop={e => { e.preventDefault(); if (shopifyDragIdx !== null) { } setShopifyDragIdx(null); setShopifyDragOver(null) }}
                    onDragEnd={() => { setShopifyDragIdx(null); setShopifyDragOver(null) }}
                    style={{ opacity: shopifyDragIdx === idx ? 0.35 : 1 }}
                  >
                    <button onClick={() => { setActiveShopifyGalleryIdx(idx); setActiveIsShopifyGallery(true); setActiveIsGallery(false) }}
                      className={`relative flex items-center justify-center w-8 h-6 rounded-none text-[10px] font-bold transition-all cursor-pointer ${
                        activeIsShopifyGallery && idx === activeShopifyGalleryIdx ? 'bg-green-600 text-white'
                        : shopifyDragOver === idx && shopifyDragIdx !== idx ? 'bg-green-100 dark:bg-green-900/50 text-green-700 ring-1 ring-green-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                      {shopifyGalleryLabel(idx)}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable sections */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* Content */}
          <Section title="Content" defaultOpen>
            {!selected ? (
              <p className="text-[11px] text-gray-400 text-center py-2">Select a product</p>
            ) : (
              <div className="space-y-3">
                {/* Gallery template switcher — Amazon Gallery */}
                {activeIsGallery && (
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Template</label>
                    <div className="flex gap-1">
                      {(['gallery-hero', 'gallery-icons', 'gallery-icons-text'] as const).map(t => (
                        <button key={t}
                          onClick={() => setGalleryConfigs(prev => prev.map((c, i) => i === activeGalleryIdx ? { template: t } : c))}
                          className={`flex-1 py-1.5 rounded-none text-[10px] font-bold transition-all ${activeCfgGallery.template === t ? 'bg-gray-900 dark:bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'}`}
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
                      {!activeIsGallery && !activeIsShopifyGallery && activeCfgAplus.template === 'icons-text' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-gray-400 dark:text-gray-500">Mobile</span>
                          <button
                            onClick={() => setSlotConfigs(prev => prev.map((c, i) => i === activeSlotIdx ? { ...c, mobileShowDesc: !(c.mobileShowDesc ?? true) } : c))}
                            title="Show description on mobile"
                            className={`relative w-8 h-[18px] rounded-full transition-colors ${(activeCfgAplus.mobileShowDesc ?? true) ? 'bg-accent-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                          >
                            <div className={`absolute top-[3px] w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${(activeCfgAplus.mobileShowDesc ?? true) ? 'translate-x-[17px]' : 'translate-x-[3px]'}`} />
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

                {/* Icon callouts — combined picker + label */}
                {isIconsSlot && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Icon Callouts</label>
                      <div className="flex gap-1">
                        {([2, 3, 4] as const).map(n => (
                          <button key={n} onClick={() => patchActive({ iconCount: n })}
                            className={`w-6 h-6 rounded-none text-[10px] font-bold transition-all ${activeSlot.iconCount === n ? 'bg-gray-900 dark:bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'}`}
                          >{n}</button>
                        ))}
                      </div>
                    </div>
                    {!folderConfig.iconsAlbumId && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-500">Configure an icons folder in Settings ⚙</p>
                    )}
                    <div className="space-y-1.5">
                      {Array.from({ length: activeSlot.iconCount }, (_, i) => {
                        const iconAsset = activeSlot.iconAssets[i]
                        return (
                          <div key={i} className="flex items-center gap-1.5">
                            {iconAsset ? (
                              <button
                                onClick={() => { setIconPickerSlotIdx(i); setIconPickerOpen(true) }}
                                title="Change icon"
                                className="w-7 h-7 rounded-none border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 overflow-hidden shrink-0 flex items-center justify-center hover:border-gray-400 transition-colors"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={iconAsset.url} alt={iconAsset.name} className="max-w-full max-h-full object-contain p-0.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => { setIconPickerSlotIdx(i); setIconPickerOpen(true) }}
                                disabled={!folderConfig.iconsAlbumId}
                                title="Pick icon"
                                className="w-7 h-7 rounded-none border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center justify-center transition-all"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                              </button>
                            )}
                            <input
                              type="text"
                              value={activeSlot.iconLabels[i]}
                              onChange={e => {
                                const next = [...activeSlot.iconLabels] as [string, string, string, string]
                                next[i] = e.target.value
                                patchActive({ iconLabels: next })
                              }}
                              placeholder={`Callout ${i + 1}…`}
                              className="flex-1 min-w-0 px-2.5 py-1.5 text-[11px] border border-gray-200 dark:border-gray-600 rounded-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 placeholder:text-gray-300 transition-all"
                            />
                            {iconAsset && (
                              <button
                                onClick={() => {
                                  const newIcons = [...activeSlot.iconAssets] as (UploadedAsset | undefined)[]
                                  newIcons[i] = undefined
                                  patchActive({ iconAssets: newIcons })
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded-none text-gray-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
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
                      <div className="w-12 h-8 rounded-none bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={activeSlot.photoAsset.url} alt={activeSlot.photoAsset.name} className="w-full h-full object-cover" />
                      </div>
                      <button onClick={() => { setPhotoPickerFor('main'); setPhotoPickerOpen(true) }} className="flex-1 text-left text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 truncate transition-colors" title={activeSlot.photoAsset.name}>{activeSlot.photoAsset.name}</button>
                      <button onClick={() => patchActive({ photoAsset: undefined })}
                        className="w-5 h-5 flex items-center justify-center rounded-none text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setPhotoPickerFor('main'); setPhotoPickerOpen(true) }}
                      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-none border border-dashed border-gray-300 dark:border-gray-600 text-[10px] text-gray-400 hover:border-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      Pick from library
                    </button>
                  )}
                </div>
                {/* Photo 2 — only for split templates */}
                {!activeIsGallery && !activeIsShopifyGallery &&
                  (activeCfgAplus.template === 'split-right' || activeCfgAplus.template === 'split-left') && (
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Photo 2 (Bottom)</p>
                    {activeSlot.iconAssets[0] ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-8 rounded-none bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={activeSlot.iconAssets[0].url} alt={activeSlot.iconAssets[0].name} className="w-full h-full object-cover" />
                        </div>
                        <button onClick={() => { setPhotoPickerFor('split2'); setPhotoPickerOpen(true) }} className="flex-1 text-left text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 truncate transition-colors" title={activeSlot.iconAssets[0].name}>{activeSlot.iconAssets[0].name}</button>
                        <button onClick={() => {
                          const newIcons = [...activeSlot.iconAssets] as (UploadedAsset | undefined)[]
                          newIcons[0] = undefined
                          patchActive({ iconAssets: newIcons })
                        }} className="w-5 h-5 flex items-center justify-center rounded-none text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setPhotoPickerFor('split2'); setPhotoPickerOpen(true) }}
                        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-none border border-dashed border-gray-300 dark:border-gray-600 text-[10px] text-gray-400 hover:border-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                        Pick from library
                      </button>
                    )}
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Background Texture</p>
                  <TexturePicker albumId={null} value={textureAsset} onChange={asset => setTextureAsset(asset)} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Brand Logo</p>
                  <TexturePicker albumId="QH34D" value={logoAsset} onChange={asset => setLogoAsset(asset)} placeholder="Pick logo…" thumbnailFit="contain" />
                </div>
              </div>
            )}
          </Section>

          {/* Settings — moved from top bar */}
          <Section title="Settings" defaultOpen={false}>
            <div className="space-y-4">
              {/* A+ Slots stepper — Amazon only */}
              {!isShopify && <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">A+ Slots</label>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setAplusSlots(n => Math.max(1, n - 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-none border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors font-bold">−</button>
                  <span className="w-6 text-center text-[13px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">{aplusSlots}</span>
                  <button onClick={() => setAplusSlots(n => Math.min(10, n + 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-none border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors font-bold">+</button>
                </div>
              </div>}

              {/* Shopify Gallery toggle — Amazon only */}
              {!isShopify && (
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Shopify Gallery</label>
                  <div className="flex gap-1">
                    <button onClick={() => setIncludeGallery(true)}
                      className={`flex-1 py-1.5 rounded-none text-[10px] font-bold transition-all ${includeGallery ? 'bg-gray-900 dark:bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                      On
                    </button>
                    <button onClick={() => setIncludeGallery(false)}
                      className={`flex-1 py-1.5 rounded-none text-[10px] font-bold transition-all ${!includeGallery ? 'bg-gray-900 dark:bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                      Off
                    </button>
                  </div>
                </div>
              )}

              {/* Gallery Slides stepper */}
              {<div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Gallery Slides</label>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setGalleryCount(n => Math.max(0, n - 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-none border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors font-bold">−</button>
                  <span className="w-6 text-center text-[13px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">{galleryCount}</span>
                  <button onClick={() => setGalleryCount(n => Math.min(10, n + 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-none border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors font-bold">+</button>
                </div>
              </div>}

              {/* Output format */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Output Format</label>
                <div className="flex gap-1">
                  {(['png', 'jpeg'] as const).map(f => (
                    <button key={f} onClick={() => setOutputFormat(f)}
                      className={`flex-1 py-1.5 rounded-none text-[10px] font-bold transition-all ${outputFormat === f ? 'bg-gray-900 dark:bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* CSV info + edit + clear */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">CSV File</label>
                <div className="flex items-center gap-2 p-2.5 rounded-none bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                  <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span className="flex-1 min-w-0 text-[10px] text-gray-600 dark:text-gray-400 truncate">{csvFilename}</span>
                  <button
                    onClick={() => setCsvEditorOpen(true)}
                    title="Edit CSV data"
                    className="text-[10px] text-gray-400 hover:text-accent-600 dark:hover:text-accent-400 transition-colors shrink-0 font-semibold"
                  >
                    Edit
                  </button>
                  <span className="text-gray-200 dark:text-gray-700 text-[10px]">·</span>
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="text-[10px] text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0 font-semibold"
                  >Clear</button>
                </div>
              </div>
            </div>
          </Section>
        </div>
        {/* Sidebar footer — docs */}
        <div className="shrink-0 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => setGuideOpen(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] text-gray-400 hover:text-accent-500 dark:hover:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-950/30 transition-all"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Docs
          </button>
        </div>
      </aside>

      {/* ══ MAIN CANVAS AREA ════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50 dark:bg-gray-950 relative">

        {/* Sidebar toggle — floats on left edge of canvas */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-4 h-10 flex items-center justify-center bg-white dark:bg-gray-900 border border-l-0 border-gray-200 dark:border-gray-700 rounded-none shadow-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className={`w-2.5 h-2.5 transition-transform duration-200 ${sidebarOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* ── Canvas viewport ── */}
        <main
          ref={wrapperRefCallback}
          className="flex-1 min-h-0 min-w-0 relative overflow-hidden select-none"
          style={{
            backgroundColor: isDark ? '#1a1a1a' : '#F0F0F0',
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

                {/* ── Left: A+ slots — Amazon only ── */}
                {!isShopify && <div style={{ display: 'flex', flexDirection: 'column', gap: SLOT_GAP }}>
                  {slotConfigs.slice(0, aplusSlots).map((cfg, slotIdx) => {
                    const isActive = !activeIsGallery && !activeIsShopifyGallery && slotIdx === activeSlotIdx
                    const isIcons  = cfg.template === 'icons' || cfg.template === 'icons-text'
                    const isSplit  = cfg.template === 'split-right' || cfg.template === 'split-left'
                    const flip     = cfg.template === '5050-left' || cfg.template === 'split-left'
                    const sd       = buildSlotDesign(selected.id, slotIdx)

                    const activeOutline  = `${2/zoom}px solid #2563eb`
                    const activeShadow   = `0 0 0 ${4/zoom}px rgba(37,99,235,0.10)`
                    const inactiveOutline= `${2/zoom}px solid transparent`
                    const inactiveShadow = '0 2px 12px rgba(0,0,0,0.10)'

                    return (
                      <div key={slotIdx}>
                        {/* Slot header — left anchor: label + template picker; right anchor: resolution + delete */}
                        <div style={{ height: `${28/zoom}px`, position: 'relative', marginBottom: `${8/zoom}px` }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, display: 'flex', alignItems: 'center', gap: 8, transform: `scale(${1/zoom})`, transformOrigin: 'top left' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#2563eb' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', userSelect: 'none' }}>
                              {slotLabel(slotIdx)}
                            </span>
                            {(() => {
                              const st = blockCommentStatus?.[`${selected.id}:aplus:${slotIdx}`]
                              if (!st) return null
                              return (
                                <>
                                  {st.approval === 'approved' && (
                                    <button onClick={e => { e.stopPropagation(); onOpenFeedback?.() }} title="Approved"
                                      style={{ display: 'flex', alignItems: 'center', gap: 3, height: 18, paddingLeft: 6, paddingRight: 6, borderRadius: 5, background: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5', border: `1px solid ${isDark ? 'rgba(52,211,153,0.25)' : '#A7F3D0'}`, cursor: 'pointer' }}>
                                      <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke={isDark ? '#34d399' : '#059669'} strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                      <span style={{ fontSize: 9, fontWeight: 700, color: isDark ? '#34d399' : '#059669', lineHeight: 1 }}>Approved</span>
                                    </button>
                                  )}
                                  {st.approval === 'changes_requested' && (
                                    <button onClick={e => { e.stopPropagation(); onOpenFeedback?.() }} title="Changes requested"
                                      style={{ display: 'flex', alignItems: 'center', gap: 3, height: 18, paddingLeft: 6, paddingRight: 6, borderRadius: 5, background: isDark ? 'rgba(234,88,12,0.12)' : '#FFF7ED', border: `1px solid ${isDark ? 'rgba(251,146,60,0.25)' : '#FED7AA'}`, cursor: 'pointer' }}>
                                      <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke={isDark ? '#fb923c' : '#EA580C'} strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                      <span style={{ fontSize: 9, fontWeight: 700, color: isDark ? '#fb923c' : '#EA580C', lineHeight: 1 }}>Revisions</span>
                                    </button>
                                  )}
                                  {st.open > 0 && (
                                    <button onClick={e => { e.stopPropagation(); onOpenFeedback?.() }} title={`${st.open} open comment${st.open !== 1 ? 's' : ''}`}
                                      style={{ display: 'flex', alignItems: 'center', gap: 3, height: 18, paddingLeft: 6, paddingRight: 6, borderRadius: 5, background: isDark ? 'rgba(217,119,6,0.12)' : '#FEF3C7', border: `1px solid ${isDark ? 'rgba(251,191,36,0.25)' : '#FDE68A'}`, cursor: 'pointer' }}>
                                      <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke={isDark ? '#fbbf24' : '#D97706'} strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                      <span style={{ fontSize: 9, fontWeight: 700, color: isDark ? '#fbbf24' : '#D97706', lineHeight: 1 }}>{st.open}</span>
                                    </button>
                                  )}
                                </>
                              )
                            })()}
                            <SegmentedPicker<SlotTemplate>
                              options={APLUS_TEMPLATES}
                              selected={cfg.template}
                              onSelect={t => {
                                setSlotConfigs(prev => prev.map((c, i) => i === slotIdx ? { template: t } : c))
                                setActiveSlotIdx(slotIdx)
                                setActiveIsGallery(false)
                                setActiveIsShopifyGallery(false)
                              }}
                              labels={APLUS_LABELS}
                              icons={APLUS_ICONS}
                            />
                          </div>
                          {aplusSlots > 1 && (
                            <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', alignItems: 'center', transform: `scale(${1/zoom})`, transformOrigin: 'top right' }}>
                              <button
                                onClick={e => { e.stopPropagation(); deleteAplusSlot(slotIdx) }}
                                title="Remove slot"
                                className="group/del flex items-center justify-center shrink-0 transition-colors"
                                style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid #E5E7EB', background: 'white', color: '#9CA3AF', cursor: 'pointer' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#EF4444'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#EF4444'; (e.currentTarget as HTMLButtonElement).style.color = 'white' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#E5E7EB'; (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF' }}
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
                          <div onClick={() => { setActiveSlotIdx(slotIdx); setActiveIsGallery(false); setActiveIsShopifyGallery(false) }}
                            style={{ width: 1464, height: 600, position: 'relative', overflow: 'hidden', borderRadius: 4, flexShrink: 0, outline: isActive ? activeOutline : inactiveOutline, outlineOffset: 0, boxShadow: isActive ? activeShadow : inactiveShadow, cursor: 'pointer' }}>
                            {isIcons
                              ? <CanvasContentIcons design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                              : isSplit
                                ? <CanvasContentSplit design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                                : <CanvasContent     design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped: flip }} />
                            }
                          </div>
                          <div onClick={() => { setActiveSlotIdx(slotIdx); setActiveIsGallery(false); setActiveIsShopifyGallery(false) }}
                            style={{ width: 600, height: 450, position: 'relative', overflow: 'hidden', borderRadius: 4, flexShrink: 0, outline: isActive ? activeOutline : inactiveOutline, outlineOffset: 0, boxShadow: isActive ? activeShadow : inactiveShadow, cursor: 'pointer' }}>
                            {isIcons
                              ? <CanvasContentIcons design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                              : isSplit
                                ? <CanvasContentSplit design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                                : <CanvasContent     design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped: flip }} />
                            }
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>}

                {/* ── Amazon Gallery column (always shown for Amazon; gallery for Shopify project) ── */}
                {galleryCount > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SLOT_GAP }}>
                    {/* Column label */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SLOT_GAP }}>
                      {galleryConfigs.slice(0, galleryCount).map((cfg, gIdx) => {
                        const isActive = activeIsGallery && gIdx === activeGalleryIdx
                        const isGIcons = cfg.template === 'gallery-icons' || cfg.template === 'gallery-icons-text'
                        const gd       = buildGallerySlotDesign(selected.id, gIdx)

                        const activeOutline  = `${2/zoom}px solid #2563eb`
                        const activeShadow   = `0 0 0 ${4/zoom}px rgba(37,99,235,0.10)`
                        const inactiveOutline= `${2/zoom}px solid transparent`
                        const inactiveShadow = '0 2px 12px rgba(0,0,0,0.10)'

                        return (
                          <div key={gIdx}>
                            {/* Gallery slot header — left anchor: label + picker; right anchor: resolution + delete */}
                            <div style={{ height: `${28/zoom}px`, position: 'relative', marginBottom: `${8/zoom}px` }}>
                              <div style={{ position: 'absolute', top: 0, left: 0, display: 'flex', alignItems: 'center', gap: 8, transform: `scale(${1/zoom})`, transformOrigin: 'top left' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#2563eb' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', userSelect: 'none' }}>
                                  {galleryLabel(gIdx)}
                                </span>
                                {(() => {
                                  const st = blockCommentStatus?.[`${selected.id}:gallery:${gIdx}`]
                                  if (!st) return null
                                  return (
                                    <>
                                      {st.approval === 'approved' && (
                                        <button onClick={e => { e.stopPropagation(); onOpenFeedback?.() }} title="Approved"
                                          style={{ display: 'flex', alignItems: 'center', gap: 3, height: 18, paddingLeft: 6, paddingRight: 6, borderRadius: 5, background: '#ECFDF5', border: '1px solid #A7F3D0', cursor: 'pointer' }}>
                                          <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="#059669" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                          <span style={{ fontSize: 9, fontWeight: 700, color: '#059669', lineHeight: 1 }}>Approved</span>
                                        </button>
                                      )}
                                      {st.approval === 'changes_requested' && (
                                        <button onClick={e => { e.stopPropagation(); onOpenFeedback?.() }} title="Changes requested"
                                          style={{ display: 'flex', alignItems: 'center', gap: 3, height: 18, paddingLeft: 6, paddingRight: 6, borderRadius: 5, background: '#FFF7ED', border: '1px solid #FED7AA', cursor: 'pointer' }}>
                                          <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="#EA580C" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                          <span style={{ fontSize: 9, fontWeight: 700, color: '#EA580C', lineHeight: 1 }}>Revisions</span>
                                        </button>
                                      )}
                                      {st.open > 0 && (
                                        <button onClick={e => { e.stopPropagation(); onOpenFeedback?.() }} title={`${st.open} open comment${st.open !== 1 ? 's' : ''}`}
                                          style={{ display: 'flex', alignItems: 'center', gap: 3, height: 18, paddingLeft: 6, paddingRight: 6, borderRadius: 5, background: '#FEF3C7', border: '1px solid #FDE68A', cursor: 'pointer' }}>
                                          <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="#D97706" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                          <span style={{ fontSize: 9, fontWeight: 700, color: '#D97706', lineHeight: 1 }}>{st.open}</span>
                                        </button>
                                      )}
                                    </>
                                  )
                                })()}
                                <SegmentedPicker<GalleryTemplate>
                                  options={GALLERY_TEMPLATES}
                                  selected={cfg.template}
                                  onSelect={t => {
                                    setGalleryConfigs(prev => prev.map((c, i) => i === gIdx ? { template: t } : c))
                                    setActiveGalleryIdx(gIdx)
                                    setActiveIsGallery(true)
                                    setActiveIsShopifyGallery(false)
                                  }}
                                  labels={GALLERY_LABELS}
                                  icons={GALLERY_ICONS}
                                />
                              </div>
                              {galleryCount > 1 && (
                                <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', alignItems: 'center', transform: `scale(${1/zoom})`, transformOrigin: 'top right' }}>
                                  <button
                                    onClick={e => { e.stopPropagation(); deleteGallerySlot(gIdx) }}
                                    title="Remove slide"
                                    className="flex items-center justify-center shrink-0"
                                    style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid #E5E7EB', background: 'white', color: '#9CA3AF', cursor: 'pointer' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#EF4444'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#EF4444'; (e.currentTarget as HTMLButtonElement).style.color = 'white' }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#E5E7EB'; (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF' }}
                                  >
                                    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Gallery frame */}
                            <div onClick={() => { setActiveGalleryIdx(gIdx); setActiveIsGallery(true); setActiveIsShopifyGallery(false) }}
                              style={{ width: 1500, height: 1500, position: 'relative', overflow: 'hidden', borderRadius: 4, flexShrink: 0, outline: isActive ? activeOutline : inactiveOutline, outlineOffset: 0, boxShadow: isActive ? activeShadow : inactiveShadow, cursor: 'pointer' }}>
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

                {/* ── Shopify Gallery column — Amazon only, toggle-controlled ── */}
                {showShopifyGallery && galleryCount > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SLOT_GAP }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SLOT_GAP }}>
                      {galleryConfigs.slice(0, galleryCount).map((cfg, gIdx) => {
                        const isActive   = activeIsShopifyGallery && gIdx === activeShopifyGalleryIdx
                        const isGIcons   = cfg.template === 'gallery-icons' || cfg.template === 'gallery-icons-text'
                        const gd         = buildShopifyGallerySlotDesign(selected.id, gIdx)

                        const activeOutline  = `${2/zoom}px solid #2563eb`
                        const activeShadow   = `0 0 0 ${4/zoom}px rgba(37,99,235,0.10)`
                        const inactiveOutline= `${2/zoom}px solid transparent`
                        const inactiveShadow = '0 2px 12px rgba(0,0,0,0.10)'

                        return (
                          <div key={gIdx}>
                            <div style={{ height: `${28/zoom}px`, position: 'relative', marginBottom: `${8/zoom}px` }}>
                              <div style={{ position: 'absolute', top: 0, left: 0, display: 'flex', alignItems: 'center', gap: 8, transform: `scale(${1/zoom})`, transformOrigin: 'top left' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#2563eb' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', userSelect: 'none' }}>
                                    {shopifyGalleryLabel(gIdx)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {/* Shopify Gallery frame */}
                            <div onClick={() => { setActiveShopifyGalleryIdx(gIdx); setActiveIsShopifyGallery(true); setActiveIsGallery(false) }}
                              style={{ width: 1500, height: 1500, position: 'relative', overflow: 'hidden', borderRadius: 4, flexShrink: 0, outline: isActive ? activeOutline : inactiveOutline, outlineOffset: 0, boxShadow: isActive ? activeShadow : inactiveShadow, cursor: 'pointer' }}>
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
          <div className="absolute bottom-4 right-4 z-10 flex items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-none shadow-sm overflow-hidden">
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
          if (photoPickerFor === 'split2') {
            const s = getSlotState(selected.id, activeSlotIdx)
            const newIcons = [...s.iconAssets] as (UploadedAsset | undefined)[]
            newIcons[0] = asset
            patchSlotState(selected.id, activeSlotIdx, { iconAssets: newIcons })
          } else if (activeIsShopifyGallery) {
            patchGallerySlotState(selected.id, activeShopifyGalleryIdx, { photoAsset: asset })
          } else if (activeIsGallery) {
            patchGallerySlotState(selected.id, activeGalleryIdx, { photoAsset: asset })
          } else {
            patchSlotState(selected.id, activeSlotIdx, { photoAsset: asset })
          }
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
          if (activeIsShopifyGallery)    patchGallerySlotState(selected.id, activeShopifyGalleryIdx, { iconAssets: newIcons })
          else if (activeIsGallery)      patchGallerySlotState(selected.id, activeGalleryIdx, { iconAssets: newIcons })
          else                           patchSlotState(selected.id, activeSlotIdx, { iconAssets: newIcons })
        }}
      />

    </div>

      <TemplateModePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        aplusDesigns={aplusPreviewDesigns}
        galleryDesigns={galleryPreviewDesigns}
        shopifyGalleryDesigns={shopifyPreviewDesigns}
        showShopifyGallery={showShopifyGallery}
        designState={designState}
      />

      <DocsDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />

      {/* Clear CSV confirmation */}
      {showClearConfirm && (() => {
        const dismissClear = () => {
          setClearConfirmClosing(true)
          setTimeout(() => { setShowClearConfirm(false); setClearConfirmClosing(false) }, 160)
        }
        const confirmClear = () => {
          setClearConfirmClosing(true)
          setTimeout(() => { setShowClearConfirm(false); setClearConfirmClosing(false); handleClear() }, 160)
        }
        return (
          <div
            className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm ${clearConfirmClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            onClick={dismissClear}
          >
            <div
              className={`relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-none border border-gray-100 dark:border-gray-700 overflow-hidden shadow-2xl mx-4 ${clearConfirmClosing ? 'animate-scale-out' : 'animate-scale-in'}`}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 pt-5 pb-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold text-gray-900 dark:text-white">Clear CSV data?</h2>
                  <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                    This will remove all {parseResult?.products.length ?? 0} products and their content. This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-2.5">
                <button
                  onClick={dismissClear}
                  className="flex-1 h-9 rounded-none border border-gray-200 dark:border-gray-700 text-[13px] font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmClear}
                  className="flex-1 h-9 rounded-none bg-red-500 hover:bg-red-600 text-white text-[13px] font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear All Data
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <CsvEditorModal
        open={csvEditorOpen}
        onClose={() => setCsvEditorOpen(false)}
        initialCsv={parseResult ? buildLiveCsv(parseResult.products, allSlots, allGallerySlots, aplusSlots, galleryCount) : ''}
        aplusSlots={aplusSlots}
        galleryCount={galleryCount}
        platform={platform}
        onApply={applyEditedCsv}
      />
    </>
  )
}
