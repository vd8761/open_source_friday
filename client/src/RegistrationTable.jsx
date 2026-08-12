import React, { useState } from 'react';
import { Mail, GraduationCap, BookOpen, Phone, Search, UserX, Trash2 } from 'lucide-react';

export default function RegistrationTable({ data, onDeleteRegistration }) {
  const [searchTerm, setSearchTerm] = useState('');

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

  const filteredData = data.filter((row) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (row.full_name && row.full_name.toLowerCase().includes(searchLower)) ||
      (row.email && row.email.toLowerCase().includes(searchLower)) ||
      (row.college && row.college.toLowerCase().includes(searchLower)) ||
      (row.whatsapp_number && row.whatsapp_number.includes(searchLower))
    );
  });

  return (
    <div className="flex flex-col">
      <div className="p-4 border-b border-slate-100 bg-white/50">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-dos focus:border-dos transition-colors text-sm bg-white"
            placeholder="Search by name, email, college, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Registrant</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Academic Info</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Interests & Club</th>
              <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredData.length > 0 ? (
              filteredData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-dos-light to-dos flex items-center justify-center shadow-sm">
                        <span className="text-white font-bold text-sm">
                          {row.full_name ? row.full_name.charAt(0).toUpperCase() : '?'}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-bold text-slate-900 group-hover:text-dos transition-colors">{row.full_name}</div>
                        <div className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                          <Mail className="h-3 w-3" /> {row.email}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-900 font-medium flex items-center gap-1.5">
                      <GraduationCap className="h-4 w-4 text-slate-400" />
                      {row.degree} in {row.department}
                    </div>
                    <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4 text-slate-400" />
                      {row.college} • <span className="font-medium">Year {row.year_of_study}</span>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700 flex items-center gap-1.5">
                      <Phone className="h-4 w-4 text-slate-400" />
                      {row.whatsapp_number}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 uppercase tracking-wide">
                      {row.gender}
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
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
                      <div className="text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded w-full truncate max-w-[200px]" title={row.excited_topic}>
                        <span className="font-medium text-slate-400 mr-1">Topic:</span>
                        {row.excited_topic}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => onDeleteRegistration && onDeleteRegistration(row.id)}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete Registration"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-slate-500 font-medium">
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
