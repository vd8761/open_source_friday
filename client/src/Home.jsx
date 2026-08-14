import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, User, ArrowRight, PlayCircle, Video, MapPin } from 'lucide-react';

const Home = () => {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchEpisodes = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const response = await fetch(`${API_URL}/api/episodes`);
        const result = await response.json();
        if (result.success) {
          setEpisodes(result.episodes);
        }
      } catch (error) {
        console.error('Failed to fetch episodes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEpisodes();
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingEpisodes = episodes.filter(episode => {
    const epDate = new Date(episode.event_date);
    epDate.setHours(0, 0, 0, 0);
    return epDate >= today;
  });

  const completedEpisodes = episodes.filter(episode => {
    const epDate = new Date(episode.event_date);
    epDate.setHours(0, 0, 0, 0);
    return epDate < today;
  });

  const isRegistrationOpen = (episode) => {
    if (!episode || !episode.is_active) return false;
    try {
      const dateStr = String(episode.event_date).split('T')[0];
      const timeStr = String(episode.event_time).split('-')[0].trim();
      let hours = 0, minutes = 0;
      const time12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      const time24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (time12) {
        hours = parseInt(time12[1], 10);
        minutes = parseInt(time12[2], 10);
        const period = time12[3].toUpperCase();
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
      } else if (time24) {
        hours = parseInt(time24[1], 10);
        minutes = parseInt(time24[2], 10);
      } else return true;

      const [year, month, day] = dateStr.split('-').map(Number);
      const eventDate = new Date(year, month - 1, day, hours, minutes, 0);
      const cutoff = new Date(eventDate.getTime() - 60 * 60 * 1000);
      return new Date() < cutoff;
    } catch {
      return true;
    }
  };

  const renderEpisodeCard = (episode, isCompleted) => {
    const registrationOpen = isRegistrationOpen(episode);
    return (
    <div key={episode.id} className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col group relative ${isCompleted ? 'opacity-90 hover:opacity-100' : ''}`}>
      
      {/* Image Header */}
      <div className="h-48 relative">
        {/* Background Image Container */}
        <div className="absolute inset-0 overflow-hidden rounded-t-2xl">
          {(isCompleted && episode.past_cover_photo_url) || episode.cover_photo_url ? (
            <img 
              src={isCompleted && episode.past_cover_photo_url ? episode.past_cover_photo_url : episode.cover_photo_url} 
              alt={episode.title} 
              className={`w-full h-full object-cover transition-all duration-500 ${isCompleted && !episode.past_cover_photo_url ? 'grayscale opacity-80' : isCompleted ? '' : 'group-hover:scale-105'}`}
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${isCompleted ? 'bg-slate-200' : 'bg-gradient-to-br from-dos to-dos-dark'}`}>
              <User className={`h-16 w-16 ${isCompleted ? 'text-slate-400' : 'text-white/50'}`} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent z-10"></div>
        </div>
        
        {/* Episode Badge */}
        <div className={`absolute top-4 left-4 z-20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold shadow-sm ${isCompleted ? 'bg-slate-800/90 text-white' : 'bg-white/90 text-dos'}`}>
          {isCompleted ? `Completed - EP ${episode.episode_number}` : `EP ${episode.episode_number}`}
        </div>
        
        {/* Event Mode Badge */}
        <div className={`absolute bottom-4 right-4 z-30 backdrop-blur-sm px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider shadow-md flex items-center gap-1.5 ${isCompleted ? 'bg-slate-800/95 text-slate-300' : 'bg-white/95 text-slate-700'}`}>
          {(!episode.event_mode || episode.event_mode === 'Online') ? (
            <Video className={`w-3.5 h-3.5 ${isCompleted ? 'text-slate-400' : 'text-emerald-500'}`} />
          ) : (
            <MapPin className={`w-3.5 h-3.5 ${isCompleted ? 'text-slate-400' : 'text-amber-500'}`} />
          )}
          {(!episode.event_mode || episode.event_mode === 'Online') ? 'Online Event' : 'Offline Event'}
        </div>
      </div>

      <div className="p-6 flex flex-col flex-1 relative z-20">
        <h4 className="text-xl font-bold text-slate-900 mb-1 line-clamp-2">{episode.title}</h4>
        <p className="text-slate-800 font-bold mb-1">{episode.presenter_name}</p>
        <p className="text-slate-500 text-sm mb-4 line-clamp-1">{episode.presenter_designation}</p>
        
        <div className="flex flex-col gap-2 mb-6">
          <div className="flex items-center text-sm font-medium text-slate-600">
            <Calendar className="h-4 w-4 text-dos mr-2 flex-shrink-0" />
            {new Date(episode.event_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="flex items-center text-sm font-medium text-slate-600">
            <Clock className="h-4 w-4 text-dos mr-2 flex-shrink-0" />
            {episode.event_time}
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-slate-100">
          <button
            onClick={() => navigate(`/register/episode-${episode.episode_number}`)}
            className={`w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white focus:outline-none transition-all active:scale-95 ${
              isCompleted 
                ? 'bg-slate-800 hover:bg-slate-900' 
                : !registrationOpen 
                  ? 'bg-amber-500 hover:bg-amber-600 focus:ring-2 focus:ring-offset-2 focus:ring-amber-500' 
                  : 'bg-dos hover:bg-dos-dark focus:ring-2 focus:ring-offset-2 focus:ring-dos'
            }`}
          >
            {isCompleted ? 'View Episode Details' : !registrationOpen ? 'Registration Closed' : 'Register Now'}
            {isCompleted ? <PlayCircle className="ml-2 h-4 w-4" /> : <ArrowRight className="ml-2 h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans flex flex-col">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 cursor-pointer" onClick={() => window.scrollTo(0, 0)} onDoubleClick={() => navigate('/login')} title="Double click for Admin">
              <img src="/dos_logo.png" alt="DOS Logo" className="h-8 sm:h-10 w-auto object-contain drop-shadow-sm" />
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-dos to-dos-dark text-white py-20 px-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-white opacity-10 rounded-full blur-3xl"></div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="flex justify-center mb-10">
            <img src="/Open_Source_Fridays_white_logo.png" alt="Open Source Fridays (OSF)" className="h-16 sm:h-20 md:h-24 w-auto object-contain drop-shadow-md" />
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6">
            Join the Open Source Revolution
          </h2>
          <p className="text-lg md:text-xl text-white/90 mb-10 max-w-2xl mx-auto leading-relaxed">
            Discover, learn, and contribute to cutting-edge open source projects every Friday with Descience Open Source Club. Find an upcoming session below and secure your spot!
          </p>
        </div>
      </div>

      {/* Main Content - Episodes List */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-dos border-t-transparent"></div>
          </div>
        ) : episodes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <h4 className="text-xl font-bold text-slate-700 mb-2">No episodes found</h4>
            <p className="text-slate-500">Check back later for new Open Source Friday sessions!</p>
          </div>
        ) : (
          <>
            {/* Upcoming Episodes Section */}
            {upcomingEpisodes.length > 0 && (
              <div className="mb-16">
                <div className="mb-10 text-center">
                  <h3 className="text-3xl font-bold text-slate-900 tracking-tight">Upcoming Episodes</h3>
                  <p className="mt-2 text-slate-500">Register for our next open source deep-dive</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {upcomingEpisodes.map(ep => renderEpisodeCard(ep, false))}
                </div>
              </div>
            )}

            {/* Completed Episodes Section */}
            {completedEpisodes.length > 0 && (
              <div>
                <div className="mb-10 text-center border-t border-slate-200 pt-16">
                  <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Past Episodes</h3>
                  <p className="mt-2 text-slate-500">Catch up on previous sessions</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {completedEpisodes.map(ep => renderEpisodeCard(ep, true))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 py-10 text-center border-t border-slate-800">
        <p className="text-slate-400 text-sm font-medium">
          &copy; {new Date().getFullYear()} Descience Open Source Club. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default Home;
