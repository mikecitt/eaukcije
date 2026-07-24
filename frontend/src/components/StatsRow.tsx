import type { Auction } from '../types';

export default function StatsRow({ allAuctions, filteredAuctions }: {
  allAuctions: Auction[];
  filteredAuctions: Auction[];
}) {
  const today = new Date().toDateString();
  const todayCount = allAuctions.filter(a => a.added_at && new Date(a.added_at).toDateString() === today).length;
  const prices = filteredAuctions.map(a => a.starting_price).filter(p => p > 0);
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  return (
    <div className="stats-row">
      <div className="stat-card">
        <div className="label">Ukupno aukcija</div>
        <div className="value">{allAuctions.length.toLocaleString('sr-RS')}</div>
      </div>
      <div className="stat-card">
        <div className="label">Prikazano</div>
        <div className="value">{filteredAuctions.length.toLocaleString('sr-RS')}</div>
      </div>
      <div className="stat-card">
        <div className="label">Dodato danas</div>
        <div className="value">{todayCount.toLocaleString('sr-RS')}</div>
      </div>
      <div className="stat-card">
        <div className="label">Prosečna cena</div>
        <div className="value" style={{ fontSize: '1.1rem', paddingTop: '4px' }}>
          {avg > 0
            ? new Intl.NumberFormat('sr-RS', { notation: 'compact', maximumFractionDigits: 1 }).format(avg) + ' RSD'
            : '—'}
        </div>
      </div>
    </div>
  );
}
