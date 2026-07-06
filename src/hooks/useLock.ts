'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { acquireLock, releaseLock, renewLock, forceLock } from '@/lib/db'

const HEARTBEAT_MS = 20_000   // renew lock every 20 s
const RETRY_MS     = 8_000    // retry acquiring if another user holds it

export type LockState = 'acquiring' | 'held' | 'taken'

export function useLock(
  projectId: string | undefined,
  userId:    string | undefined,
  email:     string | undefined,
) {
  const [lockState,   setLockState]   = useState<LockState>('acquiring')
  const [holderEmail, setHolderEmail] = useState<string | null>(null)
  const heldRef   = useRef(false)
  const aliveRef  = useRef(true)

  useEffect(() => {
    if (!projectId || !userId || !email) return
    aliveRef.current = true

    const db = createClient()

    async function tryAcquire() {
      if (!aliveRef.current) return
      const { acquired, holderEmail: he } = await acquireLock(db, projectId!, userId!, email!)
      if (!aliveRef.current) return
      if (acquired) {
        heldRef.current = true
        setLockState('held')
        setHolderEmail(null)
      } else {
        heldRef.current = false
        setLockState('taken')
        setHolderEmail(he)
        setTimeout(() => { if (aliveRef.current) tryAcquire() }, RETRY_MS)
      }
    }

    tryAcquire()

    // Heartbeat — keep the lock alive while editing
    const hb = setInterval(() => {
      if (heldRef.current) renewLock(db, projectId!, userId!).catch(() => {})
    }, HEARTBEAT_MS)

    // Listen for lock changes broadcast by other clients
    const supabase = createClient()
    const channel = supabase
      .channel(`lock:${projectId}`)
      .on('broadcast', { event: 'lock_changed' }, () => {
        // Someone acquired or released — re-evaluate immediately
        tryAcquire()
      })
      .subscribe()

    // Best-effort release on tab close
    function onUnload() {
      if (heldRef.current) releaseLock(db, projectId!, userId!).catch(() => {})
    }
    window.addEventListener('beforeunload', onUnload)

    return () => {
      aliveRef.current = false
      clearInterval(hb)
      window.removeEventListener('beforeunload', onUnload)
      supabase.removeChannel(channel)
      if (heldRef.current) {
        releaseLock(db, projectId!, userId!).catch(() => {})
        heldRef.current = false
      }
    }
  }, [projectId, userId, email])

  /** Steal the lock from whoever holds it, then notify all clients. */
  const takeover = useCallback(async () => {
    if (!projectId || !userId || !email) return
    const db = createClient()
    await forceLock(db, projectId, userId, email)
    heldRef.current = true
    setLockState('held')
    setHolderEmail(null)

    // Notify peers so they immediately see the lock was taken
    const supabase = createClient()
    const ch = supabase.channel(`lock:${projectId}`)
    await ch.subscribe()
    await ch.send({ type: 'broadcast', event: 'lock_changed', payload: {} })
    supabase.removeChannel(ch)
  }, [projectId, userId, email])

  return {
    lockState,
    holderEmail,
    takeover,
    isEditor: lockState === 'held',
  }
}
