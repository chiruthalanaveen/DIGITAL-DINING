'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'digitaldining-theme'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'

  const saved = window.localStorage.getItem(STORAGE_KEY)

  if (saved === 'light' || saved === 'dark') {
    return saved
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const initialTheme = getInitialTheme()

    document.documentElement.dataset.theme = initialTheme
    setTheme(initialTheme)
    setMounted(true)
  }, [])

  function changeTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'

    document.documentElement.dataset.theme = nextTheme
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
    setTheme(nextTheme)

    window.dispatchEvent(
      new CustomEvent('digitaldining-theme-change', {
        detail: { theme: nextTheme },
      })
    )
  }

  if (!mounted) {
    return (
      <span
        style={{
          display: 'inline-block',
          width: '108px',
          height: '38px',
        }}
        aria-hidden="true"
      />
    )
  }

  const isLight = theme === 'light'

  return (
    <button
      type="button"
      onClick={changeTheme}
      className={`dd-theme-toggle ${isLight ? 'is-light' : 'is-dark'}`}
      aria-label={isLight ? 'Switch to night mode' : 'Switch to day mode'}
      aria-pressed={isLight}
    >
      <span className="dd-theme-toggle-background">
        <span className="dd-theme-stars">✦ · ✧</span>
        <span className="dd-theme-cloud">☁</span>
      </span>

      <span className="dd-theme-toggle-knob">
        {isLight ? '☀️' : '🌙'}
      </span>

      <span className="dd-theme-toggle-text">
        {isLight ? 'Day' : 'Night'}
      </span>
    </button>
  )
}