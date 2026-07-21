import { useState } from 'react';
import { Loader2, Save, Trash2, X, Eye, Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAppById } from '../../config/apps';
import knowledgeBaseApi from '../../utils/knowledgeBaseApi';

// Apps an org article can be filed under (mirrors the backend VALID_ARTICLE_APPS).
const APP_OPTIONS = [
  'general', 'outreach', 'timesheet', 'payroll', 'employee', 'contacts', 'crm',
  'ats', 'sign', 'todo', 'invoicing', 'incentive', 'expenses', 'documents',
];
const appLabel = (id) => (id === 'general' ? 'General' : (getAppById(id)?.name || id));

const mdComponents = {
  h1: (p) => <h1 className="text-2xl font-bold text-dark-100 mt-6 mb-3 first:mt-0" {...p} />,
  h2: (p) => <h2 className="text-xl font-semibold text-dark-100 mt-6 mb-2" {...p} />,
  h3: (p) => <h3 className="text-base font-semibold text-dark-200 mt-4 mb-2" {...p} />,
  p: (p) => <p className="text-sm text-dark-300 leading-relaxed mb-3" {...p} />,
  ul: (p) => <ul className="list-disc pl-5 text-sm text-dark-300 space-y-1 mb-3" {...p} />,
  ol: (p) => <ol className="list-decimal pl-5 text-sm text-dark-300 space-y-1 mb-3" {...p} />,
  li: (p) => <li {...p} />,
  strong: (p) => <strong className="font-semibold text-dark-100" {...p} />,
  code: (p) => <code className="px-1 py-0.5 rounded bg-dark-800 text-rivvra-300 text-[0.8em] font-mono" {...p} />,
};

const field = 'w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-800 text-sm text-dark-200 placeholder:text-dark-600 focus:outline-none focus:border-sky-500/40';

/**
 * KbArticleEditor — create or edit an org-scoped article.
 * `existing` is the full article (with body) when editing; null when creating.
 */
export default function KbArticleEditor({ orgSlug, existing, onSaved, onDeleted, onCancel }) {
  const isEdit = !!existing?.id;
  const [title, setTitle] = useState(existing?.title || '');
  const [appId, setAppId] = useState(existing?.appId || 'general');
  const [section, setSection] = useState(existing?.section || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [tags, setTags] = useState((existing?.tags || []).join(', '));
  const [body, setBody] = useState(existing?.body || '');
  const [status, setStatus] = useState(existing?.status || 'published');

  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState(null);

  const payload = () => ({
    title: title.trim(),
    appId,
    section: section.trim(),
    description: description.trim(),
    tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    body,
    status,
  });

  const save = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!body.trim()) { setError('Body is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = isEdit
        ? await knowledgeBaseApi.update(orgSlug, existing.id, payload())
        : await knowledgeBaseApi.create(orgSlug, payload());
      onSaved?.(res.article);
    } catch (e) {
      setError(e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const remove = () => { if (isEdit) setConfirmOpen(true); };

  const doDelete = async () => {
    setConfirmOpen(false);
    setDeleting(true);
    setError(null);
    try {
      await knowledgeBaseApi.remove(orgSlug, existing.id);
      onDeleted?.(existing.id);
    } catch (e) {
      setError(e?.message || 'Failed to delete.');
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-dark-100">{isEdit ? 'Edit article' : 'New article'}</h2>
        <button type="button" onClick={onCancel} className="text-dark-500 hover:text-dark-300"><X size={18} /></button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="sm:col-span-2">
          <label className="block text-xs text-dark-400 mb-1">Title *</label>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="How to…" />
        </div>
        <div>
          <label className="block text-xs text-dark-400 mb-1">App</label>
          <select className={field} value={appId} onChange={(e) => setAppId(e.target.value)}>
            {APP_OPTIONS.map((id) => <option key={id} value={id}>{appLabel(id)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-dark-400 mb-1">Section</label>
          <input className={field} value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Getting started" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-dark-400 mb-1">Short description</label>
          <input className={field} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line shown in lists and search." />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-dark-400 mb-1">Tags (comma-separated)</label>
          <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="onboarding, payroll" />
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-dark-400">Body (Markdown) *</label>
          <button type="button" onClick={() => setPreview((v) => !v)} className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300">
            {preview ? <><Pencil size={12} /> Write</> : <><Eye size={12} /> Preview</>}
          </button>
        </div>
        {preview ? (
          <div className="min-h-[240px] px-4 py-3 rounded-lg bg-dark-950 border border-dark-800">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{body || '_Nothing to preview yet._'}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            placeholder={'# Title\n\nWrite the guide here using Markdown…'}
            className={`${field} font-mono text-xs leading-relaxed resize-y`}
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-dark-950 rounded-lg text-sm font-semibold hover:bg-sky-400 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {status === 'draft' ? 'Save draft' : 'Publish'}
          </button>
          <label className="flex items-center gap-2 text-xs text-dark-400">
            <input type="checkbox" checked={status === 'draft'} onChange={(e) => setStatus(e.target.checked ? 'draft' : 'published')} />
            Save as draft (not shown to members)
          </label>
        </div>
        {isEdit && (
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Delete
          </button>
        )}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-dark-900 border border-dark-700 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <Trash2 size={16} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-dark-100">Delete this article?</h3>
                <p className="text-xs text-dark-400 mt-0.5">“{title || 'Untitled'}” will be permanently removed. This can’t be undone.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="px-3 py-1.5 rounded-lg text-sm text-dark-300 border border-dark-800 hover:border-dark-600">Cancel</button>
              <button type="button" onClick={doDelete} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-500 text-white hover:bg-red-400">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
