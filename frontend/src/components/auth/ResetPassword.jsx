import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import api, { AUTH_MESSAGE_KEY } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import AuthCard, { Alert, buttonClass, inputClass } from './AuthCard';

const MIN_LENGTH = 6;

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError('The passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/auth/reset-password', { token, password });
      // Any existing login is now invalid; start fresh on the login page
      logout();
      try {
        sessionStorage.setItem(AUTH_MESSAGE_KEY, res.data.msg);
      } catch {
        // storage unavailable - the redirect still works
      }
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.response?.data?.msg || 'Could not reset your password. Please try again.');
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthCard title="Reset your password">
        <Alert>This reset link is missing its token. Please use the link from your email, or request a new one.</Alert>
        <Link to="/forgot-password" className={`${buttonClass} block text-center mt-6`}>
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="Your other devices will be signed out.">
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder={`At least ${MIN_LENGTH} characters`}
            minLength={MIN_LENGTH}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
            placeholder="Type it again"
            required
          />
        </div>
        {error && (
          <Alert>
            {error}{' '}
            {/expired|invalid/i.test(error) && (
              <Link to="/forgot-password" className="font-semibold underline">Request a new link</Link>
            )}
          </Alert>
        )}
        <button type="submit" disabled={submitting} className={`${buttonClass} flex items-center justify-center gap-2`}>
          <KeyRound size={20} />
          <span>{submitting ? 'Saving...' : 'Update password'}</span>
        </button>
      </form>
    </AuthCard>
  );
};

export default ResetPassword;
