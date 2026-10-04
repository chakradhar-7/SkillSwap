import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, ArrowDownLeft, ArrowUpRight, RotateCcw, Gift } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { formatCreditChange, formatCredits } from '../../utils/credits';
import { formatFullDateTime } from '../../utils/timezone';

const TYPE_STYLES = {
  welcome: { icon: Gift, label: 'Welcome', className: 'bg-violet-100 text-violet-700' },
  earning: { icon: ArrowDownLeft, label: 'Earned', className: 'bg-green-100 text-green-700' },
  payment: { icon: ArrowUpRight, label: 'Reserved', className: 'bg-orange-100 text-orange-700' },
  refund: { icon: RotateCcw, label: 'Refund', className: 'bg-blue-100 text-blue-700' },
};

const CreditsPage = () => {
  const { user } = useAuth();
  const socket = useSocket();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const timeZone = user?.availability?.timeZone;

  const load = () =>
    api.get('/credits')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.msg || 'Could not load your credits.'));

  useEffect(() => {
    load();
  }, []);

  // Refresh the history whenever the balance changes
  useEffect(() => {
    if (!socket) return undefined;
    socket.on('creditsUpdate', load);
    return () => socket.off('creditsUpdate', load);
  }, [socket]);

  const transactions = data?.transactions || [];
  const earned = transactions.filter((t) => t.type === 'earning').reduce((sum, t) => sum + t.amount, 0);
  const spent = -transactions.filter((t) => t.type === 'payment').reduce((sum, t) => sum + t.amount, 0)
    - transactions.filter((t) => t.type === 'refund').reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Time Credits</h1>
        <p className="text-gray-500 mb-8">Teach to earn credits, then spend them learning from anyone.</p>

        {error && <p className="text-red-600 mb-6">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 text-amber-100 text-sm mb-1">
              <Coins size={16} />
              Balance
            </div>
            <p className="text-4xl font-bold">{data ? formatCredits(data.balance) : '...'}</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <p className="text-sm text-gray-500 mb-1">Earned by teaching</p>
            <p className="text-3xl font-bold text-green-600">{formatCredits(earned)}</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <p className="text-sm text-gray-500 mb-1">Spent on learning</p>
            <p className="text-3xl font-bold text-orange-600">{formatCredits(Math.max(spent, 0))}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* How it works */}
          <div className="bg-white rounded-xl p-6 shadow-sm h-fit">
            <h2 className="text-lg font-bold text-gray-800 mb-4">How credits work</h2>
            <ol className="space-y-3 text-sm text-gray-600 list-decimal list-inside">
              <li><strong>1 credit = 1 hour.</strong> Everyone starts with {data?.startingCredits ?? 3} credits.</li>
              <li>When booking, choose <strong>Pay with credits</strong> to learn from anyone, even if they don't want any of your skills.</li>
              <li>Your credits are <strong>reserved</strong> when the teacher confirms the schedule.</li>
              <li>They go to the teacher as each session is <strong>completed</strong>.</li>
              <li>Cancelled sessions are <strong>refunded</strong> automatically.</li>
              <li>Teach credit sessions to <strong>earn</strong> more. Barter sessions don't use credits.</li>
            </ol>
            <Link
              to="/browse"
              className="mt-6 block text-center bg-gradient-to-r from-teal-500 to-teal-600 text-white py-2.5 rounded-lg font-medium hover:from-teal-600 hover:to-teal-700 transition-all"
            >
              Find someone to learn from
            </Link>
          </div>

          {/* History */}
          <div className="bg-white rounded-xl p-6 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-bold text-gray-800 mb-4">History</h2>
            {!data ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : transactions.length === 0 ? (
              <p className="text-gray-500 text-sm">No credit activity yet.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {transactions.map((t) => {
                  const style = TYPE_STYLES[t.type] || TYPE_STYLES.payment;
                  const Icon = style.icon;
                  return (
                    <div key={t._id} className="flex items-center gap-4 py-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${style.className}`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{t.description}</p>
                        <p className="text-xs text-gray-400">
                          {style.label} · {formatFullDateTime(t.createdAt, timeZone)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold ${t.amount >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                          {formatCreditChange(t.amount)}
                        </p>
                        <p className="text-xs text-gray-400">Balance {t.balanceAfter}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditsPage;
