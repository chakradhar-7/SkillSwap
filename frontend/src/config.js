// Backend base URL (REST API and Socket.IO). Override with VITE_API_URL in frontend/.env
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
