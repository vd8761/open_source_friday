import React, { useState, useEffect } from 'react';
import { subscribeToPush, getNotificationPermission } from './utils/pushNotifications';

const PwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  // After PWA install: ask for notification permission
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If already installed as PWA and permission not yet granted, offer notifications
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone && getNotificationPermission() === 'default') {
      // Slight delay so the app loads fully first
      const t = setTimeout(() => setShowNotifPrompt(true), 3000);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setIsVisible(false);

    // After user accepts install, ask for notifications
    if (outcome === 'accepted') {
      setTimeout(() => setShowNotifPrompt(true), 1500);
    }
  };

  const handleEnableNotifications = async () => {
    setShowNotifPrompt(false);
    await subscribeToPush();
  };

  // ─── Install Prompt ──────────────────────────────────────────────────────────
  if (isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-[100] p-4 pointer-events-none flex flex-col items-end">
        <div className="bg-white rounded-2xl p-5 shadow-2xl max-w-[320px] w-full relative animate-in slide-in-from-bottom-8 fade-in duration-500 pointer-events-auto border border-slate-200">
          <button
            onClick={() => setIsVisible(false)}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          <div className="flex items-start gap-3 mb-4 pr-4">
            <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm p-1.5 mt-0.5">
              <img src="/dos_logo.png" alt="DOS Logo" className="w-full h-full object-contain drop-shadow-sm" />
            </div>
            <div className="pt-0.5">
              <h3 className="text-base font-extrabold text-slate-900 mb-0.5 tracking-tight leading-tight">Install App</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Get the full Open Source Friday experience with episode notifications.
              </p>
            </div>
          </div>

          <button
            onClick={handleInstallClick}
            className="w-full py-3.5 bg-dos hover:bg-dos-dark text-white font-bold rounded-2xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
          >
            Install Now
          </button>
        </div>
      </div>
    );
  }

  // ─── Notification Permission Prompt ─────────────────────────────────────────
  if (showNotifPrompt) {
    return (
      <div className="fixed bottom-4 right-4 z-[100] p-4 pointer-events-none flex flex-col items-end">
        <div className="bg-white rounded-2xl p-5 shadow-2xl max-w-[320px] w-full relative animate-in slide-in-from-bottom-8 fade-in duration-500 pointer-events-auto border border-slate-200">
          <button
            onClick={() => setShowNotifPrompt(false)}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          <div className="flex items-start gap-3 mb-4 pr-4">
            <div className="w-12 h-12 bg-dos/10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-dos" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div className="pt-0.5">
              <h3 className="text-base font-extrabold text-slate-900 mb-0.5 tracking-tight leading-tight">Stay Updated!</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Get notified when new episodes are announced and receive a 30-minute reminder before each session.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowNotifPrompt(false)}
              className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl text-sm hover:bg-slate-50 transition-all"
            >
              Not now
            </button>
            <button
              onClick={handleEnableNotifications}
              className="flex-1 py-2.5 bg-dos hover:bg-dos-dark text-white font-bold rounded-xl text-sm transition-all shadow-md active:scale-[0.98]"
            >
              Enable
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default PwaInstallPrompt;
