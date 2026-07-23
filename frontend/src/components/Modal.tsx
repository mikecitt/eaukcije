import { useEffect, useRef, type ReactNode } from 'react';

export default function Modal({ children, onClose, initialFocusRef }: {
  children: ReactNode;
  onClose: () => void;
  initialFocusRef?: React.RefObject<HTMLElement>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const t = setTimeout(() => initialFocusRef?.current?.focus(), 50);
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      clearTimeout(t);
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <dialog ref={dialogRef}>{children}</dialog>;
}
