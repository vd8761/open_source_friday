import React, { useState, useEffect } from 'react';

const PwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full relative animate-in zoom-in-95 duration-200">
        <button 
          onClick={() => setIsVisible(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        
        <div className="flex items-start gap-4 mb-6 mt-2">
          <div className="w-16 h-16 bg-white border border-slate-100 rounded-[1.25rem] flex items-center justify-center flex-shrink-0 shadow-sm p-2">
             <img src="/dos_logo.png" alt="DOS Logo" className="w-full h-full object-contain" />
          </div>
          <div className="pt-1">
            <h3 className="text-xl font-extrabold text-slate-900 mb-1 tracking-tight">Install App</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              Get the full Open Source Friday experience on your device.
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
};

export default PwaInstallPrompt;
