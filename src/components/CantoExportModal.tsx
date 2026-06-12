'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CantoExportFile {
  filename: string
  dataUrl:  string
}

interface Album {
  id:       string
  name:     string
  namePath: string
}

type Phase = 'configure' | 'uploading' | 'done'

interface FileResult {
  filename: string
  ok:       boolean
  error?:   string
}

// ─── Chip input ───────────────────────────────────────────────────────────────

function ChipInput({
  chips, placeholder, onAdd, onRemove,
}: {
  chips: string[]
  placeholder: string
  onAdd:    (v: string) => void
  onRemove: (v: string) => void
}) {
  const [val, setVal] = useState('')

  function commit() {
    const t = val.trim().replace(/,+$/, '')
    if (t && !chips.includes(t)) onAdd(t)
    setVal('')
  }

  return (
    <div className="flex flex-wrap gap-1 p-2 min-h-[38px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus-within:ring-1 focus-within:ring-gray-400 dark:focus-within:ring-gray-500 cursor-text"
      onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
    >
      {chips.map(chip => (
        <span key={chip} className="flex items-center gap-0.5 h-5 pl-2 pr-1 bg-gray-100 dark:bg-gray-700 rounded text-[11px] text-gray-700 dark:text-gray-300 shrink-0">
          {chip}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onRemove(chip) }}
            className="ml-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 leading-none"
          >×</button>
        </span>
      ))}
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
          if (e.key === 'Backspace' && !val && chips.length) onRemove(chips[chips.length - 1])
        }}
        onBlur={commit}
        placeholder={chips.length ? '' : placeholder}
        className="flex-1 min-w-[80px] text-[12px] outline-none bg-transparent text-gray-800 dark:text-gray-200 placeholder:text-gray-300 dark:placeholder:text-gray-600"
      />
    </div>
  )
}

// ─── Album picker ─────────────────────────────────────────────────────────────

