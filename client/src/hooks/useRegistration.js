import { useState, useEffect, useRef } from 'react';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { WHATSAPP_NOTICE_VERSION } from '../components/WhatsAppConsent';

// Registration flow moved unchanged from the v1.0 RegistrationForm: lookup, profile prefill,
// missing-field completion, reCAPTCHA v3 and /api/register. Only the view around it changed.
export const emptyStudent = { full_name: '', email: '', whatsapp_number: '', country_code: '', gender: '', college: '', degree: '', department: '', year_of_study: '', is_dos_club_member: '', excited_topic: '' };
const profileFields = Object.keys(emptyStudent).map(key => ({ key }));

export default function useRegistration(episodeParam) {
  const episodeNumber = episodeParam ? (episodeParam.startsWith('episode-') ? episodeParam.replace('episode-', '') : episodeParam) : null;

  const [episodeDetails, setEpisodeDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [step, setStep] = useState(1);
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [savedWhatsappChoice, setSavedWhatsappChoice] = useState(null);
  const [identifier, setIdentifier] = useState('');
  const [countryCode, setCountryCode] = useState('+91');


  const [studentFound, setStudentFound] = useState(false);
  const [profileMissingFields, setProfileMissingFields] = useState([]);
  const [studentData, setStudentData] = useState({ ...emptyStudent });
  const needsProfileDetails = !studentFound || profileMissingFields.length > 0;
  const showField = key => !studentFound || profileMissingFields.includes(key);
  const showGroup = (...keys) => keys.some(showField);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const lastEmailChecked = useRef('');
  const lookupVersion = useRef(0);
  const { executeRecaptcha } = useGoogleReCaptcha();
  // The API checks this token; on a local machine without keys it is empty and the API skips the check.
  const lookupToken = async () => (executeRecaptcha ? await executeRecaptcha('lookup') : '');

  // Returns true if the episode event has already completed based on its date and end time
  useEffect(() => {
    if (!episodeNumber) {
      setError('No episode number provided.');
      setLoading(false);
      return;
    }

    const fetchEpisode = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const res = await fetch(`${API_URL}/api/v2/episodes/${episodeNumber}`);
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
  const [zoomPending, setZoomPending] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setStudentData(prev => ({ ...prev, [name]: value }));
    if (name === 'whatsapp_number') setWhatsappOptIn(false);
    setRegisterError('');
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const applySavedProfile = (data, preserveDraft = false) => {
    const missing = Array.isArray(data.missing_fields) ? data.missing_fields : profileFields.map(({ key }) => key);
    const saved = Object.fromEntries(Object.entries(data.student).map(([key, value]) => [key, value ?? '']));
    setStudentData(current => {
      const draft = { ...emptyStudent, ...saved };
      if (preserveDraft) for (const key of missing) draft[key] = current[key] || draft[key];
      return draft;
    });
    setStudentFound(true);
    setProfileMissingFields(missing);
    setCountryCode(current => saved.whatsapp_number && saved.country_code ? saved.country_code : current);
    setWhatsappOptIn(false);
    setValidationErrors({});
  };
  const returnToLookup = () => {
    lookupVersion.current++;
    setCheckingEmail(false);
    setLookupError('');
    setRegisterError('');
    setStep(1);
  };

  const checkEnteredEmail = async () => {
    const email = studentData.email.trim().toLowerCase();
    if (studentFound || checkingEmail || email === identifier.trim().toLowerCase() || email === lastEmailChecked.current || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    lastEmailChecked.current = email;
    const version = ++lookupVersion.current;
    setCheckingEmail(true);
    setRegisterError('');
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${API_URL}/api/students/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: email, countryCode, episode_id: episodeDetails?.id, recaptcha_token: await lookupToken() }) });
      const data = await res.json();
      if (version !== lookupVersion.current) return;
      if (!res.ok) throw new Error(data.error || 'Please check your email and try again.');
      if (data.success) {
        if (data.already_registered) {
          setIdentifier(email); setLookupError('You are already registered for this episode!'); setStep(1);
        } else applySavedProfile(data, true);
      }
    } catch (err) {
      if (version !== lookupVersion.current) return;
      lastEmailChecked.current = '';
      setRegisterError(err.message || 'Could not check your saved profile. Please try again.');
    } finally { if (version === lookupVersion.current) setCheckingEmail(false); }
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!identifier) return;
    const version = ++lookupVersion.current;
    setIsSubmitting(true);
    setLookupError('');
    setWhatsappOptIn(false);
    setValidationErrors({});
    setRegisterError('');
    lastEmailChecked.current = '';

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${API_URL}/api/students/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          identifier,
          countryCode,
          episode_id: episodeDetails?.id,
          recaptcha_token: await lookupToken(),
        })
      });
      const data = await res.json();
      if (version !== lookupVersion.current) return;
      if (!res.ok) throw new Error(data.error || 'Please try looking up your profile again.');

      if (data.success) {
        if (data.already_registered) {
          setLookupError('You are already registered for this episode!');
          setIsSubmitting(false);
          return;
        }

        applySavedProfile(data);
      } else {
        setStudentFound(false);
        setProfileMissingFields([]);
        if (identifier.includes('@')) {
          setStudentData({ ...emptyStudent, email: identifier.trim().toLowerCase() });
        } else {
          setStudentData({ ...emptyStudent, whatsapp_number: identifier.trim() });
        }
      }
      setStep(2);
    } catch (err) {
      if (version === lookupVersion.current) setLookupError(err.message || 'Error looking up student');
    } finally {
      if (version === lookupVersion.current) setIsSubmitting(false);
    }
  };



  const validateForm = () => {
    const errors = {};
    const requiredFields = profileFields.filter(({ key }) => showField(key));
    
    requiredFields.forEach(field => {
      const value = field.key === 'country_code' ? countryCode : studentData[field.key];
      if (!value || value.trim() === '') {
        errors[field.key] = 'This field is required';
      }
    });

    if (studentData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentData.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }
    if (studentData.whatsapp_number && !/^\d{4,15}$/.test(studentData.whatsapp_number.replace(/[\s()-]/g, ''))) {
      errors.whatsapp_number = 'Please enter a valid WhatsApp number';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    if (checkingEmail || isSubmitting) return;
    
    if (step === 2 && needsProfileDetails) {
      if (!validateForm()) {
        return;
      }
    }

    if (!executeRecaptcha) {
      setRegisterError('Security check not ready. Please wait a moment.');
      return;
    }

    setIsSubmitting(true);
    setRegisterError('');
    try {
      const recaptchaToken = await executeRecaptcha("register");
      if (!recaptchaToken) {
        setRegisterError('Security check failed. Please refresh and try again.');
        setIsSubmitting(false);
        return;
      }

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...studentData,
          episode_id: episodeDetails.id,
          is_existing: studentFound,
          student_id: studentData.id,
          recaptcha_token: recaptchaToken,
          country_code: countryCode,
          whatsapp_opt_in: whatsappOptIn,
          whatsapp_notice_version: WHATSAPP_NOTICE_VERSION
        })
      });
      const data = await res.json();

      if (data.success) {
        setSavedWhatsappChoice(typeof data.whatsapp_opt_in === 'boolean' ? data.whatsapp_opt_in : null);
        setZoomPending(data.zoom_status === 'pending');
        setStep(3);
      } else {
        setRegisterError(data.error || 'Registration failed');
        if (Array.isArray(data.missing_fields)) {
          setProfileMissingFields(data.missing_fields);
          setValidationErrors(data.field_errors || {});
          setStep(2);
        }
      }
    } catch (err) {
      setRegisterError('Error submitting registration');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    episodeDetails, loading, error, step, setStep, identifier, setIdentifier, countryCode, setCountryCode,
    studentFound, studentData, setStudentData, profileMissingFields, needsProfileDetails, showField, showGroup,
    whatsappOptIn, setWhatsappOptIn, savedWhatsappChoice, zoomPending, isSubmitting, checkingEmail,
    lookupError, registerError, validationErrors, setValidationErrors,
    handleFormChange, handleLookup, handleRegister, checkEnteredEmail, returnToLookup,
  };
}
