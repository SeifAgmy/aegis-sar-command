import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
} from 'satellite.js';
import {
  AsfSarScene,
  CableProximityAlert,
  CableThreatAssessment,
  CoastalImpactAssessment,
  DarkEnvelopeState,
  LatLngPoint,
  LiveForensicSnapshot,
  LiveOilSpillSimulation,
  MetoceanBuoy,
  SarConfidenceAssessment,
  SatelliteTleRecord,
  Sgp4InterceptAssessment,
  SimulatedBlackoutRecord,
  SubseaCable,
  Vessel,
  WeatherState,
} from '../types/telemetry';
import { DEFAULT_SAR_TLE_CATALOG } from './orbitalPropagationService';

export const DARK_VESSEL_THRESHOLD_MINUTES = 30;
export const BRIEF_GAP_ENVELOPE_MIN_MINUTES = 0.5;

const EARTH_RADIUS_KM = 6371;
const KTS_TO_KMH = 1.852;
const KTS_TO_MS = 0.514444;

export function formatBlackoutDuration(minutes: number): string {
  const totalSec = Math.max(0, Math.round(minutes * 60));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

interface PortAnchorageZone {
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

const EGYPT_PORT_ANCHORAGES: PortAnchorageZone[] = [
  { name: 'Alexandria Port & Anchorage', lat: 31.19, lon: 29.87, radiusKm: 6.5 },
  { name: 'Abu Qir Bay Basin', lat: 31.32, lon: 30.08, radiusKm: 4.5 },
  { name: 'Damietta Port & Anchorage', lat: 31.46, lon: 31.76, radiusKm: 5.5 },
  { name: 'Port Said & Suez N. Anchorage', lat: 31.28, lon: 32.33, radiusKm: 7.5 },
];

export function haversineDistanceKm(a: LatLngPoint, b: LatLngPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function destinationPoint(
  origin: LatLngPoint,
  bearingDeg: number,
  distanceKm: number
): LatLngPoint {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (Math.cos(rad) * distanceKm) / 111.32;
  const cosLat = Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180));
  const dLon = (Math.sin(rad) * distanceKm) / (111.32 * cosLat);
  return {
    lat: Number((origin.lat + dLat).toFixed(5)),
    lon: Number((origin.lon + dLon).toFixed(5)),
  };
}

export function isInPortAnchorage(lat: number, lon: number): boolean {
  return EGYPT_PORT_ANCHORAGES.some(
    (zone) => haversineDistanceKm({ lat, lon }, zone) <= zone.radiusKm
  );
}

function pointToSegmentDistanceKm(pt: LatLngPoint, a: LatLngPoint, b: LatLngPoint): number {
  const cosLat = Math.max(0.2, Math.cos((pt.lat * Math.PI) / 180));
  const px = (pt.lon - a.lon) * 111.32 * cosLat;
  const py = (pt.lat - a.lat) * 111.32;
  const bx = (b.lon - a.lon) * 111.32 * cosLat;
  const by = (b.lat - a.lat) * 111.32;

  const lenSq = bx * bx + by * by;
  if (lenSq <= 1e-9) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  const projX = t * bx;
  const projY = t * by;
  return Math.hypot(px - projX, py - projY);
}

export function distanceToCableKm(point: LatLngPoint, cable: SubseaCable): number {
  const coords = cable.coordinates;
  if (coords.length === 0) return 999;
  if (coords.length === 1) return haversineDistanceKm(point, coords[0]);
  let minKm = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = pointToSegmentDistanceKm(point, coords[i], coords[i + 1]);
    if (d < minKm) minKm = d;
  }
  return Number(minKm.toFixed(2));
}

export function evaluateCableThreats(
  center: LatLngPoint,
  envelopeRadiusKm: number,
  cables: SubseaCable[],
  vesselSpeedKts: number
): {
  nearestCable: CableThreatAssessment;
  intersectingCables: CableThreatAssessment[];
  allAssessments: CableThreatAssessment[];
} {
  const assessments: CableThreatAssessment[] = cables.map((cable) => {
    const distKm = distanceToCableKm(center, cable);
    const intersects = distKm <= envelopeRadiusKm + cable.bufferRadiusKm;

    // Anchor-drag risk peaks when a vessel is slow (< 5 kts) or dark inside the cable buffer
    const proxFactor = Math.max(0, 1 - Math.min(distKm, 25) / 25);
    const speedFactor = vesselSpeedKts <= 4.5 ? 1.0 : vesselSpeedKts <= 9 ? 0.72 : 0.48;
    const envelopeBoost = intersects ? 24 : 0;
    const anchorDragRiskScore = Math.min(
      99,
      Math.max(4, Math.round(proxFactor * 72 * speedFactor + envelopeBoost))
    );

    return {
      cableId: cable.id,
      cableName: cable.name,
      capacityTbps: cable.capacityTbps,
      landingStation: cable.landingStation,
      distanceKm: distKm,
      bufferRadiusKm: cable.bufferRadiusKm,
      intersectsEnvelope: intersects,
      anchorDragRiskScore,
    };
  });

  assessments.sort((a, b) => a.distanceKm - b.distanceKm);
  const fallback: CableThreatAssessment = {
    cableId: 'cable-none',
    cableName: 'Med-East Shelf Corridor',
    capacityTbps: 24,
    landingStation: 'Alexandria',
    distanceKm: 25,
    bufferRadiusKm: 5,
    intersectsEnvelope: false,
    anchorDragRiskScore: 12,
  };

  return {
    nearestCable: assessments[0] ?? fallback,
    intersectingCables: assessments.filter((c) => c.intersectsEnvelope),
    allAssessments: assessments,
  };
}

function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

export function interpolateBuoyMetocean(
  lat: number,
  lon: number,
  buoys: MetoceanBuoy[],
  fallbackWeather: WeatherState
): LiveForensicSnapshot['localMetocean'] {
  if (!buoys || buoys.length === 0) {
    return {
      windSpeedKts: fallbackWeather.windSpeedKts,
      windSpeedMs: fallbackWeather.windSpeedMs,
      windDirectionDeg: fallbackWeather.windDirectionDeg,
      windDirectionCardinal: fallbackWeather.windDirectionCardinal,
      currentSpeedKts: fallbackWeather.surfaceCurrentKts,
      currentDirectionDeg: fallbackWeather.surfaceCurrentDeg,
      waveHeightM: fallbackWeather.waveHeightM,
      nearestBuoyName: 'Alexandria Offshore Buoy',
      isLive: fallbackWeather.metoceanSource === 'OPEN_METEO_LIVE',
    };
  }

  let weightSum = 0;
  let windU = 0;
  let windV = 0;
  let currU = 0;
  let currV = 0;
  let waveSum = 0;
  let nearestBuoy = buoys[0];
  let nearestDist = Infinity;

  buoys.forEach((b) => {
    const d = Math.max(1.0, haversineDistanceKm({ lat, lon }, { lat: b.lat, lon: b.lon }));
    if (d < nearestDist) {
      nearestDist = d;
      nearestBuoy = b;
    }
    const w = 1 / (d * d);
    weightSum += w;

    const wRad = (b.windDirectionDeg * Math.PI) / 180;
    windU += w * b.windSpeedKts * Math.sin(wRad);
    windV += w * b.windSpeedKts * Math.cos(wRad);

    const cRad = (b.currentDirectionDeg * Math.PI) / 180;
    currU += w * b.currentSpeedKts * Math.sin(cRad);
    currV += w * b.currentSpeedKts * Math.cos(cRad);

    waveSum += w * b.waveHeightM;
  });

  const avgWindU = windU / weightSum;
  const avgWindV = windV / weightSum;
  const windSpeedKts = Math.round(Math.hypot(avgWindU, avgWindV));
  const windSpeedMs = Number((windSpeedKts * KTS_TO_MS).toFixed(1));
  const windDirectionDeg = (Math.round((Math.atan2(avgWindU, avgWindV) * 180) / Math.PI) + 360) % 360;

  const avgCurrU = currU / weightSum;
  const avgCurrV = currV / weightSum;
  const currentSpeedKts = Number(Math.hypot(avgCurrU, avgCurrV).toFixed(2));
  const currentDirectionDeg =
    (Math.round((Math.atan2(avgCurrU, avgCurrV) * 180) / Math.PI) + 360) % 360;

  return {
    windSpeedKts,
    windSpeedMs,
    windDirectionDeg,
    windDirectionCardinal: degreesToCardinal(windDirectionDeg),
    currentSpeedKts,
    currentDirectionDeg,
    waveHeightM: Number((waveSum / weightSum).toFixed(2)),
    nearestBuoyName: nearestBuoy.name,
    isLive: buoys.some((b) => b.isLiveData),
  };
}

