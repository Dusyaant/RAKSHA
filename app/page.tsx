'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDown, Circle, Crosshair, Database, LocateFixed,
  Radio, RotateCcw, Shield, Siren, Sparkles, TriangleAlert, Wind, Zap,
} from 'lucide-react'
import {
  BASELINE_INPUTS, DigitalTwinInputs, PERSONAL_BASELINE, SCENARIOS, Scenario, SafetyResult,
  actionLabel, calculateSafetyState, computeCounterfactuals,
} from '@/lib/raksha-engine'

type SimPhase = 'idle' | 'running' | 'prompt' | 'recovering' | 'escalated'
type DispatchStatus = 'DETECTED' | 'VERIFIED' | 'DISPATCHED' | 'EN_ROUTE' | 'RESOLVED' | null

interface IncidentRecord {
  id: number
  ts: string
  zoneName: string
  risk: number
  confidence: number
  outcome: string
}

interface ScenarioRun {
  id: string
  label: string
  risk: number
  action: string
}

const INCIDENT_STAGES: { patch: Partial<DigitalTwinInputs>; alert: string }[] = [
  { patch: { routeDeviationM: 65 }, alert: 'ROUTE DEVIATION DETECTED' },
  { patch: { routeDeviationM: 115, inactivityMinutes: 6 }, alert: 'PROLONGED INACTIVITY DETECTED' },
  { patch: { weather: 'HEAVY_RAIN', crowd: 'LOW', hour: 22, zoneId: 'zoneC', routeDeviationM: 170 }, alert: 'ENVIRONMENT + ZONE RISK ESCALATING' },
  { patch: { inactivityMinutes: 13, aiAnomalyScore: 78, routeDeviationM: 205, speedKmh: 0.3 }, alert: 'CRITICAL EVIDENCE CONFIRMED' },
]

const RECOVERY_STAGES: Partial<DigitalTwinInputs>[] = [
  { routeDeviationM: 55, inactivityMinutes: 3, weather: 'LIGHT_RAIN', crowd: 'NORMAL', aiAnomalyScore: 18, speedKmh: 2.6 },
  { ...BASELINE_INPUTS },
]

function formatWindow(window: [number, number] | null): string {
  if (!window) return 'NONE'
  const [start, end] = window
  const fmt = (h: number) => `${String(h % 24).padStart(2, '0')}:00`
  return `${fmt(start)}–${fmt(end)}`
}

function routeStatusLabel(inputs: DigitalTwinInputs, phase: SimPhase): string {
  if (phase === 'escalated') return 'SEPARATED'
  if (inputs.routeDeviationM === 0) return 'ON PATH'
  if (inputs.routeDeviationM < 80) return 'MINOR DEVIATION'
  return 'DEVIATING'
}

function evidenceValueLabel(key: string, inputs: DigitalTwinInputs, safety: SafetyResult): string {
  switch (key) {
    case 'route': return `${inputs.routeDeviationM} m`
    case 'inactivity': return `${inputs.inactivityMinutes} min`
    case 'historicalZoneRisk': return safety.zone.name.toUpperCase()
    case 'night': return safety.inHighRiskWindow ? 'HIGH-RISK WINDOW' : safety.isNight ? 'NIGHT' : 'DAY'
    case 'weather': return inputs.weather.replace('_', ' ')
    case 'crowd': return inputs.crowd
    case 'personalBaseline': return `${safety.personalBaselineDeviationPct}%`
    case 'aiAnomaly': return `${inputs.aiAnomalyScore}/100`
    case 'terrain': return safety.zone.terrainRisk
    case 'emergencyAccess': return safety.zone.emergencyAccess
    default: return ''
  }
}

function Panel({ title, eyebrow, children, className = '' }: { title: string; eyebrow?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div><span className="eyebrow">{eyebrow ?? 'LIVE SYSTEM'}</span><h2>{title}</h2></div>
        <span className="panel-mark"><Circle size={7} fill="currentColor" /></span>
      </div>
      {children}
    </section>
  )
}

