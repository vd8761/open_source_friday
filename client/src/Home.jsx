import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, User, ArrowRight } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans flex flex-col">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 cursor-pointer" onClick={() => window.scrollTo(0, 0)}>
              <img src="/dos_logo.png" alt="DOS Logo" className="h-8 sm:h-10 w-auto object-contain drop-shadow-sm" />
              <h1 className="hidden sm:block text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-dos to-dos-dark whitespace-nowrap">
                Open Source Friday
              </h1>
            </div>
            

          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-dos to-dos-dark text-white py-20 px-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-white opacity-10 rounded-full blur-3xl"></div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
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
        <div className="mb-10 text-center">
          <h3 className="text-3xl font-bold text-slate-900 tracking-tight">Upcoming Episodes</h3>
          <p className="mt-2 text-slate-500">Register for our next open source deep-dive</p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-dos border-t-transparent"></div>
          </div>
        ) : episodes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <h4 className="text-xl font-bold text-slate-700 mb-2">No upcoming episodes</h4>
            <p className="text-slate-500">Check back later for new Open Source Friday sessions!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {episodes.map((episode) => (
              <div key={episode.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col group relative">
                
                {/* Presenter Image Header */}
                <div className="h-48 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent z-10"></div>
                  {episode.presenter_photo_url ? (
                    <img 
                      src={episode.presenter_photo_url} 
                      alt={episode.presenter_name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                      <User className="h-16 w-16 text-slate-400" />
                    </div>
                  )}
                  
                  {/* Episode Badge */}
                  <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-dos shadow-sm">
                    Episode {episode.episode_number}
                  </div>
                  
                  {/* Presenter Name (Overlay) */}
                  <div className="absolute bottom-4 left-4 right-4 z-20">
                    <p className="text-white font-bold text-lg leading-tight">{episode.presenter_name}</p>
                    <p className="text-white/80 text-sm font-medium">{episode.presenter_designation}</p>
                  </div>
                </div>

                <div className="p-6 flex flex-col flex-1">
                  <h4 className="text-xl font-bold text-slate-900 mb-3 line-clamp-2">{episode.title}</h4>
                  
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
                      onClick={() => navigate(`/register/${episode.episode_number}`)}
                      className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-dos hover:bg-dos-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dos transition-all active:scale-95"
                    >
                      Register Now
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
