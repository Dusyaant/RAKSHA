// RAKSHA Safety Intelligence Engine
//
// This is the SINGLE SOURCE OF TRUTH for turning raw "sensor" inputs into a
// risk score, a confidence score, a safety state, an evidence breakdown and
// an adaptive intervention decision. Every panel in the UI (Telemetry, WHY,
// WHAT IF, Knowledge Graph, Adaptive Intervention) reads from the output of
// `calculateSafetyState`. Nothing downstream hardcodes its own numbers.
//
// This is prototype / simulated intelligence: the weights below are
// deterministic, hand-tuned heuristics chosen to produce sensible relative
// behaviour across scenarios — not a trained ML model, and not connected to
// any real sensor feed. That is intentional and disclosed in the UI.

export type SafetyState = 'SAFE' | 'WATCH' | 'AT_RISK' | 'CRITICAL' | 'INCIDENT'
export type Action = 'MONITOR' | 'GATHER_EVIDENCE' | 'CHECK_IN' | 'ESCALATE'
export type Weather = 'CLEAR' | 'LIGHT_RAIN' | 'HEAVY_RAIN'
export type Crowd = 'HIGH' | 'NORMAL' | 'LOW'
export type TerrainRisk = 'LOW' | 'MEDIUM' | 'HIGH'
export type EmergencyAccess = 'GOOD' | 'MODERATE' | 'LIMITED'

export interface Zone {
  id: string
  name: string
  /** Base historical-risk contribution this zone adds to the risk score */
  riskWeight: number
  historicalIncidents: number
  /** Hour-of-day window [start, end) in 24h clock; end may exceed 24 (wraps past midnight) */
  highRiskWindow: [number, number] | null
  nearestResponderKm: number
  emergencyAccess: EmergencyAccess
  terrainRisk: TerrainRisk
}

export const ZONES: Record<string, Zone> = {
  zoneA: {
    id: 'zoneA',
    name: 'Central Market District',
    riskWeight: 3,
    historicalIncidents: 3,
    highRiskWindow: null,
    nearestResponderKm: 0.8,
    emergencyAccess: 'GOOD',
    terrainRisk: 'LOW',
  },
  zoneB: {
    id: 'zoneB',
    name: 'Riverside Heritage Trail',
    riskWeight: 8,
    historicalIncidents: 9,
    highRiskWindow: [19, 23],
    nearestResponderKm: 1.6,
    emergencyAccess: 'MODERATE',
    terrainRisk: 'MEDIUM',
  },
  zoneC: {
    id: 'zoneC',
    name: 'Remote Hill Circuit',
    riskWeight: 13,
    historicalIncidents: 17,
    highRiskWindow: [20, 25], // 20:00 -> 01:00
    nearestResponderKm: 2.4,
    emergencyAccess: 'LIMITED',
    terrainRisk: 'HIGH',
  },
}

/** Prototype personal behavioural baseline for this tourist. Deterministic, not ML-trained. */
export const PERSONAL_BASELINE = {
  typicalSpeedKmh: 3.8,
  typicalStopMinutes: 2,
  typicalActiveWindow: '06:00–21:00',
}

export interface DigitalTwinInputs {
  zoneId: string
  hour: number // 0-23, local time
  weather: Weather
  crowd: Crowd
  routeDeviationM: number
  inactivityMinutes: number
  speedKmh: number
  aiAnomalyScore: number // 0-100, simulated model output
}

export const BASELINE_INPUTS: DigitalTwinInputs = {
  zoneId: 'zoneA',
  hour: 14,
  weather: 'CLEAR',
  crowd: 'HIGH',
  routeDeviationM: 0,
  inactivityMinutes: 0,
  speedKmh: 3.8,
  aiAnomalyScore: 4,
}

export interface EvidenceItem {
  key: string
  name: string
  contribution: number // signed: positive raises risk, negative lowers it
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  protective: boolean
  ambient?: boolean // constant baseline-uncertainty item, excluded from confidence agreement math
  explanation: string
}

export interface SafetyResult {
  riskScore: number
  confidence: number
  state: SafetyState
  action: Action
  actionReason: string
  evidence: EvidenceItem[]
  personalBaselineDeviationPct: number
  isNight: boolean
  inHighRiskWindow: boolean
  zone: Zone
}

