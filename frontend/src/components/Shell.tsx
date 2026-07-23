import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './Header';
import AuctionsView from './AuctionsView';
import AdminView from './AdminView';
import { useAuth } from '../context/AuthContext';
import { useMessage } from '../context/MessageContext';

export default function Shell() {
  const { currentUser } = useAuth();
  const { message } = useMessage();
  const isAdmin = currentUser?.role === 'admin';

  return (
    <div id="shell">
      <Header />
      <div className="msg-wrap">
        {message && (
          <div className={`alert alert-${message.type}`}>{message.text}</div>
        )}
      </div>
      <Routes>
        <Route path="/" element={<AuctionsView />} />
        <Route path="/admin" element={isAdmin ? <AdminView /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
