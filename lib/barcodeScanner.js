'use client'

const DESIRED_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'codabar',
  'itf',
  'qr_code',
]

function scannerError(message, code = 'BARCODE_SCAN_ERROR') {
  const error = new Error(message)
  error.code = code
  return error
}

function extractBarcode(result) {
  if (!result) return ''

  if (typeof result.getText === 'function') {
    return String(result.getText() || '').trim()
  }

  return String(
    result.rawValue ||
      result.text ||
      result.value ||
      ''
  ).trim()
}

function createScannerOverlay(title) {
  const overlay = document.createElement('div')
  overlay.setAttribute('data-digitaldine-barcode-scanner', 'true')

  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    background: 'rgba(0,0,0,0.92)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  })

  const panel = document.createElement('div')
  Object.assign(panel.style, {
    width: '100%',
    maxWidth: '480px',
    borderRadius: '24px',
    overflow: 'hidden',
    background: '#0a0a0a',
    border: '1px solid #262626',
    boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
  })

  const header = document.createElement('div')
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '14px 16px',
    borderBottom: '1px solid #262626',
  })

  const heading = document.createElement('div')
  heading.textContent = title || 'Scan Product Barcode'
  Object.assign(heading.style, {
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: '800',
  })

  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.textContent = 'Cancel'
  Object.assign(cancelButton.style, {
    border: '1px solid #404040',
    background: '#171717',
    color: '#ffffff',
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  })

  header.appendChild(heading)
  header.appendChild(cancelButton)

  const cameraWrap = document.createElement('div')
  Object.assign(cameraWrap.style, {
    position: 'relative',
    width: '100%',
    aspectRatio: '4 / 3',
    background: '#000000',
    overflow: 'hidden',
  })

  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.setAttribute('playsinline', 'true')
  Object.assign(video.style, {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  })

  const guide = document.createElement('div')
  Object.assign(guide.style, {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: '38%',
    height: '24%',
    border: '3px solid #22c55e',
    borderRadius: '14px',
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.24)',
    pointerEvents: 'none',
  })

  cameraWrap.appendChild(video)
  cameraWrap.appendChild(guide)

  const footer = document.createElement('div')
  footer.textContent =
    'Place the barcode inside the green frame. Keep the camera steady for a moment.'
  Object.assign(footer.style, {
    padding: '14px 16px 18px',
    color: '#a3a3a3',
    fontSize: '12px',
    lineHeight: '1.6',
    textAlign: 'center',
  })

  panel.appendChild(header)
  panel.appendChild(cameraWrap)
  panel.appendChild(footer)
  overlay.appendChild(panel)
  document.body.appendChild(overlay)

  return {
    overlay,
    video,
    cancelButton,
  }
}

async function scanWithNativeBarcodeDetector(video, isCancelled) {
  let stream

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    })

    video.srcObject = stream
    await video.play()

    let supportedFormats = DESIRED_FORMATS

    if (
      typeof window.BarcodeDetector?.getSupportedFormats === 'function'
    ) {
      try {
        const supported =
          await window.BarcodeDetector.getSupportedFormats()

        const filtered = DESIRED_FORMATS.filter((format) =>
          supported.includes(format)
        )

        if (filtered.length) {
          supportedFormats = filtered
        }
      } catch {
        // Use the requested defaults.
      }
    }

    let detector

    try {
      detector = new window.BarcodeDetector({
        formats: supportedFormats,
      })
    } catch {
      detector = new window.BarcodeDetector()
    }

    while (!isCancelled()) {
      const results = await detector.detect(video)
      const barcode = extractBarcode(results?.[0])

      if (barcode) {
        return barcode
      }

      await new Promise((resolve) =>
        window.setTimeout(resolve, 140)
      )
    }

    throw scannerError('Barcode scan cancelled.', 'SCAN_CANCELLED')
  } finally {
    stream?.getTracks()?.forEach((track) => {
      try {
        track.stop()
      } catch {
        // Ignore cleanup failure.
      }
    })

    if (video) {
      video.srcObject = null
    }
  }
}

