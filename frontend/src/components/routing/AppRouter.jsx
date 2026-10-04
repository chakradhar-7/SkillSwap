import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Login from '../auth/Login';
import Register from '../auth/Register';
import Dashboard from '../dashboard/Dashboard';
import Profile from '../profile/Profile';
import ChatbotOnboarding from '../onboarding/ChatbotOnboarding';
import Browse from '../dashboard/Browse';
import ChatPage from '../dashboard/ChatPage';
import RequestsPage from '../dashboard/RequestsPage';
import AdminPanel from '../admin/AdminPanel';
import ForgotPassword from '../auth/ForgotPassword';
import ResetPassword from '../auth/ResetPassword';
import VerifyEmail from '../auth/VerifyEmail';
import CreditsPage from '../credits/CreditsPage';

// Links from emails must work whether or not the user is logged in
const emailLinkRoutes = (
  <>
    <Route path="/verify-email" element={<VerifyEmail />} />
    <Route path="/reset-password" element={<ResetPassword />} />
  </>
);

// This component replaces the old PrivateRoute logic
const AppRouter = () => {
  const { isAuthenticated, profileComplete, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // --- THIS IS THE CORE LOGIC ---
  // Allow admin access even if profile is not complete
  if (isAuthenticated && user?.role === 'admin') {
    return (
      <Routes>
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/messages" element={<ChatPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        {emailLinkRoutes}
        {/* Redirect admin to admin panel by default */}
        <Route path="*" element={<Navigate to="/admin" />} />
      </Routes>
    );
  }

  if (isAuthenticated && !profileComplete) {
    // User is logged in BUT has not finished the profile.
    // Force them to the onboarding.
    // Wait for user to be loaded before showing onboarding
    if (!user) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-teal-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading user...</p>
          </div>
        </div>
      );
    }
    return (
      <Routes>
        {emailLinkRoutes}
        <Route path="*" element={<ChatbotOnboarding />} />
      </Routes>
    );
  }

  if (isAuthenticated && profileComplete) {
    // User is logged in AND has a profile.
    // Show the full app.
    return (
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/messages" element={<ChatPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/credits" element={<CreditsPage />} />
        {emailLinkRoutes}
        {/* Redirect any other path (including /admin for non-admins) to the dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    );
  }

  // User is not authenticated.
  // Show only login/register, but allow /admin to redirect to login
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      {emailLinkRoutes}
      <Route path="/admin" element={<Navigate to="/login" state={{ from: '/admin' }} replace />} />
      {/* Redirect any other path to login */}
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
};

export default AppRouter;