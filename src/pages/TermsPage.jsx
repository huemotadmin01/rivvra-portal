import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import MarketingLayout from '../components/marketing/MarketingLayout';

function TermsPage() {
  return (
    <MarketingLayout>
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-dark-400 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to home
        </Link>

        <h1 className="text-4xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-dark-400 mb-12">Last updated: March 13, 2026</p>

        <div className="space-y-10 text-dark-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Rivvra ("Service"), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, do not use the Service. We may update these terms from
              time to time, and your continued use constitutes acceptance of any changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. Description of Service</h2>
            <p>
              Rivvra is a modular platform for staffing agencies that provides tools including Outreach,
              Timesheet, CRM, ATS, Payroll, Employee management, Contacts, Sign, and To-Do. The Service
              is provided on a subscription basis with per-seat pricing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. Account Registration</h2>
            <p>
              You must register for an account using a valid work email address. You are responsible for
              maintaining the confidentiality of your account credentials and for all activities that
              occur under your account. You must notify us immediately of any unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. Subscription & Billing</h2>
            <p>
              Paid plans are billed monthly on a per-seat basis. You may upgrade, downgrade, or cancel
              at any time from your billing settings. Changes take effect immediately. All fees are
              non-refundable except as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">5. Free Trial</h2>
            <p>
              New organizations receive a 14-day free trial with access to all apps. No credit card is
              required. When the trial ends, you must select a paid plan to continue using the Service.
              Your data is preserved during and after the trial period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">6. Acceptable Use</h2>
            <p>
              You agree not to use the Service for any unlawful purpose or in violation of any applicable
              laws. You may not attempt to gain unauthorized access to the Service, interfere with its
              operation, or use it to send unsolicited communications in violation of anti-spam laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">7. Data Ownership</h2>
            <p>
              You retain all rights to the data you submit to the Service. We do not claim ownership of
              your content. We use your data solely to provide and improve the Service as described in
              our <Link to="/privacy" className="text-rivvra-400 hover:text-rivvra-300 transition-colors">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Rivvra shall not be liable for any indirect,
              incidental, special, or consequential damages arising from your use of the Service. Our
              total liability shall not exceed the amount you paid for the Service in the 12 months
              preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">9. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service at any time for violation of these
              terms. You may terminate your account at any time by cancelling your subscription and
              contacting support. Upon termination, your right to use the Service ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">10. Contact</h2>
            <p>
              For questions about these Terms of Service, please contact us
              at <a href="mailto:support@rivvra.com" className="text-rivvra-400 hover:text-rivvra-300 transition-colors">support@rivvra.com</a>.
            </p>
          </section>
        </div>
      </main>
    </MarketingLayout>
  );
}

export default TermsPage;
