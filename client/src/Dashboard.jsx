import { useAdminPage } from './utils/useAdminPage';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from './utils/adminApi';
import { TablePager } from './components/AdminDataTable';
import { UpcomingEvents } from './components/EventList';
import { Link } from 'react-router-dom';
import { Calendar, Users, RefreshCw, CheckCircle2, LogOut, ArrowLeft, Bell, Send } from 'lucide-react';

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

  const [totals,setTotals]=useState({registrations:0,episodes:0});
  const [recent,setRecent]=useState([]);
  const upcoming=useAdminPage('/events',{period:'upcoming',sort:'date_asc'});
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
  const [viewMode,setViewMode]=useState('summary');
  const [pushHistory, setPushHistory] = useState([]);
  const [pushStats, setPushStats] = useState({ total: 0, welcomeSent: 0 });
  const [pushForm, setPushForm] = useState({ title: '', body: '', url: '' });
  const [sendingPush, setSendingPush] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Toast Notification State
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 3000);
  };

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
    setLoading(true);setLoadError('');
    try {const r=await adminApi('/dashboard-overview');setTotals(r.totals);setRecent(r.recent);}
    catch(error){setLoadError(error.message);}
    finally{setLoading(false);}
  };
  const refreshDashboard = () => {fetchEpisodes();upcoming.refresh();};
  const fetchPushData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('adminToken');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const [historyRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/push/history`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_URL}/api/admin/push/stats`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      const historyData = await historyRes.json();
      const statsData = await statsRes.json();
      if (historyData.success) setPushHistory(historyData.data);
      if (statsData.success) setPushStats({ total: statsData.total, welcomeSent: statsData.welcomeSent });
    } catch (error) {
      console.error('Failed to fetch push data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendPush = async (e) => {
    e.preventDefault();
    if (!pushForm.title || !pushForm.body) return;
    setSendingPush(true);
    try {
      const token = localStorage.getItem('adminToken');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${API_URL}/api/admin/push/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(pushForm)
      });
      const result = await response.json();
      if (result.success) {
        showToast('Push Notification Sent!', 'success');
        setPushForm({ title: '', body: '', url: '' });
        fetchPushData();
      } else {
        showToast(result.error || 'Failed to send notification', 'error');
      }
    } catch (error) {
      showToast('Network error', 'error');
    } finally {
      setSendingPush(false);
    }
  };

  const handleToggleRegistration = async (episodeId, currentStatus) => {
    try {
      const token = localStorage.getItem('adminToken');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${API_URL}/api/episodes/${episodeId}/toggle-registration`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_registration_open: !currentStatus })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Server returned error status:', response.status, text);
        showToast(`Server Error (${response.status}): The backend might need to be restarted.`, 'error');
        return;
      }

      const result = await response.json();
      if (result.success) {
        upcoming.refresh();
        showToast(`Registration ${!currentStatus ? 'opened' : 'closed'} successfully`, 'success');
      } else {
        showToast(result.error || 'Failed to toggle registration status', 'error');
      }
    } catch (error) {
      console.error('Failed to toggle registration:', error);
      showToast('An error occurred while updating status.', 'error');
    }
  };

  useEffect(() => {
    fetchEpisodes();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/login');
  };

  const totalRegistrations = totals.registrations;
  const totalEpisodesCreated = totals.episodes;
  const progressPercentage = (currentWeek / TOTAL_WEEKS) * 100;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans relative">

      {/* Toast Notification */}
      <div
        className={`fixed top-4 right-4 z-50 transition-all duration-300 transform ${toast.visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'}`}
      >
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border ${toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {toast.type === 'error' ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
          <span className="font-semibold text-sm">{toast.message}</span>
        </div>
      </div>

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
                  className="h-9 px-3 bg-dos-light/20 text-dos hover:bg-dos hover:text-white rounded-full flex items-center justify-center transition-all focus:ring-2 focus:ring-dos focus:outline-none font-bold text-sm shadow-sm"
                  title="Admin menu" aria-expanded={profileOpen}
                >
                  Menu
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-50">
                    <div className="p-2 flex flex-col gap-1">
                      <button onClick={()=>{setProfileOpen(false);navigate('/admin/past-events');}} className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">Past events</button>
                      <button onClick={()=>{setProfileOpen(false);navigate('/admin/trash');}} className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">Trash</button>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <p className="text-sm text-slate-500">Event times are IST. Registration closes one hour before the start time, even when the registration toggle is enabled.</p>
        {loadError && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{loadError}</div>}

        {/* Header & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard Overview</h2>
            <p className="mt-1 text-slate-500 text-sm">Plan the next workshop and follow new registrations.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => { setViewMode('push'); fetchPushData(); }}
              className="inline-flex items-center justify-center px-4 py-2.5 border border-slate-200 shadow-sm text-sm font-semibold rounded-xl text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dos transition-all active:scale-95 cursor-pointer"
            >
              <Bell className="mr-2 h-4 w-4 text-amber-500" />
              Send Push Notification
            </button>
            <button onClick={() => navigate('/admin/invitations')}
              className="inline-flex items-center justify-center px-4 py-2.5 border border-slate-200 text-sm font-semibold rounded-xl text-slate-700 bg-white hover:bg-slate-50">Email Invitations</button>
            <button
              onClick={() => navigate('/admin/episodes/new')}
              className="inline-flex items-center justify-center px-4 py-2.5 border border-slate-200 shadow-sm text-sm font-semibold rounded-xl text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dos transition-all active:scale-95 cursor-pointer"
            >
              + Create Episode
            </button>
            <button
              onClick={viewMode === 'push' ? fetchPushData : refreshDashboard} disabled={loading || upcoming.loading}
              className="inline-flex items-center justify-center px-4 py-2.5 border border-transparent shadow-sm text-sm font-semibold rounded-xl text-white bg-dos hover:bg-dos-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dos transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total registrations</p><p className="mt-1 text-2xl font-bold">{loading?'—':totalRegistrations}</p><p className="mt-1 text-xs text-slate-400">Across all events, including past</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Program progress</p><p className="mt-1 text-2xl font-bold">Week {currentWeek} / {TOTAL_WEEKS}</p><div className="mt-3 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-dos" style={{width:`${progressPercentage}%`}}/></div></div>
          <div className="rounded-xl bg-dos p-4 text-white"><p className="text-xs font-semibold uppercase tracking-wide opacity-80">Total episodes created</p><p className="mt-1 text-2xl font-bold">{loading?'—':totalEpisodesCreated}</p><p className="mt-1 text-xs opacity-80">Includes completed and archived events</p></div>
        </div>

        {viewMode === 'push' ? (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4">
                <button onClick={() => setViewMode('summary')} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-600">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Bell className="h-5 w-5 text-dos" />
                  Push Notifications Management
                </h3>
                <div className="ml-auto flex gap-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                    {pushStats.total} Total Installs
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
                    {pushStats.welcomeSent} Welcome Messages Sent
                  </span>
                </div>
              </div>
              <div className="p-6">
                <form onSubmit={handleSendPush} className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Send className="h-4 w-4 text-dos" />
                    Send Custom Push Notification
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Title</label>
                      <input type="text" required value={pushForm.title} onChange={e => setPushForm({ ...pushForm, title: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-dos focus:outline-none" placeholder="Notification Title" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Target URL (Optional)</label>
                      <input type="text" value={pushForm.url} onChange={e => setPushForm({ ...pushForm, url: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-dos focus:outline-none" placeholder="e.g. / or https://example.com" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-bold text-slate-700 mb-1">Message Body</label>
                      <textarea required value={pushForm.body} onChange={e => setPushForm({ ...pushForm, body: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-dos focus:outline-none" placeholder="Notification message body..." rows="2"></textarea>
                    </div>
                  </div>
                  <button type="submit" disabled={sendingPush} className="inline-flex items-center justify-center px-6 py-2.5 bg-dos hover:bg-dos-dark text-white font-bold rounded-xl transition-all shadow-sm disabled:opacity-70">
                    {sendingPush ? 'Sending...' : 'Send to All Subscribers'}
                  </button>
                </form>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-bold text-slate-900">Notification History</h3>
              </div>
              <div className="p-0 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date & Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Title</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Body</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {pushHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {new Date(item.sent_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-bold rounded-md ${item.type === 'Manual' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">
                          {item.title}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 max-w-md truncate" title={item.body}>
                          {item.body}
                        </td>
                      </tr>
                    ))}
                    {pushHistory.length === 0 && (
                      <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500 font-medium">No push notifications sent yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3 items-start">
            <section className="lg:col-span-2 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><Calendar className="h-5 w-5 text-dos"/>Upcoming workshops</h2><Link to="/admin/past-events" className="text-sm font-semibold text-dos hover:underline">Past events →</Link></div>
              <p className="px-5 pt-4 text-xs text-slate-500">Upcoming and live sessions, nearest first. Completed workshops move to Past events automatically.</p>
              {upcoming.error&&<p role="alert" className="p-5 text-rose-700">{upcoming.error} <button className="underline" onClick={upcoming.refresh}>Retry</button></p>}
              {upcoming.loading?<p className="p-10 text-center text-slate-500">Loading upcoming workshops…</p>:!upcoming.error&&upcoming.result.data.length?<UpcomingEvents rows={upcoming.result.data} onToggle={handleToggleRegistration} onChanged={m=>{showToast(m);refreshDashboard();}}/>:!upcoming.error&&<div className="p-10 text-center"><p className="font-semibold">No upcoming workshops</p><p className="mt-2 text-sm text-slate-500">Create your next episode to open registrations.</p><Link to="/admin/episodes/new" className="mt-4 inline-block rounded-lg bg-dos px-4 py-2 text-sm font-semibold text-white">Create episode</Link></div>}
              <TablePager table={upcoming}/>
            </section>
            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5 text-dos"/>Recently registered</h2><p className="mt-1 text-xs text-slate-500">Latest 5 registrations across all workshops</p></div>
              {loading?<p className="p-5 text-slate-500">Loading recent attendees…</p>:loadError?<p className="p-5 text-sm text-rose-700">Recent registrations could not be refreshed.</p>:recent.length?<ol className="divide-y divide-slate-100">{recent.map((r,i)=><li key={i} className="p-5"><span className="text-xs font-bold text-dos">Episode {r.episode_number}</span><p className="mt-1 font-semibold break-words">{r.full_name}</p><p className="mt-1 text-sm text-slate-500 break-words">{r.college||'College not provided'}</p></li>)}</ol>:<p className="p-5 text-sm text-slate-500">No registrations yet.</p>}
            </section>
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
