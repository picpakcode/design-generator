'use client'

import React, { useEffect, useRef, useState } from 'react'
import { DesignState } from '@/types'
import { getTemplate } from '@/lib/templates'
import { CanvasContent, CanvasContentIcons } from './CanvasRenderers'

const DESKTOP_W = 1464
const MOBILE_W  = 600

interface Props {
  open: boolean
  onClose: () => void
  design: DesignState
}

export default function PreviewModal({ open, onClose, design }: Props) {
  const desktopColRef = useRef<HTMLDivElement>(null)
  const mobileColRef  = useRef<HTMLDivElement>(null)
  const [desktopScale, setDesktopScale] = useState(0.5)
  const [mobileScale,  setMobileScale]  = useState(0.5)

  // Measure column widths and recompute scale on open + resize
  useEffect(() => {
    if (!open) return
    const measure = () => {
      if (desktopColRef.current) setDesktopScale(desktopColRef.current.clientWidth / DESKTOP_W)
      if (mobileColRef.current)  setMobileScale(mobileColRef.current.clientWidth  / MOBILE_W)
    }
    const t = setTimeout(measure, 30)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const blocks = design.blocks ?? []

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      {/* Modal panel */}
      <div className="fixed inset-3 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-gray-950">

        {/* ── Header bar ── */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-white/10">
          <div className="flex items-center gap-3">
            {/* Eye icon */}
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="text-white font-bold text-sm tracking-tight">Amazon A+ Preview</span>
            <span className="text-gray-500 text-xs">{blocks.length} block{blocks.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="2" y="4" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 20h8M12 18v2" />
              </svg>
              Desktop · 1464 × 600
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <svg className="w-3 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
              </svg>
              Mobile · 600 × 450
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Body: desktop + mobile columns ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Desktop column — 70% */}
          <div className="flex flex-col border-r border-white/10" style={{ flex: '70 1 0%' }}>
            {/* Column label */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-900/80 backdrop-blur-sm border-b border-white/10">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="2" y="4" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 20h8M12 18v2" />
              </svg>
              <span className="text-[11px] font-semibold text-gray-300">Desktop</span>
            </div>
            {/* Scrollable block stack */}
            <div className="flex-1 overflow-y-auto bg-white">
              <div ref={desktopColRef}>
                {blocks.map(block => {
                  const tpl = getTemplate(block.templateId, 'desktop')
                  const renderDesign: DesignState = {
                    ...design,
                    assets: block.assets ?? [],
                    activeTemplate: block.templateId,
                    activeFormat: 'desktop',
                    title: block.title,
                    subtitleHtml: block.subtitleHtml,
                    iconCount: block.iconCount as 2 | 3 | 4,
                    iconLabels: block.iconLabels,
                    desktop: { ...design.desktop, layoutFlipped: block.layoutFlipped },
                    mobile: { ...design.mobile, layoutFlipped: block.layoutFlipped },
                  }
                  return (
                    <div
                      key={block.id}
                      style={{
                        width: '100%',
                        height: tpl.height * desktopScale,
                        position: 'relative',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: tpl.width,
                        height: tpl.height,
                        transform: `scale(${desktopScale})`,
                        transformOrigin: 'top left',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                      }}>
                        <div style={{ width: tpl.width, height: tpl.height, position: 'relative' }}>
                          {block.templateId === 'aplus-icons'
                            ? <CanvasContentIcons design={renderDesign} settings={renderDesign.desktop} />
                            : <CanvasContent      design={renderDesign} settings={renderDesign.desktop} />
                          }
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Mobile column — 30% */}
          <div className="flex flex-col" style={{ flex: '30 1 0%' }}>
            {/* Column label */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-900/80 backdrop-blur-sm border-b border-white/10">
              <svg className="w-3 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
              </svg>
              <span className="text-[11px] font-semibold text-gray-300">Mobile</span>
            </div>
            {/* Scrollable block stack */}
            <div className="flex-1 overflow-y-auto bg-white">
              <div ref={mobileColRef}>
                {blocks.map(block => {
                  const tpl = getTemplate(block.templateId, 'mobile')
                  const renderDesign: DesignState = {
                    ...design,
                    assets: block.assets ?? [],
                    activeTemplate: block.templateId,
                    activeFormat: 'mobile',
                    title: block.title,
                    subtitleHtml: block.subtitleHtml,
                    iconCount: block.iconCount as 2 | 3 | 4,
                    iconLabels: block.iconLabels,
                    desktop: { ...design.desktop, layoutFlipped: block.layoutFlipped },
                    mobile: { ...design.mobile, layoutFlipped: block.layoutFlipped },
                  }
                  return (
                    <div
                      key={block.id}
                      style={{
                        width: '100%',
                        height: tpl.height * mobileScale,
                        position: 'relative',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: tpl.width,
                        height: tpl.height,
                        transform: `scale(${mobileScale})`,
                        transformOrigin: 'top left',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                      }}>
                        <div style={{ width: tpl.width, height: tpl.height, position: 'relative' }}>
                          {block.templateId === 'aplus-icons'
                            ? <CanvasContentIcons design={renderDesign} settings={renderDesign.mobile} />
                            : <CanvasContent      design={renderDesign} settings={renderDesign.mobile} />
                          }
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
