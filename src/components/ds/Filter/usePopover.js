import { useState, useRef, useEffect } from 'react';

/** Internal: open/close state for the filter popovers, closing on any
 *  outside mousedown. Not exported from the barrel — implementation detail
 *  shared by SelectChip / GroupByChip / MoreFilters. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  return { open, setOpen, ref };
}
