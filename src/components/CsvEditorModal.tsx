'use client'

import React, { useEffect, useCallback, useState } from 'react'
import { parseCSV, productsToCSV, ParseResult, BulkProduct } from '@/lib/csv'
import { useAppSettings } from '@/hooks/useAppSettings'

// ─── Internal working types ───────────────────────────────────────────────────

interface EditorSlot {
  title: string
  desc: string
  icons: [string, string, string, string]
}

interface EditorProduct {
  sku: string
  productName: string
  slots: EditorSlot[]
  gallerySlots: EditorSlot[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const slotLabel    = (i: number) => `${String.fromCharCode(65 + i)}1`
const galleryLabel = (i: number) => `G${i + 1}`

function makeEmptySlot(): EditorSlot {
  return { title: '', desc: '', icons: ['', '', '', ''] }
}

function makeEmptyProduct(aplusSlots: number, galleryCount: number): EditorProduct {
  return {
    sku: '',
    productName: '',
    slots: Array.from({ length: aplusSlots }, makeEmptySlot),
    gallerySlots: Array.from({ length: galleryCount }, makeEmptySlot),
  }
}

function fromBulkProducts(products: BulkProduct[], aplusSlots: number, galleryCount: number): EditorProduct[] {
  return products.map(p => ({
    sku: p.sku,
    productName: p.productName,
    slots: Array.from({ length: aplusSlots }, (_, j) => ({
      title: p.slots[j]?.title ?? '',
      desc:  p.slots[j]?.desc  ?? '',
      icons: [...(p.slots[j]?.iconCallouts ?? ['', '', '', ''])] as [string, string, string, string],
    })),
    gallerySlots: Array.from({ length: galleryCount }, (_, g) => ({
      title: p.gallerySlots[g]?.title ?? '',
      desc:  p.gallerySlots[g]?.desc  ?? '',
      icons: [...(p.gallerySlots[g]?.iconCallouts ?? ['', '', '', ''])] as [string, string, string, string],
    })),
  }))
}

function editorRowsToBulk(rows: EditorProduct[]): BulkProduct[] {
  return rows.map((r, idx) => ({
    id: `${r.sku || `row-${idx + 1}`}-${idx}`,
    sku: r.sku || `row-${idx + 1}`,
    productName: r.productName,
    photos: [],
    slots:        r.slots.map(s => ({ title: s.title, desc: s.desc, iconCallouts: s.icons })),
    gallerySlots: r.gallerySlots.map(s => ({ title: s.title, desc: s.desc, iconCallouts: s.icons })),
    warnings: [],
  }))
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  initialCsv: string
  aplusSlots: number
  galleryCount: number
  onApply: (csvText: string, result: ParseResult) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CsvEditorModal({ open, onClose, initialCsv, aplusSlots, galleryCount, onApply }: Props) {
  const { settings } = useAppSettings()
  const isDark = settings.theme === 'dark'

  const [mounted,     setMounted]     = useState(false)
  const [closing,     setClosing]     = useState(false)
  const [rows,        setRows]        = useState<EditorProduct[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    if (!open) return
    setClosing(false)
    setMounted(true)
    const result = parseCSV(initialCsv, { requireSku: false })
    if (result.products.length > 0) {
      setRows(fromBulkProducts(result.products, aplusSlots, galleryCount))
      setSelectedIdx(0)
    } else {
      setRows([makeEmptyProduct(aplusSlots, galleryCount)])
      setSelectedIdx(0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleClose() {
    setClosing(true)
    setTimeout(() => { setMounted(false); onClose() }, 300)
  }

  useEffect(() => {
    if (!mounted) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  const updateRow = useCallback((idx: number, patch: Partial<EditorProduct>) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }, [])

  const updateSlot = useCallback((rowIdx: number, j: number, patch: Partial<EditorSlot>) => {
    setRows(prev => prev.map((r, i) =>
      i !== rowIdx ? r : { ...r, slots: r.slots.map((s, k) => k === j ? { ...s, ...patch } : s) }
    ))
  }, [])

  const updateGallery = useCallback((rowIdx: number, g: number, patch: Partial<EditorSlot>) => {
    setRows(prev => prev.map((r, i) =>
      i !== rowIdx ? r : { ...r, gallerySlots: r.gallerySlots.map((s, k) => k === g ? { ...s, ...patch } : s) }
    ))
  }, [])

  const addRow = () => {
    const next = rows.length
    setRows(prev => [...prev, makeEmptyProduct(aplusSlots, galleryCount)])
    setSelectedIdx(next)
  }

  const deleteRow = (idx: number) => {
    if (rows.length <= 1) return
    setRows(prev => prev.filter((_, i) => i !== idx))
    setSelectedIdx(prev => Math.min(prev, rows.length - 2))
  }

  const handleApply = () => {
    const bulk    = editorRowsToBulk(rows)
    const csvText = productsToCSV(bulk, aplusSlots, galleryCount)
    const result  = parseCSV(csvText, { requireSku: false })
    onApply(csvText, result)
    handleClose()
  }

  if (!mounted) return null

  const sel = rows[selectedIdx]

  const panelAnim    = closing ? 'animate-slide-down-full' : 'animate-slide-up-full'
  const backdropAnim = closing ? 'animate-fade-out'        : 'animate-fade-in'

  const headerBg  = isDark ? 'bg-gray-950 border-b border-white/8'  : 'bg-white border-b border-gray-200'
  const panelBg   = isDark ? 'bg-gray-950'                          : 'bg-[#f8f8f8]'
  const titleText = isDark ? 'text-white'                           : 'text-gray-900'
  const dimText   = isDark ? 'text-gray-500'                        : 'text-gray-400'
  const pillBg    = isDark ? 'bg-white/6 text-gray-400'             : 'bg-gray-100 text-gray-500'
  const closeBtn  = isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
  const footerBg  = isDark ? 'bg-gray-950 border-t border-white/8'  : 'bg-white border-t border-gray-200'
  const sidebarBg = isDark ? 'bg-gray-900/60 border-r border-white/8' : 'bg-white border-r border-gray-100'
  const scrollBg  = isDark ? 'bg-gray-900'                          : 'bg-[#f0f0f0]'

  const inputCls = `w-full rounded-[4px] border px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-accent-400/25 focus:border-accent-400 dark:focus:border-accent-600 transition-all ${
    isDark
      ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-600'
      : 'bg-white border-gray-200 text-gray-800 placeholder:text-gray-400'
  }`
  const labelCls     = `block text-[10px] font-semibold mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`
  const sectionHead  = `text-[9px] font-bold uppercase tracking-widest mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`
  const cardCls      = `rounded-[4px] border p-4 ${isDark ? 'border-gray-800 bg-gray-800/30' : 'border-gray-100 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]'}`

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 dark:bg-black/75 backdrop-blur-sm ${backdropAnim}`}
        onClick={handleClose}
      />

      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div
          className={`pointer-events-auto w-full max-w-[1400px] flex flex-col rounded-t-[4px] overflow-hidden shadow-[0_-8px_48px_rgba(0,0,0,0.28)] ${panelBg} ${panelAnim}`}
          style={{ height: 'calc(100vh - 3rem)' }}
          onClick={e => e.stopPropagation()}
        >

          {/* Header */}
          <div className={`shrink-0 flex items-center justify-between px-5 py-0 ${headerBg}`} style={{ height: 44 }}>
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-6 rounded-full bg-accent-600 dark:bg-accent-500 shrink-0" />
              <span className={`font-bold text-[13px] ${titleText}`}>Edit CSV Data</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${pillBg}`}>
                {rows.length} product{rows.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] hidden sm:block ${dimText}`}>Esc to close</span>
              <button
                onClick={handleClose}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${closeBtn}`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body — two panels */}
          <div className="flex-1 min-h-0 flex overflow-hidden">

            {/* Left: product list */}
            <div className={`w-60 shrink-0 flex flex-col ${sidebarBg}`}>
              <div className={`px-3 pt-3 pb-1.5 text-[9px] font-bold uppercase tracking-widest ${dimText}`}>
                Products
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {rows.map((row, idx) => (
                  <div
                    key={idx}
                    className={`group flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${
                      idx === selectedIdx
                        ? 'bg-accent-50 dark:bg-accent-950/50'
                        : isDark ? 'hover:bg-white/4' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedIdx(idx)}
                  >
                    <span className={`shrink-0 w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center leading-none ${
                      idx === selectedIdx
                        ? 'bg-accent-600 text-white'
                        : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[11px] font-medium leading-tight truncate ${
                        idx === selectedIdx
                          ? 'text-accent-700 dark:text-accent-300'
                          : isDark ? 'text-gray-200' : 'text-gray-700'
                      }`}>
                        {row.productName || <span className="opacity-40 italic">Untitled</span>}
                      </div>
                      <div className={`text-[9px] truncate mt-0.5 ${dimText}`}>
                        {row.sku || '—'}
                      </div>
                    </div>
                    {rows.length > 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteRow(idx) }}
                        title="Remove product"
                        className="shrink-0 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className={`shrink-0 p-3 border-t ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
                <button
                  onClick={addRow}
                  className="w-full flex items-center justify-center gap-1.5 h-8 rounded-[4px] text-[11px] font-bold border transition-all bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 border-accent-200 dark:border-accent-800 hover:bg-accent-100 dark:hover:bg-accent-900/40"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Product
                </button>
              </div>
            </div>

            {/* Right: form for selected product */}
            {sel && (
              <div className={`flex-1 min-w-0 overflow-y-auto ${scrollBg}`}>
                <div className="max-w-[680px] mx-auto px-8 py-6 space-y-8">

                  {/* Product Info */}
                  <div>
                    <p className={sectionHead}>Product Info</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>SKU</label>
                        <input
                          type="text"
                          value={sel.sku}
                          onChange={e => updateRow(selectedIdx, { sku: e.target.value })}
                          placeholder="e.g. DH515146"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Product Name</label>
                        <input
                          type="text"
                          value={sel.productName}
                          onChange={e => updateRow(selectedIdx, { productName: e.target.value })}
                          placeholder="Full product name"
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </div>

                  {/* A+ Slots */}
                  {sel.slots.length > 0 && (
                    <div>
                      <p className={sectionHead}>A+ Slots</p>
                      <div className="space-y-3">
                        {sel.slots.map((slot, j) => (
                          <div key={j} className={cardCls}>
                            <div className="flex items-center gap-2 mb-3">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[3px] ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                                {slotLabel(j)}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className={labelCls}>Title</label>
                                <input
                                  type="text"
                                  value={slot.title}
                                  onChange={e => updateSlot(selectedIdx, j, { title: e.target.value })}
                                  placeholder="Slot headline"
                                  className={inputCls}
                                />
                              </div>
                              <div>
                                <label className={labelCls}>Description</label>
                                <input
                                  type="text"
                                  value={slot.desc}
                                  onChange={e => updateSlot(selectedIdx, j, { desc: e.target.value })}
                                  placeholder="Supporting copy"
                                  className={inputCls}
                                />
                              </div>
                            </div>
                            <div>
                              <label className={`${labelCls} flex items-center gap-1`}>
                                Icon Callouts
                                <span className={`font-normal ${dimText}`}>(optional)</span>
                              </label>
                              <div className="grid grid-cols-4 gap-2">
                                {slot.icons.map((ic, k) => (
                                  <input
                                    key={k}
                                    type="text"
                                    value={ic}
                                    onChange={e => {
                                      const icons = [...slot.icons] as [string, string, string, string]
                                      icons[k] = e.target.value
                                      updateSlot(selectedIdx, j, { icons })
                                    }}
                                    placeholder={`Icon ${k + 1}`}
                                    className={inputCls}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gallery Slides */}
                  {sel.gallerySlots.length > 0 && (
                    <div>
                      <p className={sectionHead}>Gallery Slides</p>
                      <div className="space-y-3">
                        {sel.gallerySlots.map((slot, g) => (
                          <div key={g} className={cardCls}>
                            <div className="flex items-center gap-2 mb-3">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[3px] ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                                {galleryLabel(g)}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className={labelCls}>Title</label>
                                <input
                                  type="text"
                                  value={slot.title}
                                  onChange={e => updateGallery(selectedIdx, g, { title: e.target.value })}
                                  placeholder="Slide headline"
                                  className={inputCls}
                                />
                              </div>
                              <div>
                                <label className={labelCls}>Description</label>
                                <input
                                  type="text"
                                  value={slot.desc}
                                  onChange={e => updateGallery(selectedIdx, g, { desc: e.target.value })}
                                  placeholder="Supporting copy"
                                  className={inputCls}
                                />
                              </div>
                            </div>
                            <div>
                              <label className={`${labelCls} flex items-center gap-1`}>
                                Icon Callouts
                                <span className={`font-normal ${dimText}`}>(optional)</span>
                              </label>
                              <div className="grid grid-cols-4 gap-2">
                                {slot.icons.map((ic, k) => (
                                  <input
                                    key={k}
                                    type="text"
                                    value={ic}
                                    onChange={e => {
                                      const icons = [...slot.icons] as [string, string, string, string]
                                      icons[k] = e.target.value
                                      updateGallery(selectedIdx, g, { icons })
                                    }}
                                    placeholder={`Icon ${k + 1}`}
                                    className={inputCls}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className={`shrink-0 flex items-center justify-between px-5 py-3 ${footerBg}`}>
            <span className={`text-[10px] ${dimText}`}>
              Images and rich text edits are preserved for matched products on apply.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClose}
                className={`h-8 px-4 rounded-[4px] text-[12px] font-medium transition-all ${
                  isDark ? 'text-gray-400 hover:text-white hover:bg-white/8' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={rows.length === 0}
                className="h-8 px-5 rounded-[4px] text-[12px] font-bold bg-accent-600 text-white hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Apply Changes
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
