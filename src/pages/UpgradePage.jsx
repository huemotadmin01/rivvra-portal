import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import api from '../utils/api';
import {
  Crown, Check, Users, Clock, AlertTriangle, Sparkles,
  CreditCard, ExternalLink, Loader2, ArrowRight, Shield,
  Calendar, RefreshCw,
} from 'lucide-react';

const PRICING = {
  core: {
    name: 'Core',
    price: 10,
    currency: 'USD',
    period: 'user/month',
    features: [
      'ATS, CRM, Contacts',
      'Employee, Sign, Payroll',
      'Up to 25 users',
      'Email support',
    ],
  },
  all_apps: {
    name: 'All Apps',
    price: 15,
    currency: 'USD',
    period: 'user/month',
    features: [
      'Everything in Core',
      'Outreach, Timesheet, To-Do',
      'Unlimited users',
      'Priority support',
      'Chrome extension',
      'Cross-app workflows',
    ],
  },
};

function UpgradePage() {
  const { currentOrg, orgSlug, trial, isOrgOwner, isOrgAdmin, refetchOrg } = useOrg();
  const [searchParams] = useSearchParams();

  const [selectedPlan, setSelectedPlan] = useState('core');
  const [seatCount, setSeatCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stripeSuccess, setStripeSuccess] = useState(false);
  const [trialStatus, setTrialStatus] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  // Check for Stripe redirect success/cancel
  useEffect(() => {
    if (searchParams.get('stripe_success') === 'true') {
      setStripeSuccess(true);
      refetchOrg();
    }
    if (searchParams.get('stripe_cancelled') === 'true') {
      setError('Checkout was cancelled. You can try again when ready.');
    }
    // Pre-select plan from query param
    const planParam = searchParams.get('plan');
    if (planParam && PRICING[planParam]) {
      setSelectedPlan(planParam);
    }
  }, [searchParams, refetchOrg]);

  // Fetch trial status
  useEffect(() => {
    if (orgSlug) {
      api.getTrialStatus(orgSlug)
        .then(res => { if (res.success) setTrialStatus(res.trial); })
        .catch(() => {});
    }
  }, [orgSlug]);

  // Fetch subscription status
  useEffect(() => {
    if (orgSlug) {
      setSubLoading(true);
      api.getSubscriptionStatus(orgSlug)
        .then(res => {
          if (res.subscription) setSubscription(res.subscription);
        })
        .catch(() => {})
        .finally(() => setSubLoading(false));
    }
  }, [orgSlug, stripeSuccess]);

  const plan = PRICING[selectedPlan];
  const monthlyTotal = plan.price * seatCount;
  const isPaid = currentOrg?.plan === 'core' || currentOrg?.plan === 'all_apps' || currentOrg?.plan === 'pro' || currentOrg?.plan === 'enterprise';

  // Redirect to Stripe Checkout
  const handleCheckout = async () => {
    if (!isOrgOwner && !isOrgAdmin) {
      setError('Only organization owners or admins can upgrade.');
      return;
    }
    if (seatCount < 1) {
      setError('At least 1 seat is required.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await api.createCheckoutSession(orgSlug, {
        plan: selectedPlan,
        seats: seatCount,
      });
      if (result.url) {
        window.location.href = result.url;
      } else {
        setError(result.error || 'Failed to create checkout session.');
      }
    } catch (err) {
      setError(err.message || 'Failed to create checkout session.');
    } finally {
      setLoading(false);
    }
  };

  // Open Stripe Billing Portal
  const handleManageBilling = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const result = await api.createBillingPortalSession(orgSlug);
      if (result.url) {
        window.location.href = result.url;
      } else {
        setError(result.error || 'Failed to open billing portal.');
      }
    } catch (err) {
      setError(err.message || 'Failed to open billing portal.');
    } finally {
      setPortalLoading(false);
    }
  };

  // ── Success state after Stripe checkout ──────────────────────────────
  if (stripeSuccess) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="w-20 h-20 bg-rivvra-500/20 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-rivvra-500/10">
          <Sparkles className="w-10 h-10 text-rivvra-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">You're all set!</h1>
        <p className="text-dark-300 text-lg mb-2">
          Your organization has been successfully upgraded.
        </p>
        <p className="text-dark-400 text-sm mb-8">
          All platform apps are now unlocked. Your subscription is active and will be managed through Stripe.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            to={`/org/${orgSlug}/home`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg font-semibold transition-colors"
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-dark-800 hover:bg-dark-700 text-dark-200 rounded-lg font-medium transition-colors border border-dark-600"
          >
            {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Manage Billing
          </button>
        </div>
      </div>
    );
  }

  // ── Subscription management for paid orgs ────────────────────────────
  if (isPaid && !stripeSuccess) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-12 h-12 bg-rivvra-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Crown className="w-6 h-6 text-rivvra-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Subscription & Billing</h1>
          <p className="text-dark-400">Manage your {currentOrg?.name} subscription</p>
        </div>

        {/* Current Plan Card */}
        <div className="bg-dark-900 rounded-xl border border-dark-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-white capitalize">{currentOrg?.plan} Plan</h2>
                <span className="px-2 py-0.5 text-xs font-medium bg-rivvra-500/20 text-rivvra-400 rounded-full">Active</span>
              </div>
              <p className="text-sm text-dark-400">
                {PRICING[currentOrg?.plan]?.price
                  ? `$${PRICING[currentOrg?.plan]?.price}/user/month`
                  : 'Custom pricing'}
              </p>
            </div>
            <Shield className="w-8 h-8 text-rivvra-500/40" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-dark-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-dark-400" />
                <span className="text-xs text-dark-400 uppercase tracking-wider">Seats</span>
              </div>
              <p className="text-xl font-bold text-white">
                {subscription?.seats || currentOrg?.billing?.seatsTotal || '—'}
              </p>
            </div>
            <div className="bg-dark-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-dark-400" />
                <span className="text-xs text-dark-400 uppercase tracking-wider">Next billing</span>
              </div>
              <p className="text-sm font-semibold text-white">
                {subscription?.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })
                  : '—'}
              </p>
            </div>
            <div className="bg-dark-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-dark-400" />
                <span className="text-xs text-dark-400 uppercase tracking-wider">Status</span>
              </div>
              <p className="text-sm font-semibold text-white capitalize">
                {subscription?.status || 'Active'}
              </p>
            </div>
          </div>
        </div>

        {/* Payment failed warning */}
        {currentOrg?.billing?.paymentFailed && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300">Payment failed</p>
              <p className="text-xs text-red-400/80 mt-1">
                Your last payment didn't go through. Please update your payment method to avoid service interruption.
              </p>
            </div>
          </div>
        )}

        {/* Cancel notice */}
        {subscription?.cancelAtPeriodEnd && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-300">Cancellation scheduled</p>
              <p className="text-xs text-amber-400/80 mt-1">
                Your subscription will end on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                You can reactivate from the billing portal.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-rivvra-500 hover:bg-rivvra-600 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors"
          >
            {portalLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            Manage Billing
          </button>
          <button
            onClick={() => { setSubLoading(true); api.getSubscriptionStatus(orgSlug).then(res => { if (res.subscription) setSubscription(res.subscription); }).catch(() => {}).finally(() => setSubLoading(false)); }}
            disabled={subLoading}
            className="inline-flex items-center gap-2 px-4 py-3 bg-dark-800 hover:bg-dark-700 text-dark-300 rounded-lg font-medium transition-colors border border-dark-600"
          >
            <RefreshCw className={`w-4 h-4 ${subLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <p className="text-xs text-dark-500 text-center mt-4">
          Billing is managed securely through Stripe. You can update payment methods, change seats, or cancel anytime.
        </p>
      </div>
    );
  }

  // ── Upgrade flow for free/trial orgs ─────────────────────────────────
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
          Upgrade to unlock all features and keep your team productive.
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

      {/* Seat Count */}
      <div className="bg-dark-900 rounded-xl p-6 border border-dark-700 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Users className="w-5 h-5 text-dark-400" />
          <h3 className="text-lg font-semibold text-white">Number of Seats</h3>
        </div>
        <p className="text-sm text-dark-400 mb-4">Each seat allows one team member to access all platform apps.</p>
        <div className="flex items-center gap-4">
          <input
            type="number"
            min={1}
            max={1000}
            value={seatCount}
            onChange={(e) => setSeatCount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-center text-lg font-semibold focus:outline-none focus:border-rivvra-500"
          />
          <div className="text-dark-300">
            <span className="text-sm">seats</span>
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
          onClick={handleCheckout}
          disabled={loading || (!isOrgOwner && !isOrgAdmin)}
          className="inline-flex items-center gap-2 px-8 py-3 bg-rivvra-500 hover:bg-rivvra-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-lg transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Redirecting to checkout...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Upgrade to {plan.name} — ${monthlyTotal}/mo
            </>
          )}
        </button>
        <div className="flex items-center justify-center gap-2 mt-3">
          <Shield className="w-3.5 h-3.5 text-dark-500" />
          <p className="text-xs text-dark-500">
            Secure checkout powered by Stripe. Cancel anytime.
          </p>
        </div>
        {!isOrgOwner && !isOrgAdmin && (
          <p className="text-xs text-amber-400 mt-2">Only organization owners or admins can upgrade.</p>
        )}
      </div>
    </div>
  );
}

export default UpgradePage;
