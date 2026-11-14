import { MOCK_ASF_SAR_SCENES, MOCK_WEATHER_STATE } from '../data/mockScenarioData';
import { mapAsfGeoJsonFeatures, RawAsfGeoJsonFeature } from './telemetryService';
import {
  AsfSarScene,
  EonetEvent,
  MetoceanBuoy,
  WeatherState,
} from '../types/telemetry';

export const EGYPT_COAST_BUOY_DEFS = [
  { id: 'buoy-alex', name: 'Alexandria Offshore Buoy', lat: 31.35, lon: 29.85 },
  { id: 'buoy-damietta', name: 'Damietta Shelf Buoy', lat: 31.65, lon: 31.8 },
  { id: 'buoy-portsaid', name: 'Port Said / Suez Approach Buoy', lat: 31.45, lon: 32.35 },
];

export const FALLBACK_METOCEAN_BUOYS: MetoceanBuoy[] = EGYPT_COAST_BUOY_DEFS.map((b, idx) => ({
  ...b,
  windSpeedKts: 13 + idx,
  windSpeedMs: Number(((13 + idx) * 0.514444).toFixed(1)),
  windDirectionDeg: 310 + idx * 5,
  windDirectionCardinal: 'NW',
  waveHeightM: Number((0.8 + idx * 0.08).toFixed(2)),
  currentSpeedKts: Number((0.95 + idx * 0.12).toFixed(2)),
  currentDirectionDeg: 108 + idx * 6,
  isLiveData: false,
  updatedUtc: MOCK_WEATHER_STATE.updatedUtc,
}));

export const FALLBACK_EONET_EVENTS: EonetEvent[] = [
  {
    id: 'eonet-fallback-med-1',
    title: 'Eastern Mediterranean Thermal Anomaly / Maritime Haze Corridor',
    category: 'Dust and Haze',
    dateUtc: '2026-11-13T11:30:00Z',
    lat: 31.88,
    lon: 30.72,
    isLiveData: false,
  },
];


export function getUtcDateOffsetIso(daysBack: number): string {
  const now = new Date();
  const target = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

export function getYesterdayIsoUtc(): string {
  return getUtcDateOffsetIso(1);
}

function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return dirs[idx];
}

export function computeSarObservabilityPct(windSpeedMs: number): number {
  if (windSpeedMs >= 3.5 && windSpeedMs <= 9.0) {
    const distFromIdeal = Math.abs(windSpeedMs - 6.2);
    return Number((97.2 - distFromIdeal * 1.4).toFixed(1));
  }
  if (windSpeedMs >= 3.0 && windSpeedMs <= 10.0) {
    return 86.5;
  }
  if (windSpeedMs < 3.0) {
    return Number(Math.max(42, 60 + windSpeedMs * 8).toFixed(1));
  }
  return Number(Math.max(38, 86 - (windSpeedMs - 10) * 6.5).toFixed(1));
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 6500): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(timer);
  }
}

function probeImageLoad(url: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };

    const timer = window.setTimeout(() => finish(false), timeoutMs);
    img.referrerPolicy = 'no-referrer';
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

/**
 * Probes NASA GIBS VIIRS True Color Mediterranean WMTS auto-latest tile (/default/default/GoogleMapsCompatible_Level9/6/26/37.jpg)
 * using new Image() (without setting crossOrigin) so onload fires cleanly and marks NASA GIBS 200 OK.
 */
export async function checkNasaGibsAvailability(): Promise<{
  status: '200 OK' | 'CACHED FALLBACK';
  rawSummary: string;
}> {
  const probeUrl =
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/6/26/37.jpg';
  const ok = await probeImageLoad(probeUrl, 6000);
  if (ok) {
    return {
      status: '200 OK',
      rawSummary: 'VIIRS SNPP Latest Mosaic',
    };
  }

  return {
    status: 'CACHED FALLBACK',
    rawSummary: 'VIIRS SNPP Latest Mosaic (fallback)',
  };
}

/**
 * Live NASA EONET v3 Earth Events via Express backend proxy (/api/telemetry/eonet).
 */
