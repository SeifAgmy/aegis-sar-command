export type BaseMapId = 'satellite' | 'dark_radar' | 'nautical' | 'nasa_viirs';

export type HudMode = 'forensic' | 'surveillance';

export type IncidentFilter = 'all' | 'dark_spoofing' | 'oil_spills' | 'subsea_cables';

export type InspectorTab = 'behavior' | 'sar_lab' | 'drift_cost';

export type VesselStatus = 'legal' | 'spoofed' | 'dark';

export type IncidentSeverity = 'critical' | 'high' | 'medium';

export interface LatLngPoint {
  lat: number;
  lon: number;
}

export interface LayerVisibility {
  nauticalLanes: boolean;
  subseaCables: boolean;
  sarSwaths: boolean;
  sarBackscatter: boolean;
  searchCones: boolean;
  oilDriftEnsemble: boolean;
}

export interface Vessel {
  id: string;
  mmsi: string;
  imo: string;
  name: string;
  flag: string;
  vesselType: string;
  lengthM: number;
  beamM: number;
  draftM: number;
  lat: number;
  lon: number;
  sogKts: number; // Speed over ground
  cogDeg: number; // Course over ground
  headingDeg: number;
  status: VesselStatus;
  aisLastSeenUtc: string;
  aisGapHours: number;
  coverageNeighborsCount: number;
  nearestCableName: string;
  nearestCableDistanceKm: number;
  incidentId?: string;
  isLiveAis?: boolean;
  shipTypeCode?: number;
  callSign?: string;
  destination?: string;
  navStatus?: string;
  trackHistory?: Array<LatLngPoint & { offsetHours: number }>;
}

export interface SarDetectionMetrics {
  satellite: string;
  sensorMode: string;
  acquisitionTimeUtc: string;
  incidenceAngleDeg: number;
  polarization: string;
  cfarThresholdDb: number;
  dbscanClusterPts: number;
  azimuthDisplacementM: number;
  rangeOffsetM: number;
  calculatedTrueSpeedKts: number;
  reportedAisSpeedKts: number | null;
  vvBackscatterDb: number;
  slickContrastDb: number;
  wakeApexLat: number;
  wakeApexLon: number;
  observabilityProbabilityPct: number;
  commercialTaskingRecommended: boolean;
  nextTaskingWindowUtc: string;
}

export interface CostRange {
  minM: number;
  medianM: number;
  maxM: number;
}

export interface MonteCarloCostModel {
  currency: 'USD';
  iterations: number;
  shorelineCleanup: CostRange;
  portSuezDisruption: CostRange;
  marineHabitatLoss: CostRange;
  totalEstimatedLiability: CostRange;
}

export interface DriftAttributionModel {
  bayesianScorePct: number;
  priorProbabilityPct: number;
  kinematicLikelihoodPct: number;
  slickAreaKm2: number;
  estimatedVolumeBarrels: number;
  oilType: string;
  coastlineImpactEtaHours: number | null;
  impactZoneName: string;
  impactLat: number;
  impactLon: number;
  slickOriginLat: number;
  slickOriginLon: number;
  slickT0Lat: number;
  slickT0Lon: number;
  driftBearingDeg: number;
  driftSpeedKts: number;
  costModel: MonteCarloCostModel;
}

export interface Incident {
  id: string;
  caseCode: string;
  title: string;
  shortTitle: string;
  category: Exclude<IncidentFilter, 'all'>;
  severity: IncidentSeverity;
  threatScore: number; // 0-100
  timestampUtc: string;
  lat: number;
  lon: number;
  zoomTarget: number;
  primaryVesselId: string;
  summary: string;
  causalChain: string[];
  kpIndexAtEvent: number;
  kpConfidenceVerdict: string;
  coverageAwareVerified: boolean;
  spoofingRingCenter?: LatLngPoint & { radiusKm: number; affectedCount: number };
  sarMetrics: SarDetectionMetrics;
  driftAttribution?: DriftAttributionModel;
}

export interface SubseaCable {
  id: string;
  name: string;
  capacityTbps: number;
  landingStation: string;
  bufferRadiusKm: number;
  coordinates: LatLngPoint[];
}

export interface ShippingLane {
  id: string;
  name: string;
  corridorType: 'TSS_INBOUND' | 'TSS_OUTBOUND' | 'ANCHORAGE' | 'SUEZ_APPROACH';
  coordinates: LatLngPoint[];
}

