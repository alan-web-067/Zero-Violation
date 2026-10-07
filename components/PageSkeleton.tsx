// Placeholder shown in the content area while a page's code loads, so moving
// between pages never flashes an empty white screen.
export default function PageSkeleton() {
  const block = (w: string | number, h: number, extra: React.CSSProperties = {}) => (
    <span className="skeleton" style={{ display: "block", width: w, height: h, borderRadius: 12, ...extra }} />
  );
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="page-header">
        <div className="page-header-left">{block(180, 20)}</div>
      </div>
      <div className="page-body">
        {block(420, 38, { marginBottom: 18 })}
        <div className="stat-grid">
          {block("100%", 110)}{block("100%", 110)}{block("100%", 110)}{block("100%", 110)}
        </div>
        {block("100%", 360)}
      </div>
    </div>
  );
}
