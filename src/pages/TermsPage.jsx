import LegalDocument from '../components/marketing/LegalDocument';
import { terms } from '../content/legal/terms';

// Content lives in src/content/legal/terms.js — the same module that
// generates public/terms-of-service.html at build time.
export default function TermsPage() {
  return <LegalDocument doc={terms} />;
}
