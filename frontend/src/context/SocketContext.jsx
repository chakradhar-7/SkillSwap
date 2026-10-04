import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_URL } from '../config';

const SocketContext = createContext();

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { token, user } = useAuth();
  const userId = user?._id;

  useEffect(() => {
    if (!token || !userId) {
      setSocket(null);
      return undefined;
    }

    // The server identifies the user from this token and joins their rooms itself
    const newSocket = io(API_URL, { auth: { token } });
    newSocket.on('connect_error', (err) => {
      console.error('Socket connection failed:', err.message);
    });
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [token, userId]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
