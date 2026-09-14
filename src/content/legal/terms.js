/**
 * Terms of Service — the ONE source of truth.
 *
 * Rendered by src/pages/TermsPage.jsx (the /terms route) and by
 * scripts/build-legal-static.mjs into public/terms-of-service.html (the
 * static copy Google OAuth verification and older links point at). Edit here,
 * never in the generated HTML. Bump `lastUpdated` whenever the wording
 * changes — it is what a returning customer uses to see that something moved.
 *
 * Block shapes: { p: 'text' } · { ul: ['item', …] } · { callout: 'text' }.
 * Inline links use [label](https://…) and are rendered by both outputs.
 */

export const terms = {
  slug: 'terms',
  title: 'Terms of Service',
  effectiveDate: 'March 1, 2026',
  lastUpdated: 'September 14, 2026',
  intro:
    'These Terms govern your use of Rivvra, the staffing platform operated by Huemot Technology Private Limited. They are written to be read, not skimmed: each section says what it means in plain language.',
  sections: [
    {
      heading: '1. Who we are and what you are agreeing to',
      blocks: [
        { p: 'Rivvra (the "Service") is operated by Huemot Technology Private Limited, a company incorporated in India ("Rivvra", "we", "us"). By creating an account, joining a workspace, or using the Service in any way, you agree to these Terms and to our [Privacy Policy](/privacy). If you are accepting on behalf of a company, you confirm you are authorised to bind it, and "you" means that company.' },
        { p: 'If you do not agree, do not use the Service. We may update these Terms; material changes are announced in the product and by updating the date above, and continued use after that date is acceptance.' },
      ],
    },
    {
      heading: '2. The Service',
      blocks: [
        { p: 'Rivvra is a modular platform for staffing agencies and recruiting teams. It currently includes Outreach, Employee Self-Service and Timesheets, CRM, ATS, Payroll, Employee, Contacts, Sign, To-Do, Invoicing, Expenses, Incentive, Documents and Knowledge Base, plus a public careers site and a Chrome extension. Which apps are switched on in a workspace is chosen by that workspace\'s owner.' },
        { p: 'We improve the Service continuously and may add, change or retire features. We will give reasonable notice before retiring anything that a paid workspace depends on.' },
      ],
    },
    {
      heading: '3. Accounts and workspaces',
      blocks: [
        { p: 'You register with a valid work email address and keep your credentials confidential. You are responsible for everything done under your account, and you must tell us promptly at [support@rivvra.com](mailto:support@rivvra.com) if you suspect unauthorised use.' },
        { p: 'A workspace belongs to the organisation that created it. Its owner and admins decide who is a member, what each member can see, and which apps are enabled. Members act on behalf of that organisation; disputes about who controls a workspace are for that organisation to resolve, and we will follow the instructions of its verified owner.' },
        { p: 'You must be at least 18 to use the Service.' },
      ],
    },
    {
      heading: '4. Free plan and usage limits',
      blocks: [
        { p: 'New workspaces start on the Free plan: every app, no time limit, no card required. Free is capped on team members, active records, outreach emails per day and storage. When a workspace reaches a cap the related action pauses and we prompt you to upgrade; nothing already stored is deleted. Current limits are listed on the [pricing page](/pricing).' },
        { p: 'Some AI-assisted features (résumé scoring, suggestions, the Ask Rivvra assistant) are metered. We may limit or pause them on the Free plan to keep the Service sustainable.' },
      ],
    },
    {
      heading: '5. Paid plans, billing and cancellation',
      blocks: [
        { ul: [
          'Paid plans are priced per active user per month, billed monthly or annually in advance through our payment processor, Stripe. Prices are shown in US dollars unless stated otherwise; applicable taxes (including GST in India) are added where required.',
          'Subscriptions renew automatically at the end of each billing period until cancelled.',
          'You can upgrade, change seat count or cancel at any time from Settings → Billing. Upgrades and added seats take effect immediately and are charged pro rata. Cancelling stops future renewals; the paid plan stays active until the end of the period you have already paid for, after which the workspace returns to the Free plan and its limits.',
          'Fees already paid are non-refundable except where the law requires otherwise or where we have failed to provide the Service for a material part of a billing period, in which case contact us and we will put it right.',
          'If a payment fails we will retry and notify the workspace owner. If it remains unpaid after our retries, the workspace returns to the Free plan. Your data is not deleted because of a failed payment.',
          'We may change prices with at least 30 days\' notice; the new price applies from your next renewal.',
        ] },
      ],
    },
    {
      heading: '6. Your data',
      blocks: [
        { p: 'Everything you put into the Service — candidates, employees, contacts, timesheets, invoices, documents, messages — is your data. You own it. We process it only to provide the Service to you, as described in the [Privacy Policy](/privacy), and on your instructions.' },
        { p: 'You are responsible for having the right to collect and use that data: for candidate and employee information this means having a lawful basis and giving the notices your law requires, and for outreach it means complying with anti-spam and marketing law where your recipients are.' },
        { p: 'You can export a complete copy of your workspace at any time from Settings → General, and a workspace owner can delete the whole workspace from the same page. Deletion is immediate and irreversible in the product; residual copies in backups expire within 30 days.' },
      ],
    },
    {
      heading: '7. Acceptable use',
      blocks: [
        { p: 'You agree not to:' },
        { ul: [
          'send unsolicited bulk email, or email people who have opted out, from the Outreach app or any connected mailbox;',
          'upload purchased or scraped contact lists you have no right to use, or anyone\'s data you are not permitted to process;',
          'use the Service to discriminate unlawfully in hiring, pay or any other decision;',
          'probe, scan, overload or attempt to gain unauthorised access to the Service or another workspace;',
          'reverse-engineer the Service, resell it, or use it to build a competing product;',
          'upload malware or content that infringes someone else\'s rights.',
        ] },
        { p: 'We may suspend a workspace or account that breaks these rules. We will tell you why and, where the problem is fixable, give you the chance to fix it.' },
      ],
    },
    {
      heading: '8. Payroll, statutory and tax features',
      blocks: [
        { callout: 'Rivvra calculates and formats payroll, statutory contributions, GST, TDS and similar figures from the settings and data you enter. These are tools, not advice. You remain responsible for the accuracy of your inputs, for reviewing every output, and for all filings, payments and compliance with the laws that apply to your organisation. Consult a qualified professional for anything you are unsure of.' },
      ],
    },
    {
      heading: '9. AI features',
      blocks: [
        { p: 'Some features use third-party AI models to score résumés, suggest candidates, draft text or answer questions about your workspace. AI output can be wrong, incomplete or biased. It is a starting point for a person to review, not a decision. You must not rely on it as the sole basis for a hiring, pay or other decision about an individual.' },
        { p: 'Data sent to AI providers for these features is limited to what the feature needs and is not used by those providers to train their models. Data obtained through Google APIs is never sent to an AI model.' },
      ],
    },
    {
      heading: '10. Third-party services',
      blocks: [
        { p: 'The Service connects to services you choose to link, such as Google (sign-in and Gmail sending), Stripe (billing) and your email provider. Their terms govern your use of them. If you connect Google, you may revoke Rivvra\'s access at any time from your Google Account security settings.' },
      ],
    },
    {
      heading: '11. Intellectual property and feedback',
      blocks: [
        { p: 'The Service, its design, code and documentation belong to Huemot Technology Private Limited and are protected by copyright and other laws. You get a limited, non-exclusive, non-transferable right to use it under these Terms. You keep all rights to your data. If you send us feedback or suggestions we may use them without obligation to you.' },
      ],
    },
    {
      heading: '12. Availability and support',
      blocks: [
        { p: 'We work to keep the Service available and back up its data daily, but we do not promise uninterrupted or error-free operation, and the Free plan carries no uptime commitment. Support is by email at [support@rivvra.com](mailto:support@rivvra.com); paid plans get faster responses as described on the pricing page.' },
      ],
    },
    {
      heading: '13. Termination',
      blocks: [
        { p: 'You may stop using the Service at any time and delete your workspace from Settings. We may suspend or terminate access for a material breach of these Terms, for non-payment after notice, or if required by law. On termination your right to use the Service ends; you can export your data before deleting a workspace, and we will keep a suspended workspace\'s data available for export for 30 days unless the law prevents it.' },
      ],
    },
    {
      heading: '14. Warranties and liability',
      blocks: [
        { p: 'The Service is provided "as is" and "as available". To the fullest extent the law allows, we exclude all implied warranties, including merchantability, fitness for a particular purpose and non-infringement.' },
        { p: 'To the fullest extent the law allows, neither party is liable to the other for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue or data, however caused. Our total liability for all claims relating to the Service in any twelve-month period is limited to the amount you paid us for the Service in that period. Nothing in these Terms limits liability that cannot be limited by law.' },
        { p: 'You will indemnify us against third-party claims arising from your data, your use of the Service in breach of these Terms, or your breach of applicable law.' },
      ],
    },
    {
      heading: '15. Governing law',
      blocks: [
        { p: 'These Terms are governed by the laws of India. The courts of Bhopal, Madhya Pradesh, India have exclusive jurisdiction over any dispute, without prejudice to either party seeking urgent injunctive relief elsewhere. If any part of these Terms is found unenforceable the rest continues to apply.' },
      ],
    },
    {
      heading: '16. Contact',
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

export default terms;
