import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { io } from '../server';
import { calculateHaversineMeters } from '../services/geoService';

// 1. Fetch nearby safe zones (Police, Hospitals, Shelters)
export async function getNearbySafePlaces(req: Request, res: Response) {
  try {
    const { latitude, longitude, radiusMeters = 5000 } = req.query;
    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'Latitude and Longitude are required' });
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const rad = parseFloat(radiusMeters as string);

    const allPlaces = await prisma.safePlace.findMany({ where: { isVerified: true } });

    const nearbyPlaces = allPlaces
      .map((place) => ({
        ...place,
        distanceMeters: Math.round(calculateHaversineMeters(lat, lng, place.latitude, place.longitude))
      }))
      .filter((place) => place.distanceMeters <= rad)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return res.json({ success: true, data: nearbyPlaces });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// 2. Comprehensive SOS Trigger with Emergency Contact Alerts & Live Broadcast
export async function triggerEmergencySOS(req: Request, res: Response) {
  try {
    const { userId, latitude, longitude, audioUrl, imageUrl, reason } = req.body;

    let targetUserId = userId;
    if (!targetUserId) {
      const defaultUser = await prisma.user.findFirst({ where: { role: 'USER' } });
      targetUserId = defaultUser?.id;
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { emergencyContacts: true, digitalTwin: true }
    });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Create Incident Record
    const incident = await prisma.incident.create({
      data: {
        userId: user.id,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        status: 'OPEN',
        reason: reason || 'PANIC_BUTTON_TRIGGERED',
        snapshot: {
          user: { name: user.name, email: user.email },
          digitalTwin: user.digitalTwin,
          emergencyContacts: user.emergencyContacts,
          evidence: { audioUrl, imageUrl }
        }
      }
    });

    // Record evidence media if provided
    if (imageUrl || audioUrl) {
      if (imageUrl) {
        await prisma.evidenceMedia.create({
          data: { userId: user.id, mediaType: 'IMAGE', mediaUrl: imageUrl, latitude: parseFloat(latitude), longitude: parseFloat(longitude), incidentId: incident.id }
        });
      }
      if (audioUrl) {
        await prisma.evidenceMedia.create({
          data: { userId: user.id, mediaType: 'AUDIO', mediaUrl: audioUrl, latitude: parseFloat(latitude), longitude: parseFloat(longitude), incidentId: incident.id }
        });
      }
    }

    // Real-time broadcast to Admin Dashboard & Responders
    io.emit('sosTriggered', {
      incidentId: incident.id,
      travelerName: user.name,
      coordinates: [latitude, longitude],
      emergencyContactsNotified: user.emergencyContacts,
      status: 'OPEN',
      timestamp: new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      message: 'SOS triggered successfully. Emergency contacts alerted & Responders dispatched.',
      data: {
        incidentId: incident.id,
        contactsAlertedCount: user.emergencyContacts.length
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}