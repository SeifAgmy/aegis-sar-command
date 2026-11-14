import {
  AsfSarScene,
  HistoricalHourlyWeather,
  HistoricalReplayState,
  HistoricalScenarioMeta,
  HistoricalTimelinePayload,
  HistoricalTrackPoint,
  LatLngPoint,
  ScenarioId,
  Vessel,
} from '../types/telemetry';

export const HISTORICAL_SCENARIOS: HistoricalScenarioMeta[] = [
  {
    id: '2019-05-21',
    caseId: 'alexandria_2019_05_21',
    dateStr: '2019-05-21',
    label: '2019-05-21 // Alexandria Port Longitudinal Discharge',
    shortLabel: '2019-05-21 · Alexandria Discharge',
    lat: 31.23,
    lon: 29.86,
    zoomTarget: 10,
    spillAreaKm2: 14.8,
    estimatedBarrels: 410,
    oilType: 'Heavy Bilge / Fuel Oil',
    platformHint: 'SENTINEL-1A (C-BAND)',
    suspectVesselName: 'MT NILE HORIZON',
    suspectMmsi: '636019412',
    suspectImo: '9418207',
    suspectFlag: 'LR',
    suspectType: 'Tanker',
    description:
      'Longitudinal bilge & bunker discharge detected offshore Alexandria Western Harbor approach.',
  },
  {
    id: '2021-12-26',
    caseId: 'suez_2021_12_26',
    dateStr: '2021-12-26',
    label: '2021-12-26 // Suez Canal NW Entrance Slick',
    shortLabel: '2021-12-26 · Suez NW Slick',
    lat: 31.38,
    lon: 32.25,
    zoomTarget: 10,
    spillAreaKm2: 18.4,
    estimatedBarrels: 580,
    oilType: 'Arabian Medium Crude',
    platformHint: 'SENTINEL-1A (C-BAND)',
    suspectVesselName: 'MT RED SEA VANGUARD',
    suspectMmsi: '355041982',
    suspectImo: '9391145',
    suspectFlag: 'PA',
    suspectType: 'Tanker',
    description:
      'AIS-dark northbound tanker slick imaged NW of Port Said / Suez Canal entrance.',
  },
  {
    id: '2015-04-19',
    caseId: 'portsaid_2015_04_19',
    dateStr: '2015-04-19',
    label: '2015-04-19 // Port Said Approach Major Spill (24.15 km²)',
    shortLabel: '2015-04-19 · Port Said (24.15 km²)',
    lat: 31.42,
    lon: 32.35,
    zoomTarget: 10,
    spillAreaKm2: 24.15,
    estimatedBarrels: 820,
    oilType: 'Crude Cargo Washings',
    platformHint: 'SENTINEL-1A (C-BAND)',
    suspectVesselName: 'MT LEVANT TRADER',
    suspectMmsi: '538007124',
    suspectImo: '9304821',
    suspectFlag: 'MH',
    suspectType: 'Tanker',
    description:
      'Major 24.15 km² surface oil plume mapped across the Port Said anchorage corridor.',
  },
  {
    id: '2014-10-04',
    caseId: 'suez_2014_10_04',
    dateStr: '2014-10-04',
    label: '2014-10-04 // Suez Northern Corridor Slick (26.41 km²)',
    shortLabel: '2014-10-04 · Suez Corridor (26.41 km²)',
    lat: 31.45,
    lon: 32.3,
    zoomTarget: 10,
    spillAreaKm2: 26.41,
    estimatedBarrels: 940,
    oilType: 'Heavy Fuel Oil (IFO-380)',
    platformHint: 'SENTINEL-1A (C-BAND)',
    suspectVesselName: 'MT PELUSIUM STAR',
    suspectMmsi: '249014882',
    suspectImo: '9277410',
    suspectFlag: 'MT',
    suspectType: 'Tanker',
    description:
      '26.41 km² elongated oil slick tracked along the Suez Northern Approach TSS.',
  },
  {
    id: '2004-06-15',
    caseId: 'sidikerir_2004_06_15',
    dateStr: '2004-06-15',
    label: '2004-06-15 // Sidi Kerir Terminal Leak (Good Hope)',
    shortLabel: '2004-06-15 · Sidi Kerir (Good Hope)',
    lat: 31.1,
    lon: 29.61,
    zoomTarget: 10,
    spillAreaKm2: 19.6,
    estimatedBarrels: 670,
    oilType: 'SUMED Crude Transfer',
    platformHint: 'ENVISAT ASAR (C-BAND)',
    suspectVesselName: 'MT GOOD HOPE',
    suspectMmsi: '636011004',
    suspectImo: '9184420',
    suspectFlag: 'LR',
    suspectType: 'Tanker',
    description:
      'Historical crude leak near SUMED Sidi Kerir offshore SPM loading terminal.',
  },
];

