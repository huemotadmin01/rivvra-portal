import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import RivvraLogo from '../RivvraLogo';

const NAV_LINKS = [
  { path: '/features', label: 'Features' },
  { path: '/pricing', label: 'Pricing' },
];

export default function MarketingNav({ activePage }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="relative z-50 border-b border-white/[0.06] bg-dark-950/70 backdrop-blur-xl sticky top-0">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <RivvraLogo className="w-7 h-7" />
          <span className="text-[17px] font-semibold text-white tracking-tight">Rivvra</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ path, label }) => (
            <Link
              key={path}
              to={path}
              className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                activePage === path
                  ? 'text-white bg-white/[0.06]'
                  : 'text-dark-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {label}
            </Link>
          ))}
          <div className="w-px h-5 bg-white/[0.08] mx-3" />
          <Link
            to="/find-workspace"
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-dark-400 hover:text-white transition-colors"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="ml-1 px-5 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-[13px] font-semibold hover:bg-rivvra-400 transition-all hover:shadow-lg hover:shadow-rivvra-500/25 flex items-center gap-1.5"
          >
            Start free trial
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg text-dark-400 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/[0.06] bg-dark-950/95 backdrop-blur-xl">
          <div className="px-6 py-4 space-y-1">
            {NAV_LINKS.map(({ path, label }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activePage === path ? 'text-white bg-white/[0.06]' : 'text-dark-400 hover:text-white'
                }`}
              >
                {label}
              </Link>
            ))}
            <Link
              to="/find-workspace"
              onClick={() => setMobileOpen(false)}
              className="block px-4 py-2.5 rounded-lg text-sm font-medium text-dark-400 hover:text-white transition-colors"
            >
              Log in
            </Link>
            <div className="pt-2">
              <Link
                to="/signup"
                onClick={() => setMobileOpen(false)}
                className="block w-full text-center px-5 py-3 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors"
              >
                Start free trial
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
