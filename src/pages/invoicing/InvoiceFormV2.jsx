// ============================================================================
// InvoiceFormV2.jsx — draft-create shim on ds (phase 14, invoicing)
// ============================================================================
// Copied from InvoiceForm.jsx. Despite the name this is NOT a form: mirroring
// Odoo, "New" immediately creates a blank DRAFT INVOICE and redirects to the
// detail page, and the edit route is a straight redirect. The only thing on
// screen is a spinner.
//
// So the migration is exactly that spinner, and the create-and-redirect effect
// above it is byte-identical — including its `creating` guard, which is what
// stops a re-render creating a second draft.
//
// Not exercised on staging for the obvious reason: loading this route CREATES
// AN INVOICE. Verified by reading the effect, not by visiting it.
// ============================================================================

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
import { Spinner } from '../../components/ds';

export default function InvoiceFormV2() {
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
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', gap: 12 }}>
      <Spinner size={26} />
      <p style={{ font: 'var(--t-body)', color: 'var(--fg-3)' }}>Creating invoice…</p>
    </div>
  );
}
