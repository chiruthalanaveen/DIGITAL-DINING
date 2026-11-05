'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import './owner-qr-poster.css'

const SIZES = [
  { key: 'a6', label: 'A6 · 105 × 148 mm', width: 105, height: 148 },
  { key: 'a5', label: 'A5 · 148 × 210 mm', width: 148, height: 210 },
  { key: 'a4', label: 'A4 · 210 × 297 mm', width: 210, height: 297 },
  { key: 'stand', label: 'Table stand · 100 × 150 mm', width: 100, height: 150 },
  { key: 'poster', label: 'Counter poster · 120 × 180 mm', width: 120, height: 180 },
  { key: 'custom', label: 'Custom dimensions', width: 120, height: 180 },
]
const STYLES = {
  emerald: { name: 'Emerald', accent: '#069d73', bg: '#ffffff', ink: '#152637' },
  orange: { name: 'Terracotta', accent: '#e27631', bg: '#fffaf4', ink: '#251f21' },
  blue: { name: 'Midnight', accent: '#2563eb', bg: '#f7fbff', ink: '#111e35' },
  rose: { name: 'Rose', accent: '#da4068', bg: '#fff8fa', ink: '#251722' },
}
const FILE_RE = /[^a-z0-9-]+/gi
const cleanFile = text => String(text || 'digital-dine').trim().replace(FILE_RE, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 90)
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min))
const tidy = (value, max = 130) => String(value || '').trim().slice(0, max)

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
function fitText(ctx, text, maxWidth) {
  let t = String(text || '').trim()
  if (ctx.measureText(t).width <= maxWidth) return t
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}
function drawCenter(ctx, text, atY, width, font, color, available) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(fitText(ctx, text, available), width / 2, atY)
}
function posterGeometry(width, height, requestedQR) {
  const edge = clamp(Math.min(width, height) * .08, 5, 13)
  const qr = Math.min(requestedQR, width - edge * 2 - 5, height * .43)
  const qrTop = height * .35
  return { edge, qr, qrTop, qrLeft: (width - qr) / 2 }
}