function Telemetry({ safety, inputs, phase }: { safety: SafetyResult; inputs: DigitalTwinInputs; phase: SimPhase }) {
  const displayState = phase === 'escalated' ? 'CRITICAL' : safety.state.replace('_', ' ')
  const dotClass = safety.state === 'CRITICAL' || safety.state === 'INCIDENT' ? 'critical' : safety.state === 'AT_RISK' || safety.state === 'WATCH' ? 'warning' : ''
  return (
    <Panel eyebrow="SUBJECT  /  RAKSHA-IND-104" title="Tourist Digital Twin" className="telemetry-panel">
      <div className="state-row"><span className={`state-dot ${dotClass}`} /><strong>{displayState}</strong><span className="live-label">● LIVE</span></div>
      <div className="risk-readout">
        <div><span>RISK INDEX</span><b>{safety.riskScore}<small>/100</small></b></div>
        <div><span>CONFIDENCE</span><b>{safety.confidence}<small>%</small></b></div>
      </div>
      <div className="metrics">
        <div><span>Movement</span><strong>{inputs.speedKmh.toFixed(1)} <i>km/h</i></strong></div>
        <div><span>Route</span><strong className={inputs.routeDeviationM > 0 ? 'warn-text' : ''}>{routeStatusLabel(inputs, phase)}</strong></div>
        <div><span>Environment</span><strong>{safety.riskScore >= 55 ? 'ELEVATED' : 'SAFE'}</strong></div>
      </div>
      <div className="telemetry-foot"><LocateFixed size={13} /> 28.6139° N, 77.2090° E <span>ZONE: {safety.zone.name.toUpperCase()}</span></div>
    </Panel>
  )
}

function PersonalBaseline({ safety, inputs }: { safety: SafetyResult; inputs: DigitalTwinInputs }) {
  return (
    <div className="mini-card baseline-card">
      <span className="eyebrow">PERSONAL BEHAVIORAL BASELINE</span>
      <div className="baseline-rows">
        <div><span>Typical speed</span><strong>{PERSONAL_BASELINE.typicalSpeedKmh} km/h</strong></div>
        <div><span>Current speed</span><strong className={safety.personalBaselineDeviationPct > 40 ? 'warn-text' : ''}>{inputs.speedKmh.toFixed(1)} km/h</strong></div>
        <div><span>Deviation</span><strong className={safety.personalBaselineDeviationPct > 40 ? 'warn-text' : ''}>{safety.personalBaselineDeviationPct}%</strong></div>
      </div>
      <p className="baseline-note">
        {safety.personalBaselineDeviationPct > 40
          ? 'Abnormal relative to this tourist\u2019s own historical behaviour.'
          : 'Consistent with this tourist\u2019s typical movement pattern.'}
        {' '}Prototype/simulated intelligence — a deterministic rolling baseline, not a trained model.
      </p>
    </div>
  )
}

function SpatialView({ safety, phase }: { safety: SafetyResult; phase: SimPhase }) {
  const deviated = safety.riskScore >= 30 || phase !== 'idle'
  const stateClass =
    phase === 'escalated' || safety.state === 'CRITICAL' ? 'state-critical'
      : safety.state === 'AT_RISK' ? 'state-atrisk'
        : safety.state === 'WATCH' ? 'state-watch'
          : 'state-safe'
  return (
    <div className={`spatial-wrap ${stateClass}`}>
      <div className="spatial-label"><span className="eyebrow">SPATIAL MODEL  /  DIGITAL TWIN</span><strong>{safety.zone.name.toUpperCase()}</strong></div>
      <svg className="map-svg" viewBox="0 0 620 510" role="img" aria-label="Digital twin spatial map">
        <defs>
          <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <radialGradient id="core"><stop stopColor="#c9fbff" /><stop offset=".3" stopColor="#46e4ee" /><stop offset="1" stopColor="#0b5969" stopOpacity="0" /></radialGradient>
        </defs>
        <g className="map-grid">
          {Array.from({ length: 11 }).map((_, i) => <path key={`h${i}`} d={`M0 ${i * 50} H620`} />)}
          {Array.from({ length: 13 }).map((_, i) => <path key={`v${i}`} d={`M${i * 50} 0 V510`} />)}
        </g>
        <circle cx="312" cy="245" r="170" className="radius-ring" />
        <circle cx="312" cy="245" r="110" className="radius-ring faint" />
        <path d="M60 404 C135 360 150 278 235 285 S300 232 328 210 S435 168 570 95" className="route expected" />
        <path d={!deviated ? 'M60 404 C135 360 150 278 235 285 S300 232 328 210 S435 168 570 95' : 'M60 404 C135 360 150 278 235 285 S300 232 350 255 S427 350 520 382'} className="route actual" />
        {deviated && <path d="M350 255 S427 350 520 382" className="route deviation" />}
        <circle cx="312" cy="245" r="74" fill="url(#core)" className="core-glow" />
        <g className="twin" transform="translate(312 222)">
          <circle r="19" className="head" />
          <path d="M-29 74 C-29 33 -18 19 0 19s29 14 29 55" className="body" />
          <path d="M-17 33 L-39 64 M17 33 L39 64 M-10 74 L-22 110 M10 74 L22 110" className="limbs" />
        </g>
        <g className="map-points"><circle cx="61" cy="404" r="5" /><circle cx="570" cy="95" r="5" />{deviated && <circle cx="520" cy="382" r="5" className="danger-point" />}</g>
        <text x="326" y="198">SUBJECT / 104</text>
        <text x="44" y="430">ENTRY GATE</text>
        <text x="486" y="78">SAFE ROUTE</text>
        {deviated && <text x="466" y="410" className="danger-text">DEVIATION</text>}
      </svg>
      <div className="map-legend"><span><i className="legend-dot cyan" /> EXPECTED ROUTE</span><span><i className="legend-dot amber" /> ACTUAL ROUTE</span><span><i className="legend-dot red" /> RISK ZONE</span></div>
    </div>
  )
}

