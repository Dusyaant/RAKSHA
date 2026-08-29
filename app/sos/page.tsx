'use client';

import { useState } from 'react';
import axios from 'axios';
// Going up two levels: from page.tsx -> sos/ -> app/ -> root, then into hooks/
import { useSocket } from '../../hooks/useSocket'; 
import toast from 'react-hot-toast';

export default function SOSPage() {
  useSocket(); // Initialize real-time listener
  const [loading, setLoading] = useState(false);

  const triggerSOS = () => {
    setLoading(true);
    
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await axios.post('http://localhost:5000/sos', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            reason: 'UNSAFE_SITUATION'
          });
          alert('🚨 SOS Dispatched! Emergency contacts and responders have been alerted.');
        } catch (err) {
          console.error(err);
          alert('Failed to send SOS. Please try again.');
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        alert('Please allow location access to trigger an SOS.');
        setLoading(false);
      }
    );
  };

  return (
    <div className="flex h-screen items-center justify-center bg-red-50">
      <div className="text-center">
        <h1 className="mb-8 text-2xl font-bold text-red-800">Emergency Assistance</h1>
        <button 
          onClick={triggerSOS} 
          disabled={loading}
          className="h-64 w-64 rounded-full bg-red-600 text-4xl font-extrabold text-white shadow-[0_0_40px_rgba(220,38,38,0.6)] transition-transform active:scale-95 disabled:bg-red-400"
        >
          {loading ? 'SENDING...' : 'SOS'}
        </button>
        <p className="mt-8 text-gray-600">Pressing this will dispatch your live location.</p>
      </div>
    </div>
  );
}