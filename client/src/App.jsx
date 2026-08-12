import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './Home';
import Dashboard from './Dashboard';
import Login from './Login';
import PwaInstallPrompt from './PwaInstallPrompt';
import RegistrationForm from './components/RegistrationForm';
import AdminEpisodeForm from './components/AdminEpisodeForm';
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

function App() {
  return (
    <Router>
      <PwaInstallPrompt />
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/register/:episode_number" element={<RegistrationForm />} />
        <Route path="/login" element={<Login />} />
        
        {/* Admin Routes */}
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
  );
}

export default App;
