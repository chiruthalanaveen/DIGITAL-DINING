'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'digitaldining-theme'

function applyTheme(theme) {
  const root = document.documentElement

  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)

    const initial =
      saved === 'light' || saved === 'dark'
        ? saved
        : window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'

    // Apply directly to <html> before updating React state.
    // This keeps the visual switch immediate.
    applyTheme(initial)
    setTheme(initial)
    setReady(true)
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'

    // Change the actual page theme first.
    applyTheme(next)
    setTheme(next)

    // Storage is not required for the visual update, so keep it off
    // the critical click path.
    window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch (error) {
        console.warn('Unable to save theme preference:', error)
      }
    }, 0)
  }

  if (!ready) {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-[34px] w-[78px] rounded-full bg-neutral-200 dark:bg-neutral-800"
      />
    )
  }

  const isLight = theme === 'light'

  return (
    <>
      <style jsx global>{`
        .dd-theme-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 0;
          padding: 0;
          background: transparent;
          color: currentColor;
          cursor: pointer;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        .dd-theme-track {
          position: relative;
          display: block;
          width: 62px;
          height: 32px;
          overflow: hidden;
          border-radius: 999px;
          background: linear-gradient(135deg, #10172d, #29365f);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.18),
            0 2px 7px rgba(0,0,0,.18);
        }

        .dd-theme-track::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #72c7ff, #eaf8ff);
          opacity: 0;
          transition: opacity 90ms linear;
        }

        .dd-theme-toggle.is-day .dd-theme-track::after {
          opacity: 1;
        }

        .dd-theme-stars,
        .dd-theme-clouds {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
        }

        .dd-theme-stars {
          background:
            radial-gradient(circle at 40px 8px, #fff 1px, transparent 2px),
            radial-gradient(circle at 51px 21px, #fff 1px, transparent 2px);
        }

        .dd-theme-clouds {
          opacity: 0;
          background:
            radial-gradient(circle at 17px 23px, #fff 5px, transparent 6px),
            radial-gradient(circle at 27px 20px, #fff 8px, transparent 9px),
            radial-gradient(circle at 39px 23px, #fff 5px, transparent 6px);
        }

        .dd-theme-toggle.is-day .dd-theme-stars {
          opacity: 0;
        }

        .dd-theme-toggle.is-day .dd-theme-clouds {
          opacity: .92;
        }

        .dd-theme-thumb {
          position: absolute;
          z-index: 3;
          top: 4px;
          left: 4px;
          display: flex;
          width: 24px;
          height: 24px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #edf1fb;
          font-size: 13px;
          box-shadow: 0 2px 6px rgba(0,0,0,.25);
          transform: translate3d(0,0,0);
          transition:
            transform 90ms cubic-bezier(.2,.8,.2,1),
            background-color 90ms linear;
          will-change: transform;
        }

        .dd-theme-toggle.is-day .dd-theme-thumb {
          transform: translate3d(30px,0,0);
          background: #ffd34f;
        }

        .dd-theme-word {
          min-width: 28px;
          font-size: 10px;
          font-weight: 800;
        }
      `}</style>

      <button
        type="button"
        className={`dd-theme-toggle ${isLight ? 'is-day' : 'is-night'}`}
        onClick={toggleTheme}
        aria-label={
          isLight ? 'Switch to night mode' : 'Switch to day mode'
        }
        aria-pressed={isLight}
      >
        <span className="dd-theme-track" aria-hidden="true">
          <span className="dd-theme-stars" />
          <span className="dd-theme-clouds" />
          <span className="dd-theme-thumb">
            {isLight ? '☀️' : '🌙'}
          </span>
        </span>

        <span className="dd-theme-word">
          {isLight ? 'Day' : 'Night'}
        </span>
      </button>
    </>
  )
}
