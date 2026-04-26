import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { Building2, Search, X } from 'lucide-react';
import AppBentoGrid from '../components/platform/AppBentoGrid';
import RivvraLogo from '../components/RivvraLogo';
import api from '../utils/api';

function AppLauncherPage() {
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  const firstName = user?.name?.split(' ')[0] || 'there';

  const companyLogoUrl = currentCompany?.hasLogo && currentCompany?._id
    ? `${api.baseUrl}/api/org-company/${currentCompany._id}/logo`
    : null;

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (e.key === 'Escape' && searchOpen) {
        setQuery('');
        setSearchOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const openSearch = () => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 0); };
  const clearSearch = () => { setQuery(''); setSearchOpen(false); inputRef.current?.blur(); };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-6 py-10 relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(800px 500px at 15% 0%, rgba(34, 197, 94, 0.06), transparent 60%),radial-gradient(600px 400px at 100% 100%, rgba(59, 130, 246, 0.05), transparent 60%)' }} />
      <div className="max-w-6xl w-full mx-auto relative">
        <div className="flex items-center justify-between mb-8 gap-4" style={{ animation: 'fadeSlideUp 0.5s ease-out both' }}>
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-full border border-dark-800 bg-dark-900/60 backdrop-blur shrink-0">
            {companyLogoUrl ? (
              <img src={companyLogoUrl} alt={currentCompany?.name || ''} className="w-6 h-6 rounded-full object-contain bg-dark-800" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-dark-800 flex items-center justify-center">
                <Building2 className="w-3.5 h-3.5 text-rivvra-400" />
              </div>
            )}
            <span className="text-sm text-white font-medium truncate max-w-[200px]">{currentCompany?.name || 'Workspace'}</span>
            <span className="w-1 h-1 rounded-full bg-dark-600" />
            <span className="text-sm text-dark-400 hidden sm:inline">{today}</span>
          </div>
          {!searchOpen ? (
            <button type="button" onClick={openSearch} className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-dark-800 bg-dark-900/60 text-dark-400 hover:text-white hover:border-dark-700 transition-colors">
              <Search className="w-4 h-4" />
              <span className="text-sm">Search apps</span>
              <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-dark-800 border border-dark-700 text-dark-400 font-sans">⌘K</kbd>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-rivvra-500/40 bg-dark-900/80 backdrop-blur w-full sm:w-72 transition-all">
              <Search className="w-4 h-4 text-rivvra-400 shrink-0" />
              <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search apps…" className="bg-transparent outline-none border-none text-sm text-white placeholder:text-dark-500 flex-1 min-w-0" />
              <button type="button" onClick={clearSearch} className="text-dark-500 hover:text-white transition-colors shrink-0" aria-label="Clear search">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <div className="mb-8" style={{ animation: 'fadeSlideUp 0.5s ease-out 0.05s both' }}>
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Hey {firstName},{' '}
            <span className="bg-gradient-to-r from-rivvra-400 to-rivvra-500 bg-clip-text text-transparent">where to today?</span>
          </h1>
          <p className="text-dark-400 mt-2 text-base">{currentCompany?.name || 'Your staffing agency command center'}</p>
        </div>
        <AppBentoGrid query={query} />
        <a href="https://rivvra.com" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 mt-12 opacity-40 hover:opacity-60 transition-opacity">
          <RivvraLogo className="w-4 h-4" />
          <span className="text-xs text-dark-500">Powered by Rivvra</span>
        </a>
      </div>
      <style>{`
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cardEntrance { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}

export default AppLauncherPage;
