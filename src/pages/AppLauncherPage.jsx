import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useOrg } from '../context/OrgContext';
import { Building2, Check, Calendar, User, Loader2 } from 'lucide-react';
import AppGrid from '../components/platform/AppGrid';
import RivvraLogo from '../components/BrynsaLogo';
import api from '../utils/api';
import activityApi from '../utils/activityApi';

const TYPE_BADGES = {
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

function AppLauncherPage() {
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  const { currentOrg } = useOrg();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const orgSlug = currentOrg?.slug;

  const [myActivities, setMyActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  useEffect(() => {
    if (!orgSlug) { setActivitiesLoading(false); return; }
    activityApi.my(orgSlug, { isDone: false, limit: 5 })
      .then(res => {
        if (res.success) setMyActivities(res.activities || []);
      })
      .catch(() => {})
      .finally(() => setActivitiesLoading(false));
  }, [orgSlug]);

  const handleMarkDone = async (id) => {
    try {
      await activityApi.markDone(orgSlug, id, true);
      setMyActivities(prev => prev.filter(a => a._id !== id));
    } catch {
      // silently fail
    }
  };

  const companyLogoUrl = currentCompany?.hasLogo && currentCompany?._id
    ? `${api.baseUrl}/api/org-company/${currentCompany._id}/logo`
    : null;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-3xl w-full">
        {/* Company Branding + Welcome — fade in + slide up */}
        <div className="text-center mb-10" style={{ animation: 'fadeSlideUp 0.5s ease-out both' }}>
          {/* Company Logo */}
          <div className="flex justify-center mb-4">
            {companyLogoUrl ? (
              <img
                src={companyLogoUrl}
                alt={currentCompany?.name || ''}
                className="w-16 h-16 rounded-2xl object-contain bg-dark-800"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center">
                <Building2 className="w-8 h-8 text-rivvra-400" />
              </div>
            )}
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome back, {firstName}
          </h1>
          <p className="text-dark-400 text-lg">
            {currentCompany?.name || 'Your staffing agency command center'}
          </p>
        </div>

        {/* App Grid */}
        <AppGrid />

        {/* My Activities Widget */}
        {!activitiesLoading && myActivities.length > 0 && (
          <div className="mt-8 bg-dark-850 border border-dark-700 rounded-xl p-4"
            style={{ animation: 'fadeSlideUp 0.5s ease-out 0.3s both' }}>
            <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">
              My Upcoming Activities
            </h3>
            <div className="space-y-1">
              {myActivities.map(a => (
                <div key={a._id} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-dark-800/50 group">
                  <button onClick={() => handleMarkDone(a._id)}
                    className="mt-0.5 w-4 h-4 rounded border border-dark-600 hover:border-dark-400 flex items-center justify-center flex-shrink-0">
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_BADGES[a.type] || TYPE_BADGES.note}`}>
                        {a.type}
                      </span>
                      <span className="text-[10px] text-dark-600">
                        {ENTITY_LABELS[a.entityType] || a.entityType}
                      </span>
                      {a.dueDate && (
                        <span className="text-[10px] text-dark-500 flex items-center gap-0.5">
                          <Calendar size={9} /> {new Date(a.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {a.summary && <p className="text-xs text-dark-200 mt-0.5 truncate">{a.summary}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Powered by Rivvra */}
        <a
          href="https://rivvra.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 mt-12 opacity-40 hover:opacity-60 transition-opacity"
        >
          <RivvraLogo className="w-4 h-4" />
          <span className="text-xs text-dark-500">Powered by Rivvra</span>
        </a>
      </div>

      {/* Keyframes for animations */}
      <style>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes cardEntrance {
          from {
            opacity: 0;
            transform: translateY(24px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

export default AppLauncherPage;
