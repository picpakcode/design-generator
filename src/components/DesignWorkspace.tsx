'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Category, DesignBlock, DesignState, Format, FormatSettings, GalleryTemplateId, PhotoComposition, DEFAULT_PHOTO_COMP, TemplateId, TextTransform, UploadedAsset } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { loadProject, saveProject, saveProjectThumbnail, renameProject, createProject, loadProjectShare } from '@/lib/db'
import { usePresence, presenceColor } from '@/hooks/usePresence'
import ShareModal from './ShareModal'
import { getGalleryTemplate, getTemplate } from '@/lib/templates'
import AssetUploader from './AssetUploader'
import ExportButton from './ExportButton'
import { exportAllAsZip } from '@/lib/export'
import BulkMode from './BulkMode'
import { CanvasContent, CanvasContentIcons, CanvasContentGallery, CanvasContentGalleryIcons } from './CanvasRenderers'
import CantoAssetPicker from './CantoAssetPicker'
import CantoIconPickerModal from './CantoIconPickerModal'
import CantoPhotoPickerModal from './CantoPhotoPickerModal'
import { FolderConfig } from '@/lib/canto-folders'
import { storeBlob, getBlob, deleteBlob } from '@/lib/idb'
import { useAuth } from '@/hooks/useAuth'
import { useAppSettings } from '@/hooks/useAppSettings'
import AuthModal from './AuthModal'
import PreviewModal from './PreviewModal'

const RichTextEditor = dynamic(() => import('./RichTextEditor'), { ssr: false })

// ─── Module-level constants ───────────────────────────────────────────────────

const APLUS_TEMPLATE_IDS: TemplateId[] = ['aplus-5050', 'aplus-icons']
const GALLERY_TEMPLATE_IDS: GalleryTemplateId[] = ['gallery-hero', 'gallery-icons']
const FORMATS: Format[] = ['desktop', 'mobile']
const FRAME_GAP = 32

// Converts any string to a lowercase URL-safe slug
const toSlug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

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
  photoComposition: { ...DEFAULT_PHOTO_COMP },
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
  iconSize: 64,
  iconLabelFontSize: 18,
  iconLabelLineHeight: 32,
  photoComposition: { ...DEFAULT_PHOTO_COMP },
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
  photoComposition: { ...DEFAULT_PHOTO_COMP },
}

const INITIAL_BLOCK_1: DesignBlock = {
  id: 'block-1',
  templateId: 'aplus-5050',
  title: '<p>Product Title</p>',
  subtitleHtml: '<p>Add your product description here.</p>',
  iconCount: 3,
  iconLabels: ['Feature One', 'Feature Two', 'Feature Three', 'Feature Four'],
  layoutFlipped: false,
  assets: [],
}

const INITIAL_BLOCK_2: DesignBlock = {
  id: 'block-2',
  templateId: 'aplus-icons',
  title: '<p>Product Title</p>',
  subtitleHtml: '<p>Add your product description here.</p>',
  iconCount: 3,
  iconLabels: ['Feature One', 'Feature Two', 'Feature Three', 'Feature Four'],
  layoutFlipped: false,
  assets: [],
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
  subtitleHtml: '<p>Add your product description here.</p>',
  primaryColor: '#222222',
  accentColor: '#AF3939',
  bodyColor: '#FEFBF7',
  iconColor: '#ffffff',
  desktop: DESKTOP_DEFAULTS,
  mobile: MOBILE_DEFAULTS,
  gallery: GALLERY_DEFAULTS,
  blocks: [INITIAL_BLOCK_1, INITIAL_BLOCK_2],
  activeBlockId: 'block-1',
  productName: '',
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
  const safeLabels = labels.slice(0, 4) as [string, string, string, string]

  const rawBlocks: DesignBlock[] = s.blocks ?? [
    {
      id: 'block-1',
      templateId: (s.activeTemplate ?? DEFAULT_STATE.activeTemplate) as TemplateId,
      title: s.title ?? DEFAULT_STATE.title,
      subtitleHtml: s.subtitleHtml ?? DEFAULT_STATE.subtitleHtml,
      iconCount: s.iconCount ?? DEFAULT_STATE.iconCount,
      iconLabels: safeLabels,
      layoutFlipped: false,
      assets: [],
    },
    {
      id: 'block-2',
      templateId: 'aplus-icons',
      title: s.title ?? DEFAULT_STATE.title,
      subtitleHtml: s.subtitleHtml ?? DEFAULT_STATE.subtitleHtml,
      iconCount: s.iconCount ?? DEFAULT_STATE.iconCount,
      iconLabels: safeLabels,
      layoutFlipped: false,
      assets: [],
    },
  ]
  // Backfill assets for blocks saved before per-block assets were added
  const blocks = rawBlocks.map(b => ({ ...b, assets: b.assets ?? [] }))

  return {
    ...DEFAULT_STATE,
    ...s,
    assets: [],  // blob URLs don't survive page reload
    iconLabels: safeLabels,
    desktop: { ...DESKTOP_DEFAULTS, ...(s.desktop ?? {}) },
    mobile:  { ...MOBILE_DEFAULTS,  ...(s.mobile  ?? {}) },
    gallery: { ...GALLERY_DEFAULTS, ...(s.gallery  ?? {}) },
    blocks,
    activeBlockId: s.activeBlockId ?? blocks[0].id,
    productName: s.productName ?? '',
  }
}

// ─── Main workspace ───────────────────────────────────────────────────────────

interface Props { projectId?: string; defaultOpenShare?: boolean }

