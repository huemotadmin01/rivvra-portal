// ============================================================================
// SignTemplatesV2.jsx — Sign template library, on ds (phase 10)
// ============================================================================
// Copied verbatim from SignTemplates.jsx, then edited leaf-first. Every data
// path is untouched: the signAdmin gate on upload/duplicate/delete, the
// ?upload=1 deep link from the Sign dashboard, server-side pagination with
// the page-clamp guard, the client-side search over the current page, and the
// file-type validation (PDFs and images in, Word docs rejected with their own
// message). This page has NO send path — Send navigates to /sign/requests.
//
// Presentation moves to ds: PageHeader + SearchInput + DataTable + Pagination
// for the list, Modal/Field/Input/Button for both dialogs, and the new
// ds/FileDrop for the upload zone (the local dragActive state and hidden
// input move into it; validation stays here, because its copy is domain copy).
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import signApi from '../../utils/signApi';
import {
  Plus, Upload, FileText, LayoutTemplate,
  Copy, Trash2, Edit2,
  CloudUpload, File, Send, Check, Pencil,
} from 'lucide-react';
import TagPicker from '../../components/sign/TagPicker';
import {
  Button, Chip, DataTable, EmptyState, Field, FileDrop, Input, Modal,
  PageHeader, Pagination, SearchInput, Spinner,
} from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

/** Icon-only row action. Ghost Button, square, with the label on hover and
 *  an accessible name (a title alone is not one). */
function IconAction({ title, tone, children, ...rest }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={title}
      aria-label={title}
      style={{ padding: '0 7px', color: tone === 'danger' ? 'var(--danger)' : 'var(--fg-3)' }}
      {...rest}
    >
      {children}
    </Button>
  );
}

