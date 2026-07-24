import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { Auction, RefreshEvent } from '../types';
import { transformAuction } from '../utils';
import { useMessage } from './MessageContext';

interface AuctionsDataContextValue {
  allAuctions: Auction[];
  favoriteIds: Set<string>;
  lastRefresh: string | null;
  loaded: boolean;
  ensureLoaded: () => void;
  reload: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  clearDatabase: (password: string) => Promise<void>;

  refreshingIds: Set<string>;
  refreshAuction: (id: string) => Promise<void>;

  refreshBusy: boolean;
  showProgress: boolean;
  progressText: string;
  progressPercent: number;
  doRefresh: (excludedStatuses?: string[]) => Promise<void>;
}

const AuctionsDataContext = createContext<AuctionsDataContextValue | null>(null);

export function AuctionsDataProvider({ children }: { children: ReactNode }) {
  const { showMsg, clearMsg } = useMessage();
  const [allAuctions, setAllAuctions] = useState<Auction[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const hideProgressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFavorites = useCallback(async () => {
    try {
      const ids = await api.getFavorites();
      setFavoriteIds(new Set(ids));
    } catch (_) {
      setFavoriteIds(new Set());
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const [{ auctions, lastRefresh: lr }] = await Promise.all([api.getAuctions(), loadFavorites()]);
      setAllAuctions((auctions || []).map(transformAuction));
      setLastRefresh(lr);
    } catch (err: any) {
      showMsg('error', `Greška pri učitavanju: ${err.message}`);
    }
  }, [loadFavorites, showMsg]);

  const ensureLoaded = useCallback(() => {
    if (loaded) return;
    setLoaded(true);
    reload();
  }, [loaded, reload]);

  const toggleFavorite = useCallback(async (id: string) => {
    const wasFav = favoriteIds.has(id);
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (wasFav) next.delete(id); else next.add(id);
      return next;
    });
    try {
      if (wasFav) await api.removeFavorite(id); else await api.addFavorite(id);
    } catch (err: any) {
      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (wasFav) next.add(id); else next.delete(id);
        return next;
      });
      showMsg('error', `Greška pri čuvanju favorita: ${err.message}`);
    }
  }, [favoriteIds, showMsg]);

  const refreshAuction = useCallback(async (id: string) => {
    if (refreshingIds.has(id)) return;
    setRefreshingIds(prev => new Set(prev).add(id));
    try {
      const updated = await api.refreshAuction(id);
      setAllAuctions(prev => prev.map(a => a.id === id ? transformAuction({ ...a, ...updated }) : a));
      showMsg('success', 'Aukcija osvežena.');
    } catch (err: any) {
      showMsg('error', `Greška pri osvežavanju aukcije: ${err.message}`);
    } finally {
      setRefreshingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [refreshingIds, showMsg]);

  const clearDatabase = useCallback(async (password: string) => {
    await api.clearAuctions(password);
    setAllAuctions([]);
    setFavoriteIds(new Set());
    setLastRefresh(null);
    showMsg('info', 'Baza je obrisana.');
  }, [showMsg]);

  // No manual logout reset needed: App only mounts this provider while
  // currentUser is set, so logging out unmounts it and a fresh instance
  // (with fresh useState) mounts on the next login.
  useEffect(() => () => {
    if (hideProgressTimer.current) clearTimeout(hideProgressTimer.current);
  }, []);

  const doRefresh = useCallback(async (excludedStatuses: string[] = []) => {
    if (refreshBusy) return;
    setRefreshBusy(true);
    setShowProgress(true);
    setProgressPercent(0);
    setProgressText('Pokrećem osvežavanje...');
    clearMsg();
    if (hideProgressTimer.current) clearTimeout(hideProgressTimer.current);

    try {
      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedStatuses }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (line.startsWith('data: ')) {
            try {
              const ev = JSON.parse(line.slice(6)) as RefreshEvent;
              handleEvent(ev);
            } catch (_) { /* ignore malformed event */ }
          }
        }
      }
    } catch (err: any) {
      showMsg('error', `Greška pri osvežavanju: ${err.message}`);
    } finally {
      setRefreshBusy(false);
      hideProgressTimer.current = setTimeout(() => setShowProgress(false), 4000);
    }

    function handleEvent(ev: RefreshEvent) {
      switch (ev.type) {
        case 'status':
          setProgressText(ev.message);
          setProgressPercent(8);
          break;
        case 'progress':
          setProgressText(ev.message);
          // ev.current is already the final 0-100 display percentage computed
          // by RefreshService (ev.total is always 100) — remapping it again
          // here would double-compress it and desync the bar from ev.message.
          setProgressPercent(ev.current);
          break;
        case 'done':
          setProgressText('Osvežavanje završeno!');
          setProgressPercent(100);
          setLastRefresh(ev.lastRefresh);
          showMsg('success',
            `Osvežavanje završeno: ${ev.newCount} novih, ${ev.updatedCount} ažuriranih` +
            (ev.skippedCount ? `, ${ev.skippedCount} preskočeno` : '') +
            (ev.failedCount ? `, ${ev.failedCount} neuspelih` : '')
          );
          reload();
          break;
        case 'error':
          showMsg('error', `Greška: ${ev.message}`);
          break;
      }
    }
  }, [refreshBusy, clearMsg, showMsg, reload]);

  return (
    <AuctionsDataContext.Provider value={{
      allAuctions, favoriteIds, lastRefresh, loaded, ensureLoaded, reload,
      toggleFavorite, clearDatabase,
      refreshingIds, refreshAuction,
      refreshBusy, showProgress, progressText, progressPercent, doRefresh,
    }}>
      {children}
    </AuctionsDataContext.Provider>
  );
}

export function useAuctionsData(): AuctionsDataContextValue {
  const ctx = useContext(AuctionsDataContext);
  if (!ctx) throw new Error('useAuctionsData must be used within AuctionsDataProvider');
  return ctx;
}
