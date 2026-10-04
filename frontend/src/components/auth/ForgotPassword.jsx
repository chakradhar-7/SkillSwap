import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import api from '../../services/api';
import AuthCard, { Alert, buttonClass, inputClass } from './AuthCard';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ type: '', message: '' });
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setStatus({ type: 'success', message: res.data.msg });
    } catch (err) {
      setStatus({ type: 'error', message: err.response?.data?.msg || 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Forgot your password?" subtitle="Enter your email and we'll send you a link to reset it.">
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="Enter your email"
            required
            autoFocus
          />
        </div>
        {status.message && <Alert type={status.type}>{status.message}</Alert>}
        <button type="submit" disabled={submitting} className={`${buttonClass} flex items-center justify-center gap-2`}>
          <Mail size={20} />
          <span>{submitting ? 'Sending...' : 'Send reset link'}</span>
        </button>
      </form>
      <p className="mt-6 text-center text-gray-600">
        Remembered it?{' '}
        <Link to="/login" className="text-teal-600 font-semibold hover:text-teal-700">
          Back to login
        </Link>
      </p>
    </AuthCard>
  );
};

export default ForgotPassword;
