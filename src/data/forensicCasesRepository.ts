import {
  ForensicCaseRecord,
  ForensicTemporalState,
  ForensicVesselPhase,
  Incident,
  IncidentFilter,
  LatLngPoint,
  SlickEnsembleState,
  Vessel,
} from '../types/telemetry';

/**
 * Modular, extensible historical incident repository for the dedicated Forensic Case Lab.
 * Completely decoupled from live AIS feeds and live orbital streams.
 * New anomalies or external case files can be appended directly or normalized via normalizeExternalForensicCase().
 */
export const forensicCasesRepository: ForensicCaseRecord[] = [
  {
    id: 'forensic-2019-05-21',
    caseCode: 'HIST-2019-01',
    historicalScenarioId: '2019-05-21',
    caseIdSlug: 'alexandria_2019_05_21',
    dateStr: '2019-05-21',
    timestampUtc: '2019-05-21T04:05:00Z',
    blackoutTimestampUtc: '2019-05-21T01:45:00Z',
    title: 'Alexandria Port Longitudinal Discharge',
    shortTitle: '2019-05-21 · Alexandria Discharge',
    sectorName: 'Alexandria Western Harbor Approach',
    classification: 'oil_spills',
    classificationLabel: 'Longitudinal Bilge Discharge',
    severity: 'critical',
    threatScore: 91,
    zoomTarget: 11,
    stopCoordinates: { lat: 31.23, lon: 29.86 },
    preBlackoutTrack: [
      { lat: 31.4, lon: 29.5, offsetHours: -48 },
      { lat: 31.32, lon: 29.65, offsetHours: -24 },
      { lat: 31.25, lon: 29.78, offsetHours: -6 },
      { lat: 31.23, lon: 29.86, offsetHours: 0 },
    ],
    primaryVessel: {
      id: 'forensic-vessel-2019-05-21',
      name: 'MT NILE HORIZON',
      mmsi: '636019412',
      imo: '9418207',
      flag: 'LR',
      vesselType: 'Tanker',
      lengthM: 228,
      beamM: 36,
      draftM: 11.8,
      sogAtBlackoutKts: 11.4,
      cogDeg: 112,
      headingDeg: 112,
      status: 'dark',
      aisGapHours: 2.33,
      coverageNeighborsCount: 24,
      nearestCableName: 'SEA-ME-WE 5',
      nearestCableDistanceKm: 3.4,
    },
    spill: {
      areaKm2: 14.8,
      estimatedVolumeBarrels: 410,
      lengthKm: 11.6,
      maxWidthKm: 1.4,
      oilType: 'Heavy Bilge / Fuel Oil',
      slickBearingDeg: 138,
      driftSpeedKts: 0.62,
    },
    sarPass: {
      satellite: 'SENTINEL-1A (C-BAND)',
      sensorMode: 'IW (Interferometric Wide)',
      polarization: 'VV+VH',
      passTimestampUtc: '2019-05-21T04:05:00Z',
      passCoordinates: { lat: 31.242, lon: 29.845 },
      incidenceAngleDeg: 34.6,
      cfarThresholdDb: 4.2,
      dbscanClusterPts: 132,
      azimuthDisplacementM: 384,
      rangeOffsetM: 24,
      calculatedTrueSpeedKts: 11.4,
      vvBackscatterDb: 18.2,
      slickContrastDb: -8.9,
      observabilityProbabilityPct: 92.8,
    },
    metoceanAtEvent: {
      windSpeedKts: 11,
      windDirectionDeg: 318,
      windDirectionCardinal: 'NW',
      currentSpeedKts: 0.35,
      currentDirectionDeg: 108,
      kpIndexAtEvent: 2.0,
      kpConfidenceVerdict: 'Kp 2.0 (Nominal): Ionospheric blackout excluded',
    },
    impactAssessment: {
      bayesianScorePct: 91.4,
      priorProbabilityPct: 64.0,
      kinematicLikelihoodPct: 94.8,
      coastlineImpactEtaHours: 11.5,
      impactZoneName: 'Alexandria Western Breakwater',
      impactCoordinates: { lat: 31.198, lon: 29.895 },
      costModel: {
        currency: 'USD',
        iterations: 10000,
        shorelineCleanup: { minM: 2.1, medianM: 3.9, maxM: 7.4 },
        portSuezDisruption: { minM: 1.2, medianM: 2.4, maxM: 4.9 },
        marineHabitatLoss: { minM: 0.9, medianM: 1.8, maxM: 3.6 },
        totalEstimatedLiability: { minM: 4.2, medianM: 8.1, maxM: 15.9 },
      },
    },
    forensicSummary:
      'Longitudinal bilge and bunker discharge imaged offshore Alexandria Western Harbor approach after a 2.33h AIS transponder cutoff.',
    causalChain: [
      'AIS broadcast terminated at 01:45 UTC while 24 adjacent harbor-approach vessels maintained continuous telemetry.',
      'Sentinel-1A IW pass at 04:05 UTC mapped a 14.8 km² (11.6 x 1.4 km) damped filament aligned to the pre-blackout heading.',
      'Azimuth Doppler offset (+384 m) confirms vessel maintained 11.4 kts underway across the discharge track.',
    ],
    tags: ['Alexandria', 'Sentinel-1A', 'Bilge Discharge', '2019'],
  },
  {
    id: 'forensic-2021-12-26',
    caseCode: 'HIST-2021-02',
    historicalScenarioId: '2021-12-26',
    caseIdSlug: 'suez_2021_12_26',
    dateStr: '2021-12-26',
    timestampUtc: '2021-12-26T15:48:00Z',
    blackoutTimestampUtc: '2021-12-26T12:15:00Z',
    title: 'Suez Canal NW Entrance Slick',
    shortTitle: '2021-12-26 · Suez NW Slick',
    sectorName: 'Port Said / Suez NW Approach',
    classification: 'dark_spoofing',
    classificationLabel: 'AIS-Dark Tanker Slick',
    severity: 'critical',
    threatScore: 94,
    zoomTarget: 11,
    stopCoordinates: { lat: 31.38, lon: 32.25 },
    preBlackoutTrack: [
      { lat: 31.6, lon: 32.0, offsetHours: -48 },
      { lat: 31.5, lon: 32.12, offsetHours: -24 },
      { lat: 31.44, lon: 32.19, offsetHours: -6 },
      { lat: 31.38, lon: 32.25, offsetHours: 0 },
    ],
    primaryVessel: {
      id: 'forensic-vessel-2021-12-26',
      name: 'MT RED SEA VANGUARD',
      mmsi: '355041982',
      imo: '9391145',
      flag: 'PA',
      vesselType: 'Tanker',
      lengthM: 244,
      beamM: 42,
      draftM: 13.2,
      sogAtBlackoutKts: 10.8,
      cogDeg: 136,
      headingDeg: 136,
      status: 'dark',
      aisGapHours: 3.55,
      coverageNeighborsCount: 39,
      nearestCableName: 'FLAG Europe-Asia',
      nearestCableDistanceKm: 4.2,
    },
    spill: {
      areaKm2: 18.4,
      estimatedVolumeBarrels: 580,
      lengthKm: 9.8,
      maxWidthKm: 2.1,
      oilType: 'Arabian Medium Crude',
      slickBearingDeg: 144,
      driftSpeedKts: 0.74,
    },
    sarPass: {
      satellite: 'SENTINEL-1A (C-BAND)',
      sensorMode: 'IW (Interferometric Wide)',
      polarization: 'VV+VH',
      passTimestampUtc: '2021-12-26T15:48:00Z',
      passCoordinates: { lat: 31.391, lon: 32.238 },
      incidenceAngleDeg: 35.4,
      cfarThresholdDb: 4.4,
      dbscanClusterPts: 156,
      azimuthDisplacementM: 402,
      rangeOffsetM: 27,
      calculatedTrueSpeedKts: 10.8,
      vvBackscatterDb: 19.1,
      slickContrastDb: -9.6,
      observabilityProbabilityPct: 94.1,
    },
    metoceanAtEvent: {
      windSpeedKts: 14,
      windDirectionDeg: 324,
      windDirectionCardinal: 'NW',
      currentSpeedKts: 0.35,
      currentDirectionDeg: 108,
      kpIndexAtEvent: 1.7,
      kpConfidenceVerdict: 'Kp 1.7 (Nominal): Intentional AIS transponder shutdown verified',
    },
    impactAssessment: {
      bayesianScorePct: 93.8,
      priorProbabilityPct: 69.0,
      kinematicLikelihoodPct: 96.1,
      coastlineImpactEtaHours: 9.2,
      impactZoneName: 'Port Said West Jetty',
      impactCoordinates: { lat: 31.312, lon: 32.305 },
      costModel: {
        currency: 'USD',
        iterations: 10000,
        shorelineCleanup: { minM: 3.4, medianM: 6.1, maxM: 11.2 },
        portSuezDisruption: { minM: 2.5, medianM: 5.2, maxM: 9.8 },
        marineHabitatLoss: { minM: 1.4, medianM: 2.9, maxM: 5.8 },
        totalEstimatedLiability: { minM: 7.3, medianM: 14.2, maxM: 26.8 },
      },
    },
    forensicSummary:
      'AIS-dark tanker slick imaged NW of the Port Said / Suez Canal entrance following a 3.55h transponder silence during approach maneuvering.',
    causalChain: [
      'Target dropped AIS at 12:15 UTC despite 39 active Suez anchorage vessels confirming clear coastal VHF reception.',
      'Sentinel-1A captured a 18.4 km² (9.8 x 2.1 km) Arabian Medium Crude signature at 15:48 UTC.',
      'Backtrack drift vector intersects MT RED SEA VANGUARD dead-reckoning stop coordinates at 31.38°N, 32.25°E.',
    ],
    tags: ['Suez NW', 'Sentinel-1A', 'AIS Blackout', '2021'],
  },
  {
    id: 'forensic-2015-04-19',
    caseCode: 'HIST-2015-03',
    historicalScenarioId: '2015-04-19',
    caseIdSlug: 'portsaid_2015_04_19',
    dateStr: '2015-04-19',
    timestampUtc: '2015-04-19T15:52:00Z',
    blackoutTimestampUtc: '2015-04-19T11:30:00Z',
    title: 'Port Said Approach Major Spill',
    shortTitle: '2015-04-19 · Port Said (24.15 km²)',
    sectorName: 'Port Said Anchorage Corridor',
    classification: 'oil_spills',
    classificationLabel: 'Major Crude Cargo Washings',
    severity: 'critical',
    threatScore: 96,
    zoomTarget: 11,
    stopCoordinates: { lat: 31.42, lon: 32.35 },
    preBlackoutTrack: [
      { lat: 31.65, lon: 32.1, offsetHours: -48 },
      { lat: 31.55, lon: 32.22, offsetHours: -24 },
      { lat: 31.48, lon: 32.29, offsetHours: -6 },
      { lat: 31.42, lon: 32.35, offsetHours: 0 },
    ],
    primaryVessel: {
      id: 'forensic-vessel-2015-04-19',
      name: 'MT LEVANT TRADER',
      mmsi: '538007124',
      imo: '9304821',
      flag: 'MH',
      vesselType: 'Tanker',
      lengthM: 252,
      beamM: 44,
      draftM: 14.1,
      sogAtBlackoutKts: 9.6,
      cogDeg: 142,
      headingDeg: 142,
      status: 'dark',
      aisGapHours: 4.37,
      coverageNeighborsCount: 42,
      nearestCableName: 'FLAG Europe-Asia',
      nearestCableDistanceKm: 6.8,
    },
    spill: {
      areaKm2: 24.15,
      estimatedVolumeBarrels: 820,
      lengthKm: 12.4,
      maxWidthKm: 2.3,
      oilType: 'Crude Cargo Washings',
      slickBearingDeg: 152,
      driftSpeedKts: 0.81,
    },
    sarPass: {
      satellite: 'SENTINEL-1A (C-BAND)',
      sensorMode: 'IW (Interferometric Wide)',
      polarization: 'VV+VH',
      passTimestampUtc: '2015-04-19T15:52:00Z',
      passCoordinates: { lat: 31.434, lon: 32.339 },
      incidenceAngleDeg: 33.9,
      cfarThresholdDb: 4.1,
      dbscanClusterPts: 184,
      azimuthDisplacementM: 356,
      rangeOffsetM: 22,
      calculatedTrueSpeedKts: 9.6,
      vvBackscatterDb: 18.7,
      slickContrastDb: -10.2,
      observabilityProbabilityPct: 95.3,
    },
    metoceanAtEvent: {
      windSpeedKts: 15,
      windDirectionDeg: 332,
      windDirectionCardinal: 'NNW',
      currentSpeedKts: 0.35,
      currentDirectionDeg: 108,
      kpIndexAtEvent: 2.3,
      kpConfidenceVerdict: 'Kp 2.3 (Nominal): Telemetry integrity confirmed',
    },
    impactAssessment: {
      bayesianScorePct: 95.6,
      priorProbabilityPct: 72.0,
      kinematicLikelihoodPct: 97.2,
      coastlineImpactEtaHours: 8.4,
      impactZoneName: 'Port Said East & Bardawil Approach',
      impactCoordinates: { lat: 31.332, lon: 32.418 },
      costModel: {
        currency: 'USD',
        iterations: 10000,
        shorelineCleanup: { minM: 4.8, medianM: 8.4, maxM: 15.6 },
        portSuezDisruption: { minM: 3.1, medianM: 6.2, maxM: 12.0 },
        marineHabitatLoss: { minM: 2.1, medianM: 4.3, maxM: 8.7 },
        totalEstimatedLiability: { minM: 10.0, medianM: 18.9, maxM: 36.3 },
      },
    },
    forensicSummary:
      'Major 24.15 km² surface oil plume mapped across the Port Said anchorage corridor during a 4.37h AIS gap prior to canal transit.',
    causalChain: [
      'Tanker went dark at 11:30 UTC while queuing outside the Port Said TSS approach.',
      'Sentinel-1A SAR pass at 15:52 UTC resolved 184 DBSCAN slick cluster points totaling 24.15 km² (820 bbl).',
      'Strong -10.2 dB VV contrast aligns with crude tank washing discharge prior to pilot boarding.',
    ],
    tags: ['Port Said', 'Sentinel-1A', '24.15 km²', '2015'],
  },
  {
    id: 'forensic-2014-10-04',
    caseCode: 'HIST-2014-04',
    historicalScenarioId: '2014-10-04',
    caseIdSlug: 'suez_2014_10_04',
    dateStr: '2014-10-04',
    timestampUtc: '2014-10-04T15:45:00Z',
    blackoutTimestampUtc: '2014-10-04T11:50:00Z',
    title: 'Suez Northern Corridor Slick',
    shortTitle: '2014-10-04 · Suez Corridor (26.41 km²)',
    sectorName: 'Suez Northern Approach TSS',
    classification: 'oil_spills',
    classificationLabel: 'TSS Corridor Heavy Fuel Discharge',
    severity: 'critical',
    threatScore: 98,
    zoomTarget: 11,
    stopCoordinates: { lat: 31.45, lon: 32.3 },
    preBlackoutTrack: [
      { lat: 31.7, lon: 32.05, offsetHours: -48 },
      { lat: 31.6, lon: 32.15, offsetHours: -24 },
      { lat: 31.52, lon: 32.23, offsetHours: -6 },
      { lat: 31.45, lon: 32.3, offsetHours: 0 },
    ],
    primaryVessel: {
      id: 'forensic-vessel-2014-10-04',
      name: 'MT PELUSIUM STAR',
      mmsi: '249014882',
      imo: '9277410',
      flag: 'MT',
      vesselType: 'Tanker',
      lengthM: 238,
      beamM: 38,
      draftM: 12.6,
      sogAtBlackoutKts: 11.1,
      cogDeg: 140,
      headingDeg: 140,
      status: 'dark',
      aisGapHours: 3.92,
      coverageNeighborsCount: 36,
      nearestCableName: 'FLAG Europe-Asia',
      nearestCableDistanceKm: 5.6,
    },
    spill: {
      areaKm2: 26.41,
      estimatedVolumeBarrels: 940,
      lengthKm: 14.2,
      maxWidthKm: 2.1,
      oilType: 'Heavy Fuel Oil (IFO-380)',
      slickBearingDeg: 148,
      driftSpeedKts: 0.79,
    },
    sarPass: {
      satellite: 'SENTINEL-1A (C-BAND)',
      sensorMode: 'IW (Interferometric Wide)',
      polarization: 'VV+VH',
      passTimestampUtc: '2014-10-04T15:45:00Z',
      passCoordinates: { lat: 31.462, lon: 32.286 },
      incidenceAngleDeg: 36.1,
      cfarThresholdDb: 4.3,
      dbscanClusterPts: 204,
      azimuthDisplacementM: 392,
      rangeOffsetM: 26,
      calculatedTrueSpeedKts: 11.1,
      vvBackscatterDb: 19.4,
      slickContrastDb: -10.8,
      observabilityProbabilityPct: 96.4,
    },
    metoceanAtEvent: {
      windSpeedKts: 13,
      windDirectionDeg: 328,
      windDirectionCardinal: 'NNW',
      currentSpeedKts: 0.35,
      currentDirectionDeg: 108,
      kpIndexAtEvent: 1.9,
      kpConfidenceVerdict: 'Kp 1.9 (Nominal): Coverage-aware dark gap confirmed',
    },
    impactAssessment: {
      bayesianScorePct: 96.9,
      priorProbabilityPct: 74.0,
      kinematicLikelihoodPct: 98.1,
      coastlineImpactEtaHours: 9.8,
      impactZoneName: 'Port Fouad / Northern Sinai Coast',
      impactCoordinates: { lat: 31.345, lon: 32.382 },
      costModel: {
        currency: 'USD',
        iterations: 10000,
        shorelineCleanup: { minM: 5.4, medianM: 9.6, maxM: 17.8 },
        portSuezDisruption: { minM: 3.8, medianM: 7.4, maxM: 14.2 },
        marineHabitatLoss: { minM: 2.4, medianM: 4.9, maxM: 9.6 },
        totalEstimatedLiability: { minM: 11.6, medianM: 21.9, maxM: 41.6 },
      },
    },
    forensicSummary:
      'Largest historical plume in the Med-East archive: 26.41 km² elongated IFO-380 slick along the Suez Northern Approach TSS.',
    causalChain: [
      'Vessel exited live AIS tracking at 11:50 UTC while descending the Suez Northern Approach lane.',
      'Sentinel-1A imaged a 14.2 km long heavy fuel slick (26.41 km², 940 bbl) with -10.8 dB backscatter damping.',
      'Azimuth Doppler velocity (11.1 kts) matches pre-cutoff kinematic trajectory.',
    ],
    tags: ['Suez Corridor', 'Sentinel-1A', '26.41 km²', '2014'],
  },
  {
    id: 'forensic-2004-06-15',
    caseCode: 'HIST-2004-05',
    historicalScenarioId: '2004-06-15',
    caseIdSlug: 'sidikerir_2004_06_15',
    dateStr: '2004-06-15',
    timestampUtc: '2004-06-15T06:15:00Z',
    blackoutTimestampUtc: '2004-06-15T03:20:00Z',
    title: 'Sidi Kerir Terminal Leak (Good Hope)',
    shortTitle: '2004-06-15 · Sidi Kerir (Good Hope)',
    sectorName: 'SUMED Sidi Kerir SPM Terminal',
    classification: 'subsea_cables',
    classificationLabel: 'SPM Terminal Leak / Subsea Corridor',
    severity: 'high',
    threatScore: 88,
    zoomTarget: 11,
    stopCoordinates: { lat: 31.1, lon: 29.61 },
    preBlackoutTrack: [
      { lat: 31.25, lon: 29.4, offsetHours: -48 },
      { lat: 31.2, lon: 29.48, offsetHours: -24 },
      { lat: 31.15, lon: 29.55, offsetHours: -6 },
      { lat: 31.1, lon: 29.61, offsetHours: 0 },
    ],
    primaryVessel: {
      id: 'forensic-vessel-2004-06-15',
      name: 'MT GOOD HOPE',
      mmsi: '636011004',
      imo: '9184420',
      flag: 'LR',
      vesselType: 'Tanker',
      lengthM: 274,
      beamM: 48,
      draftM: 15.4,
      sogAtBlackoutKts: 2.1,
      cogDeg: 128,
      headingDeg: 128,
      status: 'dark',
      aisGapHours: 2.92,
      coverageNeighborsCount: 16,
      nearestCableName: 'SEA-ME-WE 5',
      nearestCableDistanceKm: 2.8,
    },
    spill: {
      areaKm2: 19.6,
      estimatedVolumeBarrels: 670,
      lengthKm: 8.9,
      maxWidthKm: 2.4,
      oilType: 'SUMED Crude Transfer',
      slickBearingDeg: 124,
      driftSpeedKts: 0.68,
    },
    sarPass: {
      satellite: 'ENVISAT ASAR (C-BAND)',
      sensorMode: 'IM (Image Mode)',
      polarization: 'VV',
      passTimestampUtc: '2004-06-15T06:15:00Z',
      passCoordinates: { lat: 31.114, lon: 29.598 },
      incidenceAngleDeg: 31.8,
      cfarThresholdDb: 4.6,
      dbscanClusterPts: 146,
      azimuthDisplacementM: 84,
      rangeOffsetM: 9,
      calculatedTrueSpeedKts: 2.1,
      vvBackscatterDb: 20.8,
      slickContrastDb: -9.1,
      observabilityProbabilityPct: 90.4,
    },
    metoceanAtEvent: {
      windSpeedKts: 12,
      windDirectionDeg: 304,
      windDirectionCardinal: 'NW',
      currentSpeedKts: 0.35,
      currentDirectionDeg: 108,
      kpIndexAtEvent: 1.4,
      kpConfidenceVerdict: 'Kp 1.4 (Nominal): ENVISAT ASAR geometric calibration verified',
    },
    impactAssessment: {
      bayesianScorePct: 89.2,
      priorProbabilityPct: 62.0,
      kinematicLikelihoodPct: 91.5,
      coastlineImpactEtaHours: 6.4,
      impactZoneName: 'Sidi Kerir / El Agamy Coastline',
      impactCoordinates: { lat: 31.072, lon: 29.664 },
      costModel: {
        currency: 'USD',
        iterations: 10000,
        shorelineCleanup: { minM: 3.6, medianM: 6.8, maxM: 12.9 },
        portSuezDisruption: { minM: 1.8, medianM: 3.5, maxM: 7.1 },
        marineHabitatLoss: { minM: 1.6, medianM: 3.2, maxM: 6.4 },
        totalEstimatedLiability: { minM: 7.0, medianM: 13.5, maxM: 26.4 },
      },
    },
    forensicSummary:
      'Historical SUMED crude transfer leak at Sidi Kerir offshore SPM terminal within 2.8 km of subsea infrastructure corridor.',
    causalChain: [
      'Tanker slowed to 2.1 kts near SUMED single-point mooring buoy prior to 03:20 UTC transponder blackout.',
      'ENVISAT ASAR C-band pass at 06:15 UTC resolved a 19.6 km² (670 bbl) crude plume anchored at 31.10°N, 29.61°E.',
      'Proximity alert triggered within 2.8 km of regional subsea cable and pipeline landing zone.',
    ],
    tags: ['Sidi Kerir', 'ENVISAT ASAR', 'SUMED Terminal', '2004'],
  },
];