export default function OwnerQRPosterDesigner({
  type = 'table', restaurantName = 'Digital Dine-In', tableNumber = 1, url = '',
  onPrepare = async () => {}, onSuccess = () => {},
}) {
  const isTable = type === 'table'
  const [title, setTitle] = useState(restaurantName)
  const [eyebrow, setEyebrow] = useState(isTable ? 'SCAN • ORDER • ENJOY' : 'YOUR NEIGHBOURHOOD STORE')
  const [caption, setCaption] = useState(isTable ? 'Scan to view our menu & place your order' : 'Scan to explore our delivery products')
  const [footer, setFooter] = useState('Powered by Digital Dine-In')
  const [tableLabel, setTableLabel] = useState('TABLE')
  const [callToAction, setCallToAction] = useState(isTable ? 'ORDER FROM YOUR TABLE' : 'ORDER FOR DELIVERY')
  const [sizeKey, setSizeKey] = useState('stand')
  const [customWidth, setCustomWidth] = useState(120)
  const [customHeight, setCustomHeight] = useState(180)
  const [qrMm, setQrMm] = useState(62)
  const [styleKey, setStyleKey] = useState('emerald')
  const [customAccent, setCustomAccent] = useState(STYLES.emerald.accent)
  const [customBg, setCustomBg] = useState(STYLES.emerald.bg)
  const [customInk, setCustomInk] = useState(STYLES.emerald.ink)
  const [logoData, setLogoData] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const qrSourceRef = useRef(null)
  const fileInput = useRef(null)
  const activeSize = SIZES.find(s => s.key === sizeKey) || SIZES[3]
  const width = sizeKey === 'custom' ? clamp(customWidth, 70, 300) : activeSize.width
  const height = sizeKey === 'custom' ? clamp(customHeight, 145, 420) : activeSize.height
  const { qr, qrTop, qrLeft, edge } = useMemo(() => posterGeometry(width, height, Number(qrMm)), [width, height, qrMm])
  const posterName = tidy(title, 58) || restaurantName
  const safeUrl = /^https?:\/\//i.test(String(url || '')) ? String(url) : ''
  const posterLabel = isTable ? `${tidy(tableLabel, 16) || 'TABLE'} ${tableNumber}` : 'DELIVERY'
  const theme = { accent: customAccent, bg: customBg, ink: customInk }

  useEffect(() => { setTitle(restaurantName) }, [restaurantName])
  const applyStyle = key => {
    const s = STYLES[key]
    if (!s) return
    setStyleKey(key)
    setCustomAccent(s.accent); setCustomBg(s.bg); setCustomInk(s.ink)
  }

  const onFile = event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Use a PNG, JPEG or WebP logo under 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => { setLogoData(String(reader.result || '')); setError('') }
    reader.onerror = () => setError('Unable to read logo.')
    reader.readAsDataURL(file)
  }

  const makeCanvas = async () => {
    if (!safeUrl) throw new Error('The QR destination URL is missing.')
    const qrCanvas = qrSourceRef.current
    if (!qrCanvas || !qrCanvas.width) throw new Error('QR code is not ready. Please try again.')
    const pixelsPerMM = 300 / 25.4 // 300 dpi printer-ready PNG
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * pixelsPerMM)
    canvas.height = Math.round(height * pixelsPerMM)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas export is unsupported in this browser.')
    ctx.scale(pixelsPerMM, pixelsPerMM)
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = theme.accent
    roundRect(ctx, edge, edge, width - edge * 2, 2.4, 1.2)
    ctx.fill()
    let top = edge + 13
    if (logoData) {
      const logo = new Image()
      logo.src = logoData
      await new Promise((resolve, reject) => { logo.onload = resolve; logo.onerror = reject })
      const logoSize = Math.min(16, height * .09)
      ctx.save()
      roundRect(ctx, width - edge - logoSize - 2, edge + 7, logoSize, logoSize, 3)
      ctx.clip()
      ctx.drawImage(logo, width - edge - logoSize - 2, edge + 7, logoSize, logoSize)
      ctx.restore()
    }
    drawCenter(ctx, tidy(eyebrow, 35).toUpperCase(), top, width, '800 3px Arial, sans-serif', theme.accent, width - edge * 2)
    const titleY = top + 10
    drawCenter(ctx, posterName, titleY, width, `900 ${clamp(width * .058, 5, 9)}px Arial, sans-serif`, theme.ink, width - edge * 2)
    const labelY = titleY + 12
    ctx.fillStyle = theme.accent
    roundRect(ctx, width / 2 - 23, labelY - 5.5, 46, 11, 5.5)
    ctx.fill()
    drawCenter(ctx, posterLabel, labelY, width, '900 4.5px Arial, sans-serif', '#ffffff', 42)

    // The source QR already has a quiet-zone margin. Never paint over QR modules.
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, qrLeft - 1, qrTop - 1, qr + 2, qr + 2, 1)
    ctx.fill()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(qrCanvas, qrLeft, qrTop, qr, qr)
    ctx.imageSmoothingEnabled = true

    const ctaY = qrTop + qr + Math.min(14, (height - (qrTop + qr)) * .28)
    drawCenter(ctx, tidy(callToAction, 45), ctaY, width, '900 4px Arial, sans-serif', theme.ink, width - edge * 2)
    drawCenter(ctx, tidy(caption, 90), ctaY + 8, width, '500 2.9px Arial, sans-serif', theme.ink, width - edge * 2)
    ctx.strokeStyle = '#d2d8da'
    ctx.lineWidth = .25
    ctx.beginPath(); ctx.moveTo(edge + 5, height - edge - 10); ctx.lineTo(width - edge - 5, height - edge - 10); ctx.stroke()
    drawCenter(ctx, tidy(footer, 60), height - edge - 5, width, '700 2.7px Arial, sans-serif', theme.ink, width - edge * 2)
    return canvas
  }

  const perform = async action => {
    if (busy) return
    setBusy(action); setError(''); setSuccess('')
    try {
      if (!safeUrl) throw new Error('A valid HTTPS destination is required.')
      // Table QR registration happens before each successful print/download.
      await onPrepare()
      const canvas = await makeCanvas()
      const file = `${cleanFile(posterName)}-${isTable ? `table-${tableNumber}` : 'delivery'}-poster-${width}x${height}mm.png`
      const src = canvas.toDataURL('image/png')
      if (action === 'download') {
        const link = document.createElement('a')
        link.download = file
        link.href = src
        document.body.appendChild(link); link.click(); link.remove()
        setSuccess('High-resolution 300 DPI poster downloaded.')
      } else {
        // Print the exact same high-resolution poster. Browser print can save as PDF.
        const frame = document.createElement('iframe')
        frame.setAttribute('title', 'Print your QR poster')
        frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px;top:-9999px;'
        document.body.appendChild(frame)
        const doc = frame.contentDocument
        if (!doc) throw new Error('Unable to open the print preview.')
        doc.open()
        doc.write(`<!doctype html><html><head><title>${file}</title><style>@page{size:${width}mm ${height}mm;margin:0}html,body{margin:0;padding:0;width:${width}mm;height:${height}mm;background:#fff}img{display:block;width:${width}mm;height:${height}mm;object-fit:contain}</style></head><body><img id="poster" alt="QR poster" src="${src}"></body></html>`)
        doc.close()
        const img = doc.getElementById('poster')
        if (img) await new Promise(resolve => { if (img.complete) resolve(); else { img.onload = resolve; img.onerror = resolve } })
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
        window.setTimeout(() => frame.remove(), 60000)
        setSuccess('Print dialog opened. Choose Save as PDF or your printer; use Actual size / 100%.')
      }
      onSuccess()
    } catch (e) {
      setError(e?.message || 'Could not create poster.')
    } finally {
      setBusy('')
    }
  }

  return <div className="dd-qr-studio">
    <section className="dd-qr-edit no-print">
      <div className="dd-qr-section-head"><span className="dd-qr-kicker">POSTER DESIGN STUDIO</span><h2>Make it your own.</h2><p>All copy, sizing and colors are editable before you print or download.</p></div>
      <div className="dd-qr-form-group"><h3>Brand and captions</h3>
        <label>Restaurant / store name<input value={title} maxLength={58} onChange={e => setTitle(e.target.value)}/></label>
        <label>Top caption<input value={eyebrow} maxLength={35} onChange={e => setEyebrow(e.target.value)}/></label>
        {isTable && <label>Table heading<input value={tableLabel} maxLength={16} onChange={e => setTableLabel(e.target.value)}/></label>}
        <label>Action heading<input value={callToAction} maxLength={45} onChange={e => setCallToAction(e.target.value)}/></label>
        <label>Instruction caption<input value={caption} maxLength={90} onChange={e => setCaption(e.target.value)}/></label>
        <label>Footer<input value={footer} maxLength={60} onChange={e => setFooter(e.target.value)}/></label>
        <div className="dd-qr-logo-row"><button type="button" onClick={() => fileInput.current?.click()}>＋ Upload optional logo</button>{logoData && <button type="button" onClick={() => setLogoData('')}>Remove logo</button>}</div><input ref={fileInput} type="file" className="dd-qr-hidden" accept="image/png,image/jpeg,image/webp" onChange={onFile}/>
      </div>
      <div className="dd-qr-form-group"><h3>Poster size and printing</h3>
        <label>Paper / poster size<select value={sizeKey} onChange={e => setSizeKey(e.target.value)}>{SIZES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
        {sizeKey === 'custom' && <div className="dd-qr-dual"><label>Width (70–300 mm)<input type="number" min="70" max="300" value={customWidth} onChange={e => setCustomWidth(e.target.value)}/></label><label>Height (145–420 mm)<input type="number" min="145" max="420" value={customHeight} onChange={e => setCustomHeight(e.target.value)}/></label></div>}
        <label>QR square size: {Math.round(qr)} mm<input type="range" min="35" max="130" step="1" value={qrMm} onChange={e => setQrMm(e.target.value)}/></label>
        <p className="dd-qr-tip">Print at 100% / actual size. The QR is constrained to fit the selected poster dimensions.</p>
      </div>
      <div className="dd-qr-form-group"><h3>Colors and theme</h3><div className="dd-qr-preset-row">{Object.entries(STYLES).map(([key,entry]) => <button className={styleKey===key ? 'is-active':''} key={key} type="button" onClick={() => applyStyle(key)}><span style={{background:entry.accent}}/>{entry.name}</button>)}</div>
        <div className="dd-qr-dual dd-qr-colors"><label>Accent<input type="color" value={customAccent} onChange={e => {setStyleKey('custom');setCustomAccent(e.target.value)}}/></label><label>Background<input type="color" value={customBg} onChange={e => {setStyleKey('custom');setCustomBg(e.target.value)}}/></label><label>Text<input type="color" value={customInk} onChange={e => {setStyleKey('custom');setCustomInk(e.target.value)}}/></label></div>
      </div>
      <div className="dd-qr-form-group"><h3>QR destination</h3><p className="dd-qr-url">{safeUrl || 'Waiting for verified destination…'}</p><p className="dd-qr-tip">Only the registered table number or this store's delivery page is encoded. Print wording does not change the destination.</p></div>
    </section>
    <section className="dd-qr-preview-shell"><div className="dd-qr-preview-head no-print"><span><b>Live preview</b><small>{width} × {height} mm · {Math.round(qr)} mm QR</small></span><span className="dd-qr-ready">● PRINT READY</span></div>
      <div className="dd-qr-preview-stage">
        <div className="dd-qr-poster" style={{background:theme.bg, color:theme.ink, aspectRatio:`${width}/${height}`}}>
          <div className="dd-qr-poster-edge" style={{background:theme.accent}}/>
          {logoData && <img className="dd-qr-logo" src={logoData} alt="Uploaded restaurant logo"/>}
          <span className="dd-qr-poster-eyebrow" style={{color:theme.accent}}>{tidy(eyebrow,35)}</span>
          <h2>{posterName}</h2>
          <span className="dd-qr-poster-table" style={{background:theme.accent}}>{posterLabel}</span>
          <div className="dd-qr-poster-code"><QRCodeCanvas value={safeUrl || 'https://digitaldine-in.online/delivery'} size={200} level="H" bgColor="#ffffff" fgColor="#152637" marginSize={4}/></div>
          <div className="dd-qr-poster-copy"><strong>{callToAction}</strong><p>{caption}</p></div>
          <footer>{footer}</footer>
        </div>
      </div>
      <div className="dd-qr-preview-actions no-print"><button type="button" className="dd-qr-download" onClick={() => perform('download')} disabled={Boolean(busy)}>{busy === 'download' ? 'Generating…' : '↓ Download 300 DPI PNG'}</button><button type="button" className="dd-qr-print" onClick={() => perform('print')} disabled={Boolean(busy)}>{busy === 'print' ? 'Preparing…' : '▤ Print / Save PDF'}</button></div>
      {error && <p className="dd-qr-error no-print" role="alert">{error}</p>}
      {success && <p className="dd-qr-success no-print" role="status">{success}</p>}
      <p className="dd-qr-preview-caption no-print">The downloadable PNG and print output use 300 DPI artwork generated in your browser. Scan the final printed QR once before displaying it to customers.</p>
    </section>
    <div className="dd-qr-hidden-source" aria-hidden="true"><QRCodeCanvas ref={qrSourceRef} value={safeUrl || 'https://digitaldine-in.online/delivery'} size={1024} level="H" bgColor="#ffffff" fgColor="#152637" marginSize={4}/></div>
  </div>
}