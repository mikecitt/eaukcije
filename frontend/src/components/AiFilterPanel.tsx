import { useState } from 'react';
import { api } from '../api';
import type { Auction } from '../types';

export interface AiFilterHandle {
  query: string;
  setQuery: (q: string) => void;
  reset: () => void;
}

export default function AiFilterPanel({ baseFiltered, query, setQuery, setAiMatchIds }: {
  baseFiltered: Auction[];
  query: string;
  setQuery: (q: string) => void;
  setAiMatchIds: (ids: Set<string> | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: '' | 'active' | 'error'; text: string }>({ type: '', text: '' });

  const clearAiFilter = () => {
    setAiMatchIds(null);
    setStatus({ type: '', text: '' });
  };

  const doAiFilter = async () => {
    const q = query.trim();
    if (!q || busy) return;

    if (baseFiltered.length === 0) {
      setStatus({ type: 'error', text: 'Nema aukcija za filtriranje.' });
      return;
    }

    setBusy(true);
    setStatus({ type: '', text: `__loading__${baseFiltered.length}` });

    try {
      const data = await api.aiFilter(q, baseFiltered.map(a => a.id));
      const ids = new Set(data.matchingIds);
      setAiMatchIds(ids);
      setStatus({ type: 'active', text: `__found__${ids.size}` });
    } catch (err: any) {
      setStatus({ type: 'error', text: `Greška: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-filter-panel">
      <div className="ai-filter-header">
        <span className="ai-label">AI Filter</span>
        <span className="ai-badge">✦ Gemini Flash</span>
      </div>
      <div className="ai-filter-row">
        <input
          id="fAiQuery" type="text"
          placeholder='Opiši šta tražiš — npr. „kuća u Vojvodini ispod 5 miliona" ili „stan blizu Beograda, prva prodaja"'
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') doAiFilter(); }}
        />
        <button className="btn btn-ai" disabled={busy} onClick={doAiFilter}>Filtriraj AI-em</button>
      </div>
      {status.text && (
        <div className={`ai-status${status.type ? ' ' + status.type : ''}`}>
          {status.text.startsWith('__loading__') && (
            <>
              <div className="spinner" style={{ borderTopColor: '#7c3aed' }}></div>
              AI analizira {status.text.replace('__loading__', '')} aukcija…
            </>
          )}
          {status.text.startsWith('__found__') && (
            <>
              ✦ AI pronašao <strong>{status.text.replace('__found__', '')}</strong> aukcija koje odgovaraju &mdash;{' '}
              <button className="btn-ai-clear" onClick={clearAiFilter}>Ukloni AI filter</button>
            </>
          )}
          {!status.text.startsWith('__loading__') && !status.text.startsWith('__found__') && status.text}
        </div>
      )}
    </div>
  );
}