export function filterForensicCases(
  cases: ForensicCaseRecord[],
  filter: IncidentFilter = 'all',
  query = ''
): ForensicCaseRecord[] {
  const q = query.trim().toLowerCase();
  return [...cases]
    .filter((c) => filter === 'all' || c.classification === filter)
    .filter((c) => {
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.caseCode.toLowerCase().includes(q) ||
        c.dateStr.toLowerCase().includes(q) ||
        c.primaryVessel.name.toLowerCase().includes(q) ||
        c.primaryVessel.mmsi.toLowerCase().includes(q) ||
        c.sectorName.toLowerCase().includes(q) ||
        c.classificationLabel.toLowerCase().includes(q) ||
        c.spill.oilType.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.threatScore - a.threatScore);
}

function normalizeAngleDeg(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

function computeSegmentBearingDeg(from: LatLngPoint, to: LatLngPoint): number {
  const dLat = to.lat - from.lat;
  const dLon = to.lon - from.lon;
  if (Math.abs(dLat) < 1e-7 && Math.abs(dLon) < 1e-7) {
    return 0;
  }
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const lonDiff = ((to.lon - from.lon) * Math.PI) / 180;
  const y = Math.sin(lonDiff) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lonDiff);
  return Math.round(normalizeAngleDeg((Math.atan2(y, x) * 180) / Math.PI));
}

function haversineNm(a: LatLngPoint, b: LatLngPoint): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Computes each historical vessel's synchronized position, heading, speed, blackout phase,
 * and incident-day relative elapsed hours (00:00 to 24:00 window) for a given timeline offset (-48h..+24h).
 */
export function evaluateForensicCaseAtTime(
  record: ForensicCaseRecord,
  timeOffsetHours = 0
): ForensicTemporalState {
  const clampedOffset = Math.max(-48, Math.min(24, timeOffsetHours));
  const passMsRaw = Date.parse(record.timestampUtc);
  const passMs = Number.isFinite(passMsRaw)
    ? passMsRaw
    : Date.parse(`${record.dateStr}T12:00:00Z`);
  const blackoutMsRaw = Date.parse(record.blackoutTimestampUtc);
  const blackoutMs = Number.isFinite(blackoutMsRaw)
    ? blackoutMsRaw
    : passMs - record.primaryVessel.aisGapHours * 3600000;
  const blackoutOffsetHours = Number(((blackoutMs - passMs) / 3600000).toFixed(2));

  const dayMidnightMs = Date.parse(`${record.dateStr}T00:00:00Z`);
  const simulatedMs = passMs + clampedOffset * 3600000;
  const simulatedIso = new Date(simulatedMs).toISOString();
  const simulatedDateStr = simulatedIso.slice(0, 10);
  const simulatedClockUtc = `${simulatedIso.slice(11, 16)}Z`;

  const incidentDayHoursElapsed = (simulatedMs - dayMidnightMs) / 3600000;
  const incidentDayWindowHours = Math.max(0, Math.min(24, incidentDayHoursElapsed));
  const incidentDayDelta = Math.floor(incidentDayHoursElapsed / 24);

  const incidentDayElapsedLabel =
    incidentDayDelta === 0
      ? `D0 ${incidentDayWindowHours.toFixed(1)}h / 24h`
      : incidentDayDelta < 0
        ? `D${incidentDayDelta} (${simulatedClockUtc})`
        : `D+${incidentDayDelta} (${simulatedClockUtc})`;

  // Sort pre-blackout trajectory ascending by offsetHours and ensure terminal stop at T=0
  const rawWaypoints = [...record.preBlackoutTrack]
    .filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lon) && Number.isFinite(pt.offsetHours))
    .sort((a, b) => a.offsetHours - b.offsetHours);

  if (rawWaypoints.length === 0) {
    rawWaypoints.push({
      lat: record.stopCoordinates.lat,
      lon: record.stopCoordinates.lon,
      offsetHours: 0,
    });
  } else {
    const last = rawWaypoints[rawWaypoints.length - 1];
    if (Math.abs(last.offsetHours) > 0.01) {
      rawWaypoints.push({
        lat: record.stopCoordinates.lat,
        lon: record.stopCoordinates.lon,
        offsetHours: 0,
      });
    } else {
      rawWaypoints[rawWaypoints.length - 1] = {
        lat: record.stopCoordinates.lat,
        lon: record.stopCoordinates.lon,
        offsetHours: 0,
      };
    }
  }

  const firstWp = rawWaypoints[0];
  const lastWp = rawWaypoints[rawWaypoints.length - 1];
  const minOffset = firstWp.offsetHours;
  const spanHours = Math.max(1, lastWp.offsetHours - minOffset);

  let lat = record.stopCoordinates.lat;
  let lon = record.stopCoordinates.lon;
  let headingDeg = record.primaryVessel.headingDeg;
  let sogKts = record.primaryVessel.sogAtBlackoutKts;
  const traversedTrack: LatLngPoint[] = [];
  const remainingTrack: LatLngPoint[] = [];

  if (clampedOffset <= firstWp.offsetHours) {
    lat = firstWp.lat;
    lon = firstWp.lon;
    if (rawWaypoints.length >= 2) {
      headingDeg = computeSegmentBearingDeg(firstWp, rawWaypoints[1]);
      const segHours = Math.max(0.5, rawWaypoints[1].offsetHours - firstWp.offsetHours);
      sogKts = Number(
        Math.max(2.0, Math.min(18.0, haversineNm(firstWp, rawWaypoints[1]) / segHours)).toFixed(1)
      );
    }
    traversedTrack.push({ lat, lon });
    rawWaypoints.forEach((wp) => remainingTrack.push({ lat: wp.lat, lon: wp.lon }));
  } else if (clampedOffset >= 0) {
    lat = record.stopCoordinates.lat;
    lon = record.stopCoordinates.lon;
    if (rawWaypoints.length >= 2) {
      headingDeg = computeSegmentBearingDeg(
        rawWaypoints[rawWaypoints.length - 2],
        record.stopCoordinates
      );
    }
    sogKts = clampedOffset > 0.25 ? 0.0 : record.primaryVessel.sogAtBlackoutKts;
    rawWaypoints.forEach((wp) => traversedTrack.push({ lat: wp.lat, lon: wp.lon }));
    remainingTrack.push({ lat, lon });
  } else {
    let interpolated = false;
    for (let i = 0; i < rawWaypoints.length - 1; i++) {
      const p0 = rawWaypoints[i];
      const p1 = rawWaypoints[i + 1];
      traversedTrack.push({ lat: p0.lat, lon: p0.lon });

      if (!interpolated && clampedOffset >= p0.offsetHours && clampedOffset <= p1.offsetHours) {
        const segSpan = Math.max(0.001, p1.offsetHours - p0.offsetHours);
        const t = Math.max(0, Math.min(1, (clampedOffset - p0.offsetHours) / segSpan));
        lat = Number((p0.lat + (p1.lat - p0.lat) * t).toFixed(5));
        lon = Number((p0.lon + (p1.lon - p0.lon) * t).toFixed(5));
        const bearing = computeSegmentBearingDeg(p0, p1);
        headingDeg = bearing || record.primaryVessel.headingDeg;
        const distNm = haversineNm(p0, p1);
        const nominalSog = Math.max(1.5, Math.min(18.0, distNm / segSpan));
        sogKts = Number(
          (i === rawWaypoints.length - 2
            ? nominalSog + (record.primaryVessel.sogAtBlackoutKts - nominalSog) * t
            : nominalSog
          ).toFixed(1)
        );
        traversedTrack.push({ lat, lon });
        remainingTrack.push({ lat, lon });
        interpolated = true;
      } else if (interpolated) {
        remainingTrack.push({ lat: p0.lat, lon: p0.lon });
      }
    }
    remainingTrack.push({ lat: lastWp.lat, lon: lastWp.lon });
  }

  const transitProgressPct =
    clampedOffset >= 0
      ? 100
      : clampedOffset <= minOffset
        ? 0
        : Number((((clampedOffset - minOffset) / spanHours) * 100).toFixed(1));

  let phase: ForensicVesselPhase;
  let phaseLabel: string;
  let status: ForensicTemporalState['status'];

  if (clampedOffset < blackoutOffsetHours) {
    phase = 'PRE_BLACKOUT_TRANSIT';
    phaseLabel = `PRE-BLACKOUT TRANSIT (${clampedOffset.toFixed(1)}h)`;
    status = 'legal';
  } else if (clampedOffset < -0.25) {
    phase = 'AIS_BLACKOUT_TRANSIT';
    phaseLabel = `AIS CUTOFF ACTIVE (${clampedOffset.toFixed(1)}h)`;
    status = record.primaryVessel.status === 'spoofed' ? 'spoofed' : 'dark';
  } else if (clampedOffset <= 0.25) {
    phase = 'SAR_PASS_STOP';
    phaseLabel = `SAR PASS / SPILL STOP (${record.timestampUtc.slice(11, 16)}Z)`;
    status = record.primaryVessel.status === 'spoofed' ? 'spoofed' : 'dark';
  } else {
    phase = 'POST_PASS_DRIFT';
    phaseLabel = `POST-PASS DRIFT (+${clampedOffset.toFixed(1)}h)`;
    status = record.primaryVessel.status === 'spoofed' ? 'spoofed' : 'dark';
  }

  return {
    caseId: record.id,
    timeOffsetHours: clampedOffset,
    lat,
    lon,
    headingDeg,
    sogKts,
    status,
    phase,
    phaseLabel,
    simulatedUtcIso: simulatedIso,
    simulatedDateStr,
    simulatedClockUtc,
    incidentDayHoursElapsed: Number(incidentDayHoursElapsed.toFixed(2)),
    incidentDayWindowHours: Number(incidentDayWindowHours.toFixed(2)),
    incidentDayDelta,
    incidentDayElapsedLabel,
    blackoutOffsetHours,
    transitProgressPct,
    isBlackoutActive: clampedOffset >= blackoutOffsetHours,
    isSlickVisible: clampedOffset >= blackoutOffsetHours - 0.5,
    traversedTrack,
    remainingTrack,
  };
}

