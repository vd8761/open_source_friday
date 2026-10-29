import { formatIST } from './dateTime.js';
export function rosterCsv(rows) {
  const headers = ['Full Name', 'Email', 'WhatsApp', 'Gender', 'College', 'Degree', 'Department', 'Year of Study', 'DOS Member', 'Topic', 'Registered At (IST)', 'WhatsApp Event Consent'];
  const cell = value => `"${String(value ?? '').replace(/^[ \t\r\n]*[=+\-@]|^[\t\r\n]/, "'$&").replace(/"/g, '""')}"`;
  return [headers, ...rows.map(row => [row.full_name, row.email, row.whatsapp_number, row.gender, row.college, row.degree,
    row.department, row.year_of_study, row.is_dos_club_member, row.excited_topic,
    row.registered_at ? formatIST(row.registered_at) : '', row.whatsapp_status || 'not_recorded'])].map(values => values.map(cell).join(',')).join('\r\n');
}
