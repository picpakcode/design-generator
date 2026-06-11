'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedbackComment {
  id: string
  block_id: string
  parent_id: string | null
  author_name: string
  author_type: 'reviewer' | 'owner'
  body: string
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
  reactions: Record<string, string[]>
}

interface Approval {
  id: string
  block_id: string
  author_name: string
  status: 'approved' | 'changes_requested'
  created_at: string
}

interface Thread {
  root: FeedbackComment
  replies: FeedbackComment[]
}

interface BlockGroup {
  blockId: string
  label: string
  threads: Thread[]
  approval: 'approved' | 'changes_requested' | null
}

type Filter = 'all' | 'open' | 'resolved'

const EMOJIS = ['👍', '❤️', '😄', '👀', '🎉']

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

function blockLabel(blockId: string): string {
  // Template mode: "productId:aplus:0" or "productId:gallery:0"
  const tplMatch = blockId.match(/:aplus:(\d+)$/)
  if (tplMatch) return `A+ ${String.fromCharCode(65 + Number(tplMatch[1]))}`
  const galMatch = blockId.match(/:gallery:(\d+)$/)
  if (galMatch) return `Gallery ${Number(galMatch[1]) + 1}`
  return blockId.slice(0, 8)
}

function blockApprovalSummary(approvals: Approval[], blockId: string): 'approved' | 'changes_requested' | null {
  const relevant = approvals.filter(a => a.block_id === blockId)
  if (!relevant.length) return null
  const map = new Map<string, Approval>()
  for (const a of relevant) {
    const ex = map.get(a.author_name)
    if (!ex || new Date(a.created_at) > new Date(ex.created_at)) map.set(a.author_name, a)
  }
  const statuses = Array.from(map.values()).map(a => a.status)
  return statuses.includes('changes_requested') ? 'changes_requested' : 'approved'
}

