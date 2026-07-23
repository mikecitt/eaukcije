import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type MsgType = 'error' | 'success' | 'info';

interface Message { type: MsgType; text: string }

interface MessageContextValue {
  message: Message | null;
  showMsg: (type: MsgType, text: string) => void;
  clearMsg: () => void;
}

const MessageContext = createContext<MessageContextValue | null>(null);

export function MessageProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<Message | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMsg = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(null);
  }, []);

  const showMsg = useCallback((type: MsgType, text: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage({ type, text });
    if (type !== 'error') {
      timeoutRef.current = setTimeout(() => setMessage(null), 8000);
    }
  }, []);

  return (
    <MessageContext.Provider value={{ message, showMsg, clearMsg }}>
      {children}
    </MessageContext.Provider>
  );
}

export function useMessage(): MessageContextValue {
  const ctx = useContext(MessageContext);
  if (!ctx) throw new Error('useMessage must be used within MessageProvider');
  return ctx;
}