function isHourInWindow(hour: number, window: [number, number] | null): boolean {
  if (!window) return false
  const [start, end] = window
  if (end <= 24) return hour >= start && hour < end
  return hour >= start || hour < end - 24 // wraps past midnight, e.g. [20, 25] === 20:00-01:00
}

export function personalBaselineDeviation(speedKmh: number): number {
  const typical = PERSONAL_BASELINE.typicalSpeedKmh
  return Math.round(Math.min(100, (Math.abs(typical - speedKmh) / typical) * 100))
}

/**
 * Core evidence-fusion function. Produces a signed evidence list from raw
 * inputs. Every other number in the app (risk, confidence, WHY, WHAT IF)
 * is derived from this same list — nothing is calculated twice.
 */
export function buildEvidence(inputs: DigitalTwinInputs): EvidenceItem[] {
  const zone = ZONES[inputs.zoneId] ?? ZONES.zoneA
  const isNight = inputs.hour >= 20 || inputs.hour < 6
  const inWindow = isHourInWindow(inputs.hour, zone.highRiskWindow)
  const baselineDeviation = personalBaselineDeviation(inputs.speedKmh)

  const items: EvidenceItem[] = []

  const routeContribution = Math.round(Math.min(20, (inputs.routeDeviationM / 300) * 20))
  items.push({
    key: 'route',
    name: 'Route deviation',
    contribution: routeContribution,
    severity: routeContribution >= 13 ? 'HIGH' : routeContribution >= 6 ? 'MEDIUM' : 'LOW',
    protective: false,
    explanation: `${inputs.routeDeviationM} m from expected path.`,
  })

  const inactivityContribution = Math.round(Math.min(16, (inputs.inactivityMinutes / 20) * 16))
  items.push({
    key: 'inactivity',
    name: 'Inactivity',
    contribution: inactivityContribution,
    severity: inactivityContribution >= 11 ? 'HIGH' : inactivityContribution >= 5 ? 'MEDIUM' : 'LOW',
    protective: false,
    explanation: `${inputs.inactivityMinutes} min without movement.`,
  })

  items.push({
    key: 'historicalZoneRisk',
    name: 'Historical zone risk',
    contribution: zone.riskWeight,
    severity: zone.riskWeight >= 11 ? 'HIGH' : zone.riskWeight >= 5 ? 'MEDIUM' : 'LOW',
    protective: false,
    explanation: `${zone.name} — ${zone.historicalIncidents} recorded incidents.`,
  })

  const timeContribution = inWindow ? 9 : isNight ? 5 : 0
  items.push({
    key: 'night',
    name: inWindow ? 'Zone high-risk period' : 'Night',
    contribution: timeContribution,
    severity: timeContribution >= 8 ? 'HIGH' : timeContribution >= 4 ? 'MEDIUM' : 'LOW',
    protective: false,
    explanation: inWindow
      ? "Current hour falls inside this zone's elevated-risk window."
      : isNight
        ? 'Low-visibility hours.'
        : 'Daylight hours.',
  })

  const weatherContribution = inputs.weather === 'HEAVY_RAIN' ? 7 : inputs.weather === 'LIGHT_RAIN' ? 3 : 0
  items.push({
    key: 'weather',
    name: 'Weather',
    contribution: weatherContribution,
    severity: weatherContribution >= 7 ? 'HIGH' : weatherContribution >= 3 ? 'MEDIUM' : 'LOW',
    protective: false,
    explanation: `Current conditions: ${inputs.weather.replace('_', ' ').toLowerCase()}.`,
  })

  const crowdContribution = inputs.crowd === 'LOW' ? 6 : inputs.crowd === 'NORMAL' ? 0 : -5
  items.push({
    key: 'crowd',
    name: 'Crowd density',
    contribution: crowdContribution,
    severity: Math.abs(crowdContribution) >= 6 ? 'MEDIUM' : 'LOW',
    protective: crowdContribution < 0,
    explanation:
      inputs.crowd === 'HIGH'
        ? 'Bystanders nearby — protective factor.'
        : inputs.crowd === 'LOW'
          ? 'Few people nearby if assistance is needed.'
          : 'Typical foot traffic.',
  })

  const baselineContribution = Math.round(Math.min(16, (baselineDeviation / 100) * 16))
  items.push({
    key: 'personalBaseline',
    name: 'Personal baseline deviation',
    contribution: baselineContribution,
    severity: baselineContribution >= 11 ? 'HIGH' : baselineContribution >= 5 ? 'MEDIUM' : 'LOW',
    protective: false,
    explanation: `Current speed ${inputs.speedKmh.toFixed(1)} km/h vs typical ${PERSONAL_BASELINE.typicalSpeedKmh} km/h (${baselineDeviation}% deviation).`,
  })

  const anomalyContribution = Math.round(Math.min(12, (inputs.aiAnomalyScore / 100) * 12))
  items.push({
    key: 'aiAnomaly',
    name: 'AI anomaly score',
    contribution: anomalyContribution,
    severity: anomalyContribution >= 9 ? 'HIGH' : anomalyContribution >= 4 ? 'MEDIUM' : 'LOW',
    protective: false,
    explanation: `Simulated behavioural-anomaly model output: ${inputs.aiAnomalyScore}/100.`,
  })

  if (zone.terrainRisk !== 'LOW') {
    const terrainContribution = zone.terrainRisk === 'HIGH' ? 5 : 2
    items.push({
      key: 'terrain',
      name: 'Terrain risk',
      contribution: terrainContribution,
      severity: terrainContribution >= 5 ? 'MEDIUM' : 'LOW',
      protective: false,
      explanation: `${zone.name} terrain classified ${zone.terrainRisk}.`,
    })
  }

  if (zone.emergencyAccess === 'LIMITED') {
    items.push({
      key: 'emergencyAccess',
      name: 'Emergency access',
      contribution: 3,
      severity: 'LOW',
      protective: false,
      explanation: `Responder access to ${zone.name} is limited (${zone.nearestResponderKm} km out).`,
    })
  }

  items.push({
    key: 'ambient',
    name: 'Ambient monitoring uncertainty',
    contribution: 6,
    severity: 'LOW',
    protective: false,
    ambient: true,
    explanation: 'Baseline sensing and model uncertainty always present in a live monitoring system.',
  })

  return items
}

