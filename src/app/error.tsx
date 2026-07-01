'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-6">
      <div className="text-center max-w-sm">
        <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-4">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-[13px] font-semibold text-gray-900 dark:text-white mb-1">Something went wrong</p>
        <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-5">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center h-8 px-3 rounded bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[12px] font-semibold transition-colors hover:bg-gray-700 dark:hover:bg-gray-100"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center h-8 px-3 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-[12px] font-semibold transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
