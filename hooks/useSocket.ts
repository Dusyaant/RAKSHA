'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = () => {
  const socket = useRef<Socket | null>(null);

  useEffect(() => {
    // 1. Connect to the Node.js backend
    socket.current = io('http://localhost:5000', {
      transports: ['websocket'], // Forces WebSockets over HTTP polling
    });

    socket.current.on('connect', () => {
      console.log('✅ Connected to RAKSHA Live Socket:', socket.current?.id);
    });

    // 2. Global Listener: Road Hazards
    socket.current.on('hazardReported', (data) => {
      console.warn('⚠️ HAZARD ALERT:', data);
      // In a production app, replace this alert with a shadcn/ui Toast notification
      alert(`⚠️ ROAD HAZARD: ${data.warning}\nSeverity: ${data.severity}\nContractor Alerted: ${data.contractorName}`);
    });

    // 3. Global Listener: Emergency SOS
    socket.current.on('sosTriggered', (data) => {
      console.error('🚨 SOS ALERT:', data);
      // In a production app, replace this alert with a red screen banner or modal
      alert(`🚨 SOS TRIGGERED by ${data.travelerName}!\nStatus: ${data.status}\nLocation: ${data.coordinates[0]}, ${data.coordinates[1]}`);
    });

    // 4. Cleanup connection when the app unmounts
    return () => {
      if (socket.current) {
        socket.current.disconnect();
        console.log('❌ Disconnected from RAKSHA Live Socket');
      }
    };
  }, []);

  return socket.current;
};