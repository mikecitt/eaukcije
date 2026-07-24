import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useMessage } from '../context/MessageContext';
import DeleteUserModal from './DeleteUserModal';
import type { UserAccount } from '../types';

export default function AdminView() {
  const { showMsg } = useMessage();
  const [users, setUsers] = useState<UserAccount[] | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createErr, setCreateErr] = useState('');
  const [pendingDelete, setPendingDelete] = useState<UserAccount | null>(null);

  const loadUsers = async () => {
    try {
      setUsers(await api.listUsers());
    } catch (err: any) {
      showMsg('error', `Greška pri učitavanju korisnika: ${err.message}`);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const onCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setCreateErr('');
    const username = newUsername.trim();
    try {
      await api.createUser(username, newPassword);
      setNewUsername('');
      setNewPassword('');
      showMsg('success', `Korisnik "${username}" je kreiran.`);
      loadUsers();
    } catch (err: any) {
      setCreateErr(err.message);
    }
  };

  const onConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.deleteUser(pendingDelete.id);
      setPendingDelete(null);
      showMsg('info', 'Korisnik je obrisan.');
      loadUsers();
    } catch (err: any) {
      showMsg('error', err.message);
    }
  };

  return (
    <div id="viewAdmin" className="view main">
      <div className="card">
        <div className="card-header">Kreiraj novog korisnika</div>
        <form className="create-form" onSubmit={onCreateUser}>
          <div className="fg">
            <label htmlFor="newUsername">Korisničko ime</label>
            <input
              type="text" id="newUsername" required autoComplete="off"
              value={newUsername} onChange={e => setNewUsername(e.target.value)}
            />
          </div>
          <div className="fg">
            <label htmlFor="newPassword">Početna lozinka</label>
            <input
              type="password" id="newPassword" required autoComplete="new-password"
              value={newPassword} onChange={e => setNewPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit">Kreiraj korisnika</button>
        </form>
        <div className="form-err">{createErr}</div>
      </div>

      <div className="card">
        <div className="card-header">{users ? `${users.length} korisnika` : 'Učitavanje...'}</div>
        <table>
          <thead>
            <tr><th>Korisničko ime</th><th>Uloga</th><th>Kreiran</th><th></th></tr>
          </thead>
          <tbody>
            {users && users.length === 0 && (
              <tr><td colSpan={4}><div className="empty">Nema korisnika</div></td></tr>
            )}
            {users?.map(u => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td><span className={`badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}`}>{u.role}</span></td>
                <td className="col-added">{new Date(u.created_at).toLocaleDateString('sr-RS')}</td>
                <td>
                  {u.role !== 'admin' && (
                    <button className="btn btn-outline" style={{ padding: '4px 10px' }} onClick={() => setPendingDelete(u)}>
                      Obriši
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendingDelete && (
        <DeleteUserModal
          username={pendingDelete.username}
          onConfirm={onConfirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
