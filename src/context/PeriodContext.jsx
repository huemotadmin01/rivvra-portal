import { createContext, useContext, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePlatform } from './PlatformContext';

const PeriodContext = createContext(null);

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Apps that support the period filter
const PERIOD_ENABLED_APPS = new Set(['timesheet', 'payroll']);

export function PeriodProvider({ children }) {
  const { currentApp } = usePlatform();
  const [searchParams, setSearchParams] = useSearchParams();
  const isActive = PERIOD_ENABLED_APPS.has(currentApp?.id);

  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();

  // Read from URL params (or default to current month)
  const urlMonth = parseInt(searchParams.get('month'));
  const urlYear = parseInt(searchParams.get('year'));
  const month = (isActive && urlMonth >= 1 && urlMonth <= 12) ? urlMonth : defaultMonth;
  const year = (isActive && urlYear >= 2020 && urlYear <= 2100) ? urlYear : defaultYear;

  // FY derivation (India: April to March)
  const fyStartYear = month >= 4 ? year : year - 1;
  const fyEndYear = fyStartYear + 1;
  const fy = `${fyStartYear}-${fyEndYear}`;
  const fyApi = `${fyStartYear}-${String(fyEndYear).slice(2)}`; // "2025-26" for API calls
  const fyShort = `FY ${fyApi}`; // "FY 2025-26" for display

  const setPeriod = useCallback((m, y) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('month', String(m));
      next.set('year', String(y));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setMonth = useCallback((m) => setPeriod(m, year), [setPeriod, year]);
  const setYear = useCallback((y) => setPeriod(month, y), [setPeriod, month]);

  const value = useMemo(() => ({
    month, year, fy, fyApi, fyShort, isActive,
    monthName: MONTH_NAMES[month],
    setPeriod, setMonth, setYear,
  }), [month, year, fy, fyApi, fyShort, isActive, setPeriod, setMonth, setYear]);

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) {
    // Fallback for pages outside PeriodProvider
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    const fyStart = m >= 4 ? y : y - 1;
    const fyApiVal = `${fyStart}-${String(fyStart + 1).slice(2)}`;
    return {
      month: m, year: y,
      fy: `${fyStart}-${fyStart + 1}`,
      fyApi: fyApiVal,
      fyShort: `FY ${fyApiVal}`,
      isActive: false,
      monthName: MONTH_NAMES[m],
      setPeriod: () => {}, setMonth: () => {}, setYear: () => {},
    };
  }
  return ctx;
}
