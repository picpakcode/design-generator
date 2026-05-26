'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Category, DesignState, Format, FormatSettings, GalleryTemplateId, TemplateId, TextTransform, UploadedAsset } from '@/types'
import { getGalleryTemplate, getTemplate } from '@/lib/templates'
import AssetUploader from './AssetUploader'
import ExportButton from './ExportButton'
import BulkMode from './BulkMode'
import { CanvasContent, CanvasContentIcons, CanvasContentGallery, CanvasContentGalleryIcons } from './CanvasRenderers'
import { storeBlob, getBlob, deleteBlob } from '@/lib/idb'

const RichTextEditor = dynamic(() => import('./RichTextEditor'), { ssr: false })

// ─── Default settings per format ─────────────────────────────────────────────

const DESKTOP_DEFAULTS: FormatSettings = {
  layoutFlipped: false,
  logoCorner: 'tl',
  logoSize: 60,
  logoPadding: 24,
  titleFontSize: 72,
  titleLineHeight: 1.0,
  subtitleFontSize: 28,
  subtitleLineHeight: 34,
  contentPaddingX: 24,
  contentPaddingV: 24,
  titleWidth: 100,
  subtitleWidth: 100,
  titleTextTransform: 'uppercase',
  subtitleTextTransform: 'none',
  iconSize: 64,
  iconLabelFontSize: 18,
  iconLabelLineHeight: 22,
}

const MOBILE_DEFAULTS: FormatSettings = {
  layoutFlipped: false,
  logoCorner: 'tl',
  logoSize: 36,
  logoPadding: 14,
  titleFontSize: 40,
  titleLineHeight: 1.0,
  subtitleFontSize: 15,
  subtitleLineHeight: 20,
  contentPaddingX: 16,
  contentPaddingV: 14,
  titleWidth: 100,
  subtitleWidth: 100,
  titleTextTransform: 'uppercase',
  subtitleTextTransform: 'none',
  iconSize: 40,
  iconLabelFontSize: 13,
  iconLabelLineHeight: 16,
}

// Gallery images are 1500×1500 — typography scaled for larger square canvas
const GALLERY_DEFAULTS: FormatSettings = {
  layoutFlipped: false,
  logoCorner: 'tr',
  logoSize: 100,
  logoPadding: 48,
  titleFontSize: 140,
  titleLineHeight: 0.92,
  subtitleFontSize: 44,
  subtitleLineHeight: 56,
  contentPaddingX: 72,
  contentPaddingV: 60,
  titleWidth: 100,
  subtitleWidth: 85,
  titleTextTransform: 'uppercase',
  subtitleTextTransform: 'none',
  iconSize: 92,
  iconLabelFontSize: 28,
  iconLabelLineHeight: 36,
}

const DEFAULT_STATE: DesignState = {
  activeCategory: 'aplus',
  activeFormat: 'desktop',
  activeTemplate: 'aplus-5050',
  activeGalleryTemplate: 'gallery-hero',
  assets: [],
  iconCount: 3,
  iconLabels: ['Feature One', 'Feature Two', 'Feature Three', 'Feature Four'],
  title: '<p>Product Title</p>',
  subtitleHtml: '<p>Direct-fit replacement with o-rings included. Protects fuel flow, pressure, and system components right out of the box.</p>',
  primaryColor: '#222222',
  accentColor: '#AF3939',
  bodyColor: '#FEFBF7',
  desktop: DESKTOP_DEFAULTS,
  mobile: MOBILE_DEFAULTS,
  gallery: GALLERY_DEFAULTS,
}

// ─── Preset types & helpers ───────────────────────────────────────────────────

interface Preset {
  id: string
  name: string
  state: DesignState
  createdAt: number
}

function migrateLoadedState(raw: unknown): DesignState {
  const s = raw as Partial<DesignState>
  const labels = [...(s.iconLabels ?? DEFAULT_STATE.iconLabels)]
  while (labels.length < 4) labels.push(`Feature ${labels.length + 1}`)
  return {
    ...DEFAULT_STATE,
    ...s,
    assets: [],  // blob URLs don't survive page reload
    iconLabels: labels.slice(0, 4) as [string, string, string, string],
  }
}

// ─── Main workspace ───────────────────────────────────────────────────────────

