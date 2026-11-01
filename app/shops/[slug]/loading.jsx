export default function StoreLoading() {
  return <main className="commerce-store cs-editorial cs-loading" aria-busy="true">
    <div className="cs-container"><p className="cs-eyebrow" role="status">Opening the collection…</p>
      <div className="cs-loading-hero" aria-hidden="true"><div><span className="cs-skeleton cs-skeleton-title" /><span className="cs-skeleton cs-skeleton-copy" /><span className="cs-skeleton cs-skeleton-copy" /></div><span className="cs-skeleton cs-skeleton-art" /></div>
      <div className="cs-product-grid" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index}><span className="cs-skeleton cs-skeleton-photo" /><span className="cs-skeleton cs-skeleton-copy" /></div>)}</div>
    </div>
  </main>
}
