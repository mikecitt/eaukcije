export default function Pagination({ page, perPage, total, onPage }: {
  page: number;
  perPage: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / perPage);
  if (perPage <= 0 || totalPages <= 1) return null;

  const start = (page - 1) * perPage;
  const delta = 2;
  const lo = Math.max(1, page - delta);
  const hi = Math.min(totalPages, page + delta);

  const pageNums: number[] = [];
  for (let p = lo; p <= hi; p++) pageNums.push(p);

  return (
    <div className="pagination">
      <span>{start + 1}–{Math.min(start + perPage, total)} od {total.toLocaleString('sr-RS')}</span>
      <div className="page-btns">
        <button className="pbtn" disabled={page === 1} onClick={() => onPage(page - 1)}>← Preth.</button>
        {lo > 1 && <button className="pbtn" onClick={() => onPage(1)}>1</button>}
        {lo > 2 && <span style={{ padding: '3px 4px', color: 'var(--muted)' }}>…</span>}
        {pageNums.map(p => (
          <button key={p} className={`pbtn${p === page ? ' active' : ''}`} onClick={() => onPage(p)}>{p}</button>
        ))}
        {hi < totalPages - 1 && <span style={{ padding: '3px 4px', color: 'var(--muted)' }}>…</span>}
        {hi < totalPages && <button className="pbtn" onClick={() => onPage(totalPages)}>{totalPages}</button>}
        <button className="pbtn" disabled={page === totalPages} onClick={() => onPage(page + 1)}>Sled. →</button>
      </div>
    </div>
  );
}
