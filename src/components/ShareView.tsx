'use client'

import React, { useEffect, useRef, useState } from 'react'
import { DesignState } from '@/types'
import { getTemplate, getGalleryTemplate } from '@/lib/templates'
import { CanvasContent, CanvasContentIcons } from './CanvasRenderers'
import { usePresence, Peer, presenceColor } from '@/hooks/usePresence'

const DESKTOP_W = 1464
const MOBILE_W  = 600

interface ShareData {
  projectId: string
  accessLevel: 'view' | 'edit'
  projectName: string
  ownerEmail: string | null
  state: DesignState
  updatedAt: string
}

function PeerAvatars({ peers }: { peers: Peer[] }) {
  if (peers.length === 0) return null
  const visible = peers.slice(0, 5)
  const overflow = peers.length - 5
  return (
    <div className="flex items-center gap-1">
      {visible.map(p => (
        <div
          key={p.userId}
          title={p.email}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white shadow-sm"
          style={{ backgroundColor: p.color }}
        >
          {p.email[0]?.toUpperCase() ?? '?'}
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-gray-700 text-[9px] font-bold ring-2 ring-white">
          +{overflow}
        </div>
      )}
    </div>
  )
}

export default function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<ShareData | null>(null)
  const [design, setDesign] = useState<DesignState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const desktopRef = useRef<HTMLDivElement>(null)
  const mobileRef  = useRef<HTMLDivElement>(null)
  const [desktopScale, setDesktopScale] = useState(0.5)
  const [mobileScale,  setMobileScale]  = useState(0.5)

  // Use a stable anon userId stored in sessionStorage
  const [anonId] = useState(() => {
    if (typeof window === 'undefined') return 'anon'
    const key = 'dg:anon-id'
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const id = 'anon-' + Math.random().toString(36).slice(2, 10)
    sessionStorage.setItem(key, id)
    return id
  })

  const { peers } = usePresence({
    projectId: data?.projectId,
    userId: anonId,
    email: 'Viewer',
    activeBlockId: null,
    onStateUpdate: (state) => setDesign(state),
  })

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: ShareData) => { setData(d); setDesign(d.state) })
      .catch(() => setError('This share link is invalid or has been revoked.'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    const measure = () => {
      if (desktopRef.current) setDesktopScale(desktopRef.current.clientWidth / DESKTOP_W)
      if (mobileRef.current)  setMobileScale(mobileRef.current.clientWidth  / MOBILE_W)
    }
    const t = setTimeout(measure, 30)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [design])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <svg className="animate-spin w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (error || !data || !design) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
        <p className="text-sm text-gray-500">{error ?? 'Something went wrong.'}</p>
      </div>
    )
  }

  const blocks = design.blocks ?? []
  const isGallery = design.activeCategory === 'gallery'

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">

      {/* Header */}
      <header className="shrink-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3 shadow-sm z-10">
        <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{data.projectName}</p>
          {data.ownerEmail && (
            <p className="text-[10px] text-gray-400">Shared by {data.ownerEmail}</p>
          )}
        </div>

        {/* Presence */}
        <div className="flex items-center gap-3">
          <PeerAvatars peers={peers} />
          {peers.length > 0 && (
            <span className="text-[10px] text-gray-400">{peers.length} viewing</span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            data.accessLevel === 'edit'
              ? 'bg-indigo-50 text-indigo-600'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {data.accessLevel === 'edit' ? 'Can edit' : 'View only'}
          </span>
        </div>
      </header>

      {/* Two-column body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Desktop column (70%) */}
        <div className="flex flex-col border-r border-gray-100" style={{ flex: '70 1 0%' }}>
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <rect x="2" y="4" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 20h8M12 18v2" />
            </svg>
            <span className="text-[11px] font-semibold text-gray-500">Desktop</span>
            <span className="text-[10px] text-gray-400">1464 × 600 px</span>
          </div>
          <div className="flex-1 overflow-y-auto bg-white">
            <div className="px-4 pt-4 pb-6">
              <div ref={desktopRef}>
                {isGallery ? (
                  <GalleryBlock design={design} scale={desktopScale} format="desktop" />
                ) : (
                  blocks.map(block => (
                    <AplusBlock key={block.id} block={block} design={design} scale={desktopScale} format="desktop" />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile column (30%) */}
        <div className="flex flex-col" style={{ flex: '30 1 0%' }}>
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
            <svg className="w-3 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
            </svg>
            <span className="text-[11px] font-semibold text-gray-500">Mobile</span>
            <span className="text-[10px] text-gray-400">600 × 450 px</span>
          </div>
          <div className="flex-1 overflow-y-auto bg-white">
            <div className="px-3 pt-4 pb-6">
              <div ref={mobileRef}>
                {isGallery ? (
                  <GalleryBlock design={design} scale={mobileScale} format="mobile" />
                ) : (
                  blocks.map(block => (
                    <AplusBlock key={block.id} block={block} design={design} scale={mobileScale} format="mobile" />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AplusBlock({ block, design, scale, format }: {
  block: DesignState['blocks'][0]
  design: DesignState
  scale: number
  format: 'desktop' | 'mobile'
}) {
  const tpl = getTemplate(block.templateId, format)
  const renderDesign: DesignState = {
    ...design,
    assets: block.assets ?? [],
    activeTemplate: block.templateId,
    activeFormat: format,
    title: block.title,
    subtitleHtml: block.subtitleHtml,
    iconCount: block.iconCount as 2 | 3 | 4,
    iconLabels: block.iconLabels,
    desktop: { ...design.desktop, layoutFlipped: block.layoutFlipped },
    mobile:  { ...design.mobile,  layoutFlipped: block.layoutFlipped },
  }
  const settings = format === 'desktop' ? renderDesign.desktop : renderDesign.mobile
  return (
    <div style={{ width: '100%', height: tpl.height * scale, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: tpl.width, height: tpl.height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
        <div style={{ width: tpl.width, height: tpl.height, position: 'relative' }}>
          {block.templateId === 'aplus-icons'
            ? <CanvasContentIcons design={renderDesign} settings={settings} />
            : <CanvasContent      design={renderDesign} settings={settings} />
          }
        </div>
      </div>
    </div>
  )
}

function GalleryBlock({ design, scale, format }: { design: DesignState; scale: number; format: 'desktop' | 'mobile' }) {
  const tpl = getGalleryTemplate(design.activeGalleryTemplate)
  return (
    <div style={{ width: '100%', height: tpl.height * scale, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: tpl.width, height: tpl.height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
        <div style={{ width: tpl.width, height: tpl.height, position: 'relative' }}>
          <CanvasContent design={design} settings={design.gallery} />
        </div>
      </div>
    </div>
  )
}
