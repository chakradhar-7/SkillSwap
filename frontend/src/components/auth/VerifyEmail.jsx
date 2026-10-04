import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import AuthCard, { buttonClass } from './AuthCard';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { user, loadUser } = useAuth();
  const [state, setState] = useState({ status: 'loading', message: '' });
  // Tokens are single-use, so make sure the request is sent only once
  // (React StrictMode runs effects twice in development)
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    if (!token) {
      setState({ status: 'error', message: 'This verification link is missing its token.' });
      return;
    }
    api.post('/auth/verify-email', { token })
      .then((res) => {
        setState({ status: 'success', message: res.data.msg });
        if (localStorage.getItem('token')) loadUser();
      })
      .catch((err) => {
        setState({
          status: 'error',
          message: err.response?.data?.msg || 'We could not verify your email. Please try again.',
        });
      });
  }, [token, loadUser]);

  const nextLink = user ? '/dashboard' : '/login';
  const nextLabel = user ? 'Go to dashboard' : 'Go to login';

  return (
    <AuthCard title="Email verification">
      {state.status === 'loading' && (
        <div className="text-center py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying your email...</p>
        </div>
      )}
      {state.status === 'success' && (
        <div className="text-center">
          <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
          <p className="text-gray-700 mb-6">{state.message} You'll now receive session reminders by email.</p>
          <Link to={nextLink} className={`${buttonClass} block`}>{nextLabel}</Link>
        </div>
      )}
      {state.status === 'error' && (
        <div className="text-center">
          <XCircle className="mx-auto text-red-500 mb-4" size={48} />
          <p className="text-gray-700 mb-6">{state.message}</p>
          <p className="text-sm text-gray-500 mb-6">
            {user
              ? 'Use the "Resend verification email" button at the top of the app to get a new link.'
              : 'Log in and use the "Resend verification email" button to get a new link.'}
          </p>
          <Link to={nextLink} className={`${buttonClass} block`}>{nextLabel}</Link>
        </div>
      )}
    </AuthCard>
  );
};

export default VerifyEmail;
