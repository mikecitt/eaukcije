import type { FilterState } from '../filtering';
import { cyrToLat } from '../utils';

export default function FiltersPanel({ filters, setFilters, statusOptions, onReset }: {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  statusOptions: string[];
  onReset: () => void;
}) {
  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    setFilters({ ...filters, [key]: value });

  return (
    <div className="filters-panel">
      <div className="fg fg-search">
        <label>Pretraga</label>
        <input
          type="text" placeholder="Broj aukcije, opis, mesto..."
          value={filters.search} onChange={e => set('search', e.target.value)}
        />
      </div>
      <div className="fg">
        <label>Status</label>
        <select value={filters.status} onChange={e => set('status', e.target.value)}>
          <option value="">Svi statusi</option>
          {statusOptions.map(s => <option key={s} value={s}>{cyrToLat(s)}</option>)}
        </select>
      </div>
      <div className="fg">
        <label>Prva prodaja</label>
        <select value={filters.firstSale} onChange={e => set('firstSale', e.target.value)}>
          <option value="">Sve</option>
          <option value="1">Da</option>
          <option value="0">Ne</option>
        </select>
      </div>
      <div className="fg fg-price">
        <label>Cena od (RSD)</label>
        <input type="number" placeholder="0" value={filters.priceMin} onChange={e => set('priceMin', e.target.value)} />
      </div>
      <div className="fg fg-price">
        <label>Cena do (RSD)</label>
        <input type="number" placeholder="∞" value={filters.priceMax} onChange={e => set('priceMax', e.target.value)} />
      </div>
      <div className="fg">
        <label htmlFor="fShowFinished">Završene aukcije</label>
        <label className="check-filter" style={{ height: '32px' }}>
          <input
            type="checkbox" id="fShowFinished"
            checked={filters.showFinished} onChange={e => set('showFinished', e.target.checked)}
          />
          Prikaži završene
        </label>
      </div>
      <div className="fg" style={{ justifyContent: 'flex-end' }}>
        <label>&nbsp;</label>
        <button className="btn btn-outline" style={{ height: '32px', padding: '0 12px', fontSize: '0.8rem' }} onClick={onReset}>
          Resetuj filtere
        </button>
      </div>
    </div>
  );
}
