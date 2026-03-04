import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import contactsApi from '../../utils/contactsApi';
import ComboSelect from '../../components/ComboSelect';
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Search, ChevronDown, Star, Building2, User, Phone,
  Mail, Briefcase, Trophy, X, GripVertical, Filter, Loader2,
  IndianRupee, ExternalLink,
} from 'lucide-react';

// ── Star Rating ──────────────────────────────────────────────────────────
function EvalStars({ value = 0, onChange, size = 14 }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3].map(i => (
        <Star
          key={i}
          size={size}
          className={`cursor-pointer transition-colors ${i <= value ? 'text-amber-400 fill-amber-400' : 'text-dark-600'}`}
          onClick={e => { e.stopPropagation(); onChange?.(i === value ? 0 : i); }}
        />
      ))}
    </div>
  );
}

// ── Filter Dropdown ──────────────────────────────────────────────────────
function FilterChip({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
          value ? 'border-rivvra-500/50 bg-rivvra-500/10 text-rivvra-400' : 'border-dark-600 bg-dark-800 text-dark-300 hover:border-dark-500'
        }`}
      >
        {selected?.label || label}
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-dark-800 border border-dark-600 rounded-lg shadow-xl py-1 min-w-[160px]">
            <button onClick={() => { onChange(''); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-dark-300 hover:bg-dark-700">
              All
            </button>
            {options.map(o => (
              <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-dark-700 ${o.value === value ? 'text-rivvra-400' : 'text-dark-200'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Kanban Card ──────────────────────────────────────────────────────────
function KanbanCard({ opp, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: opp._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onClick(opp)}
      className="bg-dark-800 border border-dark-700 rounded-lg p-3 cursor-pointer hover:border-dark-500 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dark-100 truncate">{opp.name}</p>
          {opp.companyName && (
            <p className="text-xs text-dark-400 flex items-center gap-1 mt-0.5">
              <Building2 size={10} /> {opp.companyName}
            </p>
          )}
        </div>
        <div {...attributes} {...listeners} className="text-dark-600 hover:text-dark-400 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={14} />
        </div>
      </div>

      {opp.expectedRole && (
        <p className="text-xs text-emerald-400 mt-1.5 truncate">{opp.expectedRole}</p>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {opp.expectedRevenue && (
            <span className="text-xs text-amber-400 flex items-center gap-0.5">
              <IndianRupee size={10} /> {opp.expectedRevenue}
            </span>
          )}
          <EvalStars value={opp.evaluation || 0} size={10} />
        </div>
        {opp.salespersonName && (
          <span className="text-[10px] text-dark-500 truncate max-w-[80px]">{opp.salespersonName?.split(' ')[0]}</span>
        )}
      </div>

      {opp.isConverted && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 rounded px-1.5 py-0.5 w-fit">
          <Trophy size={9} /> Converted
        </div>
      )}
    </div>
  );
}

// ── Kanban Card Overlay (while dragging) ─────────────────────────────────
function KanbanCardOverlay({ opp }) {
  return (
    <div className="bg-dark-800 border border-rivvra-500/50 rounded-lg p-3 shadow-xl w-[260px]">
      <p className="text-sm font-medium text-dark-100 truncate">{opp.name}</p>
      {opp.companyName && <p className="text-xs text-dark-400 mt-0.5">{opp.companyName}</p>}
    </div>
  );
}

// ── Kanban Column ────────────────────────────────────────────────────────
function KanbanColumn({ stage, opportunities, totalCount, totalRevenue, onCardClick }) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: stage._id });
  const items = opportunities.map(o => o._id);
  return (
    <div ref={setDropRef} className={`flex-shrink-0 w-[280px] flex flex-col max-h-full ${isOver ? 'ring-1 ring-rivvra-500/40 rounded-lg' : ''}`}>
      <div className="bg-dark-850 border border-dark-700 rounded-t-lg px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-dark-200 uppercase tracking-wider">{stage.name}</h3>
            <span className="text-[10px] bg-dark-700 text-dark-400 rounded-full px-1.5 py-0.5">{totalCount}</span>
          </div>
          {stage.isWonStage && <Trophy size={12} className="text-amber-400" />}
        </div>
        {totalRevenue > 0 && (
          <p className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-0.5">
            <IndianRupee size={9} /> {totalRevenue.toLocaleString('en-IN')}
          </p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto bg-dark-900/50 border-x border-b border-dark-700 rounded-b-lg p-2 space-y-2">
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {opportunities.map(opp => (
            <KanbanCard key={opp._id} opp={opp} onClick={onCardClick} />
          ))}
        </SortableContext>
        {totalCount > opportunities.length && (
          <p className="text-center text-[10px] text-dark-500 py-1">+{totalCount - opportunities.length} more</p>
        )}
        {opportunities.length === 0 && (
          <p className="text-center text-xs text-dark-600 py-6">No opportunities</p>
        )}
      </div>
    </div>
  );
}

// ── Create Opportunity Modal ─────────────────────────────────────────────
function CreateModal({ stages, orgSlug, onClose, onCreate }) {
  const [form, setForm] = useState({
    name: '', contactId: '', contactName: '', contactCompanyId: '', companyName: '',
    contactEmail: '', contactPhone: '',
    expectedRole: '', expectedRevenue: '', requirementType: '', stageId: stages[0]?._id || '',
  });
  const [loading, setLoading] = useState(false);
  const [individualContacts, setIndividualContacts] = useState([]);
  const [companyContacts, setCompanyContacts] = useState([]);

  // Fetch contacts for dropdowns on mount
  useEffect(() => {
    contactsApi.list(orgSlug, { type: 'individual', limit: 200 })
      .then(res => { if (res.success) setIndividualContacts(res.contacts || []); })
      .catch(() => {});
    contactsApi.listCompanies(orgSlug)
      .then(res => { if (res.success) setCompanyContacts(res.companies || []); })
      .catch(() => {});
  }, [orgSlug]);

  // Build POC options — "Company, Contact Name" format (like Odoo)
  const pocOptions = individualContacts.map(c => ({
    _id: c._id,
    name: c.parentCompanyName ? `${c.parentCompanyName}, ${c.name}` : c.name,
  }));

  // When POC is selected/changed
  const handlePocChange = (id, displayName) => {
    if (id) {
      // Existing contact — auto-fill company + contact details
      const contact = individualContacts.find(c => c._id === id);
      setForm(f => ({
        ...f,
        contactId: id,
        contactName: contact?.name || displayName,
        contactCompanyId: contact?.parentCompanyId || '',
        companyName: contact?.parentCompanyName || '',
        contactEmail: contact?.email || f.contactEmail,
        contactPhone: contact?.phone || f.contactPhone,
      }));
    } else {
      // Free-text (create new) — displayName is the raw typed text
      setForm(f => ({ ...f, contactId: '', contactName: displayName, contactCompanyId: '', companyName: '' }));
    }
  };

  // POC display value
  const pocDisplayValue = form.contactId
    ? (form.companyName ? `${form.companyName}, ${form.contactName}` : form.contactName)
    : form.contactName;

  const handleCompanyChange = (id, name) => {
    setForm(f => ({ ...f, contactCompanyId: id, companyName: name }));
  };

  const isCreatingNew = !form.contactId && form.contactName.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onCreate(form);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <h2 className="text-base font-semibold text-dark-100">New Opportunity</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-dark-200"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-dark-400 mb-1">Opportunity Name *</label>
            <input
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
              placeholder="e.g., Azure Data Architect - Robosoft"
              required autoFocus
            />
          </div>

          {/* Customer's POC — single searchable field showing "Company, Contact Name" */}
          <div>
            <label className="block text-xs text-dark-400 mb-1">
              Customer&apos;s POC *
            </label>
            <ComboSelect
              value={form.contactId}
              displayValue={pocDisplayValue}
              options={pocOptions}
              onChange={handlePocChange}
              placeholder="Search by company or contact name..."
            />
            {form.contactId && form.companyName && (
              <p className="mt-1 text-[10px] text-dark-500 flex items-center gap-1">
                <Building2 size={10} /> {form.companyName} &middot; <User size={10} /> {form.contactName}
              </p>
            )}
          </div>

          {/* When creating new contact — show expanded fields */}
          {isCreatingNew && (
            <div className="bg-dark-900/50 border border-dark-700 rounded-lg p-3 space-y-3">
              <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">New Contact Details</p>
              <div>
                <label className="block text-xs text-dark-400 mb-1">Contact Name</label>
                <input
                  value={form.contactName}
                  onChange={e => setForm({ ...form, contactName: e.target.value })}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-xs text-dark-400 mb-1">Company *</label>
                <ComboSelect
                  value={form.contactCompanyId}
                  displayValue={form.companyName}
                  options={companyContacts}
                  onChange={handleCompanyChange}
                  placeholder="Search or type company name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-dark-400 mb-1">Email</label>
                  <input
                    value={form.contactEmail}
                    onChange={e => setForm({ ...form, contactEmail: e.target.value })}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
                    placeholder="email@company.com"
                    type="email"
                  />
                </div>
                <div>
                  <label className="block text-xs text-dark-400 mb-1">Phone</label>
                  <input
                    value={form.contactPhone}
                    onChange={e => setForm({ ...form, contactPhone: e.target.value })}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
                    placeholder="+91..."
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-dark-400 mb-1">Expected Role</label>
              <input
                value={form.expectedRole} onChange={e => setForm({ ...form, expectedRole: e.target.value })}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
                placeholder="e.g., Backend Developer"
              />
            </div>
            <div>
              <label className="block text-xs text-dark-400 mb-1">Requirement Type</label>
              <select
                value={form.requirementType} onChange={e => setForm({ ...form, requirementType: e.target.value })}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
              >
                <option value="">Not set</option>
                <option value="Staff Augmentation">Staff Augmentation</option>
                <option value="Project Based">Project Based</option>
                <option value="Full-time Hire">Full-time Hire</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-dark-400 mb-1">Expected Revenue</label>
              <input
                value={form.expectedRevenue} onChange={e => setForm({ ...form, expectedRevenue: e.target.value })}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
                placeholder="e.g., 500000"
                type="number"
              />
            </div>
            <div>
              <label className="block text-xs text-dark-400 mb-1">Stage</label>
              <select
                value={form.stageId} onChange={e => setForm({ ...form, stageId: e.target.value })}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
              >
                {stages.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 transition-colors">Cancel</button>
            <button type="submit" disabled={loading || !form.name.trim() || !form.contactName.trim() || (isCreatingNew && !form.companyName.trim())}
              className="px-4 py-2 text-sm bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 disabled:opacity-50 flex items-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />} Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function CrmPipeline() {
  const { orgSlug: slug } = useOrg();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [kanban, setKanban] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [salespersons, setSalespersons] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [activeOpp, setActiveOpp] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchKanban = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (salespersonId) params.salespersonId = salespersonId;
      const res = await crmApi.getKanban(slug, params);
      if (res.success) setKanban(res.kanban || []);
    } catch (err) {
      addToast('Failed to load pipeline', 'error');
    } finally {
      setLoading(false);
    }
  }, [slug, search, salespersonId]);

  useEffect(() => { fetchKanban(); }, [fetchKanban]);

  useEffect(() => {
    crmApi.listSalespersons(slug).then(res => {
      if (res.success) setSalespersons(res.salespersons || []);
    }).catch(() => {});
  }, [slug]);

  // ── DnD handlers ──
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
    for (const col of kanban) {
      const found = col.opportunities.find(o => o._id === event.active.id);
      if (found) { setActiveOpp(found); break; }
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveOpp(null);
    if (!over || active.id === over.id) return;

    // Find destination stage
    let destStageId = null;
    for (const col of kanban) {
      if (col.stage._id === over.id || col.opportunities.some(o => o._id === over.id)) {
        destStageId = col.stage._id;
        break;
      }
    }
    // Also check if dropped on stage header
    if (!destStageId) {
      const stageCol = kanban.find(c => c.stage._id === over.id);
      if (stageCol) destStageId = stageCol.stage._id;
    }

    if (!destStageId) return;

    // Find source
    let sourceStageId = null;
    for (const col of kanban) {
      if (col.opportunities.some(o => o._id === active.id)) {
        sourceStageId = col.stage._id;
        break;
      }
    }

    if (sourceStageId === destStageId) return;

    // Optimistic update
    setKanban(prev => {
      const next = prev.map(col => ({
        ...col,
        opportunities: col.opportunities.filter(o => o._id !== active.id),
        totalCount: col.stage._id === sourceStageId ? col.totalCount - 1 : col.totalCount,
      }));
      const oppToMove = prev.flatMap(c => c.opportunities).find(o => o._id === active.id);
      if (oppToMove) {
        const destCol = next.find(c => c.stage._id === destStageId);
        if (destCol) {
          destCol.opportunities.unshift({ ...oppToMove, stageId: destStageId });
          destCol.totalCount++;
        }
      }
      return next;
    });

    try {
      const res = await crmApi.moveStage(slug, active.id, destStageId);
      if (res.jobCreated) {
        fetchKanban();
        addToast(`Won! Job Position "${res.jobCreated.jobName}" created in ATS`, 'success');
      } else if (res.isWonStage) {
        addToast('Opportunity marked as Won!', 'success');
      }
    } catch {
      addToast('Failed to move', 'error');
      fetchKanban();
    }
  };

  const handleCreate = async (data) => {
    const res = await crmApi.createOpportunity(slug, data);
    if (res.success) {
      addToast('Opportunity created', 'success');
      fetchKanban();
    }
  };

  const handleCardClick = (opp) => {
    navigate(`/org/${slug}/crm/opportunities/${opp._id}`);
  };

  const stages = kanban.map(c => c.stage);

  if (!slug || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-dark-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-800">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-dark-100">Pipeline</h1>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-1.5 text-xs bg-dark-800 border border-dark-700 rounded-lg text-dark-200 focus:border-rivvra-500 focus:outline-none w-48"
            />
          </div>
          <FilterChip
            label="Salesperson"
            value={salespersonId}
            options={salespersons.map(s => ({ value: s._id, label: s.name || 'Unknown' }))}
            onChange={setSalespersonId}
          />
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 transition-colors"
        >
          <Plus size={14} /> New Opportunity
        </button>
      </div>

      {/* Kanban Board */}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-3">
          <div className="flex gap-3 h-full">
            {kanban.map(col => (
              <SortableContext key={col.stage._id} items={[col.stage._id]}>
                <KanbanColumn
                  stage={col.stage}
                  opportunities={col.opportunities}
                  totalCount={col.totalCount}
                  totalRevenue={col.totalRevenue}
                  onCardClick={handleCardClick}
                />
              </SortableContext>
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeOpp && <KanbanCardOverlay opp={activeOpp} />}
        </DragOverlay>
      </DndContext>

      {/* Create modal */}
      {showCreate && <CreateModal stages={stages} orgSlug={slug} onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
    </div>
  );
}
