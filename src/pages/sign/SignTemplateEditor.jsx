// ============================================================================
// SignTemplateEditor.jsx — PDF-based template editor with drag-and-drop fields
// ============================================================================
//
// Core page of the Sign app. Renders a PDF document and allows the user to
// place, move, resize, and configure sign fields (signature, initials, text,
// date, checkbox, etc.) overlaid on each page.
//
// Route: /sign/templates/:templateId/edit
// ============================================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { usePlatform } from '../../context/PlatformContext';
import signApi from '../../utils/signApi';
import * as pdfjsLib from 'pdfjs-dist';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Save,
  Plus,
  Trash2,
  Loader2,
  GripVertical,
  PenTool,
  Type,
  Calendar,
  User,
  Mail,
  Phone,
  Building2,
  CheckSquare,
  AlignLeft,
  Hash,
  Palette,
  MousePointer,
  Send,
  Bookmark,
  X,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { EditorSkeleton } from '../../components/Skeletons';

// ---------------------------------------------------------------------------
// PDF.js worker setup — use CDN for the matching version
// ---------------------------------------------------------------------------
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

/** Every field type the user can drag onto the PDF. */
const FIELD_TYPES = [
  { type: 'signature',  label: 'Signature',      icon: PenTool,    color: '#6366f1' },
  { type: 'initials',   label: 'Initials',       icon: PenTool,    color: '#8b5cf6' },
  { type: 'name',       label: 'Name',           icon: User,       color: '#3b82f6' },
  { type: 'email',      label: 'Email',          icon: Mail,       color: '#10b981' },
  { type: 'phone',      label: 'Phone',          icon: Phone,      color: '#f97316' },
  { type: 'company',    label: 'Company',        icon: Building2,  color: '#06b6d4' },
  { type: 'text',       label: 'Text',           icon: Type,       color: '#6b7280' },
  { type: 'multiline',  label: 'Multiline Text', icon: AlignLeft,  color: '#6b7280' },
  { type: 'date',       label: 'Date',           icon: Calendar,   color: '#f59e0b' },
  { type: 'checkbox',   label: 'Checkbox',       icon: CheckSquare,color: '#10b981' },
];

