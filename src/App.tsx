import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomControlDeck } from './components/BottomControlDeck';
import { IncidentTriagePanel } from './components/IncidentTriagePanel';
import { MissionBriefingModal } from './components/MissionBriefingModal';
import { TacticalMap } from './components/TacticalMap';
import { TacticalNotificationFeed } from './components/TacticalNotificationFeed';
import { TargetInspectorPanel } from './components/TargetInspectorPanel';
import { TopTelemetryBar } from './components/TopTelemetryBar';
import { ViolationDossierModal } from './components/ViolationDossierModal';
import {
  AisConnectionStatus,
  connectServerAisStream,
  reconnectServerAisStream,
} from './services/aisStreamService';
import {
  evaluateHistoricalReplayAtMinute,
  fetchHistoricalScenario,
  getFirstValidHistoricalQuicklook,
  getHistoricalScenarioMeta,
} from './services/historicalService';
import {
  checkNasaGibsAvailability,
  FALLBACK_EONET_EVENTS,
  FALLBACK_METOCEAN_BUOYS,
  fetchNasaAsfScenes,
  fetchNasaEonetEvents,
  fetchSpaceWeatherLive,
  fetchThreeBuoyMetocean,
} from './services/liveFeedsService';
import {
  DEFAULT_SAR_TLE_CATALOG,
  fetchLiveNoradTles,
  propagateSarSatellites,
} from './services/orbitalPropagationService';
import {
  computeDarkEnvelope,
  computeLiveForensicSnapshot,
  computeLiveOilSpillSimulation,
  computeSarConfidenceAssessment,
  computeSubseaCableProximityAlerts,
  evaluateCableThreats,
  formatBlackoutDuration,
  interpolateBuoyMetocean,
} from './services/surveillanceForensicsService';
import {
  getFallbackAsfScenes,
  getIncidentById,
  getIncidents,
  getSarSwaths,
  getShippingLanes,
  getSlickEnsembleAtOffset,
  getSubseaCables,
  getVesselById,
  getVessels,
  getWeatherState,
} from './services/telemetryService';
import {
  computeForensicCaseSlickGeometry,
  forensicCasesRepository,
  forensicCaseToIncident,
  forensicCaseToPrimaryVessel,
  normalizeExternalForensicCase,
} from './data/forensicCasesRepository';
import {
  AsfSarScene,
  BaseMapId,
  DarkEnvelopeState,
  DarkVesselAlert,
  EonetEvent,
  ForensicCaseRecord,
  HistoricalTimelinePayload,
  HudMode,
  Incident,
  IncidentFilter,
  InspectorTab,
  LayerVisibility,
  LiveFeedDiagnostic,
  MetoceanBuoy,
  QueuedSarTask,
  SatelliteGroundState,
  SatelliteTleRecord,
  ScenarioId,
  Sgp4InterceptAssessment,
  SimulatedBlackoutRecord,
  Vessel,
  WeatherState,
} from './types/telemetry';

