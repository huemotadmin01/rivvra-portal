import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import api from '../utils/api';
import UsagePanel from '../components/UsagePanel';
import {
  Crown, Check, Users, AlertTriangle, Sparkles,
  CreditCard, ExternalLink, Loader2, ArrowRight, Shield,
  Calendar, RefreshCw,
} from 'lucide-react';

const PRICING = {
  growth: {
    name: 'Growth',
    price: 3, // per user / month, billed monthly
    currency: 'USD',
    features: [
      'All 14 apps',
      'Up to 25 team members',
      '10,000 active records',
      '500 outreach emails / day',
      '25 GB storage',
      'Email support',
    ],
  },
  scale: {
    name: 'Scale',
    price: 6,
    currency: 'USD',
    features: [
      'All 14 apps',
      'Unlimited team members',
      'Unlimited active records',
      '2,000 outreach emails / day',
      '100 GB storage',
      'Priority support',
    ],
  },
};

// Per-seat monthly-equivalent given the billing period (annual = 2 months free).
function perSeatFor(plan, period) {
  return period === 'annual' ? (plan.price * 10) / 12 : plan.price;
}

function UpgradePage() {
  const { currentOrg, orgSlug, isOrgOwner, isOrgAdmin, refetchOrg } = useOrg();
  const [searchParams] = useSearchParams();

  const [selectedPlan, setSelectedPlan] = useState('growth');
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [seatCount, setSeatCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stripeSuccess, setStripeSuccess] = useState(false);
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
  const monthlyEquivTotal = perSeatFor(plan, billingPeriod) * seatCount; // $/mo equivalent
  const annualTotal = plan.price * 10 * seatCount;                       // $/yr if annual
  const isPaid = ['growth', 'scale', 'core', 'all_apps', 'pro', 'enterprise'].includes(currentOrg?.plan);

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
        billingPeriod,
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
          Your plan is active and your higher limits are now in effect. Billing is managed securely through Stripe.
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

        <UsagePanel orgSlug={orgSlug} />

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
                  ? (currentOrg?.billing?.billingPeriod === 'annual'
                      ? `$${PRICING[currentOrg.plan].price * 10}/user/year`
                      : `$${PRICING[currentOrg.plan].price}/user/month`)
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

  // ── Upgrade flow for Free orgs ───────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="w-12 h-12 bg-rivvra-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Crown className="w-6 h-6 text-rivvra-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Upgrade {currentOrg?.name || 'Your Organization'}</h1>
        <p className="text-dark-300">
          Upgrade to raise your team, record, email and storage limits and keep your team productive.
        </p>

        {/* Billing period toggle */}
        <div className="inline-flex items-center gap-1 mt-6 p-1 rounded-full border border-dark-700 bg-dark-900">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${billingPeriod === 'monthly' ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod('annual')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${billingPeriod === 'annual' ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white'}`}
          >
            Annual
            <span className="text-[10px] font-semibold text-rivvra-300 bg-rivvra-500/15 rounded px-1.5 py-0.5">2 months free</span>
          </button>
        </div>
      </div>

      <UsagePanel orgSlug={orgSlug} />

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
              <span className="text-3xl font-bold text-white">${perSeatFor(p, billingPeriod).toFixed(billingPeriod === 'annual' ? 2 : 0)}</span>
              <span className="text-dark-400 ml-1">/user/mo</span>
              <p className="text-xs text-dark-500 mt-1">
                {billingPeriod === 'annual' ? `billed annually · $${p.price * 10}/user/yr` : 'billed monthly'}
              </p>
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
            <span className="text-white font-semibold">${perSeatFor(plan, billingPeriod).toFixed(billingPeriod === 'annual' ? 2 : 0)}</span>
            <span className="text-dark-500 mx-2">=</span>
            <span className="text-rivvra-400 font-bold text-xl">${monthlyEquivTotal.toFixed(billingPeriod === 'annual' ? 2 : 0)}</span>
            <span className="text-sm text-dark-400">/month</span>
          </div>
        </div>
        {billingPeriod === 'annual' && (
          <p className="text-xs text-dark-500 mt-3">Billed annually as ${annualTotal}/year for {seatCount} seat{seatCount > 1 ? 's' : ''}.</p>
        )}
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
              Upgrade to {plan.name} — ${monthlyEquivTotal.toFixed(billingPeriod === 'annual' ? 2 : 0)}/mo
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
