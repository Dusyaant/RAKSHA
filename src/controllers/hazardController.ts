import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { io } from '../server';

export async function reportRoadHazard(req: Request, res: Response) {
  const { latitude, longitude, hazardType, severity, potholeCount, imageUrl, contractorName } = req.body;
  const userId = (req as any).user.id;

  const report = await prisma.roadHazardReport.create({
    data: {
      userId,
      latitude,
      longitude,
      hazardType: hazardType || 'POTHOLE',
      severity: severity || 'MEDIUM',
      potholeCount: potholeCount || 1,
      imageUrl,
      contractorName: contractorName || 'Municipal Highway Authority',
      legalNoticeSent: severity === 'HIGH' || severity === 'CRITICAL'
    }
  });

  // Emit real-time alert to nearby travelers and admin dashboard
  io.emit('hazardReported', {
    reportId: report.id,
    coordinates: [latitude, longitude],
    potholeCount,
    severity,
    warning: 'Severe road degradation detected. Alternate route recommended.',
    legalEscalationDrafted: report.legalNoticeSent
  });

  return res.status(201).json({
    success: true,
    data: {
      report,
      action: report.legalNoticeSent
        ? 'Notice drafted and dispatched to road authority and contractor registry.'
        : 'Logged to regional safety map.'
    }
  });
}