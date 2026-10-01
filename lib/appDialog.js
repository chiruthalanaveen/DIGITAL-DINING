'use client'

const DIALOG_ROOT_ID = 'digital-dine-app-dialog-root'
const NOTICE_ROOT_ID = 'digital-dine-app-notice-root'

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function inferTone(message) {
  const text = String(message || '').toLowerCase()

  if (
    text.includes('failed') ||
    text.includes('unable') ||
    text.includes('invalid') ||
    text.includes('error') ||
    text.includes('denied') ||
    text.includes('required') ||
    text.includes('missing')
  ) {
    return 'error'
  }

  if (
    text.includes('success') ||
    text.includes('saved') ||
    text.includes('updated') ||
    text.includes('copied') ||
    text.includes('created') ||
    text.includes('completed') ||
    text.includes('confirmed') ||
    text.includes('added') ||
    text.includes('deleted')
  ) {
    return 'success'
  }

  return 'info'
}

function removeExistingDialog() {
  if (!canUseDom()) return
  document.getElementById(DIALOG_ROOT_ID)?.remove()
}

function createOverlay() {
  removeExistingDialog()

  const overlay = document.createElement('div')
  overlay.id = DIALOG_ROOT_ID
  overlay.setAttribute('role', 'presentation')
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483646',
    'display:flex',
    'align-items:flex-end',
    'justify-content:center',
    'padding:16px',
    'padding-bottom:max(16px,env(safe-area-inset-bottom))',
    'background:rgba(0,0,0,.58)',
    'backdrop-filter:blur(4px)',
    '-webkit-backdrop-filter:blur(4px)',
  ].join(';')

  const panel = document.createElement('div')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.style.cssText = [
    'width:min(100%,430px)',
    'max-height:min(82dvh,720px)',
    'overflow:auto',
    'border:1px solid rgba(255,255,255,.10)',
    'border-radius:26px',
    'background:#111111',
    'color:#ffffff',
    'box-shadow:0 24px 80px rgba(0,0,0,.45)',
    'padding:20px',
    'font-family:inherit',
  ].join(';')

  if (window.matchMedia?.('(min-width: 640px)').matches) {
    overlay.style.alignItems = 'center'
  }

  overlay.appendChild(panel)
  document.body.appendChild(overlay)

  return { overlay, panel }
}

function createText(tag, text, cssText) {
  const element = document.createElement(tag)
  element.textContent = String(text || '')
  element.style.cssText = cssText
  return element
}

function createButton(label, variant = 'secondary') {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.style.cssText = [
    'min-height:48px',
    'border-radius:14px',
    'padding:0 18px',
    'font:inherit',
    'font-size:13px',
    'font-weight:800',
    'cursor:pointer',
    'touch-action:manipulation',
    variant === 'primary'
      ? 'border:1px solid #f97316;background:#f97316;color:#fff'
      : variant === 'danger'
        ? 'border:1px solid #dc2626;background:#dc2626;color:#fff'
        : 'border:1px solid #303030;background:#1c1c1c;color:#e5e5e5',
  ].join(';')
  return button
}

function closeDialog(overlay, previousOverflow) {
  overlay?.remove()
  if (canUseDom()) {
    document.body.style.overflow = previousOverflow
  }
}

export function appNotice(message, options = {}) {
  if (!canUseDom()) return

  const text = String(message ?? '').trim()
  if (!text) return

  let root = document.getElementById(NOTICE_ROOT_ID)

  if (!root) {
    root = document.createElement('div')
    root.id = NOTICE_ROOT_ID
    root.setAttribute('aria-live', 'polite')
    root.setAttribute('aria-atomic', 'false')
    root.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:max(18px,env(safe-area-inset-bottom))',
      'transform:translateX(-50%)',
      'z-index:2147483647',
      'width:min(calc(100vw - 24px),430px)',
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      'pointer-events:none',
    ].join(';')
    document.body.appendChild(root)
  }

  const tone = options.tone || inferTone(text)
  const item = document.createElement('div')
  item.setAttribute('role', tone === 'error' ? 'alert' : 'status')

  const border =
    tone === 'error'
      ? '#7f1d1d'
      : tone === 'success'
        ? '#14532d'
        : '#404040'

  const background =
    tone === 'error'
      ? '#2a1111'
      : tone === 'success'
        ? '#10251a'
        : '#171717'

  item.style.cssText = [
    'pointer-events:auto',
    `border:1px solid ${border}`,
    `background:${background}`,
    'color:#f5f5f5',
    'border-radius:16px',
    'box-shadow:0 16px 40px rgba(0,0,0,.35)',
    'padding:13px 14px',
    'font-family:inherit',
    'font-size:12px',
    'font-weight:700',
    'line-height:1.55',
    'white-space:pre-wrap',
    'word-break:break-word',
    'opacity:0',
    'transform:translateY(8px)',
    'transition:opacity .18s ease, transform .18s ease',
  ].join(';')

  item.textContent = text
  root.appendChild(item)

  requestAnimationFrame(() => {
    item.style.opacity = '1'
    item.style.transform = 'translateY(0)'
  })

  const duration = Math.max(1800, Number(options.duration || 3600))

  window.setTimeout(() => {
    item.style.opacity = '0'
    item.style.transform = 'translateY(8px)'

    window.setTimeout(() => {
      item.remove()
      if (root && !root.children.length) root.remove()
    }, 200)
  }, duration)
}

