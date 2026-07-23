import { useAuth } from './context/AuthContext';
import { MessageProvider } from './context/MessageContext';
import { AuctionsDataProvider } from './context/AuctionsDataContext';
import AppLoader from './components/AppLoader';
import LoginScreen from './components/LoginScreen';
import Shell from './components/Shell';

export default function App() {
  const { currentUser, loading } = useAuth();

  return (
    <>
      <AppLoader done={!loading} />
      {!loading && (
        currentUser ? (
          <MessageProvider>
            <AuctionsDataProvider>
              <Shell />
            </AuctionsDataProvider>
          </MessageProvider>
        ) : (
          <LoginScreen />
        )
      )}
    </>
  );
}
