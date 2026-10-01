'use client'

import { useEffect } from 'react'

const VIEWPORT_CONTENT =
  'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'

const STYLE_ID = 'digital-dine-mobile-fit-style'

export function useMobileViewportLock() {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    let viewport = document.querySelector('meta[name="viewport"]')
    const createdViewport = !viewport
    const previousViewportContent = viewport?.getAttribute('content') || ''

    if (!viewport) {
      viewport = document.createElement('meta')
      viewport.setAttribute('name', 'viewport')
      document.head.appendChild(viewport)
    }

    viewport.setAttribute('content', VIEWPORT_CONTENT)

    let style = document.getElementById(STYLE_ID)
    const createdStyle = !style

    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
        html,
        body {
          width: 100%;
          max-width: 100%;
          min-height: 100%;
          overflow-x: hidden;
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
          overscroll-behavior-x: none;
        }

        body {
          margin: 0;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        img,
        video,
        canvas {
          max-width: 100%;
        }

        button,
        input,
        select,
        textarea {
          max-width: 100%;
        }

        button,
        a,
        input,
        select,
        textarea {
          touch-action: manipulation;
        }

        @media (max-width: 767px) {
          input,
          select,
          textarea {
            font-size: 16px !important;
          }
        }
      `
      document.head.appendChild(style)
    }

    return () => {
      if (createdViewport) {
        viewport?.remove()
      } else if (viewport) {
        viewport.setAttribute('content', previousViewportContent)
      }

      if (createdStyle) {
        style?.remove()
      }
    }
  }, [])
}
