import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import RegistrationTable from './RegistrationTable';
import { Calendar, Users, RefreshCw, ChevronRight, CheckCircle2, Trophy, LogOut, ArrowLeft } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();

  const getCurrentWeek = () => {
    const startTime = new Date('2026-07-17T23:59:59Z');
    const now = new Date();
    if (now <= startTime) return 1;
    const diffTime = Math.abs(now - startTime);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.min(52, 1 + Math.ceil(diffDays / 7));
  };

  const currentWeek = getCurrentWeek();

  const [activeEpisode, setActiveEpisode] = useState(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState(null);
  const [data, setData] = useState([]); // List of episodes
  const [registrations, setRegistrations] = useState([]); // Registrations for active episode
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('summary'); // 'summary' or 'roster'
  const [profileOpen, setProfileOpen] = useState(false);

  // Change Password State
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }

    setChangingPassword(true);
    try {
      const token = localStorage.getItem('adminToken');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${API_URL}/api/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ oldPassword, newPassword })
      });

      const result = await response.json();
      if (result.success) {
        setPasswordSuccess('Password updated successfully!');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setChangePasswordModalOpen(false);
          setPasswordSuccess('');
        }, 1500);
      } else {
        setPasswordError(result.error || 'Failed to change password');
      }
    } catch (err) {
      setPasswordError('Network error. Please try again.');
    } finally {
      setChangingPassword(false);
    }
  };

  const TOTAL_WEEKS = 52;

  const fetchEpisodes = async () => {
    setLoading(true);
    const token = localStorage.getItem('adminToken');
    
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${API_URL}/api/admin/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('adminToken');
        navigate('/login');
        return;
      }

      const result = await response.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewRoster = (episode) => {
    setActiveEpisode(episode.episode_number);
    setActiveEpisodeId(episode.id);
    setViewMode('roster');
    setLoading(true);
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const token = localStorage.getItem('adminToken');
    fetchRegistrations(episode.id, token, API_URL);
  };

  const fetchRegistrations = async (episodeId, token, API_URL) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/episodes/${episodeId}/registrations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const result = await response.json();
      if (result.success) {
        setRegistrations(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch registrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRegistration = async (studentId) => {
    if (!window.confirm('Are you sure you want to delete this registration?')) {
      return;
    }

    try {
      const token = localStorage.getItem('adminToken');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${API_URL}/api/admin/episodes/${activeEpisodeId}/registrations/${studentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const result = await response.json();
      if (result.success) {
        // Remove from state
        setRegistrations(prev => prev.filter(r => r.id !== studentId));
      } else {
        alert(result.error || 'Failed to delete registration');
      }
    } catch (error) {
      console.error('Failed to delete registration:', error);
      alert('An error occurred while deleting.');
    }
  };

  const handleDownloadCSV = () => {
    if (registrations.length === 0) return;
    
    const headers = ['Full Name', 'Email', 'WhatsApp', 'Gender', 'College', 'Degree', 'Department', 'Year of Study', 'DOS Member', 'Topic', 'Registered At'];
    
    const csvRows = [headers.join(',')];
    
    registrations.forEach(row => {
      const values = [
        `"${row.full_name || ''}"`,
        `"${row.email || ''}"`,
        `"${row.whatsapp_number || ''}"`,
        `"${row.gender || ''}"`,
        `"${row.college || ''}"`,
        `"${row.degree || ''}"`,
        `"${row.department || ''}"`,
        `"${row.year_of_study || ''}"`,
        `"${row.is_dos_club_member || ''}"`,
        `"${(row.excited_topic || '').replace(/"/g, '""')}"`,
        `"${row.registered_at ? new Date(row.registered_at).toLocaleString() : ''}"`
      ];
      csvRows.push(values.join(','));
    });
    
    const csvData = csvRows.join('\n');
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `episode_${activeEpisode}_registrations.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  useEffect(() => {
    fetchEpisodes();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/login');
  };

  const totalRegistrations = data.reduce((acc, ep) => acc + parseInt(ep.registration_count || 0, 10), 0);
  const totalEpisodesCreated = data.length;
  const progressPercentage = (currentWeek / TOTAL_WEEKS) * 100;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 cursor-pointer" onClick={() => setViewMode('summary')}>
              <img src="/dos_logo.png" alt="DOS Logo" className="h-8 sm:h-10 w-auto object-contain drop-shadow-sm" />
              <h1 className="hidden sm:block text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-dos to-dos-dark whitespace-nowrap">
                Open Source Friday
              </h1>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Profile Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="h-9 w-9 bg-dos-light/20 text-dos hover:bg-dos hover:text-white rounded-full flex items-center justify-center transition-all focus:ring-2 focus:ring-dos focus:outline-none font-bold text-sm shadow-sm"
                  title="Profile"
                >
                  A
                </button>
                
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-50">
                    <div className="p-2 flex flex-col gap-1">
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          setChangePasswordModalOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                      >
                        Change Password
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Header & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard Overview</h2>
            <p className="mt-1 text-slate-500 text-sm">Real-time metrics for your 52-week program.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => navigate('/admin/episodes/new')}
              className="inline-flex items-center justify-center px-4 py-2.5 border border-slate-200 shadow-sm text-sm font-semibold rounded-xl text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dos transition-all active:scale-95"
            >
              + Create Episode
            </button>
            <button
              onClick={viewMode === 'summary' ? fetchEpisodes : () => fetchRegistrations(activeEpisodeId, localStorage.getItem('adminToken'), import.meta.env.VITE_API_URL || 'http://localhost:5000')}
              className="inline-flex items-center justify-center px-4 py-2.5 border border-transparent shadow-sm text-sm font-semibold rounded-xl text-white bg-dos hover:bg-dos-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dos transition-all active:scale-95"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Registrations</p>
                <p className="mt-2 text-4xl font-extrabold text-slate-900">{totalRegistrations}</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-xl">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Program Progress</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">Week {currentWeek} / {TOTAL_WEEKS}</p>
              </div>
              <div className="bg-emerald-50 p-4 rounded-xl">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-2.5">
              <div 
                className="bg-emerald-500 h-2.5 rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${Math.max(progressPercentage, 2)}%` }}
              ></div>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-gradient-to-br from-dos to-dos-dark rounded-2xl shadow-md p-6 text-white flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-2xl"></div>
            <div>
              <p className="text-white/80 text-sm font-medium uppercase tracking-wider">Total Episodes Created</p>
              <h3 className="mt-2 text-4xl font-extrabold text-white">{totalEpisodesCreated}</h3>
            </div>
            <p className="text-white mt-4 text-sm flex justify-between items-center bg-white/10 px-3 py-2 rounded-lg backdrop-blur-sm">
              <span>Goal</span>
              <span className="font-bold text-lg">{TOTAL_WEEKS} Episodes</span>
            </p>
          </div>
        </div>

        {/* Data Table Section */}
        {viewMode === 'summary' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-dos" />
                All Events Summary
              </h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-dos-light/20 text-dos">
                {data.length} Events
              </span>
            </div>
            
            <div className="p-0 overflow-x-auto">
              {loading ? (
                <div className="flex flex-col justify-center items-center py-20 opacity-50">
                  <RefreshCw className="h-10 w-10 text-dos animate-spin mb-4" />
                  <p className="text-slate-500 font-medium">Loading events...</p>
                </div>
              ) : data.length === 0 ? (
                <div className="flex flex-col justify-center items-center py-20 opacity-50">
                  <p className="text-slate-500 font-medium">No episodes created yet.</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Episode</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Title</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date & Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Presenter</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Registrations</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {data.map((episode) => (
                      <tr key={episode.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-sm font-bold bg-slate-100 text-slate-800">
                            #{episode.episode_number}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-slate-900 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg line-clamp-2" title={episode.title}>
                            {episode.title}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-slate-900">
                              {episode.event_date ? new Date(episode.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                            </span>
                          <div className="text-xs text-slate-500">
                            {episode.event_time || 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {episode.presenter_photo_url && (
                              <img className="h-8 w-8 rounded-full object-cover mr-3" src={episode.presenter_photo_url} alt="" />
                            )}
                            <div>
                              <div className="text-sm font-medium text-slate-900">{episode.presenter_name}</div>
                              <div className="text-xs text-slate-500">{episode.presenter_designation}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold bg-dos-light/20 text-dos">
                            {episode.registration_count || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => navigate(`/admin/episodes/edit/${episode.id}`)}
                              className="text-slate-500 hover:text-slate-700 font-medium inline-flex items-center gap-1 transition-colors bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleViewRoster(episode)}
                              className="text-dos hover:text-dos-dark font-bold inline-flex items-center gap-1 transition-colors bg-dos-light/10 hover:bg-dos-light/20 px-3 py-1.5 rounded-lg"
                            >
                              View Roster
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setViewMode('summary')}
                  className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-600"
                  title="Back to Events Summary"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h3 className="text-lg font-bold text-slate-900">Episode {activeEpisode} Roster</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownloadCSV}
                  disabled={registrations.length === 0}
                  className="inline-flex items-center px-3 py-1.5 border border-slate-200 shadow-sm text-xs font-bold rounded-lg text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dos transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Download CSV
                </button>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                  {registrations.length} Participants
                </span>
              </div>
            </div>
            
            <div className="p-0">
              {loading ? (
                <div className="flex flex-col justify-center items-center py-20 opacity-50">
                  <RefreshCw className="h-10 w-10 text-dos animate-spin mb-4" />
                  <p className="text-slate-500 font-medium">Loading data...</p>
                </div>
              ) : registrations.length === 0 ? (
                <div className="flex flex-col justify-center items-center py-20 opacity-50">
                  <p className="text-slate-500 font-medium">No registrations for this episode yet.</p>
                </div>
              ) : (
                <RegistrationTable 
                  data={registrations} 
                  onDeleteRegistration={handleDeleteRegistration} 
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Change Password Modal */}
      {changePasswordModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900">Change Admin Password</h3>
              <button 
                onClick={() => setChangePasswordModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              {passwordError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium border border-red-100">
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="bg-emerald-50 text-emerald-600 p-3 rounded-lg text-sm font-medium border border-emerald-100 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {passwordSuccess}
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Current Password</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-dos focus:border-dos text-sm"
                  placeholder="Enter current password"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-dos focus:border-dos text-sm"
                  placeholder="Enter new password (min 6 chars)"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-dos focus:border-dos text-sm"
                  placeholder="Re-enter new password"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setChangePasswordModalOpen(false)}
                  className="flex-1 py-2 px-4 border border-slate-200 rounded-xl shadow-sm text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="flex-1 py-2 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-dos hover:bg-dos-dark transition-colors disabled:opacity-50"
                >
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
