'use client'

import { RefObject, useState } from 'react'
import { exportAsImage, copyToClipboard, exportAllAsZip } from '@/lib/export'

type Loading = 'copy' | 'png' | 'jpeg' | 'all' | null

interface ExportButtonProps {
  canvasRef: RefObject<HTMLDivElement>
  filename: string
  altCanvasRef?: RefObject<HTMLDivElement>
  altFilename?: string
}

export default function ExportButton({ canvasRef, filename, altCanvasRef, altFilename }: ExportButtonProps) {
  const [loading, setLoading] = useState<Loading>(null)
  const [copied, setCopied] = useState(false)

  const handleExport = async (format: 'png' | 'jpeg') => {
    if (!canvasRef.current) return
    setLoading(format)
    try {
      await exportAsImage(canvasRef.current, filename, format)
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const handleCopy = async () => {
    if (!canvasRef.current) return
    setLoading('copy')
    try {
      await copyToClipboard(canvasRef.current)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
      alert('Copy failed. Your browser may not support clipboard image access.')
    } finally {
      setLoading(null)
    }
  }

  const handleExportAll = async () => {
    if (!canvasRef.current || !altCanvasRef?.current || !altFilename) return
    setLoading('all')
    try {
      await exportAllAsZip(
        [
          { el: canvasRef.current,    filename,    format: 'png' },
          { el: altCanvasRef.current, filename: altFilename, format: 'png' },
        ],
        'amazon-export'
      )
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const busy = loading !== null

  return (
    <div className="flex flex-col gap-1.5">

      {/* Copy to clipboard */}
      <button
        onClick={handleCopy}
        disabled={busy}
        className="w-full h-9 flex items-center justify-center gap-2 rounded-none border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-[11px] font-bold uppercase tracking-widest hover:border-gray-400 dark:hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {loading === 'copy' ? <><Spinner /><span>Copying…</span></> :
         copied            ? <><CheckIcon /><span>Copied!</span></> :
                             <><ClipboardIcon /><span>Copy PNG</span></>}
      </button>

      {/* Divider */}
      <div className="h-px bg-gray-100 dark:bg-gray-700 my-0.5" />

      {/* Export PNG */}
      <button
        onClick={() => handleExport('png')}
        disabled={busy}
        className="w-full h-9 flex items-center justify-center gap-2 rounded-none bg-gray-900 dark:bg-gray-700 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading === 'png' ? <><Spinner /><span>Exporting…</span></> : <><DownloadIcon /><span>Export PNG</span></>}
      </button>

      {/* Export JPG */}
      <button
        onClick={() => handleExport('jpeg')}
        disabled={busy}
        className="w-full h-9 flex items-center justify-center gap-2 rounded-none border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-[11px] font-bold uppercase tracking-widest hover:border-gray-400 dark:hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading === 'jpeg' ? <><Spinner /><span>Exporting…</span></> : <><DownloadIcon /><span>Export JPG</span></>}
      </button>

      {/* Export All Formats — only shown for A+ (desktop + mobile) */}
      {altCanvasRef && (
        <button
          onClick={handleExportAll}
          disabled={busy}
          className="w-full h-9 flex items-center justify-center gap-2 rounded-none border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 text-[11px] font-bold uppercase tracking-widest hover:border-gray-500 dark:hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading === 'all' ? <><Spinner /><span>Zipping…</span></> : <><ZipIcon /><span>All Formats (.zip)</span></>}
        </button>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ZipIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  )
}
