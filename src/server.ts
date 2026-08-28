import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
export const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  socket.on('subscribeTraveler', (userId: string) => {
    socket.join(`twin_${userId}`);
  });

  socket.on('subscribeAdmin', () => {
    socket.join('admin_dashboard');
  });
});

export function notifyDigitalTwinUpdate(userId: string, twinData: any) {
  io.to(`twin_${userId}`).emit('digitalTwinUpdated', twinData);
  io.to('admin_dashboard').emit('travelerRiskUpdated', { userId, ...twinData });
}

export function notifyEmergencySOS(incident: any) {
  io.to('admin_dashboard').emit('sosTriggered', incident);
}