export interface ScenarioDropdownOption {
  id: ScenarioId;
  label: string;
  shortLabel: string;
  coordsLabel?: string;
}

export const SCENARIO_OPTIONS: ScenarioDropdownOption[] = [
  {
    id: 'live',
    label: 'LIVE REAL-TIME COMMAND',
    shortLabel: 'LIVE REAL-TIME COMMAND',
  },
  ...HISTORICAL_SCENARIOS.map((s) => ({
    id: s.id,
    label: s.label,
    shortLabel: s.shortLabel,
    coordsLabel: `${s.lat.toFixed(2)}°N, ${s.lon.toFixed(2)}°E`,
  })),
];

export function getHistoricalScenarioMeta(
  scenarioId: ScenarioId
): HistoricalScenarioMeta | undefined {
  if (scenarioId === 'live') return undefined;
  return HISTORICAL_SCENARIOS.find((s) => s.id === scenarioId);
}

const KTS_TO_KMH = 1.852;

function destinationPoint(origin: LatLngPoint, bearingDeg: number, distanceKm: number): LatLngPoint {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (Math.cos(rad) * distanceKm) / 111.32;
  const cosLat = Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180));
  const dLon = (Math.sin(rad) * distanceKm) / (111.32 * cosLat);
  return {
    lat: Number((origin.lat + dLat).toFixed(5)),
    lon: Number((origin.lon + dLon).toFixed(5)),
  };
}

