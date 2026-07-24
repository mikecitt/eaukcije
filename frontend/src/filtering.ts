import type { Auction } from './types';
import { cyrToLat, stripDiacritics } from './utils';

export interface FilterState {
  search: string;
  status: string;
  firstSale: string;
  priceMin: string;
  priceMax: string;
  showFinished: boolean;
  aiMatchIds: Set<string> | null;
}

export const defaultFilterState: FilterState = {
  search: '',
  status: '',
  firstSale: '',
  priceMin: '',
  priceMax: '',
  showFinished: false,
  aiMatchIds: null,
};

export function applyFilters(data: Auction[], f: FilterState): Auction[] {
  const normSearch = stripDiacritics(f.search.trim().toLowerCase());
  const priceMin = f.priceMin !== '' ? Number(f.priceMin) : null;
  const priceMax = f.priceMax !== '' ? Number(f.priceMax) : null;
  const now = new Date();

  return data.filter(a => {
    if (!f.showFinished && a.end_date && new Date(a.end_date) < now) return false;
    if (normSearch) {
      const hay = stripDiacritics(cyrToLat(
        [a.auction_number, a.short_description, a.place_name, a.place_municipality]
          .join(' ').toLowerCase()
      ));
      if (!hay.includes(normSearch)) return false;
    }
    if (f.status && a.status_translation !== f.status && a.status !== f.status) return false;
    if (f.firstSale !== '' && String(a.is_first_sale) !== f.firstSale) return false;
    if (priceMin !== null && (a.starting_price || 0) < priceMin) return false;
    if (priceMax !== null && (a.starting_price || 0) > priceMax) return false;
    if (f.aiMatchIds !== null && !f.aiMatchIds.has(a.id)) return false;
    return true;
  });
}

export type SortCol = keyof Auction;

export function sortData(data: Auction[], sortCol: SortCol, sortDir: 'asc' | 'desc'): Auction[] {
  return [...data].sort((a, b) => {
    const va = a[sortCol] ?? '';
    const vb = b[sortCol] ?? '';
    const cmp = (sortCol === 'starting_price' || sortCol === 'current_price' || sortCol === 'is_first_sale')
      ? Number(va) - Number(vb)
      : String(va).localeCompare(String(vb), 'sr');
    return sortDir === 'asc' ? cmp : -cmp;
  });
}

export function withFavoritesFirst(data: Auction[], favoriteIds: Set<string>): Auction[] {
  const favs = data.filter(a => favoriteIds.has(a.id));
  const rest = data.filter(a => !favoriteIds.has(a.id));
  return [...favs, ...rest];
}

export function populateStatusOptions(data: Auction[]): string[] {
  return [...new Set(data.map(a => a.status || a.status_translation || '').filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'sr'));
}
