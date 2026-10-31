import { formatIST } from './utils/dateTime';
import ConfirmDialog from './components/ConfirmDialog';
import { useAdminPage } from './utils/useAdminPage';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from './utils/adminApi';
import { TablePager } from './components/AdminDataTable';
import { UpcomingEvents } from './components/EventList';
import { Link } from 'react-router-dom';
import { Calendar, Users, RefreshCw, CheckCircle2, ArrowLeft, Bell, Send } from 'lucide-react';

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
  const [registrationChange,setRegistrationChange]=useState(null),[changingRegistration,setChangingRegistration]=useState(false),[registrationError,setRegistrationError]=useState('');

  // Toast Notification State
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 3000);
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

  const handleToggleRegistration = (episodeId,currentStatus) => {setRegistrationError('');setRegistrationChange({episodeId,currentStatus});};
  const confirmRegistrationChange = async () => {
    const {episodeId,currentStatus}=registrationChange;setChangingRegistration(true);setRegistrationError('');
    try {
      const response=await fetch(`${import.meta.env.VITE_API_URL||'http://localhost:5000'}/api/episodes/${episodeId}/toggle-registration`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('adminToken')}`},body:JSON.stringify({is_registration_open:!currentStatus})});
      if(response.status===401||response.status===403){localStorage.removeItem('adminToken');navigate('/login');return;}
      const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||'Unable to update registrations. Please try again.');
      upcoming.refresh();setRegistrationChange(null);showToast(`Registration ${currentStatus?'closed':'opened'} successfully.`);
    } catch(e){setRegistrationError(e.message);}finally{setChangingRegistration(false);}
  };

  useEffect(() => {
    fetchEpisodes();
  }, []);



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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {loadError && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{loadError}</div>}

        {/* Header & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="mt-1 text-slate-500 text-sm">Plan the next workshop and follow new registrations.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => { setViewMode('push'); fetchPushData(); }}
              className="admin-action"
            >
              <Bell className="mr-2 h-4 w-4 text-amber-500" />
              Send Push Notification
            </button>
            <button
              onClick={() => navigate('/admin/episodes/new')}
              className="admin-primary"
            >
              Create event
            </button>
            <button
              onClick={viewMode === 'push' ? fetchPushData : refreshDashboard} disabled={loading || upcoming.loading}
              className="admin-action"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total registrations</p><p className="mt-1 text-2xl font-bold">{loading||loadError?'—':totalRegistrations}</p><p className="mt-1 text-xs text-slate-400">Across all events, including past</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Program progress</p><p className="mt-1 text-2xl font-bold">Week {currentWeek} / {TOTAL_WEEKS}</p><div className="mt-3 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-dos" style={{width:`${progressPercentage}%`}}/></div></div>
          <div className="rounded-xl bg-dos p-4 text-white"><p className="text-xs font-semibold uppercase tracking-wide opacity-80">Total episodes created</p><p className="mt-1 text-2xl font-bold">{loading||loadError?'—':totalEpisodesCreated}</p><p className="mt-1 text-xs opacity-80">Includes completed and archived events</p></div>
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
                          {formatIST(item.sent_at)}
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
          <div className="grid gap-6 lg:grid-cols-3 items-stretch">
            <section className="lg:col-span-2 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex min-h-[88px] flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="flex items-center gap-2 text-lg font-bold"><Calendar className="h-5 w-5 text-dos"/>Upcoming workshops</h2><p className="mt-1 text-xs text-slate-500">Upcoming and live sessions, nearest first</p></div><Link to="/admin/past-events" className="text-sm font-semibold text-dos hover:underline">Past events →</Link></div>
              {upcoming.error&&<p role="alert" className="p-5 text-rose-700">{upcoming.error} <button className="underline" onClick={upcoming.refresh}>Retry</button></p>}
              {upcoming.loading?<p className="p-10 text-center text-slate-500">Loading upcoming workshops…</p>:!upcoming.error&&upcoming.result.data.length?<UpcomingEvents rows={upcoming.result.data} onToggle={handleToggleRegistration} onChanged={m=>{showToast(m);refreshDashboard();}}/>:!upcoming.error&&<div className="p-10 text-center"><p className="font-semibold">No upcoming workshops</p><p className="mt-2 text-sm text-slate-500">Create your next episode to open registrations.</p><Link to="/admin/episodes/new" className="mt-4 inline-block rounded-lg bg-dos px-4 py-2 text-sm font-semibold text-white">Create episode</Link></div>}
              <TablePager table={upcoming} compact/>
            </section>
            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="min-h-[88px] border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5 text-dos"/>Recently registered</h2><p className="mt-1 text-xs text-slate-500">Latest 5 registrations · all workshops</p></div>
              {loading?<p className="p-5 text-slate-500">Loading recent attendees…</p>:loadError?<p className="p-5 text-sm text-rose-700">Recent registrations could not be refreshed.</p>:recent.length?<ol className="divide-y divide-slate-100">{recent.map((r,i)=><li key={i} className="grid grid-cols-[1rem_2.25rem_minmax(0,1fr)] items-center gap-3 px-4 py-3"><span className="text-xs text-slate-400" aria-label={`Serial number ${i+1}`}>{i+1}</span><span aria-label={`Episode ${r.episode_number}`} className="rounded-md bg-dos-light/10 px-1 py-1.5 text-center text-xs font-bold text-dos">#{r.episode_number}</span><div className="min-w-0"><p className="truncate text-sm font-semibold" title={r.full_name}>{r.full_name}</p><p className="mt-0.5 truncate text-xs text-slate-500" title={r.college||'College not provided'}>{r.college||'College not provided'}</p></div></li>)}</ol>:<p className="p-5 text-sm text-slate-500">No registrations yet.</p>}
            </section>
          </div>
        )}
      </main>

      {registrationChange&&<ConfirmDialog title={`${registrationChange.currentStatus?'Close':'Open'} registrations?`} confirmLabel={registrationChange.currentStatus?'Close registrations':'Open registrations'} cancelLabel="Keep current setting" danger={registrationChange.currentStatus} busy={changingRegistration} error={registrationError} onConfirm={confirmRegistrationChange} onCancel={()=>setRegistrationChange(null)}><p>Would you like to {registrationChange.currentStatus?'pause':'allow'} new registrations for <strong>Episode {upcoming.result.data.find(e=>e.id===registrationChange.episodeId)?.episode_number}</strong>?</p><p>{registrationChange.currentStatus?'Existing registrations will be kept. Please reopen registrations when you are ready to accept more attendees.':'Registration can remain open until 30 minutes after the scheduled start, provided the event is active.'}</p></ConfirmDialog>}


    </div>
  );
}