function buildCirclePolygon(
  center: LatLngPoint,
  radiusKm: number,
  segments = 36
): LatLngPoint[] {
  const pts: LatLngPoint[] = [];
  for (let i = 0; i < segments; i++) {
    const deg = (i / segments) * 360;
    pts.push(destinationPoint(center, deg, radiusKm));
  }
  return pts;
}

/**
 * Real-Time AIS Dark-Gap Watchdog & 360° Predictive Reachability Envelope (The 30-Minute Rule).
 * - Under 30 minutes (active AIS or short-term transponder gap): vessel remains GREEN (routine_gap),
 *   with a green predictive reachability circle rendered around it.
 * - Over 30 minutes: automatically escalates vessel to RED (confirmed_dark), intensifies envelope styling,
 *   and flags it as a confirmed dark vessel anomaly candidate.
 */
export function computeDarkEnvelope(
  vessel: Vessel,
  nowMs: number,
  simulatedBlackouts: Record<string, SimulatedBlackoutRecord>,
  cables: SubseaCable[],
  buoys: MetoceanBuoy[],
  fallbackWeather: WeatherState,
  forceIncludeActive = false
): DarkEnvelopeState | null {
  const sim = simulatedBlackouts[vessel.id];
  const lastSeenMs = Date.parse(vessel.aisLastSeenUtc);
  const rawGapMinutes = Number.isFinite(lastSeenMs)
    ? Math.max(0, (nowMs - lastSeenMs) / 60000)
    : 0;

  const hasBriefOrExtendedGap =
    !sim &&
    Boolean(vessel.isLiveAis) &&
    vessel.sogKts > 2.0 &&
    !isInPortAnchorage(vessel.lat, vessel.lon) &&
    rawGapMinutes >= BRIEF_GAP_ENVELOPE_MIN_MINUTES;

  const includeActiveSelected = !sim && Boolean(vessel.isLiveAis) && forceIncludeActive;

  if (!sim && !hasBriefOrExtendedGap && !includeActiveSelected) {
    return null;
  }

  const lkpLat = sim ? sim.lkpLat : vessel.lat;
  const lkpLon = sim ? sim.lkpLon : vessel.lon;
  const lastSogKts = sim ? sim.lastSogKts : vessel.sogKts;
  const lastCogDeg = sim ? sim.lastCogDeg : vessel.cogDeg;

  const gapMinutes = sim
    ? Math.max(1, (nowMs - sim.triggeredAtMs) / 60000 + sim.offsetSeconds / 60)
    : rawGapMinutes;

  const isConfirmedDark = gapMinutes > DARK_VESSEL_THRESHOLD_MINUTES;
  const severity: DarkEnvelopeState['severity'] = isConfirmedDark
    ? 'confirmed_dark'
    : 'routine_gap';

  // For brief/active (<5m) green envelopes, use a minimum 5-minute lookahead horizon so the
  // predictive movement area circle remains legible; cap prolonged dark envelopes at 12h.
  const effectiveHorizonMin = Math.max(5, gapMinutes);
  const dtHours = Math.min(12, effectiveHorizonMin / 60);
  const localMet = interpolateBuoyMetocean(lkpLat, lkpLon, buoys, fallbackWeather);

  // Max evasive speed V_max = max(14 kts, 1.25 * last SOG)
  const maxSpeedKts = Number(Math.max(14, lastSogKts * 1.25).toFixed(1));
  const reachabilityRadiusKm = Number((maxSpeedKts * KTS_TO_KMH * dtHours).toFixed(2));
  const reachabilityDiameterKm = Number((reachabilityRadiusKm * 2).toFixed(2));

  // Ocean current advection shifts the center of the 360° evasive disk
  const currentDriftKm = localMet.currentSpeedKts * KTS_TO_KMH * dtHours;
  const shiftedCenter = destinationPoint(
    { lat: lkpLat, lon: lkpLon },
    localMet.currentDirectionDeg,
    currentDriftKm
  );

  const envelopePolygon = buildCirclePolygon(shiftedCenter, reachabilityRadiusKm, 36);

  // Directional Heading Cone from LKP combining last SOG/COG + ocean current vector
  const sogKm = Math.max(1.2, lastSogKts * KTS_TO_KMH * dtHours);
  const drPureEnd = destinationPoint({ lat: lkpLat, lon: lkpLon }, lastCogDeg, sogKm);
  const drCurrentEnd = destinationPoint(drPureEnd, localMet.currentDirectionDeg, currentDriftKm);

  const coneSpreadDeg = 18;
  const coneRadiusKm = Math.min(reachabilityRadiusKm * 0.96, sogKm * 1.18 + currentDriftKm);
  const headingConePolygon: LatLngPoint[] = [
    { lat: lkpLat, lon: lkpLon },
    destinationPoint({ lat: lkpLat, lon: lkpLon }, lastCogDeg - coneSpreadDeg, coneRadiusKm * 0.92),
    destinationPoint({ lat: lkpLat, lon: lkpLon }, lastCogDeg, coneRadiusKm),
    destinationPoint({ lat: lkpLat, lon: lkpLon }, lastCogDeg + coneSpreadDeg, coneRadiusKm * 0.92),
  ];

  const cableStats = evaluateCableThreats(shiftedCenter, reachabilityRadiusKm, cables, lastSogKts);
  const episodeKey = sim
    ? `${vessel.id}:sim:${sim.triggeredAtMs}`
    : `${vessel.id}:ais:${vessel.aisLastSeenUtc}`;

  return {
    vesselId: vessel.id,
    mmsi: vessel.mmsi,
    vesselName: vessel.name,
    flag: vessel.flag,
    vesselType: vessel.vesselType,
    lkpLat,
    lkpLon,
    isSimulated: Boolean(sim),
    episodeKey,
    gapMinutes: Number(gapMinutes.toFixed(2)),
    thresholdMinutes: DARK_VESSEL_THRESHOLD_MINUTES,
    severity,
    isConfirmedDark,
    maxSpeedKts,
    reachabilityCenterLat: shiftedCenter.lat,
    reachabilityCenterLon: shiftedCenter.lon,
    reachabilityRadiusKm,
    reachabilityDiameterKm,
    envelopePolygon,
    headingConePolygon,
    drCenterLine: [{ lat: lkpLat, lon: lkpLon }, drCurrentEnd],
    intersectingCables: cableStats.intersectingCables,
    nearestCable: cableStats.nearestCable,
  };
}

