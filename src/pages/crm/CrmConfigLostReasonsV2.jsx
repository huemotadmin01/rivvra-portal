import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { AlertTriangle } from 'lucide-react';
import { ConfigListV2 } from '../../components/platform/v2/configkit';

/* v2 CRM Lost Reasons (Slice 4) — same CRUD as CrmConfigLostReasons.jsx on
   the config kit. Delete-confirm copy corrected: the server BLOCKS deletion
   while opportunities use the reason (the legacy dialog promised the
   opposite). */
export default function CrmConfigLostReasonsV2() {
  const { orgSlug } = useOrg();
  const { addToast } = useToast();
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReasons = useCallback(async () => {
    try {
      const res = await crmApi.listLostReasons(orgSlug);
      if (res.success) setReasons(res.reasons || []);
    } catch {
      addToast('Failed to load lost reasons', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, addToast]);

  useEffect(() => { fetchReasons(); }, [fetchReasons]);

  return (
    <ConfigListV2
      icon={<AlertTriangle size={20} />}
      title="Lost Reasons"
      sub="Manage reasons for lost opportunities"
      noun="lost reason"
      modalTitle="lost reason"
      items={reasons}
      loading={loading}
      fields={[{ key: 'name', label: 'Description', required: true, placeholder: 'e.g. Too expensive, Chose competitor…', autoFocus: true }]}
      onCreate={async (values) => {
        await crmApi.createLostReason(orgSlug, values);
        fetchReasons();
        addToast('Lost reason created', 'success');
      }}
      onUpdate={async (item, values) => {
        await crmApi.updateLostReason(orgSlug, item._id, values);
        fetchReasons();
        addToast('Lost reason updated', 'success');
      }}
      onDelete={async (item) => {
        try {
          await crmApi.deleteLostReason(orgSlug, item._id);
          fetchReasons();
          addToast('Lost reason deleted', 'success');
        } catch (err) {
          addToast(err.message || 'Failed to delete', 'error');
        }
      }}
      deleteConfirm={(item) => ({
        title: 'Delete lost reason?',
        message: `Delete "${item.name}"? If any opportunities are marked Lost with this reason, the server will refuse the deletion until they're reassigned.`,
      })}
    />
  );
}
