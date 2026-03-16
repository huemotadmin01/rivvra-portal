import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import RivvraLogo from '../components/RivvraLogo';

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-dark-950 relative">
      {/* Nav */}
      <nav className="relative z-10 border-b border-dark-800/50 bg-dark-950/80 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-dark-800 flex items-center justify-center shadow-lg shadow-rivvra-500/20 group-hover:shadow-rivvra-500/30 transition-shadow">
                <RivvraLogo className="w-6 h-6" />
              </div>
              <span className="text-lg font-bold text-white">Rivvra</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link to="/features" className="text-sm text-dark-300 hover:text-white transition-colors">Features</Link>
              <Link to="/pricing" className="text-sm text-dark-300 hover:text-white transition-colors">Pricing</Link>
              <Link to="/signup" className="px-5 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-semibold hover:bg-rivvra-400 transition-colors flex items-center gap-1.5">
                Start free trial
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <Link to="/signup" className="md:hidden px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-semibold">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-dark-400 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to home
        </Link>

        <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-dark-400 mb-12">Last updated: February 8, 2025</p>

        <div className="space-y-10 text-dark-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. Introduction</h2>
            <p>
              Rivvra ("we", "our", or "us") operates the Rivvra Chrome Extension and the Rivvra web portal
              (collectively, the "Service"). This Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use our Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. Information We Collect</h2>
            <h3 className="text-lg font-medium text-dark-200 mb-3">2.1 Information You Provide</h3>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Account information (name, email address) when you sign up</li>
              <li>Organization and team settings you configure</li>
              <li>Notes and tags you add to contacts</li>
              <li>Timesheet entries and project data you submit</li>
            </ul>

            <h3 className="text-lg font-medium text-dark-200 mb-3 mt-6">2.2 Information Collected Automatically</h3>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>LinkedIn profile data from pages you visit while using the extension (name, title, company, publicly available email)</li>
              <li>Extension usage data (features used, extraction events)</li>
              <li>Browser type and version for compatibility</li>
            </ul>

            <h3 className="text-lg font-medium text-dark-200 mb-3 mt-6">2.3 Information We Do Not Collect</h3>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>We do not collect your LinkedIn login credentials</li>
              <li>We do not collect browsing history outside of LinkedIn</li>
              <li>We do not collect any financial or payment information through the extension</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>To provide and maintain our Service</li>
              <li>To extract and organize LinkedIn contact data as requested by you</li>
              <li>To generate AI-powered email and message suggestions</li>
              <li>To enrich contact data with email discovery and verification</li>
              <li>To sync your data across devices via our portal</li>
              <li>To improve and optimize our Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. Data Storage and Security</h2>
            <p>
              Your data is stored securely on our servers using industry-standard encryption and security measures.
              We use MongoDB for data storage and all API communications are encrypted via HTTPS. We retain your
              data for as long as your account is active or as needed to provide you with our Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">5. Data Sharing</h2>
            <p className="mb-4">We do not sell or transfer your personal data to third parties. Your data may be shared only in the following cases:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong className="text-dark-200">Google Sheets Integration:</strong> When you choose to export data to Google Sheets, data is sent to your connected Google account</li>
              <li><strong className="text-dark-200">CRM Export:</strong> When you explicitly export contacts to a CRM system (e.g., Odoo), data is sent to your configured CRM</li>
              <li><strong className="text-dark-200">AI Services:</strong> Contact data may be processed by AI services (OpenAI) to generate personalized messages, subject to their privacy policies</li>
              <li><strong className="text-dark-200">Legal Requirements:</strong> We may disclose data if required by law or in response to valid legal requests</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">6. Your Rights</h2>
            <p className="mb-4">You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data and account</li>
              <li>Export your data in a portable format</li>
              <li>Withdraw consent at any time by uninstalling the extension</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">7. Cookies and Local Storage</h2>
            <p>
              The extension uses Chrome's local storage API to store your preferences, authentication tokens,
              and cached data locally on your device. The web portal may use cookies for session management
              and authentication purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">8. Third-Party Services</h2>
            <p className="mb-4">Our Service integrates with the following third-party services:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><strong className="text-dark-200">Google OAuth:</strong> For user authentication</li>
              <li><strong className="text-dark-200">Google Sheets API:</strong> For data export functionality</li>
              <li><strong className="text-dark-200">Gmail API:</strong> For sending email sequences from your account</li>
              <li><strong className="text-dark-200">OpenAI API:</strong> For AI-generated email and message content</li>
              <li><strong className="text-dark-200">LinkedIn:</strong> For extracting publicly available profile data</li>
              <li><strong className="text-dark-200">Resend:</strong> For transactional emails (OTP, invites)</li>
            </ul>
            <p className="mt-4">Each of these services has its own privacy policy governing data handling.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">9. Children's Privacy</h2>
            <p>
              Our Service is not intended for use by individuals under the age of 18. We do not knowingly
              collect personal data from children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify users of any material
              changes by updating the "Last updated" date at the top of this page. Continued use of the
              Service after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">11. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or our data practices, please contact us at:
            </p>
            <p className="mt-4">
              <strong className="text-dark-200">Email:</strong>{' '}
              <a href="mailto:support@rivvra.com" className="text-rivvra-400 hover:text-rivvra-300 transition-colors">
                support@rivvra.com
              </a>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-dark-800/50 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-dark-800 flex items-center justify-center">
                <RivvraLogo className="w-5 h-5" />
              </div>
              <span className="font-semibold text-white">Rivvra</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-dark-400">
              <Link to="/privacy" className="hover:text-white transition-colors text-white">Privacy Policy</Link>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="mailto:support@rivvra.com" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-dark-500 text-sm">&copy; {new Date().getFullYear()} Rivvra. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default PrivacyPage;
