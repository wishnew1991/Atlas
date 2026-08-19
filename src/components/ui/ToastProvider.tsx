"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type ToastKind = "info" | "error" | "success";

export type ToastMessage = {
  id: string;
  text: string;
  kind: ToastKind;
  duration?: number;
};

const ToastContext = createContext<{
  addToast: (msg: string, opts?: { kind?: ToastKind; duration?: number }) => void;
} | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((msg: string, opts?: { kind?: ToastKind; duration?: number }) => {
    const kind = opts?.kind ?? "info";
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text: msg, kind, duration: opts?.duration }]);
    // Errors stay until dismissed; info/success auto-dismiss.
    if (kind !== "error") {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, opts?.duration ?? 3000);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="atlas-toast-container" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`atlas-toast atlas-toast--${t.kind}`}>
            <span className="atlas-toast__text">{t.text}</span>
            <button
              type="button"
              className="atlas-toast__dismiss"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
            >
              <span aria-hidden="true">&times;</span>
            </button>
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