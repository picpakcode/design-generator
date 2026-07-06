'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup' | 'magic' | 'reset'

interface Props {
  open: boolean
  onClose: () => void
}

export default function AuthModal({ open, onClose }: Props) {
  const [mode, setMode]         = useState<Mode>('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [info, setInfo]         = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open, mode])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const switchMode = (m: Mode) => { setMode(m); setError(null); setInfo(null) }

  const callbackUrl = `${window.location.origin}/auth/callback`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setInfo(null); setBusy(true)
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        })
        if (error) throw error
        setInfo('Check your email for a reset link.')
        return
      }
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: callbackUrl },
        })
        if (error) throw error
        setInfo('Link sent — check your inbox.')
        return
      }
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: callbackUrl },
        })
        if (error) throw error
        if (!data.session) setInfo('Check your email to confirm your account.')
        else onClose()
        return
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-xs bg-white dark:bg-gray-900 rounded-none shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden animate-slide-up"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <img src="/Favicon.png" alt="Doc's Design Generator" className="w-5 h-5 rounded-none object-contain shrink-0" />
                <span className="text-sm font-bold text-gray-900 dark:text-white">Doc&rsquo;s Design Generator</span>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 ml-7">DocsDiesel internal tool</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-none text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mode tabs — hidden in reset mode */}
          {mode !== 'reset' && (
            <div className="px-5 mb-4">
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-none p-0.5 gap-0.5">
                {(['signin', 'signup'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={`flex-1 h-7 rounded-none text-[11px] font-bold transition-all ${
                      mode === m
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    {m === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reset mode heading */}
          {mode === 'reset' && (
            <div className="px-5 mb-4">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Reset your password</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Email
              </label>
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@docsdiesel.com"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-none bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:focus:ring-gray-100/10 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
              />
            </div>

            {mode !== 'magic' && mode !== 'reset' && (
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-none bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:focus:ring-gray-100/10 focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 px-3 py-2 rounded-none">
                <svg className="w-3.5 h-3.5 text-red-400 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] text-red-500">{error}</p>
              </div>
            )}
            {info && (
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-none">
                <svg className="w-3.5 h-3.5 text-emerald-500 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] text-emerald-600">{info}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !!info}
              className="w-full h-9 rounded-none bg-gray-900 dark:bg-gray-700 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy
                ? 'Please wait…'
                : mode === 'reset'
                  ? 'Send reset link'
                  : mode === 'magic'
                    ? 'Send magic link'
                    : mode === 'signup'
                      ? 'Create account'
                      : 'Sign in'}
            </button>

            <div className="pt-0.5 text-center space-y-1.5">
              {mode === 'signin' && (
                <>
                  <div>
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => switchMode('magic')}
                      className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      Send a magic link instead →
                    </button>
                  </div>
                </>
              )}
              {mode === 'signup' && (
                <button
                  type="button"
                  onClick={() => switchMode('magic')}
                  className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Send a magic link instead →
                </button>
              )}
              {(mode === 'magic' || mode === 'reset') && (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  ← Back to sign in
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
