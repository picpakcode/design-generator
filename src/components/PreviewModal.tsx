'use client'

import React, { useEffect, useRef, useState } from 'react'
import { DesignState } from '@/types'
import { getTemplate } from '@/lib/templates'
import { CanvasContent, CanvasContentIcons } from './CanvasRenderers'
import { useAppSettings } from '@/hooks/useAppSettings'

const DESKTOP_W = 1464
const MOBILE_W  = 600

interface Props {
  open: boolean
  onClose: () => void
  design: DesignState
}

export default function PreviewModal({ open, onClose, design }: Props) {
  const { settings } = useAppSettings()
  const isDark = settings.theme === 'dark'

  const desktopInnerRef = useRef<HTMLDivElement>(null)
  const mobileInnerRef  = useRef<HTMLDivElement>(null)
  const [desktopScale, setDesktopScale] = useState(0.5)
  const [mobileScale,  setMobileScale]  = useState(0.5)

  useEffect(() => {
    if (!open) return
    const measure = () => {
      if (desktopInnerRef.current) setDesktopScale(desktopInnerRef.current.clientWidth / DESKTOP_W)
      if (mobileInnerRef.current)  setMobileScale(mobileInnerRef.current.clientWidth  / MOBILE_W)
    }
    const t = setTimeout(measure, 30)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const blocks = design.blocks ?? []

  // ── Theme tokens ──────────────────────────────────────────────────────────────
  const t = isDark ? {
    backdrop:      'bg-black/80',
    panel:         'bg-gray-950 border border-white/8',
    header:        'bg-gray-900 border-b border-white/8',
    headerText:    'text-white',
    subText:       'text-gray-500',
    pillBg:        'bg-white/6 text-gray-400',
    closeBtn:      'text-gray-500 hover:text-white hover:bg-white/10',
    colHeader:     'bg-gray-900/60 border-b border-white/6',
    colHeaderText: 'text-gray-400',
    colDimText:    'text-gray-600',
    colDivider:    'border-white/8',
  } : {
    backdrop:      'bg-black/40',
    panel:         'bg-white border border-gray-200',
    header:        'bg-gray-50 border-b border-gray-200',
    headerText:    'text-gray-900',
    subText:       'text-gray-400',
    pillBg:        'bg-gray-100 text-gray-500',
    closeBtn:      'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
    colHeader:     'bg-gray-50 border-b border-gray-200',
    colHeaderText: 'text-gray-500',
    colDimText:    'text-gray-400',
    colDivider:    'border-gray-200',
  }

  return (
    <>
      {/* Backdrop */}
      <div className={`fixed inset-0 z-50 ${t.backdrop} backdrop-blur-sm animate-fade-in`} onClick={onClose} />

      {/* Modal panel */}
      <div className={`fixed left-4 right-4 bottom-4 top-14 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl ${t.panel} animate-scale-in`}>

        {/* ── Header ── */}
        <div className={`shrink-0 flex items-center justify-between px-5 py-3.5 ${t.header}`}>
          <div className="flex items-center gap-3">
            <svg className={`w-4 h-4 ${t.subText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className={`font-semibold text-sm tracking-tight ${t.headerText}`}>A+ Preview</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.pillBg}`}>
              {blocks.length} block{blocks.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] hidden sm:block ${t.subText}`}>Esc to close</span>
            <button onClick={onClose} className={`ml-2 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${t.closeBtn}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Two-column body ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── Desktop column (70%) ── */}
          <div className={`flex flex-col border-r ${t.colDivider}`} style={{ flex: '70 1 0%' }}>
            <div className={`shrink-0 flex items-center gap-2.5 px-5 py-2.5 ${t.colHeader}`}>
              <svg className={`w-3.5 h-3.5 shrink-0 ${t.colHeaderText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="2" y="4" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 20h8M12 18v2" />
              </svg>
              <span className={`text-[11px] font-semibold ${t.colHeaderText}`}>Desktop</span>
              <span className={`text-[10px] ${t.colDimText}`}>1464 × 600 px</span>
            </div>

            <div className="flex-1 overflow-y-auto bg-white">
              <div className="px-4 pt-4 pb-6">
              <div ref={desktopInnerRef}>
                {blocks.map((block) => {
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
                    mobile:  { ...design.mobile,  layoutFlipped: block.layoutFlipped },
                  }
                  return (
                    <div key={block.id} style={{ width: '100%', height: tpl.height * desktopScale, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ width: tpl.width, height: tpl.height, transform: `scale(${desktopScale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
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
          </div>

          {/* ── Mobile column (30%) ── */}
          <div className="flex flex-col" style={{ flex: '30 1 0%' }}>
            <div className={`shrink-0 flex items-center gap-2.5 px-5 py-2.5 ${t.colHeader}`}>
              <svg className={`w-3 h-3.5 shrink-0 ${t.colHeaderText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
              </svg>
              <span className={`text-[11px] font-semibold ${t.colHeaderText}`}>Mobile</span>
              <span className={`text-[10px] ${t.colDimText}`}>600 × 450 px</span>
            </div>

            <div className="flex-1 overflow-y-auto bg-white">
              <div className="px-3 pt-4 pb-6">
              <div ref={mobileInnerRef}>
                {blocks.map((block) => {
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
                    mobile:  { ...design.mobile,  layoutFlipped: block.layoutFlipped },
                  }
                  return (
                    <div key={block.id} style={{ width: '100%', height: tpl.height * mobileScale, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ width: tpl.width, height: tpl.height, transform: `scale(${mobileScale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
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
      </div>
    </>
  )
}
