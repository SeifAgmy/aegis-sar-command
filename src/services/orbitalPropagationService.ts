import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
} from 'satellite.js';
import {
  LatLngPoint,
  SatelliteGroundState,
  SatelliteTleRecord,
} from '../types/telemetry';

export const DEFAULT_SAR_TLE_CATALOG: SatelliteTleRecord[] = [
  {
    id: 'sat-s1a',
    noradId: '39634',
    name: 'SENTINEL-1A',
    bandLabel: 'C-BAND',
    color: '#00F0FF',
    tle1: '1 39634U 14016A   26316.50000000  .00000185  00000-0  49210-4 0  9992',
    tle2: '2 39634  98.1818  32.4150 0001342  89.4120 270.7210 14.59198241671423',
    isLiveTle: false,
  },
  {
    id: 'sat-s1c',
    noradId: '62261',
    name: 'SENTINEL-1C',
    bandLabel: 'C-BAND',
    color: '#38BDF8',
    tle1: '1 62261U 24235A   26316.50000000  .00000190  00000-0  48100-4 0  9997',
    tle2: '2 62261  98.1822 212.4150 0001310  90.1200 269.9800 14.59197810098412',
    isLiveTle: false,
  },
  {
    id: 'sat-nisar',
    noradId: '65053',
    name: 'NISAR-01',
    bandLabel: 'L-BAND',
    color: '#F59E0B',
    tle1: '1 65053U 25160A   26316.50000000  .00000140  00000-0  41820-4 0  9995',
    tle2: '2 65053  98.4020 148.6200 0001210  92.1040 268.0150 14.43215012068114',
    isLiveTle: false,
  },
];

// Med-East Swath Intersection Envelope (Alexandria - Port Said + 250km swath reach)
const MED_EAST_SWATH_BOX = {
  minLat: 29.8,
  maxLat: 33.8,
  minLon: 27.8,
  maxLon: 34.8,
};

export async function fetchLiveNoradTles(forceRefresh = false): Promise<{
  records: SatelliteTleRecord[];
  status: '200 OK' | 'CACHED FALLBACK';
  rawSummary: string;
}> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(
      `/api/telemetry/norad-tle${forceRefresh ? '?refresh=1' : ''}`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      status?: '200 OK' | 'CACHED FALLBACK';
      rawSummary?: string;
      records?: Array<{ noradId?: string; line1?: string; line2?: string }>;
    };

    const byNorad = new Map<string, { line1: string; line2: string }>();
    if (Array.isArray(json.records)) {
      for (const rec of json.records) {
        if (rec.noradId && typeof rec.line1 === 'string' && typeof rec.line2 === 'string') {
          byNorad.set(rec.noradId, { line1: rec.line1, line2: rec.line2 });
        }
      }
    }

    const records = DEFAULT_SAR_TLE_CATALOG.map((entry) => {
      const live = byNorad.get(entry.noradId);
      if (live) {
        return {
          ...entry,
          tle1: live.line1,
          tle2: live.line2,
          isLiveTle: true,
        };
      }
      return entry;
    });

    if (json.status === '200 OK' && byNorad.size > 0) {
      return {
        records,
        status: '200 OK',
        rawSummary:
          json.rawSummary ||
          `${byNorad.size} live NORAD TLEs (${Array.from(byNorad.keys()).join(', ')})`,
      };
    }

    return {
      records,
      status: 'CACHED FALLBACK',
      rawSummary: json.rawSummary || '3 cached orbital TLEs (39634, 62261, NISAR)',
    };
  } catch {
    return {
      records: DEFAULT_SAR_TLE_CATALOG,
      status: 'CACHED FALLBACK',
      rawSummary: '3 cached orbital TLEs (39634, 62261, NISAR)',
    };
  } finally {
    window.clearTimeout(timer);
  }
}

function propagateAtDate(
  satrec: ReturnType<typeof twoline2satrec>,
  date: Date
): { lat: number; lon: number; altitudeKm: number; velocityKmS: number } | null {
  try {
    const pv = propagate(satrec, date);
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;

    const gmst = gstime(date);
    const geodetic = eciToGeodetic(pv.position, gmst);
    const lat = degreesLat(geodetic.latitude);
    const lon = degreesLong(geodetic.longitude);

    let velocityKmS = 7.5;
    if (pv.velocity && typeof pv.velocity !== 'boolean') {
      velocityKmS = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
    }

    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

    return {
      lat,
      lon,
      altitudeKm: geodetic.height,
      velocityKmS,
    };
  } catch {
    return null;
  }
}

function splitAntimeridianSegments(points: LatLngPoint[]): LatLngPoint[][] {
  if (points.length === 0) return [];
  const segments: LatLngPoint[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (Math.abs(curr.lon - prev.lon) > 180) {
      segments.push([curr]);
    } else {
      segments[segments.length - 1].push(curr);
    }
  }
  return segments;
}

export function propagateSarSatellites(
  referenceDate: Date = new Date(),
  catalog: SatelliteTleRecord[] = DEFAULT_SAR_TLE_CATALOG
): SatelliteGroundState[] {
  return catalog.map((entry) => {
    const satrec = twoline2satrec(entry.tle1, entry.tle2);
    const nowPos = propagateAtDate(satrec, referenceDate) ?? {
      lat: 31.6,
      lon: 30.8,
      altitudeKm: 693,
      velocityKmS: 7.5,
    };

    // Build ground track (-15 min to +25 min in 60-second steps)
    const rawTrack: LatLngPoint[] = [];
    for (let offsetSec = -15 * 60; offsetSec <= 25 * 60; offsetSec += 60) {
      const sampleDate = new Date(referenceDate.getTime() + offsetSec * 1000);
      const pos = propagateAtDate(satrec, sampleDate);
      if (pos) {
        rawTrack.push({ lat: pos.lat, lon: pos.lon });
      }
    }

    // Scan forward up to 24h in 60s steps to find next Med-East SAR swath pass
    let nextPassSeconds = 4 * 3600 + 18 * 60;
    let foundPass = false;
    for (let sec = 60; sec <= 24 * 3600; sec += 60) {
      const future = new Date(referenceDate.getTime() + sec * 1000);
      const pos = propagateAtDate(satrec, future);
      if (
        pos &&
        pos.lat >= MED_EAST_SWATH_BOX.minLat &&
        pos.lat <= MED_EAST_SWATH_BOX.maxLat &&
        pos.lon >= MED_EAST_SWATH_BOX.minLon &&
        pos.lon <= MED_EAST_SWATH_BOX.maxLon
      ) {
        nextPassSeconds = sec;
        foundPass = true;
        break;
      }
    }

    const nextPassDate = new Date(
      referenceDate.getTime() + (foundPass ? nextPassSeconds : 4 * 3600 + 18 * 60) * 1000
    );

    return {
      id: entry.id,
      noradId: entry.noradId,
      name: entry.name,
      bandLabel: entry.bandLabel,
      color: entry.color,
      lat: nowPos.lat,
      lon: nowPos.lon,
      altitudeKm: nowPos.altitudeKm,
      velocityKmS: nowPos.velocityKmS,
      nextPassSeconds,
      nextPassTimeUtc: nextPassDate.toISOString(),
      isLiveTle: entry.isLiveTle,
      trackSegments: splitAntimeridianSegments(rawTrack),
    };
  });
}
