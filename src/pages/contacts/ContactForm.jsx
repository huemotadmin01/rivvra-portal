// ============================================================================
// ContactForm.jsx — Redirects to ContactDetail in create mode
// No DB record created until user explicitly saves.
// ============================================================================

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';

export default function ContactForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'company';
  const { orgPath } = usePlatform();

  useEffect(() => {
    // Navigate to detail page in create mode — no DB record yet
    navigate(orgPath(`/contacts/new-record?type=${type}`), { replace: true });
  }, [navigate, orgPath, type]);

  return null;
}
