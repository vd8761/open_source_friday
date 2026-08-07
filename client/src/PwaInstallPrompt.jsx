import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-50 animate-slide-up flex flex-col gap-3">
      <button 
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 p-1"
      >
        <X className="w-4 h-4" />
      </button>
      
      <div className="flex items-center gap-3 mt-1">
        <div className="bg-dos p-2 rounded-xl">
          <Download className="w-6 h-6 text-white" />
        </div>
        <div>
          <h4 className="font-bold text-slate-900 text-sm">Install App</h4>
          <p className="text-xs text-slate-500">Get the full Open Source Friday experience on your device.</p>
        </div>
      </div>
      
      <button 
        onClick={handleInstallClick}
        className="w-full bg-dos hover:bg-dos-dark text-white font-semibold py-2.5 rounded-xl text-sm transition-colors active:scale-[0.98]"
      >
        Install Now
      </button>
    </div>
  );
}
