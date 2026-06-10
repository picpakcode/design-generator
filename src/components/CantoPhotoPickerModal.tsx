'use client'

import React, { useEffect, useRef, useState } from 'react'

export interface PhotoPick {
  id: string
  name: string
  previewUrl: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (pick: PhotoPick) => void
  initialQuery?: string
}

const PAGE_SIZE = 40

export default function CantoPhotoPickerModal({ open, onClose, onSelect, initialQuery = '' }: Props) {
  const [query, setQuery]           = useState(initialQuery)
  const [allResults, setAllResults] = useState<PhotoPick[]>([])
  const [loading, setLoading]       = useState(false)
  const [searched, setSearched]     = useState(false)
  const [page, setPage]             = useState(0)
  const inputRef  = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const totalPages  = Math.ceil(allResults.length / PAGE_SIZE)
  const pageResults = allResults.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => {
    if (!open) return
    setAllResults([])
    setSearched(false)
    setPage(0)
    const q = initialQuery.trim()
    setQuery(q)
    setTimeout(() => {
      if (q) runSearch(q)
      else inputRef.current?.focus()
    }, 80)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && document.activeElement === inputRef.current) runSearch(query)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, query])

  function runSearch(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setLoading(true)
    setAllResults([])
    setSearched(true)
    setPage(0)
    const params = new URLSearchParams({ name: trimmed, sku: trimmed, limit: '200' })
    fetch(`/api/canto/photos?${params}`)
      .then(r => r.json())
      .then(data => setAllResults(Array.isArray(data) ? data : []))
      .catch(() => setAllResults([]))
      .finally(() => setLoading(false))
  }

  function goToPage(p: number) {
    setPage(p)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-3xl bg-white dark:bg-gray-900 rounded-[4px] shadow-[0_8px_48px_rgba(0,0,0,0.22)] border border-gray-200 dark:border-gray-700/80 flex flex-col overflow-hidden animate-scale-in"
          style={{ maxHeight: '88vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 pt-4 pb-3.5 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 rounded-full bg-accent-600 dark:bg-accent-500 shrink-0" />
              <div>
                <h2 className="text-[13px] font-bold text-gray-900 dark:text-white leading-none">Product Photos</h2>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  {searched && !loading && allResults.length > 0
                    ? `${allResults.length} photo${allResults.length !== 1 ? 's' : ''} · lifestyle images first`
                    : 'Search Canto for lifestyle & product imagery'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search bar */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50/60 dark:bg-gray-900/60">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by SKU, product name, or keyword…"
                  className="w-full pl-9 pr-8 py-2 text-[13px] border border-gray-200 dark:border-gray-700 rounded-[4px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-400/25 focus:border-accent-400 dark:focus:border-accent-600 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
                />
                {query && (
                  <button
                    onClick={() => { setQuery(''); setAllResults([]); setSearched(false); setPage(0); inputRef.current?.focus() }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                onClick={() => runSearch(query)}
                disabled={!query.trim() || loading}
                className="shrink-0 px-4 h-[36px] text-[11px] font-bold uppercase tracking-widest rounded-[4px] bg-accent-600 hover:bg-accent-700 dark:bg-accent-700 dark:hover:bg-accent-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Searching…' : 'Search'}
              </button>
            </div>
          </div>

          {/* Results */}
          <div ref={scrollRef} className="overflow-y-auto flex-1 p-4">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <svg className="animate-spin h-5 w-5 text-accent-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : !searched ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="text-[12px] text-gray-400 dark:text-gray-500">Enter a SKU or product name to search</p>
              </div>
            ) : allResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <p className="text-[13px] font-semibold text-gray-500">No photos found</p>
                <p className="text-[11px] text-gray-400">Try a different search term or SKU</p>
              </div>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))' }}>
                {pageResults.map(photo => (
                  <button
                    key={photo.id}
                    onClick={() => { onSelect(photo); onClose() }}
                    className="group flex flex-col rounded-[4px] overflow-hidden border border-gray-100 dark:border-gray-800 hover:border-accent-300 dark:hover:border-accent-700 bg-gray-50 dark:bg-gray-800/40 hover:bg-white dark:hover:bg-gray-800 hover:shadow-md transition-all text-left"
                    title={photo.name}
                  >
                    <div className="w-full bg-gray-100 dark:bg-gray-800 overflow-hidden" style={{ height: 108 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.previewUrl}
                        alt={photo.name}
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-200"
                      />
                    </div>
                    <div className="px-2.5 py-1.5 border-t border-gray-100 dark:border-gray-800 group-hover:border-accent-100 dark:group-hover:border-accent-900/40 transition-colors">
                      <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 leading-tight transition-colors"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {photo.name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pagination footer */}
          {searched && !loading && totalPages > 1 && (
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 shrink-0 flex items-center justify-between gap-4 bg-gray-50/60 dark:bg-gray-900/40">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 0}
                className="flex items-center gap-1.5 px-3 h-7 rounded-[4px] border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:border-accent-300 hover:text-accent-600 dark:hover:border-accent-700 dark:hover:text-accent-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Prev
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => goToPage(i)}
                    className={`w-6 h-6 rounded-[4px] text-[11px] font-semibold transition-all ${
                      i === page
                        ? 'bg-accent-600 dark:bg-accent-700 text-white'
                        : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={() => goToPage(page + 1)}
                disabled={page === totalPages - 1}
                className="flex items-center gap-1.5 px-3 h-7 rounded-[4px] border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:border-accent-300 hover:text-accent-600 dark:hover:border-accent-700 dark:hover:text-accent-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Next
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* Simple footer — single page */}
          {searched && !loading && allResults.length > 0 && totalPages <= 1 && (
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50/60 dark:bg-gray-900/40">
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {allResults.length} photo{allResults.length !== 1 ? 's' : ''} · lifestyle images shown first
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