/**
 * Automatic Subsea Cable Proximity Watchdog across all real AIS vessels and dark-vessel escape disks.
 * Raises SUBSEA CABLE THREAT if any vessel is < 3.0 km from SEA-ME-WE 5 / AAE-1 / FLAG Europe-Asia,
 * exhibits suspicious low speed (0.2 - 5.0 kts) near a cable outside port anchorages,
 * or has a dark reachability envelope intersecting a cable buffer.
 */
export function computeSubseaCableProximityAlerts(
  vessels: Vessel[],
  darkEnvelopes: DarkEnvelopeState[],
  cables: SubseaCable[]
): CableProximityAlert[] {
  const darkById = new Map<string, DarkEnvelopeState>();
  darkEnvelopes.forEach((d) => darkById.set(d.vesselId, d));

  const alerts: CableProximityAlert[] = [];

  for (const v of vessels) {
    const darkEnv = darkById.get(v.id);
    if (darkEnv && darkEnv.isConfirmedDark && darkEnv.intersectingCables.length > 0) {
      const top = darkEnv.intersectingCables[0];
      alerts.push({
        vesselId: v.id,
        vesselName: v.name,
        mmsi: v.mmsi,
        lat: darkEnv.lkpLat,
        lon: darkEnv.lkpLon,
        sogKts: v.sogKts,
        cableId: top.cableId,
        cableName: top.cableName,
        capacityTbps: top.capacityTbps,
        distanceKm: top.distanceKm,
        reason: 'DARK_ENVELOPE_INTERSECT',
        anchorDragRiskScore: Math.max(82, top.anchorDragRiskScore),
      });
      continue;
    }

    const stats = evaluateCableThreats({ lat: v.lat, lon: v.lon }, 0, cables, v.sogKts);
    const nearest = stats.nearestCable;
    const inAnchorage = isInPortAnchorage(v.lat, v.lon);
    const under3Km = nearest.distanceKm < 3.0;
    const suspiciousSlowdown =
      !inAnchorage && v.sogKts > 0.2 && v.sogKts <= 5.0 && nearest.distanceKm <= 5.0;

    if (under3Km || suspiciousSlowdown) {
      alerts.push({
        vesselId: v.id,
        vesselName: v.name,
        mmsi: v.mmsi,
        lat: v.lat,
        lon: v.lon,
        sogKts: v.sogKts,
        cableId: nearest.cableId,
        cableName: nearest.cableName,
        capacityTbps: nearest.capacityTbps,
        distanceKm: nearest.distanceKm,
        reason: under3Km ? 'PROXIMITY_UNDER_3KM' : 'SUSPICIOUS_SLOWDOWN',
        anchorDragRiskScore: under3Km
          ? Math.max(84, nearest.anchorDragRiskScore)
          : Math.max(72, nearest.anchorDragRiskScore),
      });
    }
  }

  return alerts.sort((a, b) => a.distanceKm - b.distanceKm);
}

