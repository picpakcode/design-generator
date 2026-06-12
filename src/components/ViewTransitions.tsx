'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type VTDocument = Document & {
  startViewTransition: (cb: () => Promise<void>) => void
}

// Wraps navigation in startViewTransition, waiting for the new page to commit
// before the browser captures the "new" state snapshot.
function transitionTo(
  resolveRef: ReturnType<typeof useRef<(() => void) | null>>,
  navigate: () => void
) {
  ;(document as VTDocument).startViewTransition(() =>
    new Promise<void>(resolve => {
      // 4 s fallback in case navigation fails / pathname never changes
      const fallback = setTimeout(resolve, 4000)
      resolveRef.current = () => { clearTimeout(fallback); resolve() }
      navigate()
    })
  )
}

// Intercepts all same-origin <a> clicks and wraps them in the View Transitions API.
// Registered in capture phase so it fires before Next.js Link's own handler,
// preventing duplicate router.push calls.
export function ViewTransitionInterceptor() {
  const router = useRouter()
  const pathname = usePathname()
  const resolveRef = useRef<(() => void) | null>(null)

  // When the new page has been committed to the DOM, resolve the pending promise
  // so the browser can capture the new state and start the animation.
  useEffect(() => {
    resolveRef.current?.()
    resolveRef.current = null
  }, [pathname])

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
      transitionTo(resolveRef, () => router.push(href))
    }

    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [router])

  return null
}

// Drop-in replacement for useRouter() that animates programmatic navigations
export function useTransitionRouter() {
  const router = useRouter()
  const pathname = usePathname()
  const resolveRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    resolveRef.current?.()
    resolveRef.current = null
  }, [pathname])

  return {
    push:    (href: string) => {
      if (!('startViewTransition' in document)) { router.push(href); return }
      transitionTo(resolveRef, () => router.push(href))
    },
    replace: (href: string) => {
      if (!('startViewTransition' in document)) { router.replace(href); return }
      transitionTo(resolveRef, () => router.replace(href))
    },
  }
}
