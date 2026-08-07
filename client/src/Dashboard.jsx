import React, { useState, useEffect } from 'react';
import RegistrationTable from './RegistrationTable';
import { Calendar, Users, RefreshCw, ChevronDown, CheckCircle2, Trophy } from 'lucide-react';

export default function Dashboard() {
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

  // We are planning for 52 weeks
  const TOTAL_WEEKS = 52;
  const allEpisodes = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);

  const fetchEpisodes = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/episodes');
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
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2 rounded-lg shadow-inner">
                <Trophy className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 to-purple-700">
                Open Source Friday
              </h1>
            </div>
            
            {/* Episode Dropdown Selector */}
            <div className="relative">
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium py-2 px-4 rounded-lg transition-colors focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                            ? 'bg-indigo-50 text-indigo-700' 
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          Week {ep} 
                          {ep === currentWeek && <span className="text-[10px] uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-sm font-bold tracking-wider">Current</span>}
                        </span>
                        {data[ep] && data[ep].length > 0 && (
                          <span className="bg-indigo-100 text-indigo-700 py-0.5 px-2 rounded-full text-xs">
                            {data[ep].length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all active:scale-95"
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
          <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl shadow-md p-6 text-white flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-2xl"></div>
            <div>
              <p className="text-indigo-200 text-sm font-medium uppercase tracking-wider">Currently Viewing</p>
              <h3 className="mt-2 text-3xl font-bold text-white">Episode {activeEpisode}</h3>
            </div>
            <p className="text-indigo-100 mt-4 text-sm flex justify-between items-center bg-white/10 px-3 py-2 rounded-lg backdrop-blur-sm">
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
                <RefreshCw className="h-10 w-10 text-indigo-500 animate-spin mb-4" />
                <p className="text-slate-500 font-medium">Loading data...</p>
              </div>
            ) : (
              <RegistrationTable data={currentData} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
