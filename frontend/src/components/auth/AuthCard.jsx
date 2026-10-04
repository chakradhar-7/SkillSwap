import React from 'react';

// Shared card layout for the account pages (forgot/reset password, verify email)
const AuthCard = ({ title, subtitle, children }) => (
  <div className="min-h-screen bg-gradient-to-br from-gray-50 to-teal-50 flex items-center justify-center p-4">
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="SkillSwap Logo" className="h-20 w-20 object-contain mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">{title}</h2>
          {subtitle && <p className="text-gray-600">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  </div>
);

export const inputClass =
  'w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all';

export const buttonClass =
  'w-full bg-gradient-to-r from-teal-500 to-teal-600 text-white py-3 rounded-xl font-semibold hover:from-teal-600 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed';

export const Alert = ({ type = 'error', children }) => {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-700',
    success: 'bg-green-50 border-green-200 text-green-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
  };
  return <div className={`p-3 border rounded-lg text-sm ${styles[type]}`}>{children}</div>;
};

export default AuthCard;
