import api from './api';

// Opens the chat with a user if you are already connected; otherwise sends a
// chat request (which is accepted immediately if they already requested you).
// Returns true when it navigated to the chat.
export const openChatWith = async (recipientId, { navigate, showToast }) => {
  try {
    const { data: existing } = await api.get(`/messages/start/${recipientId}`);
    if (existing?.status === 'accepted') {
      navigate(`/messages?conversation=${existing._id}`);
      return true;
    }

    const { data: conversation } = await api.post(`/messages/request/${recipientId}`);
    if (conversation?.status === 'accepted') {
      navigate(`/messages?conversation=${conversation._id}`);
      return true;
    }
    showToast('Chat request sent. You can chat once they accept it.', 'success', 5000);
  } catch (err) {
    console.error('Failed to open chat', err);
    showToast(err.response?.data?.msg || 'Could not open chat. Please try again.', 'warning');
  }
  return false;
};