export interface SarSwath {
  id: string;
  satellite: string;
  passType: 'ASCENDING' | 'DESCENDING';
  acquisitionWindowUtc: string;
  swathWidthKm: number;
  color: string;
  polygon: LatLngPoint[];
}

export interface AsfSarScene {
  id: string;
  sceneName: string;
  platform: string;
  bandLabel: 'C-BAND (SENTINEL-1)' | 'L-BAND (NISAR)';
  beamMode: string;
  polarization: string;
  startTimeUtc: string;
  flightDirection: string;
  footprintCoords: LatLngPoint[];
  browseImageUrl?: string;
  downloadUrl?: string;
  isLiveData: boolean;
}

export interface MetoceanBuoy {
  id: string;
  name: string;
  lat: number;
  lon: number;
  windSpeedKts: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  windDirectionCardinal: string;
  waveHeightM: number;
  currentSpeedKts: number;
  currentDirectionDeg: number;
  isLiveData: boolean;
  updatedUtc: string;
}

export interface EonetEvent {
  id: string;
  title: string;
  category: string;
  dateUtc: string;
  lat: number;
  lon: number;
  link?: string;
  isLiveData: boolean;
}

export type LiveFeedId =
  | 'gibs'
  | 'eonet'
  | 'donki_noaa'
  | 'norad_tle'
  | 'open_meteo'
  | 'asf_daac'
  | 'ais_live';

export interface LiveFeedDiagnostic {
  id: LiveFeedId;
  label: string;
  endpoint: string;
  status: '200 OK' | 'CACHED FALLBACK';
  lastSyncUtc: string;
  rawSummary: string;
}

export interface WeatherState {
  windSpeedKts: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  windDirectionCardinal: string;
  waveHeightM: number;
  seaSurfaceTempC: number;
  surfaceCurrentKts: number;
  surfaceCurrentDeg: number;
  kpIndex: number;
  kpStatus: 'NOMINAL' | 'MODERATE' | 'STORM';
  solarFluxSfu: number;
  donkiVerified: boolean;
  donkiStormAlertsCount: number;
  donkiLatestAlertTime?: string;
  kpSource: 'NOAA_SWPC_LIVE' | 'FALLBACK';
  metoceanSource: 'OPEN_METEO_LIVE' | 'FALLBACK';
  sarObservabilityPct: number;
  updatedUtc: string;
}

export interface OrbitalPass {
  id: string;
  satellite: string;
  agency: string;
  band: 'C-Band' | 'L-Band' | 'S-Band' | 'X-Band';
  aosUtc: string;
  countdownSeconds: number;
  maxElevationDeg: number;
  observabilityPct: number;
  swathCoverageZone: string;
  commercialTasking: boolean;
}

export interface SatelliteTleRecord {
  id: string;
  noradId: string;
  name: string;
  bandLabel: 'C-BAND' | 'L-BAND';
  color: string;
  tle1: string;
  tle2: string;
  isLiveTle: boolean;
}

export interface SatelliteGroundState {
  id: string;
  noradId: string;
  name: string;
  bandLabel: 'C-BAND' | 'L-BAND';
  color: string;
  lat: number;
  lon: number;
  altitudeKm: number;
  velocityKmS: number;
  nextPassSeconds: number;
  nextPassTimeUtc: string;
  isLiveTle: boolean;
  trackSegments: LatLngPoint[][];
}

export interface TelemetrySummary {
  activeAisTargets: number;
  darkTargetsDetected: number;
  spoofedTargetsDetected: number;
  activeOilPlumes: number;
  subseaCableAlerts: number;
}

export interface SlickEnsembleState {
  incidentId: string;
  timeOffsetHours: number;
  particles: Array<LatLngPoint & { weight: number; radiusM: number }>;
  slickPolygon: LatLngPoint[];
  searchConePolygon: LatLngPoint[];
  vesselPositionAtTime: LatLngPoint;
  vesselHeadingAtTime: number;
  backtrackPath: LatLngPoint[];
  forwardTrajectory: LatLngPoint[];
  phaseLabel: string;
}

export interface SimulatedBlackoutRecord {
  vesselId: string;
  triggeredAtMs: number;
  offsetSeconds: number;
  lkpLat: number;
  lkpLon: number;
  lastSogKts: number;
  lastCogDeg: number;
  lastHeadingDeg: number;
}

export interface CableThreatAssessment {
  cableId: string;
  cableName: string;
  capacityTbps: number;
  landingStation: string;
  distanceKm: number;
  bufferRadiusKm: number;
  intersectsEnvelope: boolean;
  anchorDragRiskScore: number; // 0-100
}

