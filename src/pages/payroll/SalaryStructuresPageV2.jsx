import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { getSalaryStructures, createSalaryStructure, updateSalaryStructure, deleteSalaryStructure, setDefaultStructure, getPublicPlatformSetting } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { Plus, Edit2, Trash2, Star, X, Search, Layers } from 'lucide-react';
import {
  PageHeader, Panel, Chip, Button, Input, Modal, Callout, EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Salary structures — the templates that split an employee's gross into Basic,
// HRA and the rest, and decide which parts count for PF and tax. This is salary
// math, so everything above `return (` is spliced in verbatim: the percentage
// total, the EPSILON comparison that tolerates a 33.33/33.33/33.34 split, the
// `Basic >= 50%` New Wage Code gate, and `pctDisplay`'s float-dust trim.
//
// Dual-use like the other two payroll config pages — route plus the
// `structures` tab in SettingsPayroll, both on the shared PageSwitch.
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_COMPONENT = { name: '', percentOfGross: '', isTaxable: true, isPfApplicable: false };

// Show a search box only once the list is long enough that scanning it is work.
const SEARCH_THRESHOLD = 6;

// Stable palette for the proportion bar — index-based so a structure's bar
// keeps the same colours between renders. Legacy used fixed Tailwind fills;
// these are the same hues as theme tokens, in the same order, so a given
// component keeps its colour.
const BAR_COLORS = [
  'var(--brand)',
  'var(--acc-blue)',
  'var(--acc-amber)',
  'var(--acc-emerald)',
  'var(--acc-purple)',
  'var(--acc-rose)',
  'var(--acc-cyan)',
];

// Trim float dust off a percentage for display without rounding a real value away.
const pctDisplay = (v) => {
  const n = Number(v) || 0;
  return String(Math.round(n * 100) / 100);
};

const FALLBACK_COMPONENTS = [
  { name: 'Basic', percentOfGross: 50, isTaxable: true, isPfApplicable: true },
  { name: 'HRA', percentOfGross: 20, isTaxable: true, isPfApplicable: false },
  { name: 'Special Allowance', percentOfGross: 30, isTaxable: true, isPfApplicable: false },
];

export default function SalaryStructuresPageV2({ embedded = false }) {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [defaultComponents, setDefaultComponents] = useState(FALLBACK_COMPONENTS);
  const [form, setForm] = useState({ name: '', components: FALLBACK_COMPONENTS });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // Client-side filter over already-loaded structures — no extra API calls.
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setStructures([]);
    setLoadError(null);
    try {
      const res = await getSalaryStructures(orgSlug);
      setStructures(res.structures || []);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Failed to load salary structures');
      showToast('Failed to load structures', 'error');
    }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [orgSlug, currentCompany?._id]);

  // Fetch default structure template from platform settings
  useEffect(() => {
    getPublicPlatformSetting('default_salary_structure')
      .then(res => {
        if (res?.components?.length) {
          setDefaultComponents(res.components);
          setForm(f => ({ ...f, components: res.components }));
        }
      })
      .catch(() => {});
  }, []);

  const resetForm = () => {
    setForm({ name: '', components: defaultComponents });
    setEditing(null);
    setShowForm(false);
  };

  const totalPercent = form.components.reduce((s, c) => s + (Number(c.percentOfGross) || 0), 0);
  // Float equality would reject a legitimate 33.33/33.33/33.34 split
  // (sums to 100.00000000000001) and print the artifact in the badge.
  const EPSILON = 0.001;
  const totalIs100 = Math.abs(totalPercent - 100) < EPSILON;
  const totalPercentDisplay = Math.round(totalPercent * 100) / 100;
  const basicComp = form.components.find(c => c.name === 'Basic');
  const isValid = form.name && totalIs100 && basicComp && Number(basicComp.percentOfGross) >= 50;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return showToast('Total must be 100%, Basic >= 50%.', 'error');
    if (saving) return;
    const data = { name: form.name, components: form.components.map(c => ({ ...c, percentOfGross: Number(c.percentOfGross) })) };
    setSaving(true);
    try {
      if (editing) {
        await updateSalaryStructure(orgSlug, editing, data);
        showToast('Updated');
      } else {
        await createSalaryStructure(orgSlug, data);
        showToast('Created');
      }
      resetForm();
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this salary structure?')) return;
    try { await deleteSalaryStructure(orgSlug, id); showToast('Deleted'); load(); }
    catch (err) { showToast(err.response?.data?.message || 'Cannot delete', 'error'); }
  };

  const handleSetDefault = async (id) => {
    try { await setDefaultStructure(orgSlug, id); showToast('Set as default'); load(); }
    catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const showSearch = structures.length >= SEARCH_THRESHOLD;
  const q = search.trim().toLowerCase();
  const visibleStructures = !q ? structures : structures.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.components || []).some(c => (c.name || '').toLowerCase().includes(q))
  );

  const startEdit = (s) => { setForm({ name: s.name, components: s.components.map(c => ({ ...c })) }); setEditing(s._id); setShowForm(true); };
  const addComponent = () => setForm(f => ({ ...f, components: [...f.components, { ...EMPTY_COMPONENT }] }));
  const removeComponent = (idx) => setForm(f => ({ ...f, components: f.components.filter((_, i) => i !== idx) }));
  const updateComponent = (idx, field, value) => setForm(f => ({ ...f, components: f.components.map((c, i) => i === idx ? { ...c, [field]: value } : c) }));

  if (loading) return <PageSpinner label="Loading salary structures…" />;

  if (loadError) return (
    <Panel>
      <div style={{ textAlign: 'center', padding: '28px 12px' }}>
        <p style={{ font: "400 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)', margin: '0 0 14px' }}>{loadError}</p>
        <Button variant="secondary" size="sm" onClick={load}>Retry</Button>
      </div>
    </Panel>
  );

  const newStructureBtn = (
    <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => { resetForm(); setShowForm(true); }}>
      New Structure
    </Button>
  );

  return (
    <div style={embedded ? {} : { maxWidth: 900, margin: '0 auto' }}>
      {embedded
        ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>{newStructureBtn}</div>
        : (
          <PageHeader
            title="Salary Structures"
            sub="Reusable templates that split an employee's gross salary into components such as Basic and HRA"
            actions={newStructureBtn}
          />
        )}

      {showSearch && (
        <div style={{ position: 'relative', maxWidth: 320, marginBottom: 14 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
          <Input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by structure or component name…"
            aria-label="Search structures"
            style={{ paddingLeft: 30 }}
          />
        </div>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {visibleStructures.map(s => {
          const comps = s.components || [];
          const compTotal = comps.reduce((sum, c) => sum + (Number(c.percentOfGross) || 0), 0);
          return (
            <Panel key={s._id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                  <h3 style={{ font: "600 15px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </h3>
                  {s.isDefault && <Chip tone="warn">Default</Chip>}
                  <span style={{ font: "400 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                    {comps.length} component{comps.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => !s.isDefault && handleSetDefault(s._id)}
                    title={s.isDefault ? 'Default structure' : 'Set as default'}
                    aria-label={s.isDefault ? 'Default structure' : `Set ${s.name} as default`}
                    style={s.isDefault ? { color: 'var(--warn-ink)', cursor: 'default' } : undefined}
                    iconLeft={<Star size={15} fill={s.isDefault ? 'currentColor' : 'none'} />}
                  />
                  <Button variant="ghost" size="sm" aria-label={`Edit ${s.name}`} onClick={() => startEdit(s)} iconLeft={<Edit2 size={15} />} />
                  <Button variant="ghost" size="sm" aria-label={`Delete ${s.name}`} onClick={() => handleDelete(s._id)} iconLeft={<Trash2 size={15} />} />
                </div>
              </div>

              {/* Proportion bar — the whole split readable in one glance */}
              <div style={{ display: 'flex', height: 8, width: '100%', borderRadius: 99, overflow: 'hidden', background: 'var(--surface-2)', marginBottom: 5 }}>
                {comps.map((c, i) => {
                  const pct = Number(c.percentOfGross) || 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={i}
                      style={{ background: BAR_COLORS[i % BAR_COLORS.length], width: `${Math.min(pct, 100)}%` }}
                      title={`${c.name}: ${pctDisplay(pct)}% of gross`}
                    />
                  );
                })}
              </div>
              <div style={{ font: "400 10.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 12 }}>
                Percentages are shares of monthly gross · total {pctDisplay(compTotal)}%
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                {comps.map((c, i) => (
                  <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-1)', padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                      <div style={{ font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </div>
                    </div>
                    <div style={{ font: "500 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
                      {pctDisplay(c.percentOfGross)}% of gross
                    </div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                      {c.isTaxable && <span title="Included in taxable income"><Chip tone="warn">Taxable</Chip></span>}
                      {c.isPfApplicable && <span title="Counts towards Provident Fund wages"><Chip tone="info">Counts for PF</Chip></span>}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          );
        })}

        {structures.length === 0 && (
          <Panel>
            <EmptyState
              icon={<Layers size={22} />}
              title="No salary structures yet"
              sub="A salary structure is a reusable template that says how an employee's monthly gross is divided — for example Basic 50%, HRA 20%, Special Allowance 30%. Payroll uses it to work out each component from the gross, and to decide which parts count towards PF and tax."
              action={(
                <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => { resetForm(); setShowForm(true); }}>
                  Create your first structure
                </Button>
              )}
            />
            <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
              Create one structure per pay band you use. Components must add up to 100%, and Basic must be
              at least 50% of gross to stay compliant with the New Wage Code. Mark one structure as the
              default and new employees will pick it up automatically.
            </p>
          </Panel>
        )}

        {structures.length > 0 && visibleStructures.length === 0 && (
          <Panel>
            <EmptyState
              title={`No structure matches “${search}”`}
              action={<Button variant="ghost" size="sm" onClick={() => setSearch('')}>Clear search</Button>}
            />
          </Panel>
        )}
      </div>

      {/* ── Create / edit ── */}
      <Modal
        open={showForm}
        onClose={resetForm}
        size="md"
        title={editing ? 'Edit Structure' : 'New Salary Structure'}
        footer={(
          <>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" type="button" onClick={resetForm}>Cancel</Button>
            <Button size="sm" type="submit" form="salary-structure-form" disabled={!isValid || saving}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </>
        )}
      >
        <form id="salary-structure-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <div>
            <label htmlFor="ss-name" style={{ display: 'block', font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 5 }}>
              Structure Name
            </label>
            <Input
              id="ss-name"
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Standard, Senior"
              required
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
              <span style={{ font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>
                Components (% of monthly gross)
              </span>
              <span style={{
                font: "500 11.5px/1 'Inter', system-ui, sans-serif",
                color: totalIs100 ? 'var(--brand-ink)' : 'var(--danger)',
              }}>
                Total: {totalPercentDisplay}% {totalIs100 ? '' : '— must be 100%'}
              </span>
            </div>
            <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 8px' }}>
              Tick “PF” for components that count towards Provident Fund wages.
            </p>

            <div style={{ display: 'grid', gap: 8 }}>
              {form.components.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Input
                    type="text"
                    value={c.name}
                    onChange={e => updateComponent(i, 'name', e.target.value)}
                    placeholder="Component name"
                    aria-label={`Component ${i + 1} name`}
                    required
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <Input
                      type="number"
                      value={c.percentOfGross}
                      onChange={e => updateComponent(i, 'percentOfGross', e.target.value)}
                      min="0"
                      max="100"
                      required
                      aria-label={`Component ${i + 1} percent of gross`}
                      style={{ width: 68, textAlign: 'right' }}
                    />
                    <span style={{ font: "400 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>%</span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, cursor: 'pointer', font: "400 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
                    <input
                      type="checkbox"
                      checked={c.isPfApplicable}
                      onChange={e => updateComponent(i, 'isPfApplicable', e.target.checked)}
                      style={{ accentColor: 'var(--brand)' }}
                    />
                    PF
                  </label>
                  {form.components.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove component ${i + 1}`}
                      onClick={() => removeComponent(i)}
                      iconLeft={<X size={14} />}
                    />
                  )}
                </div>
              ))}
            </div>

            <Button type="button" variant="ghost" size="sm" onClick={addComponent} style={{ marginTop: 6 }}>
              + Add component
            </Button>
          </div>

          {basicComp && Number(basicComp.percentOfGross) < 50 && (
            <Callout tone="danger">{"Basic must be >= 50% (New Wage Code compliance)"}</Callout>
          )}
        </form>
      </Modal>
    </div>
  );
}