function computeConfidence(evidence: EvidenceItem[]): number {
  const scored = evidence.filter((e) => !e.ambient && Math.abs(e.contribution) >= 4)
  const positive = scored.filter((e) => e.contribution > 0)
  const negative = scored.filter((e) => e.contribution < 0)
  const totalActive = positive.length + negative.length
  const hasConflict = positive.length > 0 && negative.length > 0
  const conflictPenalty = hasConflict ? Math.min(positive.length, negative.length) * 8 : 0
  const confidence = 45 + totalActive * 6 - conflictPenalty
  return Math.round(Math.max(28, Math.min(96, confidence)))
}

function stateFromRisk(risk: number): SafetyState {
  if (risk < 30) return 'SAFE'
  if (risk < 55) return 'WATCH'
  if (risk < 78) return 'AT_RISK'
  return 'CRITICAL'
}

function decideAction(risk: number, confidence: number): { action: Action; reason: string } {
  if (risk < 30) {
    return { action: 'MONITOR', reason: 'Signals are within expected parameters. No action required.' }
  }
  if (risk < 60) {
    return {
      action: 'GATHER_EVIDENCE',
      reason: 'Risk is mildly elevated. RAKSHA is gathering more evidence before acting.',
    }
  }
  if (risk < 80) {
    return { action: 'CHECK_IN', reason: 'Risk is elevated. A direct safety check-in is warranted before any escalation.' }
  }
  if (confidence >= 85) {
    return {
      action: 'ESCALATE',
      reason: 'Critical risk with high confidence — independent signals agree. Escalation authorized without waiting for a response.',
    }
  }
  return {
    action: 'CHECK_IN',
    reason: 'Risk is critical but confidence is not yet high enough for autonomous escalation — verifying with the tourist first.',
  }
}

export function calculateSafetyState(inputs: DigitalTwinInputs): SafetyResult {
  const zone = ZONES[inputs.zoneId] ?? ZONES.zoneA
  const evidence = buildEvidence(inputs)
  const riskScore = Math.max(0, Math.min(100, Math.round(evidence.reduce((sum, e) => sum + e.contribution, 0))))
  const confidence = computeConfidence(evidence)
  const state = stateFromRisk(riskScore)
  const { action, reason } = decideAction(riskScore, confidence)
  const isNight = inputs.hour >= 20 || inputs.hour < 6

  return {
    riskScore,
    confidence,
    state,
    action,
    actionReason: reason,
    evidence,
    personalBaselineDeviationPct: personalBaselineDeviation(inputs.speedKmh),
    isNight,
    inHighRiskWindow: isHourInWindow(inputs.hour, zone.highRiskWindow),
    zone,
  }
}

