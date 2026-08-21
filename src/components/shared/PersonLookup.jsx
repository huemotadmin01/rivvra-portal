import { useCallback, useRef } from 'react';
import contactsApi from '../../utils/contactsApi';
import { EntityLookup } from '../ds';

/**
 * PersonLookup — the ds person picker.
 *
 * ds `EntityLookup` is generic: it knows how to search, commit and report, but
 * not *what* a person is. This supplies the two app-specific halves —
 * `/contacts/salespersons` for the search, and `probeSalesperson` for the
 * link-gate — so every V2 surface picks people the same way.
 *
 * ── Why the probe exists ────────────────────────────────────────────────────
 * People fields hold `employee._id`, but older records can hold ids that never
 * resolved to an employee row (a `portal_user` id, an "HR Team" placeholder).
 * Linking those sends the user to a 404. `probeSalesperson` asks whether the id
 * is an active employee in the current company scope, and the link is only
 * offered when it is. This is the behaviour that kept legacy `EmployeeLookup`
 * alive through the whole migration; ds now carries it as `hrefProbe`.
 *
 * ── The save contract is the real difference from EmployeeLookup ────────────
 * Legacy `EmployeeLookup` called `onSelect(id, name)` and forgot about it — a
 * failed save surfaced only as a toast, while the row happily showed the new
 * name. `EntityLookup` is PESSIMISTIC: `onSelect` must REJECT on failure, and
 * the row then shows an inline error instead of a false success.
 *
 * So `onSelect` here must return a promise that rejects. Callers that used to
 * catch-and-toast need to re-throw.
 *
 * Props mirror `EmployeeLookup`'s (`currentValue` / `currentName` / `linkTo`)
 * so call sites move across without re-reading their own state plumbing.
 */
export default function PersonLookup({
  orgSlug,
  label = 'Person',
  field,
  currentValue,
  currentName,
  /** (id, name) => Promise<void>. MUST reject on failure. */
  onSelect,
  editable = true,
  allowClear = true,
  placeholder = 'Search employees…',
  /** (id) => path. Omit for no link. Ignored when variant='inline'. */
  linkTo = null,
  labelWidth,
  /** 'row' (labelled detail row) | 'inline' (bare value cell). */
  variant = 'row',
  /** False on create forms — see EntityLookup. */
  confirmsSave = true,
}) {
  // Names of everything the picker has shown this session. EntityLookup hands
  // back only (field, value) on select, and the callers need the NAME too —
  // People fields store a denormalised `…Name` beside the id. Recording them
  // as they stream past is exact and free; re-querying to recover the name
  // would cost a round-trip and could miss, since the pick may have come from
  // a filtered page the unfiltered query does not return.
  const namesRef = useRef(new Map());

  const search = useCallback(async (q) => {
    const res = await contactsApi.listSalespersons(orgSlug, q);
    const rows = res?.salespersons || [];
    rows.forEach((e) => namesRef.current.set(String(e._id), e.name));
    return rows.map((e) => ({
      value: e._id,
      label: e.name,
      sub: e.designation || undefined,
    }));
  }, [orgSlug]);

  // Resolves true only when the id is an active employee in this company.
  const hrefProbe = useCallback(async (id) => {
    try {
      const res = await contactsApi.probeSalesperson(orgSlug, id);
      return !!res?.salespersons?.length;
    } catch {
      return false;
    }
  }, [orgSlug]);

  // EntityLookup hands back (field, value); callers want (id, name). Clearing
  // sends ('', '') — the same pair legacy sent — so a cleared field writes an
  // empty name rather than leaving a stale one beside a null id.
  const handleSelect = useCallback((_field, value) => {
    if (!value) return onSelect?.('', '');
    return onSelect?.(value, namesRef.current.get(String(value)) || '');
  }, [onSelect]);

  return (
    <EntityLookup
      label={label}
      field={field}
      value={currentValue || ''}
      displayValue={currentName || undefined}
      search={search}
      onSelect={handleSelect}
      editable={editable}
      allowClear={allowClear}
      placeholder={placeholder}
      href={linkTo && currentValue ? linkTo(currentValue) : undefined}
      hrefProbe={linkTo ? hrefProbe : undefined}
      labelWidth={labelWidth}
      variant={variant}
      confirmsSave={confirmsSave}
    />
  );
}
