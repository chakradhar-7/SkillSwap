import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { formatCredits } from '../../utils/credits';

// Navbar badge with the user's time-credit balance, kept live over the socket
const CreditsBadge = () => {
  const { user, updateUser } = useAuth();
  const socket = useSocket();
  const location = useLocation();

  useEffect(() => {
    if (!socket) return undefined;
    const handleUpdate = ({ balance }) => updateUser({ credits: balance });
    socket.on('creditsUpdate', handleUpdate);
    return () => socket.off('creditsUpdate', handleUpdate);
  }, [socket, updateUser]);

  if (!user || user.role === 'admin') return null;
  const isActive = location.pathname === '/credits';

  return (
    <Link
      to="/credits"
      title="Your time credits"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${
        isActive
          ? 'bg-amber-100 border-amber-300 text-amber-800'
          : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
      }`}
    >
      <Coins size={16} />
      <span>{formatCredits(user.credits ?? 0)}</span>
    </Link>
  );
};

export default CreditsBadge;
