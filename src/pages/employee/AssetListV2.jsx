import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import assetApi from '../../utils/assetApi';
import employeeApi from '../../utils/employeeApi';
import {
  Plus, Loader2, Package, X, Monitor, Headphones, Briefcase, Box,
  User, ArrowRight, Check, Undo2, AlertTriangle, RefreshCw,
} from 'lucide-react';
import {
  PageHeader, Panel, Stat, Chip, Button, Input, Textarea, Select, SearchInput,
  Modal, EmptyState, PageSpinner, Callout, Checkbox,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Assets are physical property assigned to named people, so `handleAdd` both
// creates the record and — when an employee is picked — immediately assigns it.
// Everything from `const navigate = useNavigate()` through the end of `handleAdd`
// is spliced in byte-identically, including the two-call create-then-assign
// sequence and the server-side debounced employee search that replaced a
// limit:100 fetch which used to hide anyone past the first 100 alphabetically.
//
// Not triggered: create, assign.
// ─────────────────────────────────────────────────────────────────────────────

// Status carries meaning here, so each one gets a distinct Chip tone rather
// than a hand-rolled colour pair: available reads as good, assigned as in-flight,
// lost as a problem, and returned/retired as inert.
const STATUS_CONFIG = {
  available:  { label: 'Available',  tone: 'brand'   },
  assigned:   { label: 'Assigned',   tone: 'info'    },
  returned:   { label: 'Returned',   tone: 'neutral' },
  lost:       { label: 'Lost',       tone: 'danger'  },
  retired:    { label: 'Retired',    tone: 'neutral' },
};

const CONDITION_CONFIG = {
  new:     { label: 'New',     color: 'var(--brand-ink)'  },
  good:    { label: 'Good',    color: 'var(--info)'       },
  fair:    { label: 'Fair',    color: 'var(--warn-ink)'   },
  damaged: { label: 'Damaged', color: 'var(--danger)'     },
  lost:    { label: 'Lost',    color: 'var(--danger)'     },
};

// Statuses that can go back into stock. 'available' is excluded because it is
// already there, and 'assigned' because the server refuses it — the same guard
// the single Make Available action uses.
const RESTOCKABLE = new Set(['returned', 'retired', 'lost']);

const TYPE_ICONS = {
  laptop: Monitor,
  headphone: Headphones,
  headphones: Headphones,
  bag: Briefcase,
};

function getTypeIcon(name) {
  const key = (name || '').toLowerCase();
  for (const [k, Icon] of Object.entries(TYPE_ICONS)) {
    if (key.includes(k)) return Icon;
  }
  return Box;
}

const label = { display: 'block', font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 5 };

export default function AssetListV2() {
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { getAppRole } = useOrg();
  const isAdmin = getAppRole('employee') === 'admin';

  const [assets, setAssets] = useState([]);
  const [types, setTypes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Add asset modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ assetTypeId: '', name: '', modelName: '', condition: 'good', notes: '', assignTo: '' });
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [loadError, setLoadError] = useState('');

  // Bulk restock
  const [selected, setSelected] = useState(() => new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMsg, setBulkMsg] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);

  useEffect(() => {
    loadAll();
  }, [orgSlug]);

  // Employee search for the "Assign To" picker — server-side + debounced.
  // A flat limit:100 fetch silently truncated large companies (e.g. Huemot
  // Pvt Ltd has 140+ employees): anyone past the first 100 alphabetically was
  // invisible here and couldn't be assigned an asset. Delegate the filtering
  // to the backend's `search` param instead so any employee is reachable.
  const empSearchTimer = useRef(null);
  useEffect(() => {
    if (!showAdd) return;
    if (empSearchTimer.current) clearTimeout(empSearchTimer.current);
    empSearchTimer.current = setTimeout(() => {
      employeeApi.list(orgSlug, { search: empSearch.trim() || undefined, limit: 50 })
        .then(res => {
          const list = (res.employees || res.data || []).filter(e => e.status !== 'separated');
          setEmployees(list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '')));
        })
        .catch(() => {});
    }, 250);
    return () => { if (empSearchTimer.current) clearTimeout(empSearchTimer.current); };
  }, [showAdd, empSearch, orgSlug]);

  async function loadAll() {
    setLoading(true);
    setLoadError('');
    try {
      const [assetsRes, typesRes, statsRes] = await Promise.all([
        assetApi.list(orgSlug),
        assetApi.listTypes(orgSlug),
        assetApi.stats(orgSlug),
      ]);
      setAssets(assetsRes.data || []);
      setTypes(typesRes.data || []);
      setStats(statsRes.data || null);
    } catch (e) {
      console.error(e);
      setLoadError(e?.message || 'Could not load assets.');
    }
    finally { setLoading(false); }
  }

  // Filtered assets
  const filtered = useMemo(() => {
    let list = assets;
    if (statusFilter) list = list.filter(a => a.status === statusFilter);
    if (typeFilter) list = list.filter(a => a.assetTypeId === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.modelName || '').toLowerCase().includes(q) ||
        (a.assetTypeName || '').toLowerCase().includes(q) ||
        (a.assignedToName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [assets, statusFilter, typeFilter, search]);

  function resetAddForm() {
    setAddForm({ assetTypeId: '', name: '', modelName: '', condition: 'good', notes: '', assignTo: '' });
    setEmpSearch('');
    setShowEmpDropdown(false);
    setAddError('');
  }

  function closeAdd() { setShowAdd(false); resetAddForm(); }

  // Only ever act on rows the operator can currently see. Selecting, then
  // changing a filter, must not quietly restock something off-screen.
  const eligibleIds = useMemo(
    () => new Set(filtered.filter(a => RESTOCKABLE.has(a.status)).map(a => a._id)),
    [filtered]
  );
  const activeSelection = useMemo(
    () => [...selected].filter(id => eligibleIds.has(id)),
    [selected, eligibleIds]
  );
  const allEligibleSelected = eligibleIds.size > 0 && activeSelection.length === eligibleIds.size;

  function toggleOne(id, on) {
    setBulkMsg(null);
    setSelected(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleAllEligible(on) {
    setBulkMsg(null);
    setSelected(on ? new Set(eligibleIds) : new Set());
  }

  async function handleBulkMakeAvailable() {
    if (activeSelection.length === 0) return;
    setBulkSaving(true);
    setBulkMsg(null);
    try {
      const res = await assetApi.bulkMakeAvailable(orgSlug, activeSelection);
      const { updated = 0, skipped = [] } = res?.data || {};
      setBulkMsg({
        tone: updated > 0 ? 'success' : 'warn',
        text: skipped.length
          ? `${updated} moved to Available. ${skipped.length} skipped (${[...new Set(skipped.map(s => s.reason))].join(', ').replace(/_/g, ' ')}).`
          : `${updated} asset${updated === 1 ? '' : 's'} moved to Available.`,
      });
      setSelected(new Set());
      await loadAll();
    } catch (e) {
      console.error(e);
      setBulkMsg({ tone: 'danger', text: e?.message || 'Could not update the selected assets.' });
    }
    finally { setBulkSaving(false); }
  }

  async function handleAdd() {
    if (!addForm.assetTypeId || !addForm.name.trim()) return;
    setSaving(true);
    setAddError('');
    // Create and assign are two calls. If the second fails the asset DOES
    // exist — say so, otherwise the operator retries and creates a duplicate.
    let createdId = null;
    try {
      // `assignToName` is display-only state; strip it so it never reaches the API.
      const { assignTo, assignToName: _assignToName, ...createData } = addForm;
      const created = await assetApi.create(orgSlug, createData);
      createdId = created?.data?._id || null;
      // Assigning is optional — an asset with nobody picked goes into stock
      // as Available, which is how spare kit is meant to be recorded.
      if (assignTo && createdId) {
        await assetApi.assign(orgSlug, createdId, { employeeId: assignTo });
      }
      closeAdd();
      await loadAll();
    } catch (e) {
      console.error(e);
      setAddError(createdId
        ? `Asset created, but assigning it failed: ${e?.message || 'unknown error'}. It is in the list as Available — assign it from its page.`
        : (e?.message || 'Could not add the asset.'));
      if (createdId) await loadAll();
    }
    finally { setSaving(false); }
  }

  if (loading) return <PageSpinner label="Loading assets…" />;

  return (
    <div>
      <PageHeader
        title="Assets"
        sub="Track and manage company assets"
        actions={isAdmin && (
          <Button size="sm" onClick={() => setShowAdd(true)} iconLeft={<Plus size={15} />}>Add Asset</Button>
        )}
      />

      {loadError && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="danger">
            {loadError}{' '}
            <Button variant="ghost" size="sm" onClick={loadAll}>Retry</Button>
          </Callout>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
          {/* `Stat` fixes the value colour at --fg, so the status tint that legacy
              put on the number rides the icon instead — same at-a-glance read. */}
          {[
            { label: 'Total',     value: stats.total,     icon: <Package size={14} />,       color: 'var(--fg-3)' },
            { label: 'Assigned',  value: stats.assigned,  icon: <User size={14} />,          color: 'var(--info)' },
            { label: 'Available', value: stats.available, icon: <Check size={14} />,         color: 'var(--brand)' },
            { label: 'Returned',  value: stats.returned,  icon: <Undo2 size={14} />,         color: 'var(--fg-3)' },
            { label: 'Lost',      value: stats.lost,      icon: <AlertTriangle size={14} />, color: 'var(--danger)' },
          ].map(s => (
            <Stat key={s.label} label={s.label} value={s.value} icon={s.icon} color={s.color} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: '1 1 200px', maxWidth: 320 }}>
          {/* SearchInput hands back the string, not the event — `e.target.value`
              here threw on every keystroke. */}
          <SearchInput value={search} onChange={setSearch} placeholder="Search assets…" width="100%" />
        </div>
        <Select value={statusFilter} aria-label="Filter by status"
          onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
        <Select value={typeFilter} aria-label="Filter by type"
          onChange={e => setTypeFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All Types</option>
          {types.map(t => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </Select>
        {(statusFilter || typeFilter || search) && (
          <Button variant="ghost" size="sm" iconLeft={<X size={13} />}
            onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearch(''); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Bulk restock. Only shown when there is actually something to restock,
          so the ordinary list stays uncluttered. */}
      {isAdmin && eligibleIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '9px 12px', marginBottom: 12, borderRadius: 10,
          background: 'var(--surface-2)', border: '1px solid var(--line-2)',
        }}>
          <Checkbox
            checked={allEligibleSelected}
            indeterminate={activeSelection.length > 0 && !allEligibleSelected}
            onChange={toggleAllEligible}
            label={`Select all ${eligibleIds.size} returnable assets`}
          />
          <span style={{ font: "400 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
            {activeSelection.length > 0
              ? `${activeSelection.length} of ${eligibleIds.size} selected`
              : `${eligibleIds.size} asset${eligibleIds.size === 1 ? '' : 's'} can go back into stock`}
          </span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {activeSelection.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => toggleAllEligible(false)}>Clear</Button>
            )}
            <Button
              size="sm"
              disabled={activeSelection.length === 0 || bulkSaving}
              onClick={handleBulkMakeAvailable}
              iconLeft={bulkSaving ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            >
              Make Available{activeSelection.length > 0 ? ` (${activeSelection.length})` : ''}
            </Button>
          </span>
        </div>
      )}

      {bulkMsg && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone={bulkMsg.tone === 'success' ? 'brand' : bulkMsg.tone}>{bulkMsg.text}</Callout>
        </div>
      )}

      {/* Asset grid */}
      {filtered.length === 0 ? (
        <Panel>
          <EmptyState icon={<Package size={22} />}
            title={assets.length === 0 ? 'No assets yet' : 'No assets match your filters'}
            actions={assets.length === 0
              ? (isAdmin ? <Button size="sm" iconLeft={<Plus size={15} />} onClick={() => setShowAdd(true)}>Add Asset</Button> : null)
              : <Button variant="secondary" size="sm" iconLeft={<X size={13} />}
                  onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearch(''); }}>Clear filters</Button>} />
        </Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map(asset => {
            const st = STATUS_CONFIG[asset.status] || STATUS_CONFIG.available;
            const cond = CONDITION_CONFIG[asset.condition] || CONDITION_CONFIG.good;
            const TypeIcon = getTypeIcon(asset.assetTypeName);
            const hist = asset.assignmentHistory || [];
            const lastReturn = [...hist].reverse().find(h => h.returnedDate) || null;
            return (
              <Panel
                key={asset._id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${asset.name}`}
                onClick={() => navigate(orgPath(`/employee/assets/${asset._id}`))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(orgPath(`/employee/assets/${asset._id}`));
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ padding: 4, display: 'grid', gap: 8 }}>
                  {/* Top row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      {/* Checkbox handles its own stopPropagation, so ticking a
                          card does not also open it. */}
                      {isAdmin && RESTOCKABLE.has(asset.status) && (
                        <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                          <Checkbox
                            checked={selected.has(asset._id)}
                            onChange={(on) => toggleOne(asset._id, on)}
                            label={`Select ${asset.name}`}
                          />
                        </span>
                      )}
                      <span style={{
                        flexShrink: 0, width: 34, height: 34, borderRadius: 9,
                        background: 'var(--surface-3)', display: 'inline-flex',
                        alignItems: 'center', justifyContent: 'center', color: 'var(--fg-4)',
                      }}>
                        <TypeIcon size={17} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ font: "500 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>{asset.name}</p>
                        <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
                          {asset.assetTypeName}{asset.modelName ? ` - ${asset.modelName}` : ''}
                        </p>
                      </div>
                    </div>
                    <span style={{ flexShrink: 0 }}><Chip tone={st.tone}>{st.label}</Chip></span>
                  </div>

                  {/* A returned or lost asset has no assignee any more, but the
                      card showed nothing at all — you could not tell who had it
                      or when it came back without opening the record. */}
                  {asset.status !== 'assigned' && lastReturn && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      paddingTop: 8, borderTop: '1px solid var(--line-2)',
                    }}>
                      <Undo2 size={12} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                      <span style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lastReturn.employeeName}
                      </span>
                      {lastReturn.returnedDate && (
                        <span style={{ marginLeft: 'auto', flexShrink: 0, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                          {new Date(lastReturn.returnedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  )}

                  {asset.status === 'assigned' && asset.assignedToName && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      paddingTop: 8, borderTop: '1px solid var(--line-2)',
                    }}>
                      <User size={12} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                      <span style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>{asset.assignedToName}</span>
                      {asset.assignedDate && (
                        <span style={{ marginLeft: 'auto', font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                          since {new Date(asset.assignedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Condition */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ font: "500 11px/1.4 'Inter', system-ui, sans-serif", color: cond.color }}>
                      Condition: {cond.label}
                    </span>
                    <ArrowRight size={14} style={{ color: 'var(--fg-4)' }} />
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {/* ── Add asset ────────────────────────────────────────────────────── */}
      <Modal
        open={showAdd}
        onClose={closeAdd}
        size="sm"
        title="Add Asset"
        footer={(
          <>
            <Button variant="secondary" size="sm" onClick={closeAdd}>Cancel</Button>
            <Button size="sm" block onClick={handleAdd}
              disabled={saving || !addForm.assetTypeId || !addForm.name.trim()}
              iconLeft={saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}>
              Add Asset
            </Button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 12 }} onClick={() => setShowEmpDropdown(false)}>
          {addError && <Callout tone="danger">{addError}</Callout>}
          <div>
            <label htmlFor="as-type" style={label}>Asset Type *</label>
            <Select id="as-type" value={addForm.assetTypeId}
              onChange={e => setAddForm(f => ({ ...f, assetTypeId: e.target.value }))}>
              <option value="">Select type...</option>
              {types.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </Select>
          </div>

          <div>
            <label htmlFor="as-name" style={label}>Name *</label>
            <Input id="as-name" value={addForm.name} placeholder="e.g. Dell Latitude 3420"
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div>
            <label htmlFor="as-model" style={label}>Model Name</label>
            <Input id="as-model" value={addForm.modelName} placeholder="e.g. Lenovo ThinkPad"
              onChange={e => setAddForm(f => ({ ...f, modelName: e.target.value }))} />
          </div>

          <div>
            <label htmlFor="as-cond" style={label}>Condition</label>
            <Select id="as-cond" value={addForm.condition}
              onChange={e => setAddForm(f => ({ ...f, condition: e.target.value }))}>
              <option value="new">New</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="damaged">Damaged</option>
            </Select>
          </div>

          <div>
            <label htmlFor="as-notes" style={label}>Notes</label>
            <Textarea id="as-notes" rows={2} value={addForm.notes} placeholder="Optional notes..."
              onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          {/* Assign To — server-side search, so anyone in the company is reachable */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <label htmlFor="as-emp" style={label}>Assign To</label>
            {addForm.assignTo ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '7px 10px', borderRadius: 8,
                background: 'var(--surface-2)', border: '1px solid var(--line-2)',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <User size={14} style={{ color: 'var(--brand-ink)', flexShrink: 0 }} />
                  <span style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                    {addForm.assignToName || employees.find(e => e._id === addForm.assignTo)?.fullName || 'Selected'}
                  </span>
                </span>
                <Button variant="ghost" size="sm" aria-label="Clear assignee" iconLeft={<X size={14} />}
                  onClick={() => { setAddForm(f => ({ ...f, assignTo: '', assignToName: '' })); setEmpSearch(''); }} />
              </div>
            ) : (
              <>
                <Input
                  id="as-emp"
                  value={empSearch}
                  placeholder="Search employee..."
                  onChange={e => { setEmpSearch(e.target.value); setShowEmpDropdown(true); }}
                  onFocus={() => setShowEmpDropdown(true)}
                />
                {showEmpDropdown && (
                  <div style={{
                    position: 'absolute', zIndex: 10, marginTop: 4, width: '100%',
                    maxHeight: 176, overflowY: 'auto', borderRadius: 9,
                    background: 'var(--surface-2)', border: '1px solid var(--line-2)',
                    boxShadow: '0 12px 28px rgba(0,0,0,.28)',
                  }}>
                    {employees
                      .slice(0, 20)
                      .map(e => (
                        <button key={e._id} type="button"
                          onClick={() => { setAddForm(f => ({ ...f, assignTo: e._id, assignToName: e.fullName || e.name })); setEmpSearch(''); setShowEmpDropdown(false); }}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                            padding: '7px 10px', background: 'none', border: 0,
                          }}>
                          <p style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>{e.fullName || e.name}</p>
                          <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>{e.email}</p>
                        </button>
                      ))}
                    {employees.length === 0 && (
                      <p style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0, padding: '7px 10px' }}>No employees found</p>
                    )}
                  </div>
                )}
              </>
            )}
            <p style={{ font: "400 10.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '5px 0 0' }}>
              Leave empty to add it to stock as Available.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