async function scanWithZxing(video, isCancelled) {
  let reader
  let controls

  try {
    const zxing = await import('@zxing/browser')
    const BrowserMultiFormatReader = zxing.BrowserMultiFormatReader

    if (!BrowserMultiFormatReader) {
      throw scannerError(
        'ZXing barcode scanner could not be loaded.',
        'ZXING_UNAVAILABLE'
      )
    }

    reader = new BrowserMultiFormatReader()

    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    }

    if (typeof reader.decodeOnceFromConstraints === 'function') {
      const result = await reader.decodeOnceFromConstraints(
        constraints,
        video
      )

      const barcode = extractBarcode(result)

      if (!barcode) {
        throw scannerError('No barcode was detected.')
      }

      return barcode
    }

    if (typeof reader.decodeFromConstraints === 'function') {
      return await new Promise(async (resolve, reject) => {
        try {
          controls = await reader.decodeFromConstraints(
            constraints,
            video,
            (result, _error, callbackControls) => {
              if (callbackControls) {
                controls = callbackControls
              }

              if (isCancelled()) {
                try {
                  controls?.stop?.()
                } catch {
                  // Ignore cleanup.
                }

                reject(
                  scannerError(
                    'Barcode scan cancelled.',
                    'SCAN_CANCELLED'
                  )
                )
                return
              }

              const barcode = extractBarcode(result)

              if (barcode) {
                try {
                  controls?.stop?.()
                } catch {
                  // Ignore cleanup.
                }

                resolve(barcode)
              }
            }
          )
        } catch (error) {
          reject(error)
        }
      })
    }

    if (typeof reader.decodeOnceFromVideoDevice === 'function') {
      const result = await reader.decodeOnceFromVideoDevice(
        undefined,
        video
      )

      const barcode = extractBarcode(result)

      if (!barcode) {
        throw scannerError('No barcode was detected.')
      }

      return barcode
    }

    throw scannerError(
      'Installed ZXing version does not expose a supported camera decoder.',
      'ZXING_API_UNAVAILABLE'
    )
  } finally {
    try {
      controls?.stop?.()
    } catch {
      // Ignore cleanup.
    }

    try {
      reader?.reset?.()
    } catch {
      // Ignore cleanup.
    }

    const stream = video?.srcObject

    if (stream?.getTracks) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // Ignore cleanup.
        }
      })
    }

    if (video) {
      video.srcObject = null
    }
  }
}

export async function scanBarcodeWithCamera({
  title = 'Scan Product Barcode',
  timeoutMs = 25000,
} = {}) {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined'
  ) {
    throw scannerError(
      'Camera scanning is available only in the browser.',
      'BROWSER_REQUIRED'
    )
  }

  if (!window.isSecureContext) {
    throw scannerError(
      'Camera access requires HTTPS (or localhost). Open the secure HTTPS version of Digital Dine-In.',
      'HTTPS_REQUIRED'
    )
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw scannerError(
      'This browser does not provide camera access.',
      'CAMERA_UNAVAILABLE'
    )
  }

  const { overlay, video, cancelButton } =
    createScannerOverlay(title)

  let cancelled = false
  let timeoutId = null

  const cancel = () => {
    cancelled = true

    const stream = video?.srcObject
    stream?.getTracks?.().forEach((track) => {
      try {
        track.stop()
      } catch {
        // Ignore cleanup.
      }
    })
  }

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      cancel()
    }
  }

  cancelButton.addEventListener('click', cancel)
  window.addEventListener('keydown', onKeyDown)

  try {
    const scanPromise =
      'BarcodeDetector' in window
        ? scanWithNativeBarcodeDetector(video, () => cancelled)
        : scanWithZxing(video, () => cancelled)

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        cancel()
        reject(
          scannerError(
            'No barcode was detected within 25 seconds. Try again with better lighting or enter it manually.',
            'SCAN_TIMEOUT'
          )
        )
      }, timeoutMs)
    })

    const barcode = await Promise.race([
      scanPromise,
      timeoutPromise,
    ])

    if (cancelled) {
      throw scannerError(
        'Barcode scan cancelled.',
        'SCAN_CANCELLED'
      )
    }

    if (!barcode) {
      throw scannerError('No barcode was detected.')
    }

    return String(barcode).trim()
  } catch (error) {
    if (cancelled && error?.code !== 'SCAN_TIMEOUT') {
      throw scannerError(
        'Barcode scan cancelled.',
        'SCAN_CANCELLED'
      )
    }

    if (
      error?.name === 'NotAllowedError' ||
      error?.name === 'PermissionDeniedError'
    ) {
      throw scannerError(
        'Camera permission was denied. Allow camera permission for this site and try again.',
        'CAMERA_PERMISSION_DENIED'
      )
    }

    if (
      error?.name === 'NotFoundError' ||
      error?.name === 'DevicesNotFoundError'
    ) {
      throw scannerError(
        'No camera was found on this device.',
        'CAMERA_NOT_FOUND'
      )
    }

    throw error
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId)
    }

    cancel()
    cancelButton.removeEventListener('click', cancel)
    window.removeEventListener('keydown', onKeyDown)

    try {
      overlay.remove()
    } catch {
      // Ignore cleanup.
    }
  }
}