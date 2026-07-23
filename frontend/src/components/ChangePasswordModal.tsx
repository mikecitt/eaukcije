import { useRef, useState } from 'react';
import Modal from './Modal';
import { api } from '../api';
import { useMessage } from '../context/MessageContext';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { showMsg } = useMessage();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!oldPassword || !newPassword) {
      setErr('Popunite oba polja.');
      return;
    }
    if (newPassword.length < 8) {
      setErr('Nova lozinka mora imati bar 8 karaktera.');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      onClose();
      showMsg('success', 'Lozinka je uspešno promenjena.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} initialFocusRef={inputRef}>
      <div className="modal-title">Promena lozinke</div>
      <div className="modal-desc">Unesite trenutnu i novu lozinku (bar 8 karaktera).</div>
      <input
        ref={inputRef}
        className="modal-input" type="password" placeholder="Trenutna lozinka" autoComplete="current-password"
        value={oldPassword} onChange={e => setOldPassword(e.target.value)}
      />
      <input
        className="modal-input" type="password" placeholder="Nova lozinka" autoComplete="new-password"
        value={newPassword} onChange={e => setNewPassword(e.target.value)}
      />
      <div className="modal-err">{err}</div>
      <div className="modal-actions">
        <button className="btn btn-modal-cancel" onClick={onClose}>Odustani</button>
        <button className="btn btn-modal-confirm" style={{ background: 'var(--primary)' }} disabled={busy} onClick={submit}>Sačuvaj</button>
      </div>
    </Modal>
  );
}
