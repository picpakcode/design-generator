'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { DesignState } from '@/types'
import { stripProjectBlobUrls } from '@/lib/db'

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

export function presenceColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) & 0x7fffffff
  }
  return COLORS[hash % COLORS.length]
}

export interface Peer {
  userId: string
  email: string
  color: string
  activeBlockId: string | null
}

interface PresenceMeta {
  email: string
  color: string
  activeBlockId: string | null
}

export function usePresence({
  projectId,
  userId,
  email,
  activeBlockId,
  onStateUpdate,
}: {
  projectId: string | undefined
  userId: string | undefined
  email: string | undefined
  activeBlockId: string | null
  onStateUpdate?: (state: DesignState) => void
}) {
  const [peers, setPeers] = useState<Peer[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const onStateUpdateRef = useRef(onStateUpdate)
  onStateUpdateRef.current = onStateUpdate

  useEffect(() => {
    if (!projectId) return

    const supabase = createClient()
    const myKey = userId ?? `anon-${Math.random().toString(36).slice(2)}`

    const ch = supabase.channel(`project:${projectId}`, {
      config: { presence: { key: myKey } },
    })

    ch.on('presence', { event: 'sync' }, () => {
      const raw = ch.presenceState<PresenceMeta>()
      const list: Peer[] = []
      for (const [uid, metas] of Object.entries(raw)) {
        if (uid === myKey) continue
        const m = metas[0]
        if (m) list.push({ userId: uid, email: m.email, color: m.color, activeBlockId: m.activeBlockId })
      }
      setPeers(list)
    })

    ch.on('broadcast', { event: 'state_update' }, ({ payload }) => {
      if (payload.from !== myKey) {
        onStateUpdateRef.current?.(payload.state as DesignState)
      }
    })

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({
          email: email ?? 'Anonymous',
          color: presenceColor(myKey),
          activeBlockId: null,
        })
      }
    })

    channelRef.current = ch

    return () => { void ch.unsubscribe(); channelRef.current = null; setPeers([]) }
  }, [projectId, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-track when activeBlockId or email changes
  useEffect(() => {
    const ch = channelRef.current
    if (!ch || !userId) return
    ch.track({
      email: email ?? 'Anonymous',
      color: presenceColor(userId),
      activeBlockId,
    }).catch(() => {})
  }, [activeBlockId, userId, email])

  const broadcastState = useCallback((state: DesignState) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'state_update',
      payload: { state: stripProjectBlobUrls(state), from: userId ?? 'anon' },
    })
  }, [userId])

  return { peers, broadcastState }
}
