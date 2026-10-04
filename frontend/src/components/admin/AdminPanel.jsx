import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import { 
  Shield, 
  Users, 
  AlertTriangle, 
  Ban, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Search,
  Filter,
  Trash2,
  TrendingUp,
  Clock,
  LogOut
} from 'lucide-react';

const AdminPanel = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardStats, setDashboardStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    if (user) {
      if (user.role !== 'admin') {
        window.location.href = '/dashboard';
        return;
      }
      // Load dashboard when user is confirmed as admin
      loadDashboard();
    }
  }, [user]);

  // Socket event listeners for real-time updates
  useEffect(() => {
    if (!socket || !user || user.role !== 'admin') return;

    // Listen for new reports
    const handleNewReport = (report) => {
      // If we're on the reports tab, add the new report to the list
      if (activeTab === 'reports' && (filterStatus === 'all' || filterStatus === 'pending')) {
        setReports((prev) => (prev.some((r) => r._id === report._id) ? prev : [report, ...prev]));
      }
      // Reload dashboard to update stats
      if (activeTab === 'dashboard') {
        loadDashboard();
      }
    };

    // Listen for report resolution
    const handleReportResolved = (report) => {
      // Update the report in the list if it exists
      setReports((prev) =>
        prev.map((r) => (r._id === report._id ? report : r))
      );
      // Reload dashboard
      if (activeTab === 'dashboard') {
        loadDashboard();
      }
    };

    // Listen for dashboard updates
    const handleDashboardUpdate = () => {
      // Reload dashboard stats
      loadDashboard();
      // If on reports tab, reload reports
      if (activeTab === 'reports') {
        loadReports();
      }
      // If on users tab, reload users
      if (activeTab === 'users') {
        loadUsers();
      }
    };

    // Listen for user ban/unban events
    const handleUserBanned = (data) => {
      // Update user in the list if it exists
      setUsers((prev) =>
        prev.map((u) =>
          u._id === data.userId
            ? { ...u, isBanned: true, banReason: data.banReason }
            : u
        )
      );
      // Reload dashboard
      loadDashboard();
    };

    const handleUserUnbanned = (data) => {
      // Update user in the list if it exists
      setUsers((prev) =>
        prev.map((u) =>
          u._id === data.userId ? { ...u, isBanned: false, banReason: null } : u
        )
      );
      // Reload dashboard
      loadDashboard();
    };

    const handleUserTimedOut = (data) => {
      // Update user in the list if it exists
      setUsers((prev) =>
        prev.map((u) =>
          u._id === data.userId
            ? {
                ...u,
                isTimedOut: true,
                timeoutUntil: data.timeoutUntil,
                timeoutReason: data.timeoutReason,
              }
            : u
        )
      );
      // Reload dashboard
      loadDashboard();
    };

    const handleUserTimeoutRemoved = (data) => {
      // Update user in the list if it exists
      setUsers((prev) =>
        prev.map((u) =>
          u._id === data.userId
            ? {
                ...u,
                isTimedOut: false,
                timeoutUntil: null,
                timeoutReason: null,
              }
            : u
        )
      );
      // Reload dashboard
      loadDashboard();
    };

    // Register all socket listeners
    socket.on('newReport', handleNewReport);
    socket.on('reportResolved', handleReportResolved);
    socket.on('dashboardUpdate', handleDashboardUpdate);
    socket.on('userBanned', handleUserBanned);
    socket.on('userUnbanned', handleUserUnbanned);
    socket.on('userTimedOut', handleUserTimedOut);
    socket.on('userTimeoutRemoved', handleUserTimeoutRemoved);

    // Cleanup listeners on unmount
    return () => {
      socket.off('newReport', handleNewReport);
      socket.off('reportResolved', handleReportResolved);
      socket.off('dashboardUpdate', handleDashboardUpdate);
      socket.off('userBanned', handleUserBanned);
      socket.off('userUnbanned', handleUserUnbanned);
      socket.off('userTimedOut', handleUserTimedOut);
      socket.off('userTimeoutRemoved', handleUserTimeoutRemoved);
    };
  }, [socket, user, activeTab, filterStatus]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/dashboard');
      setDashboardStats(res.data);
      setLoading(false);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      showToast('Failed to load admin dashboard', 'error');
      setLoading(false);
    }
  };

  const loadReports = async () => {
    try {
      setLoading(true);
      const params = filterStatus === 'all' ? {} : { status: filterStatus };
      const res = await api.get('/admin/reports', { params });
      setReports(res.data.reports || []);
      setLoading(false);
    } catch (err) {
      console.error('Error loading reports:', err);
      showToast('Failed to load reports', 'error');
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/users', { params: { search: searchTerm } });
      setUsers(res.data.users || []);
      setLoading(false);
    } catch (err) {
      console.error('Error loading users:', err);
      showToast('Failed to load users', 'error');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      if (activeTab === 'reports') {
        loadReports();
      } else if (activeTab === 'users') {
        loadUsers();
      }
    }
  }, [activeTab, filterStatus, user]);

  // Separate effect for search term to debounce
  useEffect(() => {
    if (activeTab === 'users') {
      const timer = setTimeout(() => {
        loadUsers();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [searchTerm]);

  const handleResolveReport = async (reportId, status, adminNotes, action) => {
    try {
      await api.put(`/admin/reports/${reportId}/resolve`, {
        status,
        adminNotes,
        action,
      });
      showToast(`Report ${status} successfully`, 'success');
      loadReports();
      setSelectedReport(null);
    } catch (err) {
      console.error('Error resolving report:', err);
      showToast(err.response?.data?.msg || 'Failed to resolve report', 'error');
    }
  };

  const handleBanUser = async (userId, isBanned, banReason) => {
    try {
      await api.put(`/admin/users/${userId}/ban`, {
        isBanned,
        banReason,
      });
      showToast(isBanned ? 'User banned successfully' : 'User unbanned successfully', 'success');
      loadUsers();
      loadDashboard();
      if (selectedUser?._id === userId) {
        loadUserDetails(userId);
      }
    } catch (err) {
      console.error('Error banning user:', err);
      showToast(err.response?.data?.msg || 'Failed to ban user', 'error');
    }
  };

  const handleTimeoutUser = async (userId, days, reason) => {
    try {
      await api.put(`/admin/users/${userId}/timeout`, {
        days,
        reason,
      });
      showToast(`User timed out successfully for ${days} day(s)`, 'success');
      loadUsers();
      loadDashboard();
      if (selectedUser?._id === userId) {
        loadUserDetails(userId);
      }
    } catch (err) {
      console.error('Error timing out user:', err);
      showToast(err.response?.data?.msg || 'Failed to timeout user', 'error');
    }
  };

  const handleRemoveTimeout = async (userId) => {
    try {
      await api.put(`/admin/users/${userId}/remove-timeout`);
      showToast('User timeout removed successfully', 'success');
      loadUsers();
      loadDashboard();
      if (selectedUser?._id === userId) {
        loadUserDetails(userId);
      }
    } catch (err) {
      console.error('Error removing timeout:', err);
      showToast(err.response?.data?.msg || 'Failed to remove timeout', 'error');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const loadReportDetails = async (reportId) => {
    try {
      const res = await api.get(`/admin/reports/${reportId}`);
      setSelectedReport(res.data);
    } catch (err) {
      console.error('Error loading report details:', err);
      showToast('Failed to load report details', 'error');
    }
  };

  const loadUserDetails = async (userId) => {
    try {
      const res = await api.get(`/admin/users/${userId}`);
      setSelectedUser(res.data);
    } catch (err) {
      console.error('Error loading user details:', err);
      showToast('Failed to load user details', 'error');
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      await api.delete(`/admin/messages/${messageId}`);
      showToast('Message deleted successfully', 'success');
      if (selectedReport?.report?.conversationId) {
        loadReportDetails(selectedReport.report._id);
      }
    } catch (err) {
      console.error('Error deleting message:', err);
      showToast('Failed to delete message', 'error');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
      case 'reviewing': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'dismissed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    if (status === 'pending' || status === 'reviewing') {
      return 'Pending';
    }
    if (status === 'dismissed') {
      return 'Dismissed';
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  // Client-side search over the loaded reports
  const visibleReports = reports.filter((report) => {
    const query = reportSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      report.reportedBy?.username,
      report.reportedBy?.email,
      report.reportedUser?.username,
      report.reportedUser?.email,
      report.reason,
      report.description,
    ].some((value) => (value || '').toLowerCase().includes(query));
  });

  const getReasonLabel = (reason) => {
    const labels = {
      harassment: 'Harassment',
      spam: 'Spam',
      inappropriate_content: 'Inappropriate Content',
      scam: 'Scam',
      fake_profile: 'Fake Profile',
      other: 'Other',
    };
    return labels[reason] || reason;
  };

  if (loading && !dashboardStats) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Teal with Shield Icon */}
      <div className="bg-teal-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield size={40} className="text-teal-100" />
              <div>
                <h1 className="text-3xl font-bold">Admin Panel</h1>
                <p className="text-teal-100 text-sm">Platform Management & Moderation</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-teal-100 text-sm">Logged in as</p>
                <p className="font-semibold text-lg">{user?.username}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 px-4 py-2 rounded-lg transition-colors duration-200"
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>


      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-6 overflow-hidden">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-6 py-4 font-medium transition-all duration-200 flex items-center gap-2 ${
                activeTab === 'dashboard'
                  ? 'border-b-2 border-teal-600 text-teal-600 bg-teal-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <TrendingUp size={18} />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-6 py-4 font-medium transition-all duration-200 relative flex items-center gap-2 ${
                activeTab === 'reports'
                  ? 'border-b-2 border-teal-600 text-teal-600 bg-teal-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <AlertTriangle size={18} />
              Reports
              {dashboardStats?.stats?.pendingReports > 0 && (
                <span className="absolute top-2 right-2 bg-teal-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {dashboardStats.stats.pendingReports}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-6 py-4 font-medium transition-all duration-200 flex items-center gap-2 ${
                activeTab === 'users'
                  ? 'border-b-2 border-teal-600 text-teal-600 bg-teal-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <Users size={18} />
              Users
            </button>
          </div>
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && dashboardStats && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-1">Total Users</p>
                    <p className="text-3xl font-bold text-gray-800">{dashboardStats.stats.totalUsers}</p>
                  </div>
                  <div className="bg-teal-100 rounded-full p-3">
                    <Users className="text-teal-600" size={24} />
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-1">Active Users</p>
                    <p className="text-3xl font-bold text-green-600">{dashboardStats.stats.activeUsers}</p>
                  </div>
                  <div className="bg-green-100 rounded-full p-3">
                    <CheckCircle className="text-green-600" size={24} />
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-1">Banned Users</p>
                    <p className="text-3xl font-bold text-red-600">{dashboardStats.stats.bannedUsers || 0}</p>
                  </div>
                  <div className="bg-red-100 rounded-full p-3">
                    <Ban className="text-red-600" size={24} />
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-1">Timed Out</p>
                    <p className="text-3xl font-bold text-orange-600">{dashboardStats.stats.timedOutUsers || 0}</p>
                  </div>
                  <div className="bg-orange-100 rounded-full p-3">
                    <Clock className="text-orange-600" size={24} />
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium mb-1">Pending Reports</p>
                    <p className="text-3xl font-bold text-yellow-600">{dashboardStats.stats.pendingReports}</p>
                  </div>
                  <div className="bg-yellow-100 rounded-full p-3">
                    <AlertTriangle className="text-yellow-600" size={24} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2">Recent Reports</h2>
              <p className="text-gray-600 text-sm mb-4">Monitor and manage user reports</p>
              {dashboardStats.recentReports?.length > 0 ? (
                <div className="space-y-3">
                  {dashboardStats.recentReports.map((report) => (
                    <div
                      key={report._id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors duration-200"
                      onClick={() => {
                        loadReportDetails(report._id);
                        setActiveTab('reports');
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">
                            {report.reportedBy?.username} reported {report.reportedUser?.username}
                          </p>
                          <div className="mt-2">
                            <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {getReasonLabel(report.reason)}
                            </span>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                          {getStatusLabel(report.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No recent reports</p>
              )}
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex gap-4 items-center">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="Search by user, email, reason or description..."
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                    />
                  </div>
                </div>
                <div className="relative min-w-[180px]">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all appearance-none bg-white cursor-pointer font-medium text-gray-700 hover:border-teal-400 shadow-sm hover:shadow-md"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <Filter className="w-5 h-5 text-teal-600" size={20} />
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading reports...</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reporter</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reported User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {visibleReports.map((report) => (
                      <tr key={report._id} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{report.reportedBy?.username}</p>
                            <p className="text-xs text-gray-500">{report.reportedBy?.email}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{report.reportedUser?.username}</p>
                            <p className="text-xs text-gray-500">{report.reportedUser?.email}</p>
                            {report.reportedUser?.isBanned && (
                              <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded">Banned</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900">{getReasonLabel(report.reason)}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                            {getStatusLabel(report.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(report.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => loadReportDetails(report._id)}
                            className="px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 font-medium text-sm rounded-lg transition-colors duration-200 flex items-center gap-1.5 border border-teal-200"
                          >
                            <Eye size={16} />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleReports.length === 0 && (
                  <div className="text-center py-12">
                    <AlertTriangle className="mx-auto text-gray-400 mb-4" size={48} />
                    <p className="text-gray-500">No reports found</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search users by username or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading users...</p>
              </div>
            ) : users.length > 0 ? (
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto max-h-[calc(100vh-300px)] overflow-y-auto">
                  <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {users.map((userItem) => (
                      <tr key={userItem._id} className="hover:bg-gray-50 transition-colors duration-150">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-sm font-medium text-gray-900">{userItem.username}</p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-sm text-gray-500">{userItem.email}</p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {userItem.isBanned ? (
                            <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                              Banned
                            </span>
                          ) : userItem.isTimedOut && userItem.timeoutUntil && new Date(userItem.timeoutUntil) > new Date() ? (
                            <span className="px-3 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded-full">
                              Timed Out
                            </span>
                          ) : (
                            <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(userItem.memberSince || userItem.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => loadUserDetails(userItem._id)}
                              className="px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 font-medium text-sm rounded-lg transition-colors duration-200 flex items-center gap-1.5 border border-teal-200"
                            >
                              <Eye size={16} />
                              View
                            </button>
                            {userItem.isBanned ? (
                              <button
                                onClick={() => handleBanUser(userItem._id, false, '')}
                                className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 font-medium text-sm rounded-lg transition-colors duration-200 flex items-center gap-1.5 border border-green-200"
                              >
                                <CheckCircle size={16} />
                                Unban
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    const reason = prompt('Enter ban reason:');
                                    if (reason) {
                                      handleBanUser(userItem._id, true, reason);
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 font-medium text-sm rounded-lg transition-colors duration-200 flex items-center gap-1.5 border border-red-200"
                                >
                                  <Ban size={16} />
                                  Ban
                                </button>
                                {userItem.isTimedOut && userItem.timeoutUntil && new Date(userItem.timeoutUntil) > new Date() ? (
                                  <button
                                    onClick={() => handleRemoveTimeout(userItem._id)}
                                    className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-sm rounded-lg transition-colors duration-200 flex items-center gap-1.5 border border-blue-200"
                                  >
                                    <Clock size={16} />
                                    Remove Timeout
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      const days = prompt('Enter number of days to timeout (default: 7):', '7');
                                      const reason = prompt('Enter timeout reason:');
                                      if (days && !isNaN(days) && parseInt(days) > 0) {
                                        handleTimeoutUser(userItem._id, parseInt(days), reason || 'No reason provided');
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-orange-50 text-orange-700 hover:bg-orange-100 font-medium text-sm rounded-lg transition-colors duration-200 flex items-center gap-1.5 border border-orange-200"
                                  >
                                    <Clock size={16} />
                                    Timeout
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm">
                <Users className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-500">No users found</p>
                {searchTerm && (
                  <p className="text-sm text-gray-400 mt-2">Try a different search term</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Report Detail Modal */}
        {selectedReport && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Report Details</h2>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle size={24} />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Reporter</p>
                    <p className="font-medium">{selectedReport.report.reportedBy?.username}</p>
                    <p className="text-sm text-gray-500">{selectedReport.report.reportedBy?.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Reported User</p>
                    <p className="font-medium">{selectedReport.report.reportedUser?.username}</p>
                    <p className="text-sm text-gray-500">{selectedReport.report.reportedUser?.email}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Reason</p>
                  <p className="font-medium">{getReasonLabel(selectedReport.report.reason)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Description</p>
                  <p className="bg-gray-50 p-4 rounded-lg">{selectedReport.report.description}</p>
                </div>
                {selectedReport.messages && selectedReport.messages.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Conversation Messages</p>
                    <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                      {selectedReport.messages.map((msg) => (
                        <div key={msg._id} className="flex items-start justify-between bg-white p-3 rounded">
                          <div className="flex-1">
                            <p className="text-xs text-gray-500">{msg.sender?.username}</p>
                            <p className="text-sm">{msg.content}</p>
                            <p className="text-xs text-gray-400">{new Date(msg.createdAt).toLocaleString()}</p>
                          </div>
                          <button
                            onClick={() => {
                              if (window.confirm('Are you sure you want to delete this message?')) {
                                deleteMessage(msg._id);
                              }
                            }}
                            className="text-red-600 hover:text-red-800 ml-2"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {['pending', 'reviewing'].includes(selectedReport.report.status) && (
                  <div className="border-t pt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Admin Notes</label>
                      <textarea
                        id="adminNotes"
                        rows="3"
                        className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="Add notes about this report..."
                      />
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <button
                        onClick={() => {
                          const notes = document.getElementById('adminNotes').value;
                          handleResolveReport(selectedReport.report._id, 'resolved', notes, 'none');
                        }}
                        className="flex-1 min-w-[140px] bg-green-600 text-white py-2.5 px-4 rounded-lg hover:bg-green-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                      >
                        <CheckCircle size={18} />
                        Resolve
                      </button>
                      <button
                        onClick={() => {
                          const notes = document.getElementById('adminNotes').value;
                          handleResolveReport(selectedReport.report._id, 'resolved', notes, 'ban');
                        }}
                        className="flex-1 min-w-[140px] bg-red-600 text-white py-2.5 px-4 rounded-lg hover:bg-red-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                      >
                        <Ban size={18} />
                        Resolve & Ban
                      </button>
                      <button
                        onClick={() => {
                          const notes = document.getElementById('adminNotes').value;
                          handleResolveReport(selectedReport.report._id, 'dismissed', notes, 'none');
                        }}
                        className="flex-1 min-w-[140px] bg-gray-600 text-white py-2.5 px-4 rounded-lg hover:bg-gray-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                      >
                        <XCircle size={18} />
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* User Detail Modal */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">User Details</h2>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle size={24} />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Username</p>
                    <p className="font-medium">{selectedUser.user.username}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium">{selectedUser.user.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    {selectedUser.user.isBanned ? (
                      <span className="px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded-full">
                        Banned
                      </span>
                    ) : selectedUser.user.isTimedOut && selectedUser.user.timeoutUntil && new Date(selectedUser.user.timeoutUntil) > new Date() ? (
                      <span className="px-3 py-1 bg-orange-100 text-orange-800 text-sm font-medium rounded-full">
                        Timed Out
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Member Since</p>
                    <p className="font-medium">{new Date(selectedUser.user.memberSince || selectedUser.user.date).toLocaleDateString()}</p>
                  </div>
                </div>
                {selectedUser.user.isBanned && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Ban Reason</p>
                    <p className="font-medium">{selectedUser.user.banReason || 'No reason provided'}</p>
                    {selectedUser.user.bannedBy && (
                      <p className="text-xs text-gray-500 mt-1">
                        Banned by: {selectedUser.user.bannedBy?.username} on {new Date(selectedUser.user.bannedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}
                {selectedUser.reportsAsReported && selectedUser.reportsAsReported.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Reports Against This User</p>
                    <div className="space-y-2">
                      {selectedUser.reportsAsReported.map((report) => (
                        <div key={report._id} className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-sm">
                            <span className="font-medium">{getReasonLabel(report.reason)}</span> - 
                            Reported by {report.reportedBy?.username}
                          </p>
                          <p className="text-xs text-gray-500">{report.description}</p>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${getStatusColor(report.status)}`}>
                            {getStatusLabel(report.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="border-t pt-4">
                  <div className="flex gap-3 flex-wrap">
                    {selectedUser.user.isBanned ? (
                      <button
                        onClick={() => handleBanUser(selectedUser.user._id, false, '')}
                        className="flex-1 min-w-[160px] bg-green-600 text-white py-2.5 px-4 rounded-lg hover:bg-green-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                      >
                        <CheckCircle size={18} />
                        Unban User
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            const reason = prompt('Enter ban reason:');
                            if (reason) {
                              handleBanUser(selectedUser.user._id, true, reason);
                            }
                          }}
                          className="flex-1 min-w-[160px] bg-red-600 text-white py-2.5 px-4 rounded-lg hover:bg-red-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                        >
                          <Ban size={18} />
                          Ban User
                        </button>
                        {selectedUser.user.isTimedOut && selectedUser.user.timeoutUntil && new Date(selectedUser.user.timeoutUntil) > new Date() ? (
                          <button
                            onClick={() => handleRemoveTimeout(selectedUser.user._id)}
                            className="flex-1 min-w-[160px] bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                          >
                            <Clock size={18} />
                            Remove Timeout
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const days = prompt('Enter number of days to timeout (default: 7):', '7');
                              const reason = prompt('Enter timeout reason:');
                              if (days && !isNaN(days) && parseInt(days) > 0) {
                                handleTimeoutUser(selectedUser.user._id, parseInt(days), reason || 'No reason provided');
                              }
                            }}
                            className="flex-1 min-w-[160px] bg-orange-600 text-white py-2.5 px-4 rounded-lg hover:bg-orange-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                          >
                            <Clock size={18} />
                            Timeout User
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;

