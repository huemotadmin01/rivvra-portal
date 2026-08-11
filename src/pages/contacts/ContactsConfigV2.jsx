import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import { Tag, AlertCircle } from 'lucide-react';
import { EmptyState } from '../../components/ds';
import { ConfigListV2 } from '../../components/platform/v2/configkit';

/* v2 Contacts configuration (Slice 4) — same tag CRUD as
   ContactsConfig.jsx on the config kit. Admin-gated; row delete stays
   hidden (delete lives in the edit modal, legacy parity). */
export default function ContactsConfigV2() {
  const { orgSlug, getAppRole } = useOrg();
  const { showToast } = useToast();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = getAppRole('contacts') === 'admin';

  const fetchTags = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await contactsApi.listTags(orgSlug);
      if (res.success) setTags(res.tags || []);
    } catch {
      showToast('Failed to load tags', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, isAdmin, showToast]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  if (!isAdmin) {
    return <EmptyState icon={<AlertCircle size={22} />} tone="danger" title="Admin access required" compact />;
  }

  return (
    <ConfigListV2
      icon={<Tag size={20} />}
      title="Contact Tags"
      sub="Labels for organizing and filtering contacts"
      noun="tag"
      items={tags}
      loading={loading}
      rowDelete={false}
      fields={[{ key: 'name', label: 'Tag Name', required: true, placeholder: 'e.g. Key account', autoFocus: true }]}
      onCreate={async (values) => {
        const res = await contactsApi.createTag(orgSlug, values);
        if (res.success === false) throw new Error(res.error || 'Failed to create tag');
        fetchTags();
        showToast('Tag created', 'success');
      }}
      onUpdate={async (item, values) => {
        const res = await contactsApi.updateTag(orgSlug, item._id, values);
        if (res.success === false) throw new Error(res.error || 'Failed to update tag');
        fetchTags();
        showToast('Tag updated', 'success');
      }}
      onDelete={async (item) => {
        try {
          const res = await contactsApi.deleteTag(orgSlug, item._id);
          if (res.success === false) {
            showToast(res.error || 'Failed to delete tag', 'error');
            return;
          }
          fetchTags();
          showToast('Tag deleted', 'success');
        } catch (err) {
          showToast(err.message || 'Failed to delete tag', 'error');
        }
      }}
      deleteConfirm={(item) => ({
        title: 'Delete tag?',
        message: `Delete "${item.name}"? Contacts currently carrying this tag keep it, but it can no longer be applied to others.`,
      })}
    />
  );
}
