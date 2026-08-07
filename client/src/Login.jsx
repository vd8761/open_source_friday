import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, KeyRound, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setUsernameError('');
    setPasswordError('');
    
    let isValid = true;
    if (!username.trim()) {
      setUsernameError('Please enter your admin username.');
      isValid = false;
    }
    if (!password) {
      setPasswordError('Please enter your password.');
      isValid = false;
    }

    if (!isValid) return;

    setLoading(true);

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (result.success) {
        localStorage.setItem('adminToken', result.token);
        navigate('/dashboard');
      } else {
        setError(result.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left Pane - Branding (Hidden on Mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-dos to-dos-dark flex-col justify-center items-center relative overflow-hidden">
        {/* Abstract Blobs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-black rounded-full mix-blend-overlay filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        
        <div className="relative z-10 text-center px-12">
          <div className="bg-white p-6 rounded-3xl inline-flex items-center justify-center shadow-2xl mb-8">
            <img src="/dos_logo.png" alt="DOS Logo" className="h-16 w-auto object-contain" />
          </div>
          <h1 className="text-4xl font-extrabold text-white mb-4">Open Source Friday</h1>
          <p className="text-white/80 text-lg font-medium max-w-md mx-auto leading-relaxed">
            Manage your 52-week program, track participant progress, and access real-time registration analytics.
          </p>
        </div>
      </div>

      {/* Right Pane - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-8 sm:px-12 lg:px-24 bg-[#f8fafc] lg:bg-white relative">
        {/* Mobile Logo (Only visible on small screens) */}
        <div className="lg:hidden bg-white py-4 px-8 rounded-2xl inline-flex items-center justify-center shadow-md mb-10 mt-10">
          <img src="/dos_logo.png" alt="DOS Logo" className="h-12 w-auto object-contain" />
        </div>

        <div className="w-full max-w-md">
          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Welcome Back</h2>
            <p className="text-slate-500 mt-2 font-medium">Please sign in to your admin account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium border border-red-100 flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className={`h-5 w-5 ${usernameError ? 'text-red-400' : 'text-slate-400'}`} />
                  </div>
                  <input
                    type="text"
                    className={`block w-full pl-11 pr-4 py-3.5 border rounded-xl focus:ring-2 transition-all font-medium text-slate-900 bg-slate-50 focus:bg-white
                      ${usernameError 
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                        : 'border-slate-200 focus:ring-dos focus:border-dos'
                      }`}
                    placeholder="Enter admin username"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (usernameError) setUsernameError('');
                    }}
                  />
                </div>
                {usernameError && <p className="mt-2 text-sm text-red-600 font-medium">{usernameError}</p>}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <KeyRound className={`h-5 w-5 ${passwordError ? 'text-red-400' : 'text-slate-400'}`} />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    className={`block w-full pl-11 pr-12 py-3.5 border rounded-xl focus:ring-2 transition-all font-medium text-slate-900 bg-slate-50 focus:bg-white
                      ${passwordError 
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                        : 'border-slate-200 focus:ring-dos focus:border-dos'
                      }`}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {passwordError && <p className="mt-2 text-sm text-red-600 font-medium">{passwordError}</p>}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-dos hover:bg-dos-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dos transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-4"
            >
              {loading ? 'Authenticating...' : 'Secure Sign In'}
              {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
            </button>
          </form>

          <p className="text-center lg:text-left text-slate-400 text-xs mt-10 font-medium">
            Powered by Descience Open Source Club
          </p>
        </div>
      </div>
    </div>
  );
}
