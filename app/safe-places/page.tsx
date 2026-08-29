'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

type SafePlace = {
  id: string;
  name: string;
  category: string;
  distanceMeters: number;
  contact: string;
  address: string;
};

export default function SafePlaces() {
  const [places, setPlaces] = useState<SafePlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await axios.get(`http://localhost:5000/safety/safe-places?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}`);
          setPlaces(res.data.data);
        } catch (err) {
          console.error("Failed to fetch safe places", err);
        } finally {
          setLoading(false);
        }
      },
      () => {
        alert("Please enable location to find nearby safe zones.");
        setLoading(false);
      }
    );
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-6 text-3xl font-bold text-gray-800">Nearby Safe Zones</h2>
        
        {loading ? (
          <p className="text-gray-600">Locating safe places near you...</p>
        ) : places.length === 0 ? (
          <p className="text-gray-600">No safe zones found within a 5km radius.</p>
        ) : (
          <div className="grid gap-4">
            {places.map((place) => (
              <div key={place.id} className="rounded-lg border-l-4 border-green-500 bg-white p-6 shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{place.name}</h3>
                    <p className="mt-1 text-sm font-semibold text-blue-600">{place.category.replace('_', ' ')}</p>
                    <p className="mt-2 text-gray-600">{place.address}</p>
                    <p className="mt-1 text-gray-800 font-medium">📞 Emergency: {place.contact}</p>
                  </div>
                  <div className="rounded bg-green-100 px-3 py-1 text-sm font-bold text-green-800">
                    {place.distanceMeters}m away
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}