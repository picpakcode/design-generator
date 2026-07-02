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
  scheme?:  string   // 'folder' | 'album' — only albums accept uploads
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
    <div
      className="flex flex-wrap gap-1 p-2 min-h-[34px] rounded-none border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus-within:ring-1 focus-within:ring-gray-400 dark:focus-within:ring-gray-500 cursor-text"
      onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
    >
      {chips.map(chip => (
        <span key={chip} className="flex items-center gap-0.5 h-5 pl-2 pr-1 bg-gray-100 dark:bg-gray-700 rounded-none text-[11px] text-gray-700 dark:text-gray-300 shrink-0">
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
  const hasScheme = albums.some(a => a.scheme)
  const uploadable = hasScheme ? albums.filter(a => a.scheme === 'album') : albums
  const filtered = search
    ? uploadable.filter(a => a.namePath.toLowerCase().includes(search.toLowerCase()))
    : uploadable

  const getLastSegment = (p: string) => p.split('/').pop() ?? p
  const getParentPath  = (p: string) => { const parts = p.split('/'); return parts.length > 1 ? parts.slice(0, -1).join(' / ') : '' }

  return (
    <div className="rounded-none border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Search row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/40">
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search albums…"
          className="flex-1 text-[12px] bg-transparent outline-none text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-[14px] leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-0.5"
          >×</button>
        ) : (
          <span className="text-[10px] text-gray-400 tabular-nums">{uploadable.length}</span>
        )}
      </div>

      {/* Album list */}
      <div className="max-h-48 overflow-y-auto bg-white dark:bg-gray-900">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-gray-400">
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading albums…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-gray-400">No albums found</div>
        ) : filtered.map(a => {
          const name   = getLastSegment(a.namePath)
          const parent = getParentPath(a.namePath)
          const isSel  = selected?.id === a.id
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                isSel ? 'bg-accent-50 dark:bg-accent-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
              }`}
            >
              <svg className={`w-3.5 h-3.5 shrink-0 mt-px ${isSel ? 'text-accent-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              <span className="flex-1 min-w-0">
                <span className={`block text-[12px] truncate ${isSel ? 'font-semibold text-accent-700 dark:text-accent-300' : 'text-gray-800 dark:text-gray-200'}`}>
                  {name}
                </span>
                {parent && (
                  <span className="block text-[10px] text-gray-400 dark:text-gray-600 truncate mt-px">{parent}</span>
                )}
              </span>
              {isSel && (
                <svg className="w-3.5 h-3.5 text-accent-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Progress row ─────────────────────────────────────────────────────────────

function FileRow({ filename, state }: { filename: string; state: 'pending' | 'uploading' | 'ok' | 'error'; error?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[11px]">
      <span className="shrink-0 w-4 flex items-center justify-center">
        {state === 'pending'   && <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />}
        {state === 'uploading' && <svg className="animate-spin w-3.5 h-3.5 text-[#F5A623]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
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
  const [metaOpen,      setMetaOpen]      = useState(false)

  // Upload progress
  const [phase,    setPhase]    = useState<Phase>('configure')
  const [fileRows, setFileRows] = useState<Array<{ filename: string; state: 'pending' | 'uploading' | 'ok' | 'error'; error?: string }>>([])
  const [results,  setResults]  = useState<FileResult[]>([])
  const abortRef = useRef(false)

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); setPhase('configure'); setMetaOpen(false) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'uploading') handleClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, phase]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setTimeout(() => { setMounted(false); setClosing(false); onClose() }, 180)
  }

  const runUpload = useCallback(async (filesToUpload: CantoExportFile[]) => {
    if (!selectedAlbum) return
    abortRef.current = false
    setPhase('uploading')

    const rows = filesToUpload.map(f => ({ filename: f.filename, state: 'pending' as const }))
    setFileRows(rows)

    const out: FileResult[] = []

    for (let i = 0; i < filesToUpload.length; i++) {
      if (abortRef.current) break
      const { filename, dataUrl } = filesToUpload[i]
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
  }, [selectedAlbum, tags, keywords, description])

  const handleUpload = useCallback(() => runUpload(files), [runUpload, files])

  const handleRetry = useCallback(() => {
    const failedNames = new Set(results.filter(r => !r.ok).map(r => r.filename))
    const failedFiles = files.filter(f => failedNames.has(f.filename))
    if (failedFiles.length === 0) return
    runUpload(failedFiles)
  }, [results, files, runUpload])

  if (!mounted) return null

  const succeeded = results.filter(r => r.ok).length
  const failed    = results.filter(r => !r.ok).length
  const done      = fileRows.filter(r => r.state === 'ok' || r.state === 'error').length
  const pct       = files.length > 0 ? Math.round((done / files.length) * 100) : 0

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-180 ${closing ? 'opacity-0' : 'opacity-100'}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-180 ${closing ? 'opacity-0' : 'animate-fade-in'}`}
        onClick={phase !== 'uploading' ? handleClose : undefined}
      />

      {/* Panel — 4px radius, scale-in on open, scale-out on close */}
      <div className={`relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-none shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden transition-all duration-180 ${closing ? 'scale-95 opacity-0' : 'animate-scale-in'}`}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 shrink-0">
          <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#F5A623" />
            <path d="M16 8.4A5.6 5.6 0 1 0 16 15.6" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Save to Canto</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{files.length} file{files.length !== 1 ? 's' : ''}</p>
          </div>
          {phase !== 'uploading' && (
            <button
              onClick={handleClose}
              className="w-7 h-7 flex items-center justify-center rounded-none text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="h-px bg-gray-100 dark:bg-gray-800 shrink-0" />

        {/* Body — keyed on phase so each transition slides in fresh */}
        <div key={phase} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 animate-slide-in-up">

          {/* ── Configure ──────────────────────────────────────────────── */}
          {phase === 'configure' && (
            <>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Destination album
                </label>
                <AlbumPicker
                  albums={albums}
                  loading={albumsLoading}
                  selected={selectedAlbum}
                  onSelect={setSelectedAlbum}
                />
              </div>

              {/* Optional metadata accordion */}
              <div>
                <button
                  type="button"
                  onClick={() => setMetaOpen(p => !p)}
                  className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <svg
                    className={`w-2.5 h-2.5 transition-transform duration-200 ${metaOpen ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Optional metadata
                </button>

                {/* CSS grid accordion — animates height without hardcoded max values */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateRows: metaOpen ? '1fr' : '0fr',
                    transition: 'grid-template-rows 240ms cubic-bezier(0.16,1,0.3,1)',
                  }}
                >
                  <div className="overflow-hidden">
                    <div className="pt-3 space-y-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Tags</label>
                        <ChipInput chips={tags} placeholder="Type and press Enter…" onAdd={v => setTags(p => [...p, v])} onRemove={v => setTags(p => p.filter(x => x !== v))} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Keywords</label>
                        <ChipInput chips={keywords} placeholder="Type and press Enter…" onAdd={v => setKeywords(p => [...p, v])} onRemove={v => setKeywords(p => p.filter(x => x !== v))} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Description</label>
                        <textarea
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                          placeholder="Optional description applied to all files…"
                          rows={2}
                          className="w-full px-3 py-2 text-[12px] rounded-none border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder:text-gray-300 dark:placeholder:text-gray-600 resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Uploading ──────────────────────────────────────────────── */}
          {phase === 'uploading' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">
                  <span>Uploading to <span className="font-semibold text-gray-600 dark:text-gray-300">{selectedAlbum?.name}</span>…</span>
                  <span className="tabular-nums font-semibold">{done} / {files.length}</span>
                </div>
                <div className="h-1 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#F5A623] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto space-y-0.5">
                {fileRows.map(r => (
                  <FileRow key={r.filename} filename={r.filename} state={r.state} error={r.error} />
                ))}
              </div>
            </div>
          )}

          {/* ── Done ───────────────────────────────────────────────────── */}
          {phase === 'done' && (
            <div className="py-2 flex flex-col items-center gap-4">
              {/* Icon */}
              <div className={`w-14 h-14 rounded-full flex items-center justify-center animate-bounce-once ${
                failed === 0 ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-amber-50 dark:bg-amber-900/30'
              }`}>
                {failed === 0 ? (
                  <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374L10.052 3.378c.866-1.5 3.032-1.5 3.898 0l7.303 12.748zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                )}
              </div>

              {/* Summary */}
              <div className="text-center">
                {failed === 0 ? (
                  <>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {succeeded} file{succeeded !== 1 ? 's' : ''} uploaded
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                      {selectedAlbum?.namePath}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {succeeded} of {files.length} uploaded
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                      {failed} failed · {selectedAlbum?.namePath}
                    </p>
                  </>
                )}
              </div>

              {/* Error list */}
              {failed > 0 && (
                <div className="w-full max-h-40 overflow-y-auto rounded-none border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-3 space-y-2">
                  {results.filter(r => !r.ok).map(r => (
                    <div key={r.filename} className="text-[11px]">
                      <p className="font-semibold text-red-600 dark:text-red-400 truncate">{r.filename}</p>
                      {r.error && <p className="text-red-400 dark:text-red-500 break-words mt-0.5">{r.error}</p>}
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
                className="h-8 px-4 rounded-none text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              >Cancel</button>
              <button
                onClick={handleUpload}
                disabled={!selectedAlbum || files.length === 0}
                className="h-8 px-4 rounded-none text-[11px] font-bold uppercase tracking-widest bg-[#F5A623] text-white hover:bg-[#E09510] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload {files.length}
              </button>
            </>
          )}
          {phase === 'uploading' && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest">Please wait…</span>
          )}
          {phase === 'done' && (
            <>
              {failed > 0 && (
                <button
                  onClick={handleRetry}
                  className="h-8 px-4 rounded-none text-[11px] font-bold uppercase tracking-widest border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                >Retry {failed} failed</button>
              )}
              <button
                onClick={handleClose}
                className="h-8 px-5 rounded-none text-[11px] font-bold uppercase tracking-widest bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
              >Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
