import { Fragment } from 'react';
import type { Auction } from '../types';
import { fmtDate, fmtDateTime, fmtPrice, statusBadgeClass, cyrToLat } from '../utils';
import type { SortCol } from '../filtering';

const COLUMNS: { col: SortCol; label: string }[] = [
  { col: 'auction_number', label: 'Br. aukcije' },
  { col: 'place_name', label: 'Mesto' },
  { col: 'status', label: 'Status' },
  { col: 'starting_price', label: 'Poc. cena' },
  { col: 'start_date', label: 'Pocetak' },
  { col: 'end_date', label: 'Kraj' },
  { col: 'is_first_sale', label: '1. Prod.' },
  { col: 'added_at', label: 'Dodata' },
];

function SortableTh({ col, label, sortCol, sortDir, onSort }: {
  col: SortCol; label: string; sortCol: SortCol; sortDir: 'asc' | 'desc'; onSort: (col: SortCol) => void;
}) {
  const active = sortCol === col;
  return (
    <th className={`sortable${active ? ' sorted' : ''}`} onClick={() => onSort(col)}>
      {label} <i className="sort-arrow">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</i>
    </th>
  );
}

export default function AuctionsTable({
  slice, startIndex, hasAny, hasAnyTotal, favoriteIds, onToggleFavorite,
  sortCol, sortDir, onSort, isAdmin, refreshingIds, onRefreshAuction,
}: {
  slice: Auction[];
  startIndex: number;
  hasAny: boolean;
  hasAnyTotal: boolean;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  sortCol: SortCol;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortCol) => void;
  isAdmin: boolean;
  refreshingIds: Set<string>;
  onRefreshAuction: (id: string) => void;
}) {
  let prevIsFav: boolean | null = null;

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>#</th>
            <SortableTh col={COLUMNS[0].col} label={COLUMNS[0].label} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
            <th>Opis</th>
            {COLUMNS.slice(1).map(c => (
              <SortableTh key={c.col} col={c.col} label={c.label} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {!hasAny ? (
            <tr><td colSpan={11}>
              <div className="empty">
                <h3>Nema rezultata</h3>
                <p>{hasAnyTotal ? 'Nema aukcija koje odgovaraju filterima' : 'Kliknite "Osveži" da preuzmete aukcije'}</p>
              </div>
            </td></tr>
          ) : slice.map((a, i) => {
            const isFav = favoriteIds.has(a.id);
            const groupHeader = isFav !== prevIsFav
              ? (i === 0 && isFav ? '★ Favoriti' : (!isFav && prevIsFav !== null ? 'Sve aukcije' : null))
              : null;
            prevIsFav = isFav;
            const desc = a.short_description || '';
            const descShow = desc.length > 70 ? desc.slice(0, 70) + '…' : desc;

            return (
              <Fragment key={a.id}>
                {groupHeader && (
                  <tr className="group-header"><td colSpan={11}>{groupHeader}</td></tr>
                )}
                <tr className={isFav ? 'fav-row' : ''}>
                  <td className="col-fav">
                    <button
                      className={`fav-star${isFav ? ' is-fav' : ''}`}
                      title={isFav ? 'Ukloni iz favorita' : 'Dodaj u favorite'}
                      onClick={() => onToggleFavorite(a.id)}
                    >
                      {isFav ? '★' : '☆'}
                    </button>
                    {isAdmin && (
                      <button
                        className="row-refresh-btn"
                        title="Osveži ovu aukciju"
                        disabled={refreshingIds.has(a.id)}
                        onClick={() => onRefreshAuction(a.id)}
                      >
                        ⟳
                      </button>
                    )}
                  </td>
                  <td className="col-num">{startIndex + i + 1}</td>
                  <td>
                    <a className="auction-link" href={`https://eaukcija.sud.rs/#/aukcije/${a.id}`} target="_blank" rel="noopener noreferrer">
                      {a.auction_number || a.id}
                    </a>
                  </td>
                  <td title={desc}>{descShow}</td>
                  <td>
                    <span className="place-name">{a.place_name || '—'}</span>
                    {a.place_municipality && <span className="place-muni">{a.place_municipality}</span>}
                  </td>
                  <td><span className={`badge ${statusBadgeClass(a.status, a.status_translation)}`}>{cyrToLat(a.status || a.status_translation || '—')}</span></td>
                  <td className="col-price">{fmtPrice(a.starting_price)}</td>
                  <td className="col-date">{fmtDate(a.start_date)}</td>
                  <td className="col-date">{fmtDate(a.end_date)}</td>
                  <td className={a.is_first_sale ? 'first-yes' : 'first-no'}>{a.is_first_sale ? 'Da' : 'Ne'}</td>
                  <td className="col-added">{fmtDateTime(a.added_at)}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
