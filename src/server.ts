import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './lib/prisma';
import { evaluateGeoFence } from './services/geoService';
import { computeSafetyRisk, computeCounterfactualRisk } from './services/safetyRiskEngine';
import { reportRoadHazard } from './controllers/hazardController';
import { getNearbySafePlaces, triggerEmergencySOS } from './controllers/safetyController';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
export const io = new Server(server, {
  cors: { origin: '*' }
});

// 1. Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'RAKSHA API Gateway & Safety Intelligence Online' });
});

// 2. Road Hazard / Pothole Detection Ingestion
app.post('/hazards/pothole', reportRoadHazard);

// 3. Location update & Digital Twin synchronization
app.post('/location/update', async (req: Request, res: Response) => {
  try {
    const { userId, latitude, longitude, speed } = req.body;
    if (!userId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    const geoFences = await prisma.geoFence.findMany();
    const geoStatus = evaluateGeoFence(latitude, longitude, geoFences);

    const currentTwin = await prisma.digitalTwin.findUnique({ where: { userId } });

    const riskAssessment = computeSafetyRisk({
      zoneType: geoStatus.zone?.type || null,
      zoneRisk: geoStatus.zone?.risk || 0,
      heartRate: currentTwin?.lastHeartRate || 75,
      spo2: currentTwin?.lastSpo2 || 98
    });

    const updatedTwin = await prisma.digitalTwin.upsert({
      where: { userId },
      update: {
        lastLat: latitude,
        lastLng: longitude,
        speed: speed || 0,
        currentZoneId: geoStatus.zone?.id || null,
        currentZoneType: geoStatus.zone?.type || null,
        zoneRisk: geoStatus.zone?.risk || 0,
        riskScore: riskAssessment.riskScore,
        safetyState: riskAssessment.safetyState,
        recommendedAction: riskAssessment.recommendedAction,
        activeContributors: riskAssessment.contributors as any
      },
      create: {
        userId,
        lastLat: latitude,
        lastLng: longitude,
        speed: speed || 0,
        currentZoneId: geoStatus.zone?.id || null,
        currentZoneType: geoStatus.zone?.type || null,
        zoneRisk: geoStatus.zone?.risk || 0,
        riskScore: riskAssessment.riskScore,
        safetyState: riskAssessment.safetyState,
        recommendedAction: riskAssessment.recommendedAction,
        activeContributors: riskAssessment.contributors as any
      }
    });

    // Real-time broadcast
    io.to(`twin_${userId}`).emit('digitalTwinUpdated', updatedTwin);
    io.to('admin_dashboard').emit('travelerRiskUpdated', { userId, ...updatedTwin });

    return res.json({ success: true, data: { digitalTwin: updatedTwin, geoStatus, riskAssessment } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Fetch Digital Twin
app.get('/digital-twin/:userId', async (req: Request, res: Response) => {
  try {
    const twin = await prisma.digitalTwin.findUnique({
      where: { userId: req.params.userId },
      include: { user: { include: { emergencyContacts: true } } }
    });
    if (!twin) return res.status(404).json({ success: false, error: 'Digital Twin not found' });
    return res.json({ success: true, data: twin });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 5. "What If" Counterfactual Assessment
app.post('/risk/what-if', async (req: Request, res: Response) => {
  try {
    const { userId, removeFactors } = req.body;
    const twin = await prisma.digitalTwin.findUnique({ where: { userId } });
    if (!twin) return res.status(404).json({ success: false, error: 'User Digital Twin not found' });

    const counterfactual = computeCounterfactualRisk(
      {
        zoneType: twin.currentZoneType || null,
        zoneRisk: twin.zoneRisk,
        heartRate: twin.lastHeartRate,
        spo2: twin.lastSpo2
      },
      removeFactors || []
    );

    return res.json({ success: true, data: counterfactual });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Real-time Socket Subscriptions
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on('subscribeTraveler', (userId: string) => {
    socket.join(`twin_${userId}`);
    console.log(`[Socket.IO] Subscribed to traveler twin: ${userId}`);
  });

  socket.on('subscribeAdmin', () => {
    socket.join('admin_dashboard');
    console.log(`[Socket.IO] Subscribed to Admin Control Room`);
  });
});

// 7. Start listening on PORT 5000
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🛡️  RAKSHA Safety Backend is live on http://localhost:${PORT}`);
});

// 8. Women Safety & Verified Safe Zones
app.get('/safety/safe-places', getNearbySafePlaces);
app.post('/sos', triggerEmergencySOS);