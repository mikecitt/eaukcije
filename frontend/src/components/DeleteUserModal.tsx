import { useState } from 'react';
import Modal from './Modal';

export default function DeleteUserModal({ username, onConfirm, onClose }: {
  username: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="modal-title">Obriši korisnika</div>
      <div className="modal-desc">
        Da li ste sigurni da želite da obrišete korisnika "{username}"? Ova akcija se ne može poništiti.
      </div>
      <div className="modal-actions">
        <button className="btn btn-modal-cancel" onClick={onClose}>Odustani</button>
        <button className="btn btn-modal-confirm" disabled={busy} onClick={confirm}>Obriši</button>
      </div>
    </Modal>
  );
}
