import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api } from '../api';
import { useMessage } from '../context/MessageContext';
import type { SchedulePreset } from '../types';

export default function ScheduleModal({ onClose }: { onClose: () => void }) {
  const { showMsg } = useMessage();
  const [presets, setPresets] = useState<SchedulePreset[]>([]);
  const [preset, setPreset] = useState('');
  const [cron, setCron] = useState('');
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getScheduleSettings();
        setPresets(data.presets);
        setPreset(data.current.preset);
        setCron(data.current.preset === 'custom' ? data.current.cron : '');
        setNextRun(data.current.nextRun);
      } catch (e: any) {
        setErr(e.message);
      }
    })();
  }, []);

  const isCustom = preset === 'custom';

  const submit = async () => {
    if (isCustom && !cron.trim()) {
      setErr('Unesite cron izraz.');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await api.putScheduleSettings(preset, isCustom ? cron.trim() : undefined);
      onClose();
      showMsg('success', 'Raspored osvežavanja je sačuvan.');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="modal-title">Podešavanja automatskog osvežavanja</div>
      <div className="modal-desc">Izaberite koliko često se aukcije automatski osvežavaju.</div>
      <select className="modal-input" value={preset} onChange={e => setPreset(e.target.value)}>
        {presets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {isCustom && (
        <input
          className="modal-input" type="text" placeholder="npr. 0 */6 * * *"
          style={{ fontFamily: 'monospace' }}
          value={cron} onChange={e => setCron(e.target.value)}
        />
      )}
      {isCustom && (
        <div className="modal-desc" style={{ marginTop: '-4px' }}>
          Format: minut sat dan-u-mesecu mesec dan-u-nedelji (npr. <code>0 0,12 * * *</code> = u 00:00 i 12:00 svaki dan).
        </div>
      )}
      <div className="modal-desc" style={{ marginBottom: '14px' }}>
        {nextRun ? `Sledeće osvežavanje: ${new Date(nextRun).toLocaleString('sr-RS')}` : ''}
      </div>
      <div className="modal-err">{err}</div>
      <div className="modal-actions">
        <button className="btn btn-modal-cancel" onClick={onClose}>Odustani</button>
        <button className="btn btn-modal-confirm" style={{ background: 'var(--primary)' }} disabled={busy} onClick={submit}>Sačuvaj</button>
      </div>
    </Modal>
  );
}
