import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { format, parse } from 'date-fns';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';
import './AdminEpisodeForm.css';

const fonts = ['arial', 'comic-sans', 'courier-new', 'georgia', 'helvetica', 'lucida', 'tahoma', 'times-new-roman', 'trebuchet', 'verdana'];
const FontStyle = Quill.import('attributors/style/font');
FontStyle.whitelist = fonts;
Quill.register(FontStyle, true);

const quillModules = {
  toolbar: [
    [{ 'font': fonts }, { 'size': ['small', false, 'large', 'huge'] }],
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'indent': '-1'}, { 'indent': '+1' }, { 'align': [] }],
    ['link', 'image', 'video'],
    ['clean']
  ],
};

const AdminEpisodeForm = () => {
  const [formData, setFormData] = useState({
    episode_number: '',
    title: '',
    description: '',
    presenter_name: '',
    presenter_designation: '',
    presenter_photo_url: '',
    cover_photo_url: ''
  });
  const [eventDate, setEventDate] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState({});

  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { id } = useParams();

  useEffect(() => {
    if (id) {
      const fetchEpisode = async () => {
        try {
          const token = localStorage.getItem('adminToken');
          const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
          const response = await fetch(`${API_URL}/api/admin/episodes/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const result = await response.json();
          if (result.success) {
            const ep = result.episode;
            setFormData({
              episode_number: ep.episode_number,
              title: ep.title,
              description: ep.description,
              presenter_name: ep.presenter_name,
              presenter_designation: ep.presenter_designation,
              presenter_photo_url: ep.presenter_photo_url || '',
              cover_photo_url: ep.cover_photo_url || ''
            });
            if (ep.event_date) setEventDate(new Date(ep.event_date));
            if (ep.event_time) {
              const [startStr, endStr] = ep.event_time.split(' - ');
              if (startStr) setStartTime(parse(startStr, 'h:mm a', new Date()));
              if (endStr) setEndTime(parse(endStr, 'h:mm a', new Date()));
            }
          }
        } catch (error) {
          console.error("Failed to load episode:", error);
        }
      };
      fetchEpisode();
    }
  }, [id]);

  // Crop State
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const [croppingType, setCroppingType] = useState('none'); // 'profile' or 'cover'
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const handlePhotoChange = (e, type) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result);
        setCroppingType(type);
        setIsCropping(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const showCroppedImage = useCallback(async () => {
    try {
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
      setFormData(prev => ({ 
        ...prev, 
        [croppingType === 'profile' ? 'presenter_photo_url' : 'cover_photo_url']: croppedImage 
      }));
      setIsCropping(false);
      setImageSrc(null);
      setCroppingType('none');
    } catch (e) {
      console.error(e);
      alert('Failed to crop image.');
    }
  }, [imageSrc, croppedAreaPixels, formData, croppingType]);

  const cancelCrop = () => {
    setIsCropping(false);
    setImageSrc(null);
    setCroppingType('none');
    const el1 = document.getElementById('photo-upload');
    const el2 = document.getElementById('cover-upload');
    if (el1) el1.value = '';
    if (el2) el2.value = '';
  };

  const handleNext = () => {
    setMessage('');
    let newErrors = {};
    if (currentStep === 1) {
      if (!formData.episode_number) newErrors.episode_number = 'Episode Number is required';
      if (!formData.title) newErrors.title = 'Title is required';
    }
    if (currentStep === 2) {
      if (!eventDate) newErrors.eventDate = 'Event Date is required';
      if (!startTime) newErrors.startTime = 'Start Time is required';
      if (!endTime) newErrors.endTime = 'End Time is required';
    }
    if (currentStep === 3) {
      if (!formData.presenter_name) newErrors.presenter_name = 'Presenter Name is required';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    setCurrentStep(prev => prev + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    
    if (!eventDate || !startTime || !endTime) {
      setMessage('Please select a valid date, start time, and end time.');
      return;
    }

    const token = localStorage.getItem('adminToken');
    if (!token) {
      navigate('/login');
      return;
    }

    setIsSubmitting(true);
    const formattedTime = `${format(startTime, 'h:mm a')} - ${format(endTime, 'h:mm a')}`;

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const url = id ? `${API_URL}/api/episodes/${id}` : `${API_URL}/api/episodes`;
      const method = id ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          episode_number: parseInt(formData.episode_number, 10),
          event_date: eventDate.toISOString(),
          event_time: formattedTime
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        navigate('/dashboard');
      } else {
        setMessage(data.error || 'Failed to save episode');
        setIsSubmitting(false);
      }
    } catch (error) {
      setMessage('Network error. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 cursor-pointer" onClick={() => navigate('/dashboard')}>
              <img src="/dos_logo.png" alt="DOS Logo" className="h-8 sm:h-10 w-auto object-contain drop-shadow-sm" />
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center justify-center px-4 py-2 border border-slate-200 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dos transition-all active:scale-95"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 relative">
          
          {/* Crop Modal Overlay */}
          {isCropping && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-xl font-bold mb-4 text-slate-900">Crop {croppingType === 'profile' ? 'Profile Picture' : 'Cover Photo'}</h3>
                <div className="relative w-full h-64 sm:h-96 bg-slate-900 rounded-xl overflow-hidden mb-4">
                  <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={croppingType === 'profile' ? 1 : 16 / 9}
                    cropShape={croppingType === 'profile' ? "round" : "rect"}
                    showGrid={croppingType === 'cover'}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
                </div>
                <div className="flex flex-col mb-6">
                  <label className="text-sm font-medium text-slate-600 mb-2">Zoom</label>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby="Zoom"
                    onChange={(e) => {
                      setZoom(e.target.value);
                    }}
                    className="w-full accent-dos"
                  />
                </div>
                <div className="flex gap-3 mt-auto">
                  <button
                    type="button"
                    onClick={cancelCrop}
                    className="flex-1 py-2.5 px-4 border border-slate-200 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={showCroppedImage}
                    className="flex-1 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-dos hover:bg-dos-dark transition-colors"
                  >
                    Confirm Crop
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mb-8">
            <div className="flex justify-between items-start mb-4 gap-4">
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">{id ? 'Edit Episode' : 'Create New Episode'}</h2>
              <span className="text-sm font-bold text-dos bg-dos-light/20 px-3 py-1 rounded-full whitespace-nowrap shrink-0">Step {currentStep} of 4</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-dos h-2 rounded-full transition-all duration-500" style={{ width: `${(currentStep / 4) * 100}%` }}></div>
            </div>
            <p className="mt-4 text-slate-500 text-sm font-medium">
              {currentStep === 1 && "Start with the basic details for this episode."}
              {currentStep === 2 && "When is this episode happening?"}
              {currentStep === 3 && "Who is presenting this episode?"}
              {currentStep === 4 && "Add a rich description for the event."}
            </p>
          </div>

          {message && (
            <div className={`mb-6 p-4 rounded-xl flex items-start gap-3 border ${message.includes('success') ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
              {!message.includes('success') && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 mt-0.5 text-rose-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
              {message.includes('success') && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 mt-0.5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
              <div className="text-sm font-bold">{message}</div>
            </div>
          )}
          
          <form onSubmit={(e) => { e.preventDefault(); if(currentStep === 4) handleSubmit(e); }} className="space-y-6">
            {currentStep === 1 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Episode Number</label>
                    <input type="number" name="episode_number" value={formData.episode_number} onChange={handleChange} required placeholder="e.g. 42"
                      className={`w-full px-4 py-3 bg-slate-50 border rounded-xl focus:ring-2 transition-all outline-none text-slate-700 ${errors.episode_number ? 'border-rose-500 focus:ring-rose-200' : 'border-slate-200 focus:border-dos focus:ring-dos'}`} />
                    {errors.episode_number && <p className="text-rose-500 text-xs mt-1.5 font-medium">{errors.episode_number}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Title</label>
                    <input type="text" name="title" value={formData.title} onChange={handleChange} required placeholder="e.g. Building a Scalable Backend"
                      className={`w-full px-4 py-3 bg-slate-50 border rounded-xl focus:ring-2 transition-all outline-none text-slate-700 ${errors.title ? 'border-rose-500 focus:ring-rose-200' : 'border-slate-200 focus:border-dos focus:ring-dos'}`} />
                    {errors.title && <p className="text-rose-500 text-xs mt-1.5 font-medium">{errors.title}</p>}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Event Date</label>
                    <DatePicker 
                      selected={eventDate} 
                      onChange={(date) => { setEventDate(date); if (errors.eventDate) setErrors(prev => ({ ...prev, eventDate: null })); }} 
                      dateFormat="MMMM d, yyyy"
                      placeholderText="Select date"
                      className={`w-full px-4 py-3 bg-slate-50 border rounded-xl focus:ring-2 transition-all outline-none text-slate-700 ${errors.eventDate ? 'border-rose-500 focus:ring-rose-200' : 'border-slate-200 focus:border-dos focus:ring-dos'}`}
                      required
                    />
                    {errors.eventDate && <p className="text-rose-500 text-xs mt-1.5 font-medium">{errors.eventDate}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Start Time</label>
                    <DatePicker 
                      selected={startTime} 
                      onChange={(time) => { setStartTime(time); if (errors.startTime) setErrors(prev => ({ ...prev, startTime: null })); }} 
                      showTimeSelect
                      showTimeSelectOnly
                      timeIntervals={15}
                      timeCaption="Time"
                      dateFormat="h:mm aa"
                      placeholderText="Start time"
                      className={`w-full px-4 py-3 bg-slate-50 border rounded-xl focus:ring-2 transition-all outline-none text-slate-700 ${errors.startTime ? 'border-rose-500 focus:ring-rose-200' : 'border-slate-200 focus:border-dos focus:ring-dos'}`}
                      required
                    />
                    {errors.startTime && <p className="text-rose-500 text-xs mt-1.5 font-medium">{errors.startTime}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">End Time</label>
                    <DatePicker 
                      selected={endTime} 
                      onChange={(time) => { setEndTime(time); if (errors.endTime) setErrors(prev => ({ ...prev, endTime: null })); }} 
                      showTimeSelect
                      showTimeSelectOnly
                      timeIntervals={15}
                      timeCaption="Time"
                      dateFormat="h:mm aa"
                      placeholderText="End time"
                      className={`w-full px-4 py-3 bg-slate-50 border rounded-xl focus:ring-2 transition-all outline-none text-slate-700 ${errors.endTime ? 'border-rose-500 focus:ring-rose-200' : 'border-slate-200 focus:border-dos focus:ring-dos'}`}
                      required
                    />
                    {errors.endTime && <p className="text-rose-500 text-xs mt-1.5 font-medium">{errors.endTime}</p>}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Name</label>
                    <input type="text" name="presenter_name" value={formData.presenter_name} onChange={handleChange} required={currentStep === 3} placeholder="e.g. Jane Doe"
                      className={`w-full px-4 py-3 bg-slate-50 border rounded-xl focus:ring-2 transition-all outline-none text-slate-700 ${errors.presenter_name ? 'border-rose-500 focus:ring-rose-200' : 'border-slate-200 focus:border-dos focus:ring-dos'}`} />
                    {errors.presenter_name && <p className="text-rose-500 text-xs mt-1.5 font-medium">{errors.presenter_name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Designation</label>
                    <input type="text" name="presenter_designation" value={formData.presenter_designation} onChange={handleChange} placeholder="e.g. Senior Software Engineer"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-dos focus:border-dos transition-all outline-none text-slate-700" />
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Profile Photo */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Profile Photo</label>
                    {!formData.presenter_photo_url || (isCropping && croppingType === 'profile') ? (
                      <div className="relative border-2 border-dashed border-slate-300 rounded-2xl hover:border-dos hover:bg-slate-50/50 transition-all bg-slate-50 flex justify-center items-center overflow-hidden p-8 h-48">
                        <input type="file" id="photo-upload" accept="image/*" onChange={(e) => handlePhotoChange(e, 'profile')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                        <div className="text-center pointer-events-none">
                          <svg className="mx-auto h-8 w-8 text-slate-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          <p className="mt-2 text-xs font-bold text-dos">Profile Photo (1:1)</p>
                        </div>
                      </div>
                    ) : (
                      <div className="relative group p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center justify-center h-48">
                        <img src={formData.presenter_photo_url} alt="Profile" className="w-24 h-24 rounded-full object-cover shadow-md border-4 border-white" />
                        <button type="button" onClick={() => { setFormData(prev => ({...prev, presenter_photo_url: ''})); setTimeout(() => { const el = document.getElementById('photo-upload'); if(el) el.value = ''; }, 0); }} className="mt-3 px-4 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-sm hover:bg-slate-50 transition-colors">Change Photo</button>
                      </div>
                    )}
                  </div>

                  {/* Cover Photo */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Cover Photo</label>
                    {!formData.cover_photo_url || (isCropping && croppingType === 'cover') ? (
                      <div className="relative border-2 border-dashed border-slate-300 rounded-2xl hover:border-dos hover:bg-slate-50/50 transition-all bg-slate-50 flex justify-center items-center overflow-hidden p-8 h-48">
                        <input type="file" id="cover-upload" accept="image/*" onChange={(e) => handlePhotoChange(e, 'cover')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                        <div className="text-center pointer-events-none">
                          <svg className="mx-auto h-8 w-8 text-slate-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          <p className="mt-2 text-xs font-bold text-dos">Cover Photo (16:9)</p>
                        </div>
                      </div>
                    ) : (
                      <div className="relative group p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center justify-center h-48">
                        <img src={formData.cover_photo_url} alt="Cover" className="w-full h-24 rounded-lg object-cover shadow-md border-4 border-white" />
                        <button type="button" onClick={() => { setFormData(prev => ({...prev, cover_photo_url: ''})); setTimeout(() => { const el = document.getElementById('cover-upload'); if(el) el.value = ''; }, 0); }} className="mt-3 px-4 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-sm hover:bg-slate-50 transition-colors">Change Cover</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="mb-4">
                  <label className="block text-sm font-bold text-slate-700 mb-1">Description</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-dos transition-all">
                    <ReactQuill 
                      theme="snow" 
                      value={formData.description} 
                      onChange={(value) => setFormData(prev => ({ ...prev, description: value }))} 
                      modules={quillModules}
                      className="bg-white border-none"
                      style={{ minHeight: '300px' }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="pt-6 mt-8 flex justify-between items-center border-t border-slate-100">
              {currentStep > 1 ? (
                <button type="button" onClick={() => setCurrentStep(prev => prev - 1)} className="px-6 py-3 border border-slate-200 text-sm font-bold rounded-xl text-slate-700 bg-white hover:bg-slate-50 transition-all shadow-sm">
                  Back
                </button>
              ) : <div></div>}

              {currentStep < 4 ? (
                <button type="button" onClick={handleNext} className="px-8 py-3 border border-transparent text-sm font-bold rounded-xl text-white bg-dos hover:bg-dos-dark transition-all shadow-sm">
                  Next Step
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} className="px-8 py-3 border border-transparent text-sm font-bold rounded-xl text-white bg-dos hover:bg-dos-dark transition-all shadow-md hover:shadow-lg active:scale-[0.98]" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : (id ? 'Save Changes' : 'Create Episode')}
                </button>
              )}
            </div>
          </form>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="text-center py-6 text-slate-400 text-xs font-medium">
        Powered by Descience Open Source Club
      </footer>
    </div>
  );
};

export default AdminEpisodeForm;
