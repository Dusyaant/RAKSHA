export interface RiskFactorsInput {
  zoneType?: 'SAFE' | 'CAUTION' | 'HIGH_RISK' | null;
  zoneRisk?: number;
  routeDeviationMeters?: number;
  inactivitySeconds?: number;
  heartRate?: number | null;
  spo2?: number | null;
  potholeSeverityCount?: number;
}

export interface RiskContributor {
  factor: string;
  contribution: number;
  detail: string;
}

export interface RiskAssessmentResult {
  riskScore: number;
  confidence: number;
  safetyState: 'SAFE' | 'WATCH' | 'AT_RISK' | 'CRITICAL' | 'INCIDENT';
  recommendedAction: 'MONITOR' | 'CHECK_IN' | 'VERIFY' | 'ESCALATE' | 'DISPATCH';
  contributors: RiskContributor[];
}

export function computeSafetyRisk(inputs: RiskFactorsInput): RiskAssessmentResult {
  const contributors: RiskContributor[] = [];
  let score = 0;

  // 1. Geo-Fence risk contribution
  if (inputs.zoneType === 'HIGH_RISK') {
    const cont = Math.min(30, (inputs.zoneRisk || 25));
    score += cont;
    contributors.push({ factor: 'HIGH_RISK_GEOFENCE', contribution: cont, detail: 'Inside high-risk perimeter' });
  } else if (inputs.zoneType === 'CAUTION') {
    const cont = 12;
    score += cont;
    contributors.push({ factor: 'CAUTION_GEOFENCE', contribution: cont, detail: 'Inside caution perimeter' });
  }

  // 2. Route Deviation
  if (inputs.routeDeviationMeters && inputs.routeDeviationMeters > 300) {
    const cont = inputs.routeDeviationMeters > 800 ? 25 : 15;
    score += cont;
    contributors.push({ factor: 'ROUTE_DEVIATION', contribution: cont, detail: `${Math.round(inputs.routeDeviationMeters)}m route departure` });
  }

  // 3. Prolonged Inactivity (demo window: > 45s)
  if (inputs.inactivitySeconds && inputs.inactivitySeconds > 45) {
    const cont = Math.min(25, Math.floor(inputs.inactivitySeconds / 15) * 5);
    score += cont;
    contributors.push({ factor: 'PROLONGED_INACTIVITY', contribution: cont, detail: `No movement/ack for ${inputs.inactivitySeconds}s` });
  }

  // 4. Biometric Health Anomaly (IoT Smartwatch)
  if (inputs.heartRate && (inputs.heartRate > 125 || inputs.heartRate < 45)) {
    score += 20;
    contributors.push({ factor: 'ABNORMAL_HEART_RATE', contribution: 20, detail: `Wearable detected ${inputs.heartRate} bpm` });
  }
  if (inputs.spo2 && inputs.spo2 < 90) {
    score += 20;
    contributors.push({ factor: 'LOW_SPO2', contribution: 20, detail: `Wearable SpO2 at ${inputs.spo2}%` });
  }

  // 5. Road Hazards / Dangerous Infrastructure
  if (inputs.potholeSeverityCount && inputs.potholeSeverityCount >= 3) {
    score += 15;
    contributors.push({ factor: 'HAZARDOUS_ROAD_INFRASTRUCTURE', contribution: 15, detail: 'Multiple severe potholes detected' });
  }

  const finalScore = Math.min(100, Math.max(0, score));

  // Determine state & action
  let safetyState: RiskAssessmentResult['safetyState'] = 'SAFE';
  let recommendedAction: RiskAssessmentResult['recommendedAction'] = 'MONITOR';

  if (finalScore >= 75) {
    safetyState = 'CRITICAL';
    recommendedAction = 'DISPATCH';
  } else if (finalScore >= 50) {
    safetyState = 'AT_RISK';
    recommendedAction = 'ESCALATE';
  } else if (finalScore >= 25) {
    safetyState = 'WATCH';
    recommendedAction = 'CHECK_IN';
  }

  return {
    riskScore: finalScore,
    confidence: 90,
    safetyState,
    recommendedAction,
    contributors
  };
}

// "What If" Counterfactual Assessment
export function computeCounterfactualRisk(currentInputs: RiskFactorsInput, removeFactors: string[]) {
  const base = computeSafetyRisk(currentInputs);
  const modifiedInputs: RiskFactorsInput = { ...currentInputs };

  for (const factor of removeFactors) {
    if (factor === 'INACTIVITY') modifiedInputs.inactivitySeconds = 0;
    if (factor === 'GEOFENCE') { modifiedInputs.zoneType = null; modifiedInputs.zoneRisk = 0; }
    if (factor === 'DEVIATION') modifiedInputs.routeDeviationMeters = 0;
    if (factor === 'HEALTH') { modifiedInputs.heartRate = 75; modifiedInputs.spo2 = 98; }
    if (factor === 'ROAD_HAZARD') modifiedInputs.potholeSeverityCount = 0;
  }

  const counterfactual = computeSafetyRisk(modifiedInputs);
  return {
    currentRisk: base.riskScore,
    counterfactualRisk: counterfactual.riskScore,
    difference: base.riskScore - counterfactual.riskScore,
    remainingContributors: counterfactual.contributors
  };
}