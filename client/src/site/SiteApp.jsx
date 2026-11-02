import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import SiteNav from './SiteNav';
import OsfFooter from './OsfFooter';
import HomePage from './pages/HomePage';
import EpisodesPage from './pages/EpisodesPage';
import SpeakersPage from './pages/SpeakersPage';
import WhoPage from './pages/WhoPage';
import SpeakPage from './pages/SpeakPage';
import PoliciesPage from './pages/PoliciesPage';
import RegisterPage from './pages/RegisterPage';
import { SiteDataProvider } from './api';
import './site.css';
import { policyLinks } from '../utils/policyLinks';
import { sitePaths } from './paths';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// reCAPTCHA v3 is loaded only on pages with a form (register, speak), as in v1.0.
const withRecaptcha = (page) => <GoogleReCaptchaProvider reCaptchaKey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}>{page}</GoogleReCaptchaProvider>;

// Public v2.0 site. Admin and /login stay on the v1.0 screens (App.jsx).
export default function SiteApp() {
  return (
    <SiteDataProvider>
    <div className="osf-site flex min-h-screen min-w-0 flex-col bg-osf-mist font-osf text-osf-ink">
      <ScrollToTop />
      <SiteNav />
      <div className="flex-1">
        <Routes>
          <Route path={sitePaths.home} element={<HomePage />} />
          <Route path={sitePaths.episodes} element={<EpisodesPage />} />
          <Route path={sitePaths.speakers} element={<SpeakersPage />} />
          <Route path={sitePaths.who} element={<WhoPage />} />
          <Route path={sitePaths.speak} element={withRecaptcha(<SpeakPage />)} />
          <Route path={sitePaths.register} element={withRecaptcha(<RegisterPage />)} />
          {policyLinks.map(([url]) => <Route key={url} path={url} element={<PoliciesPage slug={url.slice(1)} />} />)}
          <Route path="*" element={<Navigate to={sitePaths.home} replace />} />
        </Routes>
      </div>
      <OsfFooter />
    </div>
    </SiteDataProvider>
  );
}
