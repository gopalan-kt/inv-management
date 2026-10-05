import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={`toast${toast ? '' : ' hidden'}`}>{toast ?? ''}</div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
