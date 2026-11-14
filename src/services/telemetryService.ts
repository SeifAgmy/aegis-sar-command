import {
  MOCK_ASF_SAR_SCENES,
  MOCK_INCIDENTS,
  MOCK_ORBITAL_PASSES,
  MOCK_SAR_SWATHS,
  MOCK_SHIPPING_LANES,
  MOCK_SUBSEA_CABLES,
  MOCK_TELEMETRY_SUMMARY,
  MOCK_VESSELS,
  MOCK_WEATHER_STATE,
} from '../data/mockScenarioData';
import {
  AsfSarScene,
  Incident,
  IncidentFilter,
  LatLngPoint,
  OrbitalPass,
  SarSwath,
  ShippingLane,
  SlickEnsembleState,
  SubseaCable,
  TelemetrySummary,
  Vessel,
  WeatherState,
} from '../types/telemetry';

export function getVessels(): Vessel[] {
  return MOCK_VESSELS;
}

export function getVesselById(id: string): Vessel | undefined {
  return MOCK_VESSELS.find((v) => v.id === id);
}

export function getIncidents(filter: IncidentFilter = 'all'): Incident[] {
  const sorted = [...MOCK_INCIDENTS].sort((a, b) => b.threatScore - a.threatScore);
  if (filter === 'all') return sorted;
  return sorted.filter((inc) => inc.category === filter);
}

export function getIncidentById(id: string): Incident | undefined {
  return MOCK_INCIDENTS.find((inc) => inc.id === id);
}

export function getWeatherState(): WeatherState {
  return MOCK_WEATHER_STATE;
}

export function getOrbitalPasses(): OrbitalPass[] {
  return MOCK_ORBITAL_PASSES;
}

export function getSubseaCables(): SubseaCable[] {
  return MOCK_SUBSEA_CABLES;
}

export function getShippingLanes(): ShippingLane[] {
  return MOCK_SHIPPING_LANES;
}

export function getSarSwaths(): SarSwath[] {
  return MOCK_SAR_SWATHS;
}

export function getTelemetrySummary(): TelemetrySummary {
  return MOCK_TELEMETRY_SUMMARY;
}

export function getFallbackAsfScenes(): AsfSarScene[] {
  return MOCK_ASF_SAR_SCENES;
}

export interface RawAsfGeoJsonFeature {
  geometry?: { type?: string; coordinates?: number[][][] | number[][][][] };
  properties?: Record<string, unknown>;
}

/**
 * Extracts browse[0] quicklook image URL and url download link
 * from NASA ASF Search API GeoJSON features.
 */
export function mapAsfGeoJsonFeatures(features: RawAsfGeoJsonFeature[]): AsfSarScene[] {
  return features
    .map((feat, idx) => {
      const props = feat.properties ?? {};
      const sceneName = String(props.sceneName ?? props.fileID ?? `ASF-SAR-${idx + 1}`);
      const platformRaw = String(props.platform ?? 'SENTINEL-1').toUpperCase();
      const isNisar = platformRaw.includes('NISAR');
      const bandLabel: AsfSarScene['bandLabel'] = isNisar
        ? 'L-BAND (NISAR)'
        : 'C-BAND (SENTINEL-1)';

      let ring: number[][] = [];
      if (feat.geometry?.type === 'Polygon' && Array.isArray(feat.geometry.coordinates)) {
        ring = (feat.geometry.coordinates[0] as number[][]) ?? [];
      } else if (
        feat.geometry?.type === 'MultiPolygon' &&
        Array.isArray(feat.geometry.coordinates)
      ) {
        ring = ((feat.geometry.coordinates[0] as number[][][])?.[0] as number[][]) ?? [];
      }

      const footprintCoords: LatLngPoint[] = ring
        .filter((pt) => Array.isArray(pt) && pt.length >= 2)
        .map((pt) => ({ lat: Number(pt[1]), lon: Number(pt[0]) }));

      const browseArr = props.browse;
      const rawBrowseUrl =
        Array.isArray(browseArr) && typeof browseArr[0] === 'string'
          ? browseArr[0]
          : typeof browseArr === 'string'
            ? browseArr
            : undefined;
      const browseImageUrl = rawBrowseUrl
        ? `/api/telemetry/asf-quicklook?url=${encodeURIComponent(rawBrowseUrl)}`
        : undefined;

      const downloadUrl = typeof props.url === 'string' ? props.url : undefined;

      const fileId = String(props.fileID ?? sceneName);
      return {
        id: `asf-live-${idx}-${fileId}`,
        sceneName,
        platform: platformRaw,
        bandLabel,
        beamMode: String(props.beamModeType ?? 'IW'),
        polarization: String(props.polarization ?? 'VV+VH'),
        startTimeUtc: String(props.startTime ?? new Date().toISOString()),
        flightDirection: String(props.flightDirection ?? 'DESCENDING'),
        footprintCoords,
        browseImageUrl,
        downloadUrl,
        isLiveData: true,
      };
    })
    .filter((s) => s.footprintCoords.length >= 3)
    .sort((a, b) => {
      const browseScore = Number(Boolean(b.browseImageUrl)) - Number(Boolean(a.browseImageUrl));
      if (browseScore !== 0) return browseScore;
      const aMeta = a.id.includes('METADATA_') ? 1 : 0;
      const bMeta = b.id.includes('METADATA_') ? 1 : 0;
      return aMeta - bMeta;
    });
}

