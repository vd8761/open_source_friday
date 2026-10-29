import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import Home from './Home';
import Dashboard from './Dashboard';
import OutreachTool from './components/OutreachTool';
import AttendanceTool from './components/AttendanceTool';
import EventHistoryPage from './components/EventHistoryPage';
import PastEventsPage from './components/PastEventsPage';
import AttendeesPage from './components/AttendeesPage';
import Login from './Login';
import PwaInstallPrompt from './PwaInstallPrompt';
import RegistrationForm from './components/RegistrationForm';
import AdminEpisodeForm from './components/AdminEpisodeForm';
import { subscribeToPush, getNotificationPermission } from './utils/pushNotifications';
import './App.css';

// A simple wrapper to protect routes
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    // If there is no token, redirect to login
    return <Navigate to="/login" replace />;
  }
  return children;
};

function AttendeesRoute() {
  const {id}=useParams();
  return <AttendeesPage key={id}/>;
}

function App() {
  React.useEffect(() => {
    // If a user previously granted notification permissions but the service worker
    // failed to register, this will automatically subscribe them properly on their next visit.
    if (getNotificationPermission() === 'granted') {
      subscribeToPush().catch(console.error);
    }
  }, []);

  return (
    <GoogleReCaptchaProvider reCaptchaKey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}>
      <Router>
        <PwaInstallPrompt />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/register/:episode_number" element={<RegistrationForm />} />
          <Route path="/login" element={<Login />} />
          
          {/* Admin Routes */}
          <Route path="/admin/trash" element={<ProtectedRoute><EventHistoryPage mode="trash" /></ProtectedRoute>} />
          <Route path="/admin/past-events" element={<ProtectedRoute><PastEventsPage /></ProtectedRoute>} />
          <Route path="/admin/archived-events" element={<ProtectedRoute><PastEventsPage archivedOnly /></ProtectedRoute>} />
          <Route path="/admin/episodes/:id/attendees" element={<ProtectedRoute><AttendeesRoute /></ProtectedRoute>} />
          <Route path="/admin/invitations" element={<ProtectedRoute><OutreachTool /></ProtectedRoute>} />
          <Route path="/admin/episodes/:id/attendance" element={<ProtectedRoute><AttendanceTool /></ProtectedRoute>} />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/episodes/new" 
            element={
              <ProtectedRoute>
                <AdminEpisodeForm />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/episodes/edit/:id" 
            element={
              <ProtectedRoute>
                <AdminEpisodeForm />
              </ProtectedRoute>
            } 
          />
          
          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </GoogleReCaptchaProvider>
  );
}

export default App;
