import React from 'react';
import { UserX } from 'lucide-react';

export default function RegistrationTable({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="bg-slate-100 p-6 rounded-full mb-4">
          <UserX className="h-12 w-12 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900">No registrations found</h3>
        <p className="mt-2 text-slate-500 max-w-sm text-center">
          There are no participants registered for this specific episode yet. Check back later once the forms are submitted!
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
            <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Participant</th>
            <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact Info</th>
            <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Institution</th>
            <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Course Details</th>
            <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">DOS Club</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {data.map((row, idx) => (
            <tr key={idx} className="hover:bg-indigo-50/50 transition-colors group">
              <td className="px-6 py-5 whitespace-nowrap text-sm text-slate-500 font-medium">
                {new Date(row.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </td>
              <td className="px-6 py-5 whitespace-nowrap">
                <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{row.full_name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{row.gender}</div>
              </td>
              <td className="px-6 py-5 whitespace-nowrap">
                <div className="text-sm text-slate-700">{row.email}</div>
                <div className="text-xs text-slate-500 mt-0.5">{row.whatsapp_number}</div>
              </td>
              <td className="px-6 py-5 whitespace-nowrap">
                <div className="text-sm font-medium text-slate-800 truncate max-w-[200px]" title={row.college}>
                  {row.college}
                </div>
              </td>
              <td className="px-6 py-5 whitespace-nowrap">
                <div className="text-sm text-slate-800">{row.degree}</div>
                <div className="text-xs text-slate-500 mt-0.5">{row.department} <span className="text-slate-300 mx-1">•</span> Year {row.year_of_study}</div>
              </td>
              <td className="px-6 py-5 whitespace-nowrap">
                <span className={`px-3 py-1 inline-flex text-xs font-bold rounded-full border ${
                  row.is_dos_club_member && row.is_dos_club_member.toLowerCase().includes('yes') 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  {row.is_dos_club_member || 'N/A'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
