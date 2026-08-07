import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import RegistrationTable from './RegistrationTable';
import { Calendar, Users, RefreshCw, ChevronDown, CheckCircle2, Trophy, LogOut } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();

  // Calculate current week based on date (Starts July 17, 2026)
  const getCurrentWeek = () => {
    const startTime = new Date('2026-07-17T23:59:59Z');
    const now = new Date();
    if (now <= startTime) return 1;
    const diffTime = Math.abs(now - startTime);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.min(52, 1 + Math.ceil(diffDays / 7));
  };

  const currentWeek = getCurrentWeek();

  const [activeEpisode, setActiveEpisode] = useState(currentWeek);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
      const response = await fetch('http://localhost:5000/api/change-password', {
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

  // We are planning for 52 weeks
  const TOTAL_WEEKS = 52;
  const allEpisodes = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);

  const fetchEpisodes = async () => {
    setLoading(true);
    const token = localStorage.getItem('adminToken');
    
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/episodes', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 401 || response.status === 403) {
        // Token is invalid or expired
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

  useEffect(() => {
    fetchEpisodes();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/login');
  };

  const currentData = data[activeEpisode] || [];
  const totalRegistrations = Object.values(data).flat().length;
  
  // Progress based on current calendar week
  const progressPercentage = (currentWeek / TOTAL_WEEKS) * 100;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <img src="/dos_logo.png" alt="DOS Logo" className="h-8 sm:h-10 w-auto object-contain drop-shadow-sm" />
              <h1 className="hidden sm:block text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-dos to-dos-dark whitespace-nowrap">
                Open Source Friday
              </h1>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Episode Dropdown Selector */}
              <div className="relative">
                <button 
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium py-2 px-4 rounded-lg transition-colors focus:ring-2 focus:ring-dos focus:outline-none"
                >
                  <Calendar className="h-4 w-4 text-slate-500" />
                  Episode {activeEpisode}
                  <ChevronDown className="h-4 w-4 text-slate-500 ml-1" />
                </button>
                
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-50">
                    <div className="max-h-64 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200">
                      {allEpisodes.map(ep => (
                        <button
                          key={ep}
                          onClick={() => {
                            setActiveEpisode(ep);
                            setDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                            activeEpisode === ep 
                              ? 'bg-dos-light/10 text-dos' 
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            Week {ep} 
                            {ep === currentWeek && <span className="text-[10px] uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-sm font-bold tracking-wider">Current</span>}
                          </span>
                          {data[ep] && data[ep].length > 0 && (
                            <span className="bg-dos-light/20 text-dos py-0.5 px-2 rounded-full text-xs">
                              {data[ep].length}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

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
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard Overview</h2>
            <p className="mt-1 text-slate-500 text-sm">Real-time metrics for your 52-week program.</p>
          </div>
          <button
            onClick={fetchEpisodes}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-dos hover:bg-dos-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dos transition-all active:scale-95"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
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
              <p className="text-white/80 text-sm font-medium uppercase tracking-wider">Currently Viewing</p>
              <h3 className="mt-2 text-3xl font-bold text-white">Episode {activeEpisode}</h3>
            </div>
            <p className="text-white mt-4 text-sm flex justify-between items-center bg-white/10 px-3 py-2 rounded-lg backdrop-blur-sm">
              <span>Registrations</span>
              <span className="font-bold text-lg">{currentData.length}</span>
            </p>
          </div>
        </div>

        {/* Data Table Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900">Episode {activeEpisode} Roster</h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
              {currentData.length} Participants
            </span>
          </div>
          
          <div className="p-0">
            {loading ? (
              <div className="flex flex-col justify-center items-center py-20 opacity-50">
                <RefreshCw className="h-10 w-10 text-dos animate-spin mb-4" />
                <p className="text-slate-500 font-medium">Loading data...</p>
              </div>
            ) : (
              <RegistrationTable data={currentData} />
            )}
          </div>
        </div>
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
