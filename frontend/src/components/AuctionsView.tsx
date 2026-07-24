import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAuctionsData } from '../context/AuctionsDataContext';
import { applyFilters, defaultFilterState, populateStatusOptions, sortData, withFavoritesFirst, type FilterState, type SortCol } from '../filtering';
import StatsRow from './StatsRow';
import ProgressBar from './ProgressBar';
import FiltersPanel from './FiltersPanel';
import AiFilterPanel from './AiFilterPanel';
import AuctionsTable from './AuctionsTable';
import Pagination from './Pagination';

export default function AuctionsView() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const {
    allAuctions, favoriteIds, ensureLoaded, toggleFavorite,
    refreshingIds, refreshAuction,
    showProgress, progressText, progressPercent,
  } = useAuctionsData();

  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const [filters, setFilters] = useState<FilterState>(defaultFilterState);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResetKey, setAiResetKey] = useState(0);
  const [sortCol, setSortCol] = useState<SortCol>('added_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const statusOptions = useMemo(() => populateStatusOptions(allAuctions), [allAuctions]);

  const baseFiltered = useMemo(
    () => applyFilters(allAuctions, { ...filters, aiMatchIds: null }),
    [allAuctions, filters],
  );

  const filteredAuctions = useMemo(() => {
    const filtered = applyFilters(allAuctions, filters);
    const sorted = sortData(filtered, sortCol, sortDir);
    return withFavoritesFirst(sorted, favoriteIds);
  }, [allAuctions, filters, sortCol, sortDir, favoriteIds]);

  useEffect(() => { setPage(1); }, [filters, sortCol, sortDir]);

  const pp = perPage === 0 ? filteredAuctions.length : perPage;
  const totalPages = pp ? Math.ceil(filteredAuctions.length / pp) : 1;
  const clampedPage = Math.min(page, Math.max(1, totalPages));
  const start = (clampedPage - 1) * pp;
  const slice = perPage === 0 ? filteredAuctions : filteredAuctions.slice(start, start + pp);

  const handleSort = (col: SortCol) => {
    setSortDir(prev => (sortCol === col ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortCol(col);
  };

  const handleReset = () => {
    setFilters(defaultFilterState);
    setAiQuery('');
    setAiResetKey(k => k + 1);
  };

  return (
    <div id="viewApp" className="view main">
      <StatsRow allAuctions={allAuctions} filteredAuctions={filteredAuctions} />

      <ProgressBar show={showProgress} text={progressText} percent={progressPercent} />

      <FiltersPanel
        filters={filters}
        setFilters={setFilters}
        statusOptions={statusOptions}
        onReset={handleReset}
      />

      {isAdmin && (
        <AiFilterPanel
          key={aiResetKey}
          baseFiltered={baseFiltered}
          query={aiQuery}
          setQuery={setAiQuery}
          setAiMatchIds={ids => setFilters(f => ({ ...f, aiMatchIds: ids }))}
        />
      )}

      <div className="table-card">
        <div className="table-meta">
          <span>
            Prikazano {filteredAuctions.length.toLocaleString('sr-RS')} od {allAuctions.length.toLocaleString('sr-RS')} aukcija
          </span>
          <div className="per-page">
            <span>Redova po stranici:</span>
            <select value={perPage} onChange={e => { setPerPage(+e.target.value); setPage(1); }}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="0">Sve</option>
            </select>
          </div>
        </div>

        <AuctionsTable
          slice={slice}
          startIndex={start}
          hasAny={filteredAuctions.length > 0}
          hasAnyTotal={allAuctions.length > 0}
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={handleSort}
          isAdmin={isAdmin}
          refreshingIds={refreshingIds}
          onRefreshAuction={refreshAuction}
        />

        <Pagination page={clampedPage} perPage={pp} total={filteredAuctions.length} onPage={setPage} />
      </div>
    </div>
  );
}
