'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getCommerceClient } from '@/lib/commerce/client'

const SIGNUP_REDIRECT_PATH = '/commerce/auth?next=/commerce/apply'

function nextPath() {
  const next = new URL(window.location.href).searchParams.get('next')
  return next === '/commerce/apply' ? next : '/commerce/dashboard'
}

function verificationRedirect() {
  return `${window.location.origin}${SIGNUP_REDIRECT_PATH}`
}

// Keep browser diagnostics limited to machine-readable metadata. Auth error
// messages may contain private addresses or provider/database details and must
// never be echoed to the page or console verbatim.
function authDiagnostic(error, operation) {
  const rawCode = String(error?.code || '')
  const rawName = String(error?.name || '')
  const status = Number(error?.status)
  return {
    operation,
    code: /^[a-z0-9_]{1,80}$/i.test(rawCode) ? rawCode : 'unavailable',
    type: /^Auth[A-Za-z]{1,64}$/.test(rawName) ? rawName : 'unknown',
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
  }
}

// Display useful, safe errors without exposing email addresses, tokens,
// provider response bodies or an explicit account-existence check.
function ownerAuthError(error, operation) {
  const code = typeof error?.code === 'string' ? error.code : ''
  const status = Number.isInteger(error?.status) ? error.status : null

  // Code and HTTP status only; never log raw Auth errors or credentials.
  if (process.env.NODE_ENV === 'development') {
    console.warn('[commerce owner auth]', { operation, code: code || 'unknown', status })
  }

  switch (code) {
    case 'email_exists':
    case 'user_already_exists':
      return 'If you have already registered, sign in instead. If your email is not verified, use Resend verification email.'
    case 'email_address_not_authorized':
      return 'This Supabase project cannot send verification emails to this address. The platform administrator must configure a custom SMTP provider.'
    case 'over_email_send_rate_limit':
      return 'Too many verification emails were requested. Please wait before trying again.'
    case 'over_request_rate_limit':
      return 'Too many requests were made. Please wait a few minutes before trying again.'
    case 'email_provider_disabled':
    case 'signup_disabled':
      return 'New email signups are disabled in Supabase. Contact the platform administrator.'
    case 'email_not_confirmed':
      return 'Verify your email before signing in. Use Resend verification email if the message did not arrive.'
    case 'weak_password':
      return 'The password does not meet Supabase password requirements. Use a stronger password.'
    case 'email_address_invalid':
      return 'This email address is not accepted by Supabase. Use a valid email address.'
    case 'invalid_credentials':
      return 'Unable to sign in with these credentials. Check your email and password.'
    case 'captcha_failed':
      return 'The security check failed. Please retry the CAPTCHA.'
    case 'unexpected_failure':
      return 'Supabase could not complete signup. Check Authentication Logs and, if they identify a database issue, PostgreSQL Logs. Do not rerun the commerce migration.'
    default:
      break
  }

  // A provider 429 can occur without a stable error code.
  if (status === 429) {
    return 'Too many requests. Please wait before retrying.'
  }
  if (error?.name === 'AuthRetryableFetchError' || error?.name === 'AuthUnknownError') {
    return 'Unable to reach or parse the Supabase authentication response. Check the browser Network tab and your internet connection.'
  }
  if (status === 500 || status === 503) {
    return 'Supabase returned a server error. Check the matching Authentication Logs entry; if it mentions a database operation, check PostgreSQL Logs. Do not change database objects blindly.'
  }

  const prefix = {
    signup: 'Unable to create your account.',
    signin: 'Unable to sign in.',
    recover: 'Unable to request a recovery email.',
    update: 'Unable to update your password.',
    resend: 'Unable to resend the verification email.',
  }[operation] || 'Unable to complete your request.'

  // Show the safe machine-readable code so the operator can locate the exact
  // failure in Supabase Auth Logs. Do not show raw provider/internal messages.
  return code ? `${prefix} Supabase error code: ${code}.` : `${prefix} Please try again or check Supabase Authentication Logs.`
}

