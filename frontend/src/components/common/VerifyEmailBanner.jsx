import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MailWarning } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// Reminds logged-in users with an unverified email to verify it
const VerifyEmailBanner = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [status, setStatus] = useState({ type: 'idle', message: '' });

  // Hidden on the chat page, whose full-height layout sits directly under the navbar
  const hiddenPaths = ['/verify-email', '/messages'];
  if (!user || user.emailVerified || user.role === 'admin' || hiddenPaths.includes(location.pathname)) {
    return null;
  }

  const resend = async () => {
    setStatus({ type: 'sending', message: '' });
    try {
      const res = await api.post('/auth/send-verification');
      setStatus({ type: 'sent', message: res.data.msg });
    } catch (err) {
      setStatus({ type: 'error', message: err.response?.data?.msg || 'Could not send the email. Please try again.' });
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-8 py-2 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <MailWarning size={18} className="flex-shrink-0" />
        <span>
          Please verify your email <strong>{user.email}</strong> to receive session reminders by email.
          {status.message && <span className={`ml-2 ${status.type === 'error' ? 'text-red-700' : 'text-green-700'}`}>{status.message}</span>}
        </span>
      </div>
      {status.type !== 'sent' && (
        <button
          onClick={resend}
          disabled={status.type === 'sending'}
          className="px-3 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 font-medium transition-colors disabled:opacity-60"
        >
          {status.type === 'sending' ? 'Sending...' : 'Resend verification email'}
        </button>
      )}
    </div>
  );
};

export default VerifyEmailBanner;
