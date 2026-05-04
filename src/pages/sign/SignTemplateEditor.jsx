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
  Check,
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
  ChevronLeft,
  ChevronRight,
  Tag as TagIcon,
} from 'lucide-react';
import { EditorSkeleton } from '../../components/Skeletons';
import TagPicker from '../../components/sign/TagPicker';

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
  signature:  { w: 0.28,  h: 0.08  },
  initials:   { w: 0.12,  h: 0.05  },
  text:       { w: 0.22,  h: 0.03  },
  name:       { w: 0.22,  h: 0.03  },
  email:      { w: 0.22,  h: 0.03  },
  phone:      { w: 0.18,  h: 0.03  },
  company:    { w: 0.22,  h: 0.03  },
  date:       { w: 0.18,  h: 0.03  },
  multiline:  { w: 0.35,  h: 0.07  },
  checkbox:   { w: 0.025, h: 0.025 },
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

/**
 * Snap a Y coordinate to align with an existing field on the same page if one
 * is within the threshold. Lets the user drop fields in roughly the right row
 * and have them lock onto the same baseline as adjacent fields, fixing the
 * "two fields on the same line look misaligned by 3px" problem without
 * requiring full PDF underline detection.
 *
 * Returns the snapped Y, or the original Y if nothing close enough.
 */