function seededOffset(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

export function formatMinuteUtc(minuteOfDay: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.floor(minuteOfDay)));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export async function fetchHistoricalScenario(
  dateStr: Exclude<ScenarioId, 'live'>
): Promise<HistoricalTimelinePayload> {
  const meta = getHistoricalScenarioMeta(dateStr);
  const caseId = meta?.caseId ?? dateStr;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 22000);
  try {
    const res = await fetch(`/api/historical/${encodeURIComponent(caseId)}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as HistoricalTimelinePayload;
  } finally {
    window.clearTimeout(timer);
  }
}

function getWeatherAtMinute(
  hourly: HistoricalHourlyWeather[],
  minuteOfDay: number
): HistoricalHourlyWeather {
  const hour = Math.max(0, Math.min(23, Math.floor(minuteOfDay / 60)));
  const found = hourly.find((h) => h.hourUtc === hour) ?? hourly[hour] ?? hourly[0];
  if (found) return found;
  return {
    hourUtc: hour,
    timeIso: `0000-00-00T${String(hour).padStart(2, '0')}:00:00Z`,
    windSpeedKts: 12,
    windSpeedMs: 6.2,
    windDirectionDeg: 315,
    windDirectionCardinal: 'NW',
  };
}

function getTrackPointAtMinute(
  track: HistoricalTrackPoint[],
  minuteOfDay: number
): HistoricalTrackPoint {
  const clamped = Math.max(0, Math.min(1439, Math.floor(minuteOfDay)));
  return track[clamped] ?? track[track.length - 1];
}

/**
 * Evaluates the synchronized 24-hour historical replay state at an exact minute (00:00..23:59 UTC):
 *  - Phase 1 (< darkCutoffMinute): Live AIS track motion
 *  - Phase 2 (darkCutoffMinute .. primaryPassMinute - 1): Vessel locked at LKP, expanding
 *    cyan Search Cone & Reachability Circle projected forward to the real ASF SAR pass time
 *  - Phase 3 (>= primaryPassMinute): Illuminates real NASA ASF SAR Swath(s), reveals SAR backscatter
 *    oil anomaly inside the cone, and advects the Oil Drift Ensemble with Open-Meteo hourly wind.
 */
export function evaluateHistoricalReplayAtMinute(
  payload: HistoricalTimelinePayload,
  minuteOfDay: number
): HistoricalReplayState {
  const clampedMinute = Math.max(0, Math.min(1439, Math.floor(minuteOfDay)));
  const currentWeather = getWeatherAtMinute(payload.hourlyWeather, clampedMinute);
  const darkMin = payload.darkDropoutMinute;
  const passMin = payload.primaryPassMinute;

  const phase: HistoricalReplayState['phase'] =
    clampedMinute < darkMin
      ? 'PRE_DROPOUT'
      : clampedMinute < passMin
        ? 'DARK_SEARCH_ACTIVE'
        : 'SAR_PASS_ILLUMINATED';

  const sarSwathIlluminated = clampedMinute >= passMin;
  const sarPassCountdownSeconds = Math.max(0, (passMin - clampedMinute) * 60);

  // Suspect vessel & ambient fleet positions at this exact minute
  let suspectTrackHistory: LatLngPoint[] = [];
  let suspectDarkCone: HistoricalReplayState['suspectDarkCone'] = null;

  const vesselsAtMinute: Vessel[] = payload.vessels.map((vDef) => {
    const ptNow = getTrackPointAtMinute(vDef.trackByMinute, clampedMinute);
    const isSuspectDarkNow =
      vDef.isSuspect && vDef.darkCutoffMinute !== null && clampedMinute >= vDef.darkCutoffMinute;

    // If suspect went dark, freeze reported AIS marker at LKP; keep true unbroadcasted track for SAR physics
    const lkpPt =
      isSuspectDarkNow && vDef.darkCutoffMinute !== null
        ? getTrackPointAtMinute(vDef.trackByMinute, Math.max(0, vDef.darkCutoffMinute - 1))
        : ptNow;

    if (vDef.isSuspect) {
      const endHistMin = isSuspectDarkNow && vDef.darkCutoffMinute !== null
        ? Math.max(0, vDef.darkCutoffMinute - 1)
        : clampedMinute;
      for (let m = 0; m <= endHistMin; m += 15) {
        const hp = getTrackPointAtMinute(vDef.trackByMinute, m);
        suspectTrackHistory.push({ lat: hp.lat, lon: hp.lon });
      }
      suspectTrackHistory.push({ lat: lkpPt.lat, lon: lkpPt.lon });

      if (isSuspectDarkNow && vDef.darkCutoffMinute !== null) {
        const deltaTToPassMin = Math.max(15, passMin - vDef.darkCutoffMinute);
        const elapsedDarkMin = Math.max(1, clampedMinute - vDef.darkCutoffMinute);
        // Project reachability radius dynamically toward the real SAR pass timestamp
        const effectiveHorizonHours =
          (clampedMinute < passMin ? deltaTToPassMin : elapsedDarkMin) / 60;
        const maxSpeedKts = 16.5;
        const reachabilityRadiusKm = Number(
          Math.max(2.5, Math.min(85, maxSpeedKts * KTS_TO_KMH * effectiveHorizonHours)).toFixed(2)
        );

        // Build 360° circle polygon
        const circlePolygon: LatLngPoint[] = Array.from({ length: 48 }, (_, idx) =>
          destinationPoint({ lat: lkpPt.lat, lon: lkpPt.lon }, (idx / 48) * 360, reachabilityRadiusKm)
        );

        // Build asymmetrical forward Search Cone weighted toward heading + East Med corridor
        const drDistKm = Math.min(
          reachabilityRadiusKm * 0.92,
          Math.max(lkpPt.sogKts, 8.5) * KTS_TO_KMH * effectiveHorizonHours
        );
        const projectedCenter = destinationPoint(
          { lat: lkpPt.lat, lon: lkpPt.lon },
          lkpPt.headingDeg,
          drDistKm
        );
        const halfSpreadDeg = Math.min(38, 20 + effectiveHorizonHours * 3.5);
        const coneArcSteps = 18;
        const forwardConePolygon: LatLngPoint[] = [{ lat: lkpPt.lat, lon: lkpPt.lon }];
        for (let i = 0; i <= coneArcSteps; i++) {
          const frac = i / coneArcSteps;
          const ang = lkpPt.headingDeg - halfSpreadDeg + 2 * halfSpreadDeg * frac;
          const taper = 1 - 0.1 * Math.abs(frac * 2 - 1);
          forwardConePolygon.push(
            destinationPoint({ lat: lkpPt.lat, lon: lkpPt.lon }, ang, reachabilityRadiusKm * taper)
          );
        }

        suspectDarkCone = {
          lkpLat: lkpPt.lat,
          lkpLon: lkpPt.lon,
          reachabilityRadiusKm,
          circlePolygon,
          forwardConePolygon,
          drCenterLine: [
            { lat: lkpPt.lat, lon: lkpPt.lon },
            projectedCenter,
          ],
          projectedCenterLat: projectedCenter.lat,
          projectedCenterLon: projectedCenter.lon,
          deltaTMinutesToPass: deltaTToPassMin,
          elapsedDarkMinutes: elapsedDarkMin,
          targetPassUtc: payload.primaryPassUtc,
        };
      }
    }

    const aisGapHours =
      isSuspectDarkNow && vDef.darkCutoffMinute !== null
        ? Number(((clampedMinute - vDef.darkCutoffMinute) / 60).toFixed(2))
        : 0;

    return {
      id: vDef.id,
      mmsi: vDef.mmsi,
      imo: vDef.imo,
      name: vDef.name,
      flag: vDef.flag,
      vesselType: vDef.vesselType,
      lengthM: vDef.lengthM,
      beamM: vDef.beamM,
      draftM: vDef.draftM,
      lat: lkpPt.lat,
      lon: lkpPt.lon,
      sogKts: lkpPt.sogKts,
      cogDeg: lkpPt.cogDeg,
      headingDeg: lkpPt.headingDeg,
      status: isSuspectDarkNow ? 'dark' : 'legal',
      aisLastSeenUtc: `${payload.dateStr}T${formatMinuteUtc(
        isSuspectDarkNow && vDef.darkCutoffMinute !== null ? vDef.darkCutoffMinute : clampedMinute
      )}:00Z`,
      aisGapHours,
      coverageNeighborsCount: payload.vessels.length - 1,
      nearestCableName: payload.scenario.lon < 31 ? 'SEA-ME-WE 5' : 'FLAG Europe-Asia',
      nearestCableDistanceKm: vDef.isSuspect ? 3.4 : 11.2,
      isLiveAis: false,
    };
  });

  // Backscatter overlay bounds centered on the slick at SAR pass time
  const backscatterBounds: [[number, number], [number, number]] | null = sarSwathIlluminated
    ? [
        [payload.slickOrigin.lat - 0.16, payload.slickOrigin.lon - 0.28],
        [payload.slickOrigin.lat + 0.16, payload.slickOrigin.lon + 0.28],
      ]
    : null;

  // Oil Drift Ensemble driven by ACTUAL Open-Meteo hourly wind vectors from SAR pass -> 23:59 UTC
  let oilDrift: HistoricalReplayState['oilDrift'] = null;
  if (sarSwathIlluminated) {
    // Integrate 3.2% windage + 0.35 kt Med-East coastal current hour-by-hour from SAR Pass -> clampedMinute
    const releaseMin = passMin;
    let slickCenter: LatLngPoint = { ...payload.slickOrigin };
    const backtrackPath: LatLngPoint[] = [{ ...payload.slickOrigin }];

    const stepMinutes = 15;
    for (let m = releaseMin + stepMinutes; m <= clampedMinute; m += stepMinutes) {
      const w = getWeatherAtMinute(payload.hourlyWeather, m);
      const windToDeg = (w.windDirectionDeg + 180) % 360;
      const windToRad = (windToDeg * Math.PI) / 180;
      const currentDeg = 108; // Typical Eastern Med eastward coastal current
      const currRad = (currentDeg * Math.PI) / 180;

      const windDriftKts = w.windSpeedKts * 0.032; // 3.2% windage leeway
      const currDriftKts = 0.35;
      const dtHours = stepMinutes / 60;

      const uKm =
        (Math.sin(windToRad) * windDriftKts + Math.sin(currRad) * currDriftKts) *
        KTS_TO_KMH *
        dtHours;
      const vKm =
        (Math.cos(windToRad) * windDriftKts + Math.cos(currRad) * currDriftKts) *
        KTS_TO_KMH *
        dtHours;

      const cosLat = Math.max(0.2, Math.cos((slickCenter.lat * Math.PI) / 180));
      slickCenter = {
        lat: Number((slickCenter.lat + vKm / 111.32).toFixed(5)),
        lon: Number((slickCenter.lon + uKm / (111.32 * cosLat)).toFixed(5)),
      };
      backtrackPath.push(slickCenter);
    }

    // Forward trajectory through 23:59 UTC
    const forwardTrajectory: LatLngPoint[] = [slickCenter];
    let fwdPt: LatLngPoint = { ...slickCenter };
    for (let m = clampedMinute; m <= 1439; m += 30) {
      const w = getWeatherAtMinute(payload.hourlyWeather, m);
      const windToRad = (((w.windDirectionDeg + 180) % 360) * Math.PI) / 180;
      const currRad = (108 * Math.PI) / 180;
      const dtHours = 0.5;
      const uKm =
        (Math.sin(windToRad) * (w.windSpeedKts * 0.032) + Math.sin(currRad) * 0.35) *
        KTS_TO_KMH *
        dtHours;
      const vKm =
        (Math.cos(windToRad) * (w.windSpeedKts * 0.032) + Math.cos(currRad) * 0.35) *
        KTS_TO_KMH *
        dtHours;
      const cosLat = Math.max(0.2, Math.cos((fwdPt.lat * Math.PI) / 180));
      fwdPt = {
        lat: Number((fwdPt.lat + vKm / 111.32).toFixed(5)),
        lon: Number((fwdPt.lon + uKm / (111.32 * cosLat)).toFixed(5)),
      };
      forwardTrajectory.push(fwdPt);
    }

    const driftBearingDeg = (currentWeather.windDirectionDeg + 180) % 360;
    const windContrib = Number((currentWeather.windSpeedKts * 0.032).toFixed(2));
    const totalDriftKts = Number((windContrib + 0.35).toFixed(2));
    const hoursSincePass = Math.max(0, (clampedMinute - passMin) / 60);
    const spreadKm = 2.2 + hoursSincePass * 0.75;

    const particles = Array.from({ length: 34 }, (_, idx) => {
      const alongKm = seededOffset(idx * 3 + 1) * spreadKm * 1.8;
      const crossKm = seededOffset(idx * 7 + 5) * spreadKm * 0.68;
      const rad = (driftBearingDeg * Math.PI) / 180;
      const dLat = (Math.cos(rad) * alongKm - Math.sin(rad) * crossKm) / 111.32;
      const cosLat = Math.max(0.2, Math.cos((slickCenter.lat * Math.PI) / 180));
      const dLon = (Math.sin(rad) * alongKm + Math.cos(rad) * crossKm) / (111.32 * cosLat);
      return {
        lat: slickCenter.lat + dLat,
        lon: slickCenter.lon + dLon,
        weight: 0.45 + Math.abs(seededOffset(idx + 17)) * 0.55,
        radiusM: 210 + hoursSincePass * 35,
      };
    });

    const hullVertices = 14;
    const rad = (driftBearingDeg * Math.PI) / 180;
    const cosLat = Math.max(0.2, Math.cos((slickCenter.lat * Math.PI) / 180));
    const slickPolygon: LatLngPoint[] = Array.from({ length: hullVertices }, (_, idx) => {
      const theta = (idx / hullVertices) * Math.PI * 2;
      const wobble = 1 + 0.24 * Math.sin(theta * 3 + hoursSincePass * 0.25);
      const alongKm = Math.cos(theta) * spreadKm * 1.45 * wobble;
      const crossKm = Math.sin(theta) * spreadKm * 0.55 * wobble;
      const dLat = (Math.cos(rad) * alongKm - Math.sin(rad) * crossKm) / 111.32;
      const dLon = (Math.sin(rad) * alongKm + Math.cos(rad) * crossKm) / (111.32 * cosLat);
      return {
        lat: slickCenter.lat + dLat,
        lon: slickCenter.lon + dLon,
      };
    });

    const coneReachKm = Math.max(4.5, (1439 - clampedMinute) / 60 * totalDriftKts * KTS_TO_KMH + 3.5);
    const forwardConePolygon: LatLngPoint[] = [
      slickCenter,
      destinationPoint(slickCenter, driftBearingDeg - 22, coneReachKm),
      destinationPoint(slickCenter, driftBearingDeg, coneReachKm * 1.12),
      destinationPoint(slickCenter, driftBearingDeg + 22, coneReachKm),
    ];

    const impactTarget = forwardTrajectory[forwardTrajectory.length - 1] ?? slickCenter;
    oilDrift = {
      id: `hist-${payload.dateStr}`,
      sourceLabel: `${payload.scenario.suspectVesselName} (${payload.dateStr})`,
      anchorType: 'vessel',
      originLat: payload.slickOrigin.lat,
      originLon: payload.slickOrigin.lon,
      originTimeUtc: `${payload.dateStr}T${formatMinuteUtc(releaseMin)}:00Z`,
      releaseHoursAgo: Number(((clampedMinute - releaseMin) / 60).toFixed(1)),
      currentCenterLat: slickCenter.lat,
      currentCenterLon: slickCenter.lon,
      impactLat: impactTarget.lat,
      impactLon: impactTarget.lon,
      impactZoneName:
        payload.scenario.lon < 31 ? 'Alexandria / Abu Qir Coast' : 'Port Said / Sinai Shoreline',
      coastlineImpactEtaHours: Number(Math.max(1, (1439 - clampedMinute) / 60).toFixed(1)),
      driftBearingDeg,
      driftSpeedKts: totalDriftKts,
      windContributionKts: windContrib,
      currentContributionKts: 0.35,
      slickAreaKm2: Number((payload.slickAreaKm2 + hoursSincePass * 0.85).toFixed(2)),
      estimatedVolumeBarrels: payload.scenario.estimatedBarrels,
      particles,
      slickPolygon,
      backtrackPath,
      forwardTrajectory,
      forwardConePolygon,
      phaseLabel: `SAR DETECTED @ ${payload.primaryPassUtc.slice(11, 16)}Z · +${hoursSincePass.toFixed(1)}h WIND DRIFT`,
    };
  }

  return {
    dateStr: payload.dateStr,
    minuteOfDay: clampedMinute,
    clockUtc: `${payload.dateStr} ${formatMinuteUtc(clampedMinute)}:00 UTC`,
    phase,
    sarPassCountdownSeconds,
    sarSwathIlluminated,
    backscatterBounds,
    currentWeather,
    vesselsAtMinute,
    suspectTrackHistory,
    suspectDarkCone,
    oilDrift,
  };
}

export function getFirstValidHistoricalQuicklook(scenes: AsfSarScene[]): AsfSarScene | undefined {
  return scenes.find((s) => Boolean(s.browseImageUrl)) ?? scenes[0];
}
