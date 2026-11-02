'use client'

import { useSyncExternalStore } from 'react'

function standaloneSnapshot() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true)
}

function serverSnapshot() { return false }

function subscribe(listener) {
  const media = window.matchMedia?.('(display-mode: standalone)')
  media?.addEventListener?.('change', listener)
  window.addEventListener('appinstalled', listener)
  return () => {
    media?.removeEventListener?.('change', listener)
    window.removeEventListener('appinstalled', listener)
  }
}

/** Read browser display mode with an SSR-safe snapshot and native change events. */
export function useStandaloneMode() {
  return useSyncExternalStore(subscribe, standaloneSnapshot, serverSnapshot)
}
