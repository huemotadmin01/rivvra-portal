// ============================================================================
// InvoiceForm.jsx — Creates a blank draft invoice and redirects to detail page
// Mirrors Odoo behavior: "New" instantly creates a draft record, user edits inline.
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { Loader2 } from 'lucide-react';

export default function InvoiceForm() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const journalId = searchParams.get('journalId');
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);

  // If editing (invoiceId present), redirect straight to detail page
  useEffect(() => {
    if (invoiceId) {
      navigate(orgPath(`/invoicing/invoices/${invoiceId}`), { replace: true });
      return;
    }

    // Create a blank draft invoice and redirect to its detail page
    if (!creating && orgSlug) {
      setCreating(true);
      (async () => {
        try {
          const today = new Date().toISOString().split('T')[0];
          const res = await invoicingApi.createInvoice(orgSlug, {
            type: 'customer_invoice',
            date: today,
            lines: [{ description: '', quantity: 1, unitPrice: 0, taxIds: [] }],
            ...(journalId ? { journalId } : {}),
          });
          const newId = res?.invoice?._id;
          if (newId) {
            navigate(orgPath(`/invoicing/invoices/${newId}`), { replace: true });
          } else {
            showToast('Failed to create invoice', 'error');
            navigate(orgPath('/invoicing/invoices'), { replace: true });
          }
        } catch (err) {
          showToast(err.message || 'Failed to create invoice', 'error');
          navigate(orgPath('/invoicing/invoices'), { replace: true });
        }
      })();
    }
  }, [invoiceId, orgSlug, creating, navigate, orgPath, showToast]);

  return (
    <div className="bg-dark-900 min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 size={32} className="animate-spin text-rivvra-500 mx-auto mb-3" />
        <p className="text-dark-400">Creating invoice...</p>
      </div>
    </div>
  );
}