/**
 * Smoothly advances ambient simulated Mediterranean vessels along their heading vectors
 * every tick so maritime traffic visibly moves across Suez and Alexandria lanes.
 */
export function advanceSimulatedVessels(vessels: Vessel[], visualScaleSec = 18): Vessel[] {
  return vessels.map((v) => {
    if (v.incidentId || v.isLiveAis || v.sogKts <= 0.2) return v;

    const distNm = (v.sogKts * visualScaleSec) / 3600;
    const distKm = distNm * 1.852;
    const rad = (v.headingDeg * Math.PI) / 180;
    const dLat = (Math.cos(rad) * distKm) / 111.32;
    const dLon = (Math.sin(rad) * distKm) / (111.32 * Math.cos((v.lat * Math.PI) / 180));

    let nextLat = v.lat + dLat;
    let nextLon = v.lon + dLon;

    // Wrap cleanly inside Med-East shipping corridor if vessel exits bounds
    if (nextLon > 32.65) nextLon = 29.55;
    if (nextLon < 29.45) nextLon = 32.55;
    if (nextLat > 32.35) nextLat = 31.38;
    if (nextLat < 31.28) nextLat = 32.15;

    return {
      ...v,
      lat: Number(nextLat.toFixed(5)),
      lon: Number(nextLon.toFixed(5)),
      aisLastSeenUtc: new Date().toISOString(),
    };
  });
}

function interpolateTrack(
  track: Array<LatLngPoint & { offsetHours: number }>,
  targetOffsetHours: number
): { position: LatLngPoint; headingDeg: number } {
  if (track.length === 0) {
    return { position: { lat: 31.5, lon: 30.2 }, headingDeg: 90 };
  }
  if (targetOffsetHours <= track[0].offsetHours) {
    return {
      position: { lat: track[0].lat, lon: track[0].lon },
      headingDeg: computeBearing(track[0], track[1] ?? track[0]),
    };
  }
  if (targetOffsetHours >= track[track.length - 1].offsetHours) {
    const last = track[track.length - 1];
    const prev = track[track.length - 2] ?? last;
    return {
      position: { lat: last.lat, lon: last.lon },
      headingDeg: computeBearing(prev, last),
    };
  }

  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (targetOffsetHours >= a.offsetHours && targetOffsetHours <= b.offsetHours) {
      const span = b.offsetHours - a.offsetHours || 1;
      const t = (targetOffsetHours - a.offsetHours) / span;
      return {
        position: {
          lat: a.lat + (b.lat - a.lat) * t,
          lon: a.lon + (b.lon - a.lon) * t,
        },
        headingDeg: computeBearing(a, b),
      };
    }
  }
  return { position: { lat: track[0].lat, lon: track[0].lon }, headingDeg: 90 };
}

