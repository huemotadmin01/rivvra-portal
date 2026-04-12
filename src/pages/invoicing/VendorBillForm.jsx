// ============================================================================
// VendorBillForm.jsx — Creates a blank draft vendor bill and redirects to detail
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { Loader2 } from 'lucide-react';

export default function VendorBillForm() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (billId) {
      navigate(orgPath(`/invoicing/invoices/${billId}`), { replace: true });
      return;
    }

    if (!creating && orgSlug) {
      setCreating(true);
      (async () => {
        try {
          const today = new Date().toISOString().split('T')[0];
          const res = await invoicingApi.createInvoice(orgSlug, {
            type: 'vendor_bill',
            date: today,
            lines: [{ description: '', quantity: 1, unitPrice: 0, taxIds: [] }],
          });
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
  }, [billId, orgSlug, creating, navigate, orgPath, showToast]);

  return (
    <div className="bg-dark-900 min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 size={32} className="animate-spin text-rivvra-500 mx-auto mb-3" />
        <p className="text-dark-400">Creating vendor bill...</p>
      </div>
    </div>
  );
}
