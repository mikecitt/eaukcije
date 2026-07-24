import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      setUsername('');
      setPassword('');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="loginScreen">
      <form className="login-card" onSubmit={onSubmit} autoComplete="on">
        <div className="login-title">EAukcije</div>
        <div className="login-sub">Prijavite se za pristup sistemu</div>
        <div className="fg">
          <label htmlFor="loginUsername">Korisničko ime</label>
          <input
            type="text" id="loginUsername" name="username" autoComplete="username" required
            value={username} onChange={e => setUsername(e.target.value)}
          />
        </div>
        <div className="fg">
          <label htmlFor="loginPassword">Lozinka</label>
          <input
            type="password" id="loginPassword" name="password" autoComplete="current-password" required
            value={password} onChange={e => setPassword(e.target.value)}
          />
        </div>
        <div className="login-err">{err}</div>
        <button type="submit" disabled={busy}>{busy ? 'Prijavljivanje...' : 'Prijavi se'}</button>
      </form>
    </div>
  );
}
