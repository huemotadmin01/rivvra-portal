import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCompany } from '../../../../context/CompanyContext';
import atsApi from '../../../../utils/atsApi';
import { Copy, Archive, RotateCcw, GripVertical, Layers } from 'lucide-react';
import { Button, Chip, Modal } from '../../../ds';
import { DataTable, EmptyState } from '../../../ds';
import { Pencil } from 'lucide-react';
import ConfirmDialog from '../../../shared/ConfirmDialog';
import { ConfigList, ConfigDot, InlineSelect } from '../../../ds';

/* v2 ATS config sections (Slice 4 Wave B) — same API contracts as the
   legacy components/ats/config/* sections, rendered on the config kit.
   Email templates keep the legacy section (its inline expand editor is a
   different archetype; it migrates with the forms slice). */

/* ── Generic picklist (tags / sources / refuse_reasons / degrees /
      employment_types) with copy-from-company ─────────────────────── */
export function PicklistSectionV2({ orgSlug, showToast, entity, entityLabel, icon: Icon }) {
  const apiEntity = entity.replace(/_/g, '-');
  const singular = entityLabel.replace(/s$/, '');
  const { companies = [], currentCompany } = useCompany();
  const siblingCompanies = useMemo(
    () => companies.filter(c => String(c._id) !== String(currentCompany?._id)),
    [companies, currentCompany],
  );

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCopy, setShowCopy] = useState(false);
  const [copyFromId, setCopyFromId] = useState('');
  const [copying, setCopying] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await atsApi.listConfig(orgSlug, apiEntity);
      if (res.success) setItems(res.items || res[entity] || []);
    } catch {
      showToast(`Failed to load ${entityLabel.toLowerCase()}`, 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, apiEntity, currentCompany?._id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const hasUsage = items.some((it) => typeof it.usageCount === 'number');

  const handleCopy = async () => {
    if (!copyFromId) return;
    setCopying(true);
    try {
      const res = await atsApi.copyConfigFrom(orgSlug, apiEntity, copyFromId);
      if (res.success) {
        showToast(res.message || `Copied ${res.copied || 0} ${entityLabel.toLowerCase()}`);
        setShowCopy(false);
        fetchItems();
      } else {
        showToast(res.error || `Failed to copy ${entityLabel.toLowerCase()}`, 'error');
      }
    } catch (err) {
      showToast(err.message || `Failed to copy ${entityLabel.toLowerCase()}`, 'error');
    } finally {
      setCopying(false);
    }
  };

  return (
    <>
      <ConfigList
        icon={Icon ? <Icon size={20} /> : null}
        title={entityLabel}
        sub={`Manage ATS ${entityLabel.toLowerCase()}`}
        noun={singular.toLowerCase()}
        items={items}
        loading={loading}
        columns={[
          {
            key: 'name', header: 'Name',
            render: (it) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <ConfigDot /> <span style={{ color: 'var(--fg)' }}>{it.name}</span>
              </span>
            ),
          },
          ...(hasUsage ? [{
            key: 'usageCount', header: 'Used by', width: 110, muted: true,
            render: (it) => typeof it.usageCount === 'number' ? `${it.usageCount}` : null,
          }] : []),
        ]}
        fields={[{ key: 'name', label: 'Name', required: true, autoFocus: true }]}
        onCreate={async (values) => {
          const res = await atsApi.createConfig(orgSlug, apiEntity, values);
          if (res.success === false) throw new Error(res.error || 'Failed to create');
          fetchItems();
          showToast(`${singular} created`);
        }}
        onUpdate={async (item, values) => {
          const res = await atsApi.updateConfig(orgSlug, apiEntity, item._id, values);
          if (res.success === false) throw new Error(res.error || 'Failed to update');
          fetchItems();
          showToast(`${singular} updated`);
        }}
        onDelete={async (item) => {
          try {
            const res = await atsApi.deleteConfig(orgSlug, apiEntity, item._id);
            if (res.success === false) {
              showToast(res.error || 'Failed to delete', 'error');
              return;
            }
            fetchItems();
            showToast(`${singular} deleted`);
          } catch (err) {
            showToast(err.message || 'Failed to delete', 'error');
          }
        }}
        rowDelete={false}
        deleteConfirm={(item) => ({
          title: `Delete ${singular.toLowerCase()}?`,
          message: typeof item.usageCount === 'number' && item.usageCount > 0
            ? `"${item.name}" is used on ${item.usageCount} application${item.usageCount === 1 ? '' : 's'}. Those keep the value, but it can no longer be selected.`
            : `Delete "${item.name}"? This cannot be undone.`,
        })}
        headerActions={siblingCompanies.length > 0 && (
          <Button variant="secondary" size="sm" iconLeft={<Copy size={13} />} onClick={() => { setCopyFromId(String(siblingCompanies[0]?._id || '')); setShowCopy(true); }}>
            Copy from company
          </Button>
        )}
      />

      <Modal open={showCopy} onClose={() => { if (!copying) setShowCopy(false); }} title={`Copy ${entityLabel.toLowerCase()} from another company`} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ font: '450 12.5px/1.5 var(--font)', color: 'var(--fg-3)' }}>
            Copies {entityLabel.toLowerCase()} that don't already exist here. Existing names are skipped.
          </p>
          <InlineSelect value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)} style={{ width: '100%' }}>
            {siblingCompanies.map((c) => <option key={c._id} value={String(c._id)}>{c.name}</option>)}
          </InlineSelect>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => setShowCopy(false)} disabled={copying}>Cancel</Button>
            <Button size="sm" onClick={handleCopy} disabled={copying || !copyFromId}>{copying ? 'Copying…' : 'Copy'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/* ── Required documents (name + required flag) ───────────────────── */
export function RequiredDocumentsSectionV2({ orgSlug, showToast, icon: Icon }) {
  const ENTITY_PATH = 'required-documents';
  const { currentCompany } = useCompany();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const res = await atsApi.listConfig(orgSlug, ENTITY_PATH);
      if (res.success) setItems(res.items || []);
    } catch {
      showToast('Failed to load required documents', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <ConfigList
      icon={Icon ? <Icon size={20} /> : null}
      title="Required Documents"
      sub="Documents collected before the Documents Collection stage can be passed"
      noun="document"
      items={items}
      loading={loading}
      columns={[
        {
          key: 'name', header: 'Name',
          render: (it) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ConfigDot color={it.required !== false ? 'var(--brand)' : 'var(--fg-faint)'} />
              <span style={{ color: 'var(--fg)' }}>{it.name}</span>
            </span>
          ),
        },
        {
          key: 'required', header: 'Type', width: 110,
          render: (it) => it.required !== false ? <Chip tone="brand">Required</Chip> : <Chip>Optional</Chip>,
        },
      ]}
      fields={[
        { key: 'name', label: 'Name', required: true, autoFocus: true },
        { key: 'required', label: 'Required', type: 'toggle', hint: 'Required documents gate stage moves out of Documents Collection.', defaultValue: true },
      ]}
      onCreate={async (values) => {
        const res = await atsApi.createConfig(orgSlug, ENTITY_PATH, values);
        if (res.success === false) throw new Error(res.error || 'Failed to create');
        fetchItems();
        showToast('Document created');
      }}
      onUpdate={async (item, values) => {
        const res = await atsApi.updateConfig(orgSlug, ENTITY_PATH, item._id, values);
        if (res.success === false) throw new Error(res.error || 'Failed to update');
        fetchItems();
        showToast('Document updated');
      }}
      onDelete={async (item) => {
        try {
          const res = await atsApi.deleteConfig(orgSlug, ENTITY_PATH, item._id);
          if (res.success === false) {
            showToast(res.error || 'Failed to delete', 'error');
            return;
          }
          fetchItems();
          showToast('Document deleted');
        } catch (err) {
          showToast(err.message || 'Failed to delete', 'error');
        }
      }}
      rowDelete={false}
      deleteConfirm={(item) => ({
        title: 'Delete document?',
        message: `Delete "${item.name}"? Applications already past Documents Collection are unaffected.`,
      })}
    />
  );
}

