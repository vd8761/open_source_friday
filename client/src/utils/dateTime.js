// API instants must include an offset. Never guess a timezone for a naive timestamp.
export function formatIST(value) {
  if (!value) return '—';
  if (typeof value==='string' && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) return '—';
  const date=new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true}).formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} ${parts.dayPeriod.toUpperCase()} IST`;
}
