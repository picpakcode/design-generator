'use client'

import React, { useState, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'
type JobStatus = 'pending' | 'rendering' | 'done' | 'error'

interface ProductRow {
  id: string
  sku: string
  productName: string
  photoCount: number
  status: JobStatus
  renderingSlot?: string
  doneCount?: number
}

// ─── Sample data ──────────────────────────────────────────────────────────────

const SAMPLE_PRODUCTS: ProductRow[] = [
  { id: '1', sku: 'FH-2001', productName: 'Fiber Hairbrush Pro',   photoCount: 5, status: 'pending' },
  { id: '2', sku: 'FH-2002', productName: 'Detangling Comb Set',    photoCount: 4, status: 'pending' },
  { id: '3', sku: 'FH-2003', productName: 'Wide-Tooth Brush',       photoCount: 3, status: 'pending' },
  { id: '4', sku: 'FH-2004', productName: 'Scalp Massager',         photoCount: 5, status: 'pending' },
  { id: '5', sku: 'FH-2005', productName: 'Travel Kit Bundle',      photoCount: 5, status: 'pending' },
  { id: '6', sku: 'FH-2006', productName: 'Boar Bristle Brush',     photoCount: 4, status: 'pending' },
]

// ─── A+ slot name helper ──────────────────────────────────────────────────────

function slotName(i: number): string {
  return String.fromCharCode(97 + i) + '1'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BulkMode() {
  // Data sources
  const [sheetUrl, setSheetUrl]       = useState('')
  const [sheetStatus, setSheetStatus] = useState<ConnectionStatus>('idle')
  const [cantoKey, setCantoKey]       = useState('')
  const [cantoStatus, setCantoStatus] = useState<ConnectionStatus>('idle')

  // Products
  const [products, setProducts] = useState<ProductRow[]>([])

  // Settings
  const [aplusSlots, setAplusSlots]     = useState(5)
  const [includeGallery, setIncludeGallery] = useState(true)
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg'>('png')

  // Run state
  const [isRunning, setIsRunning]   = useState(false)
  const [doneJobs, setDoneJobs]     = useState(0)
  const [totalJobs, setTotalJobs]   = useState(0)
  const cancelRef = useRef(false)

  // ── Connections ─────────────────────────────────────────────────────────────

  const handleConnectSheet = async () => {
    if (!sheetUrl.trim()) return
    setSheetStatus('connecting')
    await new Promise(r => setTimeout(r, 1200))
    setSheetStatus('connected')
    setProducts(SAMPLE_PRODUCTS.map(p => ({ ...p, status: 'pending' })))
  }

  const handleLoadSample = () => {
    setSheetStatus('connected')
    setSheetUrl('https://docs.google.com/spreadsheets/d/sample')
    setProducts(SAMPLE_PRODUCTS.map(p => ({ ...p, status: 'pending' })))
  }

  const handleConnectCanto = async () => {
    if (!cantoKey.trim()) return
    setCantoStatus('connecting')
    await new Promise(r => setTimeout(r, 900))
    setCantoStatus('connected')
  }

  // ── Run ─────────────────────────────────────────────────────────────────────

  const handleRun = async () => {
    if (!canRun) return
    cancelRef.current = false

    const imagesPerProduct = aplusSlots + (includeGallery ? aplusSlots : 0)
    const total = products.length * imagesPerProduct
    setTotalJobs(total)
    setDoneJobs(0)
    setIsRunning(true)
    setProducts(p => p.map(r => ({ ...r, status: 'pending', doneCount: 0, renderingSlot: undefined })))

    let done = 0
    for (let i = 0; i < products.length; i++) {
      if (cancelRef.current) break

      setProducts(p => p.map((r, idx) =>
        idx === i ? { ...r, status: 'rendering', renderingSlot: slotName(0) } : r
      ))

      for (let j = 0; j < imagesPerProduct; j++) {
        if (cancelRef.current) break
        const label = j < aplusSlots
          ? slotName(j)
          : `gallery-${j - aplusSlots + 1}`

        setProducts(p => p.map((r, idx) =>
          idx === i ? { ...r, renderingSlot: label, doneCount: j } : r
        ))
        await new Promise(r => setTimeout(r, 280))
        done++
        setDoneJobs(done)
      }

      setProducts(p => p.map((r, idx) =>
        idx === i ? { ...r, status: cancelRef.current ? 'error' : 'done', doneCount: imagesPerProduct, renderingSlot: undefined } : r
      ))
    }

    setIsRunning(false)
  }

  const handleCancel = () => {
    cancelRef.current = true
  }

  const handleReset = () => {
    setProducts(p => p.map(r => ({ ...r, status: 'pending', doneCount: 0, renderingSlot: undefined })))
    setDoneJobs(0)
    setTotalJobs(0)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const canRun = sheetStatus === 'connected' && cantoStatus === 'connected' && products.length > 0 && !isRunning
  const allDone = products.length > 0 && products.every(p => p.status === 'done')
  const progressPct = totalJobs > 0 ? Math.round((doneJobs / totalJobs) * 100) : 0
  const imagesPerProduct = aplusSlots + (includeGallery ? aplusSlots : 0)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0 bg-gray-50">

      {/* ══ Left config panel ══ */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-gray-100 bg-white shadow-sm z-10">

        {/* Scrollable config */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* DATA SOURCES */}
          <Section label="Data Sources">

            {/* Google Sheets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="label-xs text-gray-500">Google Sheets</span>
                <StatusBadge status={sheetStatus} />
              </div>

              {sheetStatus !== 'connected' ? (
                <>
                  <input
                    type="url"
                    placeholder="Paste sheet URL…"
                    value={sheetUrl}
                    onChange={e => setSheetUrl(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-lg border border-gray-200 text-[11px] text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleConnectSheet}
                      disabled={!sheetUrl.trim() || sheetStatus === 'connecting'}
                      className="flex-1 h-7 rounded-lg bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {sheetStatus === 'connecting' ? 'Connecting…' : 'Connect'}
                    </button>
                    <button
                      onClick={handleLoadSample}
                      className="flex-1 h-7 rounded-lg border border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-widest hover:border-gray-400 hover:text-gray-700 transition-colors"
                    >
                      Sample
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500 truncate">
                    {products.length} product{products.length !== 1 ? 's' : ''} loaded
                  </span>
                  <button
                    onClick={() => { setSheetStatus('idle'); setSheetUrl(''); setProducts([]) }}
                    className="text-[10px] text-gray-400 hover:text-gray-600 underline underline-offset-2"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>

            <div className="h-px bg-gray-100 my-1" />

            {/* Canto */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="label-xs text-gray-500">Canto (Assets)</span>
                <StatusBadge status={cantoStatus} />
              </div>

              {cantoStatus !== 'connected' ? (
                <div className="flex gap-1.5">
                  <input
                    type="password"
                    placeholder="API key…"
                    value={cantoKey}
                    onChange={e => setCantoKey(e.target.value)}
                    className="flex-1 h-8 px-2.5 rounded-lg border border-gray-200 text-[11px] text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                  />
                  <button
                    onClick={handleConnectCanto}
                    disabled={!cantoKey.trim() || cantoStatus === 'connecting'}
                    className="h-8 px-3 rounded-lg bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {cantoStatus === 'connecting' ? '…' : 'Connect'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Icon library ready</span>
                  <button
                    onClick={() => { setCantoStatus('idle'); setCantoKey('') }}
                    className="text-[10px] text-gray-400 hover:text-gray-600 underline underline-offset-2"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </Section>

          {/* GENERATION SETTINGS */}
          <Section label="Generation Settings">

            {/* A+ Slots */}
            <SettingRow label="A+ Slots">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setAplusSlots(n => Math.max(2, n - 1))}
                  className="w-6 h-6 rounded-md border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-800 transition-colors text-sm leading-none flex items-center justify-center"
                >−</button>
                <span className="w-4 text-center text-[12px] font-semibold text-gray-800 tabular-nums">{aplusSlots}</span>
                <button
                  onClick={() => setAplusSlots(n => Math.min(8, n + 1))}
                  className="w-6 h-6 rounded-md border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-800 transition-colors text-sm leading-none flex items-center justify-center"
                >+</button>
              </div>
            </SettingRow>

            {/* Pattern preview */}
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: aplusSlots }, (_, i) => {
                const isIcons = i === 1
                const label = slotName(i)
                return (
                  <div
                    key={i}
                    className={`h-5 px-1.5 rounded text-[9px] font-bold uppercase tracking-wide flex items-center ${
                      isIcons
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {label}
                    {isIcons && <span className="ml-0.5 text-amber-500">★</span>}
                  </div>
                )
              })}
            </div>
            <p className="text-[9px] text-gray-400">★ = Icons template · always slot 2</p>

            <div className="h-px bg-gray-100 my-1" />

            {/* Include gallery */}
            <SettingRow label="Gallery Images">
              <button
                onClick={() => setIncludeGallery(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative ${includeGallery ? 'bg-gray-900' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${includeGallery ? 'left-4' : 'left-0.5'}`} />
              </button>
            </SettingRow>

            {includeGallery && (
              <p className="text-[9px] text-gray-400 -mt-1">
                +{aplusSlots} gallery images per product (1500×1500)
              </p>
            )}

            <div className="h-px bg-gray-100 my-1" />

            {/* Output format */}
            <SettingRow label="Output Format">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['png', 'jpeg'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setOutputFormat(f)}
                    className={`h-6 px-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      outputFormat === f
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {f === 'jpeg' ? 'JPG' : 'PNG'}
                  </button>
                ))}
              </div>
            </SettingRow>

            {/* Summary */}
            {products.length > 0 && (
              <div className="mt-1 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  <span className="font-semibold text-gray-700">{products.length} products</span>
                  {' × '}
                  <span className="font-semibold text-gray-700">{imagesPerProduct} images</span>
                  {' = '}
                  <span className="font-semibold text-gray-900">{products.length * imagesPerProduct} files</span>
                </p>
              </div>
            )}
          </Section>
        </div>

        {/* ── Bottom run panel ── */}
        <div className="shrink-0 border-t border-gray-100 p-3 space-y-2.5 bg-white">

          {/* Progress bar */}
          {(isRunning || doneJobs > 0) && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-500 tabular-nums">
                <span>{isRunning ? 'Rendering…' : allDone ? 'Complete' : 'Stopped'}</span>
                <span>{doneJobs} / {totalJobs}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${allDone ? 'bg-emerald-400' : 'bg-gray-700'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-1.5">
            {isRunning ? (
              <button
                onClick={handleCancel}
                className="flex-1 h-9 rounded-lg border border-red-200 text-red-500 text-[11px] font-bold uppercase tracking-widest hover:bg-red-50 transition-colors"
              >
                Cancel
              </button>
            ) : allDone ? (
              <>
                <button
                  onClick={handleReset}
                  className="h-9 px-3 rounded-lg border border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-widest hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  Reset
                </button>
                <button className="flex-1 h-9 rounded-lg bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5">
                  <DownloadIcon />
                  Download ZIP
                </button>
              </>
            ) : (
              <button
                onClick={handleRun}
                disabled={!canRun}
                title={!canRun && sheetStatus !== 'connected' ? 'Connect a sheet first' : !canRun && cantoStatus !== 'connected' ? 'Connect Canto first' : undefined}
                className="flex-1 h-9 rounded-lg bg-gray-900 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
              >
                <PlayIcon />
                Run Bulk Generate
              </button>
            )}
          </div>

          {!canRun && !isRunning && !allDone && (
            <p className="text-[9px] text-gray-400 text-center">
              {sheetStatus !== 'connected' ? 'Connect a Google Sheet to continue' :
               cantoStatus !== 'connected' ? 'Connect Canto to access assets' :
               'Ready to generate'}
            </p>
          )}
        </div>
      </aside>

      {/* ══ Main content area ══ */}
      <main className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">

        {products.length === 0 ? (
          /* Empty state */
          <EmptyState />
        ) : (
          <>
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">
                  {products.length} Products
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {imagesPerProduct} images each · {outputFormat.toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Progress pill */}
                {(isRunning || doneJobs > 0) && (
                  <div className={`flex items-center gap-1.5 px-3 h-7 rounded-full text-[11px] font-semibold ${
                    allDone ? 'bg-emerald-50 text-emerald-700' :
                    isRunning ? 'bg-blue-50 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {isRunning && <SpinnerIcon />}
                    {allDone
                      ? `All done · ${doneJobs} images`
                      : `${doneJobs} / ${totalJobs}`}
                  </div>
                )}
              </div>
            </div>

            {/* Product table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-24">SKU</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Product</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-20">Photos</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-40">Status</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-24">Output</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.map((product) => (
                    <ProductTableRow
                      key={product.id}
                      product={product}
                      imagesPerProduct={imagesPerProduct}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Output preview — shown when at least one product is done */}
            {products.some(p => p.status === 'done') && (
              <OutputPreview
                products={products.filter(p => p.status === 'done')}
                aplusSlots={aplusSlots}
                includeGallery={includeGallery}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100">
      <div className="px-4 pt-3 pb-0.5">
        <p className="label-xs text-gray-400 mb-2">{label}</p>
        <div className="space-y-2.5 pb-3">
          {children}
        </div>
      </div>
    </div>
  )
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-600 font-medium">{label}</span>
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
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

function ProductTableRow({ product, imagesPerProduct }: { product: ProductRow; imagesPerProduct: number }) {
  const statusConfig = {
    pending:   { dot: 'bg-gray-300',    text: 'text-gray-400',   label: 'Pending' },
    rendering: { dot: 'bg-blue-400',    text: 'text-blue-600',   label: 'Rendering' },
    done:      { dot: 'bg-emerald-400', text: 'text-emerald-700', label: 'Done' },
    error:     { dot: 'bg-red-400',     text: 'text-red-600',    label: 'Error' },
  }
  const cfg = statusConfig[product.status]

  return (
    <tr className="hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-3">
        <span className="text-[11px] font-mono font-semibold text-gray-700">{product.sku}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-[12px] text-gray-700">{product.productName}</span>
      </td>
      <td className="px-4 py-3">
        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold tabular-nums">
          {product.photoCount} photo{product.photoCount !== 1 ? 's' : ''}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {product.status === 'rendering'
            ? <SpinnerIcon className="text-blue-500" />
            : <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          }
          <span className={`text-[11px] font-medium ${cfg.text}`}>
            {product.status === 'rendering' && product.renderingSlot
              ? `Rendering ${product.renderingSlot}…`
              : product.status === 'done'
              ? `Done · ${imagesPerProduct} images`
              : cfg.label}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        {product.status === 'done' ? (
          <button className="text-[10px] text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors">
            Preview
          </button>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        )}
      </td>
    </tr>
  )
}

function OutputPreview({
  products,
  aplusSlots,
  includeGallery,
}: {
  products: ProductRow[]
  aplusSlots: number
  includeGallery: boolean
}) {
  const [expanded, setExpanded] = useState<string | null>(products[0]?.id ?? null)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Output Preview</h3>
        <span className="text-[10px] text-gray-400">{products.length} product{products.length !== 1 ? 's' : ''} done</span>
      </div>

      {products.map(product => (
        <div key={product.id} className="border-b border-gray-50 last:border-0">
          <button
            onClick={() => setExpanded(expanded === product.id ? null : product.id)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold text-gray-500">{product.sku}</span>
              <span className="text-[11px] text-gray-700">{product.productName}</span>
            </div>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded === product.id ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded === product.id && (
            <div className="px-4 pb-4">
              {/* A+ slot thumbnails */}
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-2">A+ Content</p>
              <div className="flex gap-2 flex-wrap mb-3">
                {Array.from({ length: aplusSlots }, (_, i) => (
                  <PlaceholderThumb key={i} label={slotName(i)} aspect="aplus" isIcons={i === 1} />
                ))}
              </div>

              {/* Gallery thumbnails */}
              {includeGallery && (
                <>
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Gallery Images</p>
                  <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: aplusSlots }, (_, i) => (
                      <PlaceholderThumb key={i} label={`G${i + 1}`} aspect="gallery" />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function PlaceholderThumb({ label, aspect, isIcons }: { label: string; aspect: 'aplus' | 'gallery'; isIcons?: boolean }) {
  const w = aspect === 'aplus' ? 80 : 56
  const h = aspect === 'aplus' ? 33 : 56
  return (
    <div
      className={`rounded flex flex-col items-center justify-center gap-0.5 ${
        isIcons ? 'bg-amber-50 border border-amber-200' : 'bg-gray-100 border border-gray-200'
      }`}
      style={{ width: w, height: h }}
    >
      <span className={`text-[8px] font-bold uppercase ${isIcons ? 'text-amber-600' : 'text-gray-400'}`}>
        {label}
      </span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1">No products loaded</h3>
      <p className="text-[12px] text-gray-400 max-w-xs leading-relaxed">
        Connect a Google Sheet with your product data, or load the sample dataset to preview the bulk generation flow.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 text-left">
        {[
          { step: '1', label: 'Connect Sheet', desc: 'Paste your Google Sheet URL' },
          { step: '2', label: 'Connect Canto', desc: 'Link your asset library' },
          { step: '3', label: 'Run & Export', desc: 'Generate all images as ZIP' },
        ].map(item => (
          <div key={item.step} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
            <div className="w-5 h-5 rounded-full bg-gray-900 text-white text-[9px] font-bold flex items-center justify-center mb-2">
              {item.step}
            </div>
            <p className="text-[11px] font-semibold text-gray-700">{item.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function SpinnerIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin h-3 w-3 shrink-0 ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
