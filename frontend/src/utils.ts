import type { Auction } from './types';

// ── Cyrillic → Serbian Latin ────────────────────────────────────────────────
const CYR: Record<string, string> = {
  'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'Đ','Е':'E','Ж':'Ž','З':'Z',
  'И':'I','Ј':'J','К':'K','Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O',
  'П':'P','Р':'R','С':'S','Т':'T','Ћ':'Ć','У':'U','Ф':'F','Х':'H','Ц':'C',
  'Ч':'Č','Џ':'Dž','Ш':'Š',
  'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'đ','е':'e','ж':'ž','з':'z',
  'и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o',
  'п':'p','р':'r','с':'s','т':'t','ћ':'ć','у':'u','ф':'f','х':'h','ц':'c',
  'ч':'č','џ':'dž','ш':'š',
};

export const cyrToLat = (s?: string | null): string =>
  s ? [...s].map(c => CYR[c] ?? c).join('') : (s ?? '');

// ── Strip diacritics for loose Latin search (ž→z, š→s, č/ć→c, đ→d) ─────────
export const stripDiacritics = (s: string): string => s
  .replace(/[žŽ]/g, 'z').replace(/[šŠ]/g, 's')
  .replace(/[čČćĆ]/g, 'c').replace(/[đĐ]/g, 'd');

// ── Formatting ───────────────────────────────────────────────────────────────
export const fmtDate = (str?: string | null): string => {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d.getTime()) ? str : d.toLocaleDateString('sr-RS');
};

export const fmtDateTime = (str?: string | null): string => {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d.getTime()) ? str
    : d.toLocaleDateString('sr-RS') + ' '
    + d.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' });
};

export const fmtPrice = (val?: number | null): string => {
  if (!val) return '—';
  return new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'RSD', maximumFractionDigits: 0 }).format(val);
};

// Exact status codes as returned by GetAuctionsByCategoryId's `Status` field
// (confirmed from the live status filter dropdown, not translated text).
const STATUS_BADGES: [string, string][] = [
  ['Verified',              'badge-verified'],
  ['InProgress',             'badge-verified'],
  ['Verification',          'badge-unverified'],
  ['InPrediction',          'badge-unverified'],
  ['Closed',                'badge-completed'],
  ['ClosedWithoutBids',     'badge-default'],
  ['Canceled',              'badge-cancelled'],
  ['CanceledBySystem',      'badge-cancelled'],
  ['UnsuccessfullyStarted', 'badge-cancelled'],
];

export const KNOWN_STATUSES = STATUS_BADGES.map(([s]) => s);

// Terminal statuses that don't change once reached — the default set of
// statuses excluded from a bulk refresh so it doesn't re-fetch every
// already-concluded auction's details on every run.
export const DEFAULT_EXCLUDED_STATUSES = [
  'Closed', 'ClosedWithoutBids', 'Canceled', 'CanceledBySystem', 'UnsuccessfullyStarted',
];

const STATUS_BADGE_MAP: Record<string, string> = Object.fromEntries(
  STATUS_BADGES.map(([s, cls]) => [s.toLowerCase(), cls]),
);

export const statusBadgeClass = (status?: string, translation?: string): string => {
  const known = STATUS_BADGE_MAP[(status || '').trim().toLowerCase()];
  if (known) return known;

  // Fallback keyword heuristic for any status/translation not in the known set above.
  const t = stripDiacritics(cyrToLat(status || translation || '').toLowerCase());
  if (t.includes('potvrđ') || t.includes('potvrd') || t.includes('aktiv') || t.includes('verif')) return 'badge-verified';
  if (t.includes('otkaz') || t.includes('cancel')) return 'badge-cancelled';
  if (t.includes('zavrs') || t.includes('complet') || t.includes('closed')) return 'badge-completed';
  if (t.includes('ceka') || t.includes('pending') || t.includes('objavlj') || t.includes('predict')) return 'badge-unverified';
  return 'badge-default';
};

export const transformAuction = (a: Auction): Auction => ({
  ...a,
  auction_number:     cyrToLat(a.auction_number     || ''),
  short_description:  cyrToLat(a.short_description  || ''),
  place_name:         cyrToLat(a.place_name         || ''),
  place_municipality: cyrToLat(a.place_municipality || ''),
  status:             cyrToLat(a.status             || ''),
  status_translation: cyrToLat(a.status_translation || ''),
});
