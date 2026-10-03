'use client'

/**
 * Digital Dine-In barcode scanner
 *
 * Chrome strategy:
 *   1. ZXing camera decoder is PRIMARY.
 *   2. Native BarcodeDetector is only a fallback.
 *
 * Why:
 *   Chrome's BarcodeDetector API is still not consistently
 *   available/functional across desktop/mobile builds.
 *
 * Required package:
 *   npm install @zxing/browser
 */

const ZXING_CAMERA_CONSTRAINTS = [
  {
    video: {
      facingMode: {
        ideal: 'environment',
      },
      width: {
        ideal: 1920,
      },
      height: {
        ideal: 1080,
      },
    },
    audio: false,
  },
  {
    video: true,
    audio: false,
  },
]

const NATIVE_FORMATS = [
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

function scannerError(
  message,
  code = 'BARCODE_SCAN_ERROR',
  cause = null
) {
  const error = new Error(message)
  error.code = code

  if (cause) {
    error.cause = cause
  }

  return error
}

function extractBarcode(result) {
  if (!result) return ''

  if (
    typeof result.getText ===
    'function'
  ) {
    return String(
      result.getText() || ''
    ).trim()
  }

  return String(
    result.rawValue ||
      result.text ||
      result.value ||
      ''
  ).trim()
}

function normalizeCameraError(error) {
  const name =
    String(
      error?.name || ''
    ).trim()

  const message =
    String(
      error?.message || ''
    ).trim()

  if (
    name === 'NotAllowedError' ||
    name ===
      'PermissionDeniedError'
  ) {
    return scannerError(
      'Chrome blocked camera permission. Click the camera/lock icon beside the address bar, set Camera to Allow, reload the page, and scan again.',
      'CAMERA_PERMISSION_DENIED',
      error
    )
  }

  if (
    name === 'NotFoundError' ||
    name ===
      'DevicesNotFoundError'
  ) {
    return scannerError(
      'Chrome could not find a camera on this device.',
      'CAMERA_NOT_FOUND',
      error
    )
  }

  if (
    name === 'NotReadableError' ||
    name ===
      'TrackStartError'
  ) {
    return scannerError(
      'The camera exists but Chrome cannot open it. Close Camera, WhatsApp Web, Google Meet, Zoom, Teams, or another tab using the camera and try again.',
      'CAMERA_BUSY',
      error
    )
  }

  if (
    name ===
      'OverconstrainedError' ||
    name ===
      'ConstraintNotSatisfiedError'
  ) {
    return scannerError(
      'The requested camera mode is unavailable on this device.',
      'CAMERA_CONSTRAINT_FAILED',
      error
    )
  }

  if (
    name ===
    'SecurityError'
  ) {
    return scannerError(
      'Chrome blocked camera access because of the page security policy.',
      'CAMERA_SECURITY_ERROR',
      error
    )
  }

  if (
    name === 'AbortError'
  ) {
    return scannerError(
      'Chrome stopped camera startup before it completed. Try scanning again.',
      'CAMERA_ABORTED',
      error
    )
  }

  return scannerError(
    message ||
      'Camera barcode scanning failed.',
    error?.code ||
      'BARCODE_SCAN_ERROR',
    error
  )
}

function createScannerOverlay(
  title
) {
  const existing =
    document.querySelector(
      '[data-digitaldine-barcode-scanner="true"]'
    )

  existing?.remove?.()

  const overlay =
    document.createElement(
      'div'
    )

  overlay.setAttribute(
    'data-digitaldine-barcode-scanner',
    'true'
  )

  Object.assign(
    overlay.style,
    {
      position: 'fixed',
      inset: '0',
      zIndex:
        '2147483647',
      background:
        'rgba(0,0,0,0.94)',
      display: 'flex',
      alignItems:
        'center',
      justifyContent:
        'center',
      padding: '14px',
    }
  )

  const panel =
    document.createElement(
      'div'
    )

  Object.assign(
    panel.style,
    {
      width: '100%',
      maxWidth: '520px',
      maxHeight: '96vh',
      overflow: 'auto',
      borderRadius:
        '24px',
      background:
        '#0a0a0a',
      border:
        '1px solid #262626',
      boxShadow:
        '0 24px 90px rgba(0,0,0,0.65)',
    }
  )

  const header =
    document.createElement(
      'div'
    )

  Object.assign(
    header.style,
    {
      display: 'flex',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      gap: '12px',
      padding:
        '14px 16px',
      borderBottom:
        '1px solid #262626',
    }
  )

  const heading =
    document.createElement(
      'div'
    )

  heading.textContent =
    title ||
    'Scan Product Barcode'

  Object.assign(
    heading.style,
    {
      color: '#ffffff',
      fontSize: '15px',
      fontWeight: '800',
    }
  )

  const cancelButton =
    document.createElement(
      'button'
    )

  cancelButton.type =
    'button'

  cancelButton.textContent =
    'Cancel'

  Object.assign(
    cancelButton.style,
    {
      border:
        '1px solid #404040',
      background:
        '#171717',
      color: '#ffffff',
      borderRadius:
        '10px',
      padding:
        '8px 12px',
      fontSize: '12px',
      fontWeight: '800',
      cursor: 'pointer',
    }
  )

  header.appendChild(
    heading
  )

  header.appendChild(
    cancelButton
  )

  const cameraWrap =
    document.createElement(
      'div'
    )

  Object.assign(
    cameraWrap.style,
    {
      position:
        'relative',
      width: '100%',
      aspectRatio:
        '4 / 3',
      background:
        '#000000',
      overflow: 'hidden',
    }
  )

  const video =
    document.createElement(
      'video'
    )

  video.autoplay = true
  video.muted = true
  video.playsInline = true

  video.setAttribute(
    'playsinline',
    'true'
  )

  video.setAttribute(
    'webkit-playsinline',
    'true'
  )

  Object.assign(
    video.style,
    {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      background:
        '#000000',
    }
  )

  const guide =
    document.createElement(
      'div'
    )

  Object.assign(
    guide.style,
    {
      position:
        'absolute',
      left: '8%',
      right: '8%',
      top: '36%',
      height: '28%',
      border:
        '3px solid #22c55e',
      borderRadius:
        '14px',
      boxShadow:
        '0 0 0 9999px rgba(0,0,0,0.22)',
      pointerEvents:
        'none',
    }
  )

  const scanLine =
    document.createElement(
      'div'
    )

  Object.assign(
    scanLine.style,
    {
      position:
        'absolute',
      left: '5%',
      right: '5%',
      top: '50%',
      height: '2px',
      background:
        '#22c55e',
      boxShadow:
        '0 0 10px #22c55e',
      pointerEvents:
        'none',
    }
  )

  guide.appendChild(
    scanLine
  )

  cameraWrap.appendChild(
    video
  )

  cameraWrap.appendChild(
    guide
  )

  const status =
    document.createElement(
      'div'
    )

  status.textContent =
    'Starting camera…'

  Object.assign(
    status.style,
    {
      padding:
        '12px 16px 0',
      color: '#86efac',
      fontSize: '12px',
      fontWeight: '700',
      textAlign:
        'center',
      minHeight: '30px',
    }
  )

  const footer =
    document.createElement(
      'div'
    )

  footer.textContent =
    'Place the complete barcode inside the green box. Keep it 10–25 cm from the camera and avoid glare.'

  Object.assign(
    footer.style,
    {
      padding:
        '10px 16px 18px',
      color: '#a3a3a3',
      fontSize: '12px',
      lineHeight: '1.6',
      textAlign:
        'center',
    }
  )

  panel.appendChild(
    header
  )

  panel.appendChild(
    cameraWrap
  )

  panel.appendChild(
    status
  )

  panel.appendChild(
    footer
  )

  overlay.appendChild(
    panel
  )

  document.body.appendChild(
    overlay
  )

  return {
    overlay,
    video,
    cancelButton,
    status,
  }
}

function setStatus(
  statusElement,
  message,
  isError = false
) {
  if (!statusElement) {
    return
  }

  statusElement.textContent =
    message

  statusElement.style.color =
    isError
      ? '#fca5a5'
      : '#86efac'
}

async function checkCameraEnvironment() {
  if (
    typeof window ===
      'undefined' ||
    typeof navigator ===
      'undefined'
  ) {
    throw scannerError(
      'Camera scanning is available only in the browser.',
      'BROWSER_REQUIRED'
    )
  }

  if (
    !window.isSecureContext
  ) {
    throw scannerError(
      'Chrome requires HTTPS for camera access. Open the HTTPS Digital Dine-In URL or localhost.',
      'HTTPS_REQUIRED'
    )
  }

  if (
    !navigator
      .mediaDevices
      ?.getUserMedia
  ) {
    throw scannerError(
      'Chrome camera access is unavailable in this page.',
      'CAMERA_UNAVAILABLE'
    )
  }

  const policy =
    document.permissionsPolicy ||
    document.featurePolicy

  if (
    policy &&
    typeof policy.allowsFeature ===
      'function'
  ) {
    try {
      if (
        policy.allowsFeature(
          'camera'
        ) === false
      ) {
        throw scannerError(
          'This page is blocked from using the camera by Permissions-Policy or iframe settings.',
          'CAMERA_POLICY_BLOCKED'
        )
      }
    } catch (error) {
      if (
        error?.code ===
        'CAMERA_POLICY_BLOCKED'
      ) {
        throw error
      }
    }
  }

  if (
    navigator.permissions
      ?.query
  ) {
    try {
      const permission =
        await navigator.permissions.query(
          {
            name: 'camera',
          }
        )

      if (
        permission?.state ===
        'denied'
      ) {
        throw scannerError(
          'Chrome camera permission is blocked for this site. Open Site settings → Camera → Allow, then reload.',
          'CAMERA_PERMISSION_DENIED'
        )
      }
    } catch (error) {
      if (
        error?.code ===
        'CAMERA_PERMISSION_DENIED'
      ) {
        throw error
      }

      // Some Chrome/browser versions do not support
      // querying camera permission through Permissions API.
    }
  }
}

async function scanWithZxing({
  video,
  setStop,
  isCancelled,
  updateStatus,
}) {
  let BrowserMultiFormatReader

  try {
    const module =
      await import(
        '@zxing/browser'
      )

    BrowserMultiFormatReader =
      module.BrowserMultiFormatReader
  } catch (error) {
    throw scannerError(
      'ZXing is not installed. Run: npm install @zxing/browser',
      'ZXING_NOT_INSTALLED',
      error
    )
  }

  if (
    !BrowserMultiFormatReader
  ) {
    throw scannerError(
      'ZXing loaded but BrowserMultiFormatReader is unavailable.',
      'ZXING_UNAVAILABLE'
    )
  }

  const reader =
    new BrowserMultiFormatReader(
      undefined,
      {
        delayBetweenScanAttempts:
          100,
        delayBetweenScanSuccess:
          350,
      }
    )

  let lastConstraintError =
    null

  for (
    let index = 0;
    index <
    ZXING_CAMERA_CONSTRAINTS.length;
    index += 1
  ) {
    if (isCancelled()) {
      throw scannerError(
        'Barcode scan cancelled.',
        'SCAN_CANCELLED'
      )
    }

    const constraints =
      ZXING_CAMERA_CONSTRAINTS[
        index
      ]

    try {
      updateStatus(
        index === 0
          ? 'Opening the rear camera…'
          : 'Opening an available camera…'
      )

      return await new Promise(
        (
          resolve,
          reject
        ) => {
          let settled =
            false

          let controls =
            null

          const stop =
            () => {
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

              const stream =
                video?.srcObject

              stream
                ?.getTracks?.()
                ?.forEach(
                  (track) => {
                    try {
                      track.stop()
                    } catch {
                      // Ignore cleanup.
                    }
                  }
                )

              if (video) {
                video.srcObject =
                  null
              }
            }

          setStop(stop)

          const finishResolve =
            (barcode) => {
              if (settled) {
                return
              }

              settled = true
              stop()
              resolve(barcode)
            }

          const finishReject =
            (error) => {
              if (settled) {
                return
              }

              settled = true
              stop()
              reject(error)
            }

          reader
            .decodeFromConstraints(
              constraints,
              video,
              (
                result,
                error,
                callbackControls
              ) => {
                if (
                  callbackControls
                ) {
                  controls =
                    callbackControls

                  setStop(stop)
                }

                if (
                  isCancelled()
                ) {
                  finishReject(
                    scannerError(
                      'Barcode scan cancelled.',
                      'SCAN_CANCELLED'
                    )
                  )

                  return
                }

                const barcode =
                  extractBarcode(
                    result
                  )

                if (barcode) {
                  updateStatus(
                    `Barcode found: ${barcode}`
                  )

                  finishResolve(
                    barcode
                  )

                  return
                }

                // ZXing reports NotFoundException repeatedly while
                // the camera is scanning normally. It is not a failure.
                const errorName =
                  String(
                    error?.name ||
                      error?.constructor
                        ?.name ||
                      ''
                  )

                if (
                  error &&
                  !errorName.includes(
                    'NotFound'
                  )
                ) {
                  // Do not immediately stop for ordinary decode noise.
                  console.debug(
                    'ZXing decode attempt:',
                    errorName,
                    error?.message ||
                      ''
                  )
                }
              }
            )
            .then(
              (
                scannerControls
              ) => {
                controls =
                  scannerControls

                setStop(stop)

                updateStatus(
                  'Camera ready — point it at the barcode.'
                )

                if (
                  isCancelled()
                ) {
                  finishReject(
                    scannerError(
                      'Barcode scan cancelled.',
                      'SCAN_CANCELLED'
                    )
                  )
                }
              }
            )
            .catch(
              (error) => {
                finishReject(
                  error
                )
              }
            )
        }
      )
    } catch (error) {
      if (
        error?.code ===
        'SCAN_CANCELLED'
      ) {
        throw error
      }

      lastConstraintError =
        error

      const errorName =
        String(
          error?.name ||
            error?.cause
              ?.name ||
            ''
        )

      const retryableConstraint =
        errorName ===
          'OverconstrainedError' ||
        errorName ===
          'ConstraintNotSatisfiedError'

      if (
        retryableConstraint &&
        index <
          ZXING_CAMERA_CONSTRAINTS.length -
            1
      ) {
        updateStatus(
          'Rear camera mode is unavailable. Trying another camera…'
        )

        continue
      }

      throw normalizeCameraError(
        error
      )
    }
  }

  throw normalizeCameraError(
    lastConstraintError ||
      new Error(
        'Unable to start camera.'
      )
  )
}

async function scanWithNativeDetector({
  video,
  setStop,
  isCancelled,
  updateStatus,
}) {
  if (
    !(
      'BarcodeDetector' in
      window
    )
  ) {
    throw scannerError(
      'Native barcode detector is unavailable.',
      'NATIVE_BARCODE_UNAVAILABLE'
    )
  }

  let stream = null

  const stop =
    () => {
      stream
        ?.getTracks?.()
        ?.forEach(
          (track) => {
            try {
              track.stop()
            } catch {
              // Ignore cleanup.
            }
          }
        )

      if (video) {
        video.srcObject =
          null
      }
    }

  setStop(stop)

  try {
    updateStatus(
      'Trying Chrome native barcode detector…'
    )

    try {
      stream =
        await navigator.mediaDevices.getUserMedia(
          ZXING_CAMERA_CONSTRAINTS[
            0
          ]
        )
    } catch (error) {
      const name =
        String(
          error?.name || ''
        )

      if (
        name ===
          'OverconstrainedError' ||
        name ===
          'ConstraintNotSatisfiedError'
      ) {
        stream =
          await navigator.mediaDevices.getUserMedia(
            ZXING_CAMERA_CONSTRAINTS[
              1
            ]
          )
      } else {
        throw error
      }
    }

    video.srcObject =
      stream

    await video.play()

    let formats =
      NATIVE_FORMATS

    if (
      typeof window
        .BarcodeDetector
        ?.getSupportedFormats ===
      'function'
    ) {
      try {
        const supported =
          await window.BarcodeDetector.getSupportedFormats()

        const filtered =
          NATIVE_FORMATS.filter(
            (format) =>
              supported.includes(
                format
              )
          )

        if (
          filtered.length
        ) {
          formats =
            filtered
        }
      } catch {
        // Fall through to defaults.
      }
    }

    let detector

    try {
      detector =
        new window.BarcodeDetector(
          {
            formats,
          }
        )
    } catch {
      detector =
        new window.BarcodeDetector()
    }

    updateStatus(
      'Camera ready — scanning barcode…'
    )

    while (
      !isCancelled()
    ) {
      const results =
        await detector.detect(
          video
        )

      const barcode =
        extractBarcode(
          results?.[0]
        )

      if (barcode) {
        return barcode
      }

      await new Promise(
        (resolve) =>
          window.setTimeout(
            resolve,
            120
          )
      )
    }

    throw scannerError(
      'Barcode scan cancelled.',
      'SCAN_CANCELLED'
    )
  } catch (error) {
    throw normalizeCameraError(
      error
    )
  } finally {
    stop()
  }
}

export async function getBarcodeScannerDiagnostics() {
  const diagnostics = {
    secureContext:
      typeof window !==
        'undefined'
        ? Boolean(
            window.isSecureContext
          )
        : false,

    hasMediaDevices:
      typeof navigator !==
        'undefined'
        ? Boolean(
            navigator
              .mediaDevices
              ?.getUserMedia
          )
        : false,

    nativeBarcodeDetector:
      typeof window !==
        'undefined'
        ? Boolean(
            'BarcodeDetector' in
              window
          )
        : false,

    cameraPermission:
      'unknown',

    cameras: [],
  }

  if (
    typeof navigator ===
      'undefined'
  ) {
    return diagnostics
  }

  if (
    navigator.permissions
      ?.query
  ) {
    try {
      const permission =
        await navigator.permissions.query(
          {
            name: 'camera',
          }
        )

      diagnostics.cameraPermission =
        permission?.state ||
        'unknown'
    } catch {
      diagnostics.cameraPermission =
        'unsupported'
    }
  }

  if (
    navigator.mediaDevices
      ?.enumerateDevices
  ) {
    try {
      const devices =
        await navigator.mediaDevices.enumerateDevices()

      diagnostics.cameras =
        devices
          .filter(
            (device) =>
              device.kind ===
              'videoinput'
          )
          .map(
            (
              device,
              index
            ) => ({
              id:
                device.deviceId ||
                '',
              label:
                device.label ||
                `Camera ${
                  index + 1
                }`,
            })
          )
    } catch {
      diagnostics.cameras =
        []
    }
  }

  return diagnostics
}

export async function scanBarcodeWithCamera({
  title =
    'Scan Product Barcode',
  timeoutMs = 30000,
} = {}) {
  await checkCameraEnvironment()

  const {
    overlay,
    video,
    cancelButton,
    status,
  } =
    createScannerOverlay(
      title
    )

  let cancelled =
    false

  let activeStop =
    null

  let timeoutId =
    null

  let cancelReject =
    null

  const setStop =
    (fn) => {
      activeStop =
        typeof fn ===
        'function'
          ? fn
          : null
    }

  const isCancelled =
    () => cancelled

  const updateStatus =
    (
      message,
      isError = false
    ) =>
      setStatus(
        status,
        message,
        isError
      )

  const cancel =
    () => {
      if (cancelled) {
        return
      }

      cancelled = true

      try {
        activeStop?.()
      } catch {
        // Ignore cleanup.
      }

      cancelReject?.(
        scannerError(
          'Barcode scan cancelled.',
          'SCAN_CANCELLED'
        )
      )
  }

  const onKeyDown =
    (event) => {
      if (
        event.key ===
        'Escape'
      ) {
        cancel()
      }
    }

  cancelButton.addEventListener(
    'click',
    cancel
  )

  window.addEventListener(
    'keydown',
    onKeyDown
  )

  const cancelPromise =
    new Promise(
      (_, reject) => {
        cancelReject =
          reject
      }
    )

  const timeoutPromise =
    new Promise(
      (_, reject) => {
        timeoutId =
          window.setTimeout(
            () => {
              try {
                activeStop?.()
              } catch {
                // Ignore cleanup.
              }

              reject(
                scannerError(
                  'No barcode was detected within 30 seconds. Move closer, improve lighting, remove glare, and try again.',
                  'SCAN_TIMEOUT'
                )
              )
            },
            timeoutMs
          )
      }
    )

  const scannerPromise =
    (async () => {
      // IMPORTANT:
      // Use ZXing first on Chrome. Native BarcodeDetector is
      // intentionally secondary because browser support is inconsistent.
      try {
        updateStatus(
          'Loading barcode scanner…'
        )

        return await scanWithZxing(
          {
            video,
            setStop,
            isCancelled,
            updateStatus,
          }
        )
      } catch (zxingError) {
        if (
          zxingError?.code ===
          'SCAN_CANCELLED'
        ) {
          throw zxingError
        }

        console.warn(
          'ZXing barcode scanner failed; trying native detector:',
          zxingError
        )

        updateStatus(
          'ZXing could not start. Trying Chrome native scanner…'
        )

        try {
          return await scanWithNativeDetector(
            {
              video,
              setStop,
              isCancelled,
              updateStatus,
            }
          )
        } catch (nativeError) {
          // Prefer the more useful camera error when available.
          if (
            [
              'CAMERA_PERMISSION_DENIED',
              'CAMERA_NOT_FOUND',
              'CAMERA_BUSY',
              'CAMERA_POLICY_BLOCKED',
              'HTTPS_REQUIRED',
              'CAMERA_SECURITY_ERROR',
            ].includes(
              nativeError?.code
            )
          ) {
            throw nativeError
          }

          if (
            zxingError?.code ===
            'ZXING_NOT_INSTALLED'
          ) {
            throw zxingError
          }

          throw scannerError(
            `Camera opened but barcode decoding failed. ZXing: ${
              zxingError?.message ||
              'unknown error'
            }. Native scanner: ${
              nativeError?.message ||
              'unavailable'
            }.`,
            'BARCODE_DECODER_FAILED',
            nativeError
          )
        }
      }
    })()

  try {
    const barcode =
      await Promise.race([
        scannerPromise,
        timeoutPromise,
        cancelPromise,
      ])

    if (
      cancelled
    ) {
      throw scannerError(
        'Barcode scan cancelled.',
        'SCAN_CANCELLED'
      )
    }

    const clean =
      String(
        barcode || ''
      ).trim()

    if (!clean) {
      throw scannerError(
        'No barcode was detected.',
        'NO_BARCODE'
      )
    }

    updateStatus(
      `Barcode scanned: ${clean}`
    )

    return clean
  } catch (error) {
    if (
      error?.code ===
      'SCAN_CANCELLED'
    ) {
      throw error
    }

    const normalized =
      error?.code
        ? error
        : normalizeCameraError(
            error
          )

    updateStatus(
      normalized?.message ||
        'Barcode scanning failed.',
      true
    )

    throw normalized
  } finally {
    if (timeoutId) {
      window.clearTimeout(
        timeoutId
      )
    }

    try {
      activeStop?.()
    } catch {
      // Ignore cleanup.
    }

    cancelButton.removeEventListener(
      'click',
      cancel
    )

    window.removeEventListener(
      'keydown',
      onKeyDown
    )

    try {
      overlay.remove()
    } catch {
      // Ignore cleanup.
    }
  }
}