export default function OwnerAuth() {
  const router = useRouter()
  const [mode, setMode] = useState('signin')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [diagnostic, setDiagnostic] = useState(null)

  useEffect(() => {
    let active = true
    let subscription

    async function initialize() {
      try {
        const client = getCommerceClient('owner')
        const { data } = await client.auth.getSession()
        if (!active) return

        const query = new URL(window.location.href).searchParams
        setMode(
          query.get('recovery') === '1' && data.session
            ? 'update'
            : query.get('mode') === 'signup'
              ? 'signup'
              : 'signin'
        )

        subscription = client.auth.onAuthStateChange((event) => {
          if (active && event === 'PASSWORD_RECOVERY') {
            setMode('update')
          }
        }).data.subscription
      } catch {
        if (active) {
          setError('Owner sign-in is temporarily unavailable. Please try again later.')
        }
      }
    }

    void initialize()
    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  function changeMode(next) {
    setMode(next)
    setError('')
    setNotice('')
    setDiagnostic(null)
  }

  async function resendVerification() {
    if (busy) return
    if (!email.trim()) {
      setError('Enter your email address before requesting a verification message.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    setDiagnostic(null)

    try {
      const client = getCommerceClient('owner')
      const { error: resendError } = await client.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: verificationRedirect() },
      })

      if (resendError) {
        setDiagnostic(authDiagnostic(resendError, 'resend'))
        setError(ownerAuthError(resendError, 'resend'))
        return
      }

      setNotice('If this account is eligible, a verification email will be sent. Check your inbox and spam folder.')
    } catch (unexpected) {
      setDiagnostic(authDiagnostic(unexpected, 'resend'))
      setError('Unable to resend the verification email. Check your network and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError('')
    setNotice('')
    setDiagnostic(null)

    const fields = new FormData(event.currentTarget)

    try {
      const client = getCommerceClient('owner')
      const password = String(fields.get('password') || '')

      if (mode === 'signup') {
        const { data, error: signupError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              commerce_owner_name: String(fields.get('name') || '').trim(),
            },
            emailRedirectTo: verificationRedirect(),
          },
        })

        if (signupError) {
          setDiagnostic(authDiagnostic(signupError, 'signup'))
          setError(ownerAuthError(signupError, 'signup'))
          return
        }

        if (data?.session?.user?.email_confirmed_at) {
          router.push('/commerce/apply')
        } else {
          // signUp may return an obfuscated user for an existing account.
          // Never promise that a new email was delivered.
          setNotice('If verification is needed and email delivery is configured, check your inbox for a link. Already registered? Sign in or use Resend verification email.')
        }
      } else if (mode === 'recover') {
        const { error: recoveryError } = await client.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/commerce/auth?recovery=1` }
        )

        if (recoveryError) {
          setDiagnostic(authDiagnostic(recoveryError, 'recover'))
          setError(ownerAuthError(recoveryError, 'recover'))
          return
        }

        setNotice('If an account exists for this address, you will receive a recovery link. Please check your inbox.')
      } else if (mode === 'update') {
        const { error: updateError } = await client.auth.updateUser({ password })

        if (updateError) {
          setDiagnostic(authDiagnostic(updateError, 'update'))
          setError(ownerAuthError(updateError, 'update'))
          return
        }

        setNotice('Your password has been updated. You can now open your owner workspace.')
      } else {
        const { error: signinError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (signinError) {
          setDiagnostic(authDiagnostic(signinError, 'signin'))
          setError(ownerAuthError(signinError, 'signin'))
          return
        }

        router.push(nextPath())
      }
    } catch (unexpected) {
      setDiagnostic(authDiagnostic(unexpected, mode === 'signup' ? 'signup' : mode))
      setError('The authentication request could not be completed. Check your network and try again.')
    } finally {
      setBusy(false)
    }
  }

  const signup = mode === 'signup'
  const recovery = mode === 'recover'
  const canResend = (mode === 'signup' || mode === 'signin') && email.trim().length > 0

  return (
    <main className="co-main co-auth-layout">
      <section className="co-auth-story">
        <span className="co-eyebrow">Client Websites · Owner access</span>
        <h1>Small business.<br /><em>Big possibilities.</em></h1>
        <p>Your own catalog, your own customers and a workspace that keeps everything together.</p>
        <div className="co-auth-benefits">
          <span><b>01</b> One account for your assigned stores</span>
          <span><b>02</b> A catalog that belongs to your business</span>
          <span><b>03</b> Support from setup to opening day</span>
        </div>
      </section>
      <section className="co-card co-auth-card" aria-labelledby="co-auth-title">
        <span className="co-eyebrow">Welcome to your next chapter</span>
        <h2 id="co-auth-title">
          {signup
            ? 'Create your owner account'
            : recovery
              ? 'Recover your account'
              : mode === 'update'
                ? 'Choose a new password'
                : 'Welcome back.'}
        </h2>
        <p className="co-muted">
          {signup
            ? 'Start with an account. Your business application comes next.'
            : recovery
              ? 'We will send a secure recovery link to your email.'
              : mode === 'update'
                ? 'Use a strong password that you do not use elsewhere.'
                : 'Sign in to manage your website or continue your application.'}
        </p>
        <form className="co-form" onSubmit={submit}>
          {signup && (
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={120}
                placeholder="How should we address you?"
              />
            </label>
          )}
          {mode !== 'update' && (
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@yourbusiness.com"
              />
            </label>
          )}
          {!recovery && (
            <label>
              {mode === 'update' ? 'New password' : 'Password'}
              <input
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete={signup || mode === 'update' ? 'new-password' : 'current-password'}
                placeholder="At least 8 characters"
              />
            </label>
          )}
          {error && <p className="co-message co-message-error" role="alert">{error}</p>}
          {diagnostic && process.env.NODE_ENV === 'development' && (
            <p className="co-form-note" role="status">
              Local diagnostics: {diagnostic.operation} · HTTP {diagnostic.status ?? 'unknown'} ·
              {' '}{diagnostic.type} · code {diagnostic.code}. For further details, open Chrome
              {' '}DevTools → Network → Fetch/XHR and inspect the Auth request's Response tab.
              {' '}Never share passwords, authorization headers or tokens.
            </p>
          )}
          {notice && <p className="co-message co-message-success" role="status">{notice}</p>}
          <button className="co-button co-button-primary co-button-block" disabled={busy} type="submit">
            {busy
              ? 'Please wait…'
              : signup
                ? 'Create owner account'
                : recovery
                  ? 'Send recovery link'
                  : mode === 'update'
                    ? 'Update password'
                    : 'Sign in'}
            {' '}<span aria-hidden="true">→</span>
          </button>
        </form>
        <div className="co-auth-links">
          {mode === 'signin' ? (
            <>
              <button type="button" disabled={busy} onClick={() => changeMode('recover')}>
                Forgot password?
              </button>
              <button type="button" disabled={busy} onClick={() => changeMode('signup')}>
                Create an account
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => changeMode('signin')}>
              Back to sign in
            </button>
          )}
          {canResend && (
            <button type="button" disabled={busy} onClick={() => void resendVerification()}>
              Resend verification email
            </button>
          )}
        </div>
        <p className="co-fine-print">
          This account is for Client Websites. Your existing restaurant and delivery sessions stay separate.
        </p>
        {mode === 'update' && notice && (
          <Link className="co-text-link" href="/commerce/dashboard">
            Open owner workspace →
          </Link>
        )}
      </section>
    </main>
  )
}