function AlbumPicker({
  albums, loading, selected, onSelect,
}: {
  albums:   Album[]
  loading:  boolean
  selected: Album | null
  onSelect: (a: Album) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = search
    ? albums.filter(a => a.namePath.toLowerCase().includes(search.toLowerCase()))
    : albums

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search albums…"
          className="w-full h-8 pl-8 pr-3 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
      </div>
      <div className="h-44 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {loading ? (
          <div className="h-full flex items-center justify-center text-[11px] text-gray-400">
            <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading albums…
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[11px] text-gray-400">No albums found</div>
        ) : (
          filtered.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a)}
              className={`w-full text-left px-3 py-2 text-[11px] transition-colors ${
                selected?.id === a.id
                  ? 'bg-accent-50 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className="truncate block">{a.namePath}</span>
            </button>
          ))
        )}
      </div>
      {selected && (
        <p className="text-[10px] text-accent-600 dark:text-accent-400 flex items-center gap-1">
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {selected.namePath}
        </p>
      )}
    </div>
  )
}

// ─── Progress row ─────────────────────────────────────────────────────────────

function FileRow({ filename, state }: { filename: string; state: 'pending' | 'uploading' | 'ok' | 'error'; error?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[11px]">
      <span className="shrink-0 w-4 flex items-center justify-center">
        {state === 'pending'   && <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />}
        {state === 'uploading' && <svg className="animate-spin w-3.5 h-3.5 text-accent-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
        {state === 'ok'        && <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        {state === 'error'     && <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
      </span>
      <span className={`truncate ${state === 'uploading' ? 'text-gray-800 dark:text-gray-200 font-medium' : state === 'error' ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
        {filename}
      </span>
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  open:    boolean
  onClose: () => void
  files:   CantoExportFile[]
}

export default function CantoExportModal({ open, onClose, files }: Props) {
  const [mounted,  setMounted]  = useState(false)
  const [closing,  setClosing]  = useState(false)

  // Config
  const [albums,        setAlbums]        = useState<Album[]>([])
  const [albumsLoading, setAlbumsLoading] = useState(false)
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)
  const [tags,          setTags]          = useState<string[]>([])
  const [keywords,      setKeywords]      = useState<string[]>([])
  const [description,   setDescription]   = useState('')

  // Upload progress
  const [phase,    setPhase]    = useState<Phase>('configure')
  const [fileRows, setFileRows] = useState<Array<{ filename: string; state: 'pending' | 'uploading' | 'ok' | 'error'; error?: string }>>([])
  const [results,  setResults]  = useState<FileResult[]>([])
  const abortRef = useRef(false)

  // Mount / unmount animation
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); setPhase('configure') }
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'uploading') handleClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load albums once on open
  useEffect(() => {
    if (!open) return
    setAlbumsLoading(true)
    fetch('/api/canto/albums')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: Album[]) => setAlbums(data))
      .catch(console.error)
      .finally(() => setAlbumsLoading(false))
  }, [open])

  function handleClose() {
    setClosing(true)
    setTimeout(() => { setMounted(false); setClosing(false); onClose() }, 200)
  }

  const handleUpload = useCallback(async () => {
    if (!selectedAlbum) return
    abortRef.current = false
    setPhase('uploading')

    const rows = files.map(f => ({ filename: f.filename, state: 'pending' as const }))
    setFileRows(rows)

    const out: FileResult[] = []

    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) break
      const { filename, dataUrl } = files[i]

      setFileRows(prev => prev.map((r, idx) => idx === i ? { ...r, state: 'uploading' } : r))

      try {
        const res = await fetch('/api/canto/upload', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            dataUrl,
            filename,
            albumId:     selectedAlbum.id,
            tags:        tags.length ? tags : undefined,
            keywords:    keywords.length ? keywords : undefined,
            description: description || undefined,
          }),
        })
        if (res.ok) {
          out.push({ filename, ok: true })
          setFileRows(prev => prev.map((r, idx) => idx === i ? { ...r, state: 'ok' } : r))
        } else {
          const d = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          out.push({ filename, ok: false, error: d.error ?? `HTTP ${res.status}` })
          setFileRows(prev => prev.map((r, idx) => idx === i ? { ...r, state: 'error', error: d.error } : r))
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        out.push({ filename, ok: false, error: msg })
        setFileRows(prev => prev.map((r, idx) => idx === i ? { ...r, state: 'error', error: msg } : r))
      }
    }

    setResults(out)
    setPhase('done')
  }, [files, selectedAlbum, tags, keywords, description])

  if (!mounted) return null

  const succeeded = results.filter(r => r.ok).length
  const failed    = results.filter(r => !r.ok).length
  const uploading = phase === 'uploading'
  const done      = fileRows.filter(r => r.state === 'ok' || r.state === 'error').length
  const pct       = files.length > 0 ? Math.round((done / files.length) * 100) : 0

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
        onClick={phase !== 'uploading' ? handleClose : undefined}
      />

      {/* Panel */}
      <div className={`relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden transition-all duration-200 ${closing ? 'scale-95' : 'scale-100'}`}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          {/* Canto icon */}
          <div className="w-7 h-7 rounded-lg bg-[#F5A623] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" opacity=".15" />
              <path d="M12 4a8 8 0 100 16A8 8 0 0012 4zm0 14a6 6 0 110-12 6 6 0 010 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Save to Canto</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{files.length} file{files.length !== 1 ? 's' : ''}</p>
          </div>
          {phase !== 'uploading' && (
            <button
              onClick={handleClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── Configure phase ────────────────────────────────────────── */}
          {phase === 'configure' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  Destination Album <span className="text-red-400">*</span>
                </label>
                <AlbumPicker
                  albums={albums}
                  loading={albumsLoading}
                  selected={selectedAlbum}
                  onSelect={setSelectedAlbum}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Tags</label>
                <ChipInput chips={tags} placeholder="Type and press Enter…" onAdd={v => setTags(p => [...p, v])} onRemove={v => setTags(p => p.filter(x => x !== v))} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Keywords</label>
                <ChipInput chips={keywords} placeholder="Type and press Enter…" onAdd={v => setKeywords(p => [...p, v])} onRemove={v => setKeywords(p => p.filter(x => x !== v))} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description applied to all files…"
                  rows={2}
                  className="w-full px-3 py-2 text-[12px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder:text-gray-300 dark:placeholder:text-gray-600 resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              {/* File list preview */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  Files ({files.length})
                </label>
                <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 max-h-28 overflow-y-auto">
                  {files.slice(0, 6).map(f => (
                    <p key={f.filename} className="text-[11px] text-gray-500 dark:text-gray-400 truncate py-0.5">{f.filename}</p>
                  ))}
                  {files.length > 6 && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 pt-0.5">+{files.length - 6} more…</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Uploading phase ────────────────────────────────────────── */}
          {phase === 'uploading' && (
            <div className="space-y-3">
              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
                  <span>Uploading to <span className="font-medium text-gray-700 dark:text-gray-300">{selectedAlbum?.name}</span>…</span>
                  <span className="font-semibold tabular-nums">{done} / {files.length}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent-500 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              {/* File rows */}
              <div className="max-h-52 overflow-y-auto space-y-0.5">
                {fileRows.map(r => (
                  <FileRow key={r.filename} filename={r.filename} state={r.state} error={r.error} />
                ))}
              </div>
            </div>
          )}

          {/* ── Done phase ─────────────────────────────────────────────── */}
          {phase === 'done' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${failed === 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                {failed === 0 ? (
                  <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                )}
                <div>
                  {failed === 0 ? (
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      {succeeded} file{succeeded !== 1 ? 's' : ''} uploaded successfully
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                      {succeeded} uploaded, {failed} failed
                    </p>
                  )}
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    → {selectedAlbum?.namePath}
                  </p>
                </div>
              </div>

              {/* Error details */}
              {failed > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {results.filter(r => !r.ok).map(r => (
                    <div key={r.filename} className="text-[11px]">
                      <p className="font-medium text-red-500 truncate">{r.filename}</p>
                      {r.error && <p className="text-red-400 break-words">{r.error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
          {phase === 'configure' && (
            <>
              <button
                onClick={handleClose}
                className="h-8 px-4 rounded-lg text-[12px] font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >Cancel</button>
              <button
                onClick={handleUpload}
                disabled={!selectedAlbum || files.length === 0}
                className="h-8 px-4 rounded-lg text-[12px] font-bold bg-[#F5A623] text-white hover:bg-[#E09510] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload {files.length} file{files.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
          {phase === 'uploading' && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">Please wait…</span>
          )}
          {phase === 'done' && (
            <button
              onClick={handleClose}
              className="h-8 px-5 rounded-lg text-[12px] font-bold bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
            >Done</button>
          )}
        </div>
      </div>
    </div>
  )
}
