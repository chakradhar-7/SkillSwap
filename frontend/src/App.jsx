import React from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ToastProvider } from './context/ToastContext';
import AppRouter from './components/routing/AppRouter';
import VerifyEmailBanner from './components/common/VerifyEmailBanner';

const AppContent = () => {
  const location = useLocation();
  const isAdminRoute = location.pathname === '/admin';

  return (
    <>
      {!isAdminRoute && <Navbar />}
      {!isAdminRoute && <VerifyEmailBanner />}
      <AppRouter />
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <ToastProvider>
          <Router>
            <AppContent />
          </Router>
        </ToastProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;