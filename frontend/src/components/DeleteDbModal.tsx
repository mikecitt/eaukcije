import { useRef, useState } from 'react';
import Modal from './Modal';
import { useAuctionsData } from '../context/AuctionsDataContext';

export default function DeleteDbModal({ onClose }: { onClose: () => void }) {
  const { clearDatabase } = useAuctionsData();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!password) {
      setErr('Unesite lozinku.');
      return;
    }
    setBusy(true);
    try {
      await clearDatabase(password);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} initialFocusRef={inputRef}>
      <div className="modal-title">Potvrdi brisanje baze</div>
      <div className="modal-desc">Unesite lozinku da biste obrisali sve aukcije. Ova akcija se ne može poništiti.</div>
      <input
        ref={inputRef}
        className={`modal-input${err ? ' error' : ''}`}
        type="password"
        placeholder="Lozinka"
        autoComplete="off"
        value={password}
        onChange={e => { setPassword(e.target.value); setErr(''); }}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
      />
      <div className="modal-err">{err}</div>
      <div className="modal-actions">
        <button className="btn btn-modal-cancel" onClick={onClose}>Odustani</button>
        <button className="btn btn-modal-confirm" disabled={busy} onClick={submit}>Obriši</button>
      </div>
    </Modal>
  );
}
