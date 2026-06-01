'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup' | 'magic'

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
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: callbackUrl },
        })
        if (error) throw error
        setInfo('Check your email to confirm your account.')
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
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-xs bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-5 h-5 rounded-md bg-gray-900 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-sm font-bold text-gray-900">Design Generator</span>
              </div>
              <p className="text-[10px] text-gray-400 ml-7">DocsDiesel internal tool</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mode tabs */}
          <div className="px-5 mb-4">
            <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
              {(['signin', 'signup'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`flex-1 h-7 rounded-[10px] text-[11px] font-bold transition-all ${
                    mode === m
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          </div>

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
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/15 focus:border-gray-400 placeholder:text-gray-300 transition-all"
              />
            </div>

            {mode !== 'magic' && (
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
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/15 focus:border-gray-400 placeholder:text-gray-300 transition-all"
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                <svg className="w-3.5 h-3.5 text-red-400 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] text-red-500">{error}</p>
              </div>
            )}
            {info && (
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
                <svg className="w-3.5 h-3.5 text-emerald-500 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] text-emerald-600">{info}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !!info}
              className="w-full h-9 rounded-xl bg-gray-900 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy
                ? 'Please wait…'
                : mode === 'magic'
                  ? 'Send magic link'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Sign in'}
            </button>

            <div className="pt-0.5 text-center">
              {mode !== 'magic' ? (
                <button
                  type="button"
                  onClick={() => switchMode('magic')}
                  className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Send a magic link instead →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
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
