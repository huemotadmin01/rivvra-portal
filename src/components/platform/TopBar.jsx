import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { LayoutGrid, LogOut, Settings, Crown, Building2, UserCircle, Menu, X } from 'lucide-react';
import RivvraLogo from '../BrynsaLogo';
import api from '../../utils/api';

const appColorMap = {
  rivvra: 'text-rivvra-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
};

function TopBar({ onToggleSidebar, sidebarOpen }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { currentOrg } = useOrg();
  const { currentApp, orgPath } = usePlatform();
  const isPro = user?.plan === 'pro' || user?.plan === 'premium';

  const orgLogoUrl = currentOrg?.logoAvailable && currentOrg?.slug
    ? `${api.baseUrl}/api/org/${currentOrg.slug}/logo`
    : null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-14 border-b border-dark-800/50 bg-dark-950/80 backdrop-blur-xl sticky top-0 z-40">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Left: Hamburger + Org Logo + Name + App Badge */}
        <div className="flex items-center gap-2 md:gap-4">
          {currentApp && (
            <button
              onClick={onToggleSidebar}
              className="md:hidden p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800/50 transition-colors"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
          <Link to={orgPath('/home')} className="flex items-center gap-2">
            {orgLogoUrl ? (
              <img
                src={orgLogoUrl}
                alt={currentOrg?.name || ''}
                className="w-8 h-8 rounded-lg object-contain bg-dark-800"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-rivvra-400" />
              </div>
            )}
            <span className="text-base font-bold text-white">{currentOrg?.name || 'Rivvra'}</span>
          </Link>

          {currentApp && (
            <>
              <div className="w-px h-5 bg-dark-700" />
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-dark-800/50">
                <currentApp.icon className={`w-4 h-4 ${appColorMap[currentApp.color] || 'text-rivvra-400'}`} />
                <span className="text-sm font-medium text-dark-200">{currentApp.name}</span>
              </div>
            </>
          )}
        </div>

        {/* Right: Powered by Rivvra + Grid + User */}
        <div className="flex items-center gap-2">
          {/* Powered by Rivvra */}
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md mr-1" title="Powered by Rivvra">
            <RivvraLogo className="w-3.5 h-3.5" />
            <span className="text-[11px] text-dark-500">Rivvra</span>
          </div>

          <div className="w-px h-4 bg-dark-800 hidden md:block" />

          {/* App grid button */}
          <button
            onClick={() => navigate(orgPath('/home'))}
            className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800/50 transition-colors"
            title="All Apps"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>

          {/* User dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-dark-800/50 transition-colors">
              {user?.picture ? (
                <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rivvra-400 to-rivvra-600 flex items-center justify-center">
                  <span className="text-sm font-bold text-dark-950">
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
              )}
            </button>

            {/* Dropdown */}
            <div className="absolute right-0 top-full mt-1 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="bg-dark-900 border border-dark-700 rounded-xl p-2 shadow-xl">
                <div className="px-3 py-2 border-b border-dark-700 mb-2">
                  <p className="font-medium text-white truncate">{user?.name || 'User'}</p>
                  <p className="text-sm text-dark-400 truncate">{user?.email}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                    isPro ? 'bg-amber-500/20 text-amber-300' : 'bg-dark-700 text-dark-300'
                  }`}>
                    {isPro ? 'Pro' : 'Free'} Plan
                  </span>
                </div>
                <Link
                  to={orgPath('/settings/profile')}
                  className="flex items-center gap-2 px-3 py-2 text-dark-300 hover:text-white hover:bg-dark-800/50 rounded-lg transition-colors text-sm"
                >
                  <UserCircle className="w-4 h-4" />
                  My Profile
                </Link>
                <Link
                  to={orgPath('/settings/general')}
                  className="flex items-center gap-2 px-3 py-2 text-dark-300 hover:text-white hover:bg-dark-800/50 rounded-lg transition-colors text-sm"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default TopBar;