function snapYToSiblings(posY, pageIndex, items, ignoreId = null, threshold = 0.012) {
  let bestY = posY;
  let bestDist = threshold;
  for (const it of items) {
    if (it.page !== pageIndex) continue;
    if (ignoreId && it.id === ignoreId) continue;
    const dist = Math.abs((it.posY ?? 0) - posY);
    if (dist < bestDist) {
      bestDist = dist;
      bestY = it.posY;
    }
  }
  return bestY;
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
  // Quick Send carries the parallel preference set in the modal across
  // to the editor via URL query param. Defaulted to false (sequential).
  const isQuickSendParallel = searchParams.get('parallel') === 'true';
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
  const [templateTagIds, setTemplateTagIds] = useState([]);
  const [editingTags, setEditingTags] = useState(false);

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
  // selectedItemId is the primary (properties-panel) selection.
  // multiSelectIds are additional fields highlighted via shift+click;
  // bulk Delete operates on the union of both.
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [multiSelectIds, setMultiSelectIds] = useState([]);

  const allSelectedIds = useMemo(
    () => (selectedItemId ? [selectedItemId, ...multiSelectIds] : multiSelectIds),
    [selectedItemId, multiSelectIds]
  );

  // ── Right-click context menu ────────────────────────────────────────
  // null when closed, otherwise { x, y, itemId } where x/y are viewport
  // coords for absolute positioning.
  const [contextMenu, setContextMenu] = useState(null);

  // ── Mobile sidebar overlay (md: and below) ──────────────────────────
  // null = both hidden behind hamburger toggles. 'fields' / 'props'
  // shows the corresponding sidebar as a fixed overlay. Desktop renders
  // both sidebars inline as flex children (md:flex) regardless.
  const [mobileSidebar, setMobileSidebar] = useState(null);

  // ── Zoom level (1.0 = fit-to-container) ─────────────────────────────
  // Multiplies the base scale so users can zoom in/out without losing
  // the responsive fit-to-container behavior. Clamped at the call site
  // to [0.5, 2.5].
  const [zoom, setZoom] = useState(1);

  // ── Current page (for the jump bar). Updated by an IntersectionObserver
  // attached after PDF render so scrolling keeps the bar in sync.
  const [currentPage, setCurrentPage] = useState(0);

  const jumpToPage = useCallback((idx) => {
    const container = pdfContainerRef.current;
    if (!container) return;
    const target = container.querySelector(`[data-page-index="${idx}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ── Drag / resize state (mouse-based) ───────────────────────────────
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  // ── Undo / redo history (signItems snapshots) ───────────────────────
  // We keep two stacks of cloned signItems arrays. A snapshot is captured
  // automatically by an effect whenever signItems changes, except when we
  // are in the middle of applying an undo/redo (suppress the next push).
  const historyRef = useRef({ past: [], future: [], suppress: false, lastJSON: '' });

  // Snapshot of signItems as of the last successful load/save. Used to detect
  // unsaved changes when the user clicks Cancel so we can prompt before
  // throwing away their work.
  const savedSignItemsRef = useRef('');

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
          const loadedItems = (t.signItems || []).map((item) => ({
            ...item,
            id: item.id || item._id || crypto.randomUUID(),
          }));
          setSignItems(loadedItems);
          savedSignItemsRef.current = JSON.stringify(loadedItems);
          setNumPages(t.numPages || 0);
          // Tags can come back as either array of populated tag objects or
          // raw IDs depending on the route. Normalize to a list of IDs.
          const rawTags = Array.isArray(t.tags) ? t.tags : [];
          setTemplateTagIds(rawTags.map((tag) => (typeof tag === 'string' ? tag : tag?._id)).filter(Boolean));
        } else {
          showToast('Failed to load template', 'error');
          navigate(orgPath('/sign/templates'));
        }

        let rolesArr = rolesRes.roles || rolesRes.items || [];
        // In quickSend mode, always use signers from URL params (not all org roles)
        if (isQuickSend && quickSendSigners.length > 0) {
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

      const scale = (containerWidth * zoom) / vp.origWidth;
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
  }, [pdfDoc, pageViewports, zoom]);

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
      const scale = (containerWidth * zoom) / vp.origWidth;
      return {
        width: vp.origWidth * scale,
        height: vp.origHeight * scale,
      };
    },
    [pageViewports, zoom]
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
  // ── Save state for autosave indicator ───────────────────────────────
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);

  const doSave = useCallback(async ({ silent = false } = {}) => {
    if (saving) return;
    if (silent) setAutoSaving(true); else setSaving(true);
    try {
      const res = await signApi.updateTemplate(orgSlug, templateId, {
        name: templateName,
        signItems,
        numPages,
        tags: templateTagIds,
      });
      if (res.success) {
        savedSignItemsRef.current = JSON.stringify(signItems);
        setLastSavedAt(new Date());
        if (!silent) showToast('Template saved');
      } else if (!silent) {
        showToast(res.message || 'Failed to save', 'error');
      }
    } catch (err) {
      console.error('Save error:', err);
      if (!silent) showToast('Failed to save template', 'error');
    } finally {
      if (silent) setAutoSaving(false); else setSaving(false);
    }
  }, [orgSlug, templateId, templateName, signItems, numPages, templateTagIds, saving, showToast]);

  const handleSave = useCallback(() => doSave({ silent: false }), [doSave]);

  // Autosave: debounced 2.5s after the last edit. Skips during the initial
  // load (savedSignItemsRef empty), during an undo/redo replay, and when
  // there are no changes to save. Render-only — the manual Save button
  // stays as the explicit "save now + toast confirmation" control.
  useEffect(() => {
    if (!savedSignItemsRef.current) return; // not yet loaded
    if (saving || autoSaving) return;
    const json = JSON.stringify(signItems);
    if (json === savedSignItemsRef.current) return;
    const t = setTimeout(() => { doSave({ silent: true }); }, 2500);
    return () => clearTimeout(t);
  }, [signItems, doSave, saving, autoSaving]);

  // ────────────────────────────────────────────────────────────────────
  // Quick Send: Send dialog + Save as Template
  // ────────────────────────────────────────────────────────────────────
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendSubject, setSendSubject] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sendValidity, setSendValidity] = useState('');
  // CC recipients — comma-separated emails. Only get the completion
  // notification (signed/refused/cancelled), not the signing link itself.
  // Backend ccEmails field accepts an array of strings.
  const [sendCcEmails, setSendCcEmails] = useState('');
  // Reminder cadence — days between auto-reminders to pending signers.
  // Backend reminderDays field; 0 = disabled. Default 7 matches the
  // pre-existing data-model default in src/sign.js create handlers.
  const [sendReminderDays, setSendReminderDays] = useState(7);
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
      const ccEmailsArray = sendCcEmails
        .split(/[,;\n]/)
        .map((e) => e.trim())
        .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

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
        ccEmails: ccEmailsArray.length > 0 ? ccEmailsArray : undefined,
        reminderDays: Number(sendReminderDays) || 0,
        parallel: isQuickSendParallel,
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
  }, [orgSlug, templateId, signItems, numPages, quickSendSigners, sendSubject, sendMessage, sendValidity, sendCcEmails, sendReminderDays, templateName, sendingRequest]);

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
      const rawY = clamp((dropY / dims.height) - defaults.h / 2, 0, 1 - defaults.h);
      const posY = snapYToSiblings(rawY, pageIndex, signItems);

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
    [getPageDims, activeRoleId, roles, signItems]
  );

  const handlePageDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // Auto-scroll the PDF container while dragging near edges
  // ────────────────────────────────────────────────────────────────────
  const scrollIntervalRef = useRef(null);

  const handleContainerDragOver = useCallback((e) => {
    e.preventDefault();
    const container = pdfContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const edgeZone = 60; // px from top/bottom edge
    const mouseY = e.clientY - rect.top;

    // Clear previous interval
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    if (mouseY < edgeZone) {
      // Scroll up
      const speed = Math.max(2, (edgeZone - mouseY) / 3);
      scrollIntervalRef.current = setInterval(() => {
        container.scrollTop -= speed;
      }, 16);
    } else if (mouseY > rect.height - edgeZone) {
      // Scroll down
      const speed = Math.max(2, (mouseY - (rect.height - edgeZone)) / 3);
      scrollIntervalRef.current = setInterval(() => {
        container.scrollTop += speed;
      }, 16);
    }
  }, []);

  const handleContainerDragLeave = useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, []);

  const handleContainerDrop = useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // Click-to-place: click a field type in sidebar, then click on PDF
  // ────────────────────────────────────────────────────────────────────
  const [placingFieldType, setPlacingFieldType] = useState(null);

  const handlePageClick = useCallback(
    (e, pageIndex) => {
      if (!placingFieldType) return;
      e.stopPropagation();

      const pageContainer = e.currentTarget;
      const rect = pageContainer.getBoundingClientRect();
      const dims = getPageDims(pageIndex);

      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const defaults = DEFAULT_SIZES[placingFieldType] || DEFAULT_SIZES.text;

      const posX = clamp((clickX / dims.width) - defaults.w / 2, 0, 1 - defaults.w);
      const rawClickY = clamp((clickY / dims.height) - defaults.h / 2, 0, 1 - defaults.h);
      const posY = snapYToSiblings(rawClickY, pageIndex, signItems);

      const newItem = {
        id: crypto.randomUUID(),
        type: placingFieldType,
        page: pageIndex,
        posX,
        posY,
        width: defaults.w,
        height: defaults.h,
        roleId: activeRoleId || (roles[0]?._id ?? null),
        required: true,
        label: fieldMeta(placingFieldType).label,
        alignment: 'left',
      };

      setSignItems((prev) => [...prev, newItem]);
      setSelectedItemId(newItem.id);
      setPlacingFieldType(null); // one-shot: clear after placing
    },
    [placingFieldType, getPageDims, activeRoleId, roles]
  );

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
          const newY = clamp(d.startPosY + dy, 0, 1 - si.height);
          return {
            ...si,
            posX: clamp(d.startPosX + dx, 0, 1 - si.width),
            posY: snapYToSiblings(newY, si.page, prev, si.id),
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
  // axis: 'both' (corner), 'x' (right edge — width only), 'y' (bottom edge — height only)
  const startFieldResize = useCallback((e, itemId, axis = 'both') => {
    e.stopPropagation();
    e.preventDefault();

    const item = signItems.find((i) => i.id === itemId);
    if (!item) return;

    const dims = getPageDims(item.page);

    resizeRef.current = {
      itemId,
      axis,
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
          const next = { ...si };
          if (r.axis === 'both' || r.axis === 'x') {
            next.width = clamp(r.startW + dw, 0.02, 1 - si.posX);
          }
          if (r.axis === 'both' || r.axis === 'y') {
            next.height = clamp(r.startH + dh, 0.01, 1 - si.posY);
          }
          return next;
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

  const duplicateField = useCallback(
    (itemId) => {
      setSignItems((prev) => {
        const src = prev.find((i) => i.id === itemId);
        if (!src) return prev;
        const newId = crypto.randomUUID();
        // Offset the duplicate so the user can see it's a separate field.
        const dup = {
          ...src,
          id: newId,
          posX: clamp((src.posX ?? 0) + 0.02, 0, 1 - (src.width ?? 0.1)),
          posY: clamp((src.posY ?? 0) + 0.02, 0, 1 - (src.height ?? 0.05)),
        };
        return [...prev, dup];
      });
    },
    []
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
  // History snapshotting: every signItems change pushes the previous value to
  // the past stack. Drags and arrow-key nudges all flow through setSignItems
  // so each one becomes an undo step. We compare a JSON serialization to
  // collapse no-op updates and prevent every render from creating a snapshot.
  useEffect(() => {
    const json = JSON.stringify(signItems);
    if (historyRef.current.suppress) {
      historyRef.current.suppress = false;
      historyRef.current.lastJSON = json;
      return;
    }
    if (historyRef.current.lastJSON === '') {
      historyRef.current.lastJSON = json;
      return;
    }
    if (historyRef.current.lastJSON === json) return;
    historyRef.current.past.push(historyRef.current.lastJSON);
    if (historyRef.current.past.length > 100) historyRef.current.past.shift();
    historyRef.current.future = [];
    historyRef.current.lastJSON = json;
  }, [signItems]);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const prev = h.past.pop();
    h.future.push(h.lastJSON);
    h.suppress = true;
    setSignItems(JSON.parse(prev));
  }, []);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const next = h.future.pop();
    h.past.push(h.lastJSON);
    h.suppress = true;
    setSignItems(JSON.parse(next));
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      // Escape cancels field placement mode
      if (e.key === 'Escape' && placingFieldType) {
        setPlacingFieldType(null);
        return;
      }

      // Undo / redo work regardless of selection.
      const isMod = e.metaKey || e.ctrlKey;
      const tagName = e.target.tagName.toLowerCase();
      const inEditable = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
      if (isMod && (e.key === 'z' || e.key === 'Z') && !inEditable) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (isMod && (e.key === 'y' || e.key === 'Y') && !inEditable) {
        e.preventDefault();
        redo();
        return;
      }

      // Cmd/Ctrl+D duplicates the selected field.
      if (isMod && (e.key === 'd' || e.key === 'D') && !inEditable && selectedItemId) {
        e.preventDefault();
        duplicateField(selectedItemId);
        return;
      }

      // Cmd/Ctrl+S saves the template explicitly (with toast). Browsers
      // try to claim this for "Save Page As..." — preventDefault stops
      // that and routes the keystroke to our handler instead.
      if (isMod && (e.key === 's' || e.key === 'S') && !inEditable) {
        e.preventDefault();
        handleSave();
        return;
      }

      if (!selectedItemId) return;
      // Don't intercept if user is typing in an input
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (multiSelectIds.length > 0) {
          // Bulk delete — primary + all multi-selected.
          const ids = new Set(allSelectedIds);
          setSignItems((prev) => prev.filter((i) => !ids.has(i.id)));
          setSelectedItemId(null);
          setMultiSelectIds([]);
        } else {
          deleteField(selectedItemId);
        }
        return;
      }

      // Arrow keys nudge the selected field. Shift = larger step (1%), default
      // = fine step (0.1%). Lets you fine-tune placement without re-dragging.
      const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
      if (isArrow) {
        e.preventDefault();
        const step = e.shiftKey ? 0.01 : 0.001;
        setSignItems((prev) =>
          prev.map((si) => {
            if (si.id !== selectedItemId) return si;
            let { posX, posY } = si;
            if (e.key === 'ArrowUp')    posY = clamp(posY - step, 0, 1 - si.height);
            if (e.key === 'ArrowDown')  posY = clamp(posY + step, 0, 1 - si.height);
            if (e.key === 'ArrowLeft')  posX = clamp(posX - step, 0, 1 - si.width);
            if (e.key === 'ArrowRight') posX = clamp(posX + step, 0, 1 - si.width);
            return { ...si, posX, posY };
          })
        );
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItemId, deleteField, duplicateField, placingFieldType, undo, redo, handleSave, multiSelectIds, allSelectedIds]);

  // Track which page is most-visible in the viewport so the jump bar can
  // highlight it. Re-attach when pdfDoc changes (page count changes).
  useEffect(() => {
    if (!pdfDoc || !pdfContainerRef.current) return;
    const pages = pdfContainerRef.current.querySelectorAll('[data-page-index]');
    if (pages.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const idx = Number(entry.target.getAttribute('data-page-index'));
            if (!Number.isNaN(idx)) setCurrentPage(idx);
          }
        }
      },
      { root: pdfContainerRef.current, threshold: [0.5] },
    );
    pages.forEach((p) => observer.observe(p));
    return () => observer.disconnect();
  }, [pdfDoc, pagesRenderedKey]);

  // Dismiss context menu on outside click / Escape.
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

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
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-dark-950">
      {/* ── Right-click context menu ───────────────────────────────── */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] bg-dark-900 border border-dark-700 rounded-lg shadow-xl py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-dark-200 hover:bg-dark-800 hover:text-white transition-colors flex items-center gap-2"
            onClick={() => { duplicateField(contextMenu.itemId); setContextMenu(null); }}
          >
            <Plus className="w-3.5 h-3.5" />
            Duplicate
            <span className="ml-auto text-[10px] text-dark-500">⌘D</span>
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
            onClick={() => { deleteField(contextMenu.itemId); setContextMenu(null); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
            <span className="ml-auto text-[10px] text-dark-500">⌫</span>
          </button>
        </div>
      )}

      {/* ── Header Bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-dark-700 bg-dark-900 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button + breadcrumb */}
          <button
            onClick={() => isQuickSend ? navigate(-1) : navigate(orgPath('/sign/templates'))}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors shrink-0"
            title={isQuickSend ? 'Back to Quick Send' : 'Back to Templates'}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          {isQuickSend && (
            <div className="flex items-center gap-1.5 text-sm text-dark-400 shrink-0">
              <span className="text-rivvra-400 font-medium">Quick Send</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          )}
          {!isQuickSend && (
            <div className="flex items-center gap-1.5 text-sm text-dark-400 shrink-0">
              <span className="text-rivvra-400 font-medium">Templates</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
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
          {!isQuickSend && (
            <button
              type="button"
              onClick={() => setEditingTags((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors ${
                editingTags
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                  : 'bg-dark-800 border-dark-700 text-dark-300 hover:text-white hover:border-dark-600'
              }`}
              title="Edit template tags"
            >
              <TagIcon size={12} />
              {templateTagIds.length > 0 ? `${templateTagIds.length} tag${templateTagIds.length === 1 ? '' : 's'}` : 'Tags'}
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
            <>
              {/* Autosave status — quietly tells the user their work is being persisted. */}
              {(autoSaving || lastSavedAt) && (
                <span
                  className={`flex items-center gap-1 text-[11px] mr-1 ${
                    autoSaving ? 'text-amber-300' : 'text-emerald-400'
                  }`}
                  title={lastSavedAt ? `Last saved ${lastSavedAt.toLocaleTimeString()}` : ''}
                >
                  {autoSaving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  {autoSaving ? 'Saving…' : `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                </span>
              )}
              <button
                onClick={() => {
                  const dirty = JSON.stringify(signItems) !== savedSignItemsRef.current;
                  if (dirty && !window.confirm('You have unsaved changes. Discard them and leave the editor?')) {
                    return;
                  }
                  navigate(orgPath('/sign/templates'));
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-dark-300 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rivvra-600 hover:bg-rivvra-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </>
          )}
        </div>
      </header>

      {/* Tag editor strip — appears below the header when the "Tags" pill in
          the breadcrumb is toggled on. Saved values flow through the same
          updateTemplate path as name/signItems (autosave + manual Save). */}
      {!isQuickSend && editingTags && (
        <div className="px-4 py-3 border-b border-dark-700 bg-dark-900/60 shrink-0">
          <div className="flex items-start gap-3 max-w-3xl">
            <span className="text-[11px] uppercase tracking-wide text-dark-500 mt-2 shrink-0">Tags</span>
            <div className="flex-1">
              <TagPicker
                orgSlug={orgSlug}
                value={templateTagIds}
                onChange={setTemplateTagIds}
                onError={showToast}
              />
            </div>
            <button
              type="button"
              onClick={() => setEditingTags(false)}
              className="text-dark-400 hover:text-white text-xs px-2 py-1"
              title="Close"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile sidebar toggles + dim overlay ────────────────────── */}
      <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-dark-700 bg-dark-900 shrink-0">
        <button
          onClick={() => setMobileSidebar(mobileSidebar === 'fields' ? null : 'fields')}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-dark-200 bg-dark-800 hover:bg-dark-700 rounded-lg"
        >
          <Plus className="w-4 h-4" /> Add Field
        </button>
        <button
          onClick={() => setMobileSidebar(mobileSidebar === 'props' ? null : 'props')}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-dark-200 bg-dark-800 hover:bg-dark-700 rounded-lg"
        >
          <MousePointer className="w-4 h-4" /> {selectedItem ? 'Properties' : 'Fields List'}
        </button>
      </div>
      {mobileSidebar && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/60"
          onClick={() => setMobileSidebar(null)}
        />
      )}

      {/* ── Main body: left sidebar + PDF center + right sidebar ─── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ─── Left Sidebar ─────────────────────────────────────── */}
        <aside className={`w-64 shrink-0 border-r border-dark-700 bg-dark-900 overflow-y-auto ${
          mobileSidebar === 'fields'
            ? 'fixed inset-y-0 left-0 z-40 w-72 md:static md:w-64'
            : 'hidden md:block'
        }`}>
          {/* Field Types */}
          <div className="p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Field Types
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {FIELD_TYPES.map((ft) => {
                const Icon = ft.icon;
                const isPlacing = placingFieldType === ft.type;
                return (
                  <button
                    key={ft.type}
                    draggable="true"
                    onDragStart={(e) => {
                      e.dataTransfer.setData('fieldType', ft.type);
                      e.dataTransfer.effectAllowed = 'copy';
                      setPlacingFieldType(null);
                    }}
                    onClick={() => setPlacingFieldType(isPlacing ? null : ft.type)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors cursor-grab active:cursor-grabbing group ${
                      isPlacing
                        ? 'border-rivvra-500 bg-rivvra-500/10 ring-1 ring-rivvra-500/30'
                        : 'border-dark-700 bg-dark-800 hover:bg-dark-700 hover:border-dark-600'
                    }`}
                  >
                    <Icon
                      className="w-5 h-5 transition-colors"
                      style={{ color: isPlacing ? '#22c55e' : ft.color }}
                    />
                    <span className={`text-[11px] leading-tight text-center ${isPlacing ? 'text-rivvra-400 font-medium' : 'text-gray-400 group-hover:text-gray-200'}`}>
                      {ft.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {placingFieldType && (
              <p className="mt-2 text-[10px] text-rivvra-400 text-center animate-pulse">
                Click on the document to place {fieldMeta(placingFieldType).label}
              </p>
            )}
            <p className="mt-2 text-[10px] text-dark-500 text-center">
              Drag or click to place on document
            </p>
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

            {/* Inline "Add Role" — for non-Quick-Send templates only.
                Prompts for a name, calls POST /sign/roles, prepends to
                the local roles list, and selects it as the active role. */}
            {!isQuickSend && (
              <button
                onClick={async () => {
                  const name = window.prompt('Role name (e.g. "Director")');
                  if (!name || !name.trim()) return;
                  try {
                    const color = ROLE_COLORS[roles.length % ROLE_COLORS.length];
                    const res = await signApi.createRole(orgSlug, { name: name.trim(), color });
                    const created = res.data || res.role || res.item;
                    if (res.success && created?._id) {
                      setRoles((prev) => [...prev, created]);
                      setActiveRoleId(created._id);
                    } else {
                      showToast(res.error || 'Failed to create role', 'error');
                    }
                  } catch (err) {
                    showToast(err?.message || 'Failed to create role', 'error');
                  }
                }}
                className="mt-2 flex items-center gap-1.5 w-full px-3 py-1.5 text-xs text-rivvra-400 hover:text-rivvra-300 hover:bg-dark-800/60 rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add role
              </button>
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
          className={`flex-1 overflow-auto bg-dark-950 p-6 ${placingFieldType ? 'cursor-crosshair' : ''}`}
          onClick={() => { setSelectedItemId(null); if (placingFieldType) setPlacingFieldType(null); }}
          onDragOver={handleContainerDragOver}
          onDragLeave={handleContainerDragLeave}
          onDrop={handleContainerDrop}
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

          {/* Sticky toolbar — page jumper + zoom controls */}
          {pdfDoc && (
            <div className="sticky top-2 z-30 mx-auto mb-3 w-fit flex items-center gap-2 bg-dark-900/90 backdrop-blur border border-dark-700 rounded-full px-3 py-1.5 shadow-lg">
              {pdfDoc.numPages > 1 && (
                <>
                  <button
                    onClick={() => jumpToPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage <= 0}
                    className="text-dark-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1 text-xs text-dark-200">
                    Page
                    <input
                      type="number"
                      min={1}
                      max={pdfDoc.numPages}
                      value={currentPage + 1}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(pdfDoc.numPages, Number(e.target.value) || 1));
                        jumpToPage(n - 1);
                      }}
                      className="w-10 bg-dark-800 border border-dark-600 rounded text-center text-white text-xs py-0.5 focus:outline-none focus:border-rivvra-500"
                    />
                    of {pdfDoc.numPages}
                  </div>
                  <button
                    onClick={() => jumpToPage(Math.min(pdfDoc.numPages - 1, currentPage + 1))}
                    disabled={currentPage >= pdfDoc.numPages - 1}
                    className="text-dark-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="w-px h-4 bg-dark-700 mx-1" />
                </>
              )}
              {/* Zoom controls — clamp [0.5, 2.5]. Click the % to reset. */}
              <button
                onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
                disabled={zoom <= 0.5}
                className="text-dark-300 hover:text-white disabled:opacity-30 text-base font-semibold leading-none w-5"
                title="Zoom out"
              >
                −
              </button>
              <button
                onClick={() => setZoom(1)}
                className="text-xs text-dark-200 hover:text-white tabular-nums w-10"
                title="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))}
                disabled={zoom >= 2.5}
                className="text-dark-300 hover:text-white disabled:opacity-30 text-base font-semibold leading-none w-5"
                title="Zoom in"
              >
                +
              </button>
            </div>
          )}

          {/* PDF page thumbnail strip — quick visual nav for multi-page docs */}
          {pdfDoc && pdfDoc.numPages > 1 && (
            <PdfThumbnailStrip
              pdfDoc={pdfDoc}
              currentPage={currentPage}
              onJump={(idx) => jumpToPage(idx)}
            />
          )}

          {pdfDoc && (
            <div className="max-w-[1200px] mx-auto space-y-4">
              {Array.from({ length: pdfDoc.numPages }, (_, pageIndex) => {
                const pageItems = signItems.filter((si) => si.page === pageIndex);

                return (
                  <PageContainer
                    key={pageIndex}
                    pageIndex={pageIndex}
                    pageItems={pageItems}
                    canvasRefs={canvasRefs}
                    getPageDims={getPageDims}
                    getRoleColor={getRoleColor}
                    getRoleName={getRoleName}
                    selectedItemId={selectedItemId}
                    setSelectedItemId={setSelectedItemId}
                    multiSelectIds={multiSelectIds}
                    setMultiSelectIds={setMultiSelectIds}
                    setContextMenu={setContextMenu}
                    handlePageDragOver={handlePageDragOver}
                    handlePageDrop={handlePageDrop}
                    handlePageClick={handlePageClick}
                    placingFieldType={placingFieldType}
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
        <aside className={`w-64 shrink-0 border-l border-dark-700 bg-dark-900 overflow-y-auto ${
          mobileSidebar === 'props'
            ? 'fixed inset-y-0 right-0 z-40 w-72 md:static md:w-64'
            : 'hidden md:block'
        }`}>
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

              {/* Conditional required — only required if some other (usually
                  checkbox) field on the document is filled. Useful for
                  branches like "If 'I agree to terms' is checked, then a
                  signature is required". When selected, the regular
                  Required toggle is implicitly active but its enforcement
                  is gated on the dependent field. */}
              {selectedItem.required && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Required only if
                    <span className="text-gray-600 font-normal"> (optional)</span>
                  </label>
                  <select
                    value={selectedItem.requiredIf || ''}
                    onChange={(e) =>
                      updateItemProp(selectedItem.id, 'requiredIf', e.target.value || null)
                    }
                    className="w-full px-3 py-2 text-xs text-white bg-dark-800 border border-dark-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-rivvra-500/50"
                  >
                    <option value="">Always required</option>
                    {signItems
                      .filter((it) => it.id !== selectedItem.id)
                      .map((it) => {
                        const m = fieldMeta(it.type);
                        const lbl = it.label || `${m.label} (page ${(it.page || 0) + 1})`;
                        return (
                          <option key={it.id} value={it.id}>
                            {lbl}{it.type === 'checkbox' ? ' — when checked' : ' — when filled'}
                          </option>
                        );
                      })}
                  </select>
                </div>
              )}

              {/* Auto-fill toggle for Date / Name fields. The renderer was
                  already auto-filling these from signer profile, but it was
                  invisible to template builders — now they can see (and turn
                  off) the behavior per field. */}
              {(selectedItem.type === 'date' || selectedItem.type === 'name') && (
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-500">
                    {selectedItem.type === 'date'
                      ? 'Auto-fill with signing date'
                      : 'Auto-fill with signer name'}
                  </label>
                  <button
                    onClick={() =>
                      updateItemProp(
                        selectedItem.id,
                        'autoFill',
                        selectedItem.autoFill === false ? true : false,
                      )
                    }
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      selectedItem.autoFill !== false ? 'bg-rivvra-600' : 'bg-dark-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                        selectedItem.autoFill !== false ? 'translate-x-[18px]' : 'translate-x-[3px]'
                      }`}
                    />
                  </button>
                </div>
              )}

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
                  <option value="right">Right</option>
                  <option value="justify">Justify</option>
                </select>
              </div>

              {/* Validation rules — text-ish field types only. Stored on
                  the signItem and enforced by the public signing page at
                  submit time. */}
              {['text', 'multiline', 'name', 'email', 'phone', 'company'].includes(selectedItem.type) && (
                <div className="pt-3 border-t border-dark-700 space-y-2">
                  <h4 className="text-xs text-gray-500">Validation</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-600 mb-1">Min length</label>
                      <input
                        type="number"
                        min={0}
                        value={selectedItem.minLength ?? ''}
                        onChange={(e) =>
                          updateItemProp(
                            selectedItem.id,
                            'minLength',
                            e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                          )
                        }
                        placeholder="—"
                        className="w-full px-2 py-1 text-xs text-white bg-dark-800 border border-dark-700 rounded focus:outline-none focus:ring-1 focus:ring-rivvra-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-600 mb-1">Max length</label>
                      <input
                        type="number"
                        min={0}
                        value={selectedItem.maxLength ?? ''}
                        onChange={(e) =>
                          updateItemProp(
                            selectedItem.id,
                            'maxLength',
                            e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                          )
                        }
                        placeholder="—"
                        className="w-full px-2 py-1 text-xs text-white bg-dark-800 border border-dark-700 rounded focus:outline-none focus:ring-1 focus:ring-rivvra-500/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-1">Pattern (regex)</label>
                    <input
                      type="text"
                      value={selectedItem.pattern ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        // Validate compile so a bad regex doesn't break the signing page.
                        if (raw) {
                          try { new RegExp(raw); } catch { /* keep raw — show feedback below */ }
                        }
                        updateItemProp(selectedItem.id, 'pattern', raw || null);
                      }}
                      placeholder="e.g. ^[A-Z]{2}\\d{6}$"
                      className="w-full px-2 py-1 text-xs text-white bg-dark-800 border border-dark-700 rounded font-mono focus:outline-none focus:ring-1 focus:ring-rivvra-500/50"
                    />
                    {selectedItem.pattern && (() => {
                      try { new RegExp(selectedItem.pattern); return null; } catch (e) {
                        return <p className="text-[10px] text-red-400 mt-1">Invalid regex: {e.message}</p>;
                      }
                    })()}
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-600 mb-1">Custom error message</label>
                    <input
                      type="text"
                      value={selectedItem.patternMessage ?? ''}
                      onChange={(e) =>
                        updateItemProp(selectedItem.id, 'patternMessage', e.target.value || null)
                      }
                      placeholder="Shown if pattern doesn't match"
                      className="w-full px-2 py-1 text-xs text-white bg-dark-800 border border-dark-700 rounded focus:outline-none focus:ring-1 focus:ring-rivvra-500/50"
                    />
                  </div>
                </div>
              )}

              {/* Position — editable so users can pixel-tune placement
                  without having to drag. Values are stored as fractions
                  (0–1) of page dimensions; the inputs show / accept
                  percentages and we clamp on commit so a typo can't
                  push a field off-page. */}
              <div className="pt-3 border-t border-dark-700">
                <h4 className="text-xs text-gray-500 mb-2">Position</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { key: 'posX',   label: 'X', maxFn: () => Math.max(0, 1 - (selectedItem.width || 0)) },
                    { key: 'posY',   label: 'Y', maxFn: () => Math.max(0, 1 - (selectedItem.height || 0)) },
                    { key: 'width',  label: 'W', minFn: () => 0.02, maxFn: () => Math.max(0.02, 1 - (selectedItem.posX || 0)) },
                    { key: 'height', label: 'H', minFn: () => 0.01, maxFn: () => Math.max(0.01, 1 - (selectedItem.posY || 0)) },
                  ].map((spec) => (
                    <div key={spec.key} className="bg-dark-800 rounded px-2 py-1 flex items-center gap-1">
                      <span className="text-gray-600 w-3">{spec.label}</span>
                      <input
                        type="number"
                        step="0.1"
                        min={(spec.minFn ? spec.minFn() : 0) * 100}
                        max={spec.maxFn() * 100}
                        value={((selectedItem[spec.key] ?? 0) * 100).toFixed(1)}
                        onChange={(e) => {
                          const pct = Number(e.target.value);
                          if (Number.isNaN(pct)) return;
                          const min = spec.minFn ? spec.minFn() : 0;
                          const max = spec.maxFn();
                          const fraction = clamp(pct / 100, min, max);
                          updateItemProp(selectedItem.id, spec.key, fraction);
                        }}
                        className="w-full bg-transparent text-white text-xs focus:outline-none"
                      />
                      <span className="text-gray-600">%</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 bg-dark-800 rounded px-2 py-1.5 text-xs text-gray-400">
                  <span className="text-gray-600">Page: </span>
                  {selectedItem.page + 1}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => {
                  if (window.confirm('Delete this field? You can restore it with Cmd+Z.')) {
                    deleteField(selectedItem.id);
                  }
                }}
                className="flex items-center justify-center gap-2 w-full px-3 py-2.5 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Field
              </button>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="px-4 pt-4 pb-2 border-b border-dark-800">
                <p className="text-xs font-semibold text-dark-400 uppercase tracking-wide">All Fields</p>
                <p className="text-[11px] text-dark-500 mt-0.5">
                  {signItems.length === 0
                    ? 'Drag a field from the left to begin.'
                    : `${signItems.length} field${signItems.length === 1 ? '' : 's'} placed. Click to select & jump.`}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {signItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
                    <div className="w-10 h-10 rounded-xl bg-dark-800 border border-dark-700 flex items-center justify-center mb-2">
                      <MousePointer className="w-4 h-4 text-gray-600" />
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Drag a field type from the left sidebar onto a page, or click a field type then click on the page.
                    </p>
                  </div>
                ) : (
                  Array.from(new Set(signItems.map((i) => i.page))).sort((a, b) => a - b).map((pIdx) => (
                    <div key={pIdx} className="mb-2">
                      <button
                        onClick={() => jumpToPage(pIdx)}
                        className="w-full text-left px-4 py-1 text-[10px] uppercase tracking-wider font-semibold text-dark-500 hover:text-dark-300"
                      >
                        Page {pIdx + 1}
                      </button>
                      {signItems.filter((i) => i.page === pIdx).map((item) => {
                        const im = fieldMeta(item.type);
                        const ItemIcon = im.icon;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setSelectedItemId(item.id);
                              jumpToPage(item.page);
                            }}
                            className="w-full px-4 py-1.5 flex items-center gap-2 text-left text-xs text-dark-300 hover:bg-dark-800/60 transition-colors"
                          >
                            <span
                              className="inline-block w-1.5 h-3 rounded"
                              style={{ backgroundColor: getRoleColor(item.roleId) }}
                            />
                            <ItemIcon className="w-3 h-3" style={{ color: getRoleColor(item.roleId) }} />
                            <span className="truncate flex-1">{item.label || im.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
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
                {/* Quick presets — most signing flows want one of these
                    rather than typing a date. Sets validity = today + N days. */}
                <div className="flex gap-1.5 mt-1.5">
                  {[
                    { label: '7 days', days: 7 },
                    { label: '14 days', days: 14 },
                    { label: '30 days', days: 30 },
                    { label: '90 days', days: 90 },
                  ].map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + preset.days);
                        setSendValidity(d.toISOString().slice(0, 10));
                      }}
                      className="px-2 py-1 text-[11px] text-dark-400 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-dark-400 mb-1 block">
                  CC recipients (optional)
                </label>
                <input
                  type="text"
                  value={sendCcEmails}
                  onChange={e => setSendCcEmails(e.target.value)}
                  placeholder="comma-separated emails for completion notifications"
                  className="w-full px-3 py-2 text-sm text-white bg-dark-900 border border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rivvra-500/50 placeholder:text-dark-500"
                />
                <p className="text-[11px] text-dark-500 mt-1">CCs receive the completion / refused / cancelled notice. They do not get the signing link.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-dark-400 mb-1 block">
                  Send reminder every
                </label>
                <select
                  value={sendReminderDays}
                  onChange={e => setSendReminderDays(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm text-white bg-dark-900 border border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rivvra-500/50"
                >
                  <option value={0}>Don't send reminders</option>
                  <option value={1}>1 day</option>
                  <option value={3}>3 days</option>
                  <option value={7}>7 days (recommended)</option>
                  <option value={14}>14 days</option>
                </select>
              </div>
              <div className="bg-dark-900 rounded-lg p-3 border border-dark-700">
                <p className="text-xs text-dark-400 mb-2">Summary</p>
                <p className="text-sm text-white">{templateName}</p>
                <p className="text-xs text-dark-500 mt-1">{quickSendSigners.length} signer(s) &middot; {signItems.length} field(s) placed &middot; Sequential signing{sendReminderDays > 0 ? ` · Reminders every ${sendReminderDays}d` : ''}</p>
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

// ===========================================================================
// PdfThumbnailStrip — horizontally scrollable mini-canvases for each page.
// Click a thumbnail to jump the main viewport to that page. Renders each
// thumbnail once at 100px target width via pdf.js, cached on a ref so we
// don't re-render on every parent re-render.
// ===========================================================================
function PdfThumbnailStrip({ pdfDoc, currentPage, onJump }) {
  const canvasRefs = useRef({});
  const renderedRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    async function renderAll() {
      for (let i = 0; i < pdfDoc.numPages; i++) {
        if (cancelled) return;
        if (renderedRef.current.has(i)) continue;
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;
        try {
          const page = await pdfDoc.getPage(i + 1);
          const baseVp = page.getViewport({ scale: 1 });
          const targetW = 100;
          const scale = targetW / baseVp.width;
          const vp = page.getViewport({ scale });
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.floor(vp.width * dpr);
          canvas.height = Math.floor(vp.height * dpr);
          canvas.style.width = `${vp.width}px`;
          canvas.style.height = `${vp.height}px`;
          const ctx = canvas.getContext('2d');
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          renderedRef.current.add(i);
        } catch (e) {
          /* ignore — main viewport handles errors */
        }
      }
    }
    renderAll();
    return () => { cancelled = true; };
  }, [pdfDoc]);

  return (
    <div className="max-w-[1200px] mx-auto mb-3 overflow-x-auto pb-2">
      <div className="flex gap-2 px-1">
        {Array.from({ length: pdfDoc.numPages }, (_, i) => (
          <button
            key={i}
            onClick={() => onJump(i)}
            className={`shrink-0 flex flex-col items-center gap-0.5 transition-opacity ${
              i === currentPage ? 'opacity-100' : 'opacity-60 hover:opacity-100'
            }`}
            title={`Page ${i + 1}`}
          >
            <canvas
              ref={(el) => { canvasRefs.current[i] = el; }}
              className={`bg-white rounded shadow ${
                i === currentPage ? 'ring-2 ring-rivvra-500' : 'ring-1 ring-dark-700'
              }`}
            />
            <span className={`text-[10px] tabular-nums ${i === currentPage ? 'text-rivvra-300' : 'text-dark-500'}`}>
              {i + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PageContainer({
  pageIndex,
  pageItems,
  canvasRefs,
  getPageDims,
  getRoleColor,
  getRoleName,
  selectedItemId,
  setSelectedItemId,
  multiSelectIds,
  setMultiSelectIds,
  setContextMenu,
  handlePageDragOver,
  handlePageDrop,
  handlePageClick,
  placingFieldType,
  startFieldDrag,
  startFieldResize,
  pagesRenderedKey,
}) {
  // Re-compute dims whenever pagesRenderedKey changes (canvas sizes updated)
  // eslint-disable-next-line no-unused-vars
  const dims = useMemo(() => getPageDims(pageIndex), [getPageDims, pageIndex, pagesRenderedKey]);

  return (
    <div
      data-page-index={pageIndex}
      className={`relative bg-white rounded-lg shadow-lg ${placingFieldType ? 'cursor-crosshair' : ''}`}
      onDragOver={handlePageDragOver}
      onDrop={(e) => handlePageDrop(e, pageIndex)}
      onClick={(e) => {
        if (placingFieldType) {
          handlePageClick(e, pageIndex);
        } else {
          e.stopPropagation();
          setSelectedItemId(null);
          setMultiSelectIds([]);
        }
      }}
    >
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
            getRoleName={getRoleName}
            isSelected={item.id === selectedItemId}
            isMultiSelected={multiSelectIds && multiSelectIds.includes(item.id)}
            setSelectedItemId={setSelectedItemId}
            setMultiSelectIds={setMultiSelectIds}
            startFieldDrag={startFieldDrag}
            startFieldResize={startFieldResize}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedItemId(item.id);
              setContextMenu({ x: e.clientX, y: e.clientY, itemId: item.id });
            }}
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
  getRoleName,
  isSelected,
  isMultiSelected,
  setSelectedItemId,
  setMultiSelectIds,
  startFieldDrag,
  startFieldResize,
  onContextMenu,
}) {
  const meta = fieldMeta(item.type);
  const Icon = meta.icon;
  const roleColor = getRoleColor(item.roleId);

  const pxLeft = item.posX * dims.width;
  const pxTop = item.posY * dims.height;
  const pxWidth = item.width * dims.width;
  const pxHeight = item.height * dims.height;

  // Lay out the box itself as a thin dashed outline with no body fill, so
  // a field placed across a fill-in-the-blank underline doesn't visually
  // smother the surrounding document text. The label/icon used to sit
  // INSIDE the box and forced the user to either oversize the field
  // (overlapping adjacent paragraphs) or undersize it (saving an unreadable
  // sliver). The label now floats just above the box's top-left edge as
  // a compact chip — visible without expanding the field's footprint.
  const labelText = item.label || (getRoleName && item.roleId
    ? `${getRoleName(item.roleId)} · ${meta.label}`
    : meta.label);

  return (
    <div
      className={`absolute pointer-events-auto group cursor-move select-none transition-shadow ${
        isSelected
          ? 'ring-1 ring-offset-1 ring-blue-500 z-10'
          : isMultiSelected
            ? 'ring-1 ring-offset-1 ring-blue-400/70 z-10'
            : 'hover:ring-1 hover:ring-white/30 z-[5]'
      }`}
      style={{
        left: pxLeft,
        top: pxTop,
        // Min clamps keep tiny fields grabbable for drag/resize without
        // visually overpowering the document — restored to the long-standing
        // 36×20 that matches the convention users rely on (place a thin box
        // *above* the underline; the signer/PDF grow it downward so text
        // lands on the underline beneath).
        width: Math.max(pxWidth, 36),
        height: Math.max(pxHeight, 20),
        // Inset shadow keeps the visible outline strictly inside the
        // bounding box.
        boxShadow: `inset 0 0 0 1px ${roleColor}`,
        backgroundColor: isSelected ? `${roleColor}14` : 'transparent',
      }}
      onMouseDown={(e) => startFieldDrag(e, item.id)}
      onClick={(e) => {
        e.stopPropagation();
        if (e.shiftKey && setMultiSelectIds) {
          // Shift+click toggles this field in/out of the multi-selection
          // without changing the primary selection. Lets the user pick a
          // group for bulk delete.
          setMultiSelectIds((prev) =>
            prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id],
          );
        } else {
          // Plain click — single selection, clear any multi-select extras.
          setSelectedItemId(item.id);
          if (setMultiSelectIds) setMultiSelectIds([]);
        }
      }}
      onContextMenu={onContextMenu}
    >
      {/* Label chip — invisible at idle, fully shown on hover or selection.
          When the box is tall enough to comfortably hold the chip (>=22px),
          render INSIDE the top-left corner so it doesn't spill into the
          document line above. Otherwise float just above the box. */}
      {(() => {
        const visibleH = Math.max(pxHeight, 20);
        const chipInsideBox = visibleH >= 22;
        return (
          <div
            className={`absolute left-0 flex items-center gap-1 px-1.5 py-0.5 rounded shadow-sm pointer-events-none whitespace-nowrap transition-opacity ${
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            style={{
              top: chipInsideBox ? 1 : -16,
              backgroundColor: 'rgba(255, 255, 255, 0.96)',
              border: `1px solid ${roleColor}`,
              maxWidth: 220,
            }}
          >
            <GripVertical
              className="w-2.5 h-2.5 shrink-0 opacity-50"
              style={{ color: roleColor }}
            />
            <Icon className="w-2.5 h-2.5 shrink-0" style={{ color: roleColor }} />
            <span
              className="text-[9px] font-medium leading-none truncate"
              style={{ color: roleColor }}
            >
              {labelText}
            </span>
          </div>
        );
      })()}

      {/* Resize handles — visible whenever the field is selected or hovered.
          Three handles cover the common cases:
            * Right edge (E)  — width only
            * Bottom edge (S) — height only
            * SE corner       — both at once
          Each is a small filled square in the role color, large enough
          to grab without precise aim. */}
      {(() => {
        const handleVisible = isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';
        const handleStyle = {
          backgroundColor: roleColor,
          border: '1px solid white',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
        };
        return (
          <>
            {/* Right-edge handle — width only */}
            <div
              data-resize="true"
              title="Drag to resize width"
              className={`absolute right-[-4px] top-1/2 -translate-y-1/2 w-2 h-5 rounded cursor-ew-resize ${handleVisible} transition-opacity z-20`}
              style={handleStyle}
              onMouseDown={(e) => startFieldResize(e, item.id, 'x')}
            />
            {/* Bottom-edge handle — height only */}
            <div
              data-resize="true"
              title="Drag to resize height"
              className={`absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-5 h-2 rounded cursor-ns-resize ${handleVisible} transition-opacity z-20`}
              style={handleStyle}
              onMouseDown={(e) => startFieldResize(e, item.id, 'y')}
            />
            {/* SE corner handle — both axes */}
            <div
              data-resize="true"
              title="Drag to resize"
              className={`absolute right-[-5px] bottom-[-5px] w-3 h-3 rounded cursor-se-resize ${handleVisible} transition-opacity z-20`}
              style={handleStyle}
              onMouseDown={(e) => startFieldResize(e, item.id, 'both')}
            />
          </>
        );
      })()}
    </div>
  );
}