function Intelligence({ safety, inputs }: { safety: SafetyResult; inputs: DigitalTwinInputs }) {
  const visible = safety.evidence.filter((e) => !e.ambient)
  const maxAbs = Math.max(1, ...visible.map((e) => Math.abs(e.contribution)))
  return (
    <Panel eyebrow="MULTI-MODAL ANALYSIS" title="Safety Intelligence" className="intelligence-panel">
      <div className="signal-list">
        {visible.map((e) => (
          <div className="signal" key={e.key}>
            <span>{e.name}</span>
            <strong className={e.contribution >= 8 ? 'warn-text' : ''}>{evidenceValueLabel(e.key, inputs, safety)}</strong>
            <div className="signal-bar"><i style={{ width: `${Math.round((Math.abs(e.contribution) / maxAbs) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
      <button className="outline-btn" onClick={() => document.getElementById('why')?.scrollIntoView({ behavior: 'smooth' })}>
        <Sparkles size={14} /> WHY THIS DECISION <ArrowDown size={13} />
      </button>
    </Panel>
  )
}

function Fusion({ safety }: { safety: SafetyResult }) {
  return (
    <Panel eyebrow="DECISION PIPELINE" title="Evidence Fusion" className="fusion-panel">
      <div className="fusion-flow">
        {[['GPS', LocateFixed], ['BEHAVIOR', Activity], ['ENVIRONMENT', Wind], ['KNOWLEDGE BASE', Database]].map(([label, Icon]) => {
          const IconComp = Icon as typeof Activity
          return <div className="fusion-source" key={label as string}><IconComp size={15} /><span>{label as string}</span><ArrowDown size={13} /></div>
        })}
        <div className="fusion-node"><Zap size={19} /><span>EVIDENCE<br />FUSION</span></div>
        <ArrowDown size={15} />
        <div className="decision-node">
          <span>{safety.riskScore}/100 · {safety.confidence}% CONF.</span>
          <strong>{actionLabel(safety.action)}</strong>
        </div>
      </div>
    </Panel>
  )
}

function LowerPanels({ safety, inputs }: { safety: SafetyResult; inputs: DigitalTwinInputs }) {
  const contributors = safety.evidence.filter((e) => !e.ambient && e.contribution > 0).sort((a, b) => b.contribution - a.contribution)
  const primary = contributors.slice(0, 2)
  const counterfactuals = useMemo(() => computeCounterfactuals(inputs), [inputs])
  const biggestDrop = [...counterfactuals].sort((a, b) => (b.from - b.to) - (a.from - a.to))[0]

  return (
    <div className="lower-grid">
      <Panel eyebrow="EXPLAINABLE AI" title="WHY" className="lower-panel">
        <div id="why" className="why-title">WHY DID RAKSHA CLASSIFY THIS TOURIST AS {safety.state.replace('_', ' ')}?</div>
        {contributors.length === 0
          ? <p className="explain">No significant evidence is currently contributing to risk.</p>
          : contributors.map((e) => (
            <div className="contribution" key={e.key}><span>{e.name}</span><b>+{e.contribution}</b></div>
          ))}
        {primary.length > 0 && (
          <div className="primary-tags">
            <span>PRIMARY CONTRIBUTORS</span>
            {primary.map((e) => <b key={e.key}>{e.name.toUpperCase()}</b>)}
          </div>
        )}
      </Panel>

      <Panel eyebrow="COUNTERFACTUAL AI" title="WHAT IF" className="lower-panel">
        <div className="counter-list">
          {counterfactuals.map((c) => (
            <div key={c.key}><span>{c.label}</span><strong>{c.from} → {c.to}</strong></div>
          ))}
        </div>
        <p className="explain">
          {biggestDrop && biggestDrop.from !== biggestDrop.to
            ? `${counterfactuals.find((c) => c.key === biggestDrop.key)?.label.replace('WITHOUT ', '').toLowerCase()} is the single largest driver of the current risk score.`
            : 'No single factor currently dominates the risk score.'}
        </p>
      </Panel>

      <Panel eyebrow={`GRAPH RAG  /  7 NODES`} title="Knowledge Graph" className="lower-panel graph-panel">
        <div className="graph">
          <span className="graph-core">{safety.zone.name.length > 14 ? 'ZONE' : safety.zone.name.toUpperCase()}</span>
          {['TOURIST', 'ROUTE', 'WEATHER', 'RESPONDER', 'SAFETY RULE', 'RISK STATE'].map((n, i) => <span className={`graph-node n${i}`} key={n}>{n}</span>)}
          <svg viewBox="0 0 300 170">{[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1="150" y1="85" x2={45 + (i % 3) * 105} y2={25 + Math.floor(i / 3) * 120} />)}</svg>
        </div>
        <div className="zone-stats">
          <span>{safety.zone.historicalIncidents} <small>INCIDENTS</small></span>
          <span>{formatWindow(safety.zone.highRiskWindow)} <small>HIGH-RISK PERIOD</small></span>
          <span>{safety.zone.nearestResponderKm} KM <small>NEAREST RESPONDER</small></span>
        </div>
      </Panel>
    </div>
  )
}

function ChallengePanel({ onApply, activeId, runs }: { onApply: (s: Scenario) => void; activeId: string | null; runs: ScenarioRun[] }) {
  const dayRun = runs.find((r) => r.id === 'falsePositiveDay')
  const nightRun = runs.find((r) => r.id === 'falsePositiveNight')
  const showComparison = dayRun && nightRun
  return (
    <Panel eyebrow="SAME SYSTEM  /  DIFFERENT CONTEXT" title="Challenge RAKSHA" className="challenge-panel">
      <p className="challenge-intro">Load a scenario directly into the Digital Twin. Risk, confidence, WHY and WHAT IF all recompute live — nothing here is pre-rendered.</p>
      <div className="scenario-grid">
        {SCENARIOS.map((s) => (
          <button key={s.id} className={`scenario-btn ${activeId === s.id ? 'active' : ''}`} onClick={() => onApply(s)}>
            <strong>{s.label}</strong>
            <span>{s.description}</span>
            <em>Expected: {s.expectedAction}</em>
          </button>
        ))}
      </div>
      {showComparison && (
        <div className="fp-callout">
          <strong>SAME ANOMALY. DIFFERENT CONTEXT. DIFFERENT DECISION.</strong>
          <span>Identical 130 m route deviation — Day: risk {dayRun!.risk} → {dayRun!.action}. Night: risk {nightRun!.risk} → {nightRun!.action}.</span>
        </div>
      )}
    </Panel>
  )
}

function IncidentMemory({ log }: { log: IncidentRecord[] }) {
  if (log.length === 0) return null
  return (
    <div className="mini-card memory-card">
      <span className="eyebrow">INCIDENT MEMORY  /  THIS SESSION</span>
      <div className="memory-list">
        {[...log].reverse().slice(0, 5).map((r) => (
          <div key={r.id} className="memory-row">
            <span>{r.ts}</span>
            <span>{r.zoneName}</span>
            <span>risk {r.risk} · conf {r.confidence}%</span>
            <em>{r.outcome}</em>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Page() {
  const [inputs, setInputs] = useState<DigitalTwinInputs>(BASELINE_INPUTS)
  const [phase, setPhase] = useState<SimPhase>('idle')
  const [countdown, setCountdown] = useState(10)
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const [dispatch, setDispatch] = useState<DispatchStatus>(null)
  const [incidentLog, setIncidentLog] = useState<IncidentRecord[]>([])
  const [scenarioRuns, setScenarioRuns] = useState<ScenarioRun[]>([])
  const [activeScenario, setActiveScenario] = useState<string | null>(null)
  const [clockStr, setClockStr] = useState('')
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const safety = useMemo(() => calculateSafetyState(inputs), [inputs])

  // Live clock — genuinely current, not a hardcoded string.
  useEffect(() => {
    const tick = () => setClockStr(new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: 'Asia/Kolkata',
    }).format(new Date()).replace(',', ' /') + ' IST')
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  // Check-in countdown while awaiting a response.
  useEffect(() => {
    if (phase !== 'prompt') return
    if (countdown <= 0) { setPhase('escalated'); setDispatch('DETECTED'); return }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  function runSimulateIncident() {
    if (phase !== 'idle') return
    setInputs(BASELINE_INPUTS)
    setActiveScenario(null)
    setPhase('running')
    let i = 0
    stageTimer.current = setInterval(() => {
      const stage = INCIDENT_STAGES[i]
      setInputs((prev) => ({ ...prev, ...stage.patch }))
      setAlertMessage(stage.alert)
      i++
      if (i >= INCIDENT_STAGES.length) {
        if (stageTimer.current) clearInterval(stageTimer.current)
        setPhase('prompt')
        setCountdown(10)
      }
    }, 900)
  }

  function respondSafe() {
    setPhase('recovering')
    let i = 0
    const t = setInterval(() => {
      setInputs((prev) => ({ ...prev, ...RECOVERY_STAGES[i] }))
      i++
      if (i >= RECOVERY_STAGES.length) {
        clearInterval(t)
        setPhase('idle')
        setAlertMessage(null)
      }
    }, 800)
  }

  function needHelp() {
    setPhase('escalated')
    setDispatch('DETECTED')
  }

  function verifyId() { setDispatch('VERIFIED') }
  function dispatchResponder() {
    setDispatch('DISPATCHED')
    setTimeout(() => setDispatch('EN_ROUTE'), 1400)
  }
  function resolveIncident() {
    const record: IncidentRecord = {
      id: incidentLog.length + 1,
      ts: clockStr.split(' / ')[1] ?? clockStr,
      zoneName: safety.zone.name,
      risk: safety.riskScore,
      confidence: safety.confidence,
      outcome: 'Responder dispatched — resolved, tourist confirmed safe.',
    }
    setIncidentLog((prev) => [...prev, record])
    setDispatch(null)
    setPhase('idle')
    setInputs(BASELINE_INPUTS)
    setActiveScenario(null)
    setAlertMessage(null)
  }

  function applyScenario(s: Scenario) {
    if (stageTimer.current) clearInterval(stageTimer.current)
    setPhase('idle')
    setDispatch(null)
    setAlertMessage(null)
    setInputs(s.inputs)
    setActiveScenario(s.id)
    const result = calculateSafetyState(s.inputs)
    setScenarioRuns((prev) => [...prev.slice(-3), { id: s.id, label: s.label, risk: result.riskScore, action: actionLabel(result.action) }])
  }

  function resetAll() {
    if (stageTimer.current) clearInterval(stageTimer.current)
    setInputs(BASELINE_INPUTS)
    setPhase('idle')
    setDispatch(null)
    setCountdown(10)
    setAlertMessage(null)
    setActiveScenario(null)
  }

  const simulateLabel = phase === 'idle' ? 'SIMULATE INCIDENT' : phase === 'escalated' ? 'INCIDENT ACTIVE' : 'SIMULATION IN PROGRESS'

  return (
    <main className="raksha-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Shield size={18} /></div><div><strong>RAKSHA</strong><span>AUTONOMOUS SAFETY INTELLIGENCE</span></div></div>
        <div className="system-status"><span className="online-dot" /> SYSTEM OPERATIONAL <span className="divider" /> <Radio size={13} /> LIVE FEED <span className="divider" /> {clockStr}</div>
        <button className="icon-btn" onClick={resetAll} aria-label="Reset simulation"><RotateCcw size={16} /></button>
      </header>

      <div className="command-grid">
        <aside>
          <Telemetry safety={safety} inputs={inputs} phase={phase} />
          <div className="mini-card">
            <span className="eyebrow">ADAPTIVE INTERVENTION</span>
            <div className="intervention">
              <span className="intervention-icon"><Crosshair size={15} /></span>
              <div><strong>{actionLabel(safety.action)}</strong><small>{safety.actionReason}</small></div>
            </div>
          </div>
          <PersonalBaseline safety={safety} inputs={inputs} />
        </aside>

        <section className="center-stage">
          <SpatialView safety={safety} phase={phase} />
          <div className="stage-actions">
            <button className="simulate-btn" onClick={runSimulateIncident} disabled={phase !== 'idle'}><Siren size={16} />{simulateLabel}</button>
            <span className="stage-caption"><span className="online-dot" /> AUTONOMOUS MONITORING ENABLED</span>
          </div>
        </section>

        <aside>
          <Intelligence safety={safety} inputs={inputs} />
          <div className="alert-card">
            <div className="alert-head">
              <TriangleAlert size={15} />
              <span>{phase === 'escalated' ? 'AUTONOMOUS ESCALATION' : alertMessage ?? (safety.riskScore >= 30 ? 'ELEVATED RISK' : 'NO ACTIVE ALERTS')}</span>
            </div>
            <p>{phase === 'escalated' ? 'Nearest responder notified. Awaiting dispatch confirmation.' : safety.actionReason}</p>
          </div>
        </aside>
      </div>

      <Fusion safety={safety} />
      <LowerPanels safety={safety} inputs={inputs} />
      <ChallengePanel onApply={applyScenario} activeId={activeScenario} runs={scenarioRuns} />
      <IncidentMemory log={incidentLog} />

      {phase === 'prompt' && (
        <div className="incident-overlay">
          <div className="incident-dialog">
            <span className="eyebrow">ADAPTIVE CHECK-IN  /  URGENT</span>
            <h3>ARE YOU SAFE?</h3>
            <p>RAKSHA detected an unexpected route deviation and prolonged inactivity in {safety.zone.name}.</p>
            <div className="countdown">00:{String(countdown).padStart(2, '0')}</div>
            <div className="response-actions">
              <button onClick={respondSafe}>I&apos;M SAFE</button>
              <button className="help-btn" onClick={needHelp}>NEED HELP</button>
            </div>
            <small>NO RESPONSE WILL INITIATE AUTONOMOUS ESCALATION</small>
          </div>
        </div>
      )}

      {phase === 'escalated' && (
        <div className="escalation-banner">
          <div><Siren size={19} /><div><strong>CRITICAL INCIDENT #{104 + incidentLog.length}</strong><span>{dispatch === 'RESOLVED' ? 'RESOLVED' : dispatch === 'EN_ROUTE' ? 'RESPONDER EN ROUTE' : dispatch === 'DISPATCHED' ? 'RESPONDER DISPATCHED' : dispatch === 'VERIFIED' ? 'IDENTITY VERIFIED' : 'NO RESPONSE DETECTED  /  AUTONOMOUS ESCALATION INITIATED'}</span></div></div>
          <div className="escalation-facts">
            <b>{safety.riskScore}/100 <small>RISK</small></b>
            <b>{inputs.routeDeviationM}m <small>DEVIATION</small></b>
            <b>{safety.confidence}% <small>CONFIDENCE</small></b>
            {!dispatch || dispatch === 'DETECTED' ? <button onClick={verifyId}>VERIFY ID</button> : null}
            {dispatch === 'VERIFIED' ? <button onClick={dispatchResponder}>DISPATCH RESPONDER</button> : null}
            {(dispatch === 'DISPATCHED' || dispatch === 'EN_ROUTE') ? <button onClick={resolveIncident} disabled={dispatch === 'DISPATCHED'}>{dispatch === 'DISPATCHED' ? 'EN ROUTE…' : 'RESOLVE INCIDENT'}</button> : null}
          </div>
        </div>
      )}
    </main>
  )
}
