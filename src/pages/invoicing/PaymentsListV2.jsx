// ============================================================================
// PaymentsListV2.jsx — Payments list on ds (phase 14, invoicing money pass)
// ============================================================================
// Copied from PaymentsList.jsx. Money-pass rule: nothing above `return (`
// moves. The debounce, the stale-response sequence guard (loadSeqRef), the
// error path that CLEARS rows so a failed mid-company-switch fetch can't leave
// the previous company's payments on screen, and the filter/sort state all
// stay byte-identical.
//
// Two things deliberately NOT changed:
//   - Filters stay in local state, not the URL. listkit's useListParams would
//     be the house pattern, but moving them to the URL changes what a
//     bookmark means on a money surface. That is a product decision.
//   - `handleSort` keeps its two-state asc/desc toggle. ds DataTable offers a
//     three-state cycle whose third state is "unsorted", and this fetch has no
//     unsorted mode — so the cycle is adapted down rather than introduced.
//
// Only the local `SortHeader` was removed (ds DataTable owns sortable headers);
// it was presentational and carried no logic.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  CreditCard, X, CheckCircle2, ArrowDownLeft, ArrowUpRight, Filter,
} from 'lucide-react';
import {
  Button, Chip, DataTable, EmptyState, Field, Input, PageHeader,
  Pagination, Panel, SearchInput, Select,
} from '../../components/ds';

