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

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container - fixed bottom-right */}
      <div className="fixed bottom-6 right-6 z-[9999] space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium animate-slide-up cursor-pointer
              ${toast.type === 'error'
                ? 'bg-red-500/90 text-white border border-red-400/30'
                : toast.type === 'warning'
                  ? 'bg-amber-500/90 text-dark-950 border border-amber-400/30'
                  : 'bg-rivvra-500/90 text-dark-950 border border-rivvra-400/30'
              }`}
            onClick={() => dismissToast(toast.id)}
          >
            <span>
              {toast.type === 'error' ? '\u2717' : toast.type === 'warning' ? '\u26A0' : '\u2713'}
            </span>
            <span>{toast.message}</span>
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
