// ============================================================================
// ContactForm.jsx — Creates a blank contact and redirects to detail page
// Mirrors Odoo behavior: "New" instantly creates a draft record, user edits inline.
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import { Loader2 } from 'lucide-react';

export default function ContactForm() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const contactType = searchParams.get('type') || 'company';
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // If editing (contactId present), redirect straight to detail page
    if (contactId) {
      navigate(orgPath(`/contacts/${contactId}`), { replace: true });
      return;
    }

    // Create a blank contact and redirect to its detail page
    if (!creating && orgSlug) {
      setCreating(true);
      (async () => {
        try {
          const res = await contactsApi.create(orgSlug, {
            type: contactType,
            name: '',
          });
          const newId = res?.contact?._id;
          if (newId) {
            navigate(orgPath(`/contacts/${newId}?new=true`), { replace: true });
          } else {
            showToast('Failed to create contact', 'error');
            navigate(orgPath('/contacts/list'), { replace: true });
          }
        } catch (err) {
          showToast(err.message || 'Failed to create contact', 'error');
          navigate(orgPath('/contacts/list'), { replace: true });
        }
      })();
    }
  }, [contactId, orgSlug, creating, navigate, orgPath, showToast, contactType]);

  return (
    <div className="bg-dark-900 min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 size={32} className="animate-spin text-rivvra-500 mx-auto mb-3" />
        <p className="text-dark-400">Creating contact...</p>
      </div>
    </div>
  );
}
