import { useState, useEffect } from 'react';
import todoApi from '../utils/todoApi';

/**
 * Assignment context for the To-Do app: whether the current user may assign
 * tasks (org admin/owner or an employee with direct reports) and, if so, the
 * same-company employees they can assign to.
 */
export default function useTodoAssign(orgSlug) {
  const [canAssign, setCanAssign] = useState(false);
  const [assignableEmployees, setAssignableEmployees] = useState([]);

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    todoApi.getAssignContext(orgSlug)
      .then(res => {
        if (cancelled || !res?.success) return;
        setCanAssign(!!res.canAssign);
        if (res.canAssign) {
          todoApi.getAssignableEmployees(orgSlug)
            .then(empRes => {
              if (!cancelled && empRes?.success) setAssignableEmployees(empRes.employees || []);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orgSlug]);

  return { canAssign, assignableEmployees };
}