export async function fetchNasaEonetEvents(forceRefresh = false): Promise<{
  events: EonetEvent[];
  status: '200 OK' | 'CACHED FALLBACK';
  rawSummary: string;
}> {
  const url = `/api/telemetry/eonet${forceRefresh ? '?refresh=1' : ''}`;
  try {
    const json = (await fetchJsonWithTimeout(url, 12000)) as {
      status?: '200 OK' | 'CACHED FALLBACK';
      events?: EonetEvent[];
      rawSummary?: string;
    };

    if (json?.status === '200 OK' && Array.isArray(json.events) && json.events.length > 0) {
      return {
        events: json.events,
        status: '200 OK',
        rawSummary:
          json.rawSummary ||
          `${json.events.length} open events · Latest: ${json.events[0].title.slice(0, 32)}`,
      };
    }

    return {
      events: FALLBACK_EONET_EVENTS,
      status: 'CACHED FALLBACK',
      rawSummary: json?.rawSummary || 'EONET unavailable · 1 cached event',
    };
  } catch {
    return {
      events: FALLBACK_EONET_EVENTS,
      status: 'CACHED FALLBACK',
      rawSummary: 'EONET unavailable · 1 cached event',
    };
  }
}

/**
 * Live NASA ASF Search API via Express backend proxy (/api/telemetry/asf-sar).
 */
export async function fetchNasaAsfScenes(forceRefresh = false): Promise<{
  scenes: AsfSarScene[];
  status: '200 OK' | 'CACHED FALLBACK';
  rawSummary: string;
}> {
  const url = `/api/telemetry/asf-sar${forceRefresh ? '?refresh=1' : ''}`;

  try {
    const data = (await fetchJsonWithTimeout(url, 22000)) as {
      status?: '200 OK' | 'CACHED FALLBACK';
      features?: RawAsfGeoJsonFeature[];
    };

    if (
      data?.status !== '200 OK' ||
      !data?.features ||
      !Array.isArray(data.features) ||
      data.features.length === 0
    ) {
      return {
        scenes: MOCK_ASF_SAR_SCENES,
        status: 'CACHED FALLBACK',
        rawSummary: `${MOCK_ASF_SAR_SCENES.length} cached Sentinel-1/NISAR scenes`,
      };
    }

    const parsed = mapAsfGeoJsonFeatures(data.features);
    if (parsed.length > 0) {
      const quicklooks = parsed.filter((s) => Boolean(s.browseImageUrl)).length;
      return {
        scenes: parsed,
        status: '200 OK',
        rawSummary: `${parsed.length} live Med-East SAR scenes (${quicklooks} quicklooks)`,
      };
    }

    return {
      scenes: MOCK_ASF_SAR_SCENES,
      status: 'CACHED FALLBACK',
      rawSummary: `${MOCK_ASF_SAR_SCENES.length} cached Sentinel-1/NISAR scenes`,
    };
  } catch {
    return {
      scenes: MOCK_ASF_SAR_SCENES,
      status: 'CACHED FALLBACK',
      rawSummary: `${MOCK_ASF_SAR_SCENES.length} cached Sentinel-1/NISAR scenes`,
    };
  }
}

/**
 * Live NASA DONKI Geomagnetic Storm alerts + NOAA SWPC Planetary Kp Index via Express backend.
 */
export async function fetchSpaceWeatherLive(
  forceRefresh = false
): Promise<{
  weather: Pick<
    WeatherState,
    | 'kpIndex'
    | 'kpStatus'
    | 'donkiVerified'
    | 'donkiStormAlertsCount'
    | 'donkiLatestAlertTime'
    | 'kpSource'
  >;
  status: '200 OK' | 'CACHED FALLBACK';
  rawSummary: string;
}> {
  const url = `/api/telemetry/space-weather${forceRefresh ? '?refresh=1' : ''}`;

  try {
    const json = (await fetchJsonWithTimeout(url, 12000)) as {
      status?: '200 OK' | 'CACHED FALLBACK';
      rawSummary?: string;
      weather?: Pick<
        WeatherState,
        | 'kpIndex'
        | 'kpStatus'
        | 'donkiVerified'
        | 'donkiStormAlertsCount'
        | 'donkiLatestAlertTime'
        | 'kpSource'
      >;
    };

    if (json?.weather) {
      return {
        weather: json.weather,
        status: json.status === '200 OK' ? '200 OK' : 'CACHED FALLBACK',
        rawSummary:
          json.rawSummary ||
          `NOAA Kp=${json.weather.kpIndex.toFixed(1)} (${json.weather.kpStatus}) · DONKI 30d GST=${json.weather.donkiStormAlertsCount}`,
      };
    }
  } catch {
    // Fall through to fallback
  }

  return {
    weather: {
      kpIndex: MOCK_WEATHER_STATE.kpIndex,
      kpStatus: MOCK_WEATHER_STATE.kpStatus,
      donkiVerified: false,
      donkiStormAlertsCount: 0,
      kpSource: 'FALLBACK',
    },
    status: 'CACHED FALLBACK',
    rawSummary: `NOAA Kp=${MOCK_WEATHER_STATE.kpIndex.toFixed(1)} (${MOCK_WEATHER_STATE.kpStatus}) · Cached fallback`,
  };
}