export function forensicCaseToPrimaryVessel(
  record: ForensicCaseRecord,
  timeOffsetHours = 0
): Vessel {
  const pv = record.primaryVessel;
  const temporal = evaluateForensicCaseAtTime(record, timeOffsetHours);
  return {
    id: pv.id,
    mmsi: pv.mmsi,
    imo: pv.imo,
    name: pv.name,
    flag: pv.flag,
    vesselType: pv.vesselType,
    lengthM: pv.lengthM,
    beamM: pv.beamM,
    draftM: pv.draftM,
    lat: temporal.lat,
    lon: temporal.lon,
    sogKts: temporal.sogKts,
    cogDeg: temporal.headingDeg,
    headingDeg: temporal.headingDeg,
    status: temporal.status,
    aisLastSeenUtc: record.blackoutTimestampUtc,
    aisGapHours: pv.aisGapHours,
    coverageNeighborsCount: pv.coverageNeighborsCount,
    nearestCableName: pv.nearestCableName,
    nearestCableDistanceKm: pv.nearestCableDistanceKm,
    incidentId: record.id,
    isLiveAis: false,
    trackHistory: record.preBlackoutTrack,
  };
}

export function forensicCaseToIncident(record: ForensicCaseRecord): Incident {
  return {
    id: record.id,
    caseCode: record.caseCode,
    title: `${record.dateStr} : ${record.title}`,
    shortTitle: record.shortTitle,
    category: record.classification,
    severity: record.severity,
    threatScore: record.threatScore,
    timestampUtc: record.timestampUtc,
    lat: record.stopCoordinates.lat,
    lon: record.stopCoordinates.lon,
    zoomTarget: record.zoomTarget,
    primaryVesselId: record.primaryVessel.id,
    summary: record.forensicSummary,
    causalChain: record.causalChain,
    kpIndexAtEvent: record.metoceanAtEvent.kpIndexAtEvent,
    kpConfidenceVerdict: record.metoceanAtEvent.kpConfidenceVerdict,
    coverageAwareVerified: true,
    sarMetrics: {
      satellite: record.sarPass.satellite,
      sensorMode: record.sarPass.sensorMode,
      acquisitionTimeUtc: record.sarPass.passTimestampUtc,
      incidenceAngleDeg: record.sarPass.incidenceAngleDeg,
      polarization: record.sarPass.polarization,
      cfarThresholdDb: record.sarPass.cfarThresholdDb,
      dbscanClusterPts: record.sarPass.dbscanClusterPts,
      azimuthDisplacementM: record.sarPass.azimuthDisplacementM,
      rangeOffsetM: record.sarPass.rangeOffsetM,
      calculatedTrueSpeedKts: record.sarPass.calculatedTrueSpeedKts,
      reportedAisSpeedKts: null,
      vvBackscatterDb: record.sarPass.vvBackscatterDb,
      slickContrastDb: record.sarPass.slickContrastDb,
      wakeApexLat: record.sarPass.passCoordinates.lat,
      wakeApexLon: record.sarPass.passCoordinates.lon,
      observabilityProbabilityPct: record.sarPass.observabilityProbabilityPct,
      commercialTaskingRecommended: false,
      nextTaskingWindowUtc: record.sarPass.passTimestampUtc,
    },
    driftAttribution: {
      bayesianScorePct: record.impactAssessment.bayesianScorePct,
      priorProbabilityPct: record.impactAssessment.priorProbabilityPct,
      kinematicLikelihoodPct: record.impactAssessment.kinematicLikelihoodPct,
      slickAreaKm2: record.spill.areaKm2,
      estimatedVolumeBarrels: record.spill.estimatedVolumeBarrels,
      oilType: record.spill.oilType,
      coastlineImpactEtaHours: record.impactAssessment.coastlineImpactEtaHours,
      impactZoneName: record.impactAssessment.impactZoneName,
      impactLat: record.impactAssessment.impactCoordinates.lat,
      impactLon: record.impactAssessment.impactCoordinates.lon,
      slickOriginLat: record.stopCoordinates.lat,
      slickOriginLon: record.stopCoordinates.lon,
      slickT0Lat: record.stopCoordinates.lat,
      slickT0Lon: record.stopCoordinates.lon,
      driftBearingDeg: record.spill.slickBearingDeg,
      driftSpeedKts: record.spill.driftSpeedKts,
      costModel: record.impactAssessment.costModel,
    },
  };
}

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/**
 * Generates an isolated slick hull, particle field, and interpolated vessel state
 * synchronized to timeOffsetHours across [-48h..+24h].
 */