/* ── Attachment kinds — archive/restore, no delete, immutable slug ── */
export function AttachmentKindsSectionV2({ orgSlug, showToast, icon: Icon }) {
  const MIME_PRESETS = [
    { value: '', label: 'Any file type' },
    { value: 'image/*', label: 'Images (PNG, JPG…)' },
    { value: 'application/pdf', label: 'PDF only' },
  ];
  const { currentCompany } = useCompany();
  const [kinds, setKinds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  const fetchKinds = useCallback(async () => {
    try {
      const res = await atsApi.listAttachmentKinds(orgSlug, true);
      if (res.success) setKinds(res.kinds || []);
    } catch {
      showToast('Failed to load attachment kinds', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  useEffect(() => { fetchKinds(); }, [fetchKinds]);

  const toggleArchive = async (kind) => {
    if (togglingId) return;
    setTogglingId(kind._id);
    try {
      const res = await atsApi.updateAttachmentKind(orgSlug, kind._id, { archived: !kind.archived });
      if (res.success) {
        showToast(kind.archived ? 'Attachment kind restored' : 'Attachment kind archived');
        fetchKinds();
      } else {
        showToast(res.error || 'Failed to update', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to update', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <ConfigList
      icon={Icon ? <Icon size={20} /> : null}
      title="Attachment Kinds"
      sub="Upload slots stages can require. Slugs are permanent once created."
      noun="attachment kind"
      modalTitle="attachment kind"
      items={kinds}
      loading={loading}
      searchKeys={['label', 'slug']}
      columns={[
        {
          key: 'label', header: 'Label',
          render: (k) => (
            <span style={{ opacity: k.archived ? 0.5 : 1, minWidth: 0, display: 'block' }}>
              <span style={{ display: 'block', color: 'var(--fg)' }}>
                {k.label}{k.archived ? ' (archived)' : ''}
              </span>
              <span style={{ display: 'block', font: "450 11px/1.4 ui-monospace, monospace", color: 'var(--fg-4)' }}>{k.slug}</span>
            </span>
          ),
        },
        {
          key: 'mime', header: 'Accepted Type', width: 150, muted: true,
          render: (k) => MIME_PRESETS.find((m) => m.value === (k.mime || ''))?.label || k.mime,
        },
        { key: 'maxSizeMb', header: 'Max Size', width: 90, muted: true, render: (k) => k.maxSizeMb ? `${k.maxSizeMb} MB` : null },
      ]}
      fields={[
        { key: 'label', label: 'Label', required: true, autoFocus: true },
        { key: 'mime', label: 'Accepted file type', type: 'select', options: MIME_PRESETS },
        { key: 'maxSizeMb', label: 'Max size (MB, up to 10)', type: 'number', placeholder: '10' },
      ]}
      onCreate={async (values) => {
        const payload = {
          label: values.label,
          mime: values.mime || null,
          maxSizeMb: values.maxSizeMb === '' || values.maxSizeMb == null || Number.isNaN(values.maxSizeMb) ? null : Math.min(10, Number(values.maxSizeMb)),
        };
        const res = await atsApi.createAttachmentKind(orgSlug, payload);
        if (res.success === false) throw new Error(res.error || 'Failed to create');
        fetchKinds();
        showToast('Attachment kind created');
      }}
      onUpdate={async (item, values) => {
        const payload = {
          label: values.label,
          mime: values.mime || null,
          maxSizeMb: values.maxSizeMb === '' || values.maxSizeMb == null || Number.isNaN(values.maxSizeMb) ? null : Math.min(10, Number(values.maxSizeMb)),
        };
        const res = await atsApi.updateAttachmentKind(orgSlug, item._id, payload);
        if (res.success === false) throw new Error(res.error || 'Failed to update');
        fetchKinds();
        showToast('Attachment kind updated');
      }}
      rowActions={(k) => (
        <button
          type="button"
          title={k.archived ? 'Restore' : 'Archive'}
          disabled={togglingId === k._id}
          onClick={() => toggleArchive(k)}
          style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 'var(--r-1)', color: 'var(--fg-4)', opacity: togglingId === k._id ? 0.4 : 1 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)'; e.currentTarget.style.background = 'var(--surface-3)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-4)'; e.currentTarget.style.background = 'transparent'; }}
        >
          {k.archived ? <RotateCcw size={13} /> : <Archive size={13} />}
        </button>
      )}
    />
  );
}

/* ── Skill types / skills / skill levels ─────────────────────────── */
export function SkillTypesSectionV2({ orgSlug, showToast, icon: Icon }) {
  const { currentCompany } = useCompany();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const res = await atsApi.listSkillTypes(orgSlug);
      if (res.success) setItems(res.skillTypes || res.items || []);
    } catch {
      showToast('Failed to load skill types', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <ConfigList
      icon={Icon ? <Icon size={20} /> : null}
      title="Skill Types"
      sub="Categories that group skills"
      noun="skill type"
      modalTitle="skill type"
      items={items}
      loading={loading}
      columns={[
        {
          key: 'name', header: 'Name',
          render: (it) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ConfigDot /><span style={{ color: 'var(--fg)' }}>{it.name}</span></span>,
        },
        { key: 'usageCount', header: 'Skills', width: 90, muted: true, render: (it) => typeof it.usageCount === 'number' ? `${it.usageCount}` : null },
      ]}
      fields={[{ key: 'name', label: 'Name', required: true, autoFocus: true }]}
      onCreate={async (values) => {
        const res = await atsApi.createSkillType(orgSlug, values);
        if (res.success === false) throw new Error(res.error || 'Failed to create');
        fetchItems();
        showToast('Skill type created');
      }}
      onUpdate={async (item, values) => {
        const res = await atsApi.updateSkillType(orgSlug, item._id, values);
        if (res.success === false) throw new Error(res.error || 'Failed to update');
        fetchItems();
        showToast('Skill type updated');
      }}
      onDelete={async (item) => {
        try {
          const res = await atsApi.deleteSkillType(orgSlug, item._id);
          if (res.success === false) {
            showToast(res.error || 'Failed to delete', 'error');
            return;
          }
          fetchItems();
          showToast('Skill type deleted');
        } catch (err) {
          showToast(err.message || 'Failed to delete', 'error');
        }
      }}
      rowDelete={false}
      deleteConfirm={(item) => ({
        title: 'Delete skill type?',
        message: `Delete "${item.name}"? Skills in this category lose their type but are kept.`,
      })}
    />
  );
}

export function SkillsSectionV2({ orgSlug, showToast, icon: Icon }) {
  const { currentCompany } = useCompany();
  const [items, setItems] = useState([]);
  const [skillTypes, setSkillTypes] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const [skillsRes, typesRes] = await Promise.all([
        atsApi.listSkills(orgSlug, filterType ? { skillTypeId: filterType } : {}),
        atsApi.listSkillTypes(orgSlug),
      ]);
      if (skillsRes.success) setItems(skillsRes.skills || skillsRes.items || []);
      if (typesRes.success) setSkillTypes(typesRes.skillTypes || typesRes.items || []);
    } catch {
      showToast('Failed to load skills', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, filterType, currentCompany?._id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const typeMap = useMemo(() => new Map(skillTypes.map((t) => [String(t._id), t.name])), [skillTypes]);

  return (
    <ConfigList
      icon={Icon ? <Icon size={20} /> : null}
      title="Skills"
      sub="The skill picklist candidates are tagged with"
      noun="skill"
      items={items}
      loading={loading}
      columns={[
        {
          key: 'name', header: 'Name',
          render: (it) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ConfigDot /><span style={{ color: 'var(--fg)' }}>{it.name}</span></span>,
        },
        {
          key: 'type', header: 'Type', width: 150,
          render: (it) => {
            const name = it.skillTypeName || typeMap.get(String(it.skillTypeId));
            return name ? <Chip>{name}</Chip> : null;
          },
        },
        { key: 'usageCount', header: 'Used by', width: 90, muted: true, render: (it) => typeof it.usageCount === 'number' ? `${it.usageCount}` : null },
      ]}
      fields={[
        { key: 'name', label: 'Name', required: true, autoFocus: true },
        { key: 'skillTypeId', label: 'Skill Type', type: 'select', required: true, options: skillTypes.map((t) => ({ value: String(t._id), label: t.name })), placeholder: 'Select a type…' },
      ]}
      toolbar={skillTypes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <InlineSelect value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All types</option>
            {skillTypes.map((t) => <option key={t._id} value={String(t._id)}>{t.name}</option>)}
          </InlineSelect>
        </div>
      )}
      onCreate={async (values) => {
        const res = await atsApi.createSkill(orgSlug, values);
        if (res.success === false) throw new Error(res.error || 'Failed to create');
        fetchItems();
        showToast(res.existed ? `"${values.name}" already exists — using existing` : 'Skill created');
      }}
      onUpdate={async (item, values) => {
        const res = await atsApi.updateSkill(orgSlug, item._id, values);
        if (res.success === false) throw new Error(res.error || 'Failed to update');
        fetchItems();
        showToast('Skill updated');
      }}
      onDelete={async (item) => {
        try {
          const res = await atsApi.deleteSkill(orgSlug, item._id);
          if (res.success === false) {
            showToast(res.error || 'Failed to delete', 'error');
            return;
          }
          fetchItems();
          showToast('Skill deleted');
        } catch (err) {
          showToast(err.message || 'Failed to delete', 'error');
        }
      }}
      rowDelete={false}
      deleteConfirm={(item) => ({
        title: 'Delete skill?',
        message: typeof item.usageCount === 'number' && item.usageCount > 0
          ? `"${item.name}" is on ${item.usageCount} candidate${item.usageCount === 1 ? '' : 's'} — deleting removes it from them.`
          : `Delete "${item.name}"? This cannot be undone.`,
      })}
    />
  );
}

export function SkillLevelsSectionV2({ orgSlug, showToast, icon: Icon }) {
  const { currentCompany } = useCompany();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const res = await atsApi.listSkillLevels(orgSlug);
      if (res.success) setItems(((res.skillLevels || res.items || [])).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
    } catch {
      showToast('Failed to load skill levels', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <ConfigList
      icon={Icon ? <Icon size={20} /> : null}
      title="Skill Levels"
      sub="Proficiency scale — higher sequence means more proficient"
      noun="skill level"
      modalTitle="skill level"
      items={items}
      loading={loading}
      columns={[
        { key: 'sequence', header: '#', width: 50, muted: true },
        {
          key: 'name', header: 'Name',
          render: (it) => <span style={{ color: 'var(--fg)' }}>{it.name}</span>,
        },
        { key: 'usageCount', header: 'Used by', width: 90, muted: true, render: (it) => typeof it.usageCount === 'number' ? `${it.usageCount}` : null },
      ]}
      fields={[
        { key: 'name', label: 'Name', required: true, autoFocus: true },
        { key: 'sequence', label: 'Sequence (higher = more proficient)', type: 'number', defaultValue: 1 },
      ]}
      onCreate={async (values) => {
        const res = await atsApi.createSkillLevel(orgSlug, values);
        if (res.success === false) throw new Error(res.error || 'Failed to create');
        fetchItems();
        showToast('Skill level created');
      }}
      onUpdate={async (item, values) => {
        const res = await atsApi.updateSkillLevel(orgSlug, item._id, values);
        if (res.success === false) throw new Error(res.error || 'Failed to update');
        fetchItems();
        showToast('Skill level updated');
      }}
      onDelete={async (item) => {
        try {
          const res = await atsApi.deleteSkillLevel(orgSlug, item._id);
          if (res.success === false) {
            showToast(res.error || 'Failed to delete', 'error');
            return;
          }
          fetchItems();
          showToast('Skill level deleted');
        } catch (err) {
          showToast(err.message || 'Failed to delete', 'error');
        }
      }}
      rowDelete={false}
      deleteConfirm={(item) => ({
        title: 'Delete skill level?',
        message: `Delete "${item.name}"? Candidate skills keep the skill but lose this level.`,
      })}
    />
  );
}

/* ── Stages — the only drag-reorder list (native HTML5 DnD, optimistic
      with rollback, same as legacy). Custom rows via DataTable children. ── */
export function StagesSectionV2({ orgSlug, showToast, icon: Icon }) {
  const { currentCompany } = useCompany();
  const [stages, setStages] = useState([]);
  const [kinds, setKinds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', sequence: 0, foldInKanban: false, isHiredStage: false, requiredAttachments: [] });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [stagesRes, kindsRes] = await Promise.all([
        atsApi.listStages(orgSlug),
        atsApi.listAttachmentKinds(orgSlug, true),
      ]);
      if (stagesRes.success) setStages([...(stagesRes.stages || [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
      if (kindsRes.success) setKinds(kindsRes.kinds || []);
    } catch {
      showToast('Failed to load stages', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const activeKinds = useMemo(() => kinds.filter((k) => !k.archived), [kinds]);
  const kindById = useMemo(() => new Map(kinds.map((k) => [String(k._id), k])), [kinds]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', sequence: (stages[stages.length - 1]?.sequence ?? stages.length) + 1, foldInKanban: false, isHiredStage: false, requiredAttachments: [] });
    setModalOpen(true);
  };
  const openEdit = (stage) => {
    setEditing(stage);
    setForm({
      name: stage.name || '',
      sequence: stage.sequence ?? 0,
      foldInKanban: !!stage.foldInKanban,
      isHiredStage: !!stage.isHiredStage,
      requiredAttachments: Array.isArray(stage.requiredAttachments) ? stage.requiredAttachments.map(String) : [],
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sequence: Number(form.sequence) || 0,
        foldInKanban: form.foldInKanban,
        isHiredStage: form.isHiredStage,
        requiredAttachments: form.requiredAttachments,
      };
      const res = editing
        ? await atsApi.updateStage(orgSlug, editing._id, payload)
        : await atsApi.createStage(orgSlug, payload);
      if (res.success) {
        showToast(editing ? 'Stage updated' : 'Stage created');
        setModalOpen(false);
        setEditing(null);
        fetchAll();
      } else {
        showToast(res.error || 'Failed to save stage', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to save stage', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (stage) => {
    setDeleting(true);
    try {
      const res = await atsApi.deleteStage(orgSlug, stage._id);
      if (res.success) {
        showToast('Stage deleted');
        setConfirmDelete(null);
        setModalOpen(false);
        setEditing(null);
        fetchAll();
      } else {
        showToast(res.error || 'Failed to delete stage', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete stage', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Optimistic reorder with rollback — same semantics as legacy.
  const handleDrop = async (targetIndex) => {
    const fromIndex = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (fromIndex == null || fromIndex === targetIndex) return;
    const prev = stages;
    const next = [...stages];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(targetIndex, 0, moved);
    const resequenced = next.map((s, i) => ({ ...s, sequence: i + 1 }));
    setStages(resequenced);
    setReordering(true);
    try {
      const res = await atsApi.reorderStages(orgSlug, resequenced.map((s) => ({ _id: s._id, sequence: s.sequence })));
      if (res.success) {
        if (Array.isArray(res.stages)) setStages([...res.stages].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
        showToast('Stages reordered');
      } else {
        setStages(prev);
        showToast(res.error || 'Failed to reorder stages', 'error');
      }
    } catch (err) {
      setStages(prev);
      showToast(err.message || 'Failed to reorder stages', 'error');
    } finally {
      setReordering(false);
    }
  };

  const columns = [
    { key: 'seq', header: '#', width: 70 },
    { key: 'name', header: 'Name' },
    { key: 'uploads', header: 'Required Uploads', width: 220 },
    { key: 'fold', header: 'Fold in Kanban', width: 120, align: 'center' },
    { key: 'hired', header: 'Hired Stage', width: 100, align: 'center' },
    { key: '__act', header: '', width: 60, align: 'right' },
  ];
  const td = (extra = {}) => ({
    padding: '11px 14px', font: '450 13.5px/1.45 var(--font)', color: 'var(--fg-2)',
    borderBottom: '1px solid var(--line)', verticalAlign: 'middle', ...extra,
  });

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {Icon ? <Icon size={20} style={{ color: 'var(--fg-4)' }} /> : <Layers size={20} style={{ color: 'var(--fg-4)' }} />}
          <div>
            <h1 style={{ font: '650 18px/1.2 var(--font)', color: 'var(--fg)', letterSpacing: '-0.012em' }}>Pipeline Stages</h1>
            <p style={{ font: '450 12.5px/1.4 var(--font)', color: 'var(--fg-4)', marginTop: 3 }}>
              Drag to reorder{reordering ? ' — saving…' : ''}. The server blocks deleting a stage that still holds applications.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate}>New Stage</Button>
      </div>

      <DataTable
        columns={columns}
        rows={[]}
        loading={loading}
        resizable={false}
        empty={<EmptyState icon={<Layers size={22} />} title="No stages yet" compact />}
      >
        {!loading && stages.length ? stages.map((stage, i) => (
          <tr
            key={stage._id}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
            onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
            onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
            onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
            onClick={() => openEdit(stage)}
            style={{
              cursor: 'pointer',
              background: overIndex === i && dragIndex !== null && dragIndex !== i ? 'var(--brand-soft)' : 'transparent',
              opacity: dragIndex === i ? 0.5 : 1,
              transition: 'background 110ms var(--e-out)',
            }}
            onMouseEnter={(e) => { if (dragIndex === null) e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={(e) => { if (dragIndex === null) e.currentTarget.style.background = 'transparent'; }}
          >
            <td style={td()}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--fg-4)' }}>
                <GripVertical size={13} style={{ cursor: 'grab' }} /> {stage.sequence ?? i + 1}
              </span>
            </td>
            <td style={td({ color: 'var(--fg)', fontWeight: 550 })}>{stage.name}</td>
            <td style={td()}>
              <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                {(stage.requiredAttachments || []).map((id) => (
                  <Chip key={String(id)}>{kindById.get(String(id))?.label || 'Unknown'}</Chip>
                ))}
              </span>
            </td>
            <td style={td({ textAlign: 'center' })}>{stage.foldInKanban ? <Chip tone="info">Folded</Chip> : null}</td>
            <td style={td({ textAlign: 'center' })}>{stage.isHiredStage ? <Chip tone="brand">Hired</Chip> : null}</td>
            <td style={td({ textAlign: 'right' })} onClick={(e) => e.stopPropagation()}>
              <button type="button" title="Edit" onClick={() => openEdit(stage)}
                style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 'var(--r-1)', color: 'var(--fg-4)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)'; e.currentTarget.style.background = 'var(--surface-3)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-4)'; e.currentTarget.style.background = 'transparent'; }}>
                <Pencil size={13} />
              </button>
            </td>
          </tr>
        )) : null}
      </DataTable>

      <Modal open={modalOpen} onClose={() => { if (!saving) { setModalOpen(false); setEditing(null); } }} title={editing ? 'Edit stage' : 'New stage'} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ font: "550 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>Name *</span>
            <input
              value={form.name}
              autoFocus
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              style={{ height: 38, padding: '0 12px', border: 'none', outline: 'none', borderRadius: 'var(--r-2)', background: 'var(--surface-2)', color: 'var(--fg)', boxShadow: 'inset 0 0 0 1px var(--line)', font: "450 13.5px/1 'Inter', system-ui, sans-serif" }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ font: "550 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>Sequence</span>
            <input
              type="number"
              value={form.sequence}
              onChange={(e) => setForm((f) => ({ ...f, sequence: e.target.value }))}
              style={{ height: 38, padding: '0 12px', border: 'none', outline: 'none', borderRadius: 'var(--r-2)', background: 'var(--surface-2)', color: 'var(--fg)', boxShadow: 'inset 0 0 0 1px var(--line)', font: "450 13.5px/1 'Inter', system-ui, sans-serif" }}
            />
          </label>
          {[['foldInKanban', 'Fold in Kanban', 'Collapse this stage column by default on the Pipeline board.'], ['isHiredStage', 'Hired stage', 'Applications reaching this stage count as hires.']].map(([key, label, hint]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))} style={{ marginTop: 3 }} />
              <span>
                <span style={{ display: 'block', font: "550 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{label}</span>
                <span style={{ display: 'block', font: '450 11.5px/1.4 var(--font)', color: 'var(--fg-4)' }}>{hint}</span>
              </span>
            </label>
          ))}
          <div>
            <span style={{ display: 'block', font: "550 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 6 }}>Required uploads</span>
            <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: 6, borderRadius: 'var(--r-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
              {activeKinds.map((k) => {
                const kid = String(k._id);
                const on = form.requiredAttachments.includes(kid);
                return (
                  <button key={kid} type="button"
                    onClick={() => setForm((f) => ({ ...f, requiredAttachments: on ? f.requiredAttachments.filter((s) => s !== kid) : [...f.requiredAttachments, kid] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--r-1)', textAlign: 'left', font: "450 12.5px/1.3 'Inter', system-ui, sans-serif", color: on ? 'var(--fg)' : 'var(--fg-3)', background: on ? 'var(--surface-3)' : 'transparent' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, display: 'grid', placeItems: 'center', background: on ? 'var(--brand)' : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 1.5px var(--line-strong, rgba(255,255,255,.18))' }}>
                      {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--brand-fg, #041209)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                    </span>
                    {k.label}
                  </button>
                );
              })}
              {activeKinds.length === 0 && <p style={{ padding: '6px 8px', font: '450 12px/1.4 var(--font)', color: 'var(--fg-4)' }}>No attachment kinds — create them on the Attachment Kinds tab.</p>}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => { setModalOpen(false); setEditing(null); }} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : editing ? 'Save' : 'Create'}</Button>
          </div>
          {editing && (
            <div style={{ paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <Button variant="ghost" size="sm" block style={{ color: 'var(--danger)' }} disabled={saving} onClick={() => setConfirmDelete(editing)}>
                Delete this stage
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete stage?"
        message={confirmDelete ? `Delete "${confirmDelete.name}"? If any applications sit in this stage, the server will refuse the deletion until they're moved.` : ''}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onCancel={() => { if (!deleting) setConfirmDelete(null); }}
        onConfirm={async () => { if (confirmDelete) await handleDelete(confirmDelete); }}
      />
    </div>
  );
}