// Keys mirror what RecordPaymentModal actually records (bank_transfer / upi /
// cheque / cash / manual / other) plus the system-stamped methods (tds,
// stripe). The old list filtered on 'check'/'credit_card', which no payment
// ever stores, so those filters silently returned nothing.
const PAYMENT_METHODS = [
  { key: '', label: 'All Methods' },
  { key: 'bank_transfer', label: 'Bank Transfer' },
  { key: 'upi', label: 'UPI' },
  { key: 'cheque', label: 'Cheque' },
  { key: 'cash', label: 'Cash' },
  { key: 'manual', label: 'Manual' },
  { key: 'tds', label: 'TDS' },
  { key: 'stripe', label: 'Stripe' },
  { key: 'other', label: 'Other' },
];

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function TypeBadge({ type }) {
  const isInbound = type === 'inbound';
  return (
    <Chip tone={isInbound ? 'brand' : 'warn'}>
      {isInbound ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
      {isInbound ? 'Inbound' : 'Outbound'}
    </Chip>
  );
}

function MethodLabel({ method }) {
  const found = PAYMENT_METHODS.find(m => m.key === method);
  const label = found ? found.label : (method || '-').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return <span style={{ color: 'var(--fg-3)' }}>{label}</span>;
}

export default function PaymentsListV2() {
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);
  const limit = 20;

  // Debounce search input — one fetch per settled query instead of per
  // keystroke (mirrors InvoiceList).
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Guard against out-of-order responses clobbering a newer fetch's rows.
  const loadSeqRef = useRef(0);
  const loadPayments = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        sort: sortField,
        order: sortOrder,
      };
      if (typeFilter) params.type = typeFilter;
      if (methodFilter) params.method = methodFilter;
      if (search.trim()) params.search = search.trim();
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await invoicingApi.listPayments(orgSlug, params);
      if (seq !== loadSeqRef.current) return; // stale response
      // Rows only swap once results arrive — no empty-list flash mid-search.
      setPayments(res.payments || res.data || []);
      setTotalPages(
        res.totalPages || res.pages || Math.max(1, Math.ceil((res.total || 0) / limit))
      );
      setTotal(res.total || 0);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      // Clear on error so a failed fetch (e.g. mid company-switch) doesn't
      // leave the previous company's payments on screen.
      setPayments([]);
      setTotal(0);
      setTotalPages(1);
      showToast(err.message || 'Failed to load payments', 'error');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, page, typeFilter, methodFilter, search, dateFrom, dateTo, sortField, sortOrder, currentCompany?._id]);

  useEffect(() => {
    if (orgSlug) loadPayments();
  }, [loadPayments, orgSlug]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, methodFilter, search, dateFrom, dateTo]);

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }

  function clearFilters() {
    setSearch('');
    setSearchInput('');
    setTypeFilter('');
    setMethodFilter('');
    setDateFrom('');
    setDateTo('');
  }

  const hasActiveFilters = search || searchInput || typeFilter || methodFilter || dateFrom || dateTo;

  const columns = [
    { key: 'number', header: 'Payment #', sortable: true,
      render: (p) => <span style={{ color: 'var(--fg)', fontWeight: 550 }}>{p.number || p.paymentNumber || '-'}</span> },
    { key: 'invoiceNumber', header: 'Invoice #', muted: true,
      render: (p) => p.invoiceNumber || p.invoice?.number || '-' },
    { key: 'contact', header: 'Customer / Vendor', wrap: true,
      render: (p) => (
        <span style={{ color: 'var(--fg-2)' }}>
          {p.invoiceContactName || p.contactName || p.contact?.name || p.customerName || p.vendorName || '-'}
        </span>
      ) },
    { key: 'type', header: 'Type', width: 118,
      render: (p) => <TypeBadge type={p.type || p.paymentType || 'inbound'} /> },
    { key: 'amount', header: 'Amount', align: 'right', sortable: true,
      render: (p) => (
        <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{formatCurrency(p.amount, p.currency)}</span>
      ) },
    { key: 'method', header: 'Method', width: 130,
      render: (p) => <MethodLabel method={p.method || p.paymentMethod} /> },
    { key: 'date', header: 'Date', sortable: true, muted: true, width: 130,
      render: (p) => formatDate(p.date || p.paymentDate) },
    { key: 'reconciled', header: 'Reconciled', align: 'center', width: 100,
      render: (p) => (p.reconciled
        ? <CheckCircle2 size={16} style={{ color: 'var(--brand-ink)' }} />
        : <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 999, border: '1px solid var(--line-strong)' }} />) },
  ];

  // DataTable's sort is a single {key,dir}; the page already models exactly
  // that as two pieces of state, so this is an adapter, not new behaviour.
  // handleSort keeps its own asc/desc toggle — passing the cycle through it
  // means the "third click clears" affordance is deliberately NOT introduced
  // here, because the fetch has no unsorted mode to fall back to.
  const sortState = { key: sortField, dir: sortOrder };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader title="Payments" sub="Track all inbound and outbound payments" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SearchInput
          value={searchInput}
          onChange={(v) => setSearchInput(typeof v === 'string' ? v : v?.target?.value ?? '')}
          placeholder="Search payments…"
          style={{ flex: 1, minWidth: 200, maxWidth: 360 }}
        />
        <Button
          variant={showFilters || hasActiveFilters ? 'secondary' : 'ghost'}
          onClick={() => setShowFilters((prev) => !prev)}
          iconLeft={<Filter size={14} />}
        >
          Filters
          {hasActiveFilters && (
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--brand)', marginLeft: 6 }} />
          )}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} iconLeft={<X size={12} />}>
            Clear all
          </Button>
        )}
      </div>

      {showFilters && (
        <Panel>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Field label="Type">
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All Types</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </Select>
            </Field>
            <Field label="Method">
              <Select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="From Date">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </Field>
            <Field label="To Date">
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </Field>
          </div>
        </Panel>
      )}

      <DataTable
        columns={columns}
        rows={payments}
        rowKey="_id"
        loading={loading}
        sort={sortState}
        onSortChange={(next) => handleSort(next ? next.key : sortField)}
        onRowClick={(p) => p.invoiceId && navigate(orgPath(`/invoicing/invoices/${p.invoiceId}`))}
        resizable={false}
        empty={
          <EmptyState
            icon={<CreditCard size={22} />}
            title={hasActiveFilters ? 'No payments match your filters' : 'No payments recorded yet'}
            actions={hasActiveFilters ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : null}
          />
        }
      />

      {totalPages > 1 && (
        <Pagination
          page={page}
          pageSize={limit}
          total={total}
          noun="payment"
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
