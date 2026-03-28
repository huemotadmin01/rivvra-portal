import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useOrg } from '../../context/OrgContext';
import { LayoutGrid, LogOut, Settings, Building2, UserCircle, Menu, X, ChevronDown, Check, Clock, Calendar } from 'lucide-react';
import RivvraLogo from '../RivvraLogo';
import { API_BASE_URL } from '../../utils/config';
import activityApi from '../../utils/activityApi';

const ACT_TYPE_BADGES = {
  note:        'bg-dark-700 text-dark-300',
  call:        'bg-blue-500/10 text-blue-400',
  meeting:     'bg-purple-500/10 text-purple-400',
  email:       'bg-amber-500/10 text-amber-400',
  task:        'bg-emerald-500/10 text-emerald-400',
  onboarding:  'bg-rivvra-500/10 text-rivvra-400',
  offboarding: 'bg-orange-500/10 text-orange-400',
};

const ENTITY_LABELS = {
  employee: 'Employee',
  crm_opportunity: 'Opportunity',
  crm_contact: 'Contact',
  ats_application: 'Application',
  ats_job: 'Job',
};

const appColorMap = {
  rivvra: 'text-rivvra-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
};

function TopBar({ onToggleSidebar, sidebarOpen }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { currentApp, orgPath } = usePlatform();
  const { companies, currentCompany, switchCompany, hasMultipleCompanies, switching } = useCompany();
  const { currentOrg, isOrgAdmin } = useOrg();
  const orgPlan = currentOrg?.plan || 'free';
  const isPro = orgPlan === 'pro' || orgPlan === 'premium' || orgPlan === 'paid';
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const companyDropdownRef = useRef(null);
  const orgSlug = currentOrg?.slug;

  // Activities dropdown
  const [activities, setActivities] = useState([]);
  const [actOpen, setActOpen] = useState(false);
  const actRef = useRef(null);

  useEffect(() => {
    if (!orgSlug) return;
    activityApi.my(orgSlug, { isDone: false, limit: 10 })
      .then(res => { if (res.success) setActivities(res.activities || []); })
      .catch(() => {});
  }, [orgSlug]);

  const handleMarkDone = async (id) => {
    await activityApi.markDone(orgSlug, id, true).catch(() => {});
    setActivities(prev => prev.filter(a => a._id !== id));
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(e.target)) {
        setCompanyDropdownOpen(false);
      }
      if (actRef.current && !actRef.current.contains(e.target)) {
        setActOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/find-workspace');
  };

  return (
    <header className="h-14 border-b border-dark-800/50 bg-dark-950/80 backdrop-blur-xl sticky top-0 z-40">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Left: Hamburger + Rivvra Brand + Grid + Company Switcher + App Badge */}
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
            <RivvraLogo className="w-7 h-7" />
            <span className="text-base font-bold text-white tracking-tight">Rivvra</span>
            <div className="w-px h-4 bg-dark-700 ml-0.5" />
            <LayoutGrid className="w-5 h-5 text-dark-400" />
          </Link>

          {/* Company Switcher */}
          {hasMultipleCompanies && (
            <div className="relative" ref={companyDropdownRef}>
              <button
                onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-800/50 hover:bg-dark-800 transition-colors text-sm"
              >
                <Building2 className="w-3.5 h-3.5 text-dark-400" />
                <span className="text-dark-200 font-medium max-w-[160px] truncate">{currentCompany?.name || 'Select Company'}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-dark-500 transition-transform ${companyDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {companyDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-72 bg-dark-900 border border-dark-700 rounded-xl p-1.5 shadow-xl z-50">
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-dark-500 font-semibold">Companies</p>
                  {companies.map((c) => {
                    const isActive = String(c._id) === String(currentCompany?._id);
                    return (
                      <button
                        key={c._id}
                        disabled={switching}
                        onClick={() => {
                          setCompanyDropdownOpen(false);
                          if (!isActive) switchCompany(c._id);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-rivvra-500/10 text-rivvra-400'
                            : 'text-dark-300 hover:text-white hover:bg-dark-800/50'
                        } ${switching ? 'opacity-50 cursor-wait' : ''}`}
                      >
                        <Building2 className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1 truncate">{c.name}</span>
                        {c.currency && <span className="text-[10px] text-dark-500 font-mono">{c.currency}</span>}
                        {isActive && <Check className="w-4 h-4 text-rivvra-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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

        {/* Right: Activities + User */}
        <div className="flex items-center gap-1">
          {/* Activities dropdown */}
          <div className="relative" ref={actRef}>
            <button
              onClick={() => setActOpen(!actOpen)}
              className="relative p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800/50 transition-colors"
              aria-label="My Activities"
            >
              <Clock className="w-5 h-5" />
              {activities.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-rivvra-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {activities.length > 9 ? '9+' : activities.length}
                </span>
              )}
            </button>

            {actOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-80 bg-dark-900 border border-dark-700 rounded-xl shadow-xl z-50">
                <div className="px-4 py-2.5 border-b border-dark-700">
                  <p className="text-xs font-semibold text-dark-300">My Activities</p>
                </div>
                {activities.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <Clock className="w-6 h-6 text-dark-600 mx-auto mb-1.5" />
                    <p className="text-xs text-dark-500">No pending activities</p>
                  </div>
                ) : (
                  <div className="max-h-[360px] overflow-y-auto p-1.5">
                    {activities.map(a => (
                      <div key={a._id} className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-dark-800/50 group">
                        <button
                          onClick={() => handleMarkDone(a._id)}
                          className="mt-0.5 w-4 h-4 rounded border border-dark-600 hover:border-rivvra-400 hover:bg-rivvra-500/20 flex items-center justify-center flex-shrink-0 transition-colors"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${ACT_TYPE_BADGES[a.type] || ACT_TYPE_BADGES.note}`}>
                              {a.type}
                            </span>
                            <span className="text-[9px] text-dark-500">
                              {a.entityName || (ENTITY_LABELS[a.entityType] || a.entityType)}
                            </span>
                            {a.dueDate && (
                              <span className="text-[9px] text-dark-500 flex items-center gap-0.5">
                                <Calendar size={8} /> {new Date(a.dueDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {a.summary && <p className="text-xs text-dark-200 mt-0.5 truncate">{a.summary}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-dark-800/50 transition-colors">
              {user?.picture ? (
                <img src={user.picture?.startsWith('/api/') ? `${API_BASE_URL}${user.picture}` : user.picture} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
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
                  to={orgPath('/my-profile')}
                  className="flex items-center gap-2 px-3 py-2 text-dark-300 hover:text-white hover:bg-dark-800/50 rounded-lg transition-colors text-sm"
                >
                  <UserCircle className="w-4 h-4" />
                  My Profile
                </Link>
                {isOrgAdmin && (
                  <Link
                    to={orgPath('/settings/general')}
                    className="flex items-center gap-2 px-3 py-2 text-dark-300 hover:text-white hover:bg-dark-800/50 rounded-lg transition-colors text-sm"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </Link>
                )}
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