export function computeForensicCaseSlickGeometry(
  record: ForensicCaseRecord,
  timeOffsetHours = 0
): SlickEnsembleState {
  const stop = record.stopCoordinates;
  const temporal = evaluateForensicCaseAtTime(record, timeOffsetHours);
  const bearingRad = (record.spill.slickBearingDeg * Math.PI) / 180;
  const cosLat = Math.max(0.2, Math.cos((stop.lat * Math.PI) / 180));

  // Before blackout discharge begins, show a nascent point centered on the vessel rather than a full static slick;
  // during blackout -> T=0, grow slick up to 100% SAR pass footprint; for T > 0, advect downstream toward impact zone.
  const driftFrac = Math.max(0, Math.min(1, timeOffsetHours / 24));
  const advectLat =
    timeOffsetHours > 0
      ? (record.impactAssessment.impactCoordinates.lat - stop.lat) * driftFrac * 0.65
      : 0;
  const advectLon =
    timeOffsetHours > 0
      ? (record.impactAssessment.impactCoordinates.lon - stop.lon) * driftFrac * 0.65
      : 0;

  let centerLat = stop.lat + advectLat;
  let centerLon = stop.lon + advectLon;
  let scaleFactor = 1 + driftFrac * 0.35;

  if (timeOffsetHours < 0) {
    const gapHours = Math.max(0.5, Math.abs(temporal.blackoutOffsetHours));
    if (timeOffsetHours < temporal.blackoutOffsetHours) {
      scaleFactor = 0.08;
      centerLat = temporal.lat;
      centerLon = temporal.lon;
    } else {
      const dischargeFrac = Math.max(
        0.15,
        Math.min(1, (timeOffsetHours - temporal.blackoutOffsetHours) / gapHours)
      );
      scaleFactor = 0.25 + 0.75 * dischargeFrac;
      centerLat = temporal.lat + (stop.lat - temporal.lat) * 0.5;
      centerLon = temporal.lon + (stop.lon - temporal.lon) * 0.5;
    }
  }

  const halfLenKm = Math.max(1.2, record.spill.lengthKm / 2);
  const halfWidthKm = Math.max(0.45, record.spill.maxWidthKm / 2);

  const hullVertices = 14;
  const slickPolygon: LatLngPoint[] = temporal.isSlickVisible
    ? Array.from({ length: hullVertices }, (_, idx) => {
        const theta = (idx / hullVertices) * Math.PI * 2;
        const wobble = 1 + 0.18 * Math.sin(theta * 3 + record.threatScore * 0.1);
        const alongKm = Math.cos(theta) * halfLenKm * scaleFactor * wobble;
        const crossKm = Math.sin(theta) * halfWidthKm * scaleFactor * wobble;
        const dLat = (Math.cos(bearingRad) * alongKm - Math.sin(bearingRad) * crossKm) / 111.32;
        const dLon =
          (Math.sin(bearingRad) * alongKm + Math.cos(bearingRad) * crossKm) / (111.32 * cosLat);
        return {
          lat: Number((centerLat + dLat).toFixed(5)),
          lon: Number((centerLon + dLon).toFixed(5)),
        };
      })
    : [];

  const particles = temporal.isSlickVisible
    ? Array.from({ length: 18 }, (_, idx) => {
        const alongKm = seededUnit(idx * 3 + record.threatScore) * halfLenKm * 1.45 * scaleFactor;
        const crossKm = seededUnit(idx * 7 + 5) * halfWidthKm * 1.3 * scaleFactor;
        const dLat = (Math.cos(bearingRad) * alongKm - Math.sin(bearingRad) * crossKm) / 111.32;
        const dLon =
          (Math.sin(bearingRad) * alongKm + Math.cos(bearingRad) * crossKm) / (111.32 * cosLat);
        return {
          lat: centerLat + dLat,
          lon: centerLon + dLon,
          weight: 0.45 + Math.abs(seededUnit(idx + 17)) * 0.55,
          radiusM: 180 + scaleFactor * 60,
        };
      })
    : [];

  const searchConePolygon: LatLngPoint[] = [
    stop,
    {
      lat: stop.lat + (Math.cos(bearingRad - 0.32) * (halfLenKm * 1.35)) / 111.32,
      lon: stop.lon + (Math.sin(bearingRad - 0.32) * (halfLenKm * 1.35)) / (111.32 * cosLat),
    },
    {
      lat: stop.lat + (Math.cos(bearingRad) * (halfLenKm * 1.55)) / 111.32,
      lon: stop.lon + (Math.sin(bearingRad) * (halfLenKm * 1.55)) / (111.32 * cosLat),
    },
    {
      lat: stop.lat + (Math.cos(bearingRad + 0.32) * (halfLenKm * 1.35)) / 111.32,
      lon: stop.lon + (Math.sin(bearingRad + 0.32) * (halfLenKm * 1.35)) / (111.32 * cosLat),
    },
  ];

  const backtrackPath = record.preBlackoutTrack.map((p) => ({ lat: p.lat, lon: p.lon }));
  const forwardTrajectory = [stop, record.impactAssessment.impactCoordinates];

  return {
    incidentId: record.id,
    timeOffsetHours,
    particles,
    slickPolygon,
    searchConePolygon,
    vesselPositionAtTime: { lat: temporal.lat, lon: temporal.lon },
    vesselHeadingAtTime: temporal.headingDeg,
    backtrackPath,
    forwardTrajectory,
    phaseLabel: temporal.phaseLabel,
  };
}

