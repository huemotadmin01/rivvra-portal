import { useState, useEffect } from 'react';
import { useOrg } from '../context/OrgContext';
import api from '../utils/api';
import { Crown, Check, Users, Clock, AlertTriangle, Sparkles } from 'lucide-react';

const PRICING = {
  pro: {
    name: 'Pro',
    price: 29,
    currency: 'USD',
    period: 'user/month',
    features: [
      'All Outreach features',
      'Timesheet & Employee management',
      'Unlimited sequences',
      'Gmail integration',
      'Team management',
      'Priority support',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    price: 49,
    currency: 'USD',
    period: 'user/month',
    features: [
      'Everything in Pro',
      'CRM integration',
      'ATS (coming soon)',
      'Custom branding',
      'Dedicated support',
      'SLA guarantee',
    ],
  },
};

function UpgradePage() {
  const { currentOrg, orgSlug, trial, isOrgOwner, isOrgAdmin, refetchOrg } = useOrg();

  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [licenseCount, setLicenseCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [trialStatus, setTrialStatus] = useState(null);

  // Fetch detailed trial status
  useEffect(() => {
    if (orgSlug) {
      api.getTrialStatus(orgSlug)
        .then(res => { if (res.success) setTrialStatus(res.trial); })
        .catch(() => {});
    }
  }, [orgSlug]);

  const plan = PRICING[selectedPlan];
  const monthlyTotal = plan.price * licenseCount;

  const handleUpgrade = async () => {
    if (!isOrgOwner && !isOrgAdmin) {
      setError('Only organization owners or admins can upgrade');
      return;
    }
    if (licenseCount < 3) {
      setError('Minimum 3 user licenses required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await api.upgradeOrg(orgSlug, {
        licenseCount,
        plan: selectedPlan,
      });
      if (result.success) {
        setSuccess(true);
        refetchOrg(); // Refresh org context to remove trial banner
      } else {
        setError(result.error || 'Upgrade failed');
      }
    } catch (err) {
      setError(err.message || 'Upgrade failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="w-16 h-16 bg-rivvra-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-8 h-8 text-rivvra-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">Welcome to {plan.name}!</h1>
        <p className="text-dark-300 text-lg mb-8">
          Your organization has been upgraded with {licenseCount} user licenses.
          All features are now unlocked.
        </p>
        <a
          href={`/#/org/${orgSlug}/outreach/dashboard`}
          className="inline-flex items-center gap-2 px-6 py-3 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg font-semibold transition-colors"
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  const displayTrial = trialStatus || trial;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="w-12 h-12 bg-rivvra-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Crown className="w-6 h-6 text-rivvra-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Upgrade {currentOrg?.name || 'Your Organization'}</h1>
        <p className="text-dark-300">
          {displayTrial?.status === 'active' && `${displayTrial.daysRemaining ?? 0} days left in your trial. `}
          {displayTrial?.status === 'grace' && 'Your trial has ended. Data is read-only. '}
          {displayTrial?.status === 'archived' && 'Your organization has been archived. '}
          Upgrade to continue with all features.
        </p>
      </div>

      {/* Trial Status Card */}
      {displayTrial && displayTrial.status !== 'none' && displayTrial.status !== 'converted' && (
        <div className={`rounded-xl p-4 mb-8 flex items-center gap-3 ${
          displayTrial.status === 'active' ? 'bg-rivvra-500/10 border border-rivvra-500/30' :
          displayTrial.status === 'grace' ? 'bg-amber-500/10 border border-amber-500/30' :
          'bg-red-500/10 border border-red-500/30'
        }`}>
          {displayTrial.status === 'active' ? (
            <Clock className="w-5 h-5 text-rivvra-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          )}
          <div>
            <span className={`text-sm font-medium ${
              displayTrial.status === 'active' ? 'text-rivvra-300' :
              displayTrial.status === 'grace' ? 'text-amber-300' : 'text-red-300'
            }`}>
              {displayTrial.status === 'active' && `Trial active — ${displayTrial.daysRemaining} days remaining`}
              {displayTrial.status === 'grace' && `Read-only mode — upgrade to restore write access`}
              {displayTrial.status === 'archived' && `Organization archived — upgrade to restore everything`}
            </span>
          </div>
        </div>
      )}

      {/* Plan Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {Object.entries(PRICING).map(([key, p]) => (
          <button
            key={key}
            onClick={() => setSelectedPlan(key)}
            className={`text-left rounded-xl p-6 border-2 transition-all ${
              selectedPlan === key
                ? 'border-rivvra-500 bg-rivvra-500/10'
                : 'border-dark-700 bg-dark-900 hover:border-dark-600'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">{p.name}</h3>
              {selectedPlan === key && (
                <div className="w-6 h-6 bg-rivvra-500 rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div className="mb-4">
              <span className="text-3xl font-bold text-white">${p.price}</span>
              <span className="text-dark-400 ml-1">/{p.period}</span>
            </div>
            <ul className="space-y-2">
              {p.features.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-dark-300">
                  <Check className="w-4 h-4 text-rivvra-500 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      {/* License Count */}
      <div className="bg-dark-900 rounded-xl p-6 border border-dark-700 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-5 h-5 text-dark-400" />
          <h3 className="text-lg font-semibold text-white">Number of User Licenses</h3>
        </div>
        <p className="text-sm text-dark-400 mb-4">Minimum 3 licenses required. Each license allows one user to access all apps.</p>
        <div className="flex items-center gap-4">
          <input
            type="number"
            min={3}
            max={1000}
            value={licenseCount}
            onChange={(e) => setLicenseCount(Math.max(3, parseInt(e.target.value) || 3))}
            className="w-24 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-center text-lg font-semibold focus:outline-none focus:border-rivvra-500"
          />
          <div className="text-dark-300">
            <span className="text-sm">users</span>
            <span className="text-dark-500 mx-2">x</span>
            <span className="text-white font-semibold">${plan.price}</span>
            <span className="text-dark-500 mx-2">=</span>
            <span className="text-rivvra-400 font-bold text-xl">${monthlyTotal}</span>
            <span className="text-sm text-dark-400">/month</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* CTA */}
      <div className="text-center">
        <button
          onClick={handleUpgrade}
          disabled={loading || (!isOrgOwner && !isOrgAdmin)}
          className="px-8 py-3 bg-rivvra-500 hover:bg-rivvra-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-lg transition-colors"
        >
          {loading ? 'Processing...' : `Upgrade to ${plan.name} — $${monthlyTotal}/mo`}
        </button>
        <p className="text-xs text-dark-500 mt-3">
          Payment integration coming soon. Contact support@rivvra.com for billing setup.
        </p>
        {!isOrgOwner && !isOrgAdmin && (
          <p className="text-xs text-amber-400 mt-2">Only organization owners or admins can upgrade.</p>
        )}
      </div>
    </div>
  );
}

export default UpgradePage;
