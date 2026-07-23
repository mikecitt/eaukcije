import { useEffect, useState } from 'react';

export default function AppLoader({ done }: { done: boolean }) {
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setRemoved(true), 500);
    return () => clearTimeout(t);
  }, [done]);

  if (removed) return null;

  return (
    <div id="appLoader" className={done ? 'fade-out' : ''}>
      <div className="loader-inner">
        <div className="loader-title">EAukcije</div>
        <div className="loader-sub">Sudske aukcije nepokretnosti</div>
        <div className="loader-ring"></div>
        <div className="loader-status">Učitavanje podataka…</div>
      </div>
    </div>
  );
}
