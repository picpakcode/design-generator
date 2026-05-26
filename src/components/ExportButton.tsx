'use client'

import { RefObject, useState } from 'react'
import { exportAsImage } from '@/lib/export'

interface ExportButtonProps {
  canvasRef: RefObject<HTMLDivElement>
  filename: string
}

export default function ExportButton({ canvasRef, filename }: ExportButtonProps) {
  const [loading, setLoading] = useState<'png' | 'jpeg' | null>(null)

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

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => handleExport('png')}
        disabled={loading !== null}
        className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-gray-900 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading === 'png' ? <><Spinner />Exporting…</> : <><DownloadIcon />Export PNG</>}
      </button>

      <button
        onClick={() => handleExport('jpeg')}
        disabled={loading !== null}
        className="w-full h-9 flex items-center justify-center gap-2 rounded-lg border border-gray-200 text-gray-500 text-[11px] font-bold uppercase tracking-widest hover:border-gray-400 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading === 'jpeg' ? <><Spinner dark />Exporting…</> : <><DownloadIcon dark />Export JPG</>}
      </button>
    </div>
  )
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <svg
      className={`animate-spin h-4 w-4 ${dark ? 'text-gray-600' : 'text-white'}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function DownloadIcon({ dark: _ = false }: { dark?: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}
