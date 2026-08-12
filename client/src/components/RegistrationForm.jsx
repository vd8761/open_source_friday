import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, Clock, User, CheckCircle2, ChevronRight, ArrowLeft } from 'lucide-react';
import 'react-quill-new/dist/quill.snow.css';

const RegistrationForm = () => {
  const { episode_number: episodeParam } = useParams();
  const episodeNumber = episodeParam ? (episodeParam.startsWith('episode-') ? episodeParam.replace('episode-', '') : episodeParam) : null;
  const navigate = useNavigate();

  const [episodeDetails, setEpisodeDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Steps: 1 = Lookup, 2 = Confirm/Form, 3 = Success
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');

  const [studentFound, setStudentFound] = useState(false);
  const [studentData, setStudentData] = useState({
    email: '',
    whatsapp_number: '',
    full_name: '',
    gender: '',
    college: '',
    degree: '',
    department: '',
    year_of_study: '',
    is_dos_club_member: '',
    excited_topic: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!episodeNumber) {
      setError('No episode number provided.');
      setLoading(false);
      return;
    }

    const fetchEpisode = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const res = await fetch(`${API_URL}/api/episodes/${episodeNumber}`);
        const data = await res.json();
        if (data.success) {
          setEpisodeDetails(data.episode);
        } else {
          setError(data.error || 'Episode not found');
        }
      } catch (err) {
        setError('Failed to fetch episode details.');
      } finally {
        setLoading(false);
      }
    };

    fetchEpisode();
  }, [episodeNumber]);

  const [registerError, setRegisterError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setStudentData(prev => ({ ...prev, [name]: value }));
    setRegisterError('');
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleIdentifierChange = (e) => {
    setIdentifier(e.target.value);
    setLookupError('');
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!identifier) return;
    setIsSubmitting(true);
    setLookupError('');

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${API_URL}/api/students/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          identifier,
          episode_id: episodeDetails?.id 
        })
      });
      const data = await res.json();

      if (data.success) {
        if (data.already_registered) {
          setLookupError('You are already registered for this episode!');
          setIsSubmitting(false);
          return;
        }

        setStudentFound(true);
        setStudentData(data.student);
        if (identifier.includes('@')) {
          setStudentData(prev => ({ ...prev, email: identifier }));
        } else {
          setStudentData(prev => ({ ...prev, whatsapp_number: identifier }));
        }
      } else {
        setStudentFound(false);
        const emptyState = {
          email: '',
          whatsapp_number: '',
          full_name: '',
          gender: '',
          college: '',
          degree: '',
          department: '',
          year_of_study: '',
          is_dos_club_member: '',
          excited_topic: ''
        };
        if (identifier.includes('@')) {
          setStudentData({ ...emptyState, email: identifier });
        } else {
          setStudentData({ ...emptyState, whatsapp_number: identifier });
        }
      }
      setStep(2);
    } catch (err) {
      setLookupError('Error looking up student');
    } finally {
      setIsSubmitting(false);
    }
  };



  const validateForm = () => {
    const errors = {};
    const requiredFields = [
      { key: 'full_name', label: 'Full Name' },
      { key: 'email', label: 'Email' },
      { key: 'whatsapp_number', label: 'WhatsApp Number' },
      { key: 'gender', label: 'Gender' },
      { key: 'college', label: 'College Name' },
      { key: 'degree', label: 'Degree' },
      { key: 'department', label: 'Department / Branch' },
      { key: 'year_of_study', label: 'Year of Study' },
      { key: 'is_dos_club_member', label: 'DOS CLUB member' },
      { key: 'excited_topic', label: 'Excited topic' }
    ];
    
    requiredFields.forEach(field => {
      if (!studentData[field.key] || studentData[field.key].trim() === '') {
        errors[field.key] = 'This field is required';
      }
    });

    if (studentData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    
    if (step === 2 && !studentFound) {
      if (!validateForm()) {
        return;
      }
    }

    setIsSubmitting(true);
    setRegisterError('');
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_id: episodeDetails.id,
          is_existing: studentFound,
          student_id: studentData.id,
          ...studentData
        })
      });
      const data = await res.json();

      if (data.success) {
        setStep(3);
      } else {
        setRegisterError(data.error || 'Registration failed');
      }
    } catch (err) {
      setRegisterError('Error submitting registration');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-dos border-t-transparent"></div>
        <p className="mt-4 text-slate-500 font-medium">Loading episode details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-center items-center p-4">
        <div className="bg-red-50 text-red-600 p-6 rounded-2xl shadow-sm border border-red-100 text-center max-w-md w-full">
          <h3 className="text-xl font-bold mb-2">Oops!</h3>
          <p>{error}</p>
          <button onClick={() => navigate('/')} className="mt-6 px-4 py-2 bg-white text-slate-700 rounded-lg shadow-sm border border-slate-200 font-medium hover:bg-slate-50 transition-colors">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans flex flex-col">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 cursor-pointer" onClick={() => navigate('/')}>
              <img src="/dos_logo.png" alt="DOS Logo" className="h-8 sm:h-10 w-auto object-contain drop-shadow-sm" />
            </div>

            <button
              onClick={() => navigate('/')}
              className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              All Episodes
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full flex flex-col lg:flex-row gap-8 items-start">

        {/* Left Column - Episode Details */}
        <div className="w-full lg:w-1/3 bg-white rounded-3xl shadow-lg border border-slate-200 overflow-hidden lg:sticky lg:top-24">
          <div className="h-48 bg-gradient-to-br from-dos to-dos-dark relative overflow-hidden flex items-center justify-center">
            <div className="h-64 sm:h-80 relative overflow-hidden bg-slate-900">
              {(!episodeDetails.is_active && episodeDetails.past_cover_photo_url) || episodeDetails.cover_photo_url ? (
                <img 
                  src={(!episodeDetails.is_active && episodeDetails.past_cover_photo_url) ? episodeDetails.past_cover_photo_url : episodeDetails.cover_photo_url} 
                  alt={episodeDetails.title} 
                  className={`w-full h-full object-cover transition-all duration-700 ${!episodeDetails.is_active && !episodeDetails.past_cover_photo_url ? 'grayscale opacity-75 mix-blend-luminosity' : ''}`}
                />
              ) : (
                <User className="h-20 w-20 text-white/50 z-20" />
              )}
            </div>
            <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-dos shadow-sm">
              Episode {episodeDetails.episode_number}
            </div>
          </div>

          <div className="p-6 relative">
            {/* Presenter Profile Badge */}
            <div className="absolute -top-12 right-6 z-30 h-20 w-20 bg-white rounded-full p-1 shadow-lg">
              {episodeDetails.presenter_photo_url ? (
                <img
                  src={episodeDetails.presenter_photo_url}
                  alt={episodeDetails.presenter_name}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <div className="w-full h-full bg-slate-100 rounded-full flex items-center justify-center">
                  <User className="h-8 w-8 text-slate-400" />
                </div>
              )}
            </div>

            <h2 className="text-2xl font-extrabold text-slate-900 mb-2 pr-20">{episodeDetails.title}</h2>

            <div className="mb-4">
              <p className="font-bold text-slate-800">{episodeDetails.presenter_name}</p>
              <p className="text-sm text-slate-500">{episodeDetails.presenter_designation}</p>
            </div>

            <div className="space-y-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex items-center text-sm font-medium text-slate-700">
                <Calendar className="h-5 w-5 text-dos mr-3 flex-shrink-0" />
                {new Date(episodeDetails.event_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              <div className="flex items-center text-sm font-medium text-slate-700">
                <Clock className="h-5 w-5 text-dos mr-3 flex-shrink-0" />
                {episodeDetails.event_time}
              </div>
            </div>

            <div className="w-full">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">About this Episode</h4>
              <div
                className="editor-content text-slate-600 w-full break-words text-justify"
                dangerouslySetInnerHTML={{ __html: episodeDetails.description ? episodeDetails.description.replace(/&nbsp;/g, ' ') : '' }}
              />
            </div>
          </div>
        </div>

        {/* Right Column - Form */}
        <div className="w-full lg:w-2/3">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 sm:p-10 relative overflow-hidden">
            {/* Step Indicators */}
            {episodeDetails.is_active && (
              <div className="flex items-center justify-between mb-10 relative z-10">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex flex-col items-center flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-300 ${step >= s ? 'bg-dos text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}>
                      {s === 3 && step === 3 ? <CheckCircle2 className="h-5 w-5" /> : s}
                    </div>
                    <span className={`text-xs mt-2 font-medium ${step >= s ? 'text-dos' : 'text-slate-400'}`}>
                      {s === 1 ? 'Identify' : s === 2 ? 'Details' : 'Done'}
                    </span>
                  </div>
                ))}
                {/* Connecting Lines */}
                <div className="absolute top-5 left-[15%] right-[15%] h-[2px] bg-slate-100 -z-10">
                  <div
                    className="h-full bg-dos transition-all duration-500"
                    style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }}
                  ></div>
                </div>
              </div>
            )}

            {/* Step 1: Lookup or Inactive Message */}
            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                {!episodeDetails.is_active ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-3">Episode Concluded</h3>
                    <p className="text-slate-500 mb-8 max-w-md mx-auto">
                      Registration is closed because this episode has already been completed. Thank you for your interest!
                    </p>
                    <button
                      onClick={() => navigate('/')}
                      className="inline-flex items-center justify-center py-3 px-6 border border-slate-200 rounded-xl shadow-sm text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all"
                    >
                      Browse Upcoming Episodes
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Welcome! Let's get started.</h3>
                    <p className="text-slate-500 mb-8">Enter your email or WhatsApp number to begin registration.</p>
                <form onSubmit={handleLookup} className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Email or WhatsApp Number</label>
                    <input
                      type="text"
                      placeholder="e.g. john@example.com or 9876543210"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-dos focus:border-dos outline-none transition-all text-slate-900 font-medium"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center py-4 px-4 border border-transparent rounded-xl shadow-sm text-base font-bold text-white bg-dos hover:bg-dos-dark focus:outline-none transition-all active:scale-95 disabled:opacity-70"
                  >
                    {isSubmitting ? 'Checking...' : 'Continue'}
                    {!isSubmitting && <ChevronRight className="ml-2 h-5 w-5" />}
                  </button>
                  {lookupError && (
                    <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm font-semibold rounded-lg border border-red-100 text-center">
                      {lookupError}
                    </div>
                  )}
                </form>
                </>
                )}
              </div>
            )}

            {/* Step 2: Confirm Existing */}
            {step === 2 && studentFound && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 text-center">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <User className="h-10 w-10 text-emerald-600" />
                </div>
                <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Welcome back, {studentData.full_name}!</h3>
                <p className="text-slate-500 mb-8 max-w-md mx-auto">We found your profile. Please confirm your registration for this upcoming episode.</p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-4 px-4 border border-slate-200 rounded-xl shadow-sm text-base font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all"
                  >
                    Not you?
                  </button>
                  <button
                    onClick={handleRegister}
                    disabled={isSubmitting}
                    className="flex-1 py-4 px-4 border border-transparent rounded-xl shadow-sm text-base font-bold text-white bg-dos hover:bg-dos-dark transition-all disabled:opacity-70"
                  >
                    {isSubmitting ? 'Confirming...' : 'Confirm Registration'}
                  </button>
                </div>
                {registerError && (
                  <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm font-semibold rounded-lg border border-red-100">
                    {registerError}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Full Form (New User) */}
            {step === 2 && !studentFound && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Tell us about yourself</h3>
                <p className="text-slate-500 mb-8">We need a few details to complete your profile.</p>

                <form onSubmit={handleRegister} className="space-y-5" noValidate>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Full Name<span className="text-red-500 ml-1">*</span></label>
                    <input type="text" name="full_name" value={studentData.full_name} onChange={handleFormChange} placeholder="e.g. John Doe" className={`w-full px-4 py-2.5 bg-slate-50 border ${validationErrors.full_name ? 'border-red-500' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-dos focus:outline-none`} />
                    {validationErrors.full_name && <p className="text-red-500 text-xs mt-1 font-medium">{validationErrors.full_name}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Email<span className="text-red-500 ml-1">*</span></label>
                      <input type="email" name="email" value={studentData.email} onChange={handleFormChange} placeholder="e.g. john@example.com" className={`w-full px-4 py-2.5 bg-slate-50 border ${validationErrors.email ? 'border-red-500' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-dos focus:outline-none`} />
                      {validationErrors.email && <p className="text-red-500 text-xs mt-1 font-medium">{validationErrors.email}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">WhatsApp Number<span className="text-red-500 ml-1">*</span></label>
                      <input type="text" name="whatsapp_number" value={studentData.whatsapp_number} onChange={handleFormChange} placeholder="e.g. 9876543210" className={`w-full px-4 py-2.5 bg-slate-50 border ${validationErrors.whatsapp_number ? 'border-red-500' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-dos focus:outline-none`} />
                      {validationErrors.whatsapp_number && <p className="text-red-500 text-xs mt-1 font-medium">{validationErrors.whatsapp_number}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Gender<span className="text-red-500 ml-1">*</span></label>
                      <select name="gender" value={studentData.gender} onChange={handleFormChange} className={`w-full px-4 py-2.5 bg-slate-50 border ${validationErrors.gender ? 'border-red-500' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-dos focus:outline-none`}>
                        <option value="">Select...</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                      {validationErrors.gender && <p className="text-red-500 text-xs mt-1 font-medium">{validationErrors.gender}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">College Name<span className="text-red-500 ml-1">*</span></label>
                      <input type="text" name="college" value={studentData.college} onChange={handleFormChange} placeholder="e.g. Descience Institute of Technology" className={`w-full px-4 py-2.5 bg-slate-50 border ${validationErrors.college ? 'border-red-500' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-dos focus:outline-none`} />
                      {validationErrors.college && <p className="text-red-500 text-xs mt-1 font-medium">{validationErrors.college}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Degree<span className="text-red-500 ml-1">*</span></label>
                      <input type="text" name="degree" value={studentData.degree} onChange={handleFormChange} placeholder="e.g. B.Tech" className={`w-full px-4 py-2.5 bg-slate-50 border ${validationErrors.degree ? 'border-red-500' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-dos focus:outline-none`} />
                      {validationErrors.degree && <p className="text-red-500 text-xs mt-1 font-medium">{validationErrors.degree}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Department / Branch<span className="text-red-500 ml-1">*</span></label>
                      <input type="text" name="department" placeholder="e.g. Computer Science" value={studentData.department} onChange={handleFormChange} className={`w-full px-4 py-2.5 bg-slate-50 border ${validationErrors.department ? 'border-red-500' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-dos focus:outline-none`} />
                      {validationErrors.department && <p className="text-red-500 text-xs mt-1 font-medium">{validationErrors.department}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Year of Study<span className="text-red-500 ml-1">*</span></label>
                      <select name="year_of_study" value={studentData.year_of_study} onChange={handleFormChange} className={`w-full px-4 py-2.5 bg-slate-50 border ${validationErrors.year_of_study ? 'border-red-500' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-dos focus:outline-none`}>
                        <option value="">Select...</option>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                        <option value="Passed Out">Passed Out</option>
                      </select>
                      {validationErrors.year_of_study && <p className="text-red-500 text-xs mt-1 font-medium">{validationErrors.year_of_study}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Are you a DOS CLUB member?<span className="text-red-500 ml-1">*</span></label>
                      <select name="is_dos_club_member" value={studentData.is_dos_club_member} onChange={handleFormChange} className={`w-full px-4 py-2.5 bg-slate-50 border ${validationErrors.is_dos_club_member ? 'border-red-500' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-dos focus:outline-none`}>
                        <option value="">Select...</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                      {validationErrors.is_dos_club_member && <p className="text-red-500 text-xs mt-1 font-medium">{validationErrors.is_dos_club_member}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">What tech stack or topic are you currently most excited about?<span className="text-red-500 ml-1">*</span></label>
                    <textarea name="excited_topic" value={studentData.excited_topic} onChange={handleFormChange} rows="2" placeholder="e.g. Artificial Intelligence, Web Development" className={`w-full px-4 py-2.5 bg-slate-50 border ${validationErrors.excited_topic ? 'border-red-500' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-dos focus:outline-none`}></textarea>
                    {validationErrors.excited_topic && <p className="text-red-500 text-xs mt-1 font-medium">{validationErrors.excited_topic}</p>}
                  </div>

                  <div className="pt-4 flex flex-col sm:flex-row gap-4">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="sm:w-1/3 py-3 px-4 border border-slate-200 rounded-xl shadow-sm text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all"
                    >
                      Go Back
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-4 px-4 border border-transparent rounded-xl shadow-sm text-base font-bold text-white bg-dos hover:bg-dos-dark transition-all disabled:opacity-70"
                    >
                      {isSubmitting ? 'Registering...' : 'Complete Registration'}
                    </button>
                  </div>

                  {registerError && (
                    <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm font-semibold rounded-lg border border-red-100 text-center">
                      {registerError}
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* Step 3: Success */}
            {step === 3 && (
              <div className="animate-in zoom-in-95 duration-500 text-center py-10">
                <div className="w-24 h-24 bg-dos-light/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="h-12 w-12 text-dos" />
                </div>
                <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-4">Registration Successful!</h3>
                <p className="text-slate-600 text-lg mb-8 max-w-sm mx-auto">
                  Thank you for registering for Episode {episodeDetails.episode_number}. We look forward to seeing you there!
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center justify-center py-3 px-8 border border-transparent rounded-xl shadow-sm text-base font-bold text-white bg-dos hover:bg-dos-dark transition-all"
                >
                  Return to Home
                </button>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-8 text-center">
        <p className="text-slate-400 text-sm font-medium">
          &copy; {new Date().getFullYear()} Descience Open Source Club. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default RegistrationForm;