export interface DarkEnvelopeState {
  vesselId: string;
  mmsi: string;
  vesselName: string;
  flag: string;
  vesselType: string;
  lkpLat: number;
  lkpLon: number;
  isSimulated: boolean;
  episodeKey: string;
  gapMinutes: number;
  thresholdMinutes: number;
  severity: 'routine_gap' | 'confirmed_dark';
  isConfirmedDark: boolean;
  maxSpeedKts: number;
  reachabilityCenterLat: number;
  reachabilityCenterLon: number;
  reachabilityRadiusKm: number;
  reachabilityDiameterKm: number;
  envelopePolygon: LatLngPoint[];
  headingConePolygon: LatLngPoint[];
  drCenterLine: LatLngPoint[];
  intersectingCables: CableThreatAssessment[];
  nearestCable: CableThreatAssessment;
}

export type SarConfidenceCategory =
  | 'NOMINAL_AIS_STREAM'
  | 'ROUTINE_GAP_MONITORING'
  | 'DARK_TARGET_CORROBORATED'
  | 'VERIFIED_HYDROCARBON'
  | 'LOW_WIND_LOOK_ALIKE'
  | 'HIGH_SEA_STATE_DISPERSION'
  | 'MARGINAL_TRANSITION';

export interface SarConfidenceAssessment {
  scorePct: number | null;
  category: SarConfidenceCategory;
  shortLabel: string;
  badgeText: string;
  explanation: string;
  windSpeedKts: number;
  tone: 'cyan' | 'amber';
}

export interface CoastalImpactAssessment {
  approachesOrIntersects: boolean;
  intersectsWithin24h: boolean;
  nearestSectorName: string;
  sectorSensitivity: string;
  nearestCoastLat: number;
  nearestCoastLon: number;
  distanceToCoastKm: number;
  estimatedLandfallEtaHours: number | null;
  windDriftSpeedKts: number;
  effectiveDriftSpeedKts: number;
  driftBearingDeg: number;
  slickWidthKm: number;
  containmentBoomMeters: number;
  responseRequirementLabel: string;
}

export interface DarkVesselAlert {
  id: string;
  episodeKey: string;
  vesselId: string;
  vesselName: string;
  mmsi: string;
  flag: string;
  vesselType: string;
  blackoutDurationMinutes: number;
  blackoutDurationFormatted: string;
  triggeredAtUtc: string;
  lkpLat: number;
  lkpLon: number;
  reachabilityRadiusKm: number;
  maxSpeedKts: number;
  isSimulated: boolean;
  acknowledged: boolean;
  active: boolean;
  localWindSpeedKts?: number;
  sarConfidence?: SarConfidenceAssessment;
}

export interface Sgp4InterceptAssessment {
  satelliteId: string;
  satelliteName: string;
  noradId: string;
  bandLabel: 'C-BAND' | 'L-BAND';
  swathWidthKm: number;
  interceptEtaSeconds: number;
  interceptUtc: string;
  countdownFormatted: string;
  closestApproachKm: number;
  captureProbabilityPct: number;
  evasiveDiskDiameterKm: number;
  orbitDirection: 'ASCENDING' | 'DESCENDING';
  isLiveTle: boolean;
}

export interface QueuedSarTask {
  taskId: string;
  targetVesselId: string;
  mmsi: string;
  vesselName: string;
  targetLat: number;
  targetLon: number;
  satelliteName: string;
  noradId: string;
  bandLabel: 'C-BAND' | 'L-BAND';
  swathWidthKm: number;
  aosUtc: string;
  captureProbabilityPct: number;
  queuedAtUtc: string;
  status: 'QUEUED';
}

export interface LiveOilSpillSimulation {
  id: string;
  sourceLabel: string;
  anchorType: 'vessel' | 'sar_footprint';
  originLat: number;
  originLon: number;
  originTimeUtc: string;
  releaseHoursAgo: number;
  currentCenterLat: number;
  currentCenterLon: number;
  impactLat: number;
  impactLon: number;
  impactZoneName: string;
  coastlineImpactEtaHours: number | null;
  driftBearingDeg: number;
  driftSpeedKts: number;
  windContributionKts: number;
  currentContributionKts: number;
  slickAreaKm2: number;
  estimatedVolumeBarrels: number;
  particles: Array<LatLngPoint & { weight: number; radiusM: number }>;
  slickPolygon: LatLngPoint[];
  backtrackPath: LatLngPoint[];
  forwardTrajectory: LatLngPoint[];
  forwardConePolygon: LatLngPoint[];
  phaseLabel: string;
}

