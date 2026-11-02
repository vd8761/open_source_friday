import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import SiteApp from './site/SiteApp';
import Dashboard from './Dashboard';
import ContactsPage from './components/ContactsPage';
import StudentActivityPage from './components/StudentActivityPage';
import AdminNavigation from './components/AdminNavigation';
import OutreachTool from './components/OutreachTool';
import AttendanceTool from './components/AttendanceTool';
import EventHistoryPage from './components/EventHistoryPage';
import PastEventsPage from './components/PastEventsPage';
import AttendeesPage from './components/AttendeesPage';
import Login from './Login';
import PwaInstallPrompt from './PwaInstallPrompt';
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
  return <div className="admin-area"><AdminNavigation />{children}</div>;
};

function AttendeesRoute() {
  const {id}=useParams();
  return <AttendeesPage key={id}/>;
}

function AttendanceRoute() {
  const {id}=useParams();
  return <AttendanceTool key={id}/>;
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
      <Router>
        <PwaInstallPrompt />
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Admin Routes */}
          <Route path="/admin/students/:studentId" element={<ProtectedRoute><StudentActivityPage /></ProtectedRoute>} />
          <Route path="/admin/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
          <Route path="/admin/trash" element={<ProtectedRoute><EventHistoryPage mode="trash" /></ProtectedRoute>} />
          <Route path="/admin/past-events" element={<ProtectedRoute><PastEventsPage /></ProtectedRoute>} />
          <Route path="/admin/archived-events" element={<ProtectedRoute><PastEventsPage archivedOnly /></ProtectedRoute>} />
          <Route path="/admin/episodes/:id/attendees" element={<ProtectedRoute><AttendeesRoute /></ProtectedRoute>} />
          {['/admin/invitations/new','/admin/invitations/trash','/admin/invitations/:campaignId','/admin/invitations/:campaignId/edit'].map(path=><Route key={path} path={path} element={<ProtectedRoute><OutreachTool key={path}/></ProtectedRoute>} />)}
          <Route path="/admin/invitations" element={<ProtectedRoute><OutreachTool /></ProtectedRoute>} />
          <Route path="/admin/episodes/:id/attendance" element={<ProtectedRoute><AttendanceRoute /></ProtectedRoute>} />
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
          
          {/* Public v2.0 site: home, episodes, speakers, who it's for, speak, register and policies. */}
          <Route path="/*" element={<SiteApp />} />
        </Routes>
      </Router>
  );
}

export default App;
