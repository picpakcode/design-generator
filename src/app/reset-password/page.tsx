'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [checked, setChecked]     = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [info, setInfo]           = useState<string | null>(null)
  const [busy, setBusy]           = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
      setChecked(true)
      if (!data.session) {
        // Redirect to home after a short delay so the error is visible briefly
        setTimeout(() => router.push('/'), 2000)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setInfo('Password updated!')
      setTimeout(() => router.push('/dashboard'), 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>
      </div>
    )
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="w-full max-w-xs bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 px-5 py-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No active session found. Redirecting you home…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-xs bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2 mb-0.5">
            <img src="/Favicon.png" alt="Doc's Design Generator" className="w-5 h-5 rounded-md object-contain shrink-0" />
            <span className="text-sm font-bold text-gray-900 dark:text-white">Doc&rsquo;s Design Generator</span>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 ml-7">DocsDiesel internal tool</p>
        </div>

        <div className="px-5 mb-4">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Set a new password</p>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
              New password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:focus:ring-gray-100/10 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
              Confirm password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:focus:ring-gray-100/10 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 px-3 py-2 rounded">
              <svg className="w-3.5 h-3.5 text-red-400 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px] text-red-500">{error}</p>
            </div>
          )}
          {info && (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded">
              <svg className="w-3.5 h-3.5 text-emerald-500 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px] text-emerald-600">{info}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !!info}
            className="w-full h-9 rounded bg-gray-900 dark:bg-gray-700 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'Please wait…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