export interface CableProximityAlert {
  vesselId: string;
  vesselName: string;
  mmsi: string;
  lat: number;
  lon: number;
  sogKts: number;
  cableId: string;
  cableName: string;
  capacityTbps: number;
  distanceKm: number;
  reason: 'PROXIMITY_UNDER_3KM' | 'SUSPICIOUS_SLOWDOWN' | 'DARK_ENVELOPE_INTERSECT';
  anchorDragRiskScore: number;
}

export interface LiveForensicSnapshot {
  targetLabel: string;
  targetSubtitle: string;
  lat: number;
  lon: number;
  sogKts: number;
  cogDeg: number;
  isDarkCutoff: boolean;
  localMetocean: {
    windSpeedKts: number;
    windSpeedMs: number;
    windDirectionDeg: number;
    windDirectionCardinal: string;
    currentSpeedKts: number;
    currentDirectionDeg: number;
    waveHeightM: number;
    nearestBuoyName: string;
    isLive: boolean;
  };
  dopplerPhysics: {
    satelliteName: string;
    incidenceAngleDeg: number;
    slantRangeKm: number;
    satelliteSpeedMs: number;
    radialVelocityMs: number;
    azimuthShiftM: number;
    wakeSeparationM: number;
    sarDerivedSpeedKts: number;
    aisSpeedDeltaKts: number;
    vvBackscatterDb: number;
    cfarThresholdDb: number;
  };
  cableRisk: CableThreatAssessment;
  cableProximityAlert: CableProximityAlert | null;
  financialLiability: MonteCarloCostModel & {
    cableExposureM: number;
    spillExposureM: number;
    riskTier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  };
  sarConfidence: SarConfidenceAssessment;
  coastalImpact: CoastalImpactAssessment;
  darkEnvelope: DarkEnvelopeState | null;
  sgp4Intercept: Sgp4InterceptAssessment | null;
  oilSimulation: LiveOilSpillSimulation | null;
}

export type ScenarioId =
  | 'live'
  | '2019-05-21'
  | '2021-12-26'
  | '2015-04-19'
  | '2014-10-04'
  | '2004-06-15';

export interface HistoricalScenarioMeta {
  id: Exclude<ScenarioId, 'live'>;
  caseId?: string;
  dateStr: string;
  label: string;
  shortLabel: string;
  lat: number;
  lon: number;
  zoomTarget: number;
  spillAreaKm2: number;
  estimatedBarrels: number;
  oilType: string;
  platformHint: string;
  suspectVesselName: string;
  suspectMmsi: string;
  suspectImo: string;
  suspectFlag: string;
  suspectType: string;
  description: string;
}

export interface HistoricalHourlyWeather {
  hourUtc: number;
  timeIso: string;
  windSpeedKts: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  windDirectionCardinal: string;
}

export interface HistoricalTrackPoint {
  minuteOfDay: number;
  lat: number;
  lon: number;
  sogKts: number;
  cogDeg: number;
  headingDeg: number;
  isDark: boolean;
}

export interface HistoricalVesselTimeline {
  id: string;
  mmsi: string;
  imo: string;
  name: string;
  flag: string;
  vesselType: string;
  lengthM: number;
  beamM: number;
  draftM: number;
  isSuspect: boolean;
  darkCutoffMinute: number | null;
  trackByMinute: HistoricalTrackPoint[];
}

export interface HistoricalTimelinePayload {
  dateStr: string;
  scenario: HistoricalScenarioMeta;
  asfStatus: '200 OK' | 'CACHED FALLBACK';
  weatherStatus: '200 OK' | 'CACHED FALLBACK';
  sarSwaths: AsfSarScene[];
  primaryPassMinute: number;
  primaryPassUtc: string;
  primarySatelliteName: string;
  darkDropoutMinute: number;
  darkDropoutUtc: string;
  hourlyWeather: HistoricalHourlyWeather[];
  vessels: HistoricalVesselTimeline[];
  slickOrigin: LatLngPoint;
  slickAreaKm2: number;
}

