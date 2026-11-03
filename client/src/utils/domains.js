import { useCallback, useEffect, useState } from 'react';
import { adminApi } from './adminApi';

// Admin list of domains, hidden ones included. Keys never change, so renaming keeps every link.
export function useAdminDomains() {
  const [domains, setDomains] = useState([]), [error, setError] = useState('');
  const reload = useCallback(() => adminApi('/domains').then(r => { setDomains(r.domains); return r.domains; }).catch(e => { setError(e.message); return []; }), []);
  useEffect(() => { reload(); }, [reload]);
  return { domains, reload, error };
}
export const addDomain = (label) => adminApi('/domains', { method: 'POST', body: { label } }).then(r => r.domain);
export const domainLabel = (domains, key) => domains.find(d => d.key === key)?.label || key;
// Shown domains, plus any hidden one a record already uses so it is not silently dropped on save.
export const domainOptions = (domains, selected = []) => domains.filter(d => d.is_active || [].concat(selected).includes(d.key));
