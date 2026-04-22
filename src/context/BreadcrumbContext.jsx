import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const BreadcrumbContext = createContext(null);

export function BreadcrumbProvider({ children }) {
  // Each entry is { label, pathOverride? }. pathOverride lets detail pages
  // that share a URL with another list (e.g. vendor bills at
  // /invoicing/invoices/:id) redirect the parent crumb to its real list.
  const [dynamicLabels, setDynamicLabels] = useState({});

  const setDetailLabel = useCallback((path, label, opts) => {
    const pathOverride = opts?.pathOverride || null;
    setDynamicLabels(prev => {
      const existing = prev[path];
      if (existing && existing.label === label && existing.pathOverride === pathOverride) return prev;
      return { ...prev, [path]: { label, pathOverride } };
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
    return dynamicLabels[path]?.label || null;
  }, [dynamicLabels]);

  const getDetailPathOverride = useCallback((path) => {
    return dynamicLabels[path]?.pathOverride || null;
  }, [dynamicLabels]);

  const value = useMemo(() => ({
    setDetailLabel,
    clearDetailLabel,
    getDetailLabel,
    getDetailPathOverride,
  }), [setDetailLabel, clearDetailLabel, getDetailLabel, getDetailPathOverride]);

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
