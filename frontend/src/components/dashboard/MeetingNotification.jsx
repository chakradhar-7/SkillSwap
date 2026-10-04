import React from 'react';
import { Video, X } from 'lucide-react';

const MeetingNotification = ({ meetingData, onClose, onJoinMeeting }) => {
  if (!meetingData) return null;

  const { teacher, skill, meetingLink } = meetingData;

  const handleJoinMeeting = () => {
    if (meetingLink) {
      window.open(meetingLink, '_blank');
      onJoinMeeting();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4" style={{
        animation: 'slide-down 0.3s ease'
      }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full flex items-center justify-center text-white">
              <Video size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800">Meeting Started!</h3>
              <p className="text-sm text-gray-500 mt-1">
                {teacher} has started the session
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-gray-700 mb-2">
            <span className="font-semibold">Skill:</span> {skill}
          </p>
          <p className="text-sm text-gray-500">
            Click the button below to join the meeting
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
          >
            Close
          </button>
          <button
            onClick={handleJoinMeeting}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-teal-500 to-blue-500 text-white rounded-lg hover:from-teal-600 hover:to-blue-600 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Video size={18} />
            Join Meeting
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slide-down {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default MeetingNotification;

