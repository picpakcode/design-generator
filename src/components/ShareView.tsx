'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { DesignState, TemplateShareState, TemplateShareSlotState, TemplateId, GalleryTemplateId } from '@/types'
import { getTemplate, getGalleryTemplate } from '@/lib/templates'
import { CanvasContent, CanvasContentIcons, CanvasContentGallery, CanvasContentGalleryIcons } from './CanvasRenderers'
import { usePresence, type Peer } from '@/hooks/usePresence'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShareData {
  projectId: string
  accessLevel: 'view' | 'edit'
  projectName: string
  ownerEmail: string | null
  state: DesignState
  templateState: TemplateShareState | null
  updatedAt: string
}

interface Comment {
  id: string
  block_id: string
  author_name: string
  body: string
  created_at: string
}

interface Approval {
  id: string
  block_id: string
  author_name: string
  status: 'approved' | 'changes_requested'
  created_at: string
}

interface Feedback {
  comments: Comment[]
  approvals: Approval[]
}

interface BlockItem {
  id: string
  label: string
}

type GalleryBlockData = DesignState['galleryBlocks'][number]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function blockApprovalSummary(approvals: Approval[], blockId: string): 'approved' | 'changes_requested' | null {
  const relevant = approvals.filter(a => a.block_id === blockId)
  if (relevant.length === 0) return null
  const latest = new Map<string, Approval>()
  for (const a of relevant) {
    const ex = latest.get(a.author_name)
    if (!ex || new Date(a.created_at) > new Date(ex.created_at)) latest.set(a.author_name, a)
  }
  const statuses = Array.from(latest.values()).map(a => a.status)
  return statuses.includes('changes_requested') ? 'changes_requested' : 'approved'
}

// ─── Peer avatars (top-right header) ─────────────────────────────────────────

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

// ─── Block badge overlay (comment count + approval dot) ──────────────────────

function BlockBadge({ blockId, feedback }: { blockId: string; feedback: Feedback }) {
  const count = feedback.comments.filter(c => c.block_id === blockId).length
  const status = blockApprovalSummary(feedback.approvals, blockId)
  if (count === 0 && !status) return null
  return (
    <div className="absolute top-2 right-2 z-20 flex items-center gap-1 pointer-events-none">
      {count > 0 && (
        <span className="bg-gray-900/75 text-white text-[9px] font-semibold rounded-full px-1.5 py-0.5 flex items-center gap-0.5 backdrop-blur-sm">
          <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {count}
        </span>
      )}
      {status === 'approved' && (
        <span className="bg-emerald-500 text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">✓</span>
      )}
      {status === 'changes_requested' && (
        <span className="bg-amber-500 text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">!</span>
      )}
    </div>
  )
}

// ─── Clickable block wrapper ──────────────────────────────────────────────────

function BlockWrapper({
  blockId, selected, onClick, feedback, children,
}: {
  blockId: string
  selected: boolean
  onClick: () => void
  feedback: Feedback
  children: React.ReactNode
}) {
  return (
    <div
      className={`relative mb-3 cursor-pointer rounded-sm transition-shadow ${
        selected
          ? 'shadow-[0_0_0_2px_#6366f1,0_4px_20px_rgba(99,102,241,0.18)]'
          : 'hover:shadow-[0_0_0_1px_#e5e7eb]'
      }`}
      onClick={onClick}
    >
      <BlockBadge blockId={blockId} feedback={feedback} />
      {selected && (
        <div className="absolute inset-0 z-10 rounded-sm pointer-events-none ring-2 ring-inset ring-indigo-500" />
      )}
      {children}
    </div>
  )
}

// ─── Canvas renderers ─────────────────────────────────────────────────────────

