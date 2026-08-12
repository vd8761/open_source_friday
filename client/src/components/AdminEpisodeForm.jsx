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
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    [{ 'font': fonts }],
    [{ 'size': ['small', false, 'large', 'huge'] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'script': 'sub'}, { 'script': 'super' }],
    [{ 'header': 1 }, { 'header': 2 }, 'blockquote', 'code-block'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'indent': '-1'}, { 'indent': '+1' }],
    [{ 'direction': 'rtl' }, { 'align': [] }],
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
    presenter_photo_url: ''
  });
  const [eventDate, setEventDate] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);

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
              presenter_photo_url: ep.presenter_photo_url || ''
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result);
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
      setFormData(prev => ({ ...prev, presenter_photo_url: croppedImage }));
      setIsCropping(false);
      setImageSrc(null);
    } catch (e) {
      console.error(e);
      alert('Failed to crop image.');
    }
  }, [imageSrc, croppedAreaPixels, formData]);

  const cancelCrop = () => {
    setIsCropping(false);
    setImageSrc(null);
    document.getElementById('photo-upload').value = '';
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
              <h1 className="hidden sm:block text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-dos to-dos-dark whitespace-nowrap">
                Open Source Friday
              </h1>
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
                <h3 className="text-xl font-bold mb-4 text-slate-900">Crop Profile Picture</h3>
                <div className="relative w-full h-64 sm:h-96 bg-slate-900 rounded-xl overflow-hidden mb-4">
                  <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
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

          <div className="mb-6 border-b border-slate-100 pb-4">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{id ? 'Edit Episode' : 'Create New Episode'}</h2>
            <p className="mt-1 text-slate-500 text-sm">Fill in the details to schedule an upcoming episode.</p>
          </div>

          {message && <div className={`message ${message.includes('success') ? 'success' : 'error'}`}>{message}</div>}
          
          <form onSubmit={handleSubmit} className="episode-form">
            <div className="form-group">
              <label>Episode Number:</label>
              <input type="number" name="episode_number" value={formData.episode_number} onChange={handleChange} required />
            </div>
            
            <div className="form-group">
              <label>Title:</label>
              <input type="text" name="title" value={formData.title} onChange={handleChange} required />
            </div>

            <div className="form-group mb-12">
              <label>Description:</label>
              <ReactQuill 
                theme="snow" 
                value={formData.description} 
                onChange={(value) => setFormData(prev => ({ ...prev, description: value }))} 
                modules={quillModules}
                className="bg-white"
                style={{ height: '300px', marginBottom: '80px' }}
              />
            </div>

            <div className="form-row">
              <div className="form-group date-picker-wrapper">
                <label>Event Date:</label>
                <DatePicker 
                  selected={eventDate} 
                  onChange={(date) => setEventDate(date)} 
                  dateFormat="MMMM d, yyyy"
                  placeholderText="Select date"
                  className="custom-datepicker"
                  required
                />
              </div>
              <div className="form-group date-picker-wrapper">
                <label>Start Time:</label>
                <DatePicker 
                  selected={startTime} 
                  onChange={(time) => setStartTime(time)} 
                  showTimeSelect
                  showTimeSelectOnly
                  timeIntervals={15}
                  timeCaption="Time"
                  dateFormat="h:mm aa"
                  placeholderText="Start time"
                  className="custom-datepicker"
                  required
                />
              </div>
              <div className="form-group date-picker-wrapper">
                <label>End Time:</label>
                <DatePicker 
                  selected={endTime} 
                  onChange={(time) => setEndTime(time)} 
                  showTimeSelect
                  showTimeSelectOnly
                  timeIntervals={15}
                  timeCaption="Time"
                  dateFormat="h:mm aa"
                  placeholderText="End time"
                  className="custom-datepicker"
                  required
                />
              </div>
            </div>

            <fieldset>
              <legend>Presenter Details</legend>
              <div className="form-group">
                <label>Name:</label>
                <input type="text" name="presenter_name" value={formData.presenter_name} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Designation:</label>
                <input type="text" name="presenter_designation" value={formData.presenter_designation} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Photo:</label>
                <input type="file" id="photo-upload" accept="image/*" onChange={handlePhotoChange} />
                {formData.presenter_photo_url && !isCropping && (
                  <div className="mt-3 flex flex-col items-start gap-2">
                    <p className="text-xs font-medium text-slate-500">Cropped Preview:</p>
                    <img src={formData.presenter_photo_url} alt="Preview" className="w-24 h-24 rounded-full object-cover shadow-sm border-2 border-dos/20" />
                  </div>
                )}
              </div>
            </fieldset>

            <button type="submit" className="submit-btn mt-4" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : (id ? 'Save Changes' : 'Create Episode')}
            </button>
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