export default function App() {
  // Modular, Extensible Historical Forensic Repository (decoupled from live AIS feeds)
  const [forensicCases, setForensicCases] = useState<ForensicCaseRecord[]>(
    () => forensicCasesRepository
  );
  const [selectedForensicCaseId, setSelectedForensicCaseId] = useState<string>(
    () => forensicCasesRepository[0]?.id ?? 'forensic-2019-05-21'
  );
  const [simulatedVessels] = useState<Vessel[]>(() => getVessels());
  const allIncidents = useMemo(() => getIncidents('all'), []);
  const subseaCables = useMemo(() => getSubseaCables(), []);
  const shippingLanes = useMemo(() => getShippingLanes(), []);
  const sarSwaths = useMemo(() => getSarSwaths(), []);

  // Live Feeds State (with immediate calibrated fallbacks)
  const [weather, setWeather] = useState<WeatherState>(() => getWeatherState());
  const [buoys, setBuoys] = useState<MetoceanBuoy[]>(() => FALLBACK_METOCEAN_BUOYS);
  const [eonetEvents, setEonetEvents] = useState<EonetEvent[]>(() => FALLBACK_EONET_EVENTS);
  const [asfScenes, setAsfScenes] = useState<AsfSarScene[]>(() => getFallbackAsfScenes());
  const [tleCatalog, setTleCatalog] = useState<SatelliteTleRecord[]>(() => DEFAULT_SAR_TLE_CATALOG);
  const [satellites, setSatellites] = useState<SatelliteGroundState[]>(() =>
    propagateSarSatellites(new Date(), DEFAULT_SAR_TLE_CATALOG)
  );

  // Real Live AIS Stream State (via server-side /api/ais/stream SSE proxy)
  const [liveAisVessels, setLiveAisVessels] = useState<Vessel[]>([]);
  const [aisStatus, setAisStatus] = useState<AisConnectionStatus>('connecting');
  const [aisError, setAisError] = useState<string>('');
  const [relayAttemptNonce, setRelayAttemptNonce] = useState<number>(0);

  // 7-Endpoint Diagnostic Telemetry State
  const [feedDiagnostics, setFeedDiagnostics] = useState<LiveFeedDiagnostic[]>(() => {
    const ts = new Date().toISOString();
    return [
      {
        id: 'gibs',
        label: '1. NASA GIBS Daily Imagery',
        endpoint: 'gibs.earthdata.nasa.gov (default/default)',
        status: 'CACHED FALLBACK',
        lastSyncUtc: ts,
        rawSummary: 'Probing VIIRS SNPP Latest Mosaic...',
      },
      {
        id: 'eonet',
        label: '2. NASA EONET Live Earth Events',
        endpoint: '/api/telemetry/eonet -> eonet.gsfc.nasa.gov',
        status: 'CACHED FALLBACK',
        lastSyncUtc: ts,
        rawSummary: 'Probing active Earth events...',
      },
      {
        id: 'donki_noaa',
        label: '3. NASA DONKI & NOAA Planetary Kp',
        endpoint: '/api/telemetry/space-weather -> DONKI + SWPC',
        status: 'CACHED FALLBACK',
        lastSyncUtc: ts,
        rawSummary: 'Probing space weather Kp...',
      },
      {
        id: 'norad_tle',
        label: '4. NORAD Live Orbital TLEs',
        endpoint: '/api/telemetry/norad-tle -> CelesTrak / NORAD',
        status: 'CACHED FALLBACK',
        lastSyncUtc: ts,
        rawSummary: 'Probing Sentinel-1A, 1C & NISAR TLEs...',
      },
      {
        id: 'open_meteo',
        label: '5. Open-Meteo 3-Buoy Marine & Wind',
        endpoint: '/api/telemetry/metocean -> open-meteo.com',
        status: 'CACHED FALLBACK',
        lastSyncUtc: ts,
        rawSummary: 'Probing Alexandria, Damietta & Port Said...',
      },
      {
        id: 'asf_daac',
        label: '6. NASA ASF DAAC SAR Catalog',
        endpoint: '/api/telemetry/asf-sar -> api.daac.asf.alaska.edu',
        status: 'CACHED FALLBACK',
        lastSyncUtc: ts,
        rawSummary: 'Probing Sentinel-1 & NISAR scenes...',
      },
      {
        id: 'ais_live',
        label: '7. AISStream.io Real-Time Vessels',
        endpoint: '/api/ais/stream -> wss://stream.aisstream.io',
        status: 'CACHED FALLBACK',
        lastSyncUtc: ts,
        rawSummary: 'Probing server-side AIS proxy...',
      },
    ];
  });

  // Default to COASTAL SURVEILLANCE Mode on load
  const [baseMap, setBaseMap] = useState<BaseMapId>('satellite');
  const [hudMode, setHudMode] = useState<HudMode>('surveillance');
  const [hudMinimized, setHudMinimized] = useState<boolean>(false);
  const [briefingOpen, setBriefingOpen] = useState<boolean>(true);
  const [incidentFilter, setIncidentFilter] = useState<IncidentFilter>('all');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>(
    allIncidents[0]?.id ?? 'inc-01'
  );
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [selectedAsfSceneId, setSelectedAsfSceneId] = useState<string | null>(null);
  const [inspectTargetMode, setInspectTargetMode] = useState<'vessel' | 'sar_footprint'>('vessel');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('behavior');
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const [dossierOpen, setDossierOpen] = useState<boolean>(false);

  // Autonomous Coastal Surveillance Watchdog, SAR Tasking & Live Oil Simulation State
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [simulatedBlackouts, setSimulatedBlackouts] = useState<
    Record<string, SimulatedBlackoutRecord>
  >({});
  const [queuedSarTasks, setQueuedSarTasks] = useState<QueuedSarTask[]>([]);
  const [oilOverlayDismissed, setOilOverlayDismissed] = useState<boolean>(false);
  const [simActiveVesselIds, setSimActiveVesselIds] = useState<Record<string, boolean>>({});
  const [liveOilAnchor, setLiveOilAnchor] = useState<{
    id: string;
    label: string;
    anchorType: 'vessel' | 'sar_footprint';
    lat: number;
    lon: number;
    releaseHoursAgo: number;
  } | null>(null);

  // Automated Tactical Notification Feed (30-Minute AIS Blackout Rule)
  const [alertsOpen, setAlertsOpen] = useState<boolean>(false);
  const [tacticalAlerts, setTacticalAlerts] = useState<DarkVesselAlert[]>([]);
  const [toastAlertId, setToastAlertId] = useState<string | null>(null);
  const dispatchedEpisodesRef = useRef<Set<string>>(new Set());

  // Layer Visibility Matrix
  const [layers, setLayers] = useState<LayerVisibility>({
    nauticalLanes: true,
    subseaCables: true,
    sarSwaths: true,
    sarBackscatter: false,
    searchCones: true,
    oilDriftEnsemble: true,
  });

  // Time-Machine Scrubber State (-48h to +24h, T=0 default)
  const [timeOffsetHours, setTimeOffsetHours] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Scenario Selector & 24-Hour Historical Replay State
  const [activeScenarioId, setActiveScenarioId] = useState<ScenarioId>('live');
  const [historicalPayload, setHistoricalPayload] = useState<HistoricalTimelinePayload | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState<boolean>(false);
  const [historicalMinute, setHistoricalMinute] = useState<number>(0);
  const [historicalPlaying, setHistoricalPlaying] = useState<boolean>(false);
  const activeScenarioRef = useRef<ScenarioId>('live');

  // Map Camera Fly-To Request
  const [flyToRequest, setFlyToRequest] = useState<{
    lat: number;
    lon: number;
    zoom: number;
    nonce: number;
  } | null>(null);

  const updateDiagnostic = useCallback(
    (
      id: LiveFeedDiagnostic['id'],
      status: LiveFeedDiagnostic['status'],
      rawSummary: string
    ) => {
      const nowIso = new Date().toISOString();
      setFeedDiagnostics((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, status, rawSummary, lastSyncUtc: nowIso } : d
        )
      );
    },
    []
  );

  // Sync all NASA / NORAD / NOAA / Open-Meteo / ASF live feeds via Express backend
  const syncAllLiveFeeds = useCallback(
    (forceRefresh = false) => {
      checkNasaGibsAvailability().then((res) => {
        updateDiagnostic('gibs', res.status, res.rawSummary);
      });

      fetchNasaEonetEvents(forceRefresh).then((res) => {
        setEonetEvents(res.events);
        updateDiagnostic('eonet', res.status, res.rawSummary);
      });

      fetchSpaceWeatherLive(forceRefresh).then((res) => {
        setWeather((prev) => ({ ...prev, ...res.weather }));
        updateDiagnostic('donki_noaa', res.status, res.rawSummary);
      });

      fetchLiveNoradTles(forceRefresh).then((res) => {
        setTleCatalog(res.records);
        setSatellites(propagateSarSatellites(new Date(), res.records));
        updateDiagnostic('norad_tle', res.status, res.rawSummary);
      });

      fetchThreeBuoyMetocean(forceRefresh).then((res) => {
        setBuoys(res.buoys);
        setWeather((prev) => ({ ...prev, ...res.aggregate }));
        updateDiagnostic('open_meteo', res.status, res.rawSummary);
      });

      fetchNasaAsfScenes(forceRefresh).then((res) => {
        setAsfScenes(res.scenes);
        updateDiagnostic('asf_daac', res.status, res.rawSummary);
      });
    },
    [updateDiagnostic]
  );

  useEffect(() => {
    syncAllLiveFeeds(false);
  }, [syncAllLiveFeeds]);

  // 1-Second Real-Time SGP4 Orbital Motion & Dark-Gap Watchdog Clock
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = new Date();
      setNowMs(current.getTime());
      setSatellites(propagateSarSatellites(current, tleCatalog));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [tleCatalog]);

  // Connect to Built-In Server-Side AISStream SSE Proxy (/api/ais/stream)
  useEffect(() => {
    const cleanup = connectServerAisStream(
      (vessels) => {
        setLiveAisVessels(vessels);
        if (vessels.length > 0) {
          updateDiagnostic(
            'ais_live',
            '200 OK',
            `${vessels.length} real AIS vessels in Med-East sector`
          );
        }
      },
      (info) => {
        setAisStatus(info.status);
        setAisError(info.errorMessage || '');
        if (info.status === 'connected') {
          updateDiagnostic(
            'ais_live',
            '200 OK',
            info.vesselCount > 0
              ? `${info.vesselCount} real AIS vessels (server proxy)`
              : 'WebSocket open · awaiting first PositionReport'
          );
        } else if (info.status === 'needs_key') {
          updateDiagnostic(
            'ais_live',
            'CACHED FALLBACK',
            'Server AISSTREAM_API_KEY not configured'
          );
        } else if (info.status === 'error') {
          updateDiagnostic(
            'ais_live',
            'CACHED FALLBACK',
            info.errorMessage || 'AISStream connection error'
          );
        } else {
          updateDiagnostic('ais_live', 'CACHED FALLBACK', `AIS status: ${info.status}`);
        }
      }
    );
    return cleanup;
  }, [relayAttemptNonce, updateDiagnostic]);

  // Real-Time AIS Dark-Gap Watchdog (30-Minute Rule):
  // - <= 30m: vessel stays GREEN ('legal') with a predictive green reachability envelope
  // - > 30m: escalates to RED ('dark'), intensifies reachability envelope, and triggers alert feed
  const darkEnvelopes = useMemo<DarkEnvelopeState[]>(() => {
    return liveAisVessels
      .map((v) =>
        computeDarkEnvelope(
          v,
          nowMs,
          simulatedBlackouts,
          subseaCables,
          buoys,
          weather,
          v.id === selectedVesselId
        )
      )
      .filter((env): env is DarkEnvelopeState => env !== null);
  }, [liveAisVessels, nowMs, simulatedBlackouts, subseaCables, buoys, weather, selectedVesselId]);

  const darkEnvelopeMap = useMemo(() => {
    const map = new Map<string, DarkEnvelopeState>();
    darkEnvelopes.forEach((env) => map.set(env.vesselId, env));
    return map;
  }, [darkEnvelopes]);

  // Enrich live AIS vessels with real-time cable distance + conditional 30m Dark Cutoff status
  const enrichedLiveVessels = useMemo(() => {
    return liveAisVessels.map((v) => {
      const env = darkEnvelopeMap.get(v.id);
      const nearest = evaluateCableThreats(
        { lat: v.lat, lon: v.lon },
        env ? env.reachabilityRadiusKm : 2.0,
        subseaCables,
        v.sogKts
      ).nearestCable;

      if (env) {
        return {
          ...v,
          lat: env.lkpLat,
          lon: env.lkpLon,
          status: env.isConfirmedDark ? ('dark' as const) : ('legal' as const),
          aisGapHours: Number((env.gapMinutes / 60).toFixed(2)),
          nearestCableName: env.nearestCable.cableName,
          nearestCableDistanceKm: env.nearestCable.distanceKm,
        };
      }

      return {
        ...v,
        nearestCableName: nearest.cableName,
        nearestCableDistanceKm: nearest.distanceKm,
      };
    });
  }, [liveAisVessels, darkEnvelopeMap, subseaCables]);

  // Subsea Cable Proximity Watchdog across all live vessels & dark envelopes (< 3.0 km or slow drag)
  const cableThreatAlerts = useMemo(
    () => computeSubseaCableProximityAlerts(enrichedLiveVessels, darkEnvelopes, subseaCables),
    [enrichedLiveVessels, darkEnvelopes, subseaCables]
  );

  const isHistoricalMode = activeScenarioId !== 'live';
  const isForensicStandalone = hudMode === 'forensic' && !isHistoricalMode;

  const activeForensicCase = useMemo(
    () =>
      forensicCases.find((c) => c.id === selectedForensicCaseId) ??
      forensicCases[0],
    [forensicCases, selectedForensicCaseId]
  );

  // Automated Tactical Notification Dispatch when any vessel crosses > 30 minutes silent
  useEffect(() => {
    if (isHistoricalMode || isForensicStandalone) return;

    const confirmed = darkEnvelopes.filter((e) => e.isConfirmedDark);
    const activeByEpisode = new Map(confirmed.map((e) => [e.episodeKey, e]));
    const nowIso = new Date(nowMs).toISOString();

    const newlyTriggered: DarkVesselAlert[] = [];
    confirmed.forEach((env) => {
      if (!dispatchedEpisodesRef.current.has(env.episodeKey)) {
        dispatchedEpisodesRef.current.add(env.episodeKey);
        const localMet = interpolateBuoyMetocean(env.lkpLat, env.lkpLon, buoys, weather);
        const sarConfidence = computeSarConfidenceAssessment(localMet.windSpeedKts, {
          hasAnomaly: true,
          isConfirmedDark: true,
          aisGapMinutes: env.gapMinutes,
          windDirectionDeg: localMet.windDirectionDeg,
        });
        newlyTriggered.push({
          id: `dark-alert-${Date.now()}-${env.mmsi}-${Math.random().toString(36).slice(2, 6)}`,
          episodeKey: env.episodeKey,
          vesselId: env.vesselId,
          vesselName: env.vesselName,
          mmsi: env.mmsi,
          flag: env.flag,
          vesselType: env.vesselType,
          blackoutDurationMinutes: env.gapMinutes,
          blackoutDurationFormatted: formatBlackoutDuration(env.gapMinutes),
          triggeredAtUtc: nowIso,
          lkpLat: env.lkpLat,
          lkpLon: env.lkpLon,
          reachabilityRadiusKm: env.reachabilityRadiusKm,
          maxSpeedKts: env.maxSpeedKts,
          isSimulated: env.isSimulated,
          acknowledged: false,
          active: true,
          localWindSpeedKts: localMet.windSpeedKts,
          sarConfidence,
        });
      }
    });

    if (newlyTriggered.length > 0) {
      setToastAlertId(newlyTriggered[0].id);
    }

    setTacticalAlerts((prev) => {
      let changed = newlyTriggered.length > 0;
      const updatedExisting = prev.map((alert) => {
        const liveEnv = activeByEpisode.get(alert.episodeKey);
        if (!liveEnv) {
          if (alert.active) {
            changed = true;
            return { ...alert, active: false };
          }
          return alert;
        }
        const nextFormatted = formatBlackoutDuration(liveEnv.gapMinutes);
        const localMet = interpolateBuoyMetocean(liveEnv.lkpLat, liveEnv.lkpLon, buoys, weather);
        const nextConf = computeSarConfidenceAssessment(localMet.windSpeedKts, {
          hasAnomaly: true,
          isConfirmedDark: true,
          aisGapMinutes: liveEnv.gapMinutes,
          windDirectionDeg: localMet.windDirectionDeg,
        });
        if (
          !alert.active ||
          alert.blackoutDurationFormatted !== nextFormatted ||
          alert.reachabilityRadiusKm !== liveEnv.reachabilityRadiusKm ||
          alert.sarConfidence?.badgeText !== nextConf.badgeText
        ) {
          changed = true;
          return {
            ...alert,
            active: true,
            blackoutDurationMinutes: liveEnv.gapMinutes,
            blackoutDurationFormatted: nextFormatted,
            reachabilityRadiusKm: liveEnv.reachabilityRadiusKm,
            localWindSpeedKts: localMet.windSpeedKts,
            sarConfidence: nextConf,
          };
        }
        return alert;
      });

      if (!changed) return prev;
      return [...newlyTriggered, ...updatedExisting].slice(0, 60);
    });
  }, [darkEnvelopes, isHistoricalMode, isForensicStandalone, nowMs, buoys, weather]);

  const activeAlertsCount = useMemo(
    () => tacticalAlerts.filter((a) => a.active).length,
    [tacticalAlerts]
  );
  const unreadAlertsCount = useMemo(
    () => tacticalAlerts.filter((a) => !a.acknowledged).length,
    [tacticalAlerts]
  );
  const latestToastAlert = useMemo(
    () => (toastAlertId ? tacticalAlerts.find((a) => a.id === toastAlertId) ?? null : null),
    [toastAlertId, tacticalAlerts]
  );

  const historicalReplay = useMemo(() => {
    if (!isHistoricalMode || !historicalPayload) return null;
    return evaluateHistoricalReplayAtMinute(historicalPayload, historicalMinute);
  }, [isHistoricalMode, historicalPayload, historicalMinute]);

  // Effective Weather (Isolated Historical Metocean in Forensic Lab; Archive in Replay; Live 3-buoy in Surveillance)
  const effectiveWeather = useMemo<WeatherState>(() => {
    if (isForensicStandalone && activeForensicCase) {
      const m = activeForensicCase.metoceanAtEvent;
      return {
        windSpeedKts: m.windSpeedKts,
        windSpeedMs: Number((m.windSpeedKts * 0.514444).toFixed(1)),
        windDirectionDeg: m.windDirectionDeg,
        windDirectionCardinal: m.windDirectionCardinal,
        waveHeightM: Number(Math.max(0.4, m.windSpeedKts * 0.08).toFixed(1)),
        seaSurfaceTempC: 21.8,
        surfaceCurrentKts: m.currentSpeedKts,
        surfaceCurrentDeg: m.currentDirectionDeg,
        kpIndex: m.kpIndexAtEvent,
        kpStatus: m.kpIndexAtEvent >= 5 ? 'STORM' : m.kpIndexAtEvent >= 4 ? 'MODERATE' : 'NOMINAL',
        solarFluxSfu: 112,
        donkiVerified: false,
        donkiStormAlertsCount: 0,
        kpSource: 'FALLBACK',
        metoceanSource: 'FALLBACK',
        sarObservabilityPct: activeForensicCase.sarPass.observabilityProbabilityPct,
        updatedUtc: activeForensicCase.timestampUtc,
      };
    }
    if (!historicalReplay || !historicalPayload) return weather;
    return {
      ...weather,
      windSpeedKts: historicalReplay.currentWeather.windSpeedKts,
      windSpeedMs: historicalReplay.currentWeather.windSpeedMs,
      windDirectionDeg: historicalReplay.currentWeather.windDirectionDeg,
      windDirectionCardinal: historicalReplay.currentWeather.windDirectionCardinal,
      metoceanSource:
        historicalPayload.weatherStatus === '200 OK' ? 'OPEN_METEO_LIVE' : 'FALLBACK',
      updatedUtc: historicalReplay.currentWeather.timeIso,
    };
  }, [isForensicStandalone, activeForensicCase, weather, historicalReplay, historicalPayload]);

  // Decoupled Vessels:
  // - Historical Replay -> scenario replay vessels
  // - Forensic Case Lab -> ONLY isolated primary vessel per case from forensicCases (never live AIS)
  // - Coastal Surveillance -> ONLY live AIS vessels
  const combinedVessels = useMemo(() => {
    if (isHistoricalMode) {
      return historicalReplay?.vesselsAtMinute ?? [];
    }
    if (isForensicStandalone) {
      return forensicCases.map((fc) => forensicCaseToPrimaryVessel(fc, timeOffsetHours));
    }
    return enrichedLiveVessels;
  }, [isHistoricalMode, isForensicStandalone, historicalReplay, forensicCases, timeOffsetHours, enrichedLiveVessels]);

  // Effective ASF SAR Swaths (Empty in decoupled Forensic Lab, Historical swaths in Replay, Live catalog in Surveillance)
  const effectiveAsfScenes = useMemo(() => {
    if (isForensicStandalone) {
      return [];
    }
    if (isHistoricalMode && historicalPayload) {
      return historicalPayload.sarSwaths;
    }
    return asfScenes;
  }, [isForensicStandalone, isHistoricalMode, historicalPayload, asfScenes]);

  // Earliest upcoming SAR pass from live SGP4 propagation or Historical Pass Countdown
  const nextSatellitePass = useMemo<SatelliteGroundState | undefined>(() => {
    if (isHistoricalMode && historicalPayload && historicalReplay) {
      return {
        id: 'historical-sar-pass',
        noradId: historicalPayload.primarySatelliteName.includes('ENVISAT') ? '27386' : '39634',
        name: historicalPayload.primarySatelliteName,
        bandLabel: 'C-BAND',
        color: '#22D3EE',
        lat: historicalPayload.scenario.lat,
        lon: historicalPayload.scenario.lon,
        altitudeKm: 693,
        velocityKmS: 7.5,
        nextPassSeconds: historicalReplay.sarPassCountdownSeconds,
        nextPassTimeUtc: historicalPayload.primaryPassUtc,
        isLiveTle: true,
        trackSegments: [],
      };
    }
    if (isForensicStandalone) return undefined;
    if (satellites.length === 0) return undefined;
    return [...satellites].sort((a, b) => a.nextPassSeconds - b.nextPassSeconds)[0];
  }, [isHistoricalMode, isForensicStandalone, historicalPayload, historicalReplay, satellites]);

  // Incidents list (derived from extensible forensicCases in Forensic mode)
  const forensicIncidents = useMemo(
    () => forensicCases.map(forensicCaseToIncident),
    [forensicCases]
  );

  const filteredIncidents = useMemo(() => {
    if (isForensicStandalone) {
      return forensicIncidents.filter(
        (inc) => incidentFilter === 'all' || inc.category === incidentFilter
      );
    }
    return getIncidents(incidentFilter);
  }, [isForensicStandalone, forensicIncidents, incidentFilter]);

  const selectedIncident = useMemo(() => {
    if (isForensicStandalone && activeForensicCase) {
      return forensicCaseToIncident(activeForensicCase);
    }
    return getIncidentById(selectedIncidentId) ?? allIncidents[0];
  }, [isForensicStandalone, activeForensicCase, selectedIncidentId, allIncidents]);

  const selectedVessel = useMemo(() => {
    if (isHistoricalMode && historicalReplay && historicalReplay.vesselsAtMinute.length > 0) {
      if (selectedVesselId) {
        const histMatch = historicalReplay.vesselsAtMinute.find((v) => v.id === selectedVesselId);
        if (histMatch) return histMatch;
      }
      return historicalReplay.vesselsAtMinute[0];
    }
    if (isForensicStandalone && activeForensicCase) {
      return forensicCaseToPrimaryVessel(activeForensicCase, timeOffsetHours);
    }
    if (selectedVesselId) {
      const liveMatch = enrichedLiveVessels.find((v) => v.id === selectedVesselId);
      if (liveMatch) return liveMatch;
      const simMatch = simulatedVessels.find((v) => v.id === selectedVesselId);
      if (simMatch) return simMatch;
    }
    if (hudMode === 'surveillance' && enrichedLiveVessels.length > 0) {
      return enrichedLiveVessels[0];
    }
    return (
      simulatedVessels.find((v) => v.id === selectedIncident.primaryVesselId) ??
      getVesselById(selectedIncident.primaryVesselId) ??
      simulatedVessels[0]
    );
  }, [
    isHistoricalMode,
    isForensicStandalone,
    activeForensicCase,
    timeOffsetHours,
    historicalReplay,
    selectedVesselId,
    enrichedLiveVessels,
    simulatedVessels,
    hudMode,
    selectedIncident,
  ]);

  const resolvedAsfSceneId = useMemo(
    () =>
      selectedAsfSceneId ??
      effectiveAsfScenes.find((s) => Boolean(s.browseImageUrl))?.id ??
      effectiveAsfScenes[0]?.id ??
      null,
    [selectedAsfSceneId, effectiveAsfScenes]
  );

  const selectedAsfScene = useMemo(
    () => effectiveAsfScenes.find((s) => s.id === resolvedAsfSceneId),
    [effectiveAsfScenes, resolvedAsfSceneId]
  );

  // Active Dark Envelope for selected vessel (evaluated prior to oil simulation gating)
  const selectedDarkEnvelope = useMemo(
    () =>
      isHistoricalMode || isForensicStandalone
        ? null
        : darkEnvelopeMap.get(selectedVessel.id) ?? null,
    [isHistoricalMode, isForensicStandalone, darkEnvelopeMap, selectedVessel.id]
  );

  // Live Open-Meteo 3-Buoy Lagrangian Oil Spill Simulation (Coastal Surveillance ONLY)
  const liveOilSimulation = useMemo(() => {
    if (isHistoricalMode || isForensicStandalone) {
      return null;
    }
    if (liveOilAnchor) {
      return computeLiveOilSpillSimulation(liveOilAnchor, timeOffsetHours, buoys, weather, nowMs);
    }
    if (hudMode !== 'surveillance' || oilOverlayDismissed) {
      return null;
    }
    if (inspectTargetMode === 'sar_footprint' && selectedAsfScene && selectedAsfScene.footprintCoords.length > 0) {
      const avgLat =
        selectedAsfScene.footprintCoords.reduce((acc, p) => acc + p.lat, 0) /
        selectedAsfScene.footprintCoords.length;
      const avgLon =
        selectedAsfScene.footprintCoords.reduce((acc, p) => acc + p.lon, 0) /
        selectedAsfScene.footprintCoords.length;
      return computeLiveOilSpillSimulation(
        {
          id: `auto-sar-${selectedAsfScene.id}`,
          label: selectedAsfScene.sceneName.slice(0, 22),
          anchorType: 'sar_footprint',
          lat: avgLat,
          lon: avgLon,
          releaseHoursAgo: 6,
        },
        timeOffsetHours,
        buoys,
        weather,
        nowMs
      );
    }
    const isConfirmedVesselAnomaly =
      Boolean(selectedDarkEnvelope?.isConfirmedDark) ||
      selectedVessel?.status === 'dark' ||
      selectedVessel?.status === 'spoofed';
    const isExplicitOptionalSim = Boolean(selectedVesselId && simActiveVesselIds[selectedVesselId]);
    if (selectedVesselId && selectedVessel && (isConfirmedVesselAnomaly || isExplicitOptionalSim)) {
      return computeLiveOilSpillSimulation(
        {
          id: isExplicitOptionalSim ? `live-spill-${selectedVessel.id}` : `auto-vessel-${selectedVessel.id}`,
          label: selectedVessel.name,
          anchorType: 'vessel',
          lat: selectedVessel.lat,
          lon: selectedVessel.lon,
          releaseHoursAgo: 6,
        },
        timeOffsetHours,
        buoys,
        weather,
        nowMs
      );
    }
    return null;
  }, [
    isHistoricalMode,
    isForensicStandalone,
    liveOilAnchor,
    hudMode,
    oilOverlayDismissed,
    inspectTargetMode,
    selectedAsfScene,
    selectedVesselId,
    selectedVessel,
    selectedDarkEnvelope,
    simActiveVesselIds,
    timeOffsetHours,
    buoys,
    weather,
    nowMs,
  ]);

  const liveForensicSnapshot = useMemo(
    () =>
      computeLiveForensicSnapshot({
        vessel: selectedVessel,
        selectedAsfScene: isForensicStandalone ? undefined : selectedAsfScene,
        inspectTargetMode: isForensicStandalone ? 'vessel' : inspectTargetMode,
        darkEnvelope: selectedDarkEnvelope,
        cableProximityAlerts: isHistoricalMode || isForensicStandalone ? [] : cableThreatAlerts,
        oilSimulation: isHistoricalMode
          ? (historicalReplay?.oilDrift ?? null)
          : isForensicStandalone
            ? null
            : liveOilSimulation,
        timeOffsetHours,
        cables: subseaCables,
        buoys: isForensicStandalone ? [] : buoys,
        fallbackWeather: effectiveWeather,
        tleCatalog,
        referenceDate: new Date(isForensicStandalone && activeForensicCase ? activeForensicCase.timestampUtc : nowMs),
      }),
    [
      selectedVessel,
      isForensicStandalone,
      selectedAsfScene,
      inspectTargetMode,
      selectedDarkEnvelope,
      isHistoricalMode,
      cableThreatAlerts,
      historicalReplay,
      liveOilSimulation,
      timeOffsetHours,
      subseaCables,
      buoys,
      effectiveWeather,
      tleCatalog,
      activeForensicCase,
      nowMs,
    ]
  );

  // Dynamic Lagrangian Drift Ensembles (Computed from isolated forensicCases in Forensic mode)
  const activeEnsemble = useMemo(() => {
    if (isForensicStandalone && activeForensicCase) {
      return computeForensicCaseSlickGeometry(activeForensicCase, timeOffsetHours);
    }
    return getSlickEnsembleAtOffset(selectedIncident.id, timeOffsetHours, weather);
  }, [isForensicStandalone, activeForensicCase, selectedIncident.id, timeOffsetHours, weather]);

  const allOilEnsembles = useMemo(() => {
    if (isForensicStandalone) {
      return forensicCases.map((fc) => computeForensicCaseSlickGeometry(fc, timeOffsetHours));
    }
    return allIncidents
      .filter((inc) => Boolean(inc.driftAttribution))
      .map((inc) => getSlickEnsembleAtOffset(inc.id, timeOffsetHours, weather))
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }, [isForensicStandalone, forensicCases, allIncidents, timeOffsetHours, weather]);

  // Playback Loop for Live & Synchronized Multi-Ship Forensic Scrubber (-48h .. +24h)
  useEffect(() => {
    if (isHistoricalMode || !isPlaying) return;
    const stepHours = isForensicStandalone ? 0.25 : 0.5;
    const intervalMs = isForensicStandalone ? 80 : 160;
    const timer = window.setInterval(() => {
      setTimeOffsetHours((prev) => {
        if (prev >= 24) return -48;
        return Number(Math.min(24, prev + stepHours).toFixed(2));
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isHistoricalMode, isForensicStandalone, isPlaying]);

  // Smooth 24-Hour Historical Replay Playback Loop (15 simulated minutes per second -> +3m / 200ms)
  useEffect(() => {
    if (!isHistoricalMode || !historicalPlaying) return;
    const timer = window.setInterval(() => {
      setHistoricalMinute((prev) => {
        if (prev >= 1439) {
          setHistoricalPlaying(false);
          return 1439;
        }
        return Math.min(1439, prev + 3);
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, [isHistoricalMode, historicalPlaying]);

  const handleReconnectAisRelay = useCallback(() => {
    reconnectServerAisStream()
      .then((info) => {
        if (info) {
          setAisStatus(info.status);
          setAisError(info.errorMessage || '');
        }
      })
      .finally(() => {
        setRelayAttemptNonce((n) => n + 1);
      });
  }, []);

  const handleToggleLayer = useCallback((key: keyof LayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSelectForensicCaseById = useCallback(
    (caseId: string) => {
      const found = forensicCases.find((c) => c.id === caseId);
      if (!found) return;
      setSelectedForensicCaseId(found.id);
      setSelectedIncidentId(found.id);
      setSelectedVesselId(found.primaryVessel.id);
    },
    [forensicCases]
  );

  const handleSelectForensicCase = useCallback(
    (record: ForensicCaseRecord) => {
      setSelectedForensicCaseId(record.id);
      setSelectedIncidentId(record.id);
      setSelectedVesselId(record.primaryVessel.id);
    },
    []
  );

  const handleLocateForensicCase = useCallback((record: ForensicCaseRecord) => {
    setSelectedForensicCaseId(record.id);
    setSelectedIncidentId(record.id);
    setSelectedVesselId(record.primaryVessel.id);
    setFlyToRequest({
      lat: record.stopCoordinates.lat,
      lon: record.stopCoordinates.lon,
      zoom: record.zoomTarget,
      nonce: Date.now(),
    });
  }, []);

  const handleInspectForensicCase = useCallback((record: ForensicCaseRecord) => {
    setSelectedForensicCaseId(record.id);
    setSelectedIncidentId(record.id);
    setSelectedVesselId(record.primaryVessel.id);
    setHudMode('forensic');
    setHudMinimized(false);
    setInspectorOpen(true);
    setLayers((prev) => ({
      ...prev,
      sarBackscatter: true,
      searchCones: true,
      oilDriftEnsemble: true,
      sarSwaths: true,
    }));
    setFlyToRequest({
      lat: record.stopCoordinates.lat,
      lon: record.stopCoordinates.lon,
      zoom: record.zoomTarget,
      nonce: Date.now(),
    });
    if (record.classification === 'oil_spills') {
      setInspectorTab('drift_cost');
    } else if (record.classification === 'subsea_cables') {
      setInspectorTab('sar_lab');
    } else {
      setInspectorTab('behavior');
    }
  }, []);

  const handleAppendForensicCase = useCallback(
    (rawCase: unknown) => {
      const normalized = normalizeExternalForensicCase(rawCase, forensicCases.length);
      setForensicCases((prev) => [normalized, ...prev]);
      setIncidentFilter('all');
      setSelectedForensicCaseId(normalized.id);
      setSelectedIncidentId(normalized.id);
      setSelectedVesselId(normalized.primaryVessel.id);
      setHudMode('forensic');
      setInspectorTab('drift_cost');
      setFlyToRequest({
        lat: normalized.stopCoordinates.lat,
        lon: normalized.stopCoordinates.lon,
        zoom: normalized.zoomTarget,
        nonce: Date.now(),
      });
    },
    [forensicCases.length]
  );

  const handleLocateIncident = useCallback((inc: Incident) => {
    setSelectedVesselId(null);
    setSelectedIncidentId(inc.id);
    setFlyToRequest({
      lat: inc.lat,
      lon: inc.lon,
      zoom: inc.zoomTarget,
      nonce: Date.now(),
    });
  }, []);

  const handleInspectIncident = useCallback((inc: Incident) => {
    setSelectedVesselId(null);
    setSelectedIncidentId(inc.id);
    setHudMode('forensic');
    setHudMinimized(false);
    setInspectorOpen(true);
    setLayers((prev) => ({ ...prev, sarBackscatter: true }));
    setFlyToRequest({
      lat: inc.lat,
      lon: inc.lon,
      zoom: inc.zoomTarget,
      nonce: Date.now(),
    });
    if (inc.category === 'oil_spills') {
      setInspectorTab('drift_cost');
    } else if (inc.category === 'subsea_cables') {
      setInspectorTab('sar_lab');
    } else {
      setInspectorTab('behavior');
    }
  }, []);

  const handleSelectIncidentFromMap = useCallback(
    (incId: string) => {
      const fc = forensicCases.find((c) => c.id === incId);
      if (fc) {
        setSelectedForensicCaseId(fc.id);
      }
      const inc = getIncidentById(incId);
      if (inc) {
        setSelectedIncidentId(inc.id);
      }
      setSelectedVesselId(null);
    },
    [forensicCases]
  );

  const handleSelectVesselFromMap = useCallback(
    (vesselId: string) => {
      setSelectedVesselId(vesselId);
      const fc = forensicCases.find((c) => c.primaryVessel.id === vesselId);
      if (fc) {
        setSelectedForensicCaseId(fc.id);
      }
      setInspectTargetMode('vessel');
      setOilOverlayDismissed(false);
      if (simActiveVesselIds[vesselId]) {
        const matched = combinedVessels.find((v) => v.id === vesselId);
        if (matched) {
          setLiveOilAnchor({
            id: `live-spill-${matched.id}`,
            label: matched.name,
            anchorType: 'vessel',
            lat: matched.lat,
            lon: matched.lon,
            releaseHoursAgo: 6,
          });
        }
      } else {
        setLiveOilAnchor(null);
      }
    },
    [forensicCases, simActiveVesselIds, combinedVessels]
  );

  const handleSelectLiveVesselFromList = useCallback(
    (vessel: Vessel, flyTo: boolean) => {
      setSelectedVesselId(vessel.id);
      setInspectTargetMode('vessel');
      setOilOverlayDismissed(false);
      if (simActiveVesselIds[vessel.id]) {
        setLiveOilAnchor({
          id: `live-spill-${vessel.id}`,
          label: vessel.name,
          anchorType: 'vessel',
          lat: vessel.lat,
          lon: vessel.lon,
          releaseHoursAgo: 6,
        });
      } else {
        setLiveOilAnchor(null);
      }
      if (flyTo) {
        setFlyToRequest({
          lat: vessel.lat,
          lon: vessel.lon,
          zoom: 11,
          nonce: Date.now(),
        });
      }
    },
    [simActiveVesselIds]
  );

  const handleSelectAsfScene = useCallback(
    (sceneId: string, centerMap = false) => {
      setSelectedAsfSceneId(sceneId);
      setInspectTargetMode('sar_footprint');
      setOilOverlayDismissed(false);
      setLiveOilAnchor(null);
      setInspectorTab('sar_lab');
      setInspectorOpen(true);
      setLayers((prev) => ({ ...prev, sarSwaths: true }));
      if (hudMinimized) setHudMinimized(false);

      if (centerMap) {
        const scene = asfScenes.find((s) => s.id === sceneId);
        if (scene && scene.footprintCoords.length > 0) {
          const avgLat =
            scene.footprintCoords.reduce((acc, p) => acc + p.lat, 0) /
            scene.footprintCoords.length;
          const avgLon =
            scene.footprintCoords.reduce((acc, p) => acc + p.lon, 0) /
            scene.footprintCoords.length;
          setFlyToRequest({
            lat: avgLat,
            lon: avgLon,
            zoom: 8,
            nonce: Date.now(),
          });
        }
      }
    },
    [asfScenes, hudMinimized]
  );

  const handleSimulateBlackout = useCallback((vessel: Vessel) => {
    setSelectedVesselId(vessel.id);
    setInspectTargetMode('vessel');
    setInspectorOpen(true);
    setLayers((prev) => ({ ...prev, searchCones: true, subseaCables: true }));
    setSimulatedBlackouts((prev) => ({
      ...prev,
      [vessel.id]: {
        vesselId: vessel.id,
        triggeredAtMs: Date.now(),
        offsetSeconds: 960, // Start at 16 min (green <30m predictive envelope; escalate past 30m via +15m/+1h)
        lkpLat: vessel.lat,
        lkpLon: vessel.lon,
        lastSogKts: Math.max(5.5, vessel.sogKts),
        lastCogDeg: vessel.cogDeg,
        lastHeadingDeg: vessel.headingDeg,
      },
    }));
  }, []);

  const handleAdvanceBlackout = useCallback((vesselId: string, extraSeconds: number) => {
    setSimulatedBlackouts((prev) => {
      const existing = prev[vesselId];
      if (!existing) return prev;
      return {
        ...prev,
        [vesselId]: {
          ...existing,
          offsetSeconds: existing.offsetSeconds + extraSeconds,
        },
      };
    });
  }, []);

  const handleClearBlackout = useCallback((vesselId: string) => {
    setSimulatedBlackouts((prev) => {
      const next = { ...prev };
      delete next[vesselId];
      return next;
    });
  }, []);

  const handleAcknowledgeAlert = useCallback((alertId: string) => {
    setTacticalAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
    );
  }, []);

  const handleAcknowledgeAllAlerts = useCallback(() => {
    setTacticalAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
  }, []);

  const handleClearResolvedAlerts = useCallback(() => {
    setTacticalAlerts((prev) => prev.filter((a) => a.active));
  }, []);

  const handleLocateAlertVessel = useCallback((alert: DarkVesselAlert) => {
    if (activeScenarioRef.current !== 'live') {
      activeScenarioRef.current = 'live';
      setActiveScenarioId('live');
      setHistoricalPayload(null);
      setHistoricalLoading(false);
    }
    setHudMode('surveillance');
    setHudMinimized(false);
    setSelectedVesselId(alert.vesselId);
    setInspectTargetMode('vessel');
    setInspectorTab('behavior');
    setLayers((prev) => ({ ...prev, searchCones: true, subseaCables: true }));
    setFlyToRequest({
      lat: alert.lkpLat,
      lon: alert.lkpLon,
      zoom: 10,
      nonce: Date.now(),
    });
    setTacticalAlerts((prev) =>
      prev.map((a) => (a.id === alert.id ? { ...a, acknowledged: true } : a))
    );
  }, []);

  const handleExportAlertDossier = useCallback(
    (alert: DarkVesselAlert) => {
      handleLocateAlertVessel(alert);
      setDossierOpen(true);
    },
    [handleLocateAlertVessel]
  );

  const handleExportIncidentDossierFromMap = useCallback(
    (payload: { mode: 'forensic' | 'surveillance'; caseId?: string; vesselId?: string }) => {
      if (payload.mode === 'forensic' && payload.caseId) {
        handleSelectForensicCaseById(payload.caseId);
        setDossierOpen(true);
        return;
      }
      if (payload.vesselId) {
        handleSelectVesselFromMap(payload.vesselId);
        setDossierOpen(true);
      }
    },
    [handleSelectForensicCaseById, handleSelectVesselFromMap]
  );

  const handleOpenInspectorLabFromMap = useCallback(
    (payload: { mode: 'forensic' | 'surveillance'; caseId?: string; vesselId?: string }) => {
      if (payload.mode === 'forensic' && payload.caseId) {
        handleSelectForensicCaseById(payload.caseId);
      } else if (payload.vesselId) {
        handleSelectVesselFromMap(payload.vesselId);
      }
      setHudMinimized(false);
      setInspectorOpen(true);
    },
    [handleSelectForensicCaseById, handleSelectVesselFromMap]
  );

  const handleToggleOptionalSimFromMap = useCallback(
    (payload: { vesselId: string; openInspector?: boolean }) => {
      const targetVessel = combinedVessels.find((v) => v.id === payload.vesselId);
      if (!targetVessel) return;

      const currentlyActive = Boolean(simActiveVesselIds[targetVessel.id]);
      const nextActive = !currentlyActive;

      setSelectedVesselId(targetVessel.id);
      setInspectTargetMode('vessel');
      setSimActiveVesselIds((prev) => ({
        ...prev,
        [targetVessel.id]: nextActive,
      }));

      if (nextActive) {
        setLayers((prev) => ({ ...prev, oilDriftEnsemble: true, searchCones: true }));
        setOilOverlayDismissed(false);
        setLiveOilAnchor({
          id: `live-spill-${targetVessel.id}`,
          label: targetVessel.name,
          anchorType: 'vessel',
          lat: targetVessel.lat,
          lon: targetVessel.lon,
          releaseHoursAgo: 6,
        });
        setInspectorTab('drift_cost');
        if (payload.openInspector !== false) {
          setHudMinimized(false);
          setInspectorOpen(true);
        }
      } else {
        setLiveOilAnchor((prev) =>
          prev && prev.id === `live-spill-${targetVessel.id}` ? null : prev
        );
        setOilOverlayDismissed(true);
      }
    },
    [combinedVessels, simActiveVesselIds]
  );

  const handleQueueSarTask = useCallback(
    (intercept: Sgp4InterceptAssessment, targetVessel: Vessel) => {
      const targetLat = selectedDarkEnvelope?.reachabilityCenterLat ?? targetVessel.lat;
      const targetLon = selectedDarkEnvelope?.reachabilityCenterLon ?? targetVessel.lon;
      const taskId = `TASK-${intercept.noradId}-${targetVessel.mmsi.slice(-4)}`;
      const newTask: QueuedSarTask = {
        taskId,
        targetVesselId: targetVessel.id,
        mmsi: targetVessel.mmsi,
        vesselName: targetVessel.name,
        targetLat,
        targetLon,
        satelliteName: intercept.satelliteName,
        noradId: intercept.noradId,
        bandLabel: intercept.bandLabel,
        swathWidthKm: intercept.swathWidthKm,
        aosUtc: intercept.interceptUtc,
        captureProbabilityPct: intercept.captureProbabilityPct,
        queuedAtUtc: new Date().toISOString(),
        status: 'QUEUED',
      };
      setQueuedSarTasks((prev) => {
        const filtered = prev.filter((t) => t.taskId !== taskId);
        return [newTask, ...filtered];
      });
    },
    [selectedDarkEnvelope]
  );

  const handleTriggerLiveOilSpill = useCallback(
    (anchor: {
      id: string;
      label: string;
      anchorType: 'vessel' | 'sar_footprint';
      lat: number;
      lon: number;
    }) => {
      setLayers((prev) => ({ ...prev, oilDriftEnsemble: true, searchCones: true }));
      setOilOverlayDismissed(false);
      setTimeOffsetHours(0);
      if (anchor.anchorType === 'vessel' && anchor.id.startsWith('live-spill-')) {
        const vesselId = anchor.id.replace('live-spill-', '');
        setSimActiveVesselIds((prev) => ({ ...prev, [vesselId]: true }));
      }
      setLiveOilAnchor({
        ...anchor,
        releaseHoursAgo: 6,
      });
    },
    []
  );

  const handleClearLiveOilSpill = useCallback(() => {
    if (selectedVesselId) {
      setSimActiveVesselIds((prev) => ({ ...prev, [selectedVesselId]: false }));
    }
    setLiveOilAnchor(null);
    setOilOverlayDismissed(true);
  }, [selectedVesselId]);

  const handleChangeMode = useCallback((mode: HudMode) => {
    if (mode === 'forensic') {
      // Decouple completely from live AIS / live historical replay feeds
      if (activeScenarioRef.current !== 'live') {
        activeScenarioRef.current = 'live';
        setActiveScenarioId('live');
        setHistoricalPayload(null);
        setHistoricalLoading(false);
        setHistoricalPlaying(false);
      }
      setHudMode('forensic');
      setSelectedVesselId(null);
      setLiveOilAnchor(null);
      setSimActiveVesselIds({});
      setTimeOffsetHours(0);
      setIsPlaying(false);
      setHudMinimized(false);
      setLayers((prev) => ({
        ...prev,
        nauticalLanes: true,
        subseaCables: true,
        sarSwaths: true,
        sarBackscatter: true,
        searchCones: true,
        oilDriftEnsemble: true,
      }));
      // Frame all Med-East historical cases simultaneously (Alexandria -> Port Said/Suez)
      setFlyToRequest({
        lat: 31.34,
        lon: 31.02,
        zoom: 8,
        nonce: Date.now(),
      });
    } else {
      setHudMode('surveillance');
      setSelectedVesselId(null);
      setLayers((prev) => ({
        ...prev,
        nauticalLanes: true,
        subseaCables: true,
        sarSwaths: true,
        sarBackscatter: false,
      }));
      setFlyToRequest({
        lat: 31.65,
        lon: 31.12,
        zoom: 8,
        nonce: Date.now(),
      });
    }
  }, []);

  const handleResetTime = useCallback(() => {
    if (isHistoricalMode) {
      setHistoricalPlaying(false);
      setHistoricalMinute(0);
      return;
    }
    setIsPlaying(false);
    setTimeOffsetHours(0);
  }, [isHistoricalMode]);

  const handleSelectScenario = useCallback((scenarioId: ScenarioId) => {
    activeScenarioRef.current = scenarioId;
    setActiveScenarioId(scenarioId);
    setIsPlaying(false);
    setHistoricalPlaying(false);
    setSelectedVesselId(null);
    setSelectedAsfSceneId(null);

    if (scenarioId === 'live') {
      setHistoricalPayload(null);
      setHistoricalLoading(false);
      setHistoricalMinute(0);
      setHudMode('surveillance');
      setLayers((prev) => ({
        ...prev,
        nauticalLanes: true,
        subseaCables: true,
        sarSwaths: true,
        sarBackscatter: false,
        searchCones: true,
        oilDriftEnsemble: true,
      }));
      setFlyToRequest({
        lat: 31.65,
        lon: 31.12,
        zoom: 8,
        nonce: Date.now(),
      });
      return;
    }

    const meta = getHistoricalScenarioMeta(scenarioId);
    setHudMode('surveillance');
    setHistoricalMinute(0);
    setHistoricalPayload(null);
    setHistoricalLoading(true);
    setInspectTargetMode('vessel');
    setLayers((prev) => ({
      ...prev,
      nauticalLanes: true,
      subseaCables: true,
      sarSwaths: true,
      sarBackscatter: true,
      searchCones: true,
      oilDriftEnsemble: true,
    }));

    if (meta) {
      setFlyToRequest({
        lat: meta.lat,
        lon: meta.lon,
        zoom: meta.zoomTarget,
        nonce: Date.now(),
      });
    }

    fetchHistoricalScenario(scenarioId)
      .then((payload) => {
        if (activeScenarioRef.current !== scenarioId) return;
        setHistoricalPayload(payload);
        setHistoricalLoading(false);
        const suspect = payload.vessels.find((v) => v.isSuspect) ?? payload.vessels[0];
        if (suspect) {
          setSelectedVesselId(suspect.id);
        }
        const firstQuicklook = getFirstValidHistoricalQuicklook(payload.sarSwaths);
        if (firstQuicklook) {
          setSelectedAsfSceneId(firstQuicklook.id);
        }
      })
      .catch(() => {
        if (activeScenarioRef.current !== scenarioId) return;
        setHistoricalLoading(false);
      });
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#060D14] text-slate-100 select-none">
      {/* 1. Edge-to-Edge Full-Screen Map */}
      <TacticalMap
        hudMode={hudMode}
        forensicCases={forensicCases}
        selectedForensicCaseId={activeForensicCase?.id ?? null}
        forensicTimeOffsetHours={timeOffsetHours}
        baseMap={baseMap}
        layers={layers}
        vessels={combinedVessels}
        incidents={isForensicStandalone ? forensicIncidents : allIncidents}
        subseaCables={subseaCables}
        shippingLanes={shippingLanes}
        sarSwaths={isHistoricalMode || isForensicStandalone ? [] : sarSwaths}
        asfScenes={effectiveAsfScenes}
        satellites={isHistoricalMode || isForensicStandalone ? [] : satellites}
        buoys={isHistoricalMode || isForensicStandalone ? [] : buoys}
        weather={effectiveWeather}
        eonetEvents={isHistoricalMode || isForensicStandalone ? [] : eonetEvents}
        selectedIncidentId={selectedIncident.id}
        selectedVesselId={selectedVessel?.id ?? null}
        selectedAsfSceneId={resolvedAsfSceneId}
        activeEnsemble={!isHistoricalMode && isForensicStandalone ? activeEnsemble : null}
        allOilEnsembles={!isHistoricalMode && isForensicStandalone ? allOilEnsembles : []}
        darkEnvelopes={!isHistoricalMode && hudMode === 'surveillance' ? darkEnvelopes : []}
        cableThreatAlerts={!isHistoricalMode && hudMode === 'surveillance' ? cableThreatAlerts : []}
        liveOilSimulation={!isHistoricalMode && hudMode === 'surveillance' ? liveOilSimulation : null}
        simActiveVesselIds={!isHistoricalMode && hudMode === 'surveillance' ? simActiveVesselIds : {}}
        historicalReplay={historicalReplay}
        flyToRequest={flyToRequest}
        hudMinimized={hudMinimized}
        onSelectIncident={handleSelectIncidentFromMap}
        onSelectVessel={handleSelectVesselFromMap}
        onSelectAsfScene={(sceneId) => handleSelectAsfScene(sceneId, false)}
        onSelectForensicCase={handleSelectForensicCaseById}
        onExportIncidentDossier={handleExportIncidentDossierFromMap}
        onOpenInspectorLab={handleOpenInspectorLabFromMap}
        onToggleOptionalSim={handleToggleOptionalSimFromMap}
      />

      {/* 2. Top Telemetry Bar */}
      <TopTelemetryBar
        activeScenarioId={activeScenarioId}
        historicalLoading={historicalLoading}
        historicalReplay={historicalReplay}
        historicalPayload={historicalPayload}
        activeAisCount={
          isForensicStandalone
            ? forensicCases.length
            : isHistoricalMode
              ? combinedVessels.length
              : enrichedLiveVessels.length
        }
        liveAisCount={isForensicStandalone ? 0 : enrichedLiveVessels.length}
        aisStatus={aisStatus}
        aisError={aisError}
        weather={effectiveWeather}
        nextSatellitePass={nextSatellitePass}
        feedDiagnostics={feedDiagnostics}
        hudMode={hudMode}
        forensicCasesCount={forensicCases.length}
        hudMinimized={hudMinimized}
        alertsCount={isForensicStandalone ? 0 : activeAlertsCount}
        unreadAlertsCount={isForensicStandalone ? 0 : unreadAlertsCount}
        alertsOpen={alertsOpen}
        onSelectScenario={handleSelectScenario}
        onResyncFeeds={() => syncAllLiveFeeds(true)}
        onReconnectAisRelay={handleReconnectAisRelay}
        onToggleAlertsDrawer={() => setAlertsOpen((prev) => !prev)}
        onChangeMode={handleChangeMode}
        onToggleMinimize={() => setHudMinimized((prev) => !prev)}
      />

      {/* 2b. Automated Tactical Notification Feed (Coastal Surveillance Only) */}
      {!isForensicStandalone && (
        <TacticalNotificationFeed
          alerts={tacticalAlerts}
          weather={effectiveWeather}
          drawerOpen={alertsOpen}
          latestToastAlert={latestToastAlert}
          onCloseDrawer={() => setAlertsOpen(false)}
          onOpenDrawer={() => {
            setAlertsOpen(true);
            setToastAlertId(null);
          }}
          onDismissToast={(id) => {
            if (toastAlertId === id) setToastAlertId(null);
          }}
          onAcknowledgeAlert={handleAcknowledgeAlert}
          onAcknowledgeAll={handleAcknowledgeAllAlerts}
          onClearResolved={handleClearResolvedAlerts}
          onLocateAlertVessel={handleLocateAlertVessel}
          onExportAlertDossier={handleExportAlertDossier}
        />
      )}

      {/* 3. Left Panel : Decoupled Forensic Case Repository / Live AIS Targets */}
      <div
        className={`transition-all duration-200 ease-out ${
          hudMinimized
            ? 'opacity-0 -translate-x-8 pointer-events-none'
            : 'opacity-100 translate-x-0'
        }`}
      >
        <IncidentTriagePanel
          hudMode={hudMode}
          incidents={filteredIncidents}
          forensicCases={forensicCases}
          selectedForensicCaseId={activeForensicCase?.id ?? ''}
          forensicTimeOffsetHours={timeOffsetHours}
          liveVessels={
            isForensicStandalone
              ? []
              : isHistoricalMode
                ? combinedVessels
                : enrichedLiveVessels
          }
          darkEnvelopes={isHistoricalMode || isForensicStandalone ? [] : darkEnvelopes}
          cableThreatAlerts={isHistoricalMode || isForensicStandalone ? [] : cableThreatAlerts}
          nextSatellitePass={isForensicStandalone ? undefined : nextSatellitePass}
          aisStatus={isHistoricalMode ? 'connected' : aisStatus}
          aisError={aisError}
          activeFilter={incidentFilter}
          selectedIncidentId={selectedIncident.id}
          selectedVesselId={selectedVessel?.id ?? null}
          onChangeFilter={setIncidentFilter}
          onLocateIncident={handleLocateIncident}
          onInspectIncident={handleInspectIncident}
          onSelectForensicCase={handleSelectForensicCase}
          onLocateForensicCase={handleLocateForensicCase}
          onInspectForensicCase={handleInspectForensicCase}
          onAppendForensicCase={handleAppendForensicCase}
          onLaunchHistoricalReplay={(scenarioId) => handleSelectScenario(scenarioId)}
          onSelectLiveVessel={handleSelectLiveVesselFromList}
          onReconnectAis={handleReconnectAisRelay}
        />
      </div>

      {/* 4. Right Panel : Target Physics, Attribution & Cost Inspector (On-Demand Only) */}
      {inspectorOpen && (
        <div
          className={`transition-all duration-200 ease-out ${
            hudMinimized
              ? 'opacity-0 translate-x-8 pointer-events-none'
              : 'opacity-100 translate-x-0'
          }`}
        >
          <TargetInspectorPanel
            hudMode={hudMode}
            activeForensicCase={isForensicStandalone ? activeForensicCase : undefined}
            forensicTimeOffsetHours={timeOffsetHours}
            incident={selectedIncident}
            vessel={selectedVessel}
            weather={effectiveWeather}
            asfScenes={effectiveAsfScenes}
            selectedAsfSceneId={resolvedAsfSceneId}
            inspectTargetMode={isForensicStandalone ? 'vessel' : inspectTargetMode}
            liveSnapshot={liveForensicSnapshot}
            queuedSarTasks={isForensicStandalone ? [] : queuedSarTasks}
            activeTab={inspectorTab}
            onChangeTab={setInspectorTab}
            onSelectAsfScene={(sceneId) => handleSelectAsfScene(sceneId, true)}
            onSimulateBlackout={handleSimulateBlackout}
            onAdvanceBlackout={handleAdvanceBlackout}
            onClearBlackout={handleClearBlackout}
            onQueueSarTask={handleQueueSarTask}
            onTriggerLiveOilSpill={handleTriggerLiveOilSpill}
            onClearLiveOilSpill={handleClearLiveOilSpill}
            isSimActive={Boolean(selectedVessel?.id && simActiveVesselIds[selectedVessel.id])}
            onToggleOptionalSim={() => {
              if (selectedVessel?.id) {
                handleToggleOptionalSimFromMap({
                  vesselId: selectedVessel.id,
                  openInspector: true,
                });
              }
            }}
            onOpenDossier={() => setDossierOpen(true)}
            onClose={() => setInspectorOpen(false)}
          />
        </div>
      )}

      {/* 5. Bottom Control Deck : Timeline Scrubber & Layer Matrix */}
      <BottomControlDeck
        hudMode={hudMode}
        activeForensicCase={isForensicStandalone ? activeForensicCase : undefined}
        forensicCasesCount={forensicCases.length}
        baseMap={baseMap}
        layers={layers}
        timeOffsetHours={timeOffsetHours}
        isPlaying={isHistoricalMode ? historicalPlaying : isPlaying}
        hudMinimized={hudMinimized}
        isHistoricalMode={isHistoricalMode}
        historicalDateStr={historicalPayload?.dateStr}
        historicalMinute={historicalMinute}
        historicalDarkMinute={historicalPayload?.darkDropoutMinute}
        historicalPassMinute={historicalPayload?.primaryPassMinute}
        historicalPhase={historicalReplay?.phase}
        onChangeBaseMap={setBaseMap}
        onToggleLayer={handleToggleLayer}
        onChangeTimeOffset={(h) => {
          setIsPlaying(false);
          setTimeOffsetHours(h);
        }}
        onChangeHistoricalMinute={(m) => {
          setHistoricalPlaying(false);
          setHistoricalMinute(Math.max(0, Math.min(1439, m)));
        }}
        onTogglePlay={() => {
          if (isHistoricalMode) {
            if (!historicalPlaying && historicalMinute >= 1439) {
              setHistoricalMinute(0);
            }
            setHistoricalPlaying((p) => !p);
          } else {
            if (!isPlaying && timeOffsetHours >= 24) {
              setTimeOffsetHours(-48);
            }
            setIsPlaying((p) => !p);
          }
        }}
        onResetTime={handleResetTime}
      />

      {/* 6. Printable Forensic Violation Dossier Modal */}
      {dossierOpen && (
        <ViolationDossierModal
          hudMode={hudMode}
          activeForensicCase={isForensicStandalone ? activeForensicCase : undefined}
          incident={selectedIncident}
          vessel={selectedVessel}
          weather={effectiveWeather}
          liveSnapshot={liveForensicSnapshot}
          queuedSarTasks={isForensicStandalone ? [] : queuedSarTasks}
          onClose={() => setDossierOpen(false)}
        />
      )}

      {/* 7. Initial Entry Mission Briefing Modal */}
      {briefingOpen && (
        <MissionBriefingModal onEnter={() => setBriefingOpen(false)} />
      )}
    </div>
  );
}