/**
 * Normalizes any newly discovered anomaly or ingested external JSON case file
 * into a validated ForensicCaseRecord that can be appended directly to the repository.
 */
export function normalizeExternalForensicCase(
  rawInput: unknown,
  existingCount: number
): ForensicCaseRecord {
  const raw = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<string, unknown>;
  const indexNum = existingCount + 1;
  const padded = String(indexNum).padStart(2, '0');

  const rawStop = (raw.stopCoordinates as Record<string, unknown> | undefined) ?? {};
  const latNum = Number(rawStop.lat ?? raw.lat ?? 31.52);
  const lonNum = Number(rawStop.lon ?? raw.lon ?? 31.18);
  const stopLat = Number.isFinite(latNum) ? Math.max(30.2, Math.min(34.0, latNum)) : 31.52;
  const stopLon = Number.isFinite(lonNum) ? Math.max(28.5, Math.min(34.5, lonNum)) : 31.18;

  const dateStr =
    typeof raw.dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dateStr)
      ? raw.dateStr
      : new Date().toISOString().slice(0, 10);
  const timestampUtc =
    typeof raw.timestampUtc === 'string' && raw.timestampUtc.includes('T')
      ? raw.timestampUtc
      : `${dateStr}T12:00:00Z`;
  const blackoutTimestampUtc =
    typeof raw.blackoutTimestampUtc === 'string' && raw.blackoutTimestampUtc.includes('T')
      ? raw.blackoutTimestampUtc
      : `${dateStr}T09:15:00Z`;

  const rawClassification = String(raw.classification ?? 'oil_spills');
  const classification: ForensicCaseRecord['classification'] =
    rawClassification === 'dark_spoofing' || rawClassification === 'subsea_cables'
      ? rawClassification
      : 'oil_spills';

  const rawVessel = (raw.primaryVessel as Record<string, unknown> | undefined) ?? {};
  const rawSpill = (raw.spill as Record<string, unknown> | undefined) ?? {};
  const rawSar = (raw.sarPass as Record<string, unknown> | undefined) ?? {};
  const rawSarCoords = (rawSar.passCoordinates as Record<string, unknown> | undefined) ?? {};
  const rawMet = (raw.metoceanAtEvent as Record<string, unknown> | undefined) ?? {};
  const rawImpact = (raw.impactAssessment as Record<string, unknown> | undefined) ?? {};

  const areaKm2 = Number(rawSpill.areaKm2 ?? raw.spillAreaKm2 ?? 12.5);
  const estimatedVolumeBarrels = Number(
    rawSpill.estimatedVolumeBarrels ?? raw.estimatedBarrels ?? Math.round(areaKm2 * 32)
  );
  const lengthKm = Number(rawSpill.lengthKm ?? Math.max(2.5, Number((Math.sqrt(areaKm2) * 2.4).toFixed(1))));
  const maxWidthKm = Number(rawSpill.maxWidthKm ?? Math.max(0.6, Number((areaKm2 / lengthKm).toFixed(1))));
  const bearingDeg = Number(rawSpill.slickBearingDeg ?? 140);
  const headingDeg = Number(rawVessel.headingDeg ?? 132);
  const id =
    typeof raw.id === 'string' && raw.id.trim().length > 0
      ? raw.id.trim()
      : `forensic-ext-${dateStr}-${indexNum}`;
  const caseCode =
    typeof raw.caseCode === 'string' && raw.caseCode.trim().length > 0
      ? raw.caseCode.trim()
      : `EXT-${dateStr.slice(0, 4)}-${padded}`;
  const title =
    typeof raw.title === 'string' && raw.title.trim().length > 0
      ? raw.title.trim()
      : `External Anomaly ${caseCode}`;
  const vesselName =
    typeof rawVessel.name === 'string' && rawVessel.name.trim().length > 0
      ? rawVessel.name.trim()
      : typeof raw.vesselName === 'string' && raw.vesselName.trim().length > 0
        ? raw.vesselName.trim()
        : `MV ANOMALY ${padded}`;

  const passLat = Number(rawSarCoords.lat ?? Number((stopLat + 0.014).toFixed(4)));
  const passLon = Number(rawSarCoords.lon ?? Number((stopLon - 0.015).toFixed(4)));

  return {
    id,
    caseCode,
    caseIdSlug: `external_${id.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`,
    dateStr,
    timestampUtc,
    blackoutTimestampUtc,
    title,
    shortTitle:
      typeof raw.shortTitle === 'string' && raw.shortTitle.trim().length > 0
        ? raw.shortTitle.trim()
        : `${dateStr} · ${title}`,
    sectorName:
      typeof raw.sectorName === 'string' && raw.sectorName.trim().length > 0
        ? raw.sectorName.trim()
        : 'Med-East External Sector',
    classification,
    classificationLabel:
      typeof raw.classificationLabel === 'string' && raw.classificationLabel.trim().length > 0
        ? raw.classificationLabel.trim()
        : classification === 'dark_spoofing'
          ? 'External AIS Blackout / Spoofing'
          : classification === 'subsea_cables'
            ? 'External Subsea Corridor Anomaly'
            : 'External Hydrocarbon Discharge',
    severity:
      raw.severity === 'medium' || raw.severity === 'high' || raw.severity === 'critical'
        ? raw.severity
        : 'high',
    threatScore: Number(raw.threatScore ?? 86),
    zoomTarget: Number(raw.zoomTarget ?? 11),
    stopCoordinates: { lat: stopLat, lon: stopLon },
    preBlackoutTrack: Array.isArray(raw.preBlackoutTrack)
      ? (raw.preBlackoutTrack as Array<LatLngPoint & { offsetHours: number }>)
      : [
          { lat: Number((stopLat + 0.18).toFixed(4)), lon: Number((stopLon - 0.24).toFixed(4)), offsetHours: -24 },
          { lat: Number((stopLat + 0.08).toFixed(4)), lon: Number((stopLon - 0.1).toFixed(4)), offsetHours: -6 },
          { lat: stopLat, lon: stopLon, offsetHours: 0 },
        ],
    primaryVessel: {
      id: typeof rawVessel.id === 'string' ? rawVessel.id : `forensic-vessel-${id}`,
      name: vesselName,
      mmsi: String(rawVessel.mmsi ?? raw.mmsi ?? `63609${String(1000 + indexNum).slice(-4)}`),
      imo: String(rawVessel.imo ?? raw.imo ?? `9500${padded}`),
      flag: String(rawVessel.flag ?? 'PA'),
      vesselType: String(rawVessel.vesselType ?? 'Tanker'),
      lengthM: Number(rawVessel.lengthM ?? 215),
      beamM: Number(rawVessel.beamM ?? 34),
      draftM: Number(rawVessel.draftM ?? 11.4),
      sogAtBlackoutKts: Number(rawVessel.sogAtBlackoutKts ?? 10.2),
      cogDeg: Number(rawVessel.cogDeg ?? headingDeg),
      headingDeg,
      status: rawVessel.status === 'spoofed' || rawVessel.status === 'legal' ? rawVessel.status : 'dark',
      aisGapHours: Number(rawVessel.aisGapHours ?? 2.8),
      coverageNeighborsCount: Number(rawVessel.coverageNeighborsCount ?? 21),
      nearestCableName: String(rawVessel.nearestCableName ?? (stopLon < 31 ? 'SEA-ME-WE 5' : 'FLAG Europe-Asia')),
      nearestCableDistanceKm: Number(rawVessel.nearestCableDistanceKm ?? 4.9),
    },
    spill: {
      areaKm2,
      estimatedVolumeBarrels,
      lengthKm,
      maxWidthKm,
      oilType: String(rawSpill.oilType ?? 'Unverified Hydrocarbon Blend'),
      slickBearingDeg: bearingDeg,
      driftSpeedKts: Number(rawSpill.driftSpeedKts ?? 0.65),
    },
    sarPass: {
      satellite: String(rawSar.satellite ?? 'SENTINEL-1A (C-BAND)'),
      sensorMode: String(rawSar.sensorMode ?? 'IW (Interferometric Wide)'),
      polarization: String(rawSar.polarization ?? 'VV+VH'),
      passTimestampUtc: String(rawSar.passTimestampUtc ?? timestampUtc),
      passCoordinates: { lat: passLat, lon: passLon },
      incidenceAngleDeg: Number(rawSar.incidenceAngleDeg ?? 34.2),
      cfarThresholdDb: Number(rawSar.cfarThresholdDb ?? 4.2),
      dbscanClusterPts: Number(rawSar.dbscanClusterPts ?? 118),
      azimuthDisplacementM: Number(rawSar.azimuthDisplacementM ?? 340),
      rangeOffsetM: Number(rawSar.rangeOffsetM ?? 20),
      calculatedTrueSpeedKts: Number(rawSar.calculatedTrueSpeedKts ?? 10.2),
      vvBackscatterDb: Number(rawSar.vvBackscatterDb ?? 18.4),
      slickContrastDb: Number(rawSar.slickContrastDb ?? -8.6),
      observabilityProbabilityPct: Number(rawSar.observabilityProbabilityPct ?? 91.0),
    },
    metoceanAtEvent: {
      windSpeedKts: Number(rawMet.windSpeedKts ?? 12),
      windDirectionDeg: Number(rawMet.windDirectionDeg ?? 320),
      windDirectionCardinal: String(rawMet.windDirectionCardinal ?? 'NW'),
      currentSpeedKts: Number(rawMet.currentSpeedKts ?? 0.35),
      currentDirectionDeg: Number(rawMet.currentDirectionDeg ?? 108),
      kpIndexAtEvent: Number(rawMet.kpIndexAtEvent ?? 1.8),
      kpConfidenceVerdict: String(
        rawMet.kpConfidenceVerdict ?? 'Kp 1.8 (Nominal): External anomaly telemetry validated'
      ),
    },
    impactAssessment: {
      bayesianScorePct: Number(rawImpact.bayesianScorePct ?? 89.5),
      priorProbabilityPct: Number(rawImpact.priorProbabilityPct ?? 62.0),
      kinematicLikelihoodPct: Number(rawImpact.kinematicLikelihoodPct ?? 92.4),
      coastlineImpactEtaHours:
        rawImpact.coastlineImpactEtaHours === null
          ? null
          : Number(rawImpact.coastlineImpactEtaHours ?? 14.0),
      impactZoneName: String(rawImpact.impactZoneName ?? 'Med-East Coastal Approach'),
      impactCoordinates: (rawImpact.impactCoordinates as LatLngPoint | undefined) ?? {
        lat: Number((stopLat - 0.07).toFixed(4)),
        lon: Number((stopLon + 0.06).toFixed(4)),
      },
      costModel: (rawImpact.costModel as ForensicCaseRecord['impactAssessment']['costModel'] | undefined) ?? {
        currency: 'USD',
        iterations: 10000,
        shorelineCleanup: { minM: 2.0, medianM: 3.8, maxM: 7.2 },
        portSuezDisruption: { minM: 1.1, medianM: 2.2, maxM: 4.4 },
        marineHabitatLoss: { minM: 0.8, medianM: 1.7, maxM: 3.3 },
        totalEstimatedLiability: { minM: 3.9, medianM: 7.7, maxM: 14.9 },
      },
    },
    forensicSummary:
      typeof raw.forensicSummary === 'string' && raw.forensicSummary.trim().length > 0
        ? raw.forensicSummary.trim()
        : `Ingested external anomaly case (${dateStr}) anchored at ${stopLat.toFixed(3)}°N, ${stopLon.toFixed(3)}°E with ${areaKm2} km² SAR slick signature.`,
    causalChain:
      Array.isArray(raw.causalChain) && raw.causalChain.length > 0
        ? raw.causalChain.map(String)
        : [
            `External anomaly ingested for ${vesselName} at ${stopLat.toFixed(3)}°N, ${stopLon.toFixed(3)}°E.`,
            `SAR signature mapped at ${areaKm2} km² (${estimatedVolumeBarrels} bbl).`,
            `Historical blackout window correlated prior to ${timestampUtc.slice(11, 16)} UTC pass.`,
          ],
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : ['External Ingest', dateStr],
    isExternalIngest: true,
  };
}
