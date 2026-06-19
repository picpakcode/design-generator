'use client'
import { useState, useEffect, useCallback, FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { Suspense } from 'react'

function ConnectContent() {
  const searchParams = useSearchParams()
  const redirectUri        = searchParams.get('redirect_uri') ?? ''
  const state              = searchParams.get('state') ?? ''
  const codeChallenge      = searchParams.get('code_challenge') ?? ''
  const codeChallengeMethod = searchParams.get('code_challenge_method') ?? 'S256'

  const [user, setUser]       = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [busy, setBusy]       = useState(false)
  const [denied, setDenied]   = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      setChecking(false)
    })
  }, [])

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setAuthError('')
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setAuthError(error.message); setBusy(false); return }
    setUser(data.user)
    setBusy(false)
  }

  const handleAllow = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/auth/mcp/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uri:          redirectUri,
          state,
          code_challenge:        codeChallenge,
          code_challenge_method: codeChallengeMethod,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setAuthError(json.error ?? 'Something went wrong'); setBusy(false); return }
      window.location.href = json.redirect_to
    } catch {
      setAuthError('Network error, please try again')
      setBusy(false)
    }
  }, [redirectUri, state, codeChallenge, codeChallengeMethod])

  const handleDeny = () => {
    setDenied(true)
    const url = new URL(redirectUri)
    url.searchParams.set('error', 'access_denied')
    if (state) url.searchParams.set('state', state)
    window.location.href = url.toString()
  }

  // Missing required OAuth params — probably visited directly
  if (!redirectUri || !codeChallenge) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-4">
        <div className="w-full max-w-sm rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-8 text-center">
          <p className="text-sm text-neutral-500">This page is part of the Claude connector flow. Open it from Claude.</p>
        </div>
      </div>
    )
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="w-5 h-5 rounded-full border-2 border-[#c44a4a] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">

          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-neutral-100 dark:border-neutral-800 text-center">
            <div className="flex items-center justify-center gap-3 mb-5">
              {/* Design Generator mark */}
              <div className="w-9 h-9 rounded bg-[#c44a4a] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">DG</span>
              </div>
              <svg className="w-5 h-5 text-neutral-300 dark:text-neutral-600" fill="none" viewBox="0 0 20 20">
                <path d="M4 10h12M13 7l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {/* Claude mark */}
              <div className="w-9 h-9 rounded bg-[#D97757] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">C</span>
              </div>
            </div>
            <h1 className="text-[13px] font-bold uppercase tracking-widest text-neutral-800 dark:text-neutral-100">
              Connect to Claude
            </h1>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Claude will be able to read and edit your Design Generator projects and search Canto images on your behalf.
            </p>
          </div>

          <div className="px-8 py-6">
            {!user ? (
              /* ── Login form ── */
              <>
                <p className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-4">
                  Sign in to your account
                </p>
                <form onSubmit={handleLogin} className="space-y-3">
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full h-9 px-3 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 outline-none focus:border-[#c44a4a] transition-colors"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full h-9 px-3 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 outline-none focus:border-[#c44a4a] transition-colors"
                  />
                  {authError && (
                    <p className="text-xs text-[#c44a4a]">{authError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full h-9 rounded bg-[#c44a4a] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#b03d3d] disabled:opacity-50 transition-colors"
                  >
                    {busy ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>
                <p className="mt-4 text-center text-xs text-neutral-400">
                  Don&apos;t have an account?{' '}
                  <a href="/" className="text-[#c44a4a] hover:underline">Sign up at the app</a>
                </p>
              </>
            ) : (
              /* ── Logged in: show Allow/Deny ── */
              <>
                <div className="flex items-center gap-2.5 mb-5 p-3 rounded bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700">
                  <div className="w-7 h-7 rounded-full bg-[#c44a4a]/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-[#c44a4a] text-[10px] font-bold uppercase">
                      {user.email?.[0] ?? '?'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Signed in as</p>
                    <p className="text-xs text-neutral-700 dark:text-neutral-200 truncate">{user.email}</p>
                  </div>
                </div>

                <p className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-3">
                  Claude will be able to
                </p>
                <ul className="space-y-2 mb-6">
                  {[
                    'View and edit your design projects',
                    'Update product slot copy and images',
                    'Search Canto for photos',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                      <svg className="w-3.5 h-3.5 text-[#c44a4a] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 14 14">
                        <path d="M2 7l4 4 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>

                {authError && <p className="text-xs text-[#c44a4a] mb-3">{authError}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={handleDeny}
                    disabled={busy || denied}
                    className="flex-1 h-9 rounded border border-neutral-200 dark:border-neutral-700 text-[11px] font-bold uppercase tracking-widest text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAllow}
                    disabled={busy}
                    className="flex-1 h-9 rounded bg-[#c44a4a] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#b03d3d] disabled:opacity-50 transition-colors"
                  >
                    {busy ? 'Connecting…' : 'Allow'}
                  </button>
                </div>

                <p className="mt-4 text-center text-[10px] text-neutral-400">
                  Not you?{' '}
                  <button
                    className="text-[#c44a4a] hover:underline"
                    onClick={async () => {
                      await createClient().auth.signOut()
                      setUser(null)
                    }}
                  >
                    Sign out
                  </button>
                </p>
              </>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-[10px] text-neutral-400">
          Doc&apos;s Diesel Design Generator
        </p>
      </div>
    </div>
  )
}

export default function ConnectPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="w-5 h-5 rounded-full border-2 border-[#c44a4a] border-t-transparent animate-spin" />
      </div>
    }>
      <ConnectContent />
    </Suspense>
  )
}
