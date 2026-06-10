'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { toPng, toJpeg } from 'html-to-image'
import { BulkProduct, ParseResult, downloadTemplate, parseCSV } from '@/lib/csv'
import { DesignState, UploadedAsset } from '@/types'
import { CanvasContent, CanvasContentIcons, CanvasContentGallery, CanvasContentGalleryIcons } from './CanvasRenderers'
import { CantoPick } from './CantoAssetPicker'
import TexturePicker from './TexturePicker'
import { CantoAlbum, FolderConfig, EMPTY_CONFIG, autoMatchFolders } from '@/lib/canto-folders'

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'
type JobStatus = 'pending' | 'rendering' | 'done' | 'error'
type SlotTemplate = '5050-right' | '5050-left' | 'icons'

interface SlotConfig { template: SlotTemplate }

interface BulkPreset {
  id: string; name: string; aplusSlots: number
  includeGallery: boolean; outputFormat: 'png' | 'jpeg'
  slotConfigs: SlotConfig[]; createdAt: number
}

interface JobProduct extends BulkProduct {
  status: JobStatus; renderingSlot?: string; doneCount?: number
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

function defaultSlotConfigs(count: number): SlotConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    template: i === 1 ? 'icons' : (i % 2 === 0 ? '5050-right' : '5050-left'),
  }))
}

const PRESETS_KEY = 'bulk-presets'
function loadPresets(): BulkPreset[] {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]') } catch { return [] }
}
function savePresetsToStorage(p: BulkPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(p))
}

function slotName(i: number) { return String.fromCharCode(97 + i) + '1' }

const TEMPLATE_LABELS: Record<SlotTemplate, string> = {
  '5050-right': 'Img | Txt', '5050-left': 'Txt | Img', 'icons': 'Icons',
}

const DEFAULT_LOGO_ID    = 'gjj53olkh15rd0vdvpq29ngf75'
const DEFAULT_LOGO_NAME  = 'DocsDiesel-Logo-Wordmark-RedWhite-Vector 1'
const DEFAULT_LOGO_ALBUM = 'QH34D'

function toUploadedAsset(pick: CantoPick | undefined, preferOriginal = false): UploadedAsset | undefined {
  if (!pick) return undefined
  return {
    id: pick.id,
    name: pick.name,
    url: (preferOriginal ? pick.originalUrl : undefined) ?? pick.previewUrl ?? pick.originalUrl ?? '',
    type: 'image',
  }
}

function normalizeAssetText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function assetTerms(asset: CantoPick): string[] {
  return [
    normalizeAssetText(asset.name),
    ...(asset.keywords ?? []).map(normalizeAssetText),
  ].filter(Boolean)
}

function matchesNamedAsset(asset: CantoPick, requestedName: string): boolean {
  const requested = normalizeAssetText(requestedName)
  if (!requested) return false
  return assetTerms(asset).some(term =>
    term === requested ||
    term.includes(requested) ||
    requested.includes(term)
  )
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Returns the "base name" of a photo by stripping the file extension and any
// trailing _web / -web suffix, lower-cased. Used for dedup and individual-shot detection.
function photoBaseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')   // strip extension
    .replace(/[_-]web$/, '')   // strip _web or -web resolution suffix
}

// When both DGF429-01.jpg and DGF429-01_web.jpg are in the candidate pool,
// keep only the full-resolution version. This prevents the same shot appearing
// twice with different IDs, which caused the slot wrap-around to pick "duplicates".
function dedupeWebVariants(assets: CantoPick[]): CantoPick[] {
  const byBase = new Map<string, { asset: CantoPick; isWeb: boolean }>()
  for (const asset of assets) {
    const base  = photoBaseName(asset.name)
    const isWeb = /[_-]web$/i.test(asset.name.replace(/\.[^.]+$/, ''))
    const existing = byBase.get(base)
    if (!existing || (existing.isWeb && !isWeb)) {
      byBase.set(base, { asset, isWeb })
    }
  }
  return Array.from(byBase.values()).map(v => v.asset)
}

function scoreProductPhoto(asset: CantoPick, sku: string, productName: string): number {
  const terms = assetTerms(asset)
  const joined = terms.join(' ')
  const skuNorm = normalizeAssetText(sku).replace(/\s+/g, '')

  let score = 0
  if (skuNorm) {
    for (const term of terms) {
      const compact = term.replace(/\s+/g, '')
      if (compact === skuNorm) score += 120
      else if (compact.includes(skuNorm)) score += 80
    }
  }

  const STOP = new Set(['diesel', 'filter', 'engine', 'premium', 'high', 'flow', 'with', 'from', 'and', 'for', 'the'])
  const words = normalizeAssetText(productName)
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w))

  for (const word of words) {
    if (joined.split(/\s+/).includes(word)) score += 8
    else if (joined.includes(word)) score += 4
  }

  // Bonus: individual product shot (e.g. DGF429-01, DGF429-02).
  // Pattern: base name is exactly "{sku}-{1-3 digit sequence number}".
  if (skuNorm) {
    const base = photoBaseName(asset.name).replace(/\s+/g, '')
    if (new RegExp(`^${escapeRegex(skuNorm)}[_-]?\\d{1,3}$`).test(base)) score += 50
  }

  // Penalty: group / kit photo — the filename contains other SKU-like codes
  // (alphanumeric, ≥3 chars, mix of letters+digits) besides the target SKU.
  // Example: "D11878-5W40-4.jpg" for a DGF429 product → penalised.
  const stem     = asset.name.replace(/\.[^.]+$/, '')
  const segments = stem.split(/-+/).filter(s => s.length >= 2)
  const skuLow   = sku.toLowerCase()
  const otherSkuLike = segments.filter(s => {
    const sl = s.toLowerCase()
    return /[a-z]/i.test(s) && /[0-9]/.test(s) && s.length >= 3
      && !skuLow.includes(sl) && !sl.includes(skuLow)
      && !/^\d+$/.test(s)
  })
  if (otherSkuLike.length >= 1) score -= 60

  return score
}

