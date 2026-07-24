import { useState } from 'react';
import Modal from './Modal';
import { useAuctionsData } from '../context/AuctionsDataContext';
import { KNOWN_STATUSES, DEFAULT_EXCLUDED_STATUSES } from '../utils';

export default function RefreshConfirmModal({ onClose }: { onClose: () => void }) {
  const { doRefresh } = useAuctionsData();
  const [excluded, setExcluded] = useState<Set<string>>(new Set(DEFAULT_EXCLUDED_STATUSES));

  const toggle = (status: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };

  const confirm = () => {
    onClose();
    doRefresh([...excluded]);
  };

  return (
    <Modal onClose={onClose} className="modal-wide">
      <div className="modal-title">Potvrdi osvežavanje</div>
      <div className="modal-desc">
        Aukcije sa označenim statusima neće biti osvežavane — te aukcije su završene i njihovi podaci se više ne menjaju.
      </div>
      <div className="status-exclude-grid">
        {KNOWN_STATUSES.map(s => (
          <label key={s} className="check-filter">
            <input type="checkbox" checked={excluded.has(s)} onChange={() => toggle(s)} />
            {s}
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn btn-modal-cancel" onClick={onClose}>Odustani</button>
        <button className="btn btn-modal-confirm" style={{ background: 'var(--primary)' }} onClick={confirm}>Osveži</button>
      </div>
    </Modal>
  );
}
