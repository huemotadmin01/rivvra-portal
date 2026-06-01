import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, type === 'error' ? 5000 : 3000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Adapter for the object-style API used by the Documents app:
  //   toast({ title, description, variant })
  // The rest of the platform calls showToast(message, type) directly. The
  // Documents pages were written against this `toast` shape, which never
  // existed on the context — so every toast() call threw "toast is not a
  // function" and silently aborted the line right after it (the list refresh
  // / modal close / navigate), making mutations look like they "didn't work".
  // Mapping it here fixes all Documents call sites at once.
  const toast = useCallback((opts = {}) => {
    const { title, description, variant } = opts;
    const type = variant === 'error' ? 'error' : variant === 'warning' ? 'warning' : 'success';
    const message = [title, description].filter(Boolean).join(': ') || 'Done';
    showToast(message, type);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, addToast: showToast, toast }}>
      {children}
      {/* Toast container - fixed bottom, responsive */}
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-[9999] space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium animate-slide-up cursor-pointer
              ${toast.type === 'error'
                ? 'bg-red-500/90 text-white border border-red-400/30'
                : toast.type === 'warning'
                  ? 'bg-amber-500/90 text-dark-950 border border-amber-400/30'
                  : 'bg-rivvra-500/90 text-dark-950 border border-rivvra-400/30'
              }`}
            onClick={() => dismissToast(toast.id)}
          >
            <span className="shrink-0 mt-0.5">
              {toast.type === 'error' ? '\u2717' : toast.type === 'warning' ? '\u26A0' : '\u2713'}
            </span>
            <span className="break-words">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
