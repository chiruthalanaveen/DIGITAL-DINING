'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'digitaldining-theme'

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    const initial = saved === 'light' || saved === 'dark'
      ? saved
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')

    document.documentElement.dataset.theme = initial
    document.documentElement.style.colorScheme = initial
    setTheme(initial)
    setReady(true)
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    const root = document.documentElement

    // Short, reliable transition. Avoid the slow View Transition API on mobile.
    root.classList.add('dd-theme-switching')
    root.dataset.theme = next
    root.style.colorScheme = next
    window.localStorage.setItem(STORAGE_KEY, next)
    setTheme(next)

    window.setTimeout(() => {
      root.classList.remove('dd-theme-switching')
    }, 180)
  }

  if (!ready) {
    return <span aria-hidden="true" className="dd-theme-toggle-placeholder" />
  }

  const isLight = theme === 'light'

  return (
    <button
      type="button"
      className={`dd-theme-toggle ${isLight ? 'is-day' : 'is-night'}`}
      onClick={toggleTheme}
      aria-label={isLight ? 'Switch to night mode' : 'Switch to day mode'}
      aria-pressed={isLight}
    >
      <span className="dd-theme-track" aria-hidden="true">
        <span className="dd-theme-stars" />
        <span className="dd-theme-clouds" />
        <span className="dd-theme-sun">☀</span>
        <span className="dd-theme-moon">☾</span>
        <span className="dd-theme-thumb">{isLight ? '☀️' : '🌙'}</span>
      </span>
      <span className="dd-theme-word">{isLight ? 'Day' : 'Night'}</span>
    </button>
  )
}