export function appConfirm(message, options = {}) {
  if (!canUseDom()) return Promise.resolve(false)

  return new Promise((resolve) => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const { overlay, panel } = createOverlay()

    const title = createText(
      'h2',
      options.title || 'Confirm action',
      'margin:0;font-size:18px;line-height:1.3;font-weight:900;color:#fff'
    )

    const body = createText(
      'p',
      message,
      'margin:10px 0 0;font-size:13px;line-height:1.65;font-weight:600;color:#a3a3a3;white-space:pre-wrap;word-break:break-word'
    )

    const actions = document.createElement('div')
    actions.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px'

    const cancelButton = createButton(options.cancelText || 'Cancel')
    const confirmButton = createButton(
      options.confirmText || 'Confirm',
      options.danger ? 'danger' : 'primary'
    )

    actions.append(cancelButton, confirmButton)
    panel.append(title, body, actions)

    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      closeDialog(overlay, previousOverflow)
      resolve(value)
    }

    cancelButton.addEventListener('click', () => finish(false))
    confirmButton.addEventListener('click', () => finish(true))

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(false)
    })

    const onKeyDown = (event) => {
      if (event.key === 'Escape') finish(false)
      if (event.key === 'Enter' && document.activeElement !== cancelButton) {
        event.preventDefault()
        finish(true)
      }
    }

    overlay.addEventListener('keydown', onKeyDown)
    window.setTimeout(() => confirmButton.focus(), 0)
  })
}

export function appPrompt(message, defaultValue = '', options = {}) {
  if (!canUseDom()) return Promise.resolve(null)

  return new Promise((resolve) => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const { overlay, panel } = createOverlay()

    const title = createText(
      'h2',
      options.title || 'Enter details',
      'margin:0;font-size:18px;line-height:1.3;font-weight:900;color:#fff'
    )

    const body = createText(
      'p',
      message,
      'margin:10px 0 0;font-size:13px;line-height:1.65;font-weight:600;color:#a3a3a3;white-space:pre-wrap;word-break:break-word'
    )

    const input = document.createElement(
      options.multiline ? 'textarea' : 'input'
    )

    const lowerMessage = String(message || '').toLowerCase()
    const passwordLike =
      options.type === 'password' || lowerMessage.includes('password') || lowerMessage.includes('pin')

    if (!options.multiline) {
      input.type = passwordLike ? 'password' : options.type || 'text'
    } else {
      input.rows = Number(options.rows || 4)
    }

    input.value = String(defaultValue ?? '')
    input.autocomplete = passwordLike ? 'new-password' : 'off'
    input.style.cssText = [
      'width:100%',
      'min-height:48px',
      'margin-top:16px',
      'border:1px solid #333',
      'border-radius:14px',
      'background:#090909',
      'color:#fff',
      'padding:12px 13px',
      'font:inherit',
      'font-size:16px',
      'font-weight:650',
      'outline:none',
      'resize:vertical',
      'box-sizing:border-box',
    ].join(';')

    const actions = document.createElement('div')
    actions.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px'

    const cancelButton = createButton(options.cancelText || 'Cancel')
    const submitButton = createButton(options.confirmText || 'Continue', 'primary')

    actions.append(cancelButton, submitButton)
    panel.append(title, body, input, actions)

    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      closeDialog(overlay, previousOverflow)
      resolve(value)
    }

    cancelButton.addEventListener('click', () => finish(null))
    submitButton.addEventListener('click', () => finish(input.value))

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(null)
    })

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(null)
      if (!options.multiline && event.key === 'Enter') {
        event.preventDefault()
        finish(input.value)
      }
    })

    window.setTimeout(() => {
      input.focus()
      if (!passwordLike) input.select?.()
    }, 0)
  })
}
