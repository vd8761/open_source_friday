import React, { useState } from 'react';
import { formatIST } from './utils/dateTime';
import { SortHeader } from './components/AdminDataTable';
import StudentLink from './components/StudentLink';
import InfoTooltip from './components/InfoTooltip';
import { Mail, GraduationCap, BookOpen, Phone, Search, UserX, Trash2 } from 'lucide-react';

export default function RegistrationTable({ data, onDeleteRegistration, onSendZoomInvitation, onWithdrawWhatsApp, startIndex=0, sort, onSort }) {
  const [sendingStudentId, setSendingStudentId] = useState(null);
  const sendInvitation = async (studentId) => {
    setSendingStudentId(studentId);
    try { await onSendZoomInvitation(studentId); }
    finally { setSendingStudentId(null); }
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="bg-slate-100 p-6 rounded-full mb-4">
          <UserX className="h-12 w-12 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900">No matching attendees</h3>
        <p className="mt-2 text-slate-500 max-w-sm text-center">
          Try different filters or check back after registrations open.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table aria-label="Attendees matching the selected filters" className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th scope="col" className="px-4 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">S.No.</th>
              <SortHeader label="Attendee" values={["name","name_desc"]} sort={sort} onSort={onSort}/><SortHeader label="Registered (IST)" values={["oldest","newest"]} sort={sort} onSort={onSort}/>
              <SortHeader label="Academic info / College" values={["college","college_desc"]} sort={sort} onSort={onSort}/>
              <th className="px-4 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Interests & Club</th>
              <SortHeader label={<span>Zoom invitation <InfoTooltip label="About Zoom invitations">Zoom enrollment is separate from application signup. Zoom sends the personal meeting-link email after enrollment. Inbox delivery is not tracked by this application. All displayed times are IST.</InfoTooltip></span>}/>

              <th className="px-4 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {data.length > 0 ? (
              data.map((row, idx) => (
                <tr key={row.registration_id || idx} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-4 py-3 text-sm text-slate-500">{startIndex+idx+1}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-dos-light to-dos flex items-center justify-center shadow-sm">
                        <span className="text-white font-bold text-sm">
                          {row.full_name ? row.full_name.charAt(0).toUpperCase() : '?'}
                        </span>
                      </div>
                      <div className="ml-3 min-w-0">
                        <div className="max-w-[200px] truncate text-sm font-bold text-slate-900 group-hover:text-dos transition-colors" title={row.full_name}><StudentLink id={row.id}>{row.full_name}</StudentLink></div>
                        <div className="max-w-[200px] text-sm text-slate-500 flex items-center gap-1 mt-0.5" title={row.email}>
                          <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{row.email}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">{formatIST(row.registered_at)}</td>
                  <td className="px-4 py-3 min-w-[200px] max-w-[260px]">
                    <div className="text-sm text-slate-900 font-medium flex items-center gap-1.5">
                      <GraduationCap className="h-4 w-4 text-slate-400" />
                      {row.degree} in {row.department}
                    </div>
                    <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4 text-slate-400" />
                      {row.college} • <span className="font-medium">{row.year_of_study}</span>
                    </div>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-sm text-slate-700">
                      <Phone aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
                      <span>{row.whatsapp_number ? `${row.country_code ? `${row.country_code} ` : ''}${row.whatsapp_number}` : '—'}</span>
                      <InfoTooltip label={`Contact details for ${row.full_name}`}>
                        {row.gender&&<p>Gender: {row.gender}</p>}
                        <p>WhatsApp: {({opted_in:'Event updates opted in',declined:'Declined',withdrawn:'Withdrawn'}[row.whatsapp_status]||'Not recorded')}</p>
                        <p>This permission covers this event only. A saved phone number alone is not consent. The public form does not verify phone ownership.</p>
                        {row.whatsapp_consent_at&&<p className="mt-2">Choice recorded: {formatIST(row.whatsapp_consent_at)} · {row.whatsapp_notice_version}</p>}
                        {row.whatsapp_consent_number&&<p className="mt-2">Applies to: {row.whatsapp_consent_number}</p>}
                        {row.whatsapp_withdrawn_at&&<p className="mt-2">Withdrawn: {formatIST(row.whatsapp_withdrawn_at)}</p>}
                      </InfoTooltip>
                    </div>
                    {onWithdrawWhatsApp&&row.whatsapp_status==='opted_in'&&<button type="button" onClick={()=>onWithdrawWhatsApp(row)} className="admin-action mt-1">Record WhatsApp withdrawal</button>}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-2 items-start">
                      {row.is_dos_club_member === 'Yes' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-dos-light/10 text-dos border border-dos/20">
                          DOS Member
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          Not a Member
                        </span>
                      )}
                      <div className="text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded w-full truncate max-w-[150px]" title={row.excited_topic}>
                        <span className="font-medium text-slate-400 mr-1">Topic:</span>
                        {row.excited_topic}
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-sm min-w-[220px]">
                    <div className="flex items-center gap-1">
                      <span className={row.invitation_status==='zoom_managed'?'font-bold text-emerald-700':row.invitation_status==='failed'?'font-bold text-rose-700':'font-bold text-slate-600'}>{!row.zoom_enabled?'Zoom not configured':({zoom_managed:'Registered with Zoom',pending:'Zoom registration pending',rate_limited:'Waiting for Zoom limit',failed:'Zoom registration failed',not_sent:'Not registered with Zoom'}[row.invitation_status]||'Not registered with Zoom')}</span>
                      <InfoTooltip label={`Zoom invitation ${row.invitation_status==='failed'||row.invitation_error?'error':'information'} for ${row.full_name}`} error={row.invitation_status==='failed'||Boolean(row.invitation_error)}>
                        {!row.zoom_enabled?'This event has no linked Zoom meeting. No Zoom confirmation can be sent.':row.invitation_status==='zoom_managed'?'Zoom enrollment is confirmed. Zoom sends the confirmation email; inbox delivery is not tracked here. The time shown is Zoom enrollment, which can be later than application signup.':row.invitation_status==='rate_limited'?'Zoom has limited registration requests. Please wait for the automatic retry rather than registering repeatedly.':row.invitation_status==='failed'?'The application registration is saved, but Zoom enrollment needs attention. Please review the error before retrying.':'The application registration is saved. Zoom enrollment has not yet completed; the confirmation email follows successful enrollment.'}
                        <p className="mt-2">Application signup: {formatIST(row.registered_at)}</p>
                        {row.invitation_error&&<p className="mt-2 font-semibold">{row.invitation_error}</p>}
                        {row.zoom_next_attempt_at&&row.invitation_status==='rate_limited'&&<p className="mt-2">Next retry: {formatIST(row.zoom_next_attempt_at)}</p>}
                      </InfoTooltip>
                    </div>
                    {row.zoom_registered_at&&<div className="mt-1 text-xs text-slate-500">Zoom registered: {formatIST(row.zoom_registered_at)}</div>}
                    {row.invitation_status==='zoom_managed'&&!row.zoom_registered_at&&<div className="mt-1 text-xs text-slate-500">Enrollment time unavailable</div>}
                    {row.invitation_status==='rate_limited'&&row.zoom_next_attempt_at&&<div className="mt-1 text-xs text-slate-500">Next retry: {formatIST(row.zoom_next_attempt_at)}</div>}
                    {row.invitation_status === 'zoom_managed' && /^\d{9,11}$/.test(row.zoom_meeting_id || '') ? (
                      <a href={`https://zoom.us/meeting/${row.zoom_meeting_id}#registration`} target="_blank" rel="noopener noreferrer"
                        className="admin-primary mt-2">Resend in Zoom</a>
                    ) : onSendZoomInvitation && <button type="button" disabled={!row.zoom_enabled || sendingStudentId !== null || (row.invitation_status === 'rate_limited' && new Date(row.zoom_next_attempt_at) > new Date())}
                      onClick={() => sendInvitation(row.id)}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-dos text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed">
                      {sendingStudentId === row.id ? 'Registering…' : 'Register with Zoom'}
                    </button>}

                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {onDeleteRegistration && <button
                      onClick={() => onDeleteRegistration(row.id)}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete Registration"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="px-6 py-12 text-center text-slate-500 font-medium">
                  <div className="flex flex-col items-center justify-center">
                    <Search className="h-8 w-8 text-slate-300 mb-3" />
                    <p>No participants match your search criteria.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
