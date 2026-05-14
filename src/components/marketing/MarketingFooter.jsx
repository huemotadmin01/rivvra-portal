import { Link } from 'react-router-dom';
import RivvraLogo from '../RivvraLogo';

export default function MarketingFooter() {
  return (
    <footer className="relative z-10 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-5 gap-10 mb-14">
          {/* Brand */}
          <div className="md:col-span-2 space-y-4">
            <Link to="/" className="flex items-center gap-2.5">
              <RivvraLogo className="w-7 h-7" />
              <span className="text-[17px] font-semibold text-white tracking-tight">Rivvra</span>
            </Link>
            <p className="text-dark-500 text-sm leading-relaxed max-w-xs">
              The all-in-one platform for staffing agencies. Nine modular apps that work together.
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="text-[11px] font-semibold text-dark-500 uppercase tracking-widest mb-4">Product</p>
            <ul className="space-y-3">
              <li><Link to="/features" className="text-sm text-dark-400 hover:text-white transition-colors">Features</Link></li>
              <li><Link to="/pricing" className="text-sm text-dark-400 hover:text-white transition-colors">Pricing</Link></li>
              <li><Link to="/signup" className="text-sm text-dark-400 hover:text-white transition-colors">Get started</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="text-[11px] font-semibold text-dark-500 uppercase tracking-widest mb-4">Company</p>
            <ul className="space-y-3">
              <li><Link to="/privacy" className="text-sm text-dark-400 hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="text-sm text-dark-400 hover:text-white transition-colors">Terms of Service</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <p className="text-[11px] font-semibold text-dark-500 uppercase tracking-widest mb-4">Support</p>
            <ul className="space-y-3">
              <li><a href="mailto:support@rivvra.com" className="text-sm text-dark-400 hover:text-white transition-colors">support@rivvra.com</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-dark-600 text-xs">&copy; {new Date().getFullYear()} Rivvra. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="text-xs text-dark-500 hover:text-white transition-colors">Privacy</Link>
            <Link to="/terms" className="text-xs text-dark-500 hover:text-white transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