function rankedProductPhotos(assets: CantoPick[], sku: string, productName: string, limit: number): CantoPick[] {
  return assets
    .map(asset => ({ asset, score: scoreProductPhoto(asset, sku, productName) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.name.localeCompare(b.asset.name))
    .slice(0, limit)
    .map(item => item.asset)
}

function dedupePicks(picks: CantoPick[]): CantoPick[] {
  const seen = new Set<string>()
  const out: CantoPick[] = []
  for (const pick of picks) {
    const key = pick.id || pick.name
    if (seen.has(key)) continue
    seen.add(key)
    out.push(pick)
  }
  return out
}

// ─── Capture helper ──────────────────────────────────────────────────────────
// Renders a React element into a fresh off-screen container, waits for every
// <img> to finish loading, then returns a PNG/JPEG data-URL (or null on error).
// Using a fresh createRoot per capture avoids ALL shared-state/stale-DOM issues.
// IMPORTANT: html-to-image copies getComputedStyle to its clone, so if the captured
// element has position:fixed;top:-99999px the clone renders off-screen inside the SVG
// foreignObject → blank white output. Fix: capture an inner div (position:relative, no
// offset) while the outer wrapper handles the off-screen hiding.

async function captureToDataUrl(
  element: React.ReactElement,
  width: number,
  height: number,
  format: 'png' | 'jpeg',
): Promise<string | null> {
  // Outer wrapper is off-screen via position:fixed — but it is NOT captured by html-to-image
  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:fixed;top:-${height + 100}px;left:0;pointer-events:none;`
  document.body.appendChild(wrapper)

  // Inner div is the actual capture target: position:relative keeps it at (0,0) in the
  // SVG foreignObject that html-to-image creates, so content renders correctly
  const div = document.createElement('div')
  div.style.cssText = `width:${width}px;height:${height}px;overflow:hidden;position:relative;`
  wrapper.appendChild(div)

  const root = createRoot(div)
  flushSync(() => root.render(element))

  const imgs = Array.from(div.querySelectorAll('img'))
  await Promise.all(imgs.map(img =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() })
  ))

  try {
    // includeQueryParams:true is critical — the proxy URL is /api/canto/proxy?url=<actual-url>.
    // Without it, html-to-image strips query params and treats every proxy request as the same
    // cache key, causing the first image (texture) to be reused for logo, photos, and icons.
    const opts = { includeQueryParams: true, onImageErrorHandler: () => {} }
    return format === 'jpeg'
      ? await toJpeg(div, { quality: 0.95, backgroundColor: '#ffffff', ...opts })
      : await toPng(div, opts)
  } catch { return null }
  finally {
    root.unmount()
    document.body.removeChild(wrapper)
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface BulkModeProps {
  designState: DesignState
  exportFnRef: React.MutableRefObject<() => void>
  onCanExportChange: (can: boolean) => void
  folderConfig: FolderConfig
  onFolderConfigChange: (patch: Partial<FolderConfig>) => void
}

export default function BulkMode({ designState, exportFnRef, onCanExportChange, folderConfig, onFolderConfigChange }: BulkModeProps) {
  // CSV
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [csvFilename, setCsvFilename] = useState('')
  const [isDragging, setIsDragging]   = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Canto connection
  const [cantoStatus, setCantoStatus] = useState<ConnectionStatus>('connecting')
  const [cantoError, setCantoError]   = useState('')

  // Canto folder config (configured in Settings ⚙; used read-only here)
  const [albums, setAlbums]           = useState<CantoAlbum[]>([])
  const folderConfigRef = useRef<FolderConfig>(EMPTY_CONFIG)

  // Branding — unified UploadedAsset state (mirrors Design mode TexturePicker)
  const [logoAsset,    setLogoAsset]    = useState<UploadedAsset | null>(null)
  const [textureAsset, setTextureAsset] = useState<UploadedAsset | null>(null)

  // Settings
  const [aplusSlots, setAplusSlots]         = useState(5)
  const [includeGallery, setIncludeGallery] = useState(true)
  const [outputFormat, setOutputFormat]     = useState<'png' | 'jpeg'>('png')
  const [slotConfigs, setSlotConfigs]       = useState<SlotConfig[]>(defaultSlotConfigs(5))

  // Presets
  const [presets, setPresets]       = useState<BulkPreset[]>([])
  const [presetName, setPresetName] = useState('')

  // Run
  const [jobs, setJobs]           = useState<JobProduct[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [doneJobs, setDoneJobs]   = useState(0)
  const [totalJobs, setTotalJobs] = useState(0)
  const cancelRef         = useRef(false)
  const capturedRef       = useRef<Map<string, string>>(new Map())
  const jobsSnapshot      = useRef<JobProduct[]>([])
  const iconCacheRef      = useRef<CantoPick[] | null>(null)
  const productFolderCacheRef = useRef<CantoPick[] | null>(null)
  const productPhotoCache = useRef<Map<string, CantoPick[]>>(new Map())
  const photoCache        = useRef<Map<string, string | null>>(new Map())

  // Keep folderConfigRef in sync
  folderConfigRef.current = folderConfig

  // ── Init ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    setPresets(loadPresets())

    fetch('/api/canto/status')
      .then(r => r.json())
      .then(d => {
        if (d.connected) {
          setCantoStatus('connected')
          loadAlbumsAndConfig()
        } else {
          setCantoStatus('error')
          setCantoError(d.error ?? 'Connection failed')
        }
      })
      .catch(() => { setCantoStatus('error'); setCantoError('Could not reach server') })

    // Auto-load default DocsDiesel logo — same as Design mode mount backfill
    fetch(`/api/canto/folder?albumId=${DEFAULT_LOGO_ALBUM}`)
      .then(r => r.json())
      .then((items: Array<{ id: string; name: string; previewUrl: string }>) => {
        const logo = items.find(i => i.id === DEFAULT_LOGO_ID)
          ?? items.find(i => i.name === DEFAULT_LOGO_NAME)
        if (logo) setLogoAsset({ id: logo.id, name: logo.name, url: logo.previewUrl, type: 'image' })
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAlbumsAndConfig = async () => {
    try {
      const data = await fetch('/api/canto/albums').then(r => r.json())
      if (!Array.isArray(data)) return
      setAlbums(data)
      iconCacheRef.current = null
      productFolderCacheRef.current = null
      productPhotoCache.current.clear()

      const current = folderConfigRef.current
      const hasAnySaved = current.iconsAlbumId || current.texturesAlbumId || current.logosAlbumId || current.photosAlbumId
      if (!hasAnySaved) {
        const matched = { ...EMPTY_CONFIG, ...autoMatchFolders(data) }
        onFolderConfigChange(matched)
      }
    } catch { /* non-critical */ }
  }

  // Keep slot configs in sync with slot count
  useEffect(() => {
    setSlotConfigs(prev => {
      const next = defaultSlotConfigs(aplusSlots)
      return next.map((d, i) => prev[i] ?? d)
    })
  }, [aplusSlots])

  // ── CSV ───────────────────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) return
    setCsvFilename(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const result = parseCSV(e.target?.result as string)
      setParseResult(result)
      setJobs(result.products.map(p => ({ ...p, status: 'pending' })))
      setDoneJobs(0); setTotalJobs(0)
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])

  const handleClear = () => {
    setParseResult(null); setCsvFilename(''); setJobs([])
    setDoneJobs(0); setTotalJobs(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Folder config ─────────────────────────────────────────────────────────────

  const updateFolderConfig = (patch: Partial<FolderConfig>) => {
    onFolderConfigChange(patch)
    iconCacheRef.current = null
    productFolderCacheRef.current = null
    productPhotoCache.current.clear()
  }

  // ── Presets ───────────────────────────────────────────────────────────────────

  const handleSavePreset = () => {
    if (!presetName.trim()) return
    const p: BulkPreset = {
      id: Date.now().toString(), name: presetName.trim(),
      aplusSlots, includeGallery, outputFormat, slotConfigs: [...slotConfigs], createdAt: Date.now(),
    }
    const next = [p, ...presets]
    setPresets(next); savePresetsToStorage(next); setPresetName('')
  }

  const handleLoadPreset = (p: BulkPreset) => {
    setAplusSlots(p.aplusSlots); setIncludeGallery(p.includeGallery)
    setOutputFormat(p.outputFormat); setSlotConfigs(p.slotConfigs)
  }

  const handleDeletePreset = (id: string) => {
    const next = presets.filter(p => p.id !== id)
    setPresets(next); savePresetsToStorage(next)
  }

  const setSlotTemplate = (i: number, t: SlotTemplate) => {
    setSlotConfigs(prev => prev.map((c, idx) => idx === i ? { ...c, template: t } : c))
  }

  // ── Photo / icon fetch ────────────────────────────────────────────────────────

  const fetchPhoto = async (name: string): Promise<string | null> => {
    if (photoCache.current.has(name)) return photoCache.current.get(name)!
    try {
      const res = await fetch(`/api/canto/photo?name=${encodeURIComponent(name)}`)
      const d   = await res.json()
      const url = d.proxyUrl ?? null
      photoCache.current.set(name, url)
      return url
    } catch {
      photoCache.current.set(name, null); return null
    }
  }

  const getIconFolder = async (): Promise<CantoPick[]> => {
    const albumId = folderConfigRef.current.iconsAlbumId
    if (!albumId) return []
    if (iconCacheRef.current !== null) return iconCacheRef.current
    try {
      const data = await fetch(`/api/canto/folder?albumId=${encodeURIComponent(albumId)}&limit=1000`).then(r => r.json())
      iconCacheRef.current = Array.isArray(data) ? data : []
    } catch {
      iconCacheRef.current = []
    }
    return iconCacheRef.current
  }

  const getProductPhotoFolder = async (): Promise<CantoPick[]> => {
    const albumId = folderConfigRef.current.photosAlbumId
    if (!albumId) return []
    if (productFolderCacheRef.current !== null) return productFolderCacheRef.current
    try {
      const data = await fetch(`/api/canto/folder?albumId=${encodeURIComponent(albumId)}&limit=1000`).then(r => r.json())
      productFolderCacheRef.current = Array.isArray(data) ? data : []
    } catch {
      productFolderCacheRef.current = []
    }
    return productFolderCacheRef.current
  }

  const fetchProductPhotos = async (sku: string, productName: string, need: number, requestedNames: string[] = []): Promise<CantoPick[]> => {
    const cacheKey = `${folderConfigRef.current.photosAlbumId ?? 'search'}:${sku || productName}:${requestedNames.join('|')}`
    if (productPhotoCache.current.has(cacheKey)) return productPhotoCache.current.get(cacheKey)!
    try {
      const folderPhotos = await getProductPhotoFolder()
      const requestedMatches = requestedNames
        .filter(Boolean)
        .flatMap(name => folderPhotos.filter(photo => matchesNamedAsset(photo, name)))
      const folderMatches = rankedProductPhotos(folderPhotos, sku, productName, Math.max(need * 3, 25))

      const params = new URLSearchParams({ sku, name: productName, limit: String(Math.max(need * 3, 25)) })
      const data = await fetch(`/api/canto/photos?${params}`).then(r => r.json())
      const searchPhotos: CantoPick[] = Array.isArray(data) ? data : []
      const photos = dedupeWebVariants(dedupePicks([...requestedMatches, ...folderMatches, ...searchPhotos]))
      productPhotoCache.current.set(cacheKey, photos)
      return photos
    } catch {
      productPhotoCache.current.set(cacheKey, [])
      return []
    }
  }

  const matchIcon = (icons: CantoPick[], callout: string, excludeIds: string[] = []): CantoPick | undefined => {
    if (!callout || icons.length === 0) return undefined

    const STOP = new Set([
      'the','and','for','from','with','that','this','will','are','was','not',
      'but','its','our','per','into','your','against','before','after','more',
      'their','each','both','also','than','then','when','which','while','about',
    ])

    const calloutWords = callout.toLowerCase()
      .split(/[\s\-_,./()]+/)
      .filter(w => w.length > 2 && !STOP.has(w))

    let best: CantoPick | undefined
    let bestScore = 0

    for (const icon of icons) {
      if (excludeIds.indexOf(icon.id) !== -1) continue
      const nameStem = icon.name.toLowerCase()
        .replace(/\.[^.]+$/, '')
        .replace(/^(dd-|li_)/, '')
        .split(/[\s\-_]+/)
        .filter(p => p.length > 1)

      const kwTerms = (icon.keywords ?? []).flatMap(k => {
        const lower = k.toLowerCase().trim()
        const parts = lower.split(/[\-_]+/).filter(p => p.length > 2)
        return parts.length > 1 ? [lower, ...parts] : [lower]
      })
      const allTerms = [...kwTerms, ...nameStem]

      let score = 0
      for (const word of calloutWords) {
        for (const term of allTerms) {
          if (term === word)                          score += 4
          else if (kwTerms.includes(term) && term.startsWith(word) && word.length > 3) score += 3
          else if (term.includes(word) && word.length > 3) score += 2
          else if (word.includes(term) && term.length > 3) score += 1
        }
      }

      if (score > bestScore) { bestScore = score; best = icon }
    }

    return bestScore > 0 ? best : undefined
  }

  // ── Download ZIP ──────────────────────────────────────────────────────────────

  const handleDownloadZip = useCallback(async () => {
    if (capturedRef.current.size === 0) return
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const ext = outputFormat === 'jpeg' ? 'jpg' : 'png'
    capturedRef.current.forEach((dataUrl, key) => {
      const [sku, label] = key.split('/')
      zip.folder(sku)!.file(`${label}.${ext}`, dataUrl.split(',')[1], { base64: true })
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'bulk-export.zip'
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }, [outputFormat])

  // ── Run ───────────────────────────────────────────────────────────────────────

  const handleRun = async () => {
    if (!canRun) return
    cancelRef.current = false
    capturedRef.current.clear()

    const snapshot = jobsSnapshot.current
    // Each A+ slot generates desktop + mobile; gallery slots generate one image each
    const imagesPerProduct = aplusSlots * 2 + (includeGallery ? aplusSlots : 0)
    setTotalJobs(snapshot.length * imagesPerProduct)
    setDoneJobs(0); setIsRunning(true)
    setJobs(p => p.map(r => ({ ...r, status: 'pending', doneCount: 0, renderingSlot: undefined })))

    const iconFolder = await getIconFolder()
    let done = 0

    // Active A+ block in Design tab — used as fallback for photo and icon assets
    const activeAplusBlock = designState.blocks.find(b => b.id === designState.activeBlockId)
    const assetBlocks = [
      ...(designState.blocks ?? []),
      ...(designState.galleryBlocks ?? []),
    ]

    const fallbackAsset = (slotIndex: number, preferredTemplate?: string): UploadedAsset | undefined => {
      const ordered = [
        ...(preferredTemplate ? assetBlocks.filter(b => b.templateId === preferredTemplate) : []),
        ...(activeAplusBlock ? [activeAplusBlock] : []),
        ...assetBlocks,
      ]
      const seen = new Set<string>()
      for (const block of ordered) {
        if (seen.has(block.id)) continue
        seen.add(block.id)
        const asset = (block.assets ?? [])[slotIndex]
        if (asset?.url) return asset
      }
      return undefined
    }

    const pickUnusedIcon = (excludeIds: string[]): UploadedAsset | undefined => {
      const pick = iconFolder.find(icon => excludeIds.indexOf(icon.id) === -1) ?? iconFolder[0]
      if (!pick) return undefined
      excludeIds.push(pick.id)
      return toUploadedAsset(pick, true)
    }

    for (let i = 0; i < snapshot.length; i++) {
      if (cancelRef.current) break
      const job = snapshot[i]

      setJobs(p => p.map((r, idx) => idx === i ? { ...r, status: 'rendering' } : r))

      const productPhotos = await fetchProductPhotos(job.sku, job.productName, aplusSlots + (includeGallery ? aplusSlots : 0), job.photos)
      const usedPhotoIds: string[] = []

      // ── Pre-resolve assets for each slot ────────────────────────────────────
      type SlotAssets = {
        photoAsset: UploadedAsset | undefined
        textureAsset: UploadedAsset | undefined
        logoAsset: UploadedAsset | undefined
        iconAssets: (UploadedAsset | undefined)[]
      }
      const slotData: SlotAssets[] = []

      for (let j = 0; j < aplusSlots; j++) {
        const slot = job.slots[j]
        const cfg = slotConfigs[j] ?? { template: '5050-right' }
        const templateForSlot = cfg.template === 'icons' ? 'aplus-icons' : 'aplus-5050'
        let photoAsset: UploadedAsset | undefined = undefined

        const csvPhotoName = job.photos[j % Math.max(job.photos.length, 1)]
        if (csvPhotoName) {
          const matchedInPool = productPhotos.find(p => matchesNamedAsset(p, csvPhotoName))
          if (matchedInPool) {
            photoAsset = toUploadedAsset(matchedInPool)
          } else {
            const photoUrl = await fetchPhoto(csvPhotoName)
            if (photoUrl) photoAsset = { id: `photo-${job.sku}-${j}`, name: csvPhotoName, url: photoUrl, type: 'image' }
          }
        }
        if (!photoAsset && productPhotos.length > 0) {
          const pick = productPhotos.find(p => usedPhotoIds.indexOf(p.id) === -1) ?? productPhotos[j % productPhotos.length]
          if (pick) { usedPhotoIds.push(pick.id); photoAsset = toUploadedAsset(pick) }
        }
        if (!photoAsset) photoAsset = fallbackAsset(0, templateForSlot)

        const usedIconIds: string[] = []
        const iconAssets = (slot?.iconCallouts ?? ['', '', '', '']).map((callout, ci) => {
          const match = matchIcon(iconFolder, callout, usedIconIds)
          if (match) usedIconIds.push(match.id)
          return toUploadedAsset(match, true)
            ?? fallbackAsset(3 + ci, 'aplus-icons')
            ?? fallbackAsset(3 + ci, 'gallery-icons')
            ?? pickUnusedIcon(usedIconIds)
        })

        slotData.push({
          photoAsset,
          textureAsset: textureAsset ?? fallbackAsset(1, templateForSlot) ?? fallbackAsset(1),
          logoAsset: logoAsset ?? fallbackAsset(2, templateForSlot) ?? fallbackAsset(2),
          iconAssets,
        })
      }

      // ── A+ slots: desktop + mobile ───────────────────────────────────────────
      for (let j = 0; j < aplusSlots; j++) {
        if (cancelRef.current) break
        const { photoAsset, textureAsset: resolvedTextureAsset, logoAsset: resolvedLogoAsset, iconAssets } = slotData[j]
        const slot = job.slots[j]
        const cfg  = slotConfigs[j] ?? { template: '5050-right' }
        const label = slotName(j)
        const layoutFlipped = cfg.template === '5050-left'
        const aplusTemplate = cfg.template === 'icons' ? 'aplus-icons' : 'aplus-5050'

        const baseSlotDesign: DesignState = {
          ...designState,
          assets: [photoAsset, resolvedTextureAsset, resolvedLogoAsset, iconAssets[0], iconAssets[1], iconAssets[2], iconAssets[3]] as UploadedAsset[],
          title: `<p>${slot?.title ?? ''}</p>`,
          subtitleHtml: slot?.desc ? `<p>${slot.desc}</p>` : '',
          iconLabels: (slot?.iconCallouts ?? ['', '', '', '']) as [string, string, string, string],
          activeTemplate: aplusTemplate,
        }

        // Desktop
        setJobs(p => p.map((r, idx) => idx === i ? { ...r, renderingSlot: `${label}-desktop`, doneCount: j * 2 } : r))
        if (!cancelRef.current) {
          const desktopEl = cfg.template === 'icons'
            ? <CanvasContentIcons design={{ ...baseSlotDesign, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped }} />
            : <CanvasContent      design={{ ...baseSlotDesign, activeFormat: 'desktop' }} settings={{ ...designState.desktop, layoutFlipped }} />
          const dataUrl = await captureToDataUrl(desktopEl, 1464, 600, outputFormat)
          if (dataUrl) capturedRef.current.set(`${job.sku}/${label}-desktop`, dataUrl)
        }
        done++; setDoneJobs(done)

        if (cancelRef.current) break

        // Mobile
        setJobs(p => p.map((r, idx) => idx === i ? { ...r, renderingSlot: `${label}-mobile`, doneCount: j * 2 + 1 } : r))
        if (!cancelRef.current) {
          const mobileEl = cfg.template === 'icons'
            ? <CanvasContentIcons design={{ ...baseSlotDesign, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped }} />
            : <CanvasContent      design={{ ...baseSlotDesign, activeFormat: 'mobile' }} settings={{ ...designState.mobile, layoutFlipped }} />
          const dataUrl = await captureToDataUrl(mobileEl, 600, 450, outputFormat)
          if (dataUrl) capturedRef.current.set(`${job.sku}/${label}-mobile`, dataUrl)
        }
        done++; setDoneJobs(done)
      }

      // ── Gallery slots ────────────────────────────────────────────────────────
      if (includeGallery && !cancelRef.current) {
        for (let j = 0; j < aplusSlots; j++) {
          if (cancelRef.current) break
          const { photoAsset, textureAsset: resolvedTextureAsset, logoAsset: resolvedLogoAsset, iconAssets } = slotData[j]
          const slot = job.slots[j]
          const cfg  = slotConfigs[j] ?? { template: '5050-right' }
          const galleryLabel = `gallery-${j + 1}`

          const gallerySlotDesign: DesignState = {
            ...designState,
            assets: [photoAsset, resolvedTextureAsset, resolvedLogoAsset, iconAssets[0], iconAssets[1], iconAssets[2], iconAssets[3]] as UploadedAsset[],
            title: `<p>${slot?.title ?? ''}</p>`,
            subtitleHtml: slot?.desc ? `<p>${slot.desc}</p>` : '',
            iconLabels: (slot?.iconCallouts ?? ['', '', '', '']) as [string, string, string, string],
          }

          setJobs(p => p.map((r, idx) => idx === i ? { ...r, renderingSlot: galleryLabel } : r))
          if (!cancelRef.current) {
            const galleryEl = cfg.template === 'icons'
              ? <CanvasContentGalleryIcons design={gallerySlotDesign} settings={{ ...designState.gallery, layoutFlipped: false }} />
              : <CanvasContentGallery      design={gallerySlotDesign} settings={{ ...designState.gallery, layoutFlipped: false }} />
            const dataUrl = await captureToDataUrl(galleryEl, 1500, 1500, outputFormat)
            if (dataUrl) capturedRef.current.set(`${job.sku}/${galleryLabel}`, dataUrl)
          }
          done++; setDoneJobs(done)
        }
      }

      setJobs(p => p.map((r, idx) =>
        idx === i
          ? { ...r, status: cancelRef.current ? 'error' : 'done', doneCount: imagesPerProduct, renderingSlot: undefined }
          : r
      ))
    }

    setIsRunning(false)
  }

  const handleCancel = () => { cancelRef.current = true }

  const handleReset = () => {
    capturedRef.current.clear()
    setJobs(p => p.map(r => ({ ...r, status: 'pending', doneCount: 0, renderingSlot: undefined })))
    setDoneJobs(0); setTotalJobs(0)
  }

  // ── Expose export to header ───────────────────────────────────────────────────

  useEffect(() => { exportFnRef.current = handleDownloadZip })
  useEffect(() => { onCanExportChange(allDone) }, [jobs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────────────

  jobsSnapshot.current = jobs

  const products         = parseResult?.products ?? []
  const hasProducts      = jobs.length > 0
  const canRun           = hasProducts && cantoStatus === 'connected' && !isRunning
  const allDone          = hasProducts && jobs.every(p => p.status === 'done')
  const progressPct      = totalJobs > 0 ? Math.round((doneJobs / totalJobs) * 100) : 0
  const imagesPerProduct = aplusSlots * 2 + (includeGallery ? aplusSlots : 0)
  const fileErrors       = parseResult?.errors ?? []
  const productWarnings  = products.filter(p => p.warnings.length > 0).length

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0 bg-gray-50 dark:bg-gray-950">

      {/* ══ Left config panel ══ */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm z-10">
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* DATA SOURCE */}
          <Section label="Data Source" icon={<CsvSectionIcon />} defaultOpen>
            {!hasProducts ? (
              <div className="space-y-2">
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                    isDragging ? 'border-gray-400 bg-gray-50 dark:bg-gray-800' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50/50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                  <CsvIcon />
                  <div className="text-center">
                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">Drop CSV or click to browse</p>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">File → Download → CSV in Google Sheets</p>
                  </div>
                </div>
                {fileErrors.length > 0 && (
                  <div className="p-2 rounded-lg bg-red-50 border border-red-100">
                    {fileErrors.map((e, i) => <p key={i} className="text-[10px] text-red-600">{e}</p>)}
                  </div>
                )}
                <button onClick={downloadTemplate}
                  className="w-full h-7 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-[10px] font-bold uppercase tracking-widest hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                  <DownloadIcon className="w-3 h-3" /> Download Template
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 truncate">{csvFilename}</p>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 pl-3">
                      {products.length} products
                      {productWarnings > 0 && <span className="ml-1.5 text-amber-600">· {productWarnings} warnings</span>}
                    </p>
                  </div>
                  <button onClick={handleClear} className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2">Remove</button>
                </div>
                <button onClick={downloadTemplate}
                  className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  <DownloadIcon className="w-3 h-3" /> Download template
                </button>
              </div>
            )}
          </Section>

          {/* IMAGE LIBRARY (Canto) */}
          <Section label="Image Library" icon={<CantoSectionIcon />}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {cantoStatus === 'connecting' && <SpinnerIcon className="text-gray-400" />}
                <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium truncate">
                  {cantoStatus === 'connected' ? 'docsdiesel.canto.com' :
                   cantoStatus === 'connecting' ? 'Connecting…' : cantoError || 'Connection failed'}
                </span>
              </div>
              <StatusBadge status={cantoStatus} />
            </div>

            {cantoStatus === 'error' && (
              <button onClick={() => {
                setCantoStatus('connecting'); setCantoError('')
                fetch('/api/canto/status').then(r => r.json()).then(d => {
                  if (d.connected) { setCantoStatus('connected'); loadAlbumsAndConfig() }
                  else { setCantoStatus('error'); setCantoError(d.error ?? '') }
                })
              }} className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2 mt-1 block">
                Retry
              </button>
            )}

            {cantoStatus === 'connected' && (
              <p className="text-[9px] text-gray-400 dark:text-gray-500">
                Asset folders are configured in Settings ⚙ in the top toolbar.
              </p>
            )}
          </Section>

          {/* IMAGES */}
          <Section label="Images" icon={<ImagesIcon />}>
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Assets</p>
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Background Texture</p>
                <TexturePicker
                  albumId={null}
                  value={textureAsset}
                  onChange={setTextureAsset}
                  placeholder="Pick texture…"
                  thumbnailFit="cover"
                />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Brand Logo</p>
                <TexturePicker
                  albumId={DEFAULT_LOGO_ALBUM}
                  value={logoAsset}
                  onChange={setLogoAsset}
                  placeholder="Pick logo…"
                  thumbnailFit="contain"
                />
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 space-y-1">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Photos</span> are matched per product by SKU from Canto.
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Icons</span> are matched from callout text.{' '}
                  {!folderConfig.iconsAlbumId && <span className="text-amber-600">No icons folder set ↑</span>}
                  {folderConfig.iconsAlbumId && <span className="text-emerald-600">Icons folder configured ✓</span>}
                </p>
              </div>
            </div>
          </Section>

          {/* SLOT TEMPLATES */}
          <Section label="Slot Templates" icon={<LayoutIcon />}>
            <div className="space-y-1.5">
              {slotConfigs.map((cfg, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`w-6 h-5 rounded text-[9px] font-bold uppercase flex items-center justify-center shrink-0 ${
                    i === 1 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}>{slotName(i)}</span>
                  <div className="flex flex-1 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                    {(['5050-right', '5050-left', 'icons'] as SlotTemplate[]).map(t => (
                      <button key={t} onClick={() => setSlotTemplate(i, t)}
                        className={`flex-1 h-6 text-[9px] font-bold uppercase tracking-wide transition-colors ${
                          cfg.template === t ? 'bg-gray-900 dark:bg-gray-700 text-white' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
                        }`} title={TEMPLATE_LABELS[t]}>
                        {t === '5050-right' ? '▷|' : t === '5050-left' ? '|◁' : '✦'}
                      </button>
                    ))}
                  </div>
                  <span className="text-[9px] text-gray-400 dark:text-gray-500 w-16 shrink-0">{TEMPLATE_LABELS[cfg.template]}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* GENERATION SETTINGS */}
          <Section label="Generation" icon={<SettingsIcon />}>
            <SettingRow label="A+ Slots">
              <div className="flex items-center gap-1.5">
                <button onClick={() => setAplusSlots(n => Math.max(2, n - 1))}
                  className="w-6 h-6 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 transition-colors text-sm flex items-center justify-center">−</button>
                <span className="w-4 text-center text-[12px] font-semibold text-gray-800 dark:text-gray-200 tabular-nums">{aplusSlots}</span>
                <button onClick={() => setAplusSlots(n => Math.min(8, n + 1))}
                  className="w-6 h-6 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 transition-colors text-sm flex items-center justify-center">+</button>
              </div>
            </SettingRow>
            <SettingRow label="Gallery Images">
              <button onClick={() => setIncludeGallery(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative ${includeGallery ? 'bg-gray-900 dark:bg-gray-700' : 'bg-gray-200 dark:bg-gray-700'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${includeGallery ? 'left-4' : 'left-0.5'}`} />
              </button>
            </SettingRow>
            <SettingRow label="Output Format">
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                {(['png', 'jpeg'] as const).map(f => (
                  <button key={f} onClick={() => setOutputFormat(f)}
                    className={`h-6 px-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      outputFormat === f ? 'bg-gray-900 dark:bg-gray-700 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}>{f === 'jpeg' ? 'JPG' : 'PNG'}</button>
                ))}
              </div>
            </SettingRow>
            {hasProducts && (
              <div className="mt-1 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{jobs.length} products</span>
                  {' × '}<span className="font-semibold text-gray-700 dark:text-gray-300">{imagesPerProduct} images</span>
                  {' = '}<span className="font-semibold text-gray-900 dark:text-white">{jobs.length * imagesPerProduct} files</span>
                </p>
                <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">
                  {aplusSlots} slots × desktop + mobile{includeGallery ? ` + ${aplusSlots} gallery` : ''}
                </p>
              </div>
            )}
          </Section>

          {/* PRESETS */}
          <Section label="Presets" icon={<PresetsIcon />}>
            <div className="flex gap-1.5">
              <input type="text" placeholder="Preset name…" value={presetName}
                onChange={e => setPresetName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                className="flex-1 h-7 px-2.5 rounded-lg border border-gray-200 dark:border-gray-600 text-[11px] text-gray-700 dark:text-gray-200 placeholder:text-gray-300 dark:placeholder:text-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-500" />
              <button onClick={handleSavePreset} disabled={!presetName.trim()}
                className="h-7 px-2.5 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
                Save
              </button>
            </div>
            {presets.length === 0 ? (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center py-1">No presets saved yet</p>
            ) : (
              <div className="space-y-1">
                {presets.map(p => (
                  <div key={p.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 truncate">{p.name}</p>
                      <p className="text-[9px] text-gray-400 dark:text-gray-500">{p.aplusSlots} slots · {p.outputFormat.toUpperCase()}</p>
                    </div>
                    <button onClick={() => handleLoadPreset(p)} className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-semibold transition-colors shrink-0">Load</button>
                    <button onClick={() => handleDeletePreset(p.id)} className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* ── Bottom run panel ── */}
        <div className="shrink-0 border-t border-gray-100 dark:border-gray-700 p-3 space-y-2.5 bg-white dark:bg-gray-900">
          {(isRunning || doneJobs > 0) && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
                <span>{isRunning ? 'Rendering…' : allDone ? 'Complete — export from top right' : 'Stopped'}</span>
                <span>{doneJobs} / {totalJobs}</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-200 ${allDone ? 'bg-emerald-400' : 'bg-gray-700'}`}
                  style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
          <div className="flex gap-1.5">
            {isRunning ? (
              <button onClick={handleCancel}
                className="flex-1 h-9 rounded-lg border border-red-200 text-red-500 text-[11px] font-bold uppercase tracking-widest hover:bg-red-50 transition-colors">
                Cancel
              </button>
            ) : allDone ? (
              <button onClick={handleReset}
                className="flex-1 h-9 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-[11px] font-bold uppercase tracking-widest hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                Reset & Run Again
              </button>
            ) : (
              <button onClick={handleRun} disabled={!canRun}
                className="flex-1 h-9 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5">
                <PlayIcon /> Run Bulk Generate
              </button>
            )}
          </div>
          {!canRun && !isRunning && !allDone && (
            <p className="text-[9px] text-gray-400 dark:text-gray-500 text-center">
              {cantoStatus === 'error' ? 'Canto connection failed' :
               cantoStatus === 'connecting' ? 'Connecting to Canto…' :
               !hasProducts ? 'Upload a CSV to continue' : 'Ready'}
            </p>
          )}
        </div>
      </aside>

      {/* ══ Main content ══ */}
      <main className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
        {!hasProducts ? (
          <EmptyState onDownloadTemplate={downloadTemplate} />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{jobs.length} Products</h2>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{imagesPerProduct} images each · {outputFormat.toUpperCase()}</p>
              </div>
              {(isRunning || doneJobs > 0) && (
                <div className={`flex items-center gap-1.5 px-3 h-7 rounded-full text-[11px] font-semibold ${
                  allDone ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                  isRunning ? 'bg-accent-50 dark:bg-accent-900/30 text-accent-700 dark:text-accent-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}>
                  {isRunning && <SpinnerIcon />}
                  {allDone ? `All done · ${doneJobs} images` : `${doneJobs} / ${totalJobs}`}
                </div>
              )}
            </div>

            {productWarnings > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40">
                <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  {productWarnings} product{productWarnings !== 1 ? 's have' : ' has'} warnings — hover the ⚠ to see details. Generation will still run.
                </p>
              </div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-24">SKU</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-24">Photos</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-44">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {jobs.map(job => <ProductRow key={job.id} job={job} imagesPerProduct={imagesPerProduct} />)}
                </tbody>
              </table>
            </div>

            {jobs.some(j => j.status === 'done') && (
              <OutputPreview
                jobs={jobs.filter(j => j.status === 'done')}
                aplusSlots={aplusSlots}
                includeGallery={includeGallery}
                capturedImages={capturedRef.current}
                outputFormat={outputFormat}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ label, icon, defaultOpen = false, children }: { label: string; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left group">
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors">{icon}</span>}
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors">{label}</span>
        </div>
        <svg className={`w-3 h-3 text-gray-300 dark:text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-2.5">{children}</div>}
    </div>
  )
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">{label}</span>
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'idle') return null
  const map = {
    connecting: { cls: 'bg-amber-50 text-amber-600', label: 'Connecting…' },
    connected:  { cls: 'bg-emerald-50 text-emerald-700', label: 'Connected' },
    error:      { cls: 'bg-red-50 text-red-600', label: 'Error' },
  }
  const { cls, label } = map[status]
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${cls}`}>{label}</span>
}

function ProductRow({ job, imagesPerProduct }: { job: JobProduct; imagesPerProduct: number }) {
  const cfg = {
    pending:   { dot: 'bg-gray-300',    text: 'text-gray-400' },
    rendering: { dot: 'bg-accent-400',  text: 'text-accent-600' },
    done:      { dot: 'bg-emerald-400', text: 'text-emerald-700' },
    error:     { dot: 'bg-red-400',     text: 'text-red-600' },
  }[job.status]

  return (
    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="px-4 py-3"><span className="text-[11px] font-mono font-semibold text-gray-700 dark:text-gray-300">{job.sku}</span></td>
      <td className="px-4 py-3">
        <span className="text-[12px] text-gray-700 dark:text-gray-300">{job.productName}</span>
        {job.warnings.length > 0 && <span className="ml-2 text-[9px] text-amber-500" title={job.warnings.join(', ')}>⚠</span>}
      </td>
      <td className="px-4 py-3"><span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">{job.photos.length}p · {job.slots.length}s</span></td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {job.status === 'rendering' ? <SpinnerIcon className="text-accent-500" /> : <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
          <span className={`text-[11px] font-medium ${cfg.text}`}>
            {job.status === 'rendering' && job.renderingSlot ? `Rendering ${job.renderingSlot}…` :
             job.status === 'done' ? `Done · ${imagesPerProduct} images` :
             job.status === 'error' ? 'Skipped' : 'Pending'}
          </span>
        </div>
      </td>
    </tr>
  )
}

function OutputPreview({ jobs, aplusSlots, includeGallery, capturedImages, outputFormat }: {
  jobs: JobProduct[]; aplusSlots: number; includeGallery: boolean
  capturedImages: Map<string, string>; outputFormat: string
}) {
  const [expanded, setExpanded] = useState<string | null>(jobs[0]?.id ?? null)
  const ext = outputFormat === 'jpeg' ? 'jpg' : 'png'

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Output Preview</h3>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{jobs.length} done</span>
      </div>
      {jobs.map(job => (
        <div key={job.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
          <button onClick={() => setExpanded(expanded === job.id ? null : job.id)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold text-gray-500 dark:text-gray-400">{job.sku}</span>
              <span className="text-[11px] text-gray-700 dark:text-gray-300">{job.productName}</span>
            </div>
            <svg className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform ${expanded === job.id ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expanded === job.id && (
            <div className="px-4 pb-4 space-y-4">
              {/* A+ Content — desktop + mobile per slot */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">A+ Content</p>
                  <div className="flex items-center gap-2 text-[8px] text-gray-300 dark:text-gray-600">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-semibold">D</span>
                    <span>Desktop 1464×600</span>
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-semibold">M</span>
                    <span>Mobile 600×450</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {Array.from({ length: aplusSlots }, (_, i) => {
                    const label = slotName(i)
                    const desktopUrl = capturedImages.get(`${job.sku}/${label}-desktop`)
                    const mobileUrl  = capturedImages.get(`${job.sku}/${label}-mobile`)
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase w-5 shrink-0">{label}</span>
                        {/* Desktop thumbnail — 1464:600 ≈ 2.44:1, height 40 → width 97 */}
                        <a href={desktopUrl} download={`${job.sku}-${label}-desktop.${ext}`}
                          className="group relative block rounded overflow-hidden border border-gray-200 dark:border-gray-600 hover:border-gray-400 transition-colors shrink-0"
                          style={{ width: 97, height: 40 }}>
                          {desktopUrl
                            ? <img src={desktopUrl} alt={`${label} desktop`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><span className="text-[7px] text-gray-400 font-bold">D</span></div>
                          }
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <DownloadIcon className="w-3 h-3 text-white" />
                          </div>
                        </a>
                        {/* Mobile thumbnail — 600:450 = 4:3, height 40 → width 53 */}
                        <a href={mobileUrl} download={`${job.sku}-${label}-mobile.${ext}`}
                          className="group relative block rounded overflow-hidden border border-gray-200 dark:border-gray-600 hover:border-gray-400 transition-colors shrink-0"
                          style={{ width: 53, height: 40 }}>
                          {mobileUrl
                            ? <img src={mobileUrl} alt={`${label} mobile`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><span className="text-[7px] text-gray-400 font-bold">M</span></div>
                          }
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <DownloadIcon className="w-3 h-3 text-white" />
                          </div>
                        </a>
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* Gallery — 1:1 square thumbnails */}
              {includeGallery && (
                <div>
                  <p className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Gallery 1500×1500</p>
                  <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: aplusSlots }, (_, i) => {
                      const key = `${job.sku}/gallery-${i + 1}`
                      const url = capturedImages.get(key)
                      return (
                        <a key={i} href={url} download={`${job.sku}-gallery-${i + 1}.${ext}`}
                          className="group relative block rounded overflow-hidden border border-gray-200 dark:border-gray-600 hover:border-gray-400 transition-colors"
                          style={{ width: 50, height: 50 }}>
                          {url
                            ? <img src={url} alt={`gallery-${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <span className="text-[8px] text-gray-400 dark:text-gray-500 font-bold">G{i+1}</span>
                              </div>
                          }
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <DownloadIcon className="w-3 h-3 text-white" />
                          </div>
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onDownloadTemplate }: { onDownloadTemplate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">No products loaded</h3>
      <p className="text-[12px] text-gray-400 dark:text-gray-500 max-w-xs leading-relaxed mb-4">
        Export your Google Sheet as CSV and drop it in the panel on the left.
      </p>
      <div className="grid grid-cols-3 gap-3 text-left mb-5">
        {[
          { step: '1', label: 'Fill the sheet', desc: 'Add SKUs, copy, and Canto photo tags' },
          { step: '2', label: 'Export CSV', desc: 'File → Download → CSV in Google Sheets' },
          { step: '3', label: 'Drop & Run', desc: 'Upload the file and click Run' },
        ].map(item => (
          <div key={item.step} className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 p-3 shadow-sm">
            <div className="w-5 h-5 rounded-full bg-gray-900 dark:bg-gray-700 text-white text-[9px] font-bold flex items-center justify-center mb-2">{item.step}</div>
            <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{item.label}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{item.desc}</p>
          </div>
        ))}
      </div>
      <button onClick={onDownloadTemplate}
        className="flex items-center gap-1.5 h-8 px-4 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-[11px] font-bold uppercase tracking-widest hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
        <DownloadIcon className="w-3.5 h-3.5" /> Download Sheet Template
      </button>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlayIcon() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
}
function DownloadIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return <svg className={`shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
}
function SpinnerIcon({ className = '' }: { className?: string }) {
  return <svg className={`animate-spin h-3 w-3 shrink-0 ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
}

function CsvIcon() {
  return <svg className="w-7 h-7 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
}
function CsvSectionIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
}
function CantoSectionIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
}
function ImagesIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
}
function LayoutIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
}
function SettingsIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
  </svg>
}
function PresetsIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
  </svg>
}