export default function DesignWorkspace({ projectId, defaultOpenShare }: Props) {
  const { user, signOut, loading: authLoading } = useAuth()
  const { settings: appSettings, update: updateAppSettings, folderConfig, updateFolderConfig } = useAppSettings()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen]   = useState(false)
  const [iconPickerSlot, setIconPickerSlot] = useState<number | null>(null)
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false)

  const [appMode, setAppMode] = useState<'design' | 'bulk'>('design')
  const [design, setDesign] = useState<DesignState>(DEFAULT_STATE)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [bulkExportOpen, setBulkExportOpen] = useState(false)
  const [bulkCanExport, setBulkCanExport] = useState(false)
  const bulkExportFnRef = useRef<() => void>(() => {})

  const canvasRef        = useRef<HTMLDivElement>(null)
  const altCanvasRef     = useRef<HTMLDivElement>(null)
  const wrapperRef       = useRef<HTMLDivElement>(null)
  const frameContainerRef = useRef<HTMLDivElement>(null)
  // Tracks all rendered block-frame inner divs: key = "{blockId}-{format}"
  const allFrameRefs     = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const [scale, setScale]           = useState(1)
  const CANVAS_BG_LIGHT = '#F0F0F0'
  const CANVAS_BG_DARK  = '#1a1a1a'
  const [canvasBg, setCanvasBg] = useState(CANVAS_BG_LIGHT)
  const [draggingIcon, setDraggingIcon] = useState<number | null>(null)
  const [customBase, setCustomBase] = useState<string | null>(null)
  const [isExportingAll, setIsExportingAll] = useState(false)

  const histRef     = useRef<DesignState[]>([DEFAULT_STATE])
  const histIdxRef  = useRef(0)
  const skipHistRef = useRef(false)
  const [histMark, setHistMark] = useState(0) // bumped to force re-render of button states
  const hasSavedThumbnailRef = useRef(false)

  const [projectName, setProjectName] = useState<string>('')
  const [isRenamingProject, setIsRenamingProject] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState('')
  const projectNameInputRef = useRef<HTMLInputElement>(null)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const [presets, setPresets]       = useState<Preset[]>([])
  const [presetName, setPresetName] = useState('')
  const [projectLoading, setProjectLoading] = useState(false)

  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [saveToShareOpen, setSaveToShareOpen] = useState(false)
  const [saveToShareName, setSaveToShareName] = useState('')
  const [saveToShareSaving, setSaveToShareSaving] = useState(false)
  const isApplyingRemoteRef = useRef(false)

  const isGallery = design.activeCategory === 'gallery'
  const fmt = design.activeFormat
  const settings = isGallery ? design.gallery : design[fmt]
  const template = isGallery
    ? getGalleryTemplate(design.activeGalleryTemplate)
    : getTemplate(design.activeTemplate, fmt)

  const { peers, broadcastState } = usePresence({
    projectId,
    userId: user?.id,
    email: user?.email,
    activeBlockId: design.activeBlockId ?? null,
    onStateUpdate: (state) => {
      isApplyingRemoteRef.current = true
      skipHistRef.current = true
      setDesign(state)
      setTimeout(() => { isApplyingRemoteRef.current = false }, 0)
    },
  })

  const patchSettings = (patch: Partial<FormatSettings>) =>
    setDesign(d => {
      if (d.activeCategory === 'gallery') return { ...d, gallery: { ...d.gallery, ...patch } }
      const newSettings = { ...d[d.activeFormat], ...patch }
      const result: DesignState = { ...d, [d.activeFormat]: newSettings }
      if ('layoutFlipped' in patch) {
        // Sync to the other format and to the active block
        const otherFmt = d.activeFormat === 'desktop' ? 'mobile' : 'desktop'
        result[otherFmt] = { ...d[otherFmt], layoutFlipped: patch.layoutFlipped! }
        result.blocks = d.blocks.map(b =>
          b.id === d.activeBlockId ? { ...b, layoutFlipped: patch.layoutFlipped! } : b
        )
      }
      return result
    })

  const patchDesign = (p: Partial<Pick<DesignState, 'title' | 'subtitleHtml' | 'primaryColor' | 'accentColor' | 'bodyColor' | 'iconColor' | 'iconCount' | 'iconLabels'>>) =>
    setDesign(d => {
      const blockPatch: Partial<DesignBlock> = {}
      if ('title'        in p) blockPatch.title        = p.title
      if ('subtitleHtml' in p) blockPatch.subtitleHtml = p.subtitleHtml
      if ('iconCount'    in p) blockPatch.iconCount    = p.iconCount
      if ('iconLabels'   in p) blockPatch.iconLabels   = p.iconLabels
      const updatedBlocks = Object.keys(blockPatch).length > 0
        ? d.blocks.map(b => b.id === d.activeBlockId ? { ...b, ...blockPatch } : b)
        : d.blocks
      return { ...d, ...p, blocks: updatedBlocks }
    })

  const [photoEditMode, setPhotoEditMode] = useState(false)
  const [isOverPhoto,   setIsOverPhoto]   = useState(false)

  const patchPhotoComp = useCallback((updater: (prev: PhotoComposition) => PhotoComposition) => {
    setDesign(d => {
      const key = d.activeCategory === 'gallery' ? 'gallery' : d.activeFormat
      const prev = d[key].photoComposition ?? DEFAULT_PHOTO_COMP
      return { ...d, [key]: { ...d[key], photoComposition: updater(prev) } }
    })
  }, [])

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

  const commitRenameProject = async (draft: string) => {
    const name = draft.trim() || projectName || 'Untitled Project'
    setIsRenamingProject(false)
    if (name !== projectName && projectId) {
      setProjectName(name)
      const supabase = createClient()
      await renameProject(supabase, projectId, name).catch(console.error)
    }
  }

  const canUndo = histIdxRef.current > 0
  const canRedo = histIdxRef.current < histRef.current.length - 1

  // Load presets on mount
  useEffect(() => {
    try { const raw = localStorage.getItem('dg:presets'); if (raw) setPresets(JSON.parse(raw)) } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync canvas bg default with theme — only when it's still a theme default (preserve custom colors)
  useEffect(() => {
    setCanvasBg(prev => {
      if (prev === CANVAS_BG_LIGHT || prev === CANVAS_BG_DARK) {
        return appSettings.theme === 'dark' ? CANVAS_BG_DARK : CANVAS_BG_LIGHT
      }
      return prev
    })
  }, [appSettings.theme]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore last session from localStorage — only in non-project mode
  useEffect(() => {
    if (projectId) return
    const restore = async () => {
      try {
        const raw = localStorage.getItem('dg:last')
        if (raw) {
          const saved = JSON.parse(raw)
          const state = migrateLoadedState(saved)
          state.blocks = await Promise.all(
            (state.blocks ?? []).map(async block => {
              const restoredAssets = await Promise.all(
                ((block.assets ?? []) as (UploadedAsset | undefined)[]).map(async a => {
                  if (!a?.id) return undefined
                  // External CDN URLs (Canto etc.) are saved as-is — use them directly
                  if (a.url && !a.url.startsWith('blob:')) return a
                  // Local uploads: restore from IDB
                  const blob = await getBlob(a.id).catch(() => undefined)
                  if (!blob) return undefined
                  return { ...a, url: URL.createObjectURL(blob) }
                })
              )
              return { ...block, assets: restoredAssets as UploadedAsset[] }
            })
          )
          setDesign(state)
          histRef.current = [state]
          histIdxRef.current = 0
          skipHistRef.current = true
        }
      } catch {}
    }
    restore()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load project from Supabase when projectId + user are available
  useEffect(() => {
    if (!projectId || !user) return
    setProjectLoading(true)
    const supabase = createClient()
    loadProject(supabase, projectId).then(async project => {
      if (!project) return
      setProjectName(project.name)
      const state = migrateLoadedState(project.state)
      // Restore local-upload blobs from IDB; external CDN URLs (Canto etc.) already saved
      const blocks = await Promise.all(
        state.blocks.map(async block => {
          const restoredAssets = await Promise.all(
            ((block.assets ?? []) as (UploadedAsset | undefined)[]).map(async a => {
              if (!a?.id) return undefined
              if (a.url && !a.url.startsWith('blob:')) return a
              const blob = await getBlob(a.id).catch(() => undefined)
              if (!blob) return undefined
              return { ...a, url: URL.createObjectURL(blob) }
            })
          )
          return { ...block, assets: restoredAssets as UploadedAsset[] }
        })
      )
      const loaded = { ...state, blocks }
      setDesign(loaded)
      histRef.current = [loaded]
      histIdxRef.current = 0
      skipHistRef.current = true
    }).catch(console.error).finally(() => setProjectLoading(false))
  }, [projectId, user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save last session (debounced) — blob: URLs stripped, external CDN URLs kept
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const wipeBlob = (a: UploadedAsset | undefined) =>
          a ? { ...a, url: a.url?.startsWith('blob:') ? '' : (a.url ?? '') } : a
        const stripped = {
          ...design,
          assets: design.assets.map(wipeBlob),
          blocks: design.blocks.map(b => ({
            ...b,
            assets: (b.assets ?? []).map(wipeBlob),
          })),
        }
        localStorage.setItem('dg:last', JSON.stringify(stripped))
      } catch {}
    }, 1000)
    return () => clearTimeout(t)
  }, [design])

  // Auto-save project to Supabase — debounce interval from app settings; 0 = off
  useEffect(() => {
    if (!projectId || !user) return
    if (!appSettings.autosaveInterval) return
    const supabase = createClient()
    const t = setTimeout(async () => {
      try {
        await saveProject(supabase, projectId, design)

        // Capture thumbnail once per session after first successful save
        if (!hasSavedThumbnailRef.current && canvasRef.current) {
          hasSavedThumbnailRef.current = true
          try {
            const { toBlob } = await import('html-to-image')
            const blob = await toBlob(canvasRef.current, { pixelRatio: 0.15, quality: 0.8 })
            if (blob) {
              const path = `${user.id}/${projectId}.jpg`
              await supabase.storage.from('project-thumbnails').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
              const { data } = supabase.storage.from('project-thumbnails').getPublicUrl(path)
              await saveProjectThumbnail(supabase, projectId, data.publicUrl)
            }
          } catch (thumbErr) {
            console.warn('Thumbnail capture failed (non-fatal):', thumbErr)
            // Reset so it can retry on next save
            hasSavedThumbnailRef.current = false
          }
        }
      } catch (err) {
        console.error('Supabase project save failed:', err)
      }
    }, appSettings.autosaveInterval)
    return () => clearTimeout(t)
  }, [design, projectId, user, appSettings.autosaveInterval]) // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast state to collaborators (debounced 400ms, skipped when applying remote update)
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (!projectId || !user || isApplyingRemoteRef.current) return
    clearTimeout(broadcastTimerRef.current)
    broadcastTimerRef.current = setTimeout(() => { broadcastState(design) }, 400)
    return () => clearTimeout(broadcastTimerRef.current)
  }, [design, projectId, user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Open share modal automatically when defaultOpenShare is set
  useEffect(() => {
    if (defaultOpenShare && projectId && !projectLoading) setShareModalOpen(true)
  }, [defaultOpenShare, projectId, projectLoading])

  async function saveAndShare() {
    if (!user) return
    setSaveToShareSaving(true)
    const supabase = createClient()
    const name = saveToShareName.trim() || 'Untitled Project'
    const id = await createProject(supabase, user.id, name, design)
    setSaveToShareSaving(false)
    if (id) {
      window.location.href = `/project/${id}?share=1`
    }
  }

  const savePreset = () => {
    const name = presetName.trim() || `Preset ${presets.length + 1}`
    // Clear ephemeral blob URLs; asset IDs act as IDB keys
    const next = [...presets, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      state: {
        ...design,
        assets: design.assets.map(a => a ? { ...a, url: '' } : a),
        blocks: design.blocks.map(b => ({ ...b, assets: (b.assets ?? []).map(a => a ? { ...a, url: '' } : a) })),
      },
      createdAt: Date.now(),
    }]
    setPresets(next)
    setPresetName('')
    try { localStorage.setItem('dg:presets', JSON.stringify(next)) } catch {}
  }

  const loadPreset = async (p: Preset) => {
    const base = migrateLoadedState(p.state)
    const restoredBlocks = await Promise.all(
      base.blocks.map(async block => {
        const restoredAssets = await Promise.all(
          ((block.assets ?? []) as (UploadedAsset | undefined)[]).map(async a => {
            if (!a?.id) return undefined
            const blob = await getBlob(a.id).catch(() => undefined)
            if (!blob) return undefined
            return { ...a, url: URL.createObjectURL(blob) }
          })
        )
        return { ...block, assets: restoredAssets as UploadedAsset[] }
      })
    )
    setDesign({ ...base, blocks: restoredBlocks })
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

  // Select a block — syncs its content into the top-level fields
  const selectBlock = (blockId: string, format?: Format) => {
    setDesign(d => {
      const block = d.blocks.find(b => b.id === blockId)
      if (!block) return d
      return {
        ...d,
        activeBlockId: blockId,
        activeTemplate: block.templateId,
        activeFormat: format ?? d.activeFormat,
        title: block.title,
        subtitleHtml: block.subtitleHtml,
        iconCount: block.iconCount as 2 | 3 | 4,
        iconLabels: block.iconLabels,
        desktop: { ...d.desktop, layoutFlipped: block.layoutFlipped },
        mobile: { ...d.mobile, layoutFlipped: block.layoutFlipped },
      }
    })
  }

  // Add a new block at the end
  const addBlock = () => {
    const id = `block-${Date.now()}`
    const newBlock: DesignBlock = {
      id,
      templateId: 'aplus-5050',
      title: '<p>New Block Title</p>',
      subtitleHtml: '<p>Add your product description here.</p>',
      iconCount: 3,
      iconLabels: ['Feature One', 'Feature Two', 'Feature Three', 'Feature Four'],
      layoutFlipped: false,
      assets: [],
    }
    setDesign(d => {
      const updated = { ...d, blocks: [...d.blocks, newBlock] }
      return {
        ...updated,
        activeBlockId: id,
        activeTemplate: newBlock.templateId,
        title: newBlock.title,
        subtitleHtml: newBlock.subtitleHtml,
        iconCount: newBlock.iconCount as 2 | 3 | 4,
        iconLabels: newBlock.iconLabels,
        desktop: { ...d.desktop, layoutFlipped: false },
        mobile: { ...d.mobile, layoutFlipped: false },
      }
    })
  }

  // Delete a block (at least one must remain)
  const deleteBlock = (blockId: string) => {
    setDesign(d => {
      if (d.blocks.length <= 1) return d
      const remaining = d.blocks.filter(b => b.id !== blockId)
      const nextBlock = d.activeBlockId === blockId
        ? remaining[0]
        : d.blocks.find(b => b.id === d.activeBlockId)!
      const sameNext = nextBlock.id === d.activeBlockId
      return {
        ...d,
        blocks: remaining,
        activeBlockId: nextBlock.id,
        ...(sameNext ? {} : {
          activeTemplate: nextBlock.templateId,
          title: nextBlock.title,
          subtitleHtml: nextBlock.subtitleHtml,
          iconCount: nextBlock.iconCount as 2 | 3 | 4,
          iconLabels: nextBlock.iconLabels,
          desktop: { ...d.desktop, layoutFlipped: nextBlock.layoutFlipped },
          mobile: { ...d.mobile, layoutFlipped: nextBlock.layoutFlipped },
        }),
      }
    })
  }

  // Change a block's template type
  const changeBlockTemplate = (blockId: string, templateId: TemplateId) => {
    setDesign(d => {
      const updatedBlocks = d.blocks.map(b => b.id === blockId ? { ...b, templateId } : b)
      const isActive = d.activeBlockId === blockId
      return {
        ...d,
        blocks: updatedBlocks,
        ...(isActive ? { activeTemplate: templateId } : {}),
      }
    })
  }

  // Update a block's slug (used in export filenames)
  const updateBlockSlug = (blockId: string, slug: string) => {
    setDesign(d => ({ ...d, blocks: d.blocks.map(b => b.id === blockId ? { ...b, slug } : b) }))
  }

  // Export every block (desktop + mobile) as a ZIP
  const exportAllBlocks = async (currentDesign: DesignState) => {
    setIsExportingAll(true)
    try {
      const prod = currentDesign.productName?.trim()
        ? toSlug(currentDesign.productName)
        : 'product'

      const entries: { el: HTMLElement; filename: string; format: 'png' }[] = []

      currentDesign.blocks.forEach((block, idx) => {
        const blockSlug = block.slug?.trim() ? toSlug(block.slug) : `block-${idx + 1}`
        for (const fmt of FORMATS) {
          const key = `${block.id}-${fmt}`
          const el  = allFrameRefs.current.get(key)
          if (!el) return
          entries.push({ el, filename: `${prod}-${blockSlug}-${fmt}`, format: 'png' })
        }
      })

      if (entries.length === 0) {
        alert('No frames found. Make sure the Design tab is visible.')
        return
      }

      const zipName = `${prod}-aplus`
      await exportAllAsZip(entries, zipName)
    } finally {
      setIsExportingAll(false)
    }
  }

  useEffect(() => {
    const compute = () => {
      if (!wrapperRef.current) return
      const w = wrapperRef.current.clientWidth - 48
      if (isGallery) {
        const h = wrapperRef.current.clientHeight - 96
        setScale(Math.min(w / (1500 * 2 + FRAME_GAP), h / 1500))
      } else {
        setScale(w / (1464 + 600 + FRAME_GAP))
      }
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [isGallery])


  const handleAddAsset = (asset: UploadedAsset, slotIndex?: number) => {
    fetch(asset.url).then(r => r.blob()).then(blob => storeBlob(asset.id, blob)).catch(console.error)
    setDesign(d => {
      const blockIdx = d.blocks.findIndex(b => b.id === d.activeBlockId)
      if (blockIdx === -1) return d
      const block = d.blocks[blockIdx]
      const prev = (block.assets ?? []) as (UploadedAsset | undefined)[]
      let next: (UploadedAsset | undefined)[]
      if (slotIndex === undefined) {
        next = [...prev, asset]
      } else {
        next = [...prev]
        if (next[slotIndex]) URL.revokeObjectURL(next[slotIndex]!.url)
        next[slotIndex] = asset
      }
      const blocks = [...d.blocks]
      blocks[blockIdx] = { ...block, assets: next as UploadedAsset[] }
      return { ...d, blocks }
    })
  }

  const handleRemoveAsset = (id: string) => {
    deleteBlob(id).catch(console.error)
    setDesign(d => {
      const blockIdx = d.blocks.findIndex(b => b.id === d.activeBlockId)
      if (blockIdx === -1) return d
      const block = d.blocks[blockIdx]
      const prev = (block.assets ?? []) as (UploadedAsset | undefined)[]
      const idx = prev.findIndex(a => a?.id === id)
      if (idx === -1) return d
      URL.revokeObjectURL(prev[idx]!.url)
      const next = [...prev]
      next[idx] = undefined
      const blocks = [...d.blocks]
      blocks[blockIdx] = { ...block, assets: next as UploadedAsset[] }
      return { ...d, blocks }
    })
  }

  // Current template display name
  const templateLabel = isGallery
    ? design.activeGalleryTemplate === 'gallery-icons' ? 'Gallery Icons' : 'Gallery Hero'
    : design.activeTemplate === 'aplus-5050' ? 'A+ 50/50 Split' : 'A+ Title + Icons'

  const categoryLabel = isGallery ? 'Amazon Gallery Images' : 'Amazon A+ Content'

  // ── Smart filename derivation ──────────────────────────────────────────────

  const activeBlockIdx = design.blocks.findIndex(b => b.id === design.activeBlockId)
  const activeBlock    = design.blocks[activeBlockIdx]

  // "product" is the fallback when no product name is set
  const productPart = design.productName?.trim() ? toSlug(design.productName) : 'product'

  const blockPart = activeBlock?.slug?.trim()
    ? toSlug(activeBlock.slug)
    : `block-${activeBlockIdx + 1}`

  const defaultBase = isGallery
    ? `${productPart}-${design.activeGalleryTemplate}`
    : `${productPart}-${blockPart}`

  const fileBase          = customBase ?? defaultBase
  const exportFilename    = isGallery ? fileBase : `${fileBase}-${fmt}`
  const altFmtLabel       = fmt === 'desktop' ? 'mobile' : 'desktop'
  const exportAltFilename = `${fileBase}-${altFmtLabel}`

  // Reset manual override whenever the auto-generated base changes
  useEffect(() => { setCustomBase(null) }, [defaultBase]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const computePhotoScreenRect = (): { left: number; top: number; width: number; height: number } | null => {
    if (!frameContainerRef.current) return null
    const wRect = frameContainerRef.current.getBoundingClientRect()
    const W = wRect.width
    const H = wRect.height
    if (isGallery) {
      const proportion = design.activeGalleryTemplate === 'gallery-icons' ? 0.55 : 0.58
      return { left: wRect.left, top: wRect.top, width: W, height: H * proportion }
    }
    // aplus-icons: photo RIGHT by default (not flipped), LEFT when flipped
    // aplus-5050: photo LEFT by default (not flipped), RIGHT when flipped
    const isIconsTpl = design.activeTemplate === 'aplus-icons'
    const photoOnLeft = isIconsTpl ? settings.layoutFlipped : !settings.layoutFlipped
    const photoLeft = photoOnLeft ? wRect.left : wRect.left + W * 0.5
    return { left: photoLeft, top: wRect.top, width: W * 0.5, height: H }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!photoEditMode) { if (isOverPhoto) setIsOverPhoto(false); return }
    const r = computePhotoScreenRect()
    if (!r) return
    const over = e.clientX >= r.left && e.clientX <= r.left + r.width && e.clientY >= r.top && e.clientY <= r.top + r.height
    if (over !== isOverPhoto) setIsOverPhoto(over)
  }

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!photoEditMode) return
    const r = computePhotoScreenRect()
    if (!r) return
    if (e.clientX < r.left || e.clientX > r.left + r.width || e.clientY < r.top || e.clientY > r.top + r.height) return
    e.preventDefault()
    const photoW = r.width
    const photoH = r.height
    const onMove = (me: MouseEvent) => {
      const dx = me.movementX / photoW
      const dy = me.movementY / photoH
      patchPhotoComp(p => ({
        ...p,
        x: Math.max(-1, Math.min(1, p.x + dx)),
        y: Math.max(-1, Math.min(1, p.y + dy)),
      }))
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.body.style.cursor = 'grabbing'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [photoEditMode, patchPhotoComp]) // eslint-disable-line react-hooks/exhaustive-deps

  // Project page: show gate when auth is loading or user is not signed in
  if (projectId && authLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <svg className="animate-spin h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (projectId && !authLoading && !user) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
        <header className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-3 shadow-sm">
          <a href="/dashboard" className="flex items-center gap-1.5 h-7 pl-2 pr-3 rounded-lg border border-gray-200 dark:border-gray-600 text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-900 dark:hover:text-white transition-all shrink-0">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Projects
          </a>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Sign in to view this project.</p>
            <button
              onClick={() => setAuthModalOpen(true)}
              className="h-9 px-5 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-sm font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
            >
              Sign in
            </button>
          </div>
        </div>
        <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── App header ── */}
      <header className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-3 z-20 shadow-sm">
        {projectId ? (
          <>
            <a
              href="/dashboard"
              className="flex items-center gap-1.5 h-7 pl-2 pr-3 rounded-lg border border-gray-200 dark:border-gray-600 text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shrink-0"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Projects
            </a>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0" />
            {isRenamingProject ? (
              <input
                ref={projectNameInputRef}
                type="text"
                value={projectNameDraft}
                onChange={e => setProjectNameDraft(e.target.value)}
                onBlur={() => commitRenameProject(projectNameDraft)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRenameProject(projectNameDraft) }
                  if (e.key === 'Escape') { e.preventDefault(); setIsRenamingProject(false) }
                }}
                spellCheck={false}
                autoFocus
                className="text-sm font-semibold text-gray-900 dark:text-gray-100 bg-transparent border-b-2 border-gray-400 dark:border-gray-500 outline-none px-0.5 min-w-0 shrink"
                style={{ width: `${Math.max((projectNameDraft || '').length, 6)}ch` }}
              />
            ) : (
              <span
                onDoubleClick={() => { setProjectNameDraft(projectName); setIsRenamingProject(true) }}
                title="Double-click to rename"
                className="text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white cursor-default select-none truncate max-w-xs shrink flex items-center gap-2"
              >
                {projectLoading
                  ? <svg className="animate-spin h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  : null}
                {projectName || 'Untitled Project'}
              </span>
            )}
          </>
        ) : (
          <>
            <div className="w-7 h-7 rounded-lg bg-gray-900 dark:bg-gray-700 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 dark:text-white text-base tracking-tight shrink-0">Design Generator</span>
          </>
        )}

        {/* Mode tabs */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 shrink-0">
          {(['design', 'bulk'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setAppMode(mode)}
              className={`h-6 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
                appMode === mode
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {mode === 'design' ? 'Design' : 'Bulk'}
            </button>
          ))}
        </div>

        {/* Bulk mode — Export ZIP button in header */}
        {appMode === 'bulk' && (
          <div className="ml-auto relative">
            <Btn variant="primary" onClick={() => setBulkExportOpen(o => !o)}>
              Export
              <svg className={`w-3 h-3 transition-transform duration-150 ${bulkExportOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </Btn>
            {bulkExportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBulkExportOpen(false)} />
                <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 p-3 z-50 animate-slide-down">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums mb-3 px-1">
                    {bulkCanExport ? 'Generation complete' : 'Run bulk generation first'}
                  </p>
                  <button
                    onClick={() => { bulkExportFnRef.current(); setBulkExportOpen(false) }}
                    disabled={!bulkCanExport}
                    className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-gray-900 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    Download ZIP
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {appMode === 'design' && (
          <>
            <span className="text-gray-200 dark:text-gray-700 select-none shrink-0">|</span>
            {/* Category dropdown */}
        <div className="relative">
          <button
            onClick={() => setCategoryDropdownOpen(o => !o)}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
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
              <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 z-50 animate-slide-down">
                {(['aplus', 'gallery'] as Category[]).map(id => {
                  const label = id === 'aplus' ? 'Amazon A+ Content' : 'Amazon Gallery Images'
                  const sub   = id === 'aplus' ? 'Rich banners below the fold' : 'Main product carousel · 1500×1500'
                  return (
                    <button
                      key={id}
                      onClick={() => { setDesign(d => ({ ...d, activeCategory: id })); setCategoryDropdownOpen(false) }}
                      className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${design.activeCategory === id ? 'bg-gray-50 dark:bg-gray-800' : ''}`}
                    >
                      <div>
                        <p className={`text-xs font-semibold ${design.activeCategory === id ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>{label}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
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
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <UndoIcon />
            </button>
            <button onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <RedoIcon />
            </button>

            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1.5" />

            {/* Auth button / user menu */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(o => !o)}
                  title={user.email ?? 'Account'}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-white text-[10px] font-bold">
                    {(user.email ?? '?')[0].toUpperCase()}
                  </div>
                </button>
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute top-full right-0 mt-2 w-52 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 p-2 z-50 animate-slide-down">
                      <div className="px-3 py-2 mb-1">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{user.user_metadata?.full_name ?? user.email}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{user.email}</p>
                      </div>
                      <div className="h-px bg-gray-100 dark:bg-gray-700 mb-1" />
                      <button
                        onClick={() => { setUserMenuOpen(false); signOut() }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-red-500 rounded-lg transition-colors"
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Btn variant="secondary" size="sm" onClick={() => setAuthModalOpen(true)}>
                Sign in
              </Btn>
            )}

            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1.5" />

            {/* Presence avatars */}
            {peers.length > 0 && (
              <div className="flex items-center gap-1 mr-1">
                {peers.slice(0, 4).map(p => (
                  <div
                    key={p.userId}
                    title={p.email}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold ring-2 ring-white dark:ring-gray-900"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.email[0]?.toUpperCase() ?? '?'}
                  </div>
                ))}
                {peers.length > 4 && (
                  <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-[8px] font-bold text-gray-700 dark:text-gray-200 ring-2 ring-white dark:ring-gray-900">
                    +{peers.length - 4}
                  </div>
                )}
              </div>
            )}

            {/* Share button */}
            {projectId && user ? (
              <button
                onClick={() => setShareModalOpen(true)}
                title="Share project"
                className="h-7 px-3 flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
            ) : !projectId ? (
              <button
                onClick={() => { setSaveToShareName(design.productName || ''); setSaveToShareOpen(true) }}
                title="Share project"
                className="h-7 px-3 flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
            ) : null}

            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

            {/* Preview — only for A+ content mode */}
            {!isGallery && (
              <button
                onClick={() => setPreviewOpen(true)}
                title="Preview all blocks"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            )}

            {/* Settings menu */}
            <div className="relative">
              <button
                onClick={() => setSettingsMenuOpen(o => !o)}
                title="Settings"
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${settingsMenuOpen ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              {settingsMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSettingsMenuOpen(false)} />
                  <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 p-4 z-50 animate-slide-down">

                    {/* Appearance */}
                    <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Appearance</p>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Theme</span>
                      <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                        {(['light', 'dark'] as const).map(t => (
                          <button key={t} onClick={() => updateAppSettings({ theme: t })}
                            className={`h-6 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${appSettings.theme === t ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                            {t === 'light' ? 'Light' : 'Dark'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Density</span>
                      <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                        {(['comfortable', 'compact'] as const).map(d => (
                          <button key={d} onClick={() => updateAppSettings({ uiDensity: d })}
                            className={`h-6 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${appSettings.uiDensity === d ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                            {d === 'comfortable' ? 'Cozy' : 'Compact'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-px bg-gray-100 dark:bg-gray-800 mb-4" />

                    {/* Canvas background */}
                    <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Preview background</p>
                    <div className="flex items-center gap-2 mb-1">
                      {(appSettings.theme === 'dark'
                        ? ['#1a1a1a', '#111827', '#E0E0E0', '#FFFFFF'] as const
                        : ['#FFFFFF', '#F0F0F0', '#E0E0E0', '#1a1a1a'] as const
                      ).map(color => (
                        <button key={color} onClick={() => setCanvasBg(color)} title={color}
                          className={`w-8 h-8 rounded-lg ring-2 transition-all ${canvasBg === color ? 'ring-gray-900 dark:ring-white ring-offset-1 dark:ring-offset-gray-900' : 'ring-gray-200 dark:ring-gray-600 hover:ring-gray-400'}`}
                          style={{ backgroundColor: color }} />
                      ))}
                      <label title="Custom color" className="relative w-8 h-8 flex items-center justify-center rounded-lg ring-2 ring-gray-200 dark:ring-gray-600 hover:ring-gray-400 transition-all cursor-pointer overflow-hidden shrink-0">
                        <div className="w-full h-full rounded-lg" style={{ background: 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }} />
                        <input type="color" value={canvasBg} onChange={e => setCanvasBg(e.target.value)}
                          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }} />
                      </label>
                    </div>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-1 mb-4">Current: <span className="font-mono">{canvasBg}</span></p>

                    <div className="h-px bg-gray-100 dark:bg-gray-800 mb-4" />

                    {/* Export defaults */}
                    <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Export defaults</p>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Format</span>
                      <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                        {(['png', 'jpeg'] as const).map(f => (
                          <button key={f} onClick={() => updateAppSettings({ exportFormat: f })}
                            className={`h-6 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${appSettings.exportFormat === f ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                            {f.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    {appSettings.exportFormat === 'jpeg' && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">JPEG quality</span>
                          <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{appSettings.exportQuality}%</span>
                        </div>
                        <input type="range" min={60} max={100} step={5}
                          value={appSettings.exportQuality}
                          onChange={e => updateAppSettings({ exportQuality: Number(e.target.value) })}
                          className="w-full h-1 rounded-full appearance-none cursor-pointer accent-gray-800" />
                      </div>
                    )}

                    <div className="h-px bg-gray-100 dark:bg-gray-800 mb-4" />

                    {/* Auto-save */}
                    <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Auto-save interval</p>
                    <div className="flex gap-1">
                      {([0, 1000, 2000, 5000] as const).map(ms => (
                        <button key={ms} onClick={() => updateAppSettings({ autosaveInterval: ms })}
                          className={`flex-1 h-7 rounded-lg text-[10px] font-bold border-2 transition-all ${appSettings.autosaveInterval === ms ? 'border-gray-900 dark:border-gray-500 bg-gray-900 dark:bg-gray-700 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                          {ms === 0 ? 'Off' : `${ms / 1000}s`}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1.5" />

            {/* Export dropdown */}
            <div className="relative">
              <Btn variant="primary" onClick={() => setExportMenuOpen(o => !o)}>
                Export
                <svg className={`w-3 h-3 transition-transform duration-150 ${exportMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </Btn>

              {exportMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                  <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 p-3 z-50 animate-slide-down">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums mb-3 px-1">
                      {template.width} × {template.height} px
                      <span className="mx-1 text-gray-300">·</span>
                      {templateLabel}
                      {!isGallery && <span className="text-gray-300"> · {fmt === 'desktop' ? 'Desktop' : 'Mobile'}</span>}
                    </p>
                    {/* Editable filename */}
                    <div className="mb-3">
                      <label className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider block mb-1 px-0.5">Filename</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={fileBase}
                          onChange={e => setCustomBase(e.target.value || null)}
                          spellCheck={false}
                          className="flex-1 min-w-0 px-2.5 h-8 text-[11px] font-mono text-gray-700 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:bg-white transition-all"
                        />
                        {customBase && (
                          <button
                            onClick={() => setCustomBase(null)}
                            title="Reset to default"
                            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      {!isGallery && (
                        <p className="text-[9px] text-gray-400 mt-1 px-0.5">
                          Saves as <span className="font-mono">{exportFilename}.png</span>
                        </p>
                      )}
                    </div>
                    <ExportButton
                      canvasRef={canvasRef}
                      filename={exportFilename}
                      altCanvasRef={isGallery ? undefined : altCanvasRef}
                      altFilename={isGallery ? undefined : exportAltFilename}
                    />

                    {/* Export All Blocks — only shown in A+ mode */}
                    {!isGallery && (
                      <>
                        <div className="my-3 h-px bg-gray-100 dark:bg-gray-800" />
                        <div>
                          <p className="text-[9px] text-gray-400 mb-2 px-0.5">
                            {design.blocks.length} block{design.blocks.length !== 1 ? 's' : ''} · {design.blocks.length * 2} files
                          </p>
                          <button
                            onClick={() => { setExportMenuOpen(false); exportAllBlocks(design) }}
                            disabled={isExportingAll}
                            className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-gray-900 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isExportingAll ? (
                              <>
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                Exporting…
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                </svg>
                                Export All Blocks
                              </>
                            )}
                          </button>
                        </div>
                      </>
                    )}
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
        <BulkMode designState={design} exportFnRef={bulkExportFnRef} onCanExportChange={setBulkCanExport} folderConfig={folderConfig} onFolderConfigChange={updateFolderConfig} />
      ) : (<>
      <div className="flex flex-1 min-h-0">

        {/* ══ Sidebar ══ */}
        <aside className="dg-sidebar w-72 shrink-0 flex flex-col border-r border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm z-10">

          {/* Template bar — pinned */}
          <div className="shrink-0 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 truncate">
                {templateLabel}
                {!isGallery && (
                  <span className="font-normal text-gray-400 dark:text-gray-500"> · {fmt === 'desktop' ? 'Desktop' : 'Mobile'}</span>
                )}
              </span>
            </div>
            <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 ml-3.5">Click a frame to select</p>
          </div>

          {/* Scrollable settings sections */}
          <div className="flex-1 min-h-0 overflow-y-auto">

            {/* Product — sets the constant prefix for all export filenames */}
            <Section title="Product" icon={<ProductIcon />}>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                    Product name
                  </label>
                  <input
                    type="text"
                    value={design.productName}
                    onChange={e => setDesign(d => ({ ...d, productName: e.target.value }))}
                    placeholder="e.g. CCV Filter D3932C"
                    spellCheck={false}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/20 dark:focus:ring-gray-500/30 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
                  />
                </div>
                {design.productName.trim() && (
                  <p className="text-[10px] text-gray-400 px-0.5">
                    Files: <span className="font-mono text-gray-600">{toSlug(design.productName)}-block-1-desktop.png</span>
                  </p>
                )}
                {!design.productName.trim() && (
                  <p className="text-[10px] text-gray-400 px-0.5">
                    Set a product name — it becomes the prefix for all exported filenames.
                  </p>
                )}
              </div>
            </Section>

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
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/20 dark:focus:ring-gray-500/30 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all min-w-0"
                  />
                  <button
                    onClick={savePreset}
                    className="shrink-0 px-3 h-[38px] text-[11px] font-bold uppercase tracking-widest rounded-lg bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
                  >
                    Save
                  </button>
                </div>
                {presets.length === 0 ? (
                  <p className="text-[11px] text-gray-300 dark:text-gray-600 text-center py-1">No saved presets yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...presets].reverse().map(p => (
                      <div key={p.id} className="flex items-center gap-1.5 group">
                        <button
                          onClick={() => loadPreset(p)}
                          className="flex-1 text-left px-3 py-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-lg transition-colors truncate font-medium"
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

            {/* Content */}
            <Section title="Content" icon={<EditIcon />}>
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
                            const bIdx = d.blocks.findIndex(b => b.id === d.activeBlockId)
                            if (bIdx === -1) return { ...d, iconLabels: next }
                            const bl = d.blocks[bIdx]
                            const nextAssets = [...(bl.assets ?? [])] as (UploadedAsset | undefined)[]
                            ;[nextAssets[3 + from], nextAssets[3 + i]] = [nextAssets[3 + i], nextAssets[3 + from]]
                            const blocks = [...d.blocks]
                            blocks[bIdx] = { ...bl, iconLabels: next, assets: nextAssets as UploadedAsset[] }
                            return { ...d, blocks }
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
                          className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/20 dark:focus:ring-gray-500/30 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* Images — local upload + Canto library + photo composition */}
            <Section title="Images" icon={<ImagesIcon />}>
              <div className="space-y-4">

                {/* Local upload */}
                <AssetUploader
                  assets={activeBlock?.assets ?? []}
                  onAdd={handleAddAsset}
                  onRemove={handleRemoveAsset}
                  slotLabels={assetSlotLabels}
                />

                {/* Canto library pickers */}
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Canto Library</p>
                  {/* Product Photo */}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1.5">Product Photo</p>
                    {(() => {
                      const asset = activeBlock?.assets[0]
                      return asset ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                          </div>
                          <button
                            onClick={() => setPhotoPickerOpen(true)}
                            className="flex-1 text-left text-[10px] text-gray-500 hover:text-gray-700 truncate"
                            title={asset.name}
                          >
                            {asset.name}
                          </button>
                          <button
                            onClick={() => handleRemoveAsset(asset.id)}
                            className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                            title="Remove photo"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPhotoPickerOpen(true)}
                          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-[10px] text-gray-400 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                        >
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Pick from library
                        </button>
                      )
                    })()}
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1.5">Background Texture</p>
                    <CantoAssetPicker
                      albumId={folderConfig.texturesAlbumId}
                      value={activeBlock?.assets[1] ? { id: activeBlock.assets[1].id, name: activeBlock.assets[1].name, previewUrl: activeBlock.assets[1].url } : null}
                      onChange={pick => {
                        if (pick) handleAddAsset({ id: pick.id, name: pick.name, url: pick.previewUrl, type: 'image' }, 1)
                        else if (activeBlock?.assets[1]) handleRemoveAsset(activeBlock.assets[1].id)
                      }}
                      placeholder="Pick texture from Canto"
                      thumbnailFit="cover"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1.5">Brand Logo</p>
                    <CantoAssetPicker
                      albumId={folderConfig.logosAlbumId}
                      value={activeBlock?.assets[2] ? { id: activeBlock.assets[2].id, name: activeBlock.assets[2].name, previewUrl: activeBlock.assets[2].url } : null}
                      onChange={pick => {
                        if (pick) handleAddAsset({ id: pick.id, name: pick.name, url: pick.previewUrl, type: 'image' }, 2)
                        else if (activeBlock?.assets[2]) handleRemoveAsset(activeBlock.assets[2].id)
                      }}
                      placeholder="Pick logo from Canto"
                      thumbnailFit="contain"
                    />
                  </div>
                  {/* Icon images — only for icon templates */}
                  {((!isGallery && design.activeTemplate === 'aplus-icons') || (isGallery && design.activeGalleryTemplate === 'gallery-icons')) && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1.5">Icons</p>
                      <div className="space-y-1.5">
                        {Array.from({ length: design.iconCount }, (_, i) => {
                          const slot = 3 + i
                          const asset = activeBlock?.assets[slot]
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-[9px] font-semibold text-gray-400 w-10 shrink-0">Icon {i + 1}</span>
                              <div className="flex-1 flex items-center gap-1.5">
                                {asset ? (
                                  <>
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center overflow-hidden shrink-0">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={asset.url} alt={asset.name} className="max-w-full max-h-full object-contain p-0.5" />
                                    </div>
                                    <button
                                      onClick={() => setIconPickerSlot(slot)}
                                      className="flex-1 text-left text-[10px] text-gray-500 hover:text-gray-700 truncate"
                                      title={asset.name}
                                    >
                                      {asset.name}
                                    </button>
                                    <button
                                      onClick={() => handleRemoveAsset(asset.id)}
                                      className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                                      title="Remove icon"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => setIconPickerSlot(slot)}
                                    disabled={!folderConfig.iconsAlbumId}
                                    className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-[10px] text-gray-400 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
                  {(!folderConfig.texturesAlbumId && !folderConfig.logosAlbumId && !folderConfig.iconsAlbumId) && (
                    <p className="text-[10px] text-gray-400 text-center py-1">
                      Configure folders in Bulk Mode → Image Library ⚙
                    </p>
                  )}
                </div>

                {/* Photo composition */}
                <div className="space-y-2.5">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Photo Composition</p>
                  <button
                    onClick={() => setPhotoEditMode(m => !m)}
                    className={`w-full h-9 flex items-center justify-center gap-2 rounded-xl border-2 text-[11px] font-bold uppercase tracking-widest transition-all ${
                      photoEditMode
                        ? 'border-gray-900 dark:border-gray-500 bg-gray-900 dark:bg-gray-700 text-white'
                        : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <MoveIcon />
                    {photoEditMode ? 'Drag enabled · click photo' : 'Drag to reposition'}
                  </button>
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 pt-2.5 pb-3 space-y-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">Scale</span>
                        <span className="text-xs text-gray-400 tabular-nums font-mono">
                          {((settings.photoComposition ?? DEFAULT_PHOTO_COMP).scale).toFixed(2)}×
                        </span>
                      </div>
                      <input type="range" min={1} max={4} step={0.01}
                        value={(settings.photoComposition ?? DEFAULT_PHOTO_COMP).scale}
                        onChange={e => patchPhotoComp(p => ({ ...p, scale: Number(e.target.value) }))}
                        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-gray-800" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {([['x', 'Pan X'], ['y', 'Pan Y']] as const).map(([axis, label]) => (
                        <div key={axis}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500">{label}</span>
                            <span className="text-xs text-gray-400 tabular-nums font-mono">
                              {Math.round((settings.photoComposition ?? DEFAULT_PHOTO_COMP)[axis] * 100)}%
                            </span>
                          </div>
                          <input type="range" min={-100} max={100} step={1}
                            value={Math.round((settings.photoComposition ?? DEFAULT_PHOTO_COMP)[axis] * 100)}
                            onChange={e => patchPhotoComp(p => ({ ...p, [axis]: Number(e.target.value) / 100 }))}
                            className="w-full h-1 rounded-full appearance-none cursor-pointer accent-gray-800" />
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">Rotation</span>
                        <span className="text-xs text-gray-400 tabular-nums font-mono">
                          {(settings.photoComposition ?? DEFAULT_PHOTO_COMP).rotation}°
                        </span>
                      </div>
                      <input type="range" min={-180} max={180} step={1}
                        value={(settings.photoComposition ?? DEFAULT_PHOTO_COMP).rotation}
                        onChange={e => patchPhotoComp(p => ({ ...p, rotation: Number(e.target.value) }))}
                        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-gray-800" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => patchPhotoComp(p => ({ ...p, flipH: !p.flipH }))}
                      className={`flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
                        (settings.photoComposition ?? DEFAULT_PHOTO_COMP).flipH
                          ? 'border-gray-900 dark:border-gray-500 bg-gray-900 dark:bg-gray-700 text-white'
                          : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <FlipHIcon /> Flip H
                    </button>
                    <button
                      onClick={() => patchPhotoComp(() => DEFAULT_PHOTO_COMP)}
                      className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-[10px] font-semibold text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 transition-all"
                    >
                      <ResetIcon /> Reset
                    </button>
                  </div>
                </div>

              </div>
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
                              ? 'border-gray-900 dark:border-gray-500 bg-gray-900 dark:bg-gray-700 text-white'
                              : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-500'
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
                            ? 'border-gray-900 dark:border-gray-500 bg-gray-900 dark:bg-gray-700 text-white'
                            : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-500'
                        }`}
                      >
                        {c === 'tl' ? '↖' : c === 'tr' ? '↗' : c === 'bl' ? '↙' : '↘'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 pt-2.5 pb-3 space-y-2.5">
                  <Slider label="Logo size" value={settings.logoSize} unit="px" min={20} max={200} step={4}
                    onChange={v => patchSettings({ logoSize: v })} />
                  <Slider label="Logo padding" value={settings.logoPadding} unit="px" min={4} max={100} step={4}
                    onChange={v => patchSettings({ logoPadding: v })} />
                </div>
              </div>
            </Section>

            {/* Icons — count, size, label styling; only for icon templates */}
            {((!isGallery && design.activeTemplate === 'aplus-icons') || (isGallery && design.activeGalleryTemplate === 'gallery-icons')) && (
              <Section title="Icons" icon={<CantoSidebarIcon />}>
                <div className="space-y-3">
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 pt-2.5 pb-3 space-y-2.5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Count</p>
                      <div className="flex gap-1">
                        {([2, 3, 4] as const).map(n => (
                          <button
                            key={n}
                            onClick={() => patchDesign({ iconCount: n })}
                            className={`flex-1 h-7 rounded-md text-xs font-bold border-2 transition-all ${
                              design.iconCount === n
                                ? 'border-gray-900 dark:border-gray-500 bg-gray-900 dark:bg-gray-700 text-white'
                                : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
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
                </div>
              </Section>
            )}

            {/* Typography */}
            <Section title="Typography" icon={<TypoIcon />}>
              <div className="space-y-3">

                {/* Title card */}
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 pt-2.5 pb-3 space-y-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Title</p>
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
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 pt-2.5 pb-3 space-y-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Description</p>
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

              </div>
            </Section>

            {/* Spacing */}
            <Section title="Spacing" icon={<SpacingIcon />}>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 pt-2.5 pb-3 space-y-2.5">
                <Slider label="Padding H" value={settings.contentPaddingX} unit="px" min={8} max={120} step={4}
                  onChange={v => patchSettings({ contentPaddingX: v })} />
                <Slider label="Padding V" value={settings.contentPaddingV} unit="px" min={8} max={120} step={4}
                  onChange={v => patchSettings({ contentPaddingV: v })} />
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
                <ColorRow
                  label="Icon tint"
                  value={design.iconColor ?? '#ffffff'}
                  onChange={v => patchDesign({ iconColor: v })}
                />
              </div>
            </Section>

          </div>

        </aside>

        {/* ══ Canvas area ══ */}
        <main
          ref={wrapperRef}
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ backgroundColor: canvasBg }}
        >
          <div className="px-6 py-6 space-y-10">
            {isGallery ? (
              /* ── Gallery mode: one row of two gallery frames ── */
              <div>
                {/* Section label */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Gallery Images</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>
                {/* Frames row */}
                <div className="flex items-start" style={{ gap: FRAME_GAP }}>
                  {GALLERY_TEMPLATE_IDS.map(tplId => {
                    const tpl = getGalleryTemplate(tplId as GalleryTemplateId)
                    const isSelected = design.activeGalleryTemplate === tplId
                    const scaledW = tpl.width * scale
                    const scaledH = tpl.height * scale
                    const tplSettings = design.gallery
                    return (
                      <div key={tplId} className="flex flex-col items-center gap-1.5">
                        {/* Frame label */}
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] font-semibold ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}>
                            {tplId === 'gallery-hero' ? 'Gallery Hero' : 'Gallery Icons'} · 1500×1500
                          </span>
                        </div>
                        {/* Outer clip div — selected frame gets frameContainerRef + mouse events */}
                        <div
                          ref={el => {
                            if (isSelected) (frameContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
                          }}
                          onClick={() => setDesign(d => ({ ...d, activeGalleryTemplate: tplId as GalleryTemplateId }))}
                          onMouseDown={isSelected ? handleCanvasMouseDown : undefined}
                          onMouseMove={isSelected ? handleCanvasMouseMove : undefined}
                          onMouseLeave={isSelected ? () => setIsOverPhoto(false) : undefined}
                          style={{
                            width: scaledW,
                            height: scaledH,
                            position: 'relative',
                            overflow: 'hidden',
                            borderRadius: 10,
                            flexShrink: 0,
                            outline: isSelected ? '2px solid #3B82F6' : '2px solid transparent',
                            outlineOffset: 2,
                            boxShadow: isSelected
                              ? '0 0 0 4px rgba(59,130,246,0.15), 0 4px 24px rgba(0,0,0,0.18)'
                              : '0 2px 12px rgba(0,0,0,0.10)',
                            cursor: isSelected && photoEditMode && isOverPhoto ? 'grab' : 'pointer',
                          }}
                        >
                          {/* Inner full-res div, scaled down */}
                          <div
                            style={{
                              width: tpl.width,
                              height: tpl.height,
                              transform: `scale(${scale})`,
                              transformOrigin: 'top left',
                              position: 'absolute',
                              top: 0,
                              left: 0,
                            }}
                          >
                            <div
                              ref={el => {
                                if (isSelected) (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = el
                              }}
                              className="design-canvas"
                              style={{ width: tpl.width, height: tpl.height, position: 'relative' }}
                            >
                              {tplId === 'gallery-icons'
                                ? <CanvasContentGalleryIcons design={{ ...design, activeGalleryTemplate: tplId }} settings={tplSettings} />
                                : <CanvasContentGallery design={{ ...design, activeGalleryTemplate: tplId }} settings={tplSettings} />
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* ── A+ mode: one row per block, desktop + mobile side by side ── */
              <>
                {design.blocks.map((block, blockIdx) => {
                  return (
                    <div key={block.id}>
                      {/* Block row header */}
                      <div className="flex items-center gap-2 mb-3">
                        {/* Editable block label / slug */}
                        <div className="flex items-center gap-1 shrink-0 group">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-300 select-none">#</span>
                          <input
                            type="text"
                            value={block.slug ?? ''}
                            onChange={e => { e.stopPropagation(); updateBlockSlug(block.id, e.target.value) }}
                            onClick={e => e.stopPropagation()}
                            placeholder={`block-${blockIdx + 1}`}
                            spellCheck={false}
                            title="Block label — used in export filename"
                            className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 bg-transparent border-b border-transparent group-hover:border-gray-200 dark:group-hover:border-gray-600 focus:border-gray-400 dark:focus:border-gray-500 focus:outline-none w-28 placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                          />
                        </div>
                        {/* Template switcher */}
                        <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
                          {(['aplus-5050', 'aplus-icons'] as TemplateId[]).map(tid => (
                            <button
                              key={tid}
                              onClick={e => { e.stopPropagation(); changeBlockTemplate(block.id, tid) }}
                              className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                                block.templateId === tid
                                  ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white'
                                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                              }`}
                            >
                              {tid === 'aplus-5050' ? '50/50' : 'Icons'}
                            </button>
                          ))}
                        </div>
                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                        {design.blocks.length > 1 && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteBlock(block.id) }}
                            title="Remove block"
                            className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors rounded"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Frames row: desktop + mobile */}
                      <div className="flex items-start" style={{ gap: FRAME_GAP }}>
                        {FORMATS.map(frameFmt => {
                          const tpl = getTemplate(block.templateId, frameFmt)
                          const isSelected = design.activeBlockId === block.id && design.activeFormat === frameFmt
                          const isAlt = design.activeBlockId === block.id && frameFmt !== design.activeFormat
                          const scaledW = tpl.width * scale
                          const scaledH = tpl.height * scale
                          // Build render design: merge block content + global settings
                          const renderDesign: DesignState = {
                            ...design,
                            assets: block.assets ?? [],
                            activeTemplate: block.templateId,
                            activeFormat: frameFmt,
                            title: block.title,
                            subtitleHtml: block.subtitleHtml,
                            iconCount: block.iconCount as 2 | 3 | 4,
                            iconLabels: block.iconLabels,
                            desktop: { ...design.desktop, layoutFlipped: block.layoutFlipped },
                            mobile: { ...design.mobile, layoutFlipped: block.layoutFlipped },
                          }
                          const renderSettings = frameFmt === 'desktop' ? renderDesign.desktop : renderDesign.mobile
                          return (
                            <div key={frameFmt} className="flex flex-col items-center gap-1.5">
                              {/* Frame label */}
                              <div className="flex items-center gap-1">
                                {frameFmt === 'desktop'
                                  ? <DesktopIcon className={`w-3 h-3 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`} />
                                  : <MobileIcon  className={`w-3 h-3 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`} />
                                }
                                <span className={`text-[10px] font-semibold ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}>
                                  {frameFmt === 'desktop' ? 'Desktop · 1464×600' : 'Mobile · 600×450'}
                                </span>
                              </div>
                              {/* Outer clip div */}
                              {(() => {
                                const activePeer = peers.find(p => p.activeBlockId === block.id)
                                return activePeer ? (
                                  <div
                                    className="flex items-center gap-1 mb-0.5"
                                    style={{ height: 14 }}
                                  >
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activePeer.color }} />
                                    <span className="text-[9px] font-medium truncate" style={{ color: activePeer.color }}>
                                      {activePeer.email}
                                    </span>
                                  </div>
                                ) : <div style={{ height: 14 }} />
                              })()}
                              <div
                                ref={el => {
                                  if (isSelected) (frameContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
                                }}
                                onClick={() => selectBlock(block.id, frameFmt)}
                                onMouseDown={isSelected ? handleCanvasMouseDown : undefined}
                                onMouseMove={isSelected ? handleCanvasMouseMove : undefined}
                                onMouseLeave={isSelected ? () => setIsOverPhoto(false) : undefined}
                                style={(() => {
                                  const peer = peers.find(p => p.activeBlockId === block.id)
                                  return {
                                    width: scaledW,
                                    height: scaledH,
                                    position: 'relative',
                                    overflow: 'hidden',
                                    borderRadius: 8,
                                    flexShrink: 0,
                                    outline: isSelected
                                      ? '2px solid #3B82F6'
                                      : peer ? `2px solid ${peer.color}` : '2px solid transparent',
                                    outlineOffset: 2,
                                    boxShadow: isSelected
                                      ? '0 0 0 4px rgba(59,130,246,0.15), 0 4px 24px rgba(0,0,0,0.18)'
                                      : peer
                                        ? `0 0 0 4px ${peer.color}22, 0 2px 12px rgba(0,0,0,0.10)`
                                        : '0 2px 12px rgba(0,0,0,0.10)',
                                    cursor: isSelected && photoEditMode && isOverPhoto ? 'grab' : 'pointer',
                                  }
                                })()}
                              >
                                {/* Inner full-res div */}
                                <div style={{
                                  width: tpl.width,
                                  height: tpl.height,
                                  transform: `scale(${scale})`,
                                  transformOrigin: 'top left',
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                }}>
                                  <div
                                    ref={el => {
                                      // Register in global map for Export All Blocks
                                      allFrameRefs.current.set(`${block.id}-${frameFmt}`, el)
                                      if (isSelected) (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = el
                                      if (isAlt)     (altCanvasRef as React.MutableRefObject<HTMLDivElement | null>).current = el
                                    }}
                                    className="design-canvas"
                                    style={{ width: tpl.width, height: tpl.height, position: 'relative' }}
                                  >
                                    {block.templateId === 'aplus-icons'
                                      ? <CanvasContentIcons design={renderDesign} settings={renderSettings} />
                                      : <CanvasContent      design={renderDesign} settings={renderSettings} />
                                    }
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {/* Add block button */}
                <button
                  onClick={addBlock}
                  className="flex items-center justify-center gap-2 w-full py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 rounded-lg transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Block
                </button>
              </>
            )}
          </div>
        </main>
      </div>
      </>)}

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} design={design} />

      {/* Share modal */}
      {shareModalOpen && projectId && user && (
        <ShareModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          projectId={projectId}
          userId={user.id}
        />
      )}

      {/* Save-to-share prompt */}
      {saveToShareOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setSaveToShareOpen(false)} />
          <div className="fixed z-50 w-full max-w-sm top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl p-5 animate-scale-in">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Save project to share</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Give your project a name first — you can always rename it later.</p>
            <input
              type="text"
              autoFocus
              value={saveToShareName}
              onChange={e => setSaveToShareName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveAndShare(); if (e.key === 'Escape') setSaveToShareOpen(false) }}
              placeholder="Project name"
              className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setSaveToShareOpen(false)} className="h-8 px-3 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={saveAndShare}
                disabled={saveToShareSaving}
                className="h-8 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saveToShareSaving && (
                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                Save & Share
              </button>
            </div>
          </div>
        </>
      )}
      <CantoIconPickerModal
        albumId={folderConfig.iconsAlbumId}
        open={iconPickerSlot !== null}
        onClose={() => setIconPickerSlot(null)}
        slotLabel={iconPickerSlot !== null ? `Icon ${iconPickerSlot - 2}` : undefined}
        onSelect={pick => {
          if (iconPickerSlot !== null)
            handleAddAsset({ id: pick.id, name: pick.name, url: pick.previewUrl, type: 'image' }, iconPickerSlot)
        }}
      />
      <CantoPhotoPickerModal
        open={photoPickerOpen}
        onClose={() => setPhotoPickerOpen(false)}
        initialQuery={design.productName}
        onSelect={pick => handleAddAsset({ id: pick.id, name: pick.name, url: pick.previewUrl, type: 'image' }, 0)}
      />
    </div>
  )
}

// ─── Button component ─────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'ghost'
type BtnSize = 'sm' | 'md'

function Btn({ variant = 'primary', size = 'md', className = '', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-bold uppercase tracking-widest rounded-lg transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed'
  const sizes: Record<BtnSize, string> = {
    sm: 'h-7 px-3 text-[10px]',
    md: 'h-8 px-4 text-[11px]',
  }
  const variants: Record<BtnVariant, string> = {
    primary:   'bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600',
    secondary: 'border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 bg-white dark:bg-transparent hover:border-gray-400 hover:text-gray-900 dark:hover:border-gray-400 dark:hover:text-gray-200',
    ghost:     'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200',
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({ title, icon, defaultOpen = false, children }: { title: string; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group">
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors">{icon}</span>}
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors">{title}</span>
        </div>
        <svg className={`w-3 h-3 text-gray-300 dark:text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {/* grid-rows transition gives smooth open/close without JS height measurement */}
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 200ms ease' }}>
        <div style={{ overflow: 'hidden' }}>
          <div className="px-4 pb-4 pt-1">{children}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Slider row ───────────────────────────────────────────────────────────────

function Slider({ label, value, unit, min, max, step, onChange }: { label: string; value: number; unit: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums font-mono">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full h-1 rounded-full appearance-none cursor-pointer accent-gray-800 dark:accent-gray-400" />
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
          className={`flex-1 py-1.5 text-xs rounded-md border font-mono font-semibold transition-all ${value === t.value ? 'border-gray-900 dark:border-gray-500 bg-gray-900 dark:bg-gray-700 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
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
      <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 ring-2 ring-gray-200 dark:ring-gray-600 group-hover:ring-gray-400 dark:group-hover:ring-gray-500 transition-all">
        <div className="w-full h-full" style={{ backgroundColor: value }} />
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-none mb-0.5">{label}</p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono uppercase">{value}</p>
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

function CantoSidebarIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm0 0l5.5 9L14 8l3 4" />
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

function ProductIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
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

function PhotoCompIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function MoveIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 9l-3 3m0 0l3 3M2 12h20M15 9l3 3m0 0l-3 3" />
    </svg>
  )
}

function FlipHIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 12h8M8 17h8M4 7v10M20 7v10" />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
