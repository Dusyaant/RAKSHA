'use client';

import { useState } from 'react';
import axios from 'axios';

export default function ReportHazard() {
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(false);

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const response = await axios.post('http://localhost:5000/hazards/pothole', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            hazardType: 'POTHOLE',
            severity: count >= 3 ? 'CRITICAL' : 'MEDIUM',
            potholeCount: count,
            stateCode: 'KA' // Defaulting to Karnataka for the demo
          });
          
          const contractor = response.data.data.contractorNotified;
          alert(`✅ Hazard reported successfully!\n\nAutomated notice sent to: ${contractor}`);
        } catch (err) {
          console.error(err);
          alert('Failed to submit report.');
        } finally {
          setLoading(false);
        }
      },
      () => {
        alert('Location access is required to report a hazard.');
        setLoading(false);
      }
    );
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100 p-4">
      <form onSubmit={submitReport} className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <h2 className="mb-6 text-2xl font-bold text-gray-800">Report Road Hazard</h2>
        
        <label className="mb-2 block font-semibold text-gray-700">Number of Potholes in cluster:</label>
        <input 
          type="number" 
          value={count} 
          onChange={(e) => setCount(Number(e.target.value))}
          className="mb-6 w-full rounded-lg border border-gray-300 p-3 focus:border-blue-500 focus:outline-none" 
          min="1" 
          required
        />
        
        <button 
          type="submit" 
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 p-3 font-bold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
        >
          {loading ? 'Submitting Location...' : 'Submit Report'}
        </button>
      </form>
    </div>
  );
}