import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { Tag } from 'lucide-react';
import { ConfigListV2 } from '../../components/platform/v2/configkit';

// Same fixed named-color palette as legacy — the API stores the color NAME,
// not a hex, so the picker stays a swatch list.
const COLOR_OPTIONS = [
  { value: 'purple', swatch: '#a855f7' },
  { value: 'blue', swatch: '#3b82f6' },
  { value: 'amber', swatch: '#f59e0b' },
  { value: 'emerald', swatch: '#10b981' },
  { value: 'red', swatch: '#ef4444' },
  { value: 'cyan', swatch: '#06b6d4' },
  { value: 'orange', swatch: '#f97316' },
  { value: 'pink', swatch: '#ec4899' },
];
const swatchFor = (name) => COLOR_OPTIONS.find((c) => c.value === name)?.swatch || '#3b82f6';

/* v2 CRM Tags (Slice 4) — same CRUD + named-color palette as
   CrmConfigTags.jsx on the config kit. */
export default function CrmConfigTagsV2() {
  const { orgSlug } = useOrg();
  const { addToast } = useToast();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    try {
      const res = await crmApi.listTags(orgSlug);
      if (res.success) setTags(res.tags || []);
    } catch {
      addToast('Failed to load tags', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, addToast]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  return (
    <ConfigListV2
      icon={<Tag size={20} />}
      title="Tags"
      sub="Manage opportunity tags"
      noun="tag"
      items={tags}
      loading={loading}
      columns={[
        {
          key: 'name', header: 'Name',
          render: (t) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: swatchFor(t.color), flexShrink: 0 }} />
              <span style={{ color: 'var(--fg)' }}>{t.name}</span>
            </span>
          ),
        },
        {
          key: 'color', header: 'Color', width: 130, muted: true,
          render: (t) => (t.color || 'blue').charAt(0).toUpperCase() + (t.color || 'blue').slice(1),
        },
      ]}
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: 'e.g. High priority', autoFocus: true },
        { key: 'color', label: 'Color', type: 'colorSwatch', options: COLOR_OPTIONS, defaultValue: 'blue' },
      ]}
      onCreate={async (values) => {
        await crmApi.createTag(orgSlug, values);
        fetchTags();
        addToast('Tag created', 'success');
      }}
      onUpdate={async (item, values) => {
        await crmApi.updateTag(orgSlug, item._id, values);
        fetchTags();
        addToast('Tag updated', 'success');
      }}
      onDelete={async (item) => {
        try {
          await crmApi.deleteTag(orgSlug, item._id);
          fetchTags();
          addToast('Tag deleted', 'success');
        } catch (err) {
          addToast(err.message || 'Failed to delete', 'error');
        }
      }}
      deleteConfirm={(item) => ({
        title: 'Delete tag?',
        message: `Delete "${item.name}"? Opportunities currently tagged with it keep the tag reference, but it can no longer be applied.`,
      })}
    />
  );
}
