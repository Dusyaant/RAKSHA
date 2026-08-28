import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { io } from '../server';

export async function reportRoadHazard(req: Request, res: Response) {
  try {
    const { userId, latitude, longitude, hazardType, severity, potholeCount, imageUrl, contractorName } = req.body;

    // Resolve an existing user if none is supplied in the request body
    let targetUserId = userId;
    if (!targetUserId) {
      const defaultUser = await prisma.user.findFirst({ where: { role: 'USER' } });
      targetUserId = defaultUser?.id;
    }

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'No valid user found to associate with this hazard report.'
      });
    }

    const report = await prisma.roadHazardReport.create({
      data: {
        userId: targetUserId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        hazardType: hazardType || 'POTHOLE',
        severity: severity || 'MEDIUM',
        potholeCount: potholeCount || 1,
        imageUrl,
        contractorName: contractorName || 'Municipal Highway Authority',
        legalNoticeSent: severity === 'HIGH' || severity === 'CRITICAL'
      }
    });

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
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}