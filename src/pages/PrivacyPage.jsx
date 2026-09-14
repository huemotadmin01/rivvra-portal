import LegalDocument from '../components/marketing/LegalDocument';
import { privacy } from '../content/legal/privacy';

// Content lives in src/content/legal/privacy.js — the same module that
// generates public/privacy-policy.html (the URL registered with Google for
// OAuth verification) at build time.
export default function PrivacyPage() {
  return <LegalDocument doc={privacy} />;
}
