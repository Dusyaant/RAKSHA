import { Role, ZoneType, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/raksha_db?schema=public';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding demo data for RAKSHA...');

  // 1. Clean existing records
  await prisma.roadHazardReport.deleteMany();
  await prisma.healthReading.deleteMany();
  await prisma.device.deleteMany();
  await prisma.digitalTwin.deleteMany();
  await prisma.journey.deleteMany();
  await prisma.destination.deleteMany();
  await prisma.geoFence.deleteMany();
  await prisma.emergencyContact.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create Travelers & Admins
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const adminHash = await bcrypt.hash('AdminPass123!', 10);

  const traveler = await prisma.user.create({
    data: {
      email: 'traveler@raksha.io',
      passwordHash,
      name: 'Priya Sharma',
      role: Role.USER,
      emergencyContacts: {
        create: [
          {
            name: 'Local Guardian',
            relationship: 'Guardian',
            phone: '+919876543210',
            email: 'guardian@raksha.io'
          }
        ]
      }
    }
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@raksha.io',
      passwordHash: adminHash,
      name: 'Control Room Admin',
      role: Role.ADMIN
    }
  });

  // 3. Create Geo-Fenced Zones & Destinations
  const cautionZone = await prisma.geoFence.create({
    data: {
      name: 'Old Town Heritage Area',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusMeters: 500,
      zoneType: ZoneType.CAUTION,
      baseRisk: 25.0
    }
  });

  const highRiskZone = await prisma.geoFence.create({
    data: {
      name: 'Unlit Industrial Bypass',
      latitude: 12.9850,
      longitude: 77.6050,
      radiusMeters: 750,
      zoneType: ZoneType.HIGH_RISK,
      baseRisk: 45.0
    }
  });

  await prisma.destination.create({
    data: {
      name: 'Central Plaza Transit Hub',
      latitude: 12.9716,
      longitude: 77.5946,
      description: 'Major transit and pick-up spot for tourists and travelers.',
      safetyScore: 82.0,
      geoFenceId: cautionZone.id
    }
  });

  // 4. Initialize Digital Twin for the traveler
  await prisma.digitalTwin.create({
    data: {
      userId: traveler.id,
      lastLat: 12.9716,
      lastLng: 77.5946,
      speed: 0.0,
      currentZoneId: cautionZone.id,
      currentZoneType: ZoneType.CAUTION,
      zoneRisk: 25.0,
      riskScore: 25.0,
      safetyState: 'WATCH',
      recommendedAction: 'CHECK_IN'
    }
  });

  // 5. Register Smartwatch Device
  await prisma.device.create({
    data: {
      userId: traveler.id,
      deviceName: 'Raksha SmartBand V1',
      deviceType: 'SMARTWATCH',
      isConnected: true,
      healthReadings: {
        create: [
          {
            heartRate: 74,
            spo2: 98,
            status: 'NORMAL'
          }
        ]
      }
    }
  });

  console.log('✅ Demo seeding complete:');
  console.log(`- Traveler: traveler@raksha.io (Password: Password123!)`);
  console.log(`- Admin: admin@raksha.io (Password: AdminPass123!)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });