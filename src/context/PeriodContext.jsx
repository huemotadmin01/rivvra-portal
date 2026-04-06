import { createContext, useContext, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePlatform } from './PlatformContext';

const PeriodContext = createContext(null);

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Apps that support the period filter
const PERIOD_ENABLED_APPS = new Set(['timesheet', 'payroll']);

const STORAGE_KEY = 'rivvra_period';

function getStoredPeriod() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { month, year } = JSON.parse(raw);
    if (month >= 1 && month <= 12 && year >= 2020 && year <= 2100) return { month, year };
  } catch {}
  return null;
}

function storePeriod(month, year) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ month, year })); } catch {}
}

export function PeriodProvider({ children }) {
  const { currentApp } = usePlatform();
  const [searchParams, setSearchParams] = useSearchParams();
  const isActive = PERIOD_ENABLED_APPS.has(currentApp?.id);

  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();

  // Priority: URL params > sessionStorage > current month
  const urlMonth = parseInt(searchParams.get('month'));
  const urlYear = parseInt(searchParams.get('year'));
  const hasUrlPeriod = urlMonth >= 1 && urlMonth <= 12 && urlYear >= 2020 && urlYear <= 2100;
  const stored = getStoredPeriod();

  let month, year;
  if (isActive && hasUrlPeriod) {
    month = urlMonth;
    year = urlYear;
  } else if (isActive && stored) {
    month = stored.month;
    year = stored.year;
  } else {
    month = defaultMonth;
    year = defaultYear;
  }

  // Sync URL if it doesn't match resolved period (e.g. restored from session)
  useEffect(() => {
    if (!isActive) return;
    const curM = parseInt(searchParams.get('month'));
    const curY = parseInt(searchParams.get('year'));
    if (curM !== month || curY !== year) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('month', String(month));
        next.set('year', String(year));
        return next;
      }, { replace: true });
    }
  }, [isActive, month, year]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to sessionStorage whenever period changes
  useEffect(() => {
    if (isActive) storePeriod(month, year);
  }, [isActive, month, year]);

  // FY derivation (India: April to March)
  const fyStartYear = month >= 4 ? year : year - 1;
  const fyEndYear = fyStartYear + 1;
  const fy = `${fyStartYear}-${fyEndYear}`;
  const fyApi = `${fyStartYear}-${String(fyEndYear).slice(2)}`; // "2025-26" for API calls
  const fyShort = `FY ${fyApi}`; // "FY 2025-26" for display

  const setPeriod = useCallback((m, y) => {
    storePeriod(m, y);
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