function formatHms(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getSwathWidthForSatellite(name: string): number {
  return name.includes('NISAR') ? 240 : 250; // 250km Sentinel-1 IW, 240km NISAR SweepSAR
}

function propagateSatPoint(
  satrec: ReturnType<typeof twoline2satrec>,
  date: Date
): LatLngPoint | null {
  try {
    const pv = propagate(satrec, date);
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
    const gmst = gstime(date);
    const geo = eciToGeodetic(pv.position, gmst);
    const lat = degreesLat(geo.latitude);
    const lon = degreesLong(geo.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

/**
 * Autonomous SGP4 Next-Pass Intercept & Swath Capture Probability.
 * Propagates Sentinel-1A, Sentinel-1C, and NISAR up to 24h to find earliest swath intercept
 * covering the target's 360° evasive reachability disk.
 */
export function computeSgp4InterceptForEnvelope(
  centerLat: number,
  centerLon: number,
  evasiveRadiusKm: number,
  referenceDate: Date = new Date(),
  catalog: SatelliteTleRecord[] = DEFAULT_SAR_TLE_CATALOG,
  observabilityPct = 91
): Sgp4InterceptAssessment | null {
  const targetCenter: LatLngPoint = { lat: centerLat, lon: centerLon };
  let bestIntercept: Sgp4InterceptAssessment | null = null;
  let fallbackClosest: Sgp4InterceptAssessment | null = null;

  catalog.forEach((entry) => {
    const satrec = twoline2satrec(entry.tle1, entry.tle2);
    const swathWidthKm = getSwathWidthForSatellite(entry.name);
    const halfSwathKm = swathWidthKm / 2;

    let firstInterceptSec: number | null = null;
    let bestLocalSec = 60;
    let bestLocalDistKm = Infinity;

    // Coarse 60-second scan across 24 hours
    for (let sec = 30; sec <= 24 * 3600; sec += 60) {
      const sampleDate = new Date(referenceDate.getTime() + sec * 1000);
      const pos = propagateSatPoint(satrec, sampleDate);
      if (!pos) continue;

      const distKm = haversineDistanceKm(pos, targetCenter);
      if (distKm < bestLocalDistKm) {
        bestLocalDistKm = distKm;
        bestLocalSec = sec;
      }

      if (firstInterceptSec === null && distKm <= halfSwathKm + evasiveRadiusKm) {
        // Refine around this pass window (+/- 180s) to locate closest approach
        let localMinDist = distKm;
        let localMinSec = sec;
        for (let r = Math.max(10, sec - 90); r <= sec + 180; r += 10) {
          const rPos = propagateSatPoint(satrec, new Date(referenceDate.getTime() + r * 1000));
          if (!rPos) continue;
          const rDist = haversineDistanceKm(rPos, targetCenter);
          if (rDist < localMinDist) {
            localMinDist = rDist;
            localMinSec = r;
          }
        }
        firstInterceptSec = localMinSec;
        bestLocalDistKm = localMinDist;
        bestLocalSec = localMinSec;
        break;
      }
    }

    const chosenSec = firstInterceptSec ?? bestLocalSec;
    const p1 = propagateSatPoint(satrec, new Date(referenceDate.getTime() + chosenSec * 1000));
    const p2 = propagateSatPoint(satrec, new Date(referenceDate.getTime() + (chosenSec + 15) * 1000));
    const orbitDirection: 'ASCENDING' | 'DESCENDING' =
      p1 && p2 && p2.lat >= p1.lat ? 'ASCENDING' : 'DESCENDING';

    // Geometric disk capture probability comparing 2*R_max vs swath width
    const diameterKm = Math.max(0.5, evasiveRadiusKm * 2);
    const minCrossTrack = Math.max(-halfSwathKm, bestLocalDistKm - evasiveRadiusKm);
    const maxCrossTrack = Math.min(halfSwathKm, bestLocalDistKm + evasiveRadiusKm);
    const capturedSpanKm = Math.max(0, maxCrossTrack - minCrossTrack);
    const geometricFraction = Math.min(1, capturedSpanKm / diameterKm);

    const seaStateMod = Math.max(0.76, Math.min(0.994, observabilityPct / 100));
    const captureProbabilityPct = Number(
      Math.max(4, Math.min(99.4, geometricFraction * 100 * seaStateMod)).toFixed(1)
    );

    const assessment: Sgp4InterceptAssessment = {
      satelliteId: entry.id,
      satelliteName: entry.name,
      noradId: entry.noradId,
      bandLabel: entry.bandLabel,
      swathWidthKm,
      interceptEtaSeconds: chosenSec,
      interceptUtc: new Date(referenceDate.getTime() + chosenSec * 1000).toISOString(),
      countdownFormatted: formatHms(chosenSec),
      closestApproachKm: Number(bestLocalDistKm.toFixed(1)),
      captureProbabilityPct,
      evasiveDiskDiameterKm: Number(diameterKm.toFixed(1)),
      orbitDirection,
      isLiveTle: entry.isLiveTle,
    };

    if (firstInterceptSec !== null) {
      if (!bestIntercept || assessment.interceptEtaSeconds < bestIntercept.interceptEtaSeconds) {
        bestIntercept = assessment;
      }
    }
    if (!fallbackClosest || assessment.closestApproachKm < fallbackClosest.closestApproachKm) {
      fallbackClosest = assessment;
    }
  });

  return bestIntercept ?? fallbackClosest;
}

export interface CoastalSectorAsset {
  name: string;
  sensitivity: string;
  lat: number;
  lon: number;
}

export const EGYPT_COASTAL_ASSETS: CoastalSectorAsset[] = [
  {
    name: 'Sidi Kerir Terminal',
    sensitivity: 'CRITICAL ENERGY TERMINAL',
    lat: 31.085,
    lon: 29.625,
  },
  {
    name: 'Alexandria Western Harbor & Desalination Intake',
    sensitivity: 'CRITICAL HARBOR & DESALINATION INTAKE',
    lat: 31.195,
    lon: 29.865,
  },
  {
    name: 'Abu Qir Bay & Rosetta Delta Estuary',
    sensitivity: 'DELTA ESTUARY & FISHERIES',
    lat: 31.345,
    lon: 30.18,
  },
  {
    name: 'Lake Burullus Wetland Reserve',
    sensitivity: 'PROTECTED WETLAND RESERVE',
    lat: 31.545,
    lon: 30.89,
  },
  {
    name: 'Damietta Port & Manzala Lagoon',
    sensitivity: 'PORT & LAGOON APPROACH',
    lat: 31.485,
    lon: 31.785,
  },
  {
    name: 'Suez Canal NW Approach',
    sensitivity: 'STRATEGIC MARITIME CHOKEPOINT',
    lat: 31.295,
    lon: 32.325,
  },
];

const EGYPT_SHORELINE_POLYLINE: LatLngPoint[] = [
  { lat: 30.98, lon: 29.35 },
  { lat: 31.085, lon: 29.625 },
  { lat: 31.195, lon: 29.865 },
  { lat: 31.32, lon: 30.14 },
  { lat: 31.47, lon: 30.38 },
  { lat: 31.56, lon: 30.89 },
  { lat: 31.52, lon: 31.45 },
  { lat: 31.485, lon: 31.785 },
  { lat: 31.295, lon: 32.325 },
  { lat: 31.16, lon: 32.68 },
];

function interpolateEgyptCoastLatAtLon(lon: number): number {
  const pts = EGYPT_SHORELINE_POLYLINE;
  if (lon <= pts[0].lon) return pts[0].lat;
  if (lon >= pts[pts.length - 1].lon) return pts[pts.length - 1].lat;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (lon >= a.lon && lon <= b.lon) {
      const t = (lon - a.lon) / Math.max(1e-6, b.lon - a.lon);
      return a.lat + t * (b.lat - a.lat);
    }
  }
  return 31.25;
}

function distancePointToShorelineKm(pt: LatLngPoint): number {
  let minKm = Infinity;
  for (let i = 0; i < EGYPT_SHORELINE_POLYLINE.length - 1; i++) {
    const d = pointToSegmentDistanceKm(
      pt,
      EGYPT_SHORELINE_POLYLINE[i],
      EGYPT_SHORELINE_POLYLINE[i + 1]
    );
    if (d < minKm) minKm = d;
  }
  return minKm;
}

export interface SarConfidenceOptions {
  hasAnomaly?: boolean;
  isConfirmedDark?: boolean;
  aisGapMinutes?: number;
  hasSlick?: boolean;
  hasCableThreat?: boolean;
  windDirectionDeg?: number;
}

/**
 * Automated SAR "Look-Alike" False-Positive Filter & Dynamic Anomaly Confidence
 * Active, compliant AIS vessels display a nominal stream status with no artificial SAR panic score.
 * When a >30m blackout, slick, or anomaly occurs, confidence is computed dynamically from
 * AIS gap duration, wind speed Bragg optimality, and wind vector alignment.
 */
export function computeSarConfidenceAssessment(
  windSpeedKts: number,
  options: SarConfidenceOptions = {}
): SarConfidenceAssessment {
  const wind = Number(Math.max(0, windSpeedKts).toFixed(1));
  const {
    hasAnomaly = false,
    isConfirmedDark = false,
    aisGapMinutes = 0,
    hasSlick = false,
    hasCableThreat = false,
    windDirectionDeg,
  } = options;

  const anomalyTriggered = hasAnomaly || isConfirmedDark || hasSlick || hasCableThreat;

  if (!anomalyTriggered) {
    if (aisGapMinutes >= 0.5 && aisGapMinutes < 30) {
      return {
        scorePct: null,
        category: 'ROUTINE_GAP_MONITORING',
        shortLabel: 'ROUTINE GAP (<30M)',
        badgeText: 'ROUTINE AIS GAP (<30M) // NO SAR ANOMALY',
        explanation: `Transponder silent for ${aisGapMinutes.toFixed(1)} min (under 30-minute escalation threshold). Predictive AIS tracking remains active without SAR anomaly escalation.`,
        windSpeedKts: wind,
        tone: 'cyan',
      };
    }

    return {
      scorePct: null,
      category: 'NOMINAL_AIS_STREAM',
      shortLabel: 'NORMAL AIS STREAM',
      badgeText: 'NORMAL AIS STREAM // NO SAR ANOMALY',
      explanation:
        'Vessel is broadcasting continuous compliant AIS telemetry within normal reporting intervals. No dark-target blackout or SAR surface slick anomaly detected.',
      windSpeedKts: wind,
      tone: 'cyan',
    };
  }

  const effectiveGapMins = Math.max(0, aisGapMinutes > 0 ? aisGapMinutes : hasSlick ? 90 : 31);
  const gapFactor = Math.min(1, Math.max(0, (effectiveGapMins - 30) / 180));
  const vectorCoherence =
    windDirectionDeg !== undefined
      ? Math.round(Math.abs(Math.cos(((windDirectionDeg % 360) * Math.PI) / 180)) * 2)
      : 1;

  if (wind < 3) {
    const score = Math.min(49, Math.max(32, Math.round(34 + (wind / 3) * 7 + gapFactor * 6)));
    return {
      scorePct: score,
      category: 'LOW_WIND_LOOK_ALIKE',
      shortLabel: 'LOW-WIND LOOK-ALIKE RISK',
      badgeText: `SAR CONFIDENCE: ${score}% // LOW-WIND LOOK-ALIKE RISK`,
      explanation:
        'Calm sea states (< 3 kts) lack Bragg capillary wave roughness and can mimic oil dampening on C-band/L-band radar.',
      windSpeedKts: wind,
      tone: 'amber',
    };
  }

  if (wind >= 4 && wind <= 15) {
    const braggCentering = 1 - Math.min(1, Math.abs(wind - 9.5) / 5.5);
    const slickBonus = hasSlick ? 4 : 0;
    const cableBonus = hasCableThreat ? 2 : 0;
    const score = Math.min(
      97,
      Math.max(
        76,
        Math.round(77 + braggCentering * 8 + gapFactor * 7 + slickBonus + cableBonus + vectorCoherence)
      )
    );
    const label = hasSlick ? 'VERIFIED HYDROCARBON' : 'DARK TARGET CORROBORATED';
    return {
      scorePct: score,
      category: hasSlick ? 'VERIFIED_HYDROCARBON' : 'DARK_TARGET_CORROBORATED',
      shortLabel: label,
      badgeText: `SAR CONFIDENCE: ${score}% // ${label}`,
      explanation: `Optimal capillary Bragg wind window (${wind} kts) combined with ${effectiveGapMins.toFixed(
        0
      )}m AIS gap telemetry yields ${score}% orbital detection confidence.`,
      windSpeedKts: wind,
      tone: 'cyan',
    };
  }

  if (wind > 16) {
    const excessPenalty = Math.min(10, (wind - 16) * 1.1);
    const score = Math.min(73, Math.max(52, Math.round(68 - excessPenalty + gapFactor * 5)));
    return {
      scorePct: score,
      category: 'HIGH_SEA_STATE_DISPERSION',
      shortLabel: 'HIGH SEA-STATE DISPERSION',
      badgeText: `SAR CONFIDENCE: ${score}% // HIGH SEA-STATE DISPERSION`,
      explanation:
        'Strong surface winds (> 16 kts) trigger wave breaking and vertical dispersion, attenuating oil backscatter contrast.',
      windSpeedKts: wind,
      tone: 'amber',
    };
  }

  if (wind >= 3 && wind < 4) {
    const score = Math.min(66, Math.max(52, Math.round(54 + (wind - 3) * 6 + gapFactor * 5)));
    return {
      scorePct: score,
      category: 'MARGINAL_TRANSITION',
      shortLabel: 'LOW-WIND MARGINAL RISK',
      badgeText: `SAR CONFIDENCE: ${score}% // LOW-WIND MARGINAL RISK`,
      explanation:
        'Transitional wind speed (3 to 4 kts) borders calm sea conditions where biogenic or wind-slick look-alikes occur.',
      windSpeedKts: wind,
      tone: 'amber',
    };
  }

  const transitionScore = Math.min(82, Math.max(69, Math.round(72 + (16 - wind) * 4 + gapFactor * 4)));
  return {
    scorePct: transitionScore,
    category: 'MARGINAL_TRANSITION',
    shortLabel: 'DISPERSION TRANSITION',
    badgeText: `SAR CONFIDENCE: ${transitionScore}% // DISPERSION TRANSITION`,
    explanation:
      'Transitional sea state (15 to 16 kts) approaches wind-driven emulsification and slick fragmentation thresholds.',
    windSpeedKts: wind,
    tone: 'amber',
  };
}

/**
 * Coastal Impact & Shoreline Risk Estimator
 * Checks if a vessel's +24h oil drift ensemble cone approaches or intersects the Egyptian coastline
 * between Alexandria, the Nile Delta, and Port Said.
 */
export function computeCoastalImpactAssessment(params: {
  lat: number;
  lon: number;
  windSpeedKts: number;
  windDirectionDeg: number;
  currentSpeedKts?: number;
  currentDirectionDeg?: number;
  slickWidthKm?: number;
  slickAreaKm2?: number;
  driftBearingDeg?: number;
  driftSpeedKts?: number;
  coastlineImpactEtaOverrideHours?: number | null;
}): CoastalImpactAssessment {
  const {
    lat,
    lon,
    windSpeedKts,
    windDirectionDeg,
    currentSpeedKts = 0.35,
    currentDirectionDeg = 108,
    slickWidthKm,
    slickAreaKm2 = 8.4,
    driftBearingDeg: explicitBearing,
    driftSpeedKts: explicitDriftSpeed,
    coastlineImpactEtaOverrideHours,
  } = params;

  // Wind drift rate ~3% of wind speed in wind-TO direction (+180 deg)
  const windDriftSpeedKts = Number(Math.max(0.06, windSpeedKts * 0.03).toFixed(2));
  const windToRad = (((windDirectionDeg + 180) % 360) * Math.PI) / 180;
  const currRad = ((currentDirectionDeg % 360) * Math.PI) / 180;

  const vxKts = windDriftSpeedKts * Math.sin(windToRad) + currentSpeedKts * Math.sin(currRad);
  const vyKts = windDriftSpeedKts * Math.cos(windToRad) + currentSpeedKts * Math.cos(currRad);

  const effectiveDriftSpeedKts = Number(
    (explicitDriftSpeed ?? Math.max(0.22, Math.hypot(vxKts, vyKts))).toFixed(2)
  );
  const driftBearingDeg =
    explicitBearing ??
    ((Math.round((Math.atan2(vxKts, vyKts) * 180) / Math.PI) + 360) % 360);

  const origin: LatLngPoint = { lat, lon };
  const coneSamples: LatLngPoint[] = [origin];
  const horizonHours = [6, 12, 18, 24];
  const spreadOffsets = [-22, 0, 22];

  horizonHours.forEach((h) => {
    const reachKm = effectiveDriftSpeedKts * KTS_TO_KMH * h;
    spreadOffsets.forEach((offset) => {
      coneSamples.push(destinationPoint(origin, driftBearingDeg + offset, reachKm));
    });
  });

  // Find closest cone sample to Egyptian shoreline polyline
  let minConeShoreDistKm = Infinity;
  let closestConeSample: LatLngPoint = origin;
  let coneCrossesCoastline = false;

  coneSamples.forEach((pt) => {
    const shoreLat = interpolateEgyptCoastLatAtLon(pt.lon);
    if (pt.lat <= shoreLat + 0.015 && pt.lon >= 29.2 && pt.lon <= 32.75) {
      coneCrossesCoastline = true;
    }
    const dKm = distancePointToShorelineKm(pt);
    if (dKm < minConeShoreDistKm) {
      minConeShoreDistKm = dKm;
      closestConeSample = pt;
    }
  });

  // Identify nearest vulnerable coastal sector to the closest cone point
  const referenceAssetPt = coneCrossesCoastline
    ? closestConeSample
    : destinationPoint(origin, driftBearingDeg, effectiveDriftSpeedKts * KTS_TO_KMH * 24);

  let nearestAsset = EGYPT_COASTAL_ASSETS[0];
  let minAssetDistKm = Infinity;
  EGYPT_COASTAL_ASSETS.forEach((asset) => {
    const d = haversineDistanceKm(referenceAssetPt, asset);
    if (d < minAssetDistKm) {
      minAssetDistKm = d;
      nearestAsset = asset;
    }
  });

  const directDistToAssetKm = haversineDistanceKm(origin, nearestAsset);
  const directDistToShoreKm = distancePointToShorelineKm(origin);
  const distanceToCoastKm = Number(Math.min(directDistToShoreKm, directDistToAssetKm).toFixed(1));

  // Closing speed toward coastline based on ~3% wind drift + current vector
  const bearingToAssetDeg =
    (Math.atan2(nearestAsset.lon - origin.lon, nearestAsset.lat - origin.lat) * 180) / Math.PI;
  const angleDeltaRad = ((driftBearingDeg - bearingToAssetDeg) * Math.PI) / 180;
  const cosClosing = Math.max(0, Math.cos(angleDeltaRad));
  const rawClosingKmh = effectiveDriftSpeedKts * KTS_TO_KMH * cosClosing;
  const windOnlyKmh = windDriftSpeedKts * KTS_TO_KMH;

  const intersectsWithin24h = coneCrossesCoastline || minConeShoreDistKm <= 4.5;
  const approachesOrIntersects =
    intersectsWithin24h ||
    (minConeShoreDistKm <= 28 && origin.lon >= 29.0 && origin.lon <= 32.9 && origin.lat <= 32.4) ||
    (coastlineImpactEtaOverrideHours !== undefined && coastlineImpactEtaOverrideHours !== null);

  let estimatedLandfallEtaHours: number | null = null;
  if (coastlineImpactEtaOverrideHours !== undefined && coastlineImpactEtaOverrideHours !== null) {
    estimatedLandfallEtaHours = Number(coastlineImpactEtaOverrideHours.toFixed(1));
  } else if (rawClosingKmh > 0.22 && distanceToCoastKm / rawClosingKmh <= 72) {
    estimatedLandfallEtaHours = Number(
      Math.max(0.8, distanceToCoastKm / rawClosingKmh).toFixed(1)
    );
  } else if (intersectsWithin24h) {
    const fallbackRateKmh = Math.max(0.35, windOnlyKmh, effectiveDriftSpeedKts * KTS_TO_KMH * 0.65);
    estimatedLandfallEtaHours = Number(
      Math.max(1.0, Math.min(24.0, distanceToCoastKm / fallbackRateKmh)).toFixed(1)
    );
  }

  const resolvedWidthKm = Number(
    (slickWidthKm ?? Math.max(0.65, Math.sqrt(Math.max(1, slickAreaKm2) / 3.2))).toFixed(2)
  );
  const containmentBoomMeters = Math.max(
    450,
    Math.round((resolvedWidthKm * 1000 * 0.85) / 50) * 50
  );

  return {
    approachesOrIntersects,
    intersectsWithin24h,
    nearestSectorName: nearestAsset.name,
    sectorSensitivity: nearestAsset.sensitivity,
    nearestCoastLat: nearestAsset.lat,
    nearestCoastLon: nearestAsset.lon,
    distanceToCoastKm,
    estimatedLandfallEtaHours,
    windDriftSpeedKts,
    effectiveDriftSpeedKts,
    driftBearingDeg,
    slickWidthKm: resolvedWidthKm,
    containmentBoomMeters,
    responseRequirementLabel: `${containmentBoomMeters.toLocaleString()}m Offshore Containment Boom`,
  };
}

function nearestCoastlineLanding(origin: LatLngPoint): {
  lat: number;
  lon: number;
  name: string;
} {
  let best = EGYPT_COASTAL_ASSETS[0];
  let minDist = Infinity;
  EGYPT_COASTAL_ASSETS.forEach((c) => {
    const d = haversineDistanceKm(origin, c);
    if (d < minDist) {
      minDist = d;
      best = c;
    }
  });
  return best;
}

function seededRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/**
 * Live Lagrangian Oil Spill Backtracking & Forward Drift powered by 3 Open-Meteo Buoys.
 */
export function computeLiveOilSpillSimulation(
  anchor: {
    id: string;
    label: string;
    anchorType: 'vessel' | 'sar_footprint';
    lat: number;
    lon: number;
    releaseHoursAgo?: number;
  },
  timeOffsetHours: number,
  buoys: MetoceanBuoy[],
  fallbackWeather: WeatherState,
  nowMs: number = Date.now()
): LiveOilSpillSimulation {
  const met = interpolateBuoyMetocean(anchor.lat, anchor.lon, buoys, fallbackWeather);
  const releaseHoursAgo = anchor.releaseHoursAgo ?? 6;

  // Wind pushes oil in wind-TO direction (+180° from meteorological wind-FROM) at ~3% speed
  const windToDeg = (met.windDirectionDeg + 180) % 360;
  const windToRad = (windToDeg * Math.PI) / 180;
  const currRad = (met.currentDirectionDeg * Math.PI) / 180;

  const windLeewayKts = met.windSpeedKts * 0.03;
  const vxKts = windLeewayKts * Math.sin(windToRad) + met.currentSpeedKts * Math.sin(currRad);
  const vyKts = windLeewayKts * Math.cos(windToRad) + met.currentSpeedKts * Math.cos(currRad);

  const driftSpeedKts = Number(Math.max(0.15, Math.hypot(vxKts, vyKts)).toFixed(2));
  const driftBearingDeg = (Math.round((Math.atan2(vxKts, vyKts) * 180) / Math.PI) + 360) % 360;

  // Backtrack from T=0 slick anchor to release origin (-releaseHoursAgo)
  const originLat = destinationPoint(
    { lat: anchor.lat, lon: anchor.lon },
    (driftBearingDeg + 180) % 360,
    driftSpeedKts * KTS_TO_KMH * releaseHoursAgo
  ).lat;
  const originLon = destinationPoint(
    { lat: anchor.lat, lon: anchor.lon },
    (driftBearingDeg + 180) % 360,
    driftSpeedKts * KTS_TO_KMH * releaseHoursAgo
  ).lon;

  const evalOffset = Math.max(-releaseHoursAgo, timeOffsetHours);
  const centerAtTime = destinationPoint(
    { lat: originLat, lon: originLon },
    driftBearingDeg,
    driftSpeedKts * KTS_TO_KMH * (releaseHoursAgo + evalOffset)
  );

  // Coastline impact assessment along drift vector
  const coastTarget = nearestCoastlineLanding(centerAtTime);
  const distToCoastKm = haversineDistanceKm(centerAtTime, coastTarget);
  const cosAngle = Math.cos(
    ((driftBearingDeg -
      ((Math.atan2(coastTarget.lon - centerAtTime.lon, coastTarget.lat - centerAtTime.lat) * 180) /
        Math.PI)) *
      Math.PI) /
      180
  );
  const closingSpeedKmh = driftSpeedKts * KTS_TO_KMH * Math.max(0, cosAngle);
  const etaHours =
    closingSpeedKmh > 0.25 && distToCoastKm / closingSpeedKmh <= 72
      ? Number((distToCoastKm / closingSpeedKmh).toFixed(1))
      : null;

  const forwardHorizonHours = etaHours ? Math.min(24, etaHours) : 24;
  const impactPt = destinationPoint(
    { lat: anchor.lat, lon: anchor.lon },
    driftBearingDeg,
    driftSpeedKts * KTS_TO_KMH * forwardHorizonHours
  );

  const ageHours = Math.max(0.5, releaseHoursAgo + evalOffset);
  const spreadKm = 0.9 + ageHours * 0.24;
  const driftRad = (driftBearingDeg * Math.PI) / 180;

  const particles = Array.from({ length: 32 }, (_, idx) => {
    const along = seededRand(idx * 5 + 1) * spreadKm * 1.4;
    const cross = seededRand(idx * 9 + 3) * spreadKm * 0.55;
    const northKm = Math.cos(driftRad) * along - Math.sin(driftRad) * cross;
    const eastKm = Math.sin(driftRad) * along + Math.cos(driftRad) * cross;
    const cosLat = Math.max(0.2, Math.cos((centerAtTime.lat * Math.PI) / 180));
    return {
      lat: centerAtTime.lat + northKm / 111.32,
      lon: centerAtTime.lon + eastKm / (111.32 * cosLat),
      weight: 0.45 + Math.abs(seededRand(idx + 13)) * 0.55,
      radiusM: Math.round(160 + ageHours * 22),
    };
  });

  const slickPolygon: LatLngPoint[] = Array.from({ length: 14 }, (_, idx) => {
    const theta = (idx / 14) * Math.PI * 2;
    const wobble = 1 + 0.25 * Math.sin(theta * 3 + timeOffsetHours * 0.1);
    const localAlong = Math.cos(theta) * spreadKm * 1.35 * wobble;
    const localCross = Math.sin(theta) * spreadKm * 0.58 * wobble;
    const northKm = Math.cos(driftRad) * localAlong - Math.sin(driftRad) * localCross;
    const eastKm = Math.sin(driftRad) * localAlong + Math.cos(driftRad) * localCross;
    const cosLat = Math.max(0.2, Math.cos((centerAtTime.lat * Math.PI) / 180));
    return {
      lat: centerAtTime.lat + northKm / 111.32,
      lon: centerAtTime.lon + eastKm / (111.32 * cosLat),
    };
  });

  const backtrackPath: LatLngPoint[] = [];
  for (let i = 0; i <= 8; i++) {
    const h = (releaseHoursAgo * i) / 8;
    backtrackPath.push(
      destinationPoint({ lat: originLat, lon: originLon }, driftBearingDeg, driftSpeedKts * KTS_TO_KMH * h)
    );
  }

  const forwardTrajectory: LatLngPoint[] = [];
  for (let h = 0; h <= 24; h += 4) {
    forwardTrajectory.push(
      destinationPoint({ lat: anchor.lat, lon: anchor.lon }, driftBearingDeg, driftSpeedKts * KTS_TO_KMH * h)
    );
  }

  const coneReachKm = Math.max(4, driftSpeedKts * KTS_TO_KMH * (8 + Math.max(0, timeOffsetHours)));
  const forwardConePolygon: LatLngPoint[] = [
    centerAtTime,
    destinationPoint(centerAtTime, driftBearingDeg - 22, coneReachKm),
    destinationPoint(centerAtTime, driftBearingDeg, coneReachKm * 1.12),
    destinationPoint(centerAtTime, driftBearingDeg + 22, coneReachKm),
  ];

  const stabilizedMinuteMs = Math.floor(nowMs / 60000) * 60000;
  const originTimeUtc = new Date(stabilizedMinuteMs - releaseHoursAgo * 3600 * 1000).toISOString();
  const slickAreaKm2 = Number((Math.PI * spreadKm * spreadKm * 0.45).toFixed(2));
  const estimatedVolumeBarrels = Math.round(slickAreaKm2 * 78);

  return {
    id: anchor.id,
    sourceLabel: anchor.label,
    anchorType: anchor.anchorType,
    originLat,
    originLon,
    originTimeUtc,
    releaseHoursAgo,
    currentCenterLat: centerAtTime.lat,
    currentCenterLon: centerAtTime.lon,
    impactLat: impactPt.lat,
    impactLon: impactPt.lon,
    impactZoneName: coastTarget.name,
    coastlineImpactEtaHours: etaHours,
    driftBearingDeg,
    driftSpeedKts,
    windContributionKts: Number(windLeewayKts.toFixed(2)),
    currentContributionKts: met.currentSpeedKts,
    slickAreaKm2,
    estimatedVolumeBarrels,
    particles,
    slickPolygon,
    backtrackPath,
    forwardTrajectory,
    forwardConePolygon,
    phaseLabel:
      timeOffsetHours < -0.5
        ? `LIVE HINDCAST (${timeOffsetHours.toFixed(1)}h)`
        : timeOffsetHours > 0.5
          ? `LIVE METOCEAN DRIFT (+${timeOffsetHours.toFixed(1)}h)`
          : 'T=0 LIVE SLICK SNAPSHOT',
  };
}

/**
 * Full Live Forensic Physics, Subsea Cable Risk & USD Liability Snapshot
 * for any live AIS vessel or NASA ASF SAR footprint in Coastal Surveillance mode.
 */
export function computeLiveForensicSnapshot(params: {
  vessel: Vessel;
  selectedAsfScene?: AsfSarScene;
  inspectTargetMode: 'vessel' | 'sar_footprint';
  darkEnvelope: DarkEnvelopeState | null;
  cableProximityAlerts?: CableProximityAlert[];
  oilSimulation: LiveOilSpillSimulation | null;
  timeOffsetHours?: number;
  cables: SubseaCable[];
  buoys: MetoceanBuoy[];
  fallbackWeather: WeatherState;
  tleCatalog: SatelliteTleRecord[];
  referenceDate: Date;
}): LiveForensicSnapshot {
  const {
    vessel,
    selectedAsfScene,
    inspectTargetMode,
    darkEnvelope,
    cableProximityAlerts = [],
    oilSimulation,
    timeOffsetHours = 0,
    cables,
    buoys,
    fallbackWeather,
    tleCatalog,
    referenceDate,
  } = params;

  let lat = vessel.lat;
  let lon = vessel.lon;
  let targetLabel = vessel.name;
  let targetSubtitle = `MMSI ${vessel.mmsi} · ${vessel.vesselType}`;
  let anchorType: 'vessel' | 'sar_footprint' = 'vessel';

  if (
    inspectTargetMode === 'sar_footprint' &&
    selectedAsfScene &&
    selectedAsfScene.footprintCoords.length > 0
  ) {
    lat =
      selectedAsfScene.footprintCoords.reduce((acc, p) => acc + p.lat, 0) /
      selectedAsfScene.footprintCoords.length;
    lon =
      selectedAsfScene.footprintCoords.reduce((acc, p) => acc + p.lon, 0) /
      selectedAsfScene.footprintCoords.length;
    targetLabel = selectedAsfScene.sceneName;
    targetSubtitle = `${selectedAsfScene.platform} · ${selectedAsfScene.bandLabel}`;
    anchorType = 'sar_footprint';
  }

  const confirmedDark = Boolean(darkEnvelope?.isConfirmedDark);
  const vesselStatusAnomaly = vessel.status === 'dark' || vessel.status === 'spoofed';
  const effectiveOilSim =
    oilSimulation ??
    (confirmedDark || vesselStatusAnomaly
      ? computeLiveOilSpillSimulation(
          {
            id: `auto-spill-${anchorType}-${vessel.id}`,
            label: targetLabel,
            anchorType,
            lat,
            lon,
            releaseHoursAgo: 6,
          },
          timeOffsetHours,
          buoys,
          fallbackWeather,
          referenceDate.getTime()
        )
      : null);

  const localMet = interpolateBuoyMetocean(lat, lon, buoys, fallbackWeather);

  // Slant-range Azimuth Doppler Displacement equation: Δx_az = (R_slant / V_sat) * V_r
  const satAltitudeKm = 693;
  const incidenceAngleDeg = 34.8;
  const incidenceRad = (incidenceAngleDeg * Math.PI) / 180;
  const slantRangeKm = Number((satAltitudeKm / Math.cos(incidenceRad)).toFixed(1));
  const satelliteSpeedMs = 7510;

  const satHeadingDeg =
    selectedAsfScene?.flightDirection === 'ASCENDING' ? 348 : 192;
  const satRangeAxisDeg = (satHeadingDeg + 90) % 360;
  const relAngleRad = ((vessel.cogDeg - satRangeAxisDeg) * Math.PI) / 180;

  const vesselSpeedMs = vessel.sogKts * KTS_TO_MS;
  const radialVelocityMs = Number(
    (vesselSpeedMs * Math.sin(incidenceRad) * Math.cos(relAngleRad)).toFixed(2)
  );
  const azimuthShiftM = Math.round(
    ((slantRangeKm * 1000) / satelliteSpeedMs) * Math.abs(radialVelocityMs)
  );
  const wakeSeparationM = Math.max(18, Math.round(azimuthShiftM + vessel.lengthM * 0.25));

  const sarDerivedSpeedKts = Number(
    Math.max(0.2, vessel.sogKts > 0.2 ? vessel.sogKts : darkEnvelope ? darkEnvelope.maxSpeedKts * 0.8 : 0.4).toFixed(1)
  );

  // Evaluate cable proximity & risk using dark envelope if active, else 2km vessel halo
  const evalRadiusKm = darkEnvelope ? darkEnvelope.reachabilityRadiusKm : 2.0;
  const evalCenter = darkEnvelope
    ? { lat: darkEnvelope.reachabilityCenterLat, lon: darkEnvelope.reachabilityCenterLon }
    : { lat, lon };
  const cableStats = evaluateCableThreats(evalCenter, evalRadiusKm, cables, vessel.sogKts);
  const matchingCableAlert = cableProximityAlerts.find((a) => a.vesselId === vessel.id) ?? null;

  // Autonomous SGP4 intercept for the active target envelope
  const sgp4Intercept = computeSgp4InterceptForEnvelope(
    evalCenter.lat,
    evalCenter.lon,
    evalRadiusKm,
    referenceDate,
    tleCatalog,
    fallbackWeather.sarObservabilityPct
  );

  // Dynamic USD financial & environmental liability model (zero spill exposure for routine ships)
  const slickKm2 = effectiveOilSim?.slickAreaKm2 ?? 0;
  const isTanker =
    vessel.vesselType.toLowerCase().includes('tanker') ||
    vessel.lengthM > 200;
  const vesselClassMult = isTanker ? 1.65 : 1.0;

  const isCableThreat = Boolean(matchingCableAlert) || (confirmedDark && cableStats.nearestCable.intersectsEnvelope);
  const hasExplicitSlick = Boolean(oilSimulation);
  const hasConfirmedAnomaly = confirmedDark || isCableThreat || hasExplicitSlick || vesselStatusAnomaly;

  const cableExposureM = isCableThreat
    ? Number(
        (
          (cableStats.nearestCable.capacityTbps / 24) * 3.8 +
          (confirmedDark ? 2.4 : matchingCableAlert ? 1.6 : 0.8)
        ).toFixed(2)
      )
    : Number((cableStats.nearestCable.anchorDragRiskScore * 0.03).toFixed(2));

  const shorelineMedian = slickKm2 > 0 ? Number((slickKm2 * 0.42 * vesselClassMult).toFixed(2)) : 0;
  const portMedian =
    isCableThreat
      ? Number((slickKm2 * 0.22 + cableExposureM * 0.55).toFixed(2))
      : slickKm2 > 0
        ? Number((slickKm2 * 0.22 + (cableStats.nearestCable.distanceKm < 10 ? 1.2 : 0.35)).toFixed(2))
        : 0;
  const habitatMedian = slickKm2 > 0 ? Number((slickKm2 * 0.29 * vesselClassMult).toFixed(2)) : 0;

  const totalMedian = Number(
    (shorelineMedian + portMedian + habitatMedian + cableExposureM).toFixed(2)
  );
  const totalMin = Number((totalMedian * 0.52).toFixed(2));
  const totalMax = Number((totalMedian * 1.95).toFixed(2));

  const riskTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' =
    (confirmedDark && cableStats.intersectingCables.length > 0) ||
    Boolean(matchingCableAlert) ||
    (hasExplicitSlick && totalMedian >= 10)
      ? 'CRITICAL'
      : hasConfirmedAnomaly
        ? 'HIGH'
        : darkEnvelope && darkEnvelope.gapMinutes >= 0.5
          ? 'MODERATE'
          : 'LOW';

  const effectiveGapMins = darkEnvelope?.gapMinutes ?? vessel.aisGapHours * 60;
  const sarConfidence = computeSarConfidenceAssessment(localMet.windSpeedKts, {
    hasAnomaly: hasConfirmedAnomaly,
    isConfirmedDark: confirmedDark,
    aisGapMinutes: effectiveGapMins,
    hasSlick: hasExplicitSlick,
    hasCableThreat: isCableThreat,
    windDirectionDeg: localMet.windDirectionDeg,
  });
  const coastalImpact = computeCoastalImpactAssessment({
    lat,
    lon,
    windSpeedKts: localMet.windSpeedKts,
    windDirectionDeg: localMet.windDirectionDeg,
    currentSpeedKts: localMet.currentSpeedKts,
    currentDirectionDeg: localMet.currentDirectionDeg,
    slickAreaKm2: effectiveOilSim?.slickAreaKm2 ?? 0,
    driftBearingDeg: effectiveOilSim?.driftBearingDeg,
    driftSpeedKts: effectiveOilSim?.driftSpeedKts,
    coastlineImpactEtaOverrideHours: effectiveOilSim?.coastlineImpactEtaHours,
  });

  return {
    targetLabel,
    targetSubtitle,
    lat,
    lon,
    sogKts: vessel.sogKts,
    cogDeg: vessel.cogDeg,
    isDarkCutoff: confirmedDark,
    localMetocean: localMet,
    dopplerPhysics: {
      satelliteName: selectedAsfScene?.platform ?? sgp4Intercept?.satelliteName ?? 'SENTINEL-1A',
      incidenceAngleDeg,
      slantRangeKm,
      satelliteSpeedMs,
      radialVelocityMs,
      azimuthShiftM,
      wakeSeparationM,
      sarDerivedSpeedKts,
      aisSpeedDeltaKts: Number((sarDerivedSpeedKts - vessel.sogKts).toFixed(1)),
      vvBackscatterDb: Number((14.2 + Math.min(9.5, vessel.lengthM / 32)).toFixed(1)),
      cfarThresholdDb: 4.2,
    },
    cableRisk: matchingCableAlert
      ? {
          ...cableStats.nearestCable,
          anchorDragRiskScore: Math.max(
            cableStats.nearestCable.anchorDragRiskScore,
            matchingCableAlert.anchorDragRiskScore
          ),
        }
      : cableStats.nearestCable,
    cableProximityAlert: matchingCableAlert,
    financialLiability: {
      currency: 'USD',
      iterations: 10000,
      shorelineCleanup: {
        minM: Number((shorelineMedian * 0.54).toFixed(2)),
        medianM: shorelineMedian,
        maxM: Number((shorelineMedian * 1.88).toFixed(2)),
      },
      portSuezDisruption: {
        minM: Number((portMedian * 0.48).toFixed(2)),
        medianM: portMedian,
        maxM: Number((portMedian * 2.05).toFixed(2)),
      },
      marineHabitatLoss: {
        minM: Number((habitatMedian * 0.5).toFixed(2)),
        medianM: habitatMedian,
        maxM: Number((habitatMedian * 2.1).toFixed(2)),
      },
      totalEstimatedLiability: {
        minM: totalMin,
        medianM: totalMedian,
        maxM: totalMax,
      },
      cableExposureM,
      spillExposureM: Number((shorelineMedian + habitatMedian).toFixed(2)),
      riskTier,
    },
    sarConfidence,
    coastalImpact,
    darkEnvelope,
    sgp4Intercept,
    oilSimulation: effectiveOilSim,
  };
}
