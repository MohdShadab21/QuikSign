"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  pushToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const value = useMemo<ToastContextValue>(
    () => ({
      pushToast: (message: string, type: ToastType = "info") => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        setToasts((current) => [...current, { id, message, type }]);
        window.setTimeout(() => {
          setToasts((current) => current.filter((entry) => entry.id !== id));
        }, 2800);
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl border px-3 py-2 text-sm shadow-lg backdrop-blur-md ${
              toast.type === "success"
                ? "border-emerald-300 bg-emerald-100/90 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/80 dark:text-emerald-100"
                : toast.type === "error"
                  ? "border-rose-300 bg-rose-100/90 text-rose-900 dark:border-rose-700 dark:bg-rose-900/80 dark:text-rose-100"
                  : "border-blue-300 bg-blue-100/90 text-blue-900 dark:border-blue-700 dark:bg-blue-900/80 dark:text-blue-100"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
