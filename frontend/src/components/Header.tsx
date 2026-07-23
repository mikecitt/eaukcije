import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAuctionsData } from '../context/AuctionsDataContext';
import DeleteDbModal from './DeleteDbModal';
import ChangePasswordModal from './ChangePasswordModal';
import ScheduleModal from './ScheduleModal';

function fmtLastRefresh(ts: string | null): string {
  if (!ts) return 'Nije osveženo';
  const d = new Date(ts);
  return `Posl. osvežavanje: ${d.toLocaleDateString('sr-RS')} ${d.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function Header() {
  const { currentUser, logout } = useAuth();
  const { lastRefresh, refreshBusy, doRefresh, resetAfterLogout } = useAuctionsData();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = currentUser?.role === 'admin';
  const isAdminView = location.pathname === '/admin';

  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = async () => {
    closeMenu();
    await logout();
    resetAfterLogout();
    navigate('/');
  };

  return (
    <>
      <header className="header">
        <div className="header-title" onClick={() => navigate('/')}>
          <h1>{isAdminView ? 'Upravljanje korisnicima' : 'EAukcije — Nepokretnosti'}</h1>
          <p>{isAdminView ? 'EAukcije — administracija' : 'Sudske aukcije nepokretnosti · eaukcija.sud.rs · Kategorija 7'}</p>
        </div>
        <div className="header-actions">
          <span className="last-refresh-label">{fmtLastRefresh(lastRefresh)}</span>
          <div className="menu-wrap" ref={wrapRef}>
            <button
              className={`btn btn-ghost menu-trigger${menuOpen ? ' open' : ''}`}
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
            >
              <span>{currentUser?.username}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                   strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <div className={`dropdown-panel${menuOpen ? ' open' : ''}`} onClick={e => {
              if ((e.target as HTMLElement).closest('.dropdown-item')) closeMenu();
            }}>
              <div className="dropdown-user">
                <strong>{currentUser?.username}</strong><br />
                {isAdmin ? 'Administrator' : 'Korisnik'}
              </div>
              {isAdmin && (
                <button className="dropdown-item" disabled={refreshBusy} onClick={doRefresh}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                       strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Osveži
                </button>
              )}
              {isAdmin && (
                <button className="dropdown-item" onClick={() => navigate('/admin')}>Korisnici</button>
              )}
              {isAdmin && (
                <button className="dropdown-item" onClick={() => setScheduleOpen(true)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                       strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                  Podešavanja osvežavanja
                </button>
              )}
              <button className="dropdown-item" onClick={() => setChangePwOpen(true)}>Promeni lozinku</button>
              {isAdmin && <div className="dropdown-sep" />}
              {isAdmin && (
                <button className="dropdown-item danger" disabled={refreshBusy} onClick={() => setDeleteOpen(true)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                       strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                  Obriši bazu
                </button>
              )}
              <div className="dropdown-sep" />
              <button className="dropdown-item danger" onClick={handleLogout}>Odjava</button>
            </div>
          </div>
        </div>
      </header>

      {deleteOpen && <DeleteDbModal onClose={() => setDeleteOpen(false)} />}
      {changePwOpen && <ChangePasswordModal onClose={() => setChangePwOpen(false)} />}
      {scheduleOpen && <ScheduleModal onClose={() => setScheduleOpen(false)} />}
    </>
  );
}
