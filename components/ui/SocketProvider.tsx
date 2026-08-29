'use client';

import { useSocket } from '../../hooks/useSocket';

export default function SocketProvider({ children }: { children: React.ReactNode }) {
  // This initializes the socket connection once for the entire app
  useSocket(); 

  return <>{children}</>;
}