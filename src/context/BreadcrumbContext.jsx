import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const BreadcrumbContext = createContext(null);

export function BreadcrumbProvider({ children }) {
  const [dynamicLabels, setDynamicLabels] = useState({});

  const setDetailLabel = useCallback((path, label) => {
    setDynamicLabels(prev => {
      if (prev[path] === label) return prev;
      return { ...prev, [path]: label };
    });
  }, []);

  const clearDetailLabel = useCallback((path) => {
    setDynamicLabels(prev => {
      if (!prev[path]) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const getDetailLabel = useCallback((path) => {
    return dynamicLabels[path] || null;
  }, [dynamicLabels]);

  const value = useMemo(() => ({
    setDetailLabel,
    clearDetailLabel,
    getDetailLabel,
  }), [setDetailLabel, clearDetailLabel, getDetailLabel]);

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbContext() {
  const context = useContext(BreadcrumbContext);
  if (!context) throw new Error('useBreadcrumbContext must be used within BreadcrumbProvider');
  return context;
}
