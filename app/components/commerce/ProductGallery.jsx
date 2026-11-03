'use client'

import Image from 'next/image'
import { useEffect, useId, useRef, useState } from 'react'
import { productImages } from '@/lib/commerce/catalog-options'

function Magnifier() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M10.5 7.5v6M7.5 10.5h6" /></svg>
}

function MissingImage() {
  return <div className="cs-gallery-missing"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg><p>Product image unavailable</p></div>
}

/** Tenant-supplied media, with keyboard-selectable thumbnails and nested dialog zoom. */
export default function ProductGallery({ product }) {
  const name = String(product?.name || 'Product')
  const images = productImages(product)
  const [imageIndex, setImageIndex] = useState(0)
  const currentImage = images[imageIndex] || images[0]
  const source = currentImage?.url || ''
  const [failedSources, setFailedSources] = useState([])
  const [zoom, setZoom] = useState(1)
  const [opened, setOpened] = useState(false)
  const triggerRef = useRef(null)
  const dialogRef = useRef(null)
  const parentDialogRef = useRef(null)
  const aliveRef = useRef(false)
  const titleId = useId()
  const instructionsId = useId()
  const hasImage = Boolean(source) && !failedSources.includes(source)
  const failImage = () => setFailedSources(current => current.includes(source) ? current : [...current, source])

  function selectImage(index) {
    setImageIndex((index + images.length) % images.length)
    setZoom(1)
  }

  function imageKeys(event) {
    if (images.length < 2 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const nextIndex = (imageIndex + (event.key === 'ArrowRight' ? 1 : -1) + images.length) % images.length
    selectImage(nextIndex)
    event.currentTarget.querySelectorAll('button')[nextIndex]?.focus()
  }

  useEffect(() => {
    aliveRef.current = true
    const dialog = dialogRef.current
    return () => {
      aliveRef.current = false
      if (dialog?.open) dialog.close()
    }
  }, [])

  function openZoom(event) {
    event.stopPropagation()
    const dialog = dialogRef.current
    if (!hasImage || !dialog || dialog.open) return
    parentDialogRef.current = triggerRef.current?.closest('dialog') || null
    setZoom(1)
    setOpened(true)
    dialog.showModal()
  }

  function closeZoom(event) {
    event?.preventDefault()
    event?.stopPropagation()
    if (dialogRef.current?.open) dialogRef.current.close()
  }

  function closed(event) {
    // React's dialog events can bubble to the containing product dialog.
    event.stopPropagation()
    if (!aliveRef.current) return
    setOpened(false)
    setZoom(1)
    const parent = parentDialogRef.current
    const trigger = triggerRef.current
    if (trigger?.isConnected && (!parent || parent.open)) trigger.focus({ preventScroll: true })
    else if (parent?.open) parent.querySelector('button:not([disabled]), a[href], input:not([disabled])')?.focus({ preventScroll: true })
  }

  return <div className="cs-gallery">
    {hasImage ? <button ref={triggerRef} className="cs-gallery-preview" type="button" onClick={openZoom} aria-label={`Zoom image of ${name}`} aria-haspopup="dialog">
      {/* Keep tenant URLs in the browser; do not add a broad remote optimizer policy. */}
      <Image className="cs-gallery-preview-image" src={source} alt={currentImage?.alt || name} width={1200} height={1500} unoptimized loading="eager" decoding="async" onError={failImage} />
      <span className="cs-gallery-zoom-label"><Magnifier /><span>View image</span></span>
    </button> : <MissingImage />}

    {images.length > 1 && <div className="cs-gallery-thumbnails" role="group" aria-label={`Images of ${name}`} onKeyDown={imageKeys}>
      {images.map((image, index) => <button key={image.url} type="button" aria-label={`View image ${index + 1} of ${name}`} aria-pressed={index === imageIndex} onClick={() => selectImage(index)}>
        <Image src={image.url} alt={image.alt} width={80} height={96} unoptimized loading="lazy" />
      </button>)}
    </div>}

    <dialog ref={dialogRef} className="cs-gallery-dialog" aria-labelledby={titleId} aria-describedby={instructionsId} onCancel={closeZoom} onClose={closed} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) closeZoom(event) }}>
      <header className="cs-gallery-zoom-heading"><div><p>Image detail</p><h3 id={titleId}>{name}</h3></div><button className="cs-gallery-close" type="button" aria-label="Close image zoom" onClick={closeZoom}>×</button></header>
      <div className="cs-gallery-zoom-viewport" role="region" aria-label={`Zoomed image of ${name}`} aria-describedby={instructionsId} tabIndex={0}>
        {hasImage ? <div className="cs-gallery-zoom-canvas" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
          {opened && <Image className="cs-gallery-zoom-image" src={source} alt={currentImage?.alt || name} width={1200} height={1500} unoptimized loading="eager" decoding="async" onError={failImage} />}
        </div> : <MissingImage />}
      </div>
      <footer className="cs-gallery-zoom-footer">{images.length > 1 && <div className="cs-gallery-image-controls" role="group" aria-label="Choose product image">
        <button type="button" onClick={() => selectImage(imageIndex - 1)} aria-label="Previous product image">←</button>
        <output aria-live="polite">Image {imageIndex + 1} of {images.length}</output>
        <button type="button" onClick={() => selectImage(imageIndex + 1)} aria-label="Next product image">→</button>
      </div>}<div className="cs-gallery-zoom-controls" role="group" aria-label="Image zoom controls">
        <button type="button" aria-label="Zoom out" disabled={!hasImage || zoom <= 1} onClick={() => setZoom(current => Math.max(1, current - .5))}>−</button>
        <output aria-live="polite" aria-atomic="true" aria-label="Image zoom level">{Math.round(zoom * 100)}%</output>
        <button type="button" aria-label="Zoom in" disabled={!hasImage || zoom >= 3} onClick={() => setZoom(current => Math.min(3, current + .5))}>+</button>
        <button className="cs-gallery-reset" type="button" disabled={!hasImage || zoom === 1} onClick={() => setZoom(1)}>Reset zoom</button>
      </div><p id={instructionsId}>Use the zoom controls, then scroll or use the arrow keys to explore. Escape closes the image.</p></footer>
    </dialog>
  </div>
}
