'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BulkProduct, ParseResult, downloadTemplate, parseCSV } from '@/lib/csv'

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'
type JobStatus = 'pending' | 'rendering' | 'done' | 'error'

interface JobProduct extends BulkProduct {
  status: JobStatus
  renderingSlot?: string
  doneCount?: number
}

// ─── Slot label helpers ───────────────────────────────────────────────────────

function slotName(i: number) { return String.fromCharCode(97 + i) + '1' }

// ─── Component ───────────────────────────────────────────────────────────────

export default function BulkMode() {
  // CSV state
  const [parseResult, setParseResult]   = useState<ParseResult | null>(null)
  const [csvFilename, setCsvFilename]   = useState('')
  const [isDragging, setIsDragging]     = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Canto — auto-connects on mount via server-side credentials
  const [cantoStatus, setCantoStatus] = useState<ConnectionStatus>('connecting')
  const [cantoError, setCantoError]   = useState('')

  // Settings
  const [aplusSlots, setAplusSlots]         = useState(5)
  const [includeGallery, setIncludeGallery] = useState(true)
  const [outputFormat, setOutputFormat]     = useState<'png' | 'jpeg'>('png')

  // Run state
  const [jobs, setJobs]           = useState<JobProduct[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [doneJobs, setDoneJobs]   = useState(0)
  const [totalJobs, setTotalJobs] = useState(0)
  const cancelRef = useRef(false)

  // ── CSV handling ─────────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) return
    setCsvFilename(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const result = parseCSV(text)
      setParseResult(result)
      setJobs(result.products.map(p => ({ ...p, status: 'pending' })))
      setDoneJobs(0)
      setTotalJobs(0)
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)

  const handleClear = () => {
    setParseResult(null)
    setCsvFilename('')
    setJobs([])
    setDoneJobs(0)
    setTotalJobs(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Canto auto-connect ────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/canto/status')
      .then(r => r.json())
      .then(d => {
        if (d.connected) setCantoStatus('connected')
        else { setCantoStatus('error'); setCantoError(d.error ?? 'Connection failed') }
      })
      .catch(() => { setCantoStatus('error'); setCantoError('Could not reach server') })
  }, [])

  // ── Run ──────────────────────────────────────────────────────────────────────

  const handleRun = async () => {
    if (!canRun) return
    cancelRef.current = false

    const imagesPerProduct = aplusSlots + (includeGallery ? aplusSlots : 0)
    const total = jobs.length * imagesPerProduct
    setTotalJobs(total)
    setDoneJobs(0)
    setIsRunning(true)
    setJobs(p => p.map(r => ({ ...r, status: 'pending', doneCount: 0, renderingSlot: undefined })))

    let done = 0
    for (let i = 0; i < jobs.length; i++) {
      if (cancelRef.current) break

      setJobs(p => p.map((r, idx) =>
        idx === i ? { ...r, status: 'rendering', renderingSlot: slotName(0) } : r
      ))

      for (let j = 0; j < imagesPerProduct; j++) {
        if (cancelRef.current) break
        const label = j < aplusSlots ? slotName(j) : `gallery-${j - aplusSlots + 1}`
        setJobs(p => p.map((r, idx) =>
          idx === i ? { ...r, renderingSlot: label, doneCount: j } : r
        ))
        await new Promise(r => setTimeout(r, 280))
        done++
        setDoneJobs(done)
      }

      setJobs(p => p.map((r, idx) =>
        idx === i ? { ...r, status: cancelRef.current ? 'error' : 'done', doneCount: imagesPerProduct, renderingSlot: undefined } : r
      ))
    }

    setIsRunning(false)
  }

  const handleCancel = () => { cancelRef.current = true }

  const handleReset = () => {
    setJobs(p => p.map(r => ({ ...r, status: 'pending', doneCount: 0, renderingSlot: undefined })))
    setDoneJobs(0)
    setTotalJobs(0)
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const products       = parseResult?.products ?? []
  const hasProducts    = jobs.length > 0
  const canRun         = hasProducts && cantoStatus === 'connected' && !isRunning
  const allDone        = hasProducts && jobs.every(p => p.status === 'done')
  const progressPct    = totalJobs > 0 ? Math.round((doneJobs / totalJobs) * 100) : 0
  const imagesPerProduct = aplusSlots + (includeGallery ? aplusSlots : 0)
  const fileErrors     = parseResult?.errors ?? []
  const productWarnings = products.filter(p => p.warnings.length > 0).length

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0 bg-gray-50">

      {/* ══ Left config panel ══ */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-gray-100 bg-white shadow-sm z-10">

        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* DATA SOURCE — CSV */}
          <Section label="Data Source">
            {!hasProducts ? (
              <div className="space-y-2">
                {/* Drop zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-gray-400 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                  />
                  <CsvIcon />
                  <div className="text-center">
                    <p className="text-[11px] font-semibold text-gray-600">Drop CSV or click to browse</p>
                    <p className="text-[9px] text-gray-400 mt-0.5">Export from Google Sheets → File → Download → CSV</p>
                  </div>
                </div>

                {/* File errors */}
                {fileErrors.length > 0 && (
                  <div className="p-2 rounded-lg bg-red-50 border border-red-100">
                    {fileErrors.map((e, i) => (
                      <p key={i} className="text-[10px] text-red-600">{e}</p>
                    ))}
                  </div>
                )}

                {/* Template download */}
                <button
                  onClick={downloadTemplate}
                  className="w-full h-7 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-widest hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  <DownloadIcon className="w-3 h-3" />
                  Download Template
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Loaded file */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <p className="text-[11px] font-semibold text-gray-700 truncate">{csvFilename}</p>
                    </div>
                    <p className="text-[10px] text-gray-500 pl-3">
                      {products.length} product{products.length !== 1 ? 's' : ''}
                      {productWarnings > 0 && (
                        <span className="ml-1.5 text-amber-600">· {productWarnings} warning{productWarnings !== 1 ? 's' : ''}</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={handleClear}
                    className="shrink-0 text-[10px] text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
                  >
                    Remove
                  </button>
                </div>

                {/* Slot summary from CSV */}
                <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 space-y-1">
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Detected columns</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: Math.max(...products.map(p => p.slots.length), 0) }, (_, i) => (
                      <span
                        key={i}
                        className={`h-4 px-1.5 rounded text-[9px] font-bold uppercase ${
                          i === 1 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {slotName(i)}{i === 1 ? '★' : ''}
                      </span>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-400">
                    {Math.max(...products.map(p => p.photos.length), 0)} photo cols · {products[0]?.slots[0]?.iconCallouts.filter(Boolean).length ?? 0} icon cols on b1
                  </p>
                </div>
              </div>
            )}
          </Section>

          {/* CANTO */}
          <Section label="Canto (Assets)">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {cantoStatus === 'connecting' && <SpinnerIcon className="text-gray-400" />}
                <span className="text-[11px] text-gray-600 font-medium truncate">
                  {cantoStatus === 'connected' ? 'docsdiesel.canto.com' :
                   cantoStatus === 'connecting' ? 'Connecting…' :
                   cantoError || 'Connection failed'}
                </span>
              </div>
              <StatusBadge status={cantoStatus} />
            </div>
            {cantoStatus === 'error' && (
              <button
                onClick={() => { setCantoStatus('connecting'); setCantoError(''); fetch('/api/canto/status').then(r => r.json()).then(d => { if (d.connected) setCantoStatus('connected'); else { setCantoStatus('error'); setCantoError(d.error ?? '') } }) }}
                className="text-[10px] text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
                Retry
              </button>
            )}
          </Section>

          {/* GENERATION SETTINGS */}
          <Section label="Generation Settings">

            {/* A+ Slots */}
            <SettingRow label="A+ Slots">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setAplusSlots(n => Math.max(2, n - 1))}
                  className="w-6 h-6 rounded-md border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-800 transition-colors text-sm flex items-center justify-center"
                >−</button>
                <span className="w-4 text-center text-[12px] font-semibold text-gray-800 tabular-nums">{aplusSlots}</span>
                <button
                  onClick={() => setAplusSlots(n => Math.min(8, n + 1))}
                  className="w-6 h-6 rounded-md border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-800 transition-colors text-sm flex items-center justify-center"
                >+</button>
              </div>
            </SettingRow>

            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: aplusSlots }, (_, i) => (
                <div key={i} className={`h-5 px-1.5 rounded text-[9px] font-bold uppercase tracking-wide flex items-center ${
                  i === 1 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {slotName(i)}{i === 1 && <span className="ml-0.5 text-amber-500">★</span>}
                </div>
              ))}
            </div>

            <div className="h-px bg-gray-100 my-0.5" />

            {/* Include gallery */}
            <SettingRow label="Gallery Images">
              <button
                onClick={() => setIncludeGallery(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative ${includeGallery ? 'bg-gray-900' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${includeGallery ? 'left-4' : 'left-0.5'}`} />
              </button>
            </SettingRow>

            <div className="h-px bg-gray-100 my-0.5" />

            {/* Output format */}
            <SettingRow label="Output Format">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['png', 'jpeg'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setOutputFormat(f)}
                    className={`h-6 px-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      outputFormat === f ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {f === 'jpeg' ? 'JPG' : 'PNG'}
                  </button>
                ))}
              </div>
            </SettingRow>

            {/* Summary */}
            {hasProducts && (
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  <span className="font-semibold text-gray-700">{jobs.length} products</span>
                  {' × '}
                  <span className="font-semibold text-gray-700">{imagesPerProduct} images</span>
                  {' = '}
                  <span className="font-semibold text-gray-900">{jobs.length * imagesPerProduct} files</span>
                </p>
              </div>
            )}
          </Section>
        </div>

        {/* ── Bottom run panel ── */}
        <div className="shrink-0 border-t border-gray-100 p-3 space-y-2.5 bg-white">

          {/* Progress */}
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

          {/* Buttons */}
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
                  <DownloadIcon className="w-3.5 h-3.5" />
                  Download ZIP
                </button>
              </>
            ) : (
              <button
                onClick={handleRun}
                disabled={!canRun}
                className="flex-1 h-9 rounded-lg bg-gray-900 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
              >
                <PlayIcon />
                Run Bulk Generate
              </button>
            )}
          </div>

          {!canRun && !isRunning && !allDone && (
            <p className="text-[9px] text-gray-400 text-center">
              {cantoStatus === 'error'
                ? 'Canto connection failed — check server'
                : cantoStatus === 'connecting'
                ? 'Connecting to Canto…'
                : !hasProducts
                ? 'Upload a CSV to continue'
                : 'Ready'}
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
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">{jobs.length} Products</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {imagesPerProduct} images each · {outputFormat.toUpperCase()}
                </p>
              </div>
              {(isRunning || doneJobs > 0) && (
                <div className={`flex items-center gap-1.5 px-3 h-7 rounded-full text-[11px] font-semibold ${
                  allDone ? 'bg-emerald-50 text-emerald-700' :
                  isRunning ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {isRunning && <SpinnerIcon />}
                  {allDone ? `All done · ${doneJobs} images` : `${doneJobs} / ${totalJobs}`}
                </div>
              )}
            </div>

            {/* Warnings banner */}
            {productWarnings > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
                <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                <p className="text-[11px] text-amber-700">
                  {productWarnings} product{productWarnings !== 1 ? 's have' : ' has'} missing data — they will be skipped during generation.
                </p>
              </div>
            )}

            {/* Product table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-24">SKU</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Product</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-28">Photos / Slots</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-44">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {jobs.map(job => (
                    <ProductRow key={job.id} job={job} imagesPerProduct={imagesPerProduct} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Output preview */}
            {jobs.some(j => j.status === 'done') && (
              <OutputPreview
                jobs={jobs.filter(j => j.status === 'done')}
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
      <div className="px-4 pt-3 pb-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">{label}</p>
        <div className="space-y-2.5">{children}</div>
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
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${cls}`}>{label}</span>
}

function ProductRow({ job, imagesPerProduct }: { job: JobProduct; imagesPerProduct: number }) {
  const cfg = {
    pending:   { dot: 'bg-gray-300',    text: 'text-gray-400' },
    rendering: { dot: 'bg-blue-400',    text: 'text-blue-600' },
    done:      { dot: 'bg-emerald-400', text: 'text-emerald-700' },
    error:     { dot: 'bg-red-400',     text: 'text-red-600' },
  }[job.status]

  return (
    <tr className="hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-3">
        <span className="text-[11px] font-mono font-semibold text-gray-700">{job.sku}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-[12px] text-gray-700">{job.productName}</span>
        {job.warnings.length > 0 && (
          <span className="ml-2 text-[9px] text-amber-500" title={job.warnings.join(', ')}>⚠</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-[10px] text-gray-500 tabular-nums">
          {job.photos.length}p · {job.slots.length}s
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {job.status === 'rendering'
            ? <SpinnerIcon className="text-blue-500" />
            : <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          }
          <span className={`text-[11px] font-medium ${cfg.text}`}>
            {job.status === 'rendering' && job.renderingSlot
              ? `Rendering ${job.renderingSlot}…`
              : job.status === 'done'
              ? `Done · ${imagesPerProduct} images`
              : job.status === 'error'
              ? 'Skipped'
              : 'Pending'}
          </span>
        </div>
      </td>
    </tr>
  )
}

function OutputPreview({ jobs, aplusSlots, includeGallery }: {
  jobs: JobProduct[]
  aplusSlots: number
  includeGallery: boolean
}) {
  const [expanded, setExpanded] = useState<string | null>(jobs[0]?.id ?? null)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Output Preview</h3>
        <span className="text-[10px] text-gray-400">{jobs.length} done</span>
      </div>
      {jobs.map(job => (
        <div key={job.id} className="border-b border-gray-50 last:border-0">
          <button
            onClick={() => setExpanded(expanded === job.id ? null : job.id)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-semibold text-gray-500">{job.sku}</span>
              <span className="text-[11px] text-gray-700">{job.productName}</span>
            </div>
            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded === job.id ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expanded === job.id && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">A+ Content</p>
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({ length: aplusSlots }, (_, i) => (
                    <Thumb key={i} label={slotName(i)} aspect="aplus" accent={i === 1} />
                  ))}
                </div>
              </div>
              {includeGallery && (
                <div>
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Gallery</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {Array.from({ length: aplusSlots }, (_, i) => (
                      <Thumb key={i} label={`G${i + 1}`} aspect="gallery" />
                    ))}
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

function Thumb({ label, aspect, accent }: { label: string; aspect: 'aplus' | 'gallery'; accent?: boolean }) {
  const w = aspect === 'aplus' ? 80 : 52
  const h = aspect === 'aplus' ? 33 : 52
  return (
    <div
      className={`rounded flex items-center justify-center ${accent ? 'bg-amber-50 border border-amber-200' : 'bg-gray-100 border border-gray-200'}`}
      style={{ width: w, height: h }}
    >
      <span className={`text-[8px] font-bold uppercase ${accent ? 'text-amber-600' : 'text-gray-400'}`}>{label}</span>
    </div>
  )
}

function EmptyState({ onDownloadTemplate }: { onDownloadTemplate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1">No products loaded</h3>
      <p className="text-[12px] text-gray-400 max-w-xs leading-relaxed mb-4">
        Export your Google Sheet as CSV and drop it in the panel on the left.
      </p>
      <div className="grid grid-cols-3 gap-3 text-left mb-5">
        {[
          { step: '1', label: 'Fill the sheet', desc: 'Add SKUs, copy, and Canto photo tags' },
          { step: '2', label: 'Export CSV', desc: 'File → Download → CSV in Google Sheets' },
          { step: '3', label: 'Drop & Run', desc: 'Upload the file and click Run' },
        ].map(item => (
          <div key={item.step} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
            <div className="w-5 h-5 rounded-full bg-gray-900 text-white text-[9px] font-bold flex items-center justify-center mb-2">{item.step}</div>
            <p className="text-[11px] font-semibold text-gray-700">{item.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
          </div>
        ))}
      </div>
      <button
        onClick={onDownloadTemplate}
        className="flex items-center gap-1.5 h-8 px-4 rounded-lg border border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-widest hover:border-gray-400 hover:text-gray-700 transition-colors"
      >
        <DownloadIcon className="w-3.5 h-3.5" />
        Download Sheet Template
      </button>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlayIcon() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
}

function DownloadIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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

function CsvIcon() {
  return (
    <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}