/* ── Edit Template Details Modal ──────────────────────────────────────── */
// Quick rename + retag for an existing template without opening the
// full editor. Driven by the row-level "Edit details" button.
function EditTemplateDetailsModal({ template, onClose, onSaved, orgSlug, showToast }) {
  const [name, setName] = useState('');
  const [tagIds, setTagIds] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!template) return;
    setName(template.name || '');
    const raw = Array.isArray(template.tags) ? template.tags : [];
    setTagIds(raw.map((t) => (typeof t === 'string' ? t : t?._id)).filter(Boolean));
  }, [template]);

  if (!template) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('Template name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await signApi.updateTemplate(orgSlug, template._id, {
        name: name.trim(),
        tags: tagIds,
      });
      if (res.success !== false) {
        showToast('Template updated');
        onSaved();
      } else {
        showToast(res.message || 'Failed to update template', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to update template', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      size="md"
      title="Edit template details"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            iconLeft={saving ? <Spinner size={14} /> : <Check size={14} />}
          >
            Save
          </Button>
        </>
      }
    >
      {/* Modal's body scrolls on its own, which is what the legacy card's
          max-h + overflow existed to achieve: a big org tag list used to blow
          the card past the viewport and clip the Save button. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Template Name" required htmlFor="tpl-name">
          <Input
            id="tpl-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Tags">
          <TagPicker
            orgSlug={orgSlug}
            value={tagIds}
            onChange={setTagIds}
            onError={showToast}
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ── Upload Template Modal ────────────────────────────────────────────── */
function UploadTemplateModal({ show, onClose, onSaved, orgSlug }) {
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);

  const createTagInline = async () => {
    const name = newTagName.trim();
    if (!name || creatingTag) return;
    setCreatingTag(true);
    try {
      const res = await signApi.createTag(orgSlug, { name });
      const created = res.data || res.tag || res.item;
      if (res.success && created?._id) {
        setAvailableTags((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedTags((prev) => [...prev, created._id]);
        setNewTagName('');
      } else {
        showToast(res.error || 'Failed to create tag', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to create tag', 'error');
    } finally {
      setCreatingTag(false);
    }
  };

  useEffect(() => {
    if (show && orgSlug) {
      setName('');
      setFile(null);
      setSelectedTags([]);
      setLoadingTags(true);
      signApi.listTags(orgSlug)
        .then((res) => {
          setAvailableTags(res.tags || res.items || []);
        })
        .catch(() => {
          setAvailableTags([]);
        })
        .finally(() => setLoadingTags(false));
    }
  }, [show, orgSlug]);

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    const type = (selectedFile.type || '').toLowerCase();
    const lname = (selectedFile.name || '').toLowerCase();
    const isPdf = type === 'application/pdf' || lname.endsWith('.pdf');
    const isImg = type === 'image/png' || type === 'image/jpeg' ||
      lname.endsWith('.png') || lname.endsWith('.jpg') || lname.endsWith('.jpeg');
    const isDoc = type === 'application/msword' ||
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lname.endsWith('.doc') || lname.endsWith('.docx');

    if (isDoc) {
      showToast('Word docs aren\'t supported yet — save as PDF first.', 'error');
      return;
    }
    if (!isPdf && !isImg) {
      showToast('Upload a PDF, PNG, or JPG.', 'error');
      return;
    }

    setFile(selectedFile);
    if (!name.trim()) {
      // Tidy the filename into a presentable template name: drop the
      // extension, strip trailing "(N)" duplicate suffix, replace
      // underscores with spaces, and collapse runs of whitespace.
      const fileName = selectedFile.name
        .replace(/\.(pdf|png|jpe?g)$/i, '')
        .replace(/\s*\(\d+\)\s*$/, '')
        .replace(/_+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      setName(fileName);
    }
  };

  // Drag handling and the hidden input now live in ds/FileDrop.

  const toggleTag = (tagId) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      showToast('Please select a PDF file', 'error');
      return;
    }
    if (!name.trim()) {
      showToast('Please enter a template name', 'error');
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('name', name.trim());
      formData.append('tags', JSON.stringify(selectedTags));

      const res = await signApi.createTemplate(orgSlug, formData);
      if (res.success !== false) {
        showToast('Template uploaded successfully');
        onSaved();
        onClose();
      } else {
        showToast(res.message || res.error || 'Failed to upload template', 'error');
      }
    } catch (err) {
      // Surface the server's error so a 500 doesn't leave the modal open
      // with no feedback. `finally` re-enables the submit button.
      showToast(err?.message || err?.error || 'Failed to upload template', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <Modal
      open={show}
      onClose={saving ? undefined : onClose}
      size="md"
      title="Upload Template"
    >
      <form id="upload-template-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="PDF File" required>
          <FileDrop
            onSelect={handleFileSelect}
            filled={!!file}
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            aria-label="Choose a PDF, PNG or JPG to upload"
          >
            {file ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <File size={30} style={{ color: 'var(--brand)' }} />
                <p style={{ font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)' }}>{file.name}</p>
                <p style={{ font: `450 11.5px/1 ${FONT}`, color: 'var(--fg-3)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ color: 'var(--danger)' }}
                  onClick={(e) => {
                    e.stopPropagation();   // don't reopen the browse dialog
                    setFile(null);
                  }}
                >
                  Remove file
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <CloudUpload size={30} style={{ color: 'var(--fg-4)' }} />
                <p style={{ font: `550 13px/1.4 ${FONT}`, color: 'var(--fg-2)' }}>
                  Drop your file here or click to browse
                </p>
                <p style={{ font: `450 11.5px/1 ${FONT}`, color: 'var(--fg-3)' }}>
                  PDF, PNG, or JPG (Word docs &mdash; save as PDF first)
                </p>
              </div>
            )}
          </FileDrop>
        </Field>

        <Field label="Template Name" required htmlFor="upload-tpl-name">
          <Input
            id="upload-tpl-name"
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. NDA Agreement"
          />
        </Field>

        <Field label="Tags">
          {loadingTags ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <Spinner size={14} />
              <span style={{ font: `450 12px/1 ${FONT}`, color: 'var(--fg-3)' }}>Loading tags…</span>
            </div>
          ) : (
            <>
              {availableTags.length > 0 && (
                // Cap the tag cloud — 30+ org tags pushed the submit button
                // far below the fold (same fix as TagPicker).
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8,
                  maxHeight: 176, overflowY: 'auto', paddingRight: 4,
                }}>
                  {availableTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag._id);
                    return (
                      <Button
                        key={tag._id}
                        size="sm"
                        variant={isSelected ? 'secondary' : 'ghost'}
                        onClick={() => toggleTag(tag._id)}
                        aria-pressed={isSelected}
                        iconLeft={isSelected ? <Check size={12} /> : undefined}
                        style={isSelected ? {
                          background: 'var(--brand-soft)',
                          color: 'var(--brand-ink)',
                          boxShadow: 'inset 0 0 0 1px var(--brand-line)',
                        } : { boxShadow: 'inset 0 0 0 1px var(--line)' }}
                      >
                        {tag.name}
                      </Button>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      createTagInline();
                    }
                  }}
                  placeholder={availableTags.length === 0 ? 'Create your first tag…' : 'Add a new tag'}
                  aria-label="New tag name"
                  style={{ flex: 1 }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={createTagInline}
                  disabled={!newTagName.trim() || creatingTag}
                  iconLeft={creatingTag ? <Spinner size={12} /> : <Plus size={12} />}
                >
                  Add
                </Button>
              </div>
            </>
          )}
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            disabled={saving || !file}
            style={{ flex: 1, justifyContent: 'center' }}
            iconLeft={saving ? <Spinner size={14} /> : undefined}
          >
            Upload Template
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Main SignTemplates Component ──────────────────────────────────────── */
export default function SignTemplatesV2() {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const orgSlug = currentOrg?.slug;
  // Same app-role gate SignConfig uses — template upload/duplicate/delete
  // are signAdmin-only endpoints, so hide the buttons from members instead
  // of letting the click 403.
  const isAdmin = getAppRole('sign') === 'admin';

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [search, setSearch] = useState('');
  const [duplicating, setDuplicating] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [editingTpl, setEditingTpl] = useState(null);

  // 2026-05-23 Sign health-check: surface server-side pagination so a
  // growing template library doesn't silently truncate at the API
  // default. Page size matches the API's default (100); search remains
  // client-side over the current page — fine while page=1 is the only
  // page in practice, and the search box doesn't lie about a "no match"
  // that actually lives on page 2 because the totalPages counter is
  // visible to the user.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const TEMPLATES_PAGE_LIMIT = 100;

  // Check if ?upload=1 in URL (Dashboard's "Upload Template" button) —
  // mirrors the ?create/?quicksend param pattern in SignRequests.jsx.
  useEffect(() => {
    if (searchParams.get('upload') === '1') {
      if (isAdmin) setShowUploadModal(true);
      searchParams.delete('upload');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isAdmin]);

  const fetchTemplates = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    setTemplates([]);
    try {
      const res = await signApi.listTemplates(orgSlug, { page, limit: TEMPLATES_PAGE_LIMIT });
      if (res.success !== false) {
        setTemplates(res.templates || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || res.pages || 1);
      } else {
        showToast('Failed to load templates', 'error');
      }
    } catch {
      showToast('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, page, showToast, currentCompany?._id]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Page-clamp guard mirroring SignRequests / AtsApplications — if a
  // delete or company switch shrinks the total below the current page
  // index, snap back to the last real page instead of showing an empty
  // table.
  useEffect(() => {
    if (!loading && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [loading, totalPages, page]);

  const handleDuplicate = async (templateId) => {
    try {
      setDuplicating(templateId);
      const res = await signApi.duplicateTemplate(orgSlug, templateId);
      if (res.success !== false) {
        showToast('Template duplicated');
        fetchTemplates();
      } else {
        showToast(res.message || 'Failed to duplicate', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to duplicate template', 'error');
    } finally {
      setDuplicating(null);
    }
  };

  const handleDelete = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      setDeleting(templateId);
      const res = await signApi.deleteTemplate(orgSlug, templateId);
      if (res.success !== false) {
        showToast('Template deleted');
        fetchTemplates();
      } else {
        showToast(res.message || 'Failed to delete', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete template', 'error');
    } finally {
      setDeleting(null);
    }
  };

  // Filter templates by search
  const filtered = templates.filter((t) =>
    !search || t.name?.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      key: 'name',
      header: 'Name',
      width: 260,
      render: (tpl) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, width: '100%' }}>
          <span style={{
            width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-1)', background: 'color-mix(in srgb, var(--a-sign) 14%, transparent)',
          }}>
            <FileText size={13} style={{ color: 'var(--a-sign)' }} />
          </span>
          {/* 2026-05-23 Sign table UX: the cell flexes rather than capping at
              200px; title= surfaces the full name once it truncates. */}
          <span
            title={tpl.name || 'Untitled'}
            style={{
              font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {tpl.name || 'Untitled'}
          </span>
        </span>
      ),
    },
    {
      key: 'pages',
      header: 'Pages',
      width: 72,
      muted: true,
      render: (tpl) => tpl.numPages || tpl.pageCount || tpl.pages || '—',
    },
    {
      key: 'fields',
      header: 'Fields',
      width: 72,
      muted: true,
      render: (tpl) => tpl.signItems?.length || 0,
    },
    {
      key: 'tags',
      header: 'Tags',
      width: 176,
      render: (tpl) => {
        const tags = tpl.tags || [];
        if (tags.length === 0) return <span style={{ color: 'var(--fg-4)' }}>—</span>;
        return (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
            {tags.slice(0, 3).map((tag, i) => (
              <Chip
                key={tag._id || i}
                tone="info"
                title={tag.name || tag}
                style={{ maxWidth: 148, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', lineHeight: '20px' }}
              >
                {tag.name || tag}
              </Chip>
            ))}
            {tags.length > 3 && (
              <span style={{ font: `450 11px/1.8 ${FONT}`, color: 'var(--fg-4)' }}>+{tags.length - 3}</span>
            )}
          </span>
        );
      },
    },
    {
      key: 'requests',
      header: 'Requests',
      width: 100,
      render: (tpl) => (
        <span style={{ font: `450 13px/1 ${FONT}` }}>
          <span style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>{tpl.signedCount || 0}</span>
          <span style={{ color: 'var(--fg-4)' }}>/{tpl.requestCount || 0}</span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 178,
      align: 'right',
      render: (tpl) => (
        <span
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}
          onClick={(e) => e.stopPropagation()}   // don't open the editor behind the row
        >
          <IconAction
            title="Send for signature"
            onClick={() => navigate(orgPath(`/sign/requests?template=${tpl._id}`))}
          >
            <Send size={14} />
          </IconAction>
          <IconAction
            title="Edit template"
            onClick={() => navigate(orgPath(`/sign/templates/${tpl._id}/edit`))}
          >
            <Edit2 size={14} />
          </IconAction>
          <IconAction title="Edit name & tags" onClick={() => setEditingTpl(tpl)}>
            <Pencil size={14} />
          </IconAction>
          {/* Duplicate/Delete hit signAdmin-only endpoints — hidden from
              members to avoid a guaranteed 403. */}
          {isAdmin && (
            <>
              <IconAction
                title="Duplicate template"
                onClick={() => handleDuplicate(tpl._id)}
                disabled={duplicating === tpl._id}
              >
                {duplicating === tpl._id ? <Spinner size={14} /> : <Copy size={14} />}
              </IconAction>
              <IconAction
                title="Delete template"
                tone="danger"
                onClick={() => handleDelete(tpl._id)}
                disabled={deleting === tpl._id}
              >
                {deleting === tpl._id ? <Spinner size={14} /> : <Trash2 size={14} />}
              </IconAction>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)' }}>
      <PageHeader
        title="Templates"
        sub={
          /* `total` is the server-side count — templates.length is only the
             current page and undercounts once pagination kicks in. */
          `${total} ${total === 1 ? 'template' : 'templates'} total`
        }
        actions={isAdmin && (
          <Button onClick={() => setShowUploadModal(true)} iconLeft={<Upload size={15} />}>
            Upload Template
          </Button>
        )}
      />

      <div style={{ marginBottom: 12 }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search templates…"
          aria-label="Search templates"
          width={280}
        />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey="_id"
        loading={loading}
        stickyHeader
        onRowClick={(tpl) => navigate(orgPath(`/sign/templates/${tpl._id}/edit`))}
        empty={
          <EmptyState
            icon={<LayoutTemplate size={22} />}
            title={search ? 'No templates match your search' : 'No templates yet'}
          >
            {search
              ? 'Try adjusting your search term.'
              : 'Upload your first PDF template to start creating signature requests.'}
          </EmptyState>
        }
      />

      {/* Hidden when everything fits on one page, and never rendered while the
          first page loads, to avoid a 0-of-0 flicker. */}
      {!loading && totalPages > 1 && (
        <Pagination
          page={page}
          pageSize={TEMPLATES_PAGE_LIMIT}
          total={total}
          noun="template"
          onPageChange={setPage}
          style={{ marginTop: 12 }}
        />
      )}

      {/* Upload Modal */}
      <UploadTemplateModal
        show={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSaved={fetchTemplates}
        orgSlug={orgSlug}
      />

      {/* Edit Details Modal — rename + retag without opening the editor. */}
      <EditTemplateDetailsModal
        template={editingTpl}
        onClose={() => setEditingTpl(null)}
        onSaved={() => { setEditingTpl(null); fetchTemplates(); }}
        orgSlug={orgSlug}
        showToast={showToast}
      />
    </div>
  );
}