/**
 * Live 3-Point Egyptian Coast Metocean Grid via Express backend proxy (/api/telemetry/metocean):
 * Alexandria (31.35, 29.85), Damietta (31.65, 31.80), Port Said / Suez (31.45, 32.35).
 */
export async function fetchThreeBuoyMetocean(forceRefresh = false): Promise<{
  buoys: MetoceanBuoy[];
  aggregate: Pick<
    WeatherState,
    | 'windSpeedKts'
    | 'windSpeedMs'
    | 'windDirectionDeg'
    | 'windDirectionCardinal'
    | 'waveHeightM'
    | 'surfaceCurrentKts'
    | 'surfaceCurrentDeg'
    | 'sarObservabilityPct'
    | 'metoceanSource'
    | 'updatedUtc'
  >;
  status: '200 OK' | 'CACHED FALLBACK';
  rawSummary: string;
}> {
  const url = `/api/telemetry/metocean${forceRefresh ? '?refresh=1' : ''}`;
  try {
    const json = (await fetchJsonWithTimeout(url, 12000)) as {
      buoys?: MetoceanBuoy[];
      aggregate?: Pick<
        WeatherState,
        | 'windSpeedKts'
        | 'windSpeedMs'
        | 'windDirectionDeg'
        | 'windDirectionCardinal'
        | 'waveHeightM'
        | 'surfaceCurrentKts'
        | 'surfaceCurrentDeg'
        | 'sarObservabilityPct'
        | 'metoceanSource'
        | 'updatedUtc'
      >;
      status?: '200 OK' | 'CACHED FALLBACK';
      rawSummary?: string;
    };

    if (json?.buoys && json.buoys.length === 3 && json.aggregate) {
      return {
        buoys: json.buoys,
        aggregate: json.aggregate,
        status: json.status === '200 OK' ? '200 OK' : 'CACHED FALLBACK',
        rawSummary:
          json.rawSummary ||
          `Alex ${json.buoys[0].windSpeedKts}kt · Damietta ${json.buoys[1].windSpeedKts}kt · Port Said ${json.buoys[2].windSpeedKts}kt`,
      };
    }
  } catch {
    // Fall through to cached fallback
  }

  const alex = FALLBACK_METOCEAN_BUOYS[0];
  return {
    buoys: FALLBACK_METOCEAN_BUOYS,
    aggregate: {
      windSpeedKts: alex.windSpeedKts,
      windSpeedMs: alex.windSpeedMs,
      windDirectionDeg: alex.windDirectionDeg,
      windDirectionCardinal: alex.windDirectionCardinal,
      waveHeightM: alex.waveHeightM,
      surfaceCurrentKts: alex.currentSpeedKts,
      surfaceCurrentDeg: alex.currentDirectionDeg,
      sarObservabilityPct: computeSarObservabilityPct(alex.windSpeedMs),
      metoceanSource: 'FALLBACK',
      updatedUtc: alex.updatedUtc,
    },
    status: 'CACHED FALLBACK',
    rawSummary: `Alex ${alex.windSpeedKts}kt · Damietta ${FALLBACK_METOCEAN_BUOYS[1].windSpeedKts}kt · Port Said ${FALLBACK_METOCEAN_BUOYS[2].windSpeedKts}kt (cached)`,
  };
}