/** Default fractional width/height for each field type (0-1 relative to page). */
const DEFAULT_SIZES = {
  signature:  { w: 0.20,  h: 0.05  },
  initials:   { w: 0.085, h: 0.03  },
  text:       { w: 0.15,  h: 0.015 },
  name:       { w: 0.15,  h: 0.015 },
  email:      { w: 0.15,  h: 0.015 },
  phone:      { w: 0.15,  h: 0.015 },
  company:    { w: 0.15,  h: 0.015 },
  date:       { w: 0.15,  h: 0.015 },
  multiline:  { w: 0.30,  h: 0.05  },
  checkbox:   { w: 0.05,  h: 0.025 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the FIELD_TYPES definition for a given type string. */
function fieldMeta(type) {
  return FIELD_TYPES.find((f) => f.type === type) || FIELD_TYPES[6]; // fallback: text
}

/** Clamp a value between min and max. */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SignTemplateEditor() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { orgSlug } = useOrg();
  const { showToast } = useToast();
  const { orgPath } = usePlatform();
  const [searchParams] = useSearchParams();

  // ── Quick Send mode ─────────────────────────────────────────────────
  const isQuickSend = searchParams.get('quickSend') === 'true';
  const quickSendSigners = useMemo(() => {
    try { return JSON.parse(decodeURIComponent(searchParams.get('signers') || '[]')); }
    catch { return []; }
  }, [searchParams]);

  // ── Template state ──────────────────────────────────────────────────
  const [templateName, setTemplateName] = useState('');
  usePageTitle(templateName || 'New Template');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [signItems, setSignItems] = useState([]);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Roles ───────────────────────────────────────────────────────────
  const [roles, setRoles] = useState([]);
  const [activeRoleId, setActiveRoleId] = useState(null);

  // ── PDF rendering ───────────────────────────────────────────────────
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageViewports, setPageViewports] = useState([]); // { origWidth, origHeight }[]
  const pdfContainerRef = useRef(null);
  const canvasRefs = useRef({}); // pageIndex → canvas element
  const renderTasksRef = useRef({}); // track in-flight render tasks

  // ── Selection ───────────────────────────────────────────────────────
  const [selectedItemId, setSelectedItemId] = useState(null);

  // ── Drag / resize state (mouse-based) ───────────────────────────────
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  // ── Editing name ────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef(null);

  // ── Tracks when PDF canvases finish rendering (forces overlay re-calc) ──
  const [pagesRenderedKey, setPagesRenderedKey] = useState(0);

  // ────────────────────────────────────────────────────────────────────
  // Fetch template + roles on mount
  // ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgSlug || !templateId) return;
    let cancelled = false;

    async function load() {
      try {
        const [tmplRes, rolesRes] = await Promise.all([
          signApi.getTemplate(orgSlug, templateId),
          signApi.listRoles(orgSlug),
        ]);

        if (cancelled) return;

        if (tmplRes.success && tmplRes.template) {
          const t = tmplRes.template;
          setTemplateName(t.name || 'Untitled Template');
          setPdfUrl(t.pdfUrl || null);
          setSignItems(
            (t.signItems || []).map((item) => ({
              ...item,
              id: item.id || item._id || crypto.randomUUID(),
            }))
          );
          setNumPages(t.numPages || 0);
        } else {
          showToast('Failed to load template', 'error');
          navigate(orgPath('/sign/templates'));
        }

        let rolesArr = rolesRes.roles || rolesRes.items || [];
        // In quickSend mode, if no roles from API, create virtual roles from signer data
        if (isQuickSend && rolesArr.length === 0 && quickSendSigners.length > 0) {
          rolesArr = quickSendSigners.map((s, i) => ({
            _id: s.roleId,
            name: s.name || `Signer ${i + 1}`,
            sequence: i,
          }));
        }
        if (rolesRes.success && Array.isArray(rolesArr)) {
          setRoles(rolesArr);
          if (rolesArr.length > 0) {
            setActiveRoleId(rolesArr[0]._id);
          }
        }
      } catch (err) {
        console.error('Error loading template:', err);
        if (!cancelled) {
          showToast('Error loading template', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [orgSlug, templateId]);

  // ────────────────────────────────────────────────────────────────────
  // Load PDF document when pdfUrl changes
  // ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;

    async function loadPdf() {
      try {
        const doc = await pdfjsLib.getDocument({
          url: pdfUrl,
          cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
        }).promise;

        if (cancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);

        // Pre-compute viewports for each page
        const vps = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const unscaledVp = page.getViewport({ scale: 1 });
          vps.push({
            origWidth: unscaledVp.width,
            origHeight: unscaledVp.height,
          });
        }
        if (!cancelled) setPageViewports(vps);
      } catch (err) {
        console.error('PDF load error:', err);
        if (!cancelled) showToast('Failed to load PDF', 'error');
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  // ────────────────────────────────────────────────────────────────────
  // Render PDF pages to canvases whenever pdfDoc or viewports change
  // ────────────────────────────────────────────────────────────────────
  const renderPages = useCallback(async () => {
    if (!pdfDoc || pageViewports.length === 0) return;

    for (let i = 0; i < pdfDoc.numPages; i++) {
      const canvas = canvasRefs.current[i];
      if (!canvas) continue;

      const container = canvas.parentElement;
      if (!container) continue;

      const containerWidth = container.clientWidth;
      const vp = pageViewports[i];
      if (!vp) continue;

      const scale = containerWidth / vp.origWidth;
      const page = await pdfDoc.getPage(i + 1);
      const viewport = page.getViewport({ scale });

      // Set canvas size to match the scaled viewport (use device pixel ratio for sharpness)
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Cancel any previous in-flight render for this page
      if (renderTasksRef.current[i]) {
        try { renderTasksRef.current[i].cancel(); } catch (_) { /* ignore */ }
      }

      const task = page.render({ canvasContext: ctx, viewport });
      renderTasksRef.current[i] = task;

      try {
        await task.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Render error page ${i + 1}:`, err);
        }
      }
    }
    // Signal that all canvases have been sized — overlay dims will re-compute
    setPagesRenderedKey((k) => k + 1);
  }, [pdfDoc, pageViewports]);

  useEffect(() => {
    renderPages();
  }, [renderPages]);

  // Re-render on window resize
  useEffect(() => {
    let timeout;
    function onResize() {
      clearTimeout(timeout);
      timeout = setTimeout(renderPages, 200);
    }
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timeout);
    };
  }, [renderPages]);

  // ────────────────────────────────────────────────────────────────────
  // Computed: page pixel dimensions (for overlay positioning)
  // We recompute from actual canvas sizes so they stay accurate after render.
  // ────────────────────────────────────────────────────────────────────
  const getPageDims = useCallback(
    (pageIndex) => {
      const canvas = canvasRefs.current[pageIndex];
      if (canvas) {
        return {
          width: parseFloat(canvas.style.width) || canvas.clientWidth,
          height: parseFloat(canvas.style.height) || canvas.clientHeight,
        };
      }
      // Fallback: compute from viewports
      const vp = pageViewports[pageIndex];
      if (!vp) return { width: 700, height: 990 };
      const containerWidth = pdfContainerRef.current?.clientWidth
        ? Math.min(pdfContainerRef.current.clientWidth - 48, 900)
        : 700;
      const scale = containerWidth / vp.origWidth;
      return {
        width: vp.origWidth * scale,
        height: vp.origHeight * scale,
      };
    },
    [pageViewports]
  );

  // ────────────────────────────────────────────────────────────────────
  // Role color helper
  // ────────────────────────────────────────────────────────────────────
  const getRoleColor = useCallback(
    (roleId) => {
      const idx = roles.findIndex((r) => r._id === roleId);
      return idx >= 0 ? ROLE_COLORS[idx % ROLE_COLORS.length] : ROLE_COLORS[0];
    },
    [roles]
  );

  const getRoleName = useCallback(
    (roleId) => {
      const role = roles.find((r) => r._id === roleId);
      return role?.name || 'Unassigned';
    },
    [roles]
  );

  // ────────────────────────────────────────────────────────────────────
  // Save
  // ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await signApi.updateTemplate(orgSlug, templateId, {
        name: templateName,
        signItems,
        numPages,
      });
      if (res.success) {
        showToast('Template saved');
      } else {
        showToast(res.message || 'Failed to save', 'error');
      }
    } catch (err) {
      console.error('Save error:', err);
      showToast('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  }, [orgSlug, templateId, templateName, signItems, numPages, saving]);

  // ────────────────────────────────────────────────────────────────────
  // Quick Send: Send dialog + Save as Template
  // ────────────────────────────────────────────────────────────────────
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendSubject, setSendSubject] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sendValidity, setSendValidity] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const handleQuickSendSubmit = useCallback(async () => {
    if (sendingRequest || signItems.length === 0) return;
    setSendingRequest(true);
    try {
      // First save fields to the template
      const saveRes = await signApi.updateTemplate(orgSlug, templateId, { signItems, numPages });
      if (!saveRes.success) {
        showToast('Failed to save fields', 'error');
        return;
      }

      // Then create the sign request
      const requestData = {
        templateId,
        signers: quickSendSigners.map(s => ({
          name: s.name,
          email: s.email,
          roleId: s.roleId,
          order: s.order,
        })),
        subject: sendSubject || `Signature Request - ${templateName}`,
        message: sendMessage || undefined,
        validity: sendValidity || undefined,
      };

      const res = await signApi.createRequest(orgSlug, requestData);
      if (res.success !== false) {
        showToast('Document sent for signature');
        navigate(orgPath('/sign/requests'));
      } else {
        showToast(res.error || 'Failed to send', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to send', 'error');
    } finally {
      setSendingRequest(false);
    }
  }, [orgSlug, templateId, signItems, numPages, quickSendSigners, sendSubject, sendMessage, sendValidity, templateName, sendingRequest]);

  const handleSaveAsTemplate = useCallback(async () => {
    if (promoting) return;
    setPromoting(true);
    try {
      // Save fields first
      await signApi.updateTemplate(orgSlug, templateId, { name: templateName, signItems, numPages });
      // Then promote from ephemeral to permanent
      const res = await signApi.promoteTemplate(orgSlug, templateId);
      if (res.success) {
        showToast('Saved as reusable template');
      } else {
        showToast(res.error || 'Failed to save template', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to save template', 'error');
    } finally {
      setPromoting(false);
    }
  }, [orgSlug, templateId, templateName, signItems, numPages, promoting]);

  // ────────────────────────────────────────────────────────────────────
  // Drop NEW field from sidebar onto a PDF page
  // ────────────────────────────────────────────────────────────────────
  const handlePageDrop = useCallback(
    (e, pageIndex) => {
      e.preventDefault();
      const fieldType = e.dataTransfer.getData('fieldType');
      if (!fieldType) return;

      const pageContainer = e.currentTarget;
      const rect = pageContainer.getBoundingClientRect();
      const dims = getPageDims(pageIndex);

      const dropX = e.clientX - rect.left;
      const dropY = e.clientY - rect.top;

      const defaults = DEFAULT_SIZES[fieldType] || DEFAULT_SIZES.text;

      // Center the field on the cursor
      const posX = clamp((dropX / dims.width) - defaults.w / 2, 0, 1 - defaults.w);
      const posY = clamp((dropY / dims.height) - defaults.h / 2, 0, 1 - defaults.h);

      const newItem = {
        id: crypto.randomUUID(),
        type: fieldType,
        page: pageIndex,
        posX,
        posY,
        width: defaults.w,
        height: defaults.h,
        roleId: activeRoleId || (roles[0]?._id ?? null),
        required: true,
        label: fieldMeta(fieldType).label,
        alignment: 'left',
      };

      setSignItems((prev) => [...prev, newItem]);
      setSelectedItemId(newItem.id);
    },
    [getPageDims, activeRoleId, roles]
  );

  const handlePageDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // Move existing field (mouse-based drag)
  // ────────────────────────────────────────────────────────────────────
  const startFieldDrag = useCallback((e, itemId) => {
    // Prevent if it is actually a resize handle click
    if (e.target.dataset.resize === 'true') return;
    e.stopPropagation();
    e.preventDefault();

    const item = signItems.find((i) => i.id === itemId);
    if (!item) return;

    setSelectedItemId(itemId);

    const dims = getPageDims(item.page);

    dragRef.current = {
      itemId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPosX: item.posX,
      startPosY: item.posY,
      pageIndex: item.page,
      pageWidth: dims.width,
      pageHeight: dims.height,
    };

    function onMouseMove(ev) {
      const d = dragRef.current;
      if (!d) return;

      const dx = (ev.clientX - d.startMouseX) / d.pageWidth;
      const dy = (ev.clientY - d.startMouseY) / d.pageHeight;

      setSignItems((prev) =>
        prev.map((si) => {
          if (si.id !== d.itemId) return si;
          return {
            ...si,
            posX: clamp(d.startPosX + dx, 0, 1 - si.width),
            posY: clamp(d.startPosY + dy, 0, 1 - si.height),
          };
        })
      );
    }

    function onMouseUp() {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [signItems, getPageDims]);

  // ────────────────────────────────────────────────────────────────────
  // Resize field (mouse-based)
  // ────────────────────────────────────────────────────────────────────
  const startFieldResize = useCallback((e, itemId) => {
    e.stopPropagation();
    e.preventDefault();

    const item = signItems.find((i) => i.id === itemId);
    if (!item) return;

    const dims = getPageDims(item.page);

    resizeRef.current = {
      itemId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startW: item.width,
      startH: item.height,
      pageIndex: item.page,
      pageWidth: dims.width,
      pageHeight: dims.height,
    };

    function onMouseMove(ev) {
      const r = resizeRef.current;
      if (!r) return;

      const dw = (ev.clientX - r.startMouseX) / r.pageWidth;
      const dh = (ev.clientY - r.startMouseY) / r.pageHeight;

      setSignItems((prev) =>
        prev.map((si) => {
          if (si.id !== r.itemId) return si;
          return {
            ...si,
            width: clamp(r.startW + dw, 0.02, 1 - si.posX),
            height: clamp(r.startH + dh, 0.01, 1 - si.posY),
          };
        })
      );
    }

    function onMouseUp() {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [signItems, getPageDims]);

  // ────────────────────────────────────────────────────────────────────
  // Delete selected field
  // ────────────────────────────────────────────────────────────────────
  const deleteField = useCallback(
    (itemId) => {
      setSignItems((prev) => prev.filter((i) => i.id !== itemId));
      if (selectedItemId === itemId) setSelectedItemId(null);
    },
    [selectedItemId]
  );

  // ────────────────────────────────────────────────────────────────────
  // Update a single sign item property
  // ────────────────────────────────────────────────────────────────────
  const updateItemProp = useCallback((itemId, key, value) => {
    setSignItems((prev) =>
      prev.map((si) => (si.id === itemId ? { ...si, [key]: value } : si))
    );
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // Keyboard: Delete/Backspace removes selected field (when not editing)
  // ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e) {
      if (!selectedItemId) return;
      // Don't intercept if user is typing in an input
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteField(selectedItemId);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItemId, deleteField]);

  // ────────────────────────────────────────────────────────────────────
  // Currently selected item (derived)
  // ────────────────────────────────────────────────────────────────────
  const selectedItem = useMemo(
    () => signItems.find((i) => i.id === selectedItemId) || null,
    [signItems, selectedItemId]
  );

  // ────────────────────────────────────────────────────────────────────
  // Inline name editing
  // ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  // ────────────────────────────────────────────────────────────────────
  // Loading state
  // ────────────────────────────────────────────────────────────────────
  if (loading) return <EditorSkeleton />;
  // ====================================================================
  // RENDER
  // ====================================================================
  return (
    <div className="flex flex-col h-full overflow-hidden bg-dark-950">
      {/* ── Header Bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-dark-700 bg-dark-900 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button + breadcrumb for Quick Send */}
          {isQuickSend && (
            <>
              <button
                onClick={() => navigate(orgPath('/sign/requests'))}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors shrink-0"
                title="Back to Sign Requests"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 text-sm text-dark-400 shrink-0">
                <span className="text-rivvra-400 font-medium">Quick Send</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </>
          )}
          {/* Editable template name */}
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setEditingName(false);
                if (e.key === 'Escape') setEditingName(false);
              }}
              className="bg-dark-800 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rivvra-500/50 min-w-[200px]"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-sm font-medium text-white hover:text-rivvra-400 transition-colors truncate max-w-[300px]"
              title="Click to edit name"
            >
              {templateName}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isQuickSend && (
            <>
              <button
                onClick={handleSaveAsTemplate}
                disabled={promoting || signItems.length === 0}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-dark-300 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {promoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bookmark className="w-4 h-4" />}
                Save as Template
              </button>
              <button
                onClick={() => { setSendSubject(`Signature Request - ${templateName}`); setShowSendDialog(true); }}
                disabled={signItems.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rivvra-600 hover:bg-rivvra-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </>
          )}
          {!isQuickSend && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rivvra-600 hover:bg-rivvra-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          )}
        </div>
      </header>

      {/* ── Main body: left sidebar + PDF center + right sidebar ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Left Sidebar ─────────────────────────────────────── */}
        <aside className="w-64 shrink-0 border-r border-dark-700 bg-dark-900 overflow-y-auto">
          {/* Field Types */}
          <div className="p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Field Types
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {FIELD_TYPES.map((ft) => {
                const Icon = ft.icon;
                return (
                  <button
                    key={ft.type}
                    draggable="true"
                    onDragStart={(e) => {
                      e.dataTransfer.setData('fieldType', ft.type);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-dark-700 bg-dark-800 hover:bg-dark-700 hover:border-dark-600 transition-colors cursor-grab active:cursor-grabbing group"
                  >
                    <Icon
                      className="w-5 h-5 transition-colors"
                      style={{ color: ft.color }}
                    />
                    <span className="text-[11px] text-gray-400 group-hover:text-gray-200 leading-tight text-center">
                      {ft.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Roles / Signers */}
          <div className="p-4 border-t border-dark-700">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {isQuickSend ? 'Signers' : 'Roles'}
            </h3>
            {roles.length === 0 ? (
              <p className="text-xs text-gray-500 italic">
                {isQuickSend ? 'No signers found.' : 'No roles configured. Go to Sign Settings to add roles.'}
              </p>
            ) : (
              <div className="space-y-1">
                {roles.map((role, idx) => {
                  const color = ROLE_COLORS[idx % ROLE_COLORS.length];
                  const isActive = role._id === activeRoleId;
                  const signer = isQuickSend ? quickSendSigners.find(s => s.roleId === role._id) : null;
                  return (
                    <button
                      key={role._id}
                      onClick={() => setActiveRoleId(role._id)}
                      className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-dark-700 text-white'
                          : 'text-gray-400 hover:bg-dark-800 hover:text-gray-200'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="truncate block text-sm">{signer?.name || role.name}</span>
                        {signer?.email && (
                          <span className="truncate block text-[10px] text-dark-500">{signer.email}</span>
                        )}
                      </div>
                      {isActive && (
                        <MousePointer className="w-3.5 h-3.5 ml-auto text-rivvra-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick stats */}
          <div className="p-4 border-t border-dark-700">
            <div className="text-xs text-gray-500">
              {signItems.length} field{signItems.length !== 1 ? 's' : ''} placed
              {' '}&middot;{' '}{numPages} page{numPages !== 1 ? 's' : ''}
            </div>
          </div>
        </aside>

        {/* ─── PDF Viewer (center) ──────────────────────────────── */}
        <main
          ref={pdfContainerRef}
          className="flex-1 overflow-y-auto bg-dark-950 p-6"
          onClick={() => setSelectedItemId(null)}
        >
          {!pdfDoc && !loading && (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              {pdfUrl ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading PDF...
                </div>
              ) : (
                'No PDF uploaded for this template.'
              )}
            </div>
          )}

          {pdfDoc && (
            <div className="max-w-[900px] mx-auto space-y-4">
              {Array.from({ length: pdfDoc.numPages }, (_, pageIndex) => {
                const pageItems = signItems.filter((si) => si.page === pageIndex);

                return (
                  <PageContainer
                    key={pageIndex}
                    pageIndex={pageIndex}
                    totalPages={pdfDoc.numPages}
                    pageItems={pageItems}
                    canvasRefs={canvasRefs}
                    getPageDims={getPageDims}
                    getRoleColor={getRoleColor}
                    selectedItemId={selectedItemId}
                    setSelectedItemId={setSelectedItemId}
                    handlePageDragOver={handlePageDragOver}
                    handlePageDrop={handlePageDrop}
                    startFieldDrag={startFieldDrag}
                    startFieldResize={startFieldResize}
                    pagesRenderedKey={pagesRenderedKey}
                  />
                );
              })}
            </div>
          )}
        </main>

        {/* ─── Right Sidebar (Properties) ───────────────────────── */}
        <aside className="w-64 shrink-0 border-l border-dark-700 bg-dark-900 overflow-y-auto">
          {selectedItem ? (
            <div className="p-4 space-y-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Field Properties
              </h3>

              {/* Type (read-only) */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-dark-800 rounded-lg border border-dark-700">
                  {(() => {
                    const meta = fieldMeta(selectedItem.type);
                    const Icon = meta.icon;
                    return (
                      <>
                        <Icon className="w-4 h-4" style={{ color: meta.color }} />
                        <span className="text-sm text-gray-200">{meta.label}</span>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Assigned Role</label>
                <select
                  value={selectedItem.roleId || ''}
                  onChange={(e) => updateItemProp(selectedItem.id, 'roleId', e.target.value)}
                  className="w-full px-3 py-2 text-sm text-white bg-dark-800 border border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rivvra-500/50"
                >
                  <option value="">Unassigned</option>
                  {roles.map((role) => (
                    <option key={role._id} value={role._id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Label */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Label</label>
                <input
                  type="text"
                  value={selectedItem.label || ''}
                  onChange={(e) => updateItemProp(selectedItem.id, 'label', e.target.value)}
                  placeholder="Field label"
                  className="w-full px-3 py-2 text-sm text-white bg-dark-800 border border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rivvra-500/50 placeholder:text-gray-600"
                />
              </div>

              {/* Required toggle */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-500">Required</label>
                <button
                  onClick={() =>
                    updateItemProp(selectedItem.id, 'required', !selectedItem.required)
                  }
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    selectedItem.required ? 'bg-rivvra-600' : 'bg-dark-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                      selectedItem.required ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </button>
              </div>

              {/* Alignment */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Alignment</label>
                <select
                  value={selectedItem.alignment || 'left'}
                  onChange={(e) =>
                    updateItemProp(selectedItem.id, 'alignment', e.target.value)
                  }
                  className="w-full px-3 py-2 text-sm text-white bg-dark-800 border border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rivvra-500/50"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                </select>
              </div>

              {/* Position info */}
              <div className="pt-3 border-t border-dark-700">
                <h4 className="text-xs text-gray-500 mb-2">Position</h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <div className="bg-dark-800 rounded px-2 py-1.5">
                    <span className="text-gray-600">X: </span>
                    {(selectedItem.posX * 100).toFixed(1)}%
                  </div>
                  <div className="bg-dark-800 rounded px-2 py-1.5">
                    <span className="text-gray-600">Y: </span>
                    {(selectedItem.posY * 100).toFixed(1)}%
                  </div>
                  <div className="bg-dark-800 rounded px-2 py-1.5">
                    <span className="text-gray-600">W: </span>
                    {(selectedItem.width * 100).toFixed(1)}%
                  </div>
                  <div className="bg-dark-800 rounded px-2 py-1.5">
                    <span className="text-gray-600">H: </span>
                    {(selectedItem.height * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="mt-2 bg-dark-800 rounded px-2 py-1.5 text-xs text-gray-400">
                  <span className="text-gray-600">Page: </span>
                  {selectedItem.page + 1}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => deleteField(selectedItem.id)}
                className="flex items-center justify-center gap-2 w-full px-3 py-2.5 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Field
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <div className="w-12 h-12 rounded-xl bg-dark-800 border border-dark-700 flex items-center justify-center mb-3">
                <MousePointer className="w-5 h-5 text-gray-600" />
              </div>
              <p className="text-sm text-gray-400 font-medium mb-1">No field selected</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Click a field on the document to view and edit its properties, or drag a field type
                from the left sidebar onto a page.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* ── Quick Send Dialog ─────────────────────────────────────── */}
      {isQuickSend && showSendDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-rivvra-400" />
                Send for Signature
              </h2>
              <button onClick={() => setShowSendDialog(false)} className="text-dark-400 hover:text-white p-1 rounded-lg hover:bg-dark-700">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-dark-400 mb-1 block">Subject</label>
                <input value={sendSubject} onChange={e => setSendSubject(e.target.value)} placeholder={`Signature Request - ${templateName}`} className="w-full px-3 py-2 text-sm text-white bg-dark-900 border border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rivvra-500/50 placeholder:text-dark-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-dark-400 mb-1 block">Message (optional)</label>
                <textarea value={sendMessage} onChange={e => setSendMessage(e.target.value)} placeholder="Add a message for the signers..." rows={3} className="w-full px-3 py-2 text-sm text-white bg-dark-900 border border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rivvra-500/50 placeholder:text-dark-500 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-dark-400 mb-1 block">Valid Until (optional)</label>
                <input type="date" value={sendValidity} onChange={e => setSendValidity(e.target.value)} className="w-full px-3 py-2 text-sm text-white bg-dark-900 border border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rivvra-500/50" />
              </div>
              <div className="bg-dark-900 rounded-lg p-3 border border-dark-700">
                <p className="text-xs text-dark-400 mb-2">Summary</p>
                <p className="text-sm text-white">{templateName}</p>
                <p className="text-xs text-dark-500 mt-1">{quickSendSigners.length} signer(s) &middot; {signItems.length} field(s) placed &middot; Sequential signing</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowSendDialog(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-dark-300 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={handleQuickSendSubmit} disabled={sendingRequest} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-rivvra-600 hover:bg-rivvra-500 rounded-lg transition-colors disabled:opacity-50">
                  {sendingRequest ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Send className="w-4 h-4" /> Send</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ===========================================================================
// PageContainer — renders one PDF page with its field overlays
// ===========================================================================
// Extracted to its own component so we can isolate re-renders per page.

function PageContainer({
  pageIndex,
  totalPages,
  pageItems,
  canvasRefs,
  getPageDims,
  getRoleColor,
  selectedItemId,
  setSelectedItemId,
  handlePageDragOver,
  handlePageDrop,
  startFieldDrag,
  startFieldResize,
  pagesRenderedKey,
}) {
  // Re-compute dims whenever pagesRenderedKey changes (canvas sizes updated)
  // eslint-disable-next-line no-unused-vars
  const dims = useMemo(() => getPageDims(pageIndex), [getPageDims, pageIndex, pagesRenderedKey]);

  return (
    <div
      className="relative bg-white rounded-lg shadow-lg"
      onDragOver={handlePageDragOver}
      onDrop={(e) => handlePageDrop(e, pageIndex)}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedItemId(null);
      }}
    >
      {/* Page number badge */}
      <div className="absolute top-2 right-2 z-20 bg-dark-900/80 text-gray-300 text-xs px-2 py-0.5 rounded-full pointer-events-none">
        {pageIndex + 1} / {totalPages}
      </div>

      {/* PDF canvas */}
      <canvas
        ref={(el) => { canvasRefs.current[pageIndex] = el; }}
        className="block w-full"
      />

      {/* Overlay container for sign items — matches canvas exactly */}
      <div
        className="absolute top-0 left-0 pointer-events-none"
        style={{ width: dims.width || '100%', height: dims.height || '100%' }}
      >
        {pageItems.map((item) => (
          <FieldOverlay
            key={item.id}
            item={item}
            dims={dims}
            getRoleColor={getRoleColor}
            isSelected={item.id === selectedItemId}
            setSelectedItemId={setSelectedItemId}
            startFieldDrag={startFieldDrag}
            startFieldResize={startFieldResize}
          />
        ))}
      </div>
    </div>
  );
}


// ===========================================================================
// FieldOverlay — a single draggable/resizable sign field on the PDF
// ===========================================================================

function FieldOverlay({
  item,
  dims,
  getRoleColor,
  isSelected,
  setSelectedItemId,
  startFieldDrag,
  startFieldResize,
}) {
  const meta = fieldMeta(item.type);
  const Icon = meta.icon;
  const roleColor = getRoleColor(item.roleId);

  const pxLeft = item.posX * dims.width;
  const pxTop = item.posY * dims.height;
  const pxWidth = item.width * dims.width;
  const pxHeight = item.height * dims.height;

  return (
    <div
      className={`absolute pointer-events-auto group cursor-move select-none transition-shadow ${
        isSelected
          ? 'ring-2 ring-offset-1 ring-blue-500 z-10'
          : 'hover:ring-1 hover:ring-white/30 z-[5]'
      }`}
      style={{
        left: pxLeft,
        top: pxTop,
        width: Math.max(pxWidth, 36),
        height: Math.max(pxHeight, 20),
        borderLeft: `3px solid ${roleColor}`,
        backgroundColor: `${roleColor}18`,
      }}
      onMouseDown={(e) => startFieldDrag(e, item.id)}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedItemId(item.id);
      }}
    >
      {/* Field content */}
      <div
        className="flex items-center gap-1 px-1.5 h-full overflow-hidden"
        style={{ minHeight: 20 }}
      >
        <GripVertical
          className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
          style={{ color: roleColor }}
        />
        <Icon
          className="w-3 h-3 shrink-0"
          style={{ color: roleColor }}
        />
        <span
          className="text-[10px] font-medium truncate leading-none"
          style={{ color: roleColor }}
        >
          {item.label || meta.label}
        </span>
      </div>

      {/* Resize handle (bottom-right corner) */}
      <div
        data-resize="true"
        className={`absolute bottom-0 right-0 w-3 h-3 cursor-se-resize ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        } transition-opacity`}
        onMouseDown={(e) => startFieldResize(e, item.id)}
      >
        <svg
          viewBox="0 0 12 12"
          className="w-3 h-3"
          style={{ color: roleColor }}
        >
          <path
            d="M11 1v10H1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M11 5v6H5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
