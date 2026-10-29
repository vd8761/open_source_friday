// Minimal event-scoped contact list. Never substitute a different profile number.
export function whatsappCsv(rows,episodeNumber) {
  const cell=value=>`"${String(value??'').replace(/^[ \t\r\n]*[=+\-@]|^[\t\r\n]/, "'$&").replace(/"/g,'""')}"`;
  return [['Episode','Name','WhatsApp number consented to','Scope','Consent recorded at','Notice version'],
    ...rows.filter(r=>r.whatsapp_status==='opted_in'&&!r.whatsapp_withdrawn_at&&r.whatsapp_consent_number)
      .map(r=>[episodeNumber,r.full_name,r.whatsapp_consent_number,'This registered event only',r.whatsapp_consent_at,r.whatsapp_notice_version])]
    .map(row=>row.map(cell).join(',')).join('\r\n');
}
