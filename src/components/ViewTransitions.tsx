'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

type VTDocument = Document & { startViewTransition: (cb: () => void) => void }

function startTransition(cb: () => void) {
  if ('startViewTransition' in document) {
    (document as VTDocument).startViewTransition(cb)
  } else {
    cb()
  }
}

// Intercepts all same-origin <a> clicks and wraps them in the View Transitions API
export function ViewTransitionInterceptor() {
  const router = useRouter()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href || !href.startsWith('/')) return
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      if (!('startViewTransition' in document)) return

      e.preventDefault()
      startTransition(() => router.push(href))
    }

    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [router])

  return null
}

// Drop-in replacement for useRouter() that animates programmatic navigations
export function useTransitionRouter() {
  const router = useRouter()
  return {
    push:    (href: string) => startTransition(() => router.push(href)),
    replace: (href: string) => startTransition(() => router.replace(href)),
  }
}