export default function DesignWorkspace() {
  const [appMode, setAppMode] = useState<'design' | 'bulk'>('design')
  const [design, setDesign] = useState<DesignState>(DEFAULT_STATE)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const canvasRef    = useRef<HTMLDivElement>(null)
  const altCanvasRef = useRef<HTMLDivElement>(null)
  const wrapperRef   = useRef<HTMLDivElement>(null)
  const [scale, setScale]           = useState(1)
  const [canvasBg, setCanvasBg]     = useState('#F0F0F0')
  const [draggingIcon, setDraggingIcon] = useState<number | null>(null)

  const histRef     = useRef<DesignState[]>([DEFAULT_STATE])
  const histIdxRef  = useRef(0)
  const skipHistRef = useRef(false)
  const [histMark, setHistMark] = useState(0) // bumped to force re-render of button states

  const [presets, setPresets]       = useState<Preset[]>([])
  const [presetName, setPresetName] = useState('')

  const isGallery = design.activeCategory === 'gallery'
  const fmt = design.activeFormat
  const settings = isGallery ? design.gallery : design[fmt]
  const template = isGallery
    ? getGalleryTemplate(design.activeGalleryTemplate)
    : getTemplate(design.activeTemplate, fmt)

  const patchSettings = (patch: Partial<FormatSettings>) =>
    setDesign(d => {
      if (d.activeCategory === 'gallery') return { ...d, gallery: { ...d.gallery, ...patch } }
      return { ...d, [d.activeFormat]: { ...d[d.activeFormat], ...patch } }
    })

  const patchDesign = (p: Partial<Pick<DesignState, 'title' | 'subtitleHtml' | 'primaryColor' | 'accentColor' | 'bodyColor' | 'iconCount' | 'iconLabels'>>) =>
    setDesign(d => ({ ...d, ...p }))

  // Push to history — debounced, skipped during undo/redo
  useEffect(() => {
    if (skipHistRef.current) { skipHistRef.current = false; return }
    const t = setTimeout(() => {
      const trimmed = histRef.current.slice(0, histIdxRef.current + 1)
      trimmed.push(design)
      if (trimmed.length > 51) trimmed.shift()
      histRef.current = trimmed
      histIdxRef.current = trimmed.length - 1
      setHistMark(n => n + 1)
    }, 500)
    return () => clearTimeout(t)
  }, [design])

  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return
    skipHistRef.current = true
    histIdxRef.current -= 1
    setDesign(histRef.current[histIdxRef.current])
    setHistMark(n => n + 1)
  }, [])

  const redo = useCallback(() => {
    if (histIdxRef.current >= histRef.current.length - 1) return
    skipHistRef.current = true
    histIdxRef.current += 1
    setDesign(histRef.current[histIdxRef.current])
    setHistMark(n => n + 1)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const canUndo = histIdxRef.current > 0
  const canRedo = histIdxRef.current < histRef.current.length - 1

  // Auto-restore last session on mount — blobs fetched from IDB
  useEffect(() => {
    const restore = async () => {
      try {
        const raw = localStorage.getItem('dg:last')
        if (raw) {
          const saved = JSON.parse(raw)
          const state = migrateLoadedState(saved)
          // Restore assets: fetch each blob from IDB and recreate blob URL
          const restoredAssets = await Promise.all(
            ((saved.assets ?? []) as (UploadedAsset | undefined)[]).map(async a => {
              if (!a?.id) return undefined
              const blob = await getBlob(a.id).catch(() => undefined)
              if (!blob) return undefined
              return { ...a, url: URL.createObjectURL(blob) }
            })
          )
          state.assets = restoredAssets as UploadedAsset[]
          setDesign(state)
          histRef.current = [state]
          histIdxRef.current = 0
          skipHistRef.current = true
        }
      } catch {}
      try {
        const raw = localStorage.getItem('dg:presets')
        if (raw) setPresets(JSON.parse(raw))
      } catch {}
    }
    restore()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save last session (debounced) — asset metadata saved, blobs live in IDB
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const stripped = { ...design, assets: design.assets.map(a => a ? { ...a, url: '' } : a) }
        localStorage.setItem('dg:last', JSON.stringify(stripped))
      } catch {}
    }, 1000)
    return () => clearTimeout(t)
  }, [design])

  const savePreset = () => {
    const name = presetName.trim() || `Preset ${presets.length + 1}`
    // Clear ephemeral blob URLs; asset IDs act as IDB keys
    const assetsForSave = design.assets.map(a => a ? { ...a, url: '' } : a)
    const next = [...presets, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      state: { ...design, assets: assetsForSave },
      createdAt: Date.now(),
    }]
    setPresets(next)
    setPresetName('')
    try { localStorage.setItem('dg:presets', JSON.stringify(next)) } catch {}
  }

  const loadPreset = async (p: Preset) => {
    const base = migrateLoadedState(p.state)
    const restoredAssets = await Promise.all(
      ((p.state.assets ?? []) as (UploadedAsset | undefined)[]).map(async a => {
        if (!a?.id) return undefined
        const blob = await getBlob(a.id).catch(() => undefined)
        if (!blob) return undefined
        return { ...a, url: URL.createObjectURL(blob) }
      })
    )
    setDesign({ ...base, assets: restoredAssets as UploadedAsset[] })
  }

  const deletePreset = (id: string) => {
    const next = presets.filter(p => p.id !== id)
    setPresets(next)
    try { localStorage.setItem('dg:presets', JSON.stringify(next)) } catch {}
  }

  const copyFormatSettings = () => {
    setDesign(d => d.activeFormat === 'desktop'
      ? { ...d, mobile: { ...d.desktop } }
      : { ...d, desktop: { ...d.mobile } }
    )
  }

  useEffect(() => {
    const compute = () => {
      if (!wrapperRef.current) return
      const w = wrapperRef.current.clientWidth - 64
      const h = wrapperRef.current.clientHeight - 64
      setScale(Math.min(w / template.width, h / template.height, 1))
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [template.width, template.height])


  const handleAddAsset = (asset: UploadedAsset, slotIndex?: number) => {
    // Persist blob to IDB so it survives page reloads (fire-and-forget)
    fetch(asset.url).then(r => r.blob()).then(blob => storeBlob(asset.id, blob)).catch(console.error)
    setDesign(d => {
      if (slotIndex === undefined) return { ...d, assets: [...d.assets, asset] }
      const next = [...d.assets] as (UploadedAsset | undefined)[]
      if (next[slotIndex]) URL.revokeObjectURL(next[slotIndex]!.url)
      next[slotIndex] = asset
      return { ...d, assets: next as UploadedAsset[] }
    })
  }

  const handleRemoveAsset = (id: string) => {
    deleteBlob(id).catch(console.error)
    setDesign(d => {
      const idx = d.assets.findIndex(a => a?.id === id)
      if (idx === -1) return d
      URL.revokeObjectURL(d.assets[idx].url)
      const next = [...d.assets] as (UploadedAsset | undefined)[]
      next[idx] = undefined
      return { ...d, assets: next as UploadedAsset[] }
    })
  }

  // Current template display name
  const templateLabel = isGallery
    ? design.activeGalleryTemplate === 'gallery-icons' ? 'Gallery Icons' : 'Gallery Hero'
    : design.activeTemplate === 'aplus-5050' ? 'A+ 50/50 Split' : 'A+ Title + Icons'

  const categoryLabel = isGallery ? 'Amazon Gallery Images' : 'Amazon A+ Content'

  // Live browser tab title
  useEffect(() => {
    document.title = `${templateLabel} · Design Generator`
  }, [templateLabel])

  const iconSlots = Array.from({ length: design.iconCount }, (_, i) => `Icon ${i + 1}`)
  const assetSlotLabels = isGallery
    ? design.activeGalleryTemplate === 'gallery-icons'
      ? ['Product Photo', 'Background Texture', 'Brand Logo', ...iconSlots]
      : ['Product Photo', 'Background Texture', 'Brand Logo']
    : design.activeTemplate === 'aplus-icons'
      ? ['Product Photo', 'Background', 'Brand Logo', ...iconSlots]
      : ['Product Photo', 'Background Texture', 'Brand Logo']

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {templatePickerOpen && (
        <TemplatePicker
          category={design.activeCategory}
          currentTemplate={design.activeTemplate}
          currentGalleryTemplate={design.activeGalleryTemplate}
          onSelectAplus={id => { setDesign(d => ({ ...d, activeTemplate: id })); setTemplatePickerOpen(false) }}
          onSelectGallery={id => { setDesign(d => ({ ...d, activeGalleryTemplate: id })); setTemplatePickerOpen(false) }}
          onClose={() => setTemplatePickerOpen(false)}
        />
      )}

      {/* ── App header ── */}
      <header className="shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 z-20 shadow-sm">
        <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <span className="font-bold text-gray-900 text-base tracking-tight shrink-0">Design Generator</span>

        {/* Mode tabs */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
          {(['design', 'bulk'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setAppMode(mode)}
              className={`h-6 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
                appMode === mode
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {mode === 'design' ? 'Design' : 'Bulk'}
            </button>
          ))}
        </div>

        {appMode === 'design' && (
          <>
            <span className="text-gray-200 select-none shrink-0">|</span>
            {/* Category dropdown */}
        <div className="relative">
          <button
            onClick={() => setCategoryDropdownOpen(o => !o)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <span className="font-medium">{categoryLabel}</span>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${categoryDropdownOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {categoryDropdownOpen && (
            <>
              {/* Backdrop — closes dropdown, sits below the menu */}
              <div className="fixed inset-0 z-40" onClick={() => setCategoryDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50">
                {(['aplus', 'gallery'] as Category[]).map(id => {
                  const label = id === 'aplus' ? 'Amazon A+ Content' : 'Amazon Gallery Images'
                  const sub   = id === 'aplus' ? 'Rich banners below the fold' : 'Main product carousel · 1500×1500'
                  return (
                    <button
                      key={id}
                      onClick={() => { setDesign(d => ({ ...d, activeCategory: id })); setCategoryDropdownOpen(false) }}
                      className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-gray-50 transition-colors ${design.activeCategory === id ? 'bg-gray-50' : ''}`}
                    >
                      <div>
                        <p className={`text-xs font-semibold ${design.activeCategory === id ? 'text-gray-900' : 'text-gray-500'}`}>{label}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
                      </div>
                      {design.activeCategory === id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 ml-2" />
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Right controls */}
          <div className="ml-auto flex items-center gap-1">

            {/* Undo / Redo */}
            <button onClick={undo} disabled={!canUndo} title="Undo (⌘Z)"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <UndoIcon />
            </button>
            <button onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <RedoIcon />
            </button>

            <div className="w-px h-5 bg-gray-200 mx-1.5" />

            {/* Canvas background color */}
            <label title="Preview background" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer relative">
              <div className="w-4 h-4 rounded-sm ring-1 ring-black/10 shadow-sm" style={{ backgroundColor: canvasBg }} />
              <input
                type="color"
                value={canvasBg}
                onChange={e => setCanvasBg(e.target.value)}
                style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
              />
            </label>

            <div className="w-px h-5 bg-gray-200 mx-1.5" />

            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen(o => !o)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gray-900 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 transition-colors"
              >
                Export
                <svg className={`w-3 h-3 transition-transform duration-150 ${exportMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {exportMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                  <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 z-50">
                    <p className="text-[10px] text-gray-400 tabular-nums mb-3 px-1">
                      {template.width} × {template.height} px
                      <span className="mx-1 text-gray-300">·</span>
                      {templateLabel}
                      {!isGallery && <span className="text-gray-300"> · {fmt === 'desktop' ? 'Desktop' : 'Mobile'}</span>}
                    </p>
                    <ExportButton
                      canvasRef={canvasRef}
                      filename={`amazon-${isGallery ? 'gallery' : 'aplus'}-${isGallery ? design.activeGalleryTemplate : design.activeTemplate}${!isGallery ? `-${fmt}` : ''}`}
                      altCanvasRef={isGallery ? undefined : altCanvasRef}
                      altFilename={isGallery ? undefined : `amazon-aplus-${design.activeTemplate}-${fmt === 'desktop' ? 'mobile' : 'desktop'}`}
                    />
                  </div>
                </>
              )}
            </div>

          </div>
        </>
        )}
      </header>

      {/* ── Body ── */}
      {appMode === 'bulk' ? (
        <BulkMode designState={design} />
      ) : (<>
      <div className="flex flex-1 min-h-0">

        {/* ══ Sidebar ══ */}
        <aside className="w-72 shrink-0 flex flex-col border-r border-gray-100 bg-white shadow-sm z-10">

          {/* Template bar — pinned */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-[11px] font-semibold text-gray-700 truncate">{templateLabel}</span>
            </div>
            <button
              onClick={() => setTemplatePickerOpen(true)}
              className="shrink-0 ml-2 px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:text-gray-900 transition-colors"
            >
              Change
            </button>
          </div>

          {/* Format tabs — hidden for gallery (no desktop/mobile split) */}
          {!isGallery && (
            <>
              <div className="shrink-0 grid grid-cols-2 bg-gray-50 border-b border-gray-100">
                {(['desktop', 'mobile'] as Format[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setDesign(d => ({ ...d, activeFormat: f }))}
                    className={`py-3 flex flex-col items-center gap-1 transition-all ${
                      fmt === f
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {f === 'desktop'
                      ? <DesktopIcon className={`w-4 h-4 ${fmt === f ? 'text-gray-700' : 'text-gray-400'}`} />
                      : <MobileIcon  className={`w-4 h-4 ${fmt === f ? 'text-gray-700' : 'text-gray-400'}`} />
                    }
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${fmt === f ? 'text-gray-900' : 'text-gray-400'}`}>
                      {f}
                    </span>
                    <span className="text-[9px] font-mono text-gray-400">
                      {f === 'desktop' ? '1464×600' : '600×450'}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Scrollable settings sections */}
          <div className="flex-1 min-h-0 overflow-y-auto">

            {/* Presets */}
            <Section title="Presets" icon={<PresetsIcon />}>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') savePreset() }}
                    placeholder="Name this preset…"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 placeholder:text-gray-300 transition-all min-w-0"
                  />
                  <button
                    onClick={savePreset}
                    className="shrink-0 px-3 h-[38px] text-[11px] font-bold uppercase tracking-widest rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors"
                  >
                    Save
                  </button>
                </div>
                {presets.length === 0 ? (
                  <p className="text-[11px] text-gray-300 text-center py-1">No saved presets yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...presets].reverse().map(p => (
                      <div key={p.id} className="flex items-center gap-1.5 group">
                        <button
                          onClick={() => loadPreset(p)}
                          className="flex-1 text-left px-3 py-2 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors truncate font-medium"
                        >
                          {p.name}
                        </button>
                        <button
                          onClick={() => deletePreset(p.id)}
                          title="Delete preset"
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* Images */}
            <Section title="Images" icon={<ImagesIcon />} defaultOpen>
              <AssetUploader
                assets={design.assets}
                onAdd={handleAddAsset}
                onRemove={handleRemoveAsset}
                slotLabels={assetSlotLabels}
              />
            </Section>

            {/* Layout */}
            <Section title="Layout" icon={<LayoutGridIcon />}>
              <div className="space-y-4">
                {/* Panel order — not applicable for gallery */}
                {!isGallery && (
                  <div>
                    <p className="label-xs mb-2">Panel order</p>
                    <div className="flex gap-2">
                      {[false, true].map(flipped => (
                        <button
                          key={String(flipped)}
                          onClick={() => patchSettings({ layoutFlipped: flipped })}
                          title={flipped ? 'Text left · Photo right' : 'Photo left · Text right'}
                          className={`flex-1 h-9 rounded-lg border-2 flex items-center justify-center transition-all ${
                            settings.layoutFlipped === flipped
                              ? 'border-gray-900 bg-gray-900 text-white'
                              : 'border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
                        >
                          <PanelIcon photoLeft={!flipped} active={settings.layoutFlipped === flipped} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="label-xs mb-2">Logo corner</p>
                  <div className="grid grid-cols-2 gap-1 w-16">
                    {(['tl', 'tr', 'bl', 'br'] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => patchSettings({ logoCorner: c })}
                        className={`h-7 rounded text-sm border-2 flex items-center justify-center transition-all ${
                          settings.logoCorner === c
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-200 text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        {c === 'tl' ? '↖' : c === 'tr' ? '↗' : c === 'bl' ? '↙' : '↘'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            {/* Typography */}
            <Section title="Typography" icon={<TypoIcon />}>
              <div className="space-y-3">

                {/* Title card */}
                <div className="rounded-xl bg-gray-50 px-3 pt-2.5 pb-3 space-y-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Title</p>
                  <Slider label="Size" value={settings.titleFontSize} unit="px" min={24} max={200} step={2}
                    onChange={v => patchSettings({ titleFontSize: v })} />
                  <Slider label="Line height" value={Math.round(settings.titleLineHeight * 100)} unit="%" min={70} max={150} step={5}
                    onChange={v => patchSettings({ titleLineHeight: v / 100 })} />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Transform</p>
                    <TransformBtns value={settings.titleTextTransform} onChange={v => patchSettings({ titleTextTransform: v })} />
                  </div>
                  <Slider label="Max width" value={settings.titleWidth} unit="%" min={20} max={100} step={5}
                    onChange={v => patchSettings({ titleWidth: v })} />
                </div>

                {/* Description card */}
                <div className="rounded-xl bg-gray-50 px-3 pt-2.5 pb-3 space-y-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Description</p>
                  <Slider label="Size" value={settings.subtitleFontSize} unit="px" min={10} max={80} step={1}
                    onChange={v => patchSettings({ subtitleFontSize: v })} />
                  <Slider label="Line height" value={settings.subtitleLineHeight} unit="px" min={10} max={120} step={1}
                    onChange={v => patchSettings({ subtitleLineHeight: v })} />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Transform</p>
                    <TransformBtns value={settings.subtitleTextTransform} onChange={v => patchSettings({ subtitleTextTransform: v })} />
                  </div>
                  <Slider label="Max width" value={settings.subtitleWidth} unit="%" min={20} max={100} step={5}
                    onChange={v => patchSettings({ subtitleWidth: v })} />
                </div>

                {/* Icon labels card — for aplus-icons and gallery-icons */}
                {((!isGallery && design.activeTemplate === 'aplus-icons') || (isGallery && design.activeGalleryTemplate === 'gallery-icons')) && (
                  <div className="rounded-xl bg-gray-50 px-3 pt-2.5 pb-3 space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Icon Labels</p>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Count</p>
                      <div className="flex gap-1">
                        {([2, 3, 4] as const).map(n => (
                          <button
                            key={n}
                            onClick={() => patchDesign({ iconCount: n })}
                            className={`flex-1 h-7 rounded-md text-xs font-bold border-2 transition-all ${
                              design.iconCount === n
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Slider label="Icon size" value={settings.iconSize} unit="px" min={24} max={120} step={4}
                      onChange={v => patchSettings({ iconSize: v })} />
                    <Slider label="Label size" value={settings.iconLabelFontSize} unit="px" min={10} max={32} step={1}
                      onChange={v => patchSettings({ iconLabelFontSize: v })} />
                    <Slider label="Label leading" value={settings.iconLabelLineHeight} unit="px" min={10} max={50} step={1}
                      onChange={v => patchSettings({ iconLabelLineHeight: v })} />
                  </div>
                )}

              </div>
            </Section>

            {/* Spacing */}
            <Section title="Spacing" icon={<SpacingIcon />}>
              <div className="space-y-2">
                <Slider label="Padding H" value={settings.contentPaddingX} unit="px" min={8} max={120} step={4}
                  onChange={v => patchSettings({ contentPaddingX: v })} />
                <Slider label="Padding V" value={settings.contentPaddingV} unit="px" min={8} max={120} step={4}
                  onChange={v => patchSettings({ contentPaddingV: v })} />
                <Slider label="Logo size" value={settings.logoSize} unit="px" min={20} max={200} step={4}
                  onChange={v => patchSettings({ logoSize: v })} />
                <Slider label="Logo padding" value={settings.logoPadding} unit="px" min={4} max={100} step={4}
                  onChange={v => patchSettings({ logoPadding: v })} />
              </div>
            </Section>

            {/* Content */}
            <Section title="Content" icon={<EditIcon />} defaultOpen>
              <div className="space-y-3">
                <div>
                  <label className="label-xs mb-1.5 block">Title</label>
                  <RichTextEditor
                    value={design.title}
                    onChange={html => patchDesign({ title: html })}
                    placeholder="Product title…"
                  />
                </div>
                <div>
                  <label className="label-xs mb-1.5 block">Description</label>
                  <RichTextEditor
                    value={design.subtitleHtml}
                    onChange={html => patchDesign({ subtitleHtml: html })}
                    placeholder="Write description…"
                  />
                </div>

                {((!isGallery && design.activeTemplate === 'aplus-icons') || (isGallery && design.activeGalleryTemplate === 'gallery-icons')) && (
                  <div className="space-y-2">
                    <label className="label-xs block">Icon Labels</label>
                    {Array.from({ length: design.iconCount }, (_, i) => (
                      <div
                        key={i}
                        draggable
                        onDragStart={() => setDraggingIcon(i)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          e.preventDefault()
                          if (draggingIcon === null || draggingIcon === i) return
                          const from = draggingIcon
                          const next = [...design.iconLabels] as [string, string, string, string]
                          ;[next[from], next[i]] = [next[i], next[from]]
                          setDesign(d => {
                            const nextAssets = [...d.assets]
                            ;[nextAssets[3 + from], nextAssets[3 + i]] = [nextAssets[3 + i], nextAssets[3 + from]]
                            return { ...d, iconLabels: next, assets: nextAssets }
                          })
                          setDraggingIcon(null)
                        }}
                        onDragEnd={() => setDraggingIcon(null)}
                        className={`flex items-center gap-2 transition-opacity ${draggingIcon === i ? 'opacity-40' : ''}`}
                      >
                        <div className="cursor-grab shrink-0 text-gray-300 hover:text-gray-500 transition-colors">
                          <DragHandleIcon />
                        </div>
                        <input
                          type="text"
                          value={design.iconLabels[i]}
                          onChange={e => {
                            const next = [...design.iconLabels] as [string, string, string, string]
                            next[i] = e.target.value
                            patchDesign({ iconLabels: next })
                          }}
                          placeholder={`Icon ${i + 1} label…`}
                          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white
                                     focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400
                                     placeholder:text-gray-300 transition-all"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* Colors */}
            <Section title="Colors" icon={<ColorIcon />}>
              <div className="space-y-3">
                <ColorRow
                  label="Background panel"
                  value={design.primaryColor}
                  onChange={v => patchDesign({ primaryColor: v })}
                />
                <ColorRow
                  label="Accent / title"
                  value={design.accentColor}
                  onChange={v => patchDesign({ accentColor: v })}
                />
                <ColorRow
                  label="Body text"
                  value={design.bodyColor}
                  onChange={v => patchDesign({ bodyColor: v })}
                />
              </div>
            </Section>

          </div>

        </aside>

        {/* ══ Canvas area ══ */}
        <main ref={wrapperRef} className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center p-8" style={{ backgroundColor: canvasBg }}>

          {/* Canvas preview */}
          <div
            className="shadow-2xl overflow-hidden ring-1 ring-black/5"
            style={{
              width: template.width * scale,
              height: template.height * scale,
              position: 'relative',
              flexShrink: 0,
              borderRadius: isGallery ? 12 : 12,
            }}
          >
            <div
              style={{
                width: template.width,
                height: template.height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                position: 'absolute',
                top: 0,
                left: 0,
              }}
            >
              <div
                ref={canvasRef}
                className="design-canvas"
                style={{ width: template.width, height: template.height, position: 'relative' }}
              >
                {isGallery
                  ? design.activeGalleryTemplate === 'gallery-icons'
                    ? <CanvasContentGalleryIcons design={design} settings={settings} />
                    : <CanvasContentGallery design={design} settings={settings} />
                  : design.activeTemplate === 'aplus-icons'
                    ? <CanvasContentIcons design={design} settings={settings} />
                    : <CanvasContent design={design} settings={settings} />
                }
              </div>
            </div>
          </div>

        </main>
      </div>

      {/* Hidden off-screen canvas for Export All (opposite format) */}
      {!isGallery && (() => {
        const altFmt = fmt === 'desktop' ? 'mobile' : 'desktop'
        const altTpl = getTemplate(design.activeTemplate, altFmt)
        const altSettings = design[altFmt]
        return (
          <div style={{ position: 'fixed', top: -99999, left: -99999, pointerEvents: 'none' }}>
            <div
              ref={altCanvasRef}
              className="design-canvas"
              style={{ width: altTpl.width, height: altTpl.height, position: 'relative' }}
            >
              {design.activeTemplate === 'aplus-icons'
                ? <CanvasContentIcons design={{ ...design, activeFormat: altFmt }} settings={altSettings} />
                : <CanvasContent design={{ ...design, activeFormat: altFmt }} settings={altSettings} />
              }
            </div>
          </div>
        )
      })()}
      </>)}
    </div>
  )
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({ title, icon, defaultOpen = false, children }: { title: string; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left group">
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-400 group-hover:text-gray-500 transition-colors">{icon}</span>}
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 group-hover:text-gray-700 transition-colors">{title}</span>
        </div>
        <svg className={`w-3 h-3 text-gray-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  )
}

// ─── Slider row ───────────────────────────────────────────────────────────────

function Slider({ label, value, unit, min, max, step, onChange }: { label: string; value: number; unit: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs text-gray-400 tabular-nums font-mono">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full h-1 rounded-full appearance-none cursor-pointer accent-gray-800" />
    </div>
  )
}

// ─── Text transform buttons ───────────────────────────────────────────────────

const TRANSFORMS: { value: TextTransform; label: string; title: string }[] = [
  { value: 'none',       label: 'Ag', title: 'Default' },
  { value: 'uppercase',  label: 'AG', title: 'Uppercase' },
  { value: 'lowercase',  label: 'ag', title: 'Lowercase' },
  { value: 'capitalize', label: 'Aa', title: 'Capitalize' },
]

function TransformBtns({ value, onChange }: { value: TextTransform; onChange: (v: TextTransform) => void }) {
  return (
    <div className="flex gap-1">
      {TRANSFORMS.map(t => (
        <button key={t.value} title={t.title} onClick={() => onChange(t.value)}
          className={`flex-1 py-1.5 text-xs rounded-md border font-mono font-semibold transition-all ${value === t.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── Color row ────────────────────────────────────────────────────────────────

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className="relative w-9 h-9 rounded-xl overflow-hidden shrink-0 ring-2 ring-gray-200 group-hover:ring-gray-400 transition-all">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="cursor-pointer border-none"
          style={{ position: 'absolute', top: '-4px', left: '-4px', width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', padding: 0 }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-600 leading-none mb-0.5">{label}</p>
        <p className="text-[10px] text-gray-400 font-mono uppercase">{value}</p>
      </div>
    </label>
  )
}

// ─── Panel layout icon ────────────────────────────────────────────────────────

function PanelIcon({ photoLeft, active }: { photoLeft: boolean; active: boolean }) {
  const c = active ? 'white' : 'currentColor'
  const photo = <div className="w-4 h-5 rounded-sm" style={{ backgroundColor: c, opacity: active ? 0.7 : 0.4 }} />
  const text = (
    <div className="flex flex-col gap-0.5">
      <div className="w-5 h-1 rounded-full" style={{ backgroundColor: c, opacity: active ? 1 : 0.7 }} />
      <div className="w-4 h-1 rounded-full" style={{ backgroundColor: c, opacity: active ? 0.7 : 0.5 }} />
      <div className="w-3 h-1 rounded-full" style={{ backgroundColor: c, opacity: active ? 0.5 : 0.3 }} />
    </div>
  )
  return <div className="flex items-center gap-1">{photoLeft ? <>{photo}{text}</> : <>{text}{photo}</>}</div>
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function DesktopIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function MobileIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  )
}

function ImagesIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function LayoutGridIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  )
}

function TypoIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7V4h16v3M9 20h6M12 4v16" />
    </svg>
  )
}

function DragHandleIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5.5" cy="4" r="1.2" /><circle cx="10.5" cy="4" r="1.2" />
      <circle cx="5.5" cy="8" r="1.2" /><circle cx="10.5" cy="8" r="1.2" />
      <circle cx="5.5" cy="12" r="1.2" /><circle cx="10.5" cy="12" r="1.2" />
    </svg>
  )
}

function SpacingIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h2m8-16h2a2 2 0 012 2v12a2 2 0 01-2 2h-2M9 12h6" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}

function ColorIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
    </svg>
  )
}

function PresetsIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  )
}

function CopyFormatIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  )
}

// ─── Template picker modal ────────────────────────────────────────────────────

const APLUS_TEMPLATE_CARDS: { id: TemplateId; name: string; desc: string; available: boolean; preview: React.ReactNode }[] = [
  {
    id: 'aplus-5050',
    name: 'A+ 50/50 Split',
    desc: 'Image and text side by side',
    available: true,
    preview: (
      <div className="w-full h-full flex">
        <div className="w-1/2 h-full bg-gray-300 rounded-l-md" />
        <div className="w-1/2 h-full bg-gray-700 rounded-r-md flex flex-col justify-center gap-1 px-2">
          <div className="h-1.5 w-3/4 bg-white/70 rounded-full" />
          <div className="h-1 w-full bg-white/40 rounded-full" />
          <div className="h-1 w-5/6 bg-white/40 rounded-full" />
        </div>
      </div>
    ),
  },
  {
    id: 'aplus-icons',
    name: 'A+ Title + Icons',
    desc: 'Title, description, and 3 icons',
    available: true,
    preview: (
      <div className="w-full h-full flex">
        <div className="w-1/2 h-full bg-gray-300 rounded-l-md" />
        <div className="w-1/2 h-full bg-gray-700 rounded-r-md flex flex-col justify-between px-2 py-2">
          <div className="space-y-1">
            <div className="h-1.5 w-4/5 bg-red-400/80 rounded-full" />
            <div className="h-1 w-full bg-white/40 rounded-full" />
            <div className="h-1 w-5/6 bg-white/40 rounded-full" />
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex-1 border border-white/20 bg-white/10 flex flex-col items-center gap-0.5 py-1">
                <div className="w-3 h-3 rounded-full bg-red-400/70" />
                <div className="w-full h-0.5 bg-white/40 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'aplus-hero',
    name: 'A+ Hero Image',
    desc: 'Full-width hero with text overlay',
    available: false,
    preview: (
      <div className="w-full h-full bg-gray-300 rounded-md relative flex flex-col justify-end p-2">
        <div className="absolute inset-0 rounded-md bg-gradient-to-t from-gray-800/80 to-transparent" />
        <div className="relative space-y-1">
          <div className="h-1.5 w-3/5 bg-white/80 rounded-full" />
          <div className="h-1 w-4/5 bg-white/50 rounded-full" />
        </div>
      </div>
    ),
  },
  {
    id: 'aplus-brand-story',
    name: 'A+ Brand Story',
    desc: 'Wide narrative layout',
    available: false,
    preview: (
      <div className="w-full h-full rounded-md bg-gray-800 flex flex-col justify-between p-2">
        <div className="flex gap-1 items-center">
          <div className="w-4 h-4 rounded-full bg-gray-400 shrink-0" />
          <div className="h-1 w-16 bg-gray-500 rounded-full" />
        </div>
        <div className="space-y-1">
          <div className="h-2 w-2/3 bg-white/60 rounded-full" />
          <div className="h-1 w-full bg-gray-500 rounded-full" />
          <div className="h-1 w-5/6 bg-gray-500 rounded-full" />
        </div>
      </div>
    ),
  },
]

const GALLERY_TEMPLATE_CARDS: { id: GalleryTemplateId; name: string; desc: string; available: boolean; preview: React.ReactNode }[] = [
  {
    id: 'gallery-hero',
    name: 'Gallery Hero',
    desc: 'Full photo with text panel below',
    available: true,
    preview: (
      <div className="w-full h-full flex flex-col rounded-md overflow-hidden">
        <div className="flex-1 bg-gray-300" />
        <div style={{ height: 3, backgroundColor: '#AF3939' }} />
        <div className="bg-gray-800 px-2 py-1.5 space-y-1">
          <div className="h-2 w-3/4 rounded-full" style={{ backgroundColor: '#AF3939', opacity: 0.8 }} />
          <div className="h-1 w-full bg-white/40 rounded-full" />
        </div>
      </div>
    ),
  },
  {
    id: 'gallery-icons',
    name: 'Gallery Icons',
    desc: 'Photo top, title + 3 features below',
    available: true,
    preview: (
      <div className="w-full h-full flex flex-col rounded-md overflow-hidden">
        <div className="flex-1 bg-gray-300" />
        <div style={{ height: 3, backgroundColor: '#AF3939' }} />
        <div className="bg-gray-800 flex" style={{ height: '38%' }}>
          {/* Left: title */}
          <div className="flex flex-col justify-center px-2 border-r border-white/10" style={{ width: '42%' }}>
            <div className="h-2 w-full rounded-full" style={{ backgroundColor: '#AF3939', opacity: 0.8 }} />
            <div className="h-2 w-3/4 rounded-full mt-0.5" style={{ backgroundColor: '#AF3939', opacity: 0.8 }} />
          </div>
          {/* Right: 3 icon rows */}
          <div className="flex flex-col justify-around py-1 px-1.5 flex-1">
            {[0,1,2].map(i => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#AF3939' }} />
                <div className="h-1 flex-1 bg-white/40 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'gallery-feature',
    name: 'Gallery Feature',
    desc: 'Feature callout with overlay text',
    available: false,
    preview: (
      <div className="w-full h-full bg-gray-300 rounded-md relative flex items-end p-2">
        <div className="absolute inset-0 rounded-md bg-gradient-to-t from-gray-900/80 to-transparent" />
        <div className="relative space-y-1 w-full">
          <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: '#AF3939', opacity: 0.8 }} />
          <div className="h-1 w-full bg-white/50 rounded-full" />
        </div>
      </div>
    ),
  },
  {
    id: 'gallery-lifestyle',
    name: 'Gallery Lifestyle',
    desc: 'Lifestyle shot with minimal branding',
    available: false,
    preview: (
      <div className="w-full h-full bg-gray-400 rounded-md relative overflow-hidden">
        <div className="absolute top-2 right-2 space-y-1">
          <div className="h-1.5 w-12 bg-white/80 rounded-full" />
          <div className="h-1 w-10 bg-white/50 rounded-full" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: '#AF3939' }} />
      </div>
    ),
  },
]

function TemplatePicker({
  category,
  currentTemplate,
  currentGalleryTemplate,
  onSelectAplus,
  onSelectGallery,
  onClose,
}: {
  category: Category
  currentTemplate: TemplateId
  currentGalleryTemplate: GalleryTemplateId
  onSelectAplus: (id: TemplateId) => void
  onSelectGallery: (id: GalleryTemplateId) => void
  onClose: () => void
}) {
  const isGallery = category === 'gallery'
  const cards = isGallery ? GALLERY_TEMPLATE_CARDS : APLUS_TEMPLATE_CARDS
  const currentId = isGallery ? currentGalleryTemplate : currentTemplate

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {isGallery ? 'Gallery Image Templates' : 'A+ Content Templates'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isGallery ? 'Amazon Gallery Images · 1500 × 1500 px' : 'Amazon A+ Content · 1464 × 600 desktop'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Grid */}
        <div className="p-6 grid grid-cols-2 gap-4">
          {cards.map(card => {
            const isActive = card.id === currentId
            return (
              <button
                key={card.id}
                onClick={card.available ? () => isGallery ? onSelectGallery(card.id as GalleryTemplateId) : onSelectAplus(card.id as TemplateId) : undefined}
                disabled={!card.available}
                className={`group relative rounded-xl border-2 overflow-hidden text-left transition-all ${
                  isActive
                    ? 'border-gray-900 ring-2 ring-gray-900/10'
                    : card.available
                      ? 'border-gray-200 hover:border-gray-400'
                      : 'border-gray-200 opacity-60 cursor-default'
                }`}
              >
                <div className="h-24 p-2 bg-gray-100">{card.preview}</div>
                <div className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-800">{card.name}</p>
                    {isActive ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">Active</span>
                    ) : card.available ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full shrink-0">Select</span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">Soon</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{card.desc}</p>
                </div>
              </button>
            )
          })}
        </div>

        <p className="text-center text-[10px] text-gray-300 pb-5 -mt-1">More templates coming soon</p>
      </div>
    </div>
  )
}