export interface HistoricalReplayState {
  dateStr: string;
  minuteOfDay: number;
  clockUtc: string;
  phase: 'PRE_DROPOUT' | 'DARK_SEARCH_ACTIVE' | 'SAR_PASS_ILLUMINATED';
  sarPassCountdownSeconds: number;
  sarSwathIlluminated: boolean;
  backscatterBounds: [[number, number], [number, number]] | null;
  currentWeather: HistoricalHourlyWeather;
  vesselsAtMinute: Vessel[];
  suspectTrackHistory: LatLngPoint[];
  suspectDarkCone: {
    lkpLat: number;
    lkpLon: number;
    reachabilityRadiusKm: number;
    circlePolygon: LatLngPoint[];
    forwardConePolygon: LatLngPoint[];
    drCenterLine: LatLngPoint[];
    projectedCenterLat: number;
    projectedCenterLon: number;
    deltaTMinutesToPass: number;
    elapsedDarkMinutes: number;
    targetPassUtc: string;
  } | null;
  oilDrift: LiveOilSpillSimulation | null;
}

export interface ForensicSpillDimensions {
  areaKm2: number;
  estimatedVolumeBarrels: number;
  lengthKm: number;
  maxWidthKm: number;
  oilType: string;
  slickBearingDeg: number;
  driftSpeedKts: number;
}

export interface ForensicSarPassDetails {
  satellite: string;
  sensorMode: string;
  polarization: string;
  passTimestampUtc: string;
  passCoordinates: LatLngPoint;
  incidenceAngleDeg: number;
  cfarThresholdDb: number;
  dbscanClusterPts: number;
  azimuthDisplacementM: number;
  rangeOffsetM: number;
  calculatedTrueSpeedKts: number;
  vvBackscatterDb: number;
  slickContrastDb: number;
  observabilityProbabilityPct: number;
}

export interface ForensicCaseRecord {
  id: string;
  caseCode: string;
  historicalScenarioId?: Exclude<ScenarioId, 'live'>;
  caseIdSlug: string;
  dateStr: string;
  timestampUtc: string;
  blackoutTimestampUtc: string;
  title: string;
  shortTitle: string;
  sectorName: string;
  classification: Exclude<IncidentFilter, 'all'>;
  classificationLabel: string;
  severity: IncidentSeverity;
  threatScore: number;
  zoomTarget: number;
  stopCoordinates: LatLngPoint;
  preBlackoutTrack: Array<LatLngPoint & { offsetHours: number }>;
  primaryVessel: {
    id: string;
    name: string;
    mmsi: string;
    imo: string;
    flag: string;
    vesselType: string;
    lengthM: number;
    beamM: number;
    draftM: number;
    sogAtBlackoutKts: number;
    cogDeg: number;
    headingDeg: number;
    status: VesselStatus;
    aisGapHours: number;
    coverageNeighborsCount: number;
    nearestCableName: string;
    nearestCableDistanceKm: number;
  };
  spill: ForensicSpillDimensions;
  sarPass: ForensicSarPassDetails;
  metoceanAtEvent: {
    windSpeedKts: number;
    windDirectionDeg: number;
    windDirectionCardinal: string;
    currentSpeedKts: number;
    currentDirectionDeg: number;
    kpIndexAtEvent: number;
    kpConfidenceVerdict: string;
  };
  impactAssessment: {
    bayesianScorePct: number;
    priorProbabilityPct: number;
    kinematicLikelihoodPct: number;
    coastlineImpactEtaHours: number | null;
    impactZoneName: string;
    impactCoordinates: LatLngPoint;
    costModel: MonteCarloCostModel;
  };
  forensicSummary: string;
  causalChain: string[];
  tags: string[];
  isExternalIngest?: boolean;
}

export type ForensicVesselPhase =
  | 'PRE_BLACKOUT_TRANSIT'
  | 'AIS_BLACKOUT_TRANSIT'
  | 'SAR_PASS_STOP'
  | 'POST_PASS_DRIFT';

export interface ForensicTemporalState {
  caseId: string;
  timeOffsetHours: number;
  lat: number;
  lon: number;
  headingDeg: number;
  sogKts: number;
  status: VesselStatus;
  phase: ForensicVesselPhase;
  phaseLabel: string;
  simulatedUtcIso: string;
  simulatedDateStr: string;
  simulatedClockUtc: string;
  incidentDayHoursElapsed: number;
  incidentDayWindowHours: number;
  incidentDayDelta: number;
  incidentDayElapsedLabel: string;
  blackoutOffsetHours: number;
  transitProgressPct: number;
  isBlackoutActive: boolean;
  isSlickVisible: boolean;
  traversedTrack: LatLngPoint[];
  remainingTrack: LatLngPoint[];
}


