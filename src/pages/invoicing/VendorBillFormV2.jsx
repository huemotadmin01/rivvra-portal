// ============================================================================
// VendorBillFormV2.jsx — draft-create shim on ds (phase 14, invoicing)
// ============================================================================
// Same shape as InvoiceFormV2: not a form, a create-and-redirect shim whose
// only rendered output is a spinner. The effect (including its `creating`
// guard and the three navigate() fallbacks) is byte-identical.
//
// Not exercised on staging: loading this route CREATES A VENDOR BILL.
// ============================================================================

// ============================================================================
// VendorBillForm.jsx — Creates a blank draft vendor bill and redirects to detail
// ============================================================================

import { useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { createDraftOnce } from '../../utils/createDraftOnce';
import { Spinner } from '../../components/ds';

export default function VendorBillFormV2() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // ?journalId= from the dashboard journal cards' "New" button — mirrors
  // InvoiceForm so the bill lands in the clicked purchase journal.
  const journalId = searchParams.get('journalId');
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  // Per-mount marker (a ref, not state: no re-render, no setState in the effect).
  // Cross-mount duplicates are stopped by createDraftOnce.
  const startedRef = useRef(false);

  useEffect(() => {
    if (billId) {
      navigate(orgPath(`/invoicing/invoices/${billId}`), { replace: true });
      return;
    }

    if (!startedRef.current && orgSlug) {
      startedRef.current = true;
      (async () => {
        try {
          const today = new Date().toISOString().split('T')[0];
          // Module-level de-dup: a remount must not create a second draft.
          const res = await createDraftOnce(`${orgSlug}|vendor_bill|${journalId || ''}`, () => invoicingApi.createInvoice(orgSlug, {
            type: 'vendor_bill',
            date: today,
            lines: [{ description: '', quantity: 1, unitPrice: 0, taxIds: [] }],
            ...(journalId ? { journalId } : {}),
          }));
          const newId = res?.invoice?._id;
          if (newId) {
            navigate(orgPath(`/invoicing/invoices/${newId}`), { replace: true });
          } else {
            showToast('Failed to create bill', 'error');
            navigate(orgPath('/invoicing/bills'), { replace: true });
          }
        } catch (err) {
          showToast(err.message || 'Failed to create bill', 'error');
          navigate(orgPath('/invoicing/bills'), { replace: true });
        }
      })();
    }
  }, [billId, orgSlug, navigate, orgPath, showToast, journalId]);

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', gap: 12 }}>
      <Spinner size={26} />
      <p style={{ font: 'var(--t-body)', color: 'var(--fg-3)' }}>Creating vendor bill…</p>
    </div>
  );
}