function AplusBlockCanvas({ block, design, scale, format }: {
  block: DesignState['blocks'][number]
  design: DesignState
  scale: number
  format: 'desktop' | 'mobile'
}) {
  const tpl = getTemplate(block.templateId, format)
  const rd: DesignState = {
    ...design,
    assets:        block.assets ?? [],
    activeTemplate: block.templateId,
    activeFormat:  format,
    title:         block.title,
    subtitleHtml:  block.subtitleHtml,
    iconCount:     block.iconCount as 2 | 3 | 4,
    iconLabels:    block.iconLabels,
    desktop: { ...design.desktop, layoutFlipped: block.layoutFlipped },
    mobile:  { ...design.mobile,  layoutFlipped: block.layoutFlipped },
  }
  const settings = format === 'desktop' ? rd.desktop : rd.mobile
  return (
    <div style={{ width: '100%', height: tpl.height * scale, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: tpl.width, height: tpl.height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
        <div style={{ width: tpl.width, height: tpl.height, position: 'relative' }}>
          {block.templateId === 'aplus-icons'
            ? <CanvasContentIcons design={rd} settings={settings} />
            : <CanvasContent      design={rd} settings={settings} />
          }
        </div>
      </div>
    </div>
  )
}

function GalleryBlockCanvas({ gBlock, design, scale }: {
  gBlock: GalleryBlockData
  design: DesignState
  scale: number
}) {
  const tpl = getGalleryTemplate(gBlock.templateId)
  const rd: DesignState = {
    ...design,
    assets:               gBlock.assets ?? [],
    title:                gBlock.title,
    subtitleHtml:         gBlock.subtitleHtml,
    iconCount:            gBlock.iconCount as 2 | 3 | 4,
    iconLabels:           gBlock.iconLabels,
    activeGalleryTemplate: gBlock.templateId,
  }
  return (
    <div style={{ width: '100%', height: tpl.height * scale, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: tpl.width, height: tpl.height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
        <div style={{ width: tpl.width, height: tpl.height, position: 'relative' }}>
          {gBlock.templateId === 'gallery-icons'
            ? <CanvasContentGalleryIcons design={rd} settings={design.gallery} />
            : <CanvasContentGallery      design={rd} settings={design.gallery} />
          }
        </div>
      </div>
    </div>
  )
}

// ─── Template Mode helpers ────────────────────────────────────────────────────

function emptyTplSlot(): TemplateShareSlotState {
  return { title: '', desc: '', iconLabels: ['', '', '', ''], iconCount: 3, photoAsset: undefined, iconAssets: [] }
}

function buildTemplateSlotDesign(
  productId: string,
  slotIdx: number,
  tState: TemplateShareState,
  baseDesign: DesignState,
): DesignState {
  const s = (tState.allSlots[productId] ?? [])[slotIdx] ?? emptyTplSlot()
  const cfg = tState.slotConfigs[slotIdx] ?? { template: '5050-right' }
  const showDesc = cfg.template !== 'icons'
  return {
    ...baseDesign,
    assets: [
      s.photoAsset,
      tState.textureAsset,
      tState.logoAsset,
      s.iconAssets[0], s.iconAssets[1], s.iconAssets[2], s.iconAssets[3],
    ] as DesignState['assets'],
    title:               s.title || '<p></p>',
    subtitleHtml:        showDesc ? (s.desc || '') : '',
    iconLabels:          s.iconLabels,
    iconCount:           s.iconCount,
    iconsMobileShowDesc: (cfg as { mobileShowDesc?: boolean }).mobileShowDesc ?? true,
    activeTemplate:      cfg.template as TemplateId,
    activeFormat:        'desktop',
  }
}

function buildTemplateGalleryDesign(
  productId: string,
  galleryIdx: number,
  tState: TemplateShareState,
  baseDesign: DesignState,
): DesignState {
  const s = (tState.allGallerySlots[productId] ?? [])[galleryIdx] ?? emptyTplSlot()
  const cfg = tState.galleryConfigs[galleryIdx] ?? { template: 'gallery-hero' }
  return {
    ...baseDesign,
    assets: [
      s.photoAsset,
      tState.textureAsset,
      tState.logoAsset,
      s.iconAssets[0], s.iconAssets[1], s.iconAssets[2], s.iconAssets[3],
    ] as DesignState['assets'],
    title:                       s.title || '<p></p>',
    subtitleHtml:                s.desc || '',
    iconLabels:                  s.iconLabels,
    iconCount:                   s.iconCount,
    activeGalleryTemplate:       cfg.template as GalleryTemplateId,
    galleryIconsShowDescription: cfg.template === 'gallery-icons-text',
  }
}

// ─── Template Mode canvas item (A+ slot) ─────────────────────────────────────

function TemplateModeAplusItem({
  productId, slotIdx, tState, baseDesign, scale, blockId,
  selected, onClick, feedback,
}: {
  productId: string
  slotIdx: number
  tState: TemplateShareState
  baseDesign: DesignState
  scale: number
  blockId: string
  selected: boolean
  onClick: () => void
  feedback: Feedback
}) {
  const sd  = buildTemplateSlotDesign(productId, slotIdx, tState, baseDesign)
  const cfg = tState.slotConfigs[slotIdx] ?? { template: '5050-right' }
  const isIcons = cfg.template === 'icons' || cfg.template === 'icons-text'
  const flip    = cfg.template === '5050-left'
  const W = 1464
  const H = 600
  return (
    <BlockWrapper blockId={blockId} selected={selected} onClick={onClick} feedback={feedback}>
      <div style={{ width: '100%', height: H * scale, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
          <div style={{ width: W, height: H, position: 'relative' }}>
            {isIcons
              ? <CanvasContentIcons design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...baseDesign.desktop, layoutFlipped: flip }} />
              : <CanvasContent      design={{ ...sd, activeFormat: 'desktop' }} settings={{ ...baseDesign.desktop, layoutFlipped: flip }} />
            }
          </div>
        </div>
      </div>
    </BlockWrapper>
  )
}

function TemplateModeAplusMobileItem({
  productId, slotIdx, tState, baseDesign, scale, blockId,
  selected, onClick, feedback,
}: {
  productId: string
  slotIdx: number
  tState: TemplateShareState
  baseDesign: DesignState
  scale: number
  blockId: string
  selected: boolean
  onClick: () => void
  feedback: Feedback
}) {
  const sd  = buildTemplateSlotDesign(productId, slotIdx, tState, baseDesign)
  const cfg = tState.slotConfigs[slotIdx] ?? { template: '5050-right' }
  const isIcons = cfg.template === 'icons' || cfg.template === 'icons-text'
  const flip    = cfg.template === '5050-left'
  const W = 600
  const H = 450
  return (
    <BlockWrapper blockId={blockId} selected={selected} onClick={onClick} feedback={feedback}>
      <div style={{ width: '100%', height: H * scale, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
          <div style={{ width: W, height: H, position: 'relative' }}>
            {isIcons
              ? <CanvasContentIcons design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...baseDesign.mobile, layoutFlipped: flip }} />
              : <CanvasContent      design={{ ...sd, activeFormat: 'mobile' }} settings={{ ...baseDesign.mobile, layoutFlipped: flip }} />
            }
          </div>
        </div>
      </div>
    </BlockWrapper>
  )
}

function TemplateModeGalleryItem({
  productId, galleryIdx, tState, baseDesign, scale, blockId,
  selected, onClick, feedback,
}: {
  productId: string
  galleryIdx: number
  tState: TemplateShareState
  baseDesign: DesignState
  scale: number
  blockId: string
  selected: boolean
  onClick: () => void
  feedback: Feedback
}) {
  const gd  = buildTemplateGalleryDesign(productId, galleryIdx, tState, baseDesign)
  const cfg = tState.galleryConfigs[galleryIdx] ?? { template: 'gallery-hero' }
  const isGIcons = cfg.template === 'gallery-icons' || cfg.template === 'gallery-icons-text'
  const W = 1500
  const H = 1500
  return (
    <BlockWrapper blockId={blockId} selected={selected} onClick={onClick} feedback={feedback}>
      <div style={{ width: '100%', height: H * scale, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
          <div style={{ width: W, height: H, position: 'relative' }}>
            {isGIcons
              ? <CanvasContentGalleryIcons design={gd} settings={{ ...baseDesign.gallery, layoutFlipped: false }} />
              : <CanvasContentGallery      design={gd} settings={{ ...baseDesign.gallery, layoutFlipped: false }} />
            }
          </div>
        </div>
      </div>
    </BlockWrapper>
  )
}

// ─── Comments sidebar ─────────────────────────────────────────────────────────

function CommentsSidebar({
  token, blocks, selectedBlockId, onSelectBlock, feedback, feedbackLoading, onRefresh,
}: {
  token: string
  blocks: BlockItem[]
  selectedBlockId: string | null
  onSelectBlock: (id: string) => void
  feedback: Feedback
  feedbackLoading: boolean
  onRefresh: () => void
}) {
  const [authorName, setAuthorName]     = useState('')
  const [editingName, setEditingName]   = useState(false)
  const [nameInput,   setNameInput]     = useState('')
  const [commentInput, setCommentInput] = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [approving,    setApproving]    = useState(false)
  const [approveFlash, setApproveFlash] = useState<'approved' | 'changes_requested' | null>(null)
  const [postFlash,    setPostFlash]    = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = localStorage.getItem('dg:reviewer-name') ?? ''
    setAuthorName(stored)
    if (!stored) setEditingName(true)
  }, [])

  const effectiveBlockId = selectedBlockId ?? blocks[0]?.id ?? null

  const blockComments = feedback.comments
    .filter(c => c.block_id === effectiveBlockId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const blockApprovals = feedback.approvals.filter(a => a.block_id === effectiveBlockId)

  const latestPerAuthor = (() => {
    const map = new Map<string, Approval>()
    for (const a of blockApprovals) {
      const ex = map.get(a.author_name)
      if (!ex || new Date(a.created_at) > new Date(ex.created_at)) map.set(a.author_name, a)
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  })()

  const myLatest = authorName ? latestPerAuthor.find(a => a.author_name === authorName) ?? null : null

  const totalComments = feedback.comments.length
  const totalApprovals = (() => {
    const set = new Set<string>()
    for (const a of feedback.approvals) set.add(`${a.block_id}::${a.author_name}`)
    return set.size
  })()

  function saveName() {
    const name = nameInput.trim()
    if (!name) return
    localStorage.setItem('dg:reviewer-name', name)
    setAuthorName(name)
    setEditingName(false)
    setNameInput('')
  }

  function startEditName() {
    setNameInput(authorName)
    setEditingName(true)
  }

  async function handlePostComment() {
    if (!effectiveBlockId || !authorName || !commentInput.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/share/${token}/comments`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ blockId: effectiveBlockId, authorName, body: commentInput.trim() }),
      })
      if (!res.ok) throw new Error('Post failed')
      setCommentInput('')
      onRefresh()
      setPostFlash(true)
      setTimeout(() => setPostFlash(false), 350)
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch {
      setSubmitError('Failed to post. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApproval(status: 'approved' | 'changes_requested') {
    if (!effectiveBlockId || !authorName) return
    setApproving(true)
    try {
      await fetch(`/api/share/${token}/approve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ blockId: effectiveBlockId, authorName, status }),
      })
      onRefresh()
      setApproveFlash(status)
      setTimeout(() => setApproveFlash(null), 350)
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="w-[284px] shrink-0 flex flex-col border-l border-gray-100 bg-white overflow-hidden">

      {/* Panel header */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-sm font-semibold text-gray-800 flex-1">Feedback</span>
          {feedbackLoading && (
            <svg className="animate-spin w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {totalComments} comment{totalComments !== 1 ? 's' : ''} · {totalApprovals} vote{totalApprovals !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Block tabs */}
      {blocks.length > 0 && (
        <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto">
          {blocks.map(block => {
            const blockStatus = blockApprovalSummary(feedback.approvals, block.id)
            const blockCommentCount = feedback.comments.filter(c => c.block_id === block.id).length
            const isActive = (selectedBlockId ?? blocks[0]?.id) === block.id
            return (
              <button
                key={block.id}
                onClick={() => onSelectBlock(block.id)}
                title={block.label}
                className={`relative shrink-0 h-[26px] px-2.5 rounded text-[10px] font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                }`}
              >
                {block.label}
                {(blockCommentCount > 0 || blockStatus) && (
                  <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-white ${
                    blockStatus === 'changes_requested' ? 'bg-amber-400' :
                    blockStatus === 'approved'          ? 'bg-emerald-400' :
                    'bg-indigo-400'
                  }`} />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Scrollable content: approval + comments */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      <div key={effectiveBlockId ?? ''} className="animate-fade-in">

        {/* Approval section */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">Approval</p>
          <div className="flex gap-2 mb-2.5">
            <button
              onClick={() => handleApproval('approved')}
              disabled={approving || !authorName}
              title={!authorName ? 'Enter your name below to vote' : undefined}
              className={`flex-1 h-8 rounded text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${
                myLatest?.status === 'approved'
                  ? 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              } ${approveFlash === 'approved' ? 'animate-bounce-once' : ''}`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Approve
            </button>
            <button
              onClick={() => handleApproval('changes_requested')}
              disabled={approving || !authorName}
              title={!authorName ? 'Enter your name below to vote' : undefined}
              className={`flex-1 h-8 rounded text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${
                myLatest?.status === 'changes_requested'
                  ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              } ${approveFlash === 'changes_requested' ? 'animate-bounce-once' : ''}`}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Changes
            </button>
          </div>

          {latestPerAuthor.length > 0 && (
            <div className="space-y-1">
              {latestPerAuthor.map(a => (
                <div key={a.author_name} className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    a.status === 'approved' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`} />
                  <span className="text-[10px] text-gray-500 truncate flex-1">
                    <span className="font-medium text-gray-700">{a.author_name}</span>
                    {' · '}
                    {a.status === 'approved' ? 'approved' : 'changes requested'}
                    {' · '}
                    {timeAgo(a.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!authorName && (
            <p className="text-[10px] text-gray-400 mt-1.5">Enter your name below to vote.</p>
          )}
        </div>

        {/* Comments */}
        <div className="px-4 pt-3 pb-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
            Comments {blockComments.length > 0 && `(${blockComments.length})`}
          </p>

          {blockComments.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <svg className="w-5 h-5 text-gray-200 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-[11px] text-gray-300 font-medium">No comments yet</p>
              <p className="text-[10px] text-gray-200 mt-0.5">Be the first to leave feedback.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {blockComments.map(c => (
                <div key={c.id}>
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-[11px] font-semibold text-gray-800">{c.author_name}</span>
                    <span className="text-[9px] text-gray-300">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{c.body}</p>
                </div>
              ))}
              <div ref={commentsEndRef} />
            </div>
          )}
        </div>
      </div>{/* end keyed crossfade wrapper */}
      </div>

      {/* Add comment / identity form */}
      <div className="shrink-0 border-t border-gray-100 px-4 py-3 bg-gray-50/50">
        {editingName || !authorName ? (
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {authorName ? 'Change name' : 'Your name'}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName() }}
                placeholder="Enter your name…"
                autoFocus
                className="flex-1 h-7 px-2.5 text-[11px] border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 placeholder:text-gray-300 transition-all"
              />
              <button
                onClick={saveName}
                disabled={!nameInput.trim()}
                className="h-7 px-3 rounded bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-500 disabled:opacity-40 transition-colors"
              >
                Set
              </button>
            </div>
            {authorName && (
              <button
                onClick={() => setEditingName(false)}
                className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePostComment() }}
              placeholder="Leave a comment… (⌘↵ to post)"
              rows={2}
              className="w-full px-2.5 py-2 text-[11px] border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none placeholder:text-gray-300 transition-all"
            />
            {submitError && <p className="text-[10px] text-red-500">{submitError}</p>}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={startEditName}
                className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors truncate max-w-[150px] text-left"
              >
                As&nbsp;<span className="font-medium text-gray-600">{authorName}</span>&nbsp;·&nbsp;Change
              </button>
              <button
                onClick={handlePostComment}
                disabled={submitting || !commentInput.trim()}
                className={`shrink-0 h-7 px-3 rounded bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-500 disabled:opacity-40 transition-colors flex items-center gap-1.5 ${postFlash ? 'animate-bounce-once' : ''}`}
              >
                {submitting && (
                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                Post
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ShareView({ token }: { token: string }) {
  const [data,     setData]     = useState<ShareData | null>(null)
  const [design,   setDesign]   = useState<DesignState | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)

  const [selectedBlockId,  setSelectedBlockId]  = useState<string | null>(null)
  const [feedback,         setFeedback]         = useState<Feedback>({ comments: [], approvals: [] })
  const [feedbackLoading,  setFeedbackLoading]  = useState(false)

  // Template Mode state
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

  const desktopRef = useRef<HTMLDivElement>(null)
  const mobileRef  = useRef<HTMLDivElement>(null)
  const [desktopScale, setDesktopScale] = useState(0.5)
  const [mobileScale,  setMobileScale]  = useState(0.5)

  const [anonId] = useState(() => {
    if (typeof window === 'undefined') return 'anon'
    const k = 'dg:anon-id'
    const ex = sessionStorage.getItem(k)
    if (ex) return ex
    const id = 'anon-' + Math.random().toString(36).slice(2, 10)
    sessionStorage.setItem(k, id)
    return id
  })

  const { peers } = usePresence({
    projectId:    data?.projectId,
    userId:       anonId,
    email:        'Viewer',
    activeBlockId: null,
    onStateUpdate: (state) => setDesign(state),
  })

  const loadFeedback = useCallback(async () => {
    setFeedbackLoading(true)
    try {
      const res = await fetch(`/api/share/${token}/comments`)
      if (res.ok) setFeedback(await res.json())
    } finally {
      setFeedbackLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: ShareData) => {
        setData(d)
        setDesign(d.state)
        if (d.templateState?.products.length) {
          setSelectedProductId(d.templateState.products[0].id)
        } else {
          const firstId = d.state.activeCategory === 'gallery'
            ? d.state.galleryBlocks?.[0]?.id
            : d.state.blocks?.[0]?.id
          if (firstId) setSelectedBlockId(firstId)
        }
        loadFeedback()
      })
      .catch(() => setError('This share link is invalid or has been revoked.'))
      .finally(() => setLoading(false))
  }, [token, loadFeedback])

  useEffect(() => {
    const tState = data?.templateState
    if (tState) {
      // Template mode: desktop col = 1464, gallery col = 1500
      const measure = () => {
        if (desktopRef.current) setDesktopScale(desktopRef.current.clientWidth / 1464)
        if (mobileRef.current)  setMobileScale(mobileRef.current.clientWidth  / 1500)
      }
      const t = setTimeout(measure, 30)
      window.addEventListener('resize', measure)
      return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
    }
    const isG = design?.activeCategory === 'gallery'
    const dW = isG ? 1500 : 1464
    const mW = isG ? 1500 : 600
    const measure = () => {
      if (desktopRef.current) setDesktopScale(desktopRef.current.clientWidth / dW)
      if (mobileRef.current)  setMobileScale(mobileRef.current.clientWidth  / mW)
    }
    const t = setTimeout(measure, 30)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [design, data?.templateState])

  // ── Loading / error states ────────────────────────────────────────────────

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

  // ── Template Mode rendering ───────────────────────────────────────────────

  const tState = data.templateState
  if (tState && selectedProductId !== null) {
    const productId = selectedProductId
    const aplusBlockItems: BlockItem[] = Array.from({ length: tState.aplusSlots }, (_, i) => ({
      id: `${productId}:aplus:${i}`,
      label: String.fromCharCode(65 + i) + '1',
    }))
    const galleryBlockItems: BlockItem[] = Array.from({ length: tState.galleryCount }, (_, i) => ({
      id: `${productId}:gallery:${i}`,
      label: `G${i + 1}`,
    }))
    const blockItems: BlockItem[] = [...aplusBlockItems, ...galleryBlockItems]
    const effectiveBlockId = selectedBlockId ?? blockItems[0]?.id ?? null

    return (
      <div className="flex flex-col h-screen overflow-hidden bg-white">
        {/* Header */}
        <header className="shrink-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3 shadow-sm z-10">
          <img src="/Favicon.png" alt="" className="w-6 h-6 rounded object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{data.projectName}</p>
            {data.ownerEmail && (
              <p className="text-[10px] text-gray-400">Shared by {data.ownerEmail}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <PeerAvatars peers={peers} />
            {peers.length > 0 && (
              <span className="text-[10px] text-gray-400">{peers.length} viewing</span>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              data.accessLevel === 'edit' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
            }`}>
              {data.accessLevel === 'edit' ? 'Can edit' : 'View only'}
            </span>
          </div>
        </header>

        {/* Product tab bar */}
        <div className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-gray-50 border-b border-gray-100 overflow-x-auto">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 mr-1">Product:</span>
          {tState.products.map(p => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedProductId(p.id)
                setSelectedBlockId(null)
              }}
              className={`shrink-0 h-7 px-3 rounded-full text-[11px] font-semibold transition-all whitespace-nowrap ${
                p.id === productId
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {p.productName || p.sku || p.id}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* A+ slots column */}
          <div className="flex flex-col border-r border-gray-100 min-w-0" style={{ flex: '6 1 0%' }}>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="2" y="4" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 20h8M12 18v2" />
              </svg>
              <span className="text-[11px] font-semibold text-gray-500">A+ Content</span>
              <span className="text-[10px] text-gray-400">1464 × 600 px</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 pt-4 pb-6">
                <div ref={desktopRef}>
                  {Array.from({ length: tState.aplusSlots }, (_, i) => {
                    const bid = `${productId}:aplus:${i}`
                    return (
                      <TemplateModeAplusItem
                        key={bid}
                        productId={productId}
                        slotIdx={i}
                        tState={tState}
                        baseDesign={design}
                        scale={desktopScale}
                        blockId={bid}
                        selected={effectiveBlockId === bid}
                        onClick={() => setSelectedBlockId(bid)}
                        feedback={feedback}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Gallery column */}
          {tState.galleryCount > 0 && (
            <div className="flex flex-col border-r border-gray-100 min-w-0" style={{ flex: '2.5 1 0%' }}>
              <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-[11px] font-semibold text-gray-500">Gallery</span>
                <span className="text-[10px] text-gray-400">1500 × 1500 px</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="px-3 pt-4 pb-6">
                  <div ref={mobileRef}>
                    {Array.from({ length: tState.galleryCount }, (_, i) => {
                      const bid = `${productId}:gallery:${i}`
                      return (
                        <TemplateModeGalleryItem
                          key={bid}
                          productId={productId}
                          galleryIdx={i}
                          tState={tState}
                          baseDesign={design}
                          scale={mobileScale}
                          blockId={bid}
                          selected={effectiveBlockId === bid}
                          onClick={() => setSelectedBlockId(bid)}
                          feedback={feedback}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comments sidebar */}
          <CommentsSidebar
            token={token}
            blocks={blockItems}
            selectedBlockId={effectiveBlockId}
            onSelectBlock={setSelectedBlockId}
            feedback={feedback}
            feedbackLoading={feedbackLoading}
            onRefresh={loadFeedback}
          />
        </div>
      </div>
    )
  }

  // ── Data derivation (Design Mode) ─────────────────────────────────────────

  const isGallery    = design.activeCategory === 'gallery'
  const aplusBlocks  = design.blocks      ?? []
  const galleryBlocks = design.galleryBlocks ?? []

  const blockItems: BlockItem[] = isGallery
    ? galleryBlocks.map((b, i) => ({ id: b.id, label: b.slug || `Slide ${i + 1}` }))
    : aplusBlocks.map((_b, i) => ({ id: _b.id, label: `Block ${i + 1}` }))

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3 shadow-sm z-10">
        <img src="/Favicon.png" alt="" className="w-6 h-6 rounded object-contain shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{data.projectName}</p>
          {data.ownerEmail && (
            <p className="text-[10px] text-gray-400">Shared by {data.ownerEmail}</p>
          )}
        </div>
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

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Desktop / Gallery column */}
        <div className="flex flex-col border-r border-gray-100 min-w-0" style={{ flex: '6 1 0%' }}>
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
            {isGallery ? (
              <>
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-[11px] font-semibold text-gray-500">Gallery</span>
                <span className="text-[10px] text-gray-400">1500 × 1500 px</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="2" y="4" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 20h8M12 18v2" />
                </svg>
                <span className="text-[11px] font-semibold text-gray-500">Desktop</span>
                <span className="text-[10px] text-gray-400">1464 × 600 px</span>
              </>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 pt-4 pb-6">
              <div ref={desktopRef}>
                {isGallery
                  ? galleryBlocks.map(gBlock => (
                      <BlockWrapper
                        key={gBlock.id}
                        blockId={gBlock.id}
                        selected={selectedBlockId === gBlock.id}
                        onClick={() => setSelectedBlockId(gBlock.id)}
                        feedback={feedback}
                      >
                        <GalleryBlockCanvas gBlock={gBlock} design={design} scale={desktopScale} />
                      </BlockWrapper>
                    ))
                  : aplusBlocks.map(block => (
                      <BlockWrapper
                        key={block.id}
                        blockId={block.id}
                        selected={selectedBlockId === block.id}
                        onClick={() => setSelectedBlockId(block.id)}
                        feedback={feedback}
                      >
                        <AplusBlockCanvas block={block} design={design} scale={desktopScale} format="desktop" />
                      </BlockWrapper>
                    ))
                }
              </div>
            </div>
          </div>
        </div>

        {/* Mobile column — A+ only */}
        {!isGallery && (
          <div className="flex flex-col border-r border-gray-100 min-w-0" style={{ flex: '2.5 1 0%' }}>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
              <svg className="w-3 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="5" y="2" width="14" height="20" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
              </svg>
              <span className="text-[11px] font-semibold text-gray-500">Mobile</span>
              <span className="text-[10px] text-gray-400">600 × 450 px</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-3 pt-4 pb-6">
                <div ref={mobileRef}>
                  {aplusBlocks.map(block => (
                    <BlockWrapper
                      key={block.id}
                      blockId={block.id}
                      selected={selectedBlockId === block.id}
                      onClick={() => setSelectedBlockId(block.id)}
                      feedback={feedback}
                    >
                      <AplusBlockCanvas block={block} design={design} scale={mobileScale} format="mobile" />
                    </BlockWrapper>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comments sidebar */}
        <CommentsSidebar
          token={token}
          blocks={blockItems}
          selectedBlockId={selectedBlockId}
          onSelectBlock={setSelectedBlockId}
          feedback={feedback}
          feedbackLoading={feedbackLoading}
          onRefresh={loadFeedback}
        />
      </div>
    </div>
  )
}
