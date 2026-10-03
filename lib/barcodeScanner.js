'use client'

/*
|--------------------------------------------------------------------------
| DIGITAL DINE-IN BARCODE SCANNER
|--------------------------------------------------------------------------
|
| Uses html5-qrcode instead of BarcodeDetector / ZXing.
|
| Features:
| - Chrome / Android camera scanning
| - Rear camera preference
| - Desktop webcam support
| - EAN-13 / EAN-8
| - UPC-A / UPC-E
| - CODE-128 / CODE-39 / CODE-93
| - ITF / CODABAR
| - QR
| - Camera selector
| - Barcode photo fallback
|
| Existing Manager/Owner code can continue calling:
|
| const barcode = await scanBarcodeWithCamera({
|   title: 'Scan Product Barcode',
| })
|
|--------------------------------------------------------------------------
*/

function createScannerError(
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

function normalizeCameraError(error) {
  const name = String(
    error?.name || ''
  )

  const message = String(
    error?.message ||
      error ||
      ''
  )

  if (
    name === 'NotAllowedError' ||
    /permission/i.test(message)
  ) {
    return createScannerError(
      'Camera permission is blocked. Open Chrome Site settings → Camera → Allow, reload the page and try again.',
      'CAMERA_PERMISSION_DENIED',
      error
    )
  }

  if (
    name === 'NotFoundError' ||
    /camera not found/i.test(
      message
    )
  ) {
    return createScannerError(
      'No camera was found. You can use Barcode Photo instead.',
      'CAMERA_NOT_FOUND',
      error
    )
  }

  if (
    name === 'NotReadableError' ||
    /busy/i.test(message)
  ) {
    return createScannerError(
      'Camera is busy. Close Camera, WhatsApp, Zoom, Meet or another application using the camera.',
      'CAMERA_BUSY',
      error
    )
  }

  return createScannerError(
    message ||
      'Unable to start barcode scanner.',
    'BARCODE_SCAN_ERROR',
    error
  )
}

function createElement(
  tag,
  style = {},
  text = ''
) {
  const element =
    document.createElement(tag)

  Object.assign(
    element.style,
    style
  )

  if (text) {
    element.textContent = text
  }

  return element
}

function createScannerUI(
  title
) {
  document
    .querySelector(
      '[data-dd-barcode-scanner="true"]'
    )
    ?.remove?.()

  const overlay =
    createElement('div', {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      background:
        'rgba(0,0,0,0.94)',
      display: 'flex',
      alignItems: 'center',
      justifyContent:
        'center',
      padding: '12px',
    })

  overlay.setAttribute(
    'data-dd-barcode-scanner',
    'true'
  )

  const panel =
    createElement('div', {
      width: '100%',
      maxWidth: '520px',
      maxHeight: '96vh',
      overflowY: 'auto',
      background: '#0a0a0a',
      border:
        '1px solid #262626',
      borderRadius: '24px',
      boxShadow:
        '0 24px 90px rgba(0,0,0,0.65)',
    })

  const header =
    createElement('div', {
      padding: '14px 16px',
      display: 'flex',
      justifyContent:
        'space-between',
      alignItems: 'center',
      gap: '12px',
      borderBottom:
        '1px solid #262626',
    })

  const heading =
    createElement(
      'div',
      {
        color: '#ffffff',
        fontSize: '15px',
        fontWeight: '800',
      },
      title ||
        'Scan Product Barcode'
    )

  const cancelButton =
    createElement(
      'button',
      {
        background: '#171717',
        color: '#ffffff',
        border:
          '1px solid #404040',
        borderRadius: '10px',
        padding: '8px 12px',
        fontSize: '12px',
        fontWeight: '800',
        cursor: 'pointer',
      },
      'Cancel'
    )

  cancelButton.type =
    'button'

  header.appendChild(
    heading
  )

  header.appendChild(
    cancelButton
  )

  const cameraContainer =
    createElement('div', {
      padding: '12px',
    })

  const scannerArea =
    createElement('div', {
      width: '100%',
      minHeight: '300px',
      background: '#000000',
      borderRadius: '18px',
      overflow: 'hidden',
    })

  const scannerId =
    `digital-dine-barcode-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`

  scannerArea.id =
    scannerId

  cameraContainer.appendChild(
    scannerArea
  )

  const status =
    createElement(
      'div',
      {
        padding:
          '4px 16px 10px',
        minHeight: '38px',
        color: '#86efac',
        fontSize: '12px',
        fontWeight: '700',
        textAlign: 'center',
        lineHeight: '1.5',
      },
      'Preparing barcode scanner...'
    )

  const controls =
    createElement('div', {
      display: 'grid',
      gridTemplateColumns:
        '1fr 1fr',
      gap: '8px',
      padding:
        '0 16px 12px',
    })

  const cameraSelect =
    createElement(
      'select',
      {
        width: '100%',
        gridColumn:
          '1 / -1',
        background: '#171717',
        color: '#ffffff',
        border:
          '1px solid #404040',
        borderRadius: '12px',
        padding: '11px',
        fontSize: '12px',
      }
    )

  const photoButton =
    createElement(
      'button',
      {
        background: '#171717',
        color: '#ffffff',
        border:
          '1px solid #404040',
        borderRadius: '12px',
        padding: '12px',
        fontSize: '11px',
        fontWeight: '800',
        cursor: 'pointer',
      },
      '📷 Barcode Photo'
    )

  photoButton.type =
    'button'

  const restartButton =
    createElement(
      'button',
      {
        background: '#16a34a',
        color: '#ffffff',
        border: 'none',
        borderRadius: '12px',
        padding: '12px',
        fontSize: '11px',
        fontWeight: '800',
        cursor: 'pointer',
      },
      '↻ Restart Camera'
    )

  restartButton.type =
    'button'

  const fileInput =
    document.createElement(
      'input'
    )

  fileInput.type = 'file'

  fileInput.accept =
    'image/*'

  fileInput.setAttribute(
    'capture',
    'environment'
  )

  fileInput.style.display =
    'none'

  controls.appendChild(
    cameraSelect
  )

  controls.appendChild(
    photoButton
  )

  controls.appendChild(
    restartButton
  )

  controls.appendChild(
    fileInput
  )

  const help =
    createElement(
      'div',
      {
        padding:
          '0 16px 18px',
        color: '#a3a3a3',
        fontSize: '11px',
        lineHeight: '1.6',
        textAlign: 'center',
      },
      'Keep the complete barcode inside the scanning area. Hold the phone horizontally for product barcodes and avoid light reflection. If camera scanning fails, use Barcode Photo.'
    )

  panel.appendChild(
    header
  )

  panel.appendChild(
    cameraContainer
  )

  panel.appendChild(
    status
  )

  panel.appendChild(
    controls
  )

  panel.appendChild(help)

  overlay.appendChild(
    panel
  )

  document.body.appendChild(
    overlay
  )

  return {
    overlay,
    scannerId,
    cancelButton,
    cameraSelect,
    photoButton,
    restartButton,
    fileInput,
    status,
  }
}

function setStatus(
  element,
  message,
  isError = false
) {
  if (!element) {
    return
  }

  element.textContent =
    message

  element.style.color =
    isError
      ? '#fca5a5'
      : '#86efac'
}

function chooseBestCamera(
  cameras
) {
  if (
    !Array.isArray(cameras) ||
    cameras.length === 0
  ) {
    return null
  }

  const rearCamera =
    cameras.find(
      (camera) =>
        /back|rear|environment|world/i.test(
          String(
            camera?.label || ''
          )
        )
    )

  return (
    rearCamera ||
    cameras[0]
  )
}

export async function scanBarcodeWithCamera({
  title =
    'Scan Product Barcode',
} = {}) {
  if (
    typeof window ===
      'undefined' ||
    typeof navigator ===
      'undefined'
  ) {
    throw createScannerError(
      'Barcode scanning is available only inside a browser.',
      'BROWSER_REQUIRED'
    )
  }

  if (!window.isSecureContext) {
    throw createScannerError(
      'Chrome requires HTTPS for camera scanning. Use https://digitaldine-in.online or localhost.',
      'HTTPS_REQUIRED'
    )
  }

  let Html5Qrcode
  let Formats

  try {
    const module =
      await import(
        'html5-qrcode'
      )

    Html5Qrcode =
      module.Html5Qrcode

    Formats =
      module.Html5QrcodeSupportedFormats
  } catch (error) {
    throw createScannerError(
      'Barcode scanner package is missing. Run: npm install html5-qrcode',
      'SCANNER_PACKAGE_MISSING',
      error
    )
  }

  if (!Html5Qrcode) {
    throw createScannerError(
      'Unable to load barcode scanner.',
      'SCANNER_LOAD_ERROR'
    )
  }

  const ui =
    createScannerUI(title)

  let scanner = null

  let running = false

  let finished = false

  let cameras = []

  const stopCamera =
    async () => {
      if (
        !scanner ||
        !running
      ) {
        return
      }

      try {
        await scanner.stop()
      } catch {
        // Ignore cleanup error.
      }

      running = false
    }

  const cleanup =
    async () => {
      await stopCamera()

      try {
        scanner?.clear?.()
      } catch {
        // Ignore.
      }

      try {
        ui.overlay.remove()
      } catch {
        // Ignore.
      }
    }

  return new Promise(
    async (
      resolve,
      reject
    ) => {
      const success =
        async (barcode) => {
          if (finished) {
            return
          }

          const value =
            String(
              barcode || ''
            ).trim()

          if (!value) {
            return
          }

          finished = true

          setStatus(
            ui.status,
            `Barcode detected: ${value}`
          )

          await cleanup()

          resolve(value)
        }

      const fail =
        async (error) => {
          if (finished) {
            return
          }

          finished = true

          await cleanup()

          reject(
            error?.code
              ? error
              : normalizeCameraError(
                  error
                )
          )
        }

      const startCamera =
        async (
          cameraId = ''
        ) => {
          if (finished) {
            return
          }

          await stopCamera()

          if (!scanner) {
            scanner =
              new Html5Qrcode(
                ui.scannerId,
                {
                  formatsToSupport:
                    [
                      Formats?.EAN_13,
                      Formats?.EAN_8,
                      Formats?.UPC_A,
                      Formats?.UPC_E,
                      Formats?.CODE_128,
                      Formats?.CODE_39,
                      Formats?.CODE_93,
                      Formats?.ITF,
                      Formats?.CODABAR,
                      Formats?.QR_CODE,
                    ].filter(
                      (value) =>
                        value !=
                        null
                    ),

                  /*
                   * Force html5-qrcode decoder.
                   * Do not depend on Chrome BarcodeDetector.
                   */
                  useBarCodeDetectorIfSupported:
                    false,
                }
              )
          }

          const selectedCamera =
            cameraId ||
            chooseBestCamera(
              cameras
            )?.id

          setStatus(
            ui.status,
            'Starting camera...'
          )

          try {
            await scanner.start(
              selectedCamera || {
                facingMode: {
                  ideal:
                    'environment',
                },
              },

              {
                fps: 15,

                qrbox:
                  (
                    width,
                    height
                  ) => {
                    /*
                     * Wide box is important
                     * for EAN / UPC products.
                     */

                    return {
                      width:
                        Math.min(
                          Math.floor(
                            width *
                              0.90
                          ),
                          440
                        ),

                      height:
                        Math.min(
                          Math.max(
                            Math.floor(
                              height *
                                0.28
                            ),
                            100
                          ),
                          180
                        ),
                    }
                  },

                aspectRatio:
                  1.7777778,

                disableFlip:
                  false,
              },

              async (
                decodedText
              ) => {
                await success(
                  decodedText
                )
              },

              () => {
                /*
                 * This callback runs many
                 * times when barcode is not
                 * detected in a frame.
                 *
                 * It is NOT an error.
                 */
              }
            )

            running = true

            setStatus(
              ui.status,
              'Camera ready — align the complete barcode inside the scanning area.'
            )
          } catch (
            firstError
          ) {
            console.warn(
              'Primary barcode camera start failed:',
              firstError
            )

            /*
             * Desktop cameras can reject
             * mobile camera constraints.
             *
             * Retry using the simplest
             * available camera ID.
             */

            try {
              const fallbackCamera =
                selectedCamera ||
                cameras?.[0]?.id

              await scanner.start(
                fallbackCamera || {
                  facingMode:
                    'environment',
                },

                {
                  fps: 12,

                  qrbox:
                    (
                      width,
                      height
                    ) => ({
                      width:
                        Math.min(
                          Math.floor(
                            width *
                              0.9
                          ),
                          440
                        ),

                      height:
                        Math.min(
                          Math.max(
                            Math.floor(
                              height *
                                0.3
                            ),
                            100
                          ),
                          180
                        ),
                    }),
                },

                async (
                  decodedText
                ) => {
                  await success(
                    decodedText
                  )
                },

                () => {}
              )

              running = true

              setStatus(
                ui.status,
                'Camera ready — align barcode inside the scanning area.'
              )
            } catch (
              fallbackError
            ) {
              const normalized =
                normalizeCameraError(
                  fallbackError
                )

              setStatus(
                ui.status,
                `${normalized.message} You can use Barcode Photo instead.`,
                true
              )
            }
          }
        }

      /*
      |--------------------------------------------------------------------------
      | CANCEL
      |--------------------------------------------------------------------------
      */

      ui.cancelButton.addEventListener(
        'click',
        async () => {
          await fail(
            createScannerError(
              'Barcode scan cancelled.',
              'SCAN_CANCELLED'
            )
          )
        }
      )

      /*
      |--------------------------------------------------------------------------
      | CAMERA SELECT
      |--------------------------------------------------------------------------
      */

      ui.cameraSelect.addEventListener(
        'change',
        async () => {
          await startCamera(
            ui.cameraSelect
              .value
          )
        }
      )

      /*
      |--------------------------------------------------------------------------
      | RESTART CAMERA
      |--------------------------------------------------------------------------
      */

      ui.restartButton.addEventListener(
        'click',
        async () => {
          setStatus(
            ui.status,
            'Restarting camera...'
          )

          await startCamera(
            ui.cameraSelect
              .value
          )
        }
      )

      /*
      |--------------------------------------------------------------------------
      | PHOTO SCANNER
      |--------------------------------------------------------------------------
      */

      ui.photoButton.addEventListener(
        'click',
        () => {
          ui.fileInput.click()
        }
      )

      ui.fileInput.addEventListener(
        'change',
        async () => {
          const file =
            ui.fileInput
              .files?.[0]

          if (!file) {
            return
          }

          try {
            await stopCamera()

            setStatus(
              ui.status,
              'Reading barcode from photo...'
            )

            const decodedText =
              await scanner.scanFile(
                file,
                true
              )

            await success(
              decodedText
            )
          } catch (
            imageError
          ) {
            console.error(
              'Barcode image scan failed:',
              imageError
            )

            setStatus(
              ui.status,
              'No barcode was detected in that image. Take a close, sharp photo where the complete barcode is visible.',
              true
            )
          } finally {
            ui.fileInput.value =
              ''
          }
        }
      )

      /*
      |--------------------------------------------------------------------------
      | LOAD CAMERAS
      |--------------------------------------------------------------------------
      */

      try {
        setStatus(
          ui.status,
          'Requesting camera permission...'
        )

        try {
          cameras =
            await Html5Qrcode.getCameras()
        } catch (
          cameraError
        ) {
          console.error(
            'Unable to enumerate cameras:',
            cameraError
          )

          cameras = []

          const normalized =
            normalizeCameraError(
              cameraError
            )

          setStatus(
            ui.status,
            `${normalized.message} You can use Barcode Photo.`,
            true
          )
        }

        /*
        |--------------------------------------------------------------------------
        | CAMERA DROPDOWN
        |--------------------------------------------------------------------------
        */

        ui.cameraSelect.innerHTML =
          ''

        if (
          cameras.length >
          0
        ) {
          cameras.forEach(
            (
              camera,
              index
            ) => {
              const option =
                document.createElement(
                  'option'
                )

              option.value =
                camera.id

              option.textContent =
                camera.label ||
                `Camera ${
                  index + 1
                }`

              ui.cameraSelect.appendChild(
                option
              )
            }
          )

          const bestCamera =
            chooseBestCamera(
              cameras
            )

          if (
            bestCamera?.id
          ) {
            ui.cameraSelect.value =
              bestCamera.id
          }

          /*
           * Hide dropdown when
           * there is only one camera.
           */

          ui.cameraSelect.style.display =
            cameras.length > 1
              ? 'block'
              : 'none'

          await startCamera(
            bestCamera?.id ||
              ''
          )
        } else {
          ui.cameraSelect.style.display =
            'none'

          /*
           * Some browsers don't return
           * cameras until getUserMedia
           * starts.
           */

          if (
            navigator
              .mediaDevices
              ?.getUserMedia
          ) {
            await startCamera()
          }
        }
      } catch (
        scannerError
      ) {
        console.error(
          'Barcode scanner initialization failed:',
          scannerError
        )

        const normalized =
          normalizeCameraError(
            scannerError
          )

        setStatus(
          ui.status,
          `${normalized.message} You can use Barcode Photo instead.`,
          true
        )
      }
    }
  )
}