function Avatar({ name, isOwner }: { name: string; isOwner?: boolean }) {
  const initials = name.split(/[\s@]/)[0]?.[0]?.toUpperCase() ?? '?'
  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
      isOwner ? 'bg-accent-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
    }`}>
      {initials}
    </div>
  )
}

// ─── Reaction bar ─────────────────────────────────────────────────────────────

function ReactionBar({
  comment, projectId, onUpdate,
}: { comment: FeedbackComment; projectId: string; onUpdate: (id: string, reactions: Record<string, string[]>) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  async function toggleReaction(emoji: string) {
    setPickerOpen(false)
    const res = await fetch(`/api/projects/${projectId}/feedback/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentId: comment.id, emoji }),
    })
    if (res.ok) {
      const d = await res.json()
      onUpdate(comment.id, d.reactions ?? {})
    }
  }

  const reactions = comment.reactions ?? {}
  const hasReactions = Object.keys(reactions).length > 0

  return (
    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
      {Object.entries(reactions).map(([emoji, names]) => (
        <button
          key={emoji}
          onClick={() => toggleReaction(emoji)}
          className="flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-accent-50 dark:hover:bg-accent-900/30 hover:ring-1 hover:ring-accent-200 dark:hover:ring-accent-700 transition-all text-[11px]"
          title={names.join(', ')}
        >
          {emoji} <span className="text-gray-500 dark:text-gray-400 font-medium">{names.length}</span>
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setPickerOpen(o => !o)}
          className={`h-5 w-5 flex items-center justify-center rounded-full transition-all text-[11px] ${
            hasReactions ? 'text-gray-300 hover:text-gray-500 hover:bg-gray-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
          }`}
          title="Add reaction"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M8 13s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth={3} strokeLinecap="round" />
            <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth={3} strokeLinecap="round" />
          </svg>
        </button>
        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
            <div className="absolute bottom-6 left-0 z-20 flex gap-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 px-2 py-1.5">
              {EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => toggleReaction(e)}
                  className="text-base hover:scale-125 transition-transform"
                >
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Single thread ────────────────────────────────────────────────────────────

function ThreadCard({
  thread, projectId, onResolve, onReply, onReactionUpdate,
}: {
  thread: Thread
  projectId: string
  onResolve: (commentId: string) => void
  onReply: (parentId: string, blockId: string, text: string) => Promise<void>
  onReactionUpdate: (id: string, reactions: Record<string, string[]>) => void
}) {
  const { root, replies } = thread
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [posting, setPosting] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const isResolved = !!root.resolved_at

  async function submitReply() {
    if (!replyText.trim()) return
    setPosting(true)
    await onReply(root.id, root.block_id, replyText.trim())
    setReplyText('')
    setReplyOpen(false)
    setPosting(false)
  }

  return (
    <div className={`rounded-xl border transition-all ${
      isResolved
        ? 'border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 opacity-60'
        : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-600'
    }`}>
      {/* Root comment */}
      <div className="p-3">
        <div className="flex items-start gap-2">
          <Avatar name={root.author_name} isOwner={root.author_type === 'owner'} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">{root.author_name}</span>
              {root.author_type === 'owner' && (
                <span className="text-[9px] font-bold text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-900/40 px-1.5 py-0.5 rounded-full">Owner</span>
              )}
              <span className="text-[10px] text-gray-300 dark:text-gray-600 ml-auto shrink-0">{timeAgo(root.created_at)}</span>
            </div>
            <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">{root.body}</p>
            <ReactionBar comment={root} projectId={projectId} onUpdate={onReactionUpdate} />
          </div>
          {/* Resolve toggle */}
          <button
            onClick={() => onResolve(root.id)}
            title={isResolved ? 'Unresolve' : 'Mark resolved'}
            className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all mt-0.5 ${
              isResolved
                ? 'bg-emerald-500 text-white'
                : 'border border-gray-200 dark:border-gray-600 text-gray-300 dark:text-gray-600 hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-500 dark:hover:text-emerald-400'
            }`}
          >
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="border-t border-gray-50 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700">
          {replies.map(reply => (
            <div key={reply.id} className="px-3 py-2 pl-8">
              <div className="flex items-start gap-2">
                <Avatar name={reply.author_name} isOwner={reply.author_type === 'owner'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">{reply.author_name}</span>
                    {reply.author_type === 'owner' && (
                      <span className="text-[9px] font-bold text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-900/40 px-1.5 py-0.5 rounded-full">Owner</span>
                    )}
                    <span className="text-[10px] text-gray-300 dark:text-gray-600 ml-auto shrink-0">{timeAgo(reply.created_at)}</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">{reply.body}</p>
                  <ReactionBar comment={reply} projectId={projectId} onUpdate={onReactionUpdate} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply form */}
      {!isResolved && (
        <div className="px-3 pb-2.5">
          {replyOpen ? (
            <div className="mt-1.5 space-y-1.5">
              <textarea
                ref={textRef}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitReply() }}
                placeholder="Reply… (⌘↵ to post)"
                rows={2}
                autoFocus
                className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-400 resize-none placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={submitReply}
                  disabled={posting || !replyText.trim()}
                  className="h-6 px-2.5 rounded-lg bg-accent-600 text-white text-[10px] font-bold hover:bg-accent-500 disabled:opacity-40 transition-colors flex items-center gap-1"
                >
                  {posting && <svg className="animate-spin w-2.5 h-2.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                  Reply
                </button>
                <button
                  onClick={() => { setReplyOpen(false); setReplyText('') }}
                  className="h-6 px-2 rounded-lg text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setReplyOpen(true); setTimeout(() => textRef.current?.focus(), 50) }}
              className="mt-1 text-[10px] text-gray-400 dark:text-gray-600 hover:text-accent-600 dark:hover:text-accent-400 transition-colors font-medium"
            >
              Reply
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export type BlockCommentStatus = Record<string, { open: number; resolved: number; approval: 'approved' | 'changes_requested' | null }>

interface Props {
  projectId: string
  user: User
  isOpen: boolean
  onClose: () => void
  onUnreadCount: (n: number) => void
  onBlockStatus?: (status: BlockCommentStatus) => void
}

export default function FeedbackPanel({ projectId, user, isOpen, onClose, onUnreadCount, onBlockStatus }: Props) {
  const [comments, setComments]   = useState<FeedbackComment[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading]     = useState(false)
  const [filter, setFilter]       = useState<Filter>('open')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/feedback`)
      if (res.ok) {
        const d = await res.json()
        setComments(d.comments ?? [])
        setApprovals(d.approvals ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // Initial load on mount so block status indicators appear before panel is opened
  useEffect(() => { load() }, [load])

  // Always poll (10s when open, 60s when closed), paused when tab is hidden
  useEffect(() => {
    const interval = isOpen ? 10000 : 60000
    const start = () => { pollRef.current = setInterval(load, interval) }
    const stop  = () => { pollRef.current && clearInterval(pollRef.current); pollRef.current = null }
    const onVisibility = () => document.hidden ? stop() : (stop(), start())
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [isOpen, load])

  // Instant refresh when a reviewer posts a comment or approval in the share view
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`feedback-${projectId}`)
      .on('broadcast' as const, { event: 'updated' }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, load])

  // Compute unread count (comments since last read, reviewer only)
  useEffect(() => {
    const key = `dg:feedback-read:${projectId}`
    const lastRead = localStorage.getItem(key)
    const cutoff = lastRead ? new Date(lastRead).getTime() : 0
    const unread = comments.filter(c =>
      c.author_type === 'reviewer' &&
      c.parent_id === null &&
      new Date(c.created_at).getTime() > cutoff
    ).length
    onUnreadCount(unread)
  }, [comments, projectId, onUnreadCount])

  // Emit block-level status whenever comments or approvals change
  useEffect(() => {
    if (!onBlockStatus) return
    const roots = comments.filter(c => !c.parent_id)
    const blockIds = Array.from(new Set([
      ...roots.map(c => c.block_id),
      ...approvals.map(a => a.block_id),
    ]))
    const status: BlockCommentStatus = {}
    for (const bid of blockIds) {
      const blockRoots = roots.filter(c => c.block_id === bid)
      status[bid] = {
        open: blockRoots.filter(c => !c.resolved_at).length,
        resolved: blockRoots.filter(c => !!c.resolved_at).length,
        approval: blockApprovalSummary(approvals, bid),
      }
    }
    onBlockStatus(status)
  }, [comments, approvals, onBlockStatus])

  // Mark as read when panel is opened
  useEffect(() => {
    if (isOpen) localStorage.setItem(`dg:feedback-read:${projectId}`, new Date().toISOString())
  }, [isOpen, projectId])

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleResolve(commentId: string) {
    const res = await fetch(`/api/projects/${projectId}/feedback/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentId }),
    })
    if (res.ok) {
      const d = await res.json()
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved_at: d.resolved_at, resolved_by: d.resolved_by } : c))
    }
  }

  async function handleReply(parentId: string, blockId: string, text: string) {
    const res = await fetch(`/api/projects/${projectId}/feedback/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId, blockId, text }),
    })
    if (res.ok) {
      const d = await res.json()
      setComments(prev => [...prev, d])
    }
  }

  function handleReactionUpdate(id: string, reactions: Record<string, string[]>) {
    setComments(prev => prev.map(c => c.id === id ? { ...c, reactions } : c))
  }

  // ── Build grouped data ────────────────────────────────────────────────────

  const roots = comments.filter(c => !c.parent_id)
  const replies = comments.filter(c => !!c.parent_id)

  const blockIds = Array.from(new Set(roots.map(c => c.block_id)))
  const groups: BlockGroup[] = blockIds.map(bid => {
    const blockRoots = roots.filter(c => c.block_id === bid)
    const threads: Thread[] = blockRoots.map(root => ({
      root,
      replies: replies.filter(r => r.parent_id === root.id),
    }))
    return {
      blockId: bid,
      label: blockLabel(bid),
      threads,
      approval: blockApprovalSummary(approvals, bid),
    }
  })

  const filteredGroups = groups.map(g => ({
    ...g,
    threads: g.threads.filter(t =>
      filter === 'all' ? true :
      filter === 'open' ? !t.root.resolved_at :
      !!t.root.resolved_at
    ),
  })).filter(g => g.threads.length > 0)

  const openCount = roots.filter(c => !c.resolved_at).length
  const resolvedCount = roots.filter(c => !!c.resolved_at).length
  const totalCount = roots.length

  return (
    <>
      {/* Backdrop on mobile */}
      {isOpen && <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={onClose} />}

      {/* Panel */}
      <div className={`fixed right-0 top-0 bottom-0 z-40 w-[340px] bg-white dark:bg-gray-900 border-l border-gray-100 dark:border-gray-800 flex flex-col transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>

        {/* Header */}
        <div className="shrink-0 flex items-center gap-2.5 px-4 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <svg className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="font-semibold text-sm text-gray-900 dark:text-white flex-1">Feedback</span>
          {loading && (
            <svg className="animate-spin w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <button onClick={load} title="Refresh" className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="shrink-0 flex gap-1 px-4 py-2 border-b border-gray-50 dark:border-gray-800">
          {([['open', `Open (${openCount})`], ['resolved', `Resolved (${resolvedCount})`], ['all', `All (${totalCount})`]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`h-6 px-2.5 rounded-full text-[10px] font-semibold transition-all ${
                filter === val
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!loading && filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                  {filter === 'open' ? 'No open threads' : filter === 'resolved' ? 'No resolved threads' : 'No feedback yet'}
                </p>
                <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5">Share the review link to get comments</p>
              </div>
            </div>
          ) : (
            <div className="px-3 py-3 space-y-4">
              {filteredGroups.map(group => (
                <div key={group.blockId}>
                  {/* Block header */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{group.label}</span>
                    {group.approval === 'approved' && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                        <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        Approved
                      </span>
                    )}
                    {group.approval === 'changes_requested' && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                        <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" /></svg>
                        Changes
                      </span>
                    )}
                  </div>
                  {/* Threads */}
                  <div className="space-y-2">
                    {group.threads.map(thread => (
                      <ThreadCard
                        key={thread.root.id}
                        thread={thread}
                        projectId={projectId}
                        onResolve={handleResolve}
                        onReply={handleReply}
                        onReactionUpdate={handleReactionUpdate}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — reviewer identity reminder */}
        <div className="shrink-0 px-4 py-2.5 border-t border-gray-50 dark:border-gray-800">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
            Replying as <span className="font-semibold text-gray-600 dark:text-gray-400">{user.email}</span>
          </p>
        </div>
      </div>
    </>
  )
}
