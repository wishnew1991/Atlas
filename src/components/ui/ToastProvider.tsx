"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type ToastMessage = {
  id: string;
  text: string;
  duration?: number;
};

const ToastContext = createContext<{
  addToast: (msg: string, duration?: number) => void;
} | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((msg: string, duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text: msg, duration }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="atlas-toast-container" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className="atlas-toast">
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
