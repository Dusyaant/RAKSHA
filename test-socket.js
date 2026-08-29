import { io } from 'socket.io-client';

// Connect to the RAKSHA backend
const socket = io('http://localhost:5000');

console.log('⏳ Connecting to RAKSHA Live Socket Server...');

socket.on('connect', () => {
  console.log(`✅ Connected with Client ID: ${socket.id}`);
  
  // Simulate an admin subscribing to the control room
  socket.emit('subscribeAdmin');
});

// Listen for Pothole / Hazard Reports
socket.on('hazardReported', (data) => {
  console.log('\n⚠️ [LIVE ALERT] ROAD HAZARD REPORTED:');
  console.log(JSON.stringify(data, null, 2));
});

// Listen for Emergency SOS Triggers
socket.on('sosTriggered', (data) => {
  console.log('\n🚨 [LIVE ALERT] SOS EMERGENCY TRIGGERED:');
  console.log(JSON.stringify(data, null, 2));
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});