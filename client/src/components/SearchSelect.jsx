import React, { useId, useMemo, useRef, useState } from 'react';
import { fieldClass } from '../utils/adminApi';

const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9@.]+/).filter((w) => w.length > 1);

// Type-to-search picker for long lists (registrations, contacts). Options: [{ value, label, detail }].
// `suggest` (e.g. a Zoom participant's name and email) floats likely matches to the top before anything is typed.
export default function SearchSelect({ options, value, onChange, placeholder = 'Type a name or email', ariaLabel, suggest = '', limit = 50, disabled }) {
  const id = useId(), box = useRef(null);
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const selected = options.find((o) => String(o.value) === String(value));
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return options.filter((o) => `${o.label} ${o.detail || ''}`.toLowerCase().includes(q)).slice(0, limit);
    const hints = words(suggest);
    const score = (o) => { const w = words(`${o.label} ${o.detail || ''}`); return hints.filter((h) => w.includes(h)).length; };
    return [...options].map((o) => [score(o), o]).sort((a, b) => b[0] - a[0]).map(([, o]) => o).slice(0, limit);
  }, [options, query, suggest, limit]);
  const pick = (o) => { onChange(String(o.value)); setQuery(''); setOpen(false); };
  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape') setOpen(false);
  }
  return <div ref={box} className="relative" onBlur={(e) => { if (!box.current.contains(e.relatedTarget)) setOpen(false); }}>
    <input type="text" role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" disabled={disabled}
      className={`${fieldClass} !mt-0`} placeholder={selected ? `${selected.label}${selected.detail ? ` · ${selected.detail}` : ''}` : placeholder}
      value={open ? query : selected ? `${selected.label}${selected.detail ? ` · ${selected.detail}` : ''}` : query}
      onFocus={() => { setOpen(true); setActive(0); }} onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKeyDown} />
    {open && <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
      {shown.map((o, i) => <li key={o.value} role="option" aria-selected={String(o.value) === String(value)} tabIndex={-1}
        className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${i === active ? 'bg-slate-100' : ''}`}
        onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
        <span className="font-semibold">{o.label}</span>{o.detail && <span className="block text-xs text-slate-500">{o.detail}</span>}
      </li>)}
      {!shown.length && <li className="px-3 py-2 text-sm text-slate-500">No match. Try part of the name or email.</li>}
      {shown.length === limit && <li className="px-3 py-1.5 text-xs text-slate-400">Showing the first {limit}. Keep typing to narrow down.</li>}
    </ul>}
  </div>;
}