function computeBearing(a: LatLngPoint, b: LatLngPoint): number {
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

// Deterministic pseudo-random helper for repeatable multi-particle Lagrangian ensembles
function seededOffset(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/**
 * Computes dynamic Lagrangian oil slick ensemble, vessel backtrack path,
 * and forward coastal search cone at any timeline offset [-48h .. +24h].
 */
export function getSlickEnsembleAtOffset(
  incidentId: string,
  timeOffsetHours: number,
  liveWeather?: WeatherState
): SlickEnsembleState | null {
  const incident = getIncidentById(incidentId);
  if (!incident) return null;

  const vessel = getVesselById(incident.primaryVesselId);
  const track = vessel?.trackHistory ?? [
    { lat: incident.lat, lon: incident.lon, offsetHours: -48 },
    { lat: incident.lat, lon: incident.lon, offsetHours: 0 },
    { lat: incident.lat, lon: incident.lon, offsetHours: 24 },
  ];

  const { position: vesselPositionAtTime, headingDeg: vesselHeadingAtTime } = interpolateTrack(
    track,
    timeOffsetHours
  );

  // Build backtrack path up to current scrubber time
  const backtrackSteps = 16;
  const startBack = -48;
  const endBack = Math.min(0, timeOffsetHours);
  const backtrackPath: LatLngPoint[] = [];
  if (endBack >= startBack) {
    for (let i = 0; i <= backtrackSteps; i++) {
      const h = startBack + ((endBack - startBack) * i) / backtrackSteps;
      backtrackPath.push(interpolateTrack(track, h).position);
    }
  }

  // Forward projection path from T=0 to T=+24h
  const forwardTrajectory: LatLngPoint[] = [];
  for (let h = 0; h <= 24; h += 4) {
    forwardTrajectory.push(interpolateTrack(track, h).position);
  }

  let phaseLabel = 'T=0 SAR DETECTION SNAPSHOT';
  if (timeOffsetHours < -0.5) {
    phaseLabel = `HINDCAST BACKTRACK (${timeOffsetHours.toFixed(1)}h)`;
  } else if (timeOffsetHours > 0.5) {
    phaseLabel = `LAGRANGIAN FORECAST (+${timeOffsetHours.toFixed(1)}h)`;
  }

  if (!incident.driftAttribution) {
    // Non-spill incidents still return dynamic vessel position & search cone
    const coneLengthDeg = 0.04 + Math.max(0, timeOffsetHours) * 0.004;
    const rad = (vesselHeadingAtTime * Math.PI) / 180;
    const spread = 0.35;
    const searchConePolygon: LatLngPoint[] = [
      vesselPositionAtTime,
      {
        lat: vesselPositionAtTime.lat + Math.cos(rad - spread) * coneLengthDeg,
        lon: vesselPositionAtTime.lon + Math.sin(rad - spread) * coneLengthDeg,
      },
      {
        lat: vesselPositionAtTime.lat + Math.cos(rad) * coneLengthDeg * 1.15,
        lon: vesselPositionAtTime.lon + Math.sin(rad) * coneLengthDeg * 1.15,
      },
      {
        lat: vesselPositionAtTime.lat + Math.cos(rad + spread) * coneLengthDeg,
        lon: vesselPositionAtTime.lon + Math.sin(rad + spread) * coneLengthDeg,
      },
    ];

    return {
      incidentId,
      timeOffsetHours,
      particles: [],
      slickPolygon: [],
      searchConePolygon,
      vesselPositionAtTime,
      vesselHeadingAtTime,
      backtrackPath,
      forwardTrajectory,
      phaseLabel,
    };
  }

  const drift = incident.driftAttribution;
  // Discharge occurred around T=-14h along the tanker's hidden path
  const dischargeTime = -14;
  const elapsedSinceRelease = Math.max(0.2, timeOffsetHours - dischargeTime);
  const progressAtT0 = 0 - dischargeTime; // 14 hours
  const tFactor = elapsedSinceRelease / progressAtT0; // 1.0 at T=0, ~2.7 at T=+24h, ~0.05 at T=-14h

  // Center of the oil slick moves from slickOrigin -> slickT0 -> impactLat/Lon
  let centerLat = drift.slickOriginLat;
  let centerLon = drift.slickOriginLon;

  if (timeOffsetHours <= dischargeTime) {
    // Before release, trace back tightly onto the vessel's earlier position
    const prePos = interpolateTrack(track, timeOffsetHours).position;
    centerLat = prePos.lat;
    centerLon = prePos.lon;
  } else if (timeOffsetHours <= 0) {
    const frac = (timeOffsetHours - dischargeTime) / (0 - dischargeTime);
    centerLat = drift.slickOriginLat + (drift.slickT0Lat - drift.slickOriginLat) * frac;
    centerLon = drift.slickOriginLon + (drift.slickT0Lon - drift.slickOriginLon) * frac;
  } else {
    const frac = Math.min(1.15, timeOffsetHours / 24);
    centerLat = drift.slickT0Lat + (drift.impactLat - drift.slickT0Lat) * frac;
    centerLon = drift.slickT0Lon + (drift.impactLon - drift.slickT0Lon) * frac;

    // Incorporate live Open-Meteo 3% windage leeway + surface ocean current drift modulation
    if (liveWeather && liveWeather.metoceanSource === 'OPEN_METEO_LIVE') {
      const windToDeg = (liveWeather.windDirectionDeg + 180) % 360;
      const windToRad = (windToDeg * Math.PI) / 180;
      const currRad = (liveWeather.surfaceCurrentDeg * Math.PI) / 180;
      const leewayKts = liveWeather.windSpeedKts * 0.03;
      const deltaKts = leewayKts * 0.35 + liveWeather.surfaceCurrentKts * 0.25;
      const degPerHr = (deltaKts * 1.852) / 111.32;
      centerLat +=
        (Math.cos(windToRad) * 0.5 + Math.cos(currRad) * 0.5) * degPerHr * timeOffsetHours * 0.25;
      centerLon +=
        (Math.sin(windToRad) * 0.5 + Math.sin(currRad) * 0.5) * degPerHr * timeOffsetHours * 0.25;
    }
  }

  // Spread scales dynamically with time
  const baseSpreadLat = incident.id === 'inc-01' ? 0.032 : 0.015;
  const baseSpreadLon = incident.id === 'inc-01' ? 0.044 : 0.022;
  const spreadScale = timeOffsetHours <= dischargeTime ? 0.12 : 0.25 + 0.75 * Math.min(2.1, tFactor);

  // Wind/current elongation axis
  const effectiveBearingDeg =
    liveWeather && liveWeather.metoceanSource === 'OPEN_METEO_LIVE'
      ? Math.round((drift.driftBearingDeg * 0.65 + ((liveWeather.windDirectionDeg + 180) % 360) * 0.35) % 360)
      : drift.driftBearingDeg;
  const driftRad = (effectiveBearingDeg * Math.PI) / 180;
  const particleCount = incident.id === 'inc-01' ? 38 : 20;

  const particles = Array.from({ length: particleCount }, (_, idx) => {
    const along = seededOffset(idx * 3 + 1) * 1.9;
    const cross = seededOffset(idx * 7 + 2) * 0.75;
    const dLat =
      (Math.cos(driftRad) * along - Math.sin(driftRad) * cross) * baseSpreadLat * spreadScale;
    const dLon =
      (Math.sin(driftRad) * along + Math.cos(driftRad) * cross) * baseSpreadLon * spreadScale;

    return {
      lat: centerLat + dLat,
      lon: centerLon + dLon,
      weight: 0.45 + Math.abs(seededOffset(idx + 11)) * 0.55,
      radiusM: (incident.id === 'inc-01' ? 280 : 160) * (0.6 + 0.4 * Math.min(2, spreadScale)),
    };
  });

  // Construct coherent deformed slick polygon hull around center
  const hullVertices = 14;
  const slickPolygon: LatLngPoint[] = Array.from({ length: hullVertices }, (_, idx) => {
    const theta = (idx / hullVertices) * Math.PI * 2;
    const wobble = 1 + 0.28 * Math.sin(theta * 3 + timeOffsetHours * 0.08) + 0.15 * Math.cos(theta * 2);
    const localAlong = Math.cos(theta) * 1.45 * wobble;
    const localCross = Math.sin(theta) * 0.58 * wobble;

    const dLat =
      (Math.cos(driftRad) * localAlong - Math.sin(driftRad) * localCross) *
      baseSpreadLat *
      spreadScale;
    const dLon =
      (Math.sin(driftRad) * localAlong + Math.cos(driftRad) * localCross) *
      baseSpreadLon *
      spreadScale;

    return {
      lat: centerLat + dLat,
      lon: centerLon + dLon,
    };
  });

  // Forward Lagrangian uncertainty search cone expanding toward coastline
  const coneReach =
    timeOffsetHours < 0
      ? 0.06
      : 0.09 + (timeOffsetHours / 24) * (incident.id === 'inc-01' ? 0.16 : 0.1);
  const halfAngle = 0.28 + Math.max(0, timeOffsetHours / 24) * 0.16;

  const searchConePolygon: LatLngPoint[] = [
    { lat: centerLat, lon: centerLon },
    {
      lat: centerLat + Math.cos(driftRad - halfAngle) * coneReach,
      lon: centerLon + Math.sin(driftRad - halfAngle) * coneReach * 1.15,
    },
    {
      lat: centerLat + Math.cos(driftRad) * coneReach * 1.12,
      lon: centerLon + Math.sin(driftRad) * coneReach * 1.25,
    },
    {
      lat: centerLat + Math.cos(driftRad + halfAngle) * coneReach,
      lon: centerLon + Math.sin(driftRad + halfAngle) * coneReach * 1.15,
    },
  ];

  return {
    incidentId,
    timeOffsetHours,
    particles,
    slickPolygon,
    searchConePolygon,
    vesselPositionAtTime,
    vesselHeadingAtTime,
    backtrackPath,
    forwardTrajectory,
    phaseLabel,
  };
}
