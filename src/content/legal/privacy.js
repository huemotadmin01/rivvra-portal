/**
 * Privacy Policy — the ONE source of truth.
 *
 * Rendered by src/pages/PrivacyPage.jsx (the /privacy route) and by
 * scripts/build-legal-static.mjs into public/privacy-policy.html — the URL
 * registered with Google for OAuth verification. The "Gmail Access & Limited
 * Use" section is what that review reads; keep its substance intact.
 *
 * Block shapes: { p: 'text' } · { ul: ['item', …] } · { callout: 'text' }
 * · { table: { head: [...], rows: [[...], …] } }. Inline links: [label](url).
 */

export const privacy = {
  slug: 'privacy',
  title: 'Privacy Policy',
  effectiveDate: 'March 1, 2026',
  lastUpdated: 'September 14, 2026',
  intro:
    'This policy explains what Rivvra collects, why, who it is shared with and what you can do about it. It covers the website at rivvra.com, the Rivvra web application, public careers pages hosted for our customers, and the Rivvra Chrome extension.',
  sections: [
    {
      heading: '1. Who is responsible',
      blocks: [
        { p: 'Rivvra is operated by Huemot Technology Private Limited, India ("Rivvra", "we"). For account and usage information about the people who sign up, we are the data controller (a "data fiduciary" under India\'s Digital Personal Data Protection Act). For the candidate, employee, contact and business data a customer enters into its workspace, that customer is the controller and we process it on their instructions (see section 3).' },
        { p: 'Questions or requests: [support@rivvra.com](mailto:support@rivvra.com).' },
      ],
    },
    {
      heading: '2. What we collect about you',
      blocks: [
        { ul: [
          'Account information: name, work email, password (stored hashed), job title, profile photo, and the answers you give during signup (company name, team size, goals, how you heard about us).',
          'Google account data: if you sign in with Google we receive your name, email and profile picture. Nothing else is accessed for sign-in.',
          'Billing information: plan, seat count and invoices. Card details go directly to Stripe; we never see or store them.',
          'Usage data: pages visited, actions taken, browser, device, IP address and approximate location, collected automatically for security, support and product analytics.',
          'Support correspondence: what you send us when you ask for help.',
        ] },
      ],
    },
    {
      heading: '3. Data your workspace holds about other people',
      blocks: [
        { p: 'Customers use Rivvra to manage candidates, employees, contractors, clients and contacts. That data belongs to the customer\'s workspace and is processed only to provide the Service to them. We do not use it for our own purposes, sell it, or combine it across customers.' },
        { p: 'If you are a candidate, employee or contact whose information is held in a customer\'s workspace, your rights are exercised through that customer. Tell us at [support@rivvra.com](mailto:support@rivvra.com) if you cannot reach them and we will pass your request on.' },
        { p: 'A data processing agreement covering this processing is available to any customer on request.' },
      ],
    },
    {
      heading: '4. How we use your information',
      blocks: [
        { ul: [
          'to create and run your account and workspace;',
          'to provide, secure, support and improve the Service;',
          'to send transactional email such as sign-in codes, invitations, approvals, payslip notices and usage warnings;',
          'to bill paid plans;',
          'to measure how the website and product are used, including which marketing campaign brought a visitor (section 8);',
          'to detect abuse and comply with law.',
        ] },
        { p: 'Where the GDPR or a similar law applies, we rely on performance of a contract, our legitimate interests in running and securing the Service, your consent for optional cookies, and legal obligation.' },
      ],
    },
    {
      heading: '5. Google sign-in, Gmail access and Limited Use',
      blocks: [
        { p: 'When you use "Sign in with Google" we access only the basic profile information (name, email address, profile picture) needed to authenticate you. We do not access Google Drive, Contacts or any other Google service for sign-in.' },
        { p: 'If you choose to connect your Google account in the Outreach module, Rivvra requests the https://www.googleapis.com/auth/gmail.send scope. We use this scope for the sole purpose of sending emails that you compose and explicitly initiate within Rivvra (such as activating an outreach sequence or sending a test email) from your own connected Gmail address. We do not read, modify, organise or delete any content in your mailbox.' },
        { callout: 'Rivvra\'s use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements. Specifically: we use Google user data only to provide and improve the email-sending feature you have enabled; we do not transfer or sell this data to third parties, and we do not use it for advertising; we do not allow humans to read this data, except with your explicit consent, where necessary for security purposes (such as investigating abuse), or to comply with applicable law; and we do not use Google user data to develop, improve or train generalised or non-personalised AI and/or ML models. Rivvra\'s AI-assisted features are powered by a third-party provider (OpenAI) and operate only on data you provide directly within the app (such as résumés or documents you upload); data obtained through Google APIs is never sent to any AI/ML model.' },
        { p: 'You can revoke Rivvra\'s access at any time from your Google Account security settings or by disconnecting Gmail in Outreach settings.' },
      ],
    },
    {
      heading: '6. Who we share data with',
      blocks: [
        { p: 'We do not sell personal data. We share it only with the providers below, each bound by contract to process it solely for us, and with authorities when the law requires.' },
        { table: {
          head: ['Provider', 'What for', 'Where'],
          rows: [
            ['MongoDB Atlas (on AWS)', 'Primary database', 'Asia Pacific (Mumbai)'],
            ['Render', 'Application hosting', 'Singapore'],
            ['Cloudflare', 'Encrypted backups (R2) and bot protection (Turnstile)', 'Asia Pacific'],
            ['GitHub Pages', 'Hosting of the website and web app', 'Global CDN'],
            ['Cloudinary', 'File storage for résumés, documents and images', 'EU / US'],
            ['Resend', 'Transactional email delivery', 'US'],
            ['Stripe', 'Payments and invoicing for paid plans', 'US / India'],
            ['OpenAI', 'AI features: résumé scoring, suggestions, the Ask Rivvra assistant', 'US'],
            ['Google', 'Sign-in and, if you connect it, sending mail from your Gmail', 'Global'],
            ['Google Analytics and Google Ads', 'Website analytics and advertising measurement', 'Global'],
            ['Sentry', 'Error monitoring', 'US'],
          ],
        } },
        { p: 'We will update this list before adding a provider that handles customer data. We may also share data in a merger, acquisition or sale of assets, with notice to you.' },
      ],
    },
    {
      heading: '7. International transfers',
      blocks: [
        { p: 'Data is stored in India and Singapore and may be processed by the providers above in the regions listed. Where a transfer out of your country needs a safeguard under your law, we use standard contractual clauses or the provider\'s equivalent commitments.' },
      ],
    },
    {
      heading: '8. Cookies, local storage and analytics',
      blocks: [
        { p: 'The web app keeps your sign-in token, theme and similar preferences in your browser\'s local storage; these are essential to the Service and are not used for advertising. The Chrome extension uses Chrome\'s local storage in the same way.' },
        { p: 'On the public website we use Google Analytics and Google Ads measurement to understand which pages and campaigns work. For visitors in the European Economic Area, the United Kingdom and Switzerland, advertising and analytics cookies are not set unless you consent; elsewhere they are set on your first visit. If you arrive from a campaign link we keep its parameters (for example utm_campaign) for 30 days so the workspace you create can be attributed to that campaign. You can block or clear cookies in your browser at any time.' },
      ],
    },
    {
      heading: '9. How long we keep data',
      blocks: [
        { ul: [
          'Account and workspace data: for as long as the account or workspace exists.',
          'Deleted workspaces: removed from the live system immediately; copies in daily backups expire within 30 days.',
          'Sign-in codes: 10 minutes. Security and audit logs: up to 12 months.',
          'Billing records: as long as tax law requires.',
        ] },
      ],
    },
    {
      heading: '10. Security',
      blocks: [
        { p: 'All traffic is encrypted in transit; databases and backups are encrypted at rest. Passwords are stored as salted hashes. Access to production is limited to staff who need it and is logged. Workspaces are isolated from each other in every query. Daily backups are stored off the primary cluster and restore-tested weekly. No system is perfectly secure; if you believe your account has been compromised, contact us immediately.' },
      ],
    },
    {
      heading: '11. Your rights',
      blocks: [
        { p: 'Depending on where you live you may have the right to access, correct, delete or receive a copy of your personal data, to object to or restrict processing, to withdraw consent, and to complain to a supervisory authority. Workspace owners can export and delete their whole workspace from Settings without asking us. For anything else, email [support@rivvra.com](mailto:support@rivvra.com); we respond within 30 days and may need to verify your identity first.' },
        { p: 'Residents of India may raise a grievance at the same address; it reaches our grievance officer.' },
      ],
    },
    {
      heading: '12. Children',
      blocks: [
        { p: 'The Service is for businesses and is not directed at anyone under 18. We do not knowingly collect personal data from children; tell us if you think we have and we will delete it.' },
      ],
    },
    {
      heading: '13. Changes to this policy',
      blocks: [
        { p: 'We will announce material changes in the product and update the date at the top of this page. Continued use after that date is acceptance of the revised policy.' },
      ],
    },
    {
      heading: '14. Contact',
      blocks: [
        { ul: [
          'Email: [support@rivvra.com](mailto:support@rivvra.com)',
          'Company: Huemot Technology Private Limited, India',
          'Website: [www.rivvra.com](https://www.rivvra.com)',
        ] },
      ],
    },
  ],
};

export default privacy;