export interface Counterfactual {
  key: string
  label: string
  from: number
  to: number
}

/**
 * Real counterfactual engine: for each named factor, remove ONLY that
 * input, recompute risk with the exact same `calculateSafetyState`
 * function, and report the delta. No hardcoded outcomes — if the current
 * scenario changes, every number here changes with it.
 */
export function computeCounterfactuals(inputs: DigitalTwinInputs): Counterfactual[] {
  const current = calculateSafetyState(inputs).riskScore
  const without = (patch: Partial<DigitalTwinInputs>) => calculateSafetyState({ ...inputs, ...patch }).riskScore

  return [
    { key: 'route', label: 'WITHOUT ROUTE DEVIATION', from: current, to: without({ routeDeviationM: 0 }) },
    { key: 'inactivity', label: 'WITHOUT INACTIVITY', from: current, to: without({ inactivityMinutes: 0 }) },
    {
      key: 'zone',
      label: 'IF TREATED AS LOW-RISK ZONE',
      from: current,
      to: without({ zoneId: 'zoneA' }),
    },
    {
      key: 'both',
      label: 'WITHOUT ROUTE + INACTIVITY',
      from: current,
      to: without({ routeDeviationM: 0, inactivityMinutes: 0 }),
    },
  ]
}

export interface Scenario {
  id: string
  label: string
  description: string
  expectedAction: string
  inputs: DigitalTwinInputs
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'normal',
    label: 'NORMAL',
    description: 'Daytime, high crowd, minor deviation, low-risk zone.',
    expectedAction: 'MONITOR',
    inputs: { zoneId: 'zoneA', hour: 14, weather: 'CLEAR', crowd: 'HIGH', routeDeviationM: 15, inactivityMinutes: 0, speedKmh: 3.6, aiAnomalyScore: 5 },
  },
  {
    id: 'uncertain',
    label: 'UNCERTAIN',
    description: 'Night, moderate-risk zone, meaningful route deviation, some inactivity.',
    expectedAction: 'CHECK-IN / GATHER EVIDENCE',
    inputs: { zoneId: 'zoneB', hour: 21, weather: 'LIGHT_RAIN', crowd: 'HIGH', routeDeviationM: 230, inactivityMinutes: 10, speedKmh: 2.0, aiAnomalyScore: 60 },
  },
  {
    id: 'critical',
    label: 'CRITICAL',
    description: 'Night, heavy rain, low crowd, remote high-risk zone, prolonged inactivity.',
    expectedAction: 'AUTOMATIC ESCALATION',
    inputs: { zoneId: 'zoneC', hour: 23, weather: 'HEAVY_RAIN', crowd: 'LOW', routeDeviationM: 210, inactivityMinutes: 14, speedKmh: 0.2, aiAnomalyScore: 82 },
  },
  {
    id: 'falsePositiveDay',
    label: 'FALSE POSITIVE — DAY',
    description: 'Same 130 m route deviation as the night case below, but daytime + high crowd + low-risk zone.',
    expectedAction: 'MONITOR',
    inputs: { zoneId: 'zoneA', hour: 13, weather: 'CLEAR', crowd: 'HIGH', routeDeviationM: 130, inactivityMinutes: 0, speedKmh: 3.5, aiAnomalyScore: 10 },
  },
  {
    id: 'falsePositiveNight',
    label: 'FALSE POSITIVE — NIGHT',
    description: 'Identical 130 m route deviation, but night + heavy rain + low crowd + remote zone.',
    expectedAction: 'ESCALATE',
    inputs: { zoneId: 'zoneC', hour: 23, weather: 'HEAVY_RAIN', crowd: 'LOW', routeDeviationM: 130, inactivityMinutes: 12, speedKmh: 0.4, aiAnomalyScore: 68 },
  },
]

export function actionLabel(action: Action): string {
  switch (action) {
    case 'MONITOR':
      return 'MONITOR'
    case 'GATHER_EVIDENCE':
      return 'MONITOR / GATHER EVIDENCE'
    case 'CHECK_IN':
      return 'CHECK-IN'
    case 'ESCALATE':
      return 'AUTOMATIC ESCALATION'
  }
}
