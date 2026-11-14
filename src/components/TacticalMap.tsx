import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, Hand, Maximize2, Minus, Mouse, Plus } from 'lucide-react';
import {
  AsfSarScene,
  BaseMapId,
  CableProximityAlert,
  DarkEnvelopeState,
  EonetEvent,
  ForensicCaseRecord,
  ForensicVesselPhase,
  HistoricalReplayState,
  HudMode,
  Incident,
  LatLngPoint,
  LayerVisibility,
  LiveOilSpillSimulation,
  MetoceanBuoy,
  SarSwath,
  SatelliteGroundState,
  ShippingLane,
  SlickEnsembleState,
  SubseaCable,
  Vessel,
  WeatherState,
} from '../types/telemetry';
import {
  computeForensicCaseSlickGeometry,
  evaluateForensicCaseAtTime,
} from '../data/forensicCasesRepository';
import {
  computeCoastalImpactAssessment,
  computeSarConfidenceAssessment,
  interpolateBuoyMetocean,
} from '../services/surveillanceForensicsService';

interface TacticalMapProps {
  hudMode?: HudMode;
  forensicCases?: ForensicCaseRecord[];
  selectedForensicCaseId?: string | null;
  forensicTimeOffsetHours?: number;
  baseMap: BaseMapId;
  layers: LayerVisibility;
  vessels: Vessel[];
  incidents: Incident[];
  subseaCables: SubseaCable[];
  shippingLanes: ShippingLane[];
  sarSwaths: SarSwath[];
  asfScenes: AsfSarScene[];
  satellites: SatelliteGroundState[];
  buoys: MetoceanBuoy[];
  weather?: WeatherState;
  eonetEvents: EonetEvent[];
  selectedIncidentId: string;
  selectedVesselId: string | null;
  selectedAsfSceneId: string | null;
  activeEnsemble: SlickEnsembleState | null;
  allOilEnsembles: SlickEnsembleState[];
  darkEnvelopes?: DarkEnvelopeState[];
  cableThreatAlerts?: CableProximityAlert[];
  liveOilSimulation?: LiveOilSpillSimulation | null;
  simActiveVesselIds?: Record<string, boolean>;
  historicalReplay?: HistoricalReplayState | null;
  flyToRequest: { lat: number; lon: number; zoom: number; nonce: number } | null;
  hudMinimized: boolean;
  onSelectIncident: (incidentId: string) => void;
  onSelectVessel: (vesselId: string) => void;
  onSelectAsfScene: (sceneId: string) => void;
  onSelectForensicCase?: (caseId: string) => void;
  onExportIncidentDossier?: (payload: {
    mode: 'forensic' | 'surveillance';
    caseId?: string;
    vesselId?: string;
  }) => void;
  onOpenInspectorLab?: (payload: {
    mode: 'forensic' | 'surveillance';
    caseId?: string;
    vesselId?: string;
  }) => void;
  onToggleOptionalSim?: (payload: { vesselId: string; openInspector?: boolean }) => void;
}

const MED_EAST_CENTER: [number, number] = [31.65, 31.12];
const MED_EAST_DEFAULT_ZOOM = 8;

const SAR_BACKSCATTER_BOUNDS: L.LatLngBoundsExpression = [
  [31.34, 29.74],
  [31.68, 30.42],
];

function generateSarBackscatterDataUrl(): string {
  const width = 560;
  const height = 340;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  const toPx = (lat: number, lon: number) => ({
    x: ((lon - 29.74) / (30.42 - 29.74)) * width,
    y: ((31.68 - lat) / (31.68 - 31.34)) * height,
  });

  const slickCenter = toPx(31.485, 30.175);
  const wakeApex = toPx(31.565, 30.285);
  const displacedEcho = { x: wakeApex.x + 26, y: wakeApex.y - 12 };
  const cableDarkVessel = toPx(31.512, 29.862);

  let seed = 1337;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const u1 = Math.max(0.001, nextRand());
      const u2 = Math.max(0.001, nextRand());
      const rayleigh = Math.sqrt(-2 * Math.log(u1)) * 0.48 + u2 * 0.25;
      let val = 54 * rayleigh + 28;

      const edgeX = Math.min(x / 36, (width - x) / 36, 1);
      const edgeY = Math.min(y / 32, (height - y) / 32, 1);
      const edgeAlpha = Math.max(0, Math.min(1, edgeX * edgeY));

      const dxS = (x - slickCenter.x) * Math.cos(0.45) + (y - slickCenter.y) * Math.sin(0.45);
      const dyS = -(x - slickCenter.x) * Math.sin(0.45) + (y - slickCenter.y) * Math.cos(0.45);
      const slickDist = Math.hypot(dxS / 52, dyS / 20);
      if (slickDist < 1.15) {
        const damp = Math.max(0.08, slickDist / 1.15);
        val = val * (0.14 + 0.86 * Math.pow(damp, 2.4));
      }

      const tTail = Math.max(
        0,
        Math.min(
          1,
          ((x - slickCenter.x) * (wakeApex.x - slickCenter.x) +
            (y - slickCenter.y) * (wakeApex.y - slickCenter.y)) /
            (Math.pow(wakeApex.x - slickCenter.x, 2) + Math.pow(wakeApex.y - slickCenter.y, 2))
        )
      );
      const projX = slickCenter.x + tTail * (wakeApex.x - slickCenter.x);
      const projY = slickCenter.y + tTail * (wakeApex.y - slickCenter.y);
      const tailDist = Math.hypot(x - projX, y - projY);
      if (tailDist < 7.5) {
        val *= 0.22 + 0.78 * (tailDist / 7.5);
      }

      const dxW = x - wakeApex.x;
      const dyW = y - wakeApex.y;
      if (dxW < 0 && dxW > -95) {
        const arm1 = Math.abs(dyW - dxW * 0.26);
        const arm2 = Math.abs(dyW + dxW * 0.26);
        if (arm1 < 2.2 || arm2 < 2.2) {
          val += 46;
        }
      }

      const dEcho1 = Math.hypot(x - displacedEcho.x, y - displacedEcho.y);
      if (dEcho1 < 12) {
        val += Math.exp(-dEcho1 * 0.45) * 210;
      }
      if (Math.abs(y - displacedEcho.y) < 1.4 && Math.abs(x - displacedEcho.x) < 22) {
        val += 110 * (1 - Math.abs(x - displacedEcho.x) / 22);
      }

      const dEcho2 = Math.hypot(x - cableDarkVessel.x, y - cableDarkVessel.y);
      if (dEcho2 < 10) {
        val += Math.exp(-dEcho2 * 0.48) * 215;
      }

      const clamped = Math.max(4, Math.min(255, Math.round(val)));
      data[idx] = clamped;
      data[idx + 1] = clamped;
      data[idx + 2] = Math.min(255, clamped + 4);
      data[idx + 3] = Math.round(215 * edgeAlpha);
    }
  }

  ctx.putImageData(imgData, 0, 0);

  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.fillStyle = '#F59E0B';
  ctx.fillText('-22.4 dB OIL SLICK', slickCenter.x - 42, slickCenter.y + 34);

  ctx.fillStyle = '#22D3EE';
  ctx.fillText('+18.6 dB SAR ECHO (dx)', displacedEcho.x - 16, displacedEcho.y - 16);
  ctx.fillText('+22.4 dB DARK TGT', cableDarkVessel.x - 36, cableDarkVessel.y - 14);

  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(wakeApex.x, wakeApex.y);
  ctx.lineTo(displacedEcho.x, displacedEcho.y);
  ctx.stroke();

  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
  ctx.strokeRect(1, 1, width - 2, height - 2);

  return canvas.toDataURL('image/png');
}

function createShipSvg(
  status: Vessel['status'],
  headingDeg: number,
  isSelected: boolean,
  isLiveAis?: boolean
): string {
  const color =
    status === 'legal'
      ? isLiveAis
        ? '#34D399'
        : '#22D3EE'
      : status === 'spoofed'
        ? '#F59E0B'
        : '#EF4444';
  const fillOpacity = status === 'dark' ? '0.92' : '0.85';
  const ring =
    status === 'dark'
      ? `<circle cx="24" cy="24" r="15" fill="none" stroke="#EF4444" stroke-width="1.4" stroke-opacity="0.7" class="dark-vessel-pulse" />`
      : '';
  const selectedHalo = isSelected
    ? `<circle cx="24" cy="24" r="19" fill="none" stroke="${color}" stroke-width="1.2" stroke-dasharray="3 3" stroke-opacity="0.95" />`
    : '';

  return `
    <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
      ${ring}
      ${selectedHalo}
      <g transform="rotate(${headingDeg} 24 24)">
        <line x1="24" y1="12" x2="24" y2="2" stroke="${color}" stroke-width="1.4" stroke-opacity="0.85" />
        <path d="M21 33 L18 42 M27 33 L30 42" stroke="${color}" stroke-width="1" stroke-opacity="0.38" fill="none" />
        <path d="M24 11 L28.5 19 L28 33 L24 35 L20 33 L19.5 19 Z"
          fill="${color}" fill-opacity="${fillOpacity}"
          stroke="#060D14" stroke-width="1.2" />
        <rect x="21.5" y="25" width="5" height="4" rx="0.5" fill="#060D14" fill-opacity="0.65" />
      </g>
    </svg>
  `;
}

function createForensicShipSvg(
  yearTag: string,
  headingDeg: number,
  isSelected: boolean,
  phase: ForensicVesselPhase,
  isExternal?: boolean
): string {
  const isPreBlackout = phase === 'PRE_BLACKOUT_TRANSIT';
  const accent = isSelected ? '#22D3EE' : '#F59E0B';
  const hullFill = isPreBlackout ? '#101C28' : accent;
  const hullStroke = isPreBlackout ? accent : '#060D14';
  const ringStroke = isSelected ? '#22D3EE' : isExternal ? '#34D399' : '#F59E0B';
  const outerRing = isSelected
    ? `<circle cx="28" cy="28" r="22" fill="rgba(34,211,238,0.12)" stroke="#22D3EE" stroke-width="1.5" stroke-dasharray="4 3" />`
    : `<circle cx="28" cy="28" r="17" fill="rgba(16,28,40,0.45)" stroke="${ringStroke}" stroke-width="1.1" stroke-opacity="${isPreBlackout ? '0.48' : '0.78'}" />`;
  const pulse =
    isSelected || phase === 'AIS_BLACKOUT_TRANSIT' || phase === 'SAR_PASS_STOP'
      ? `<circle cx="28" cy="28" r="${isSelected ? 25 : 20}" fill="none" stroke="${accent}" stroke-width="1.2" stroke-opacity="${isSelected ? '0.6' : '0.45'}" class="dark-vessel-pulse" />`
      : '';

  return `
    <svg width="56" height="62" viewBox="0 0 56 62" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
      ${pulse}
      ${outerRing}
      <g transform="rotate(${headingDeg} 28 28)">
        <line x1="28" y1="14" x2="28" y2="5" stroke="${accent}" stroke-width="1.5" stroke-opacity="0.9" />
        <path d="M25 37 L21 45 M31 37 L35 45" stroke="${accent}" stroke-width="1" stroke-opacity="0.45" fill="none" />
        <path d="M28 13 L33 22 L32.2 37 L28 39.5 L23.8 37 L23 22 Z"
          fill="${hullFill}" fill-opacity="0.94"
          stroke="${hullStroke}" stroke-width="1.5" />
        <rect x="25.2" y="28.5" width="5.6" height="4.5" rx="0.5" fill="${isPreBlackout ? accent : '#101C28'}" />
      </g>
      <rect x="11" y="45" width="34" height="13" rx="2" fill="#060D14" fill-opacity="0.95" stroke="${accent}" stroke-width="1" />
      <text x="28" y="54" text-anchor="middle" fill="${accent}" font-size="8.5" font-family="JetBrains Mono, monospace" font-weight="700">${yearTag}</text>
    </svg>
  `;
}

function createSatelliteSvg(name: string, color: string): string {
  return `
    <svg width="46" height="46" viewBox="0 0 46 46" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
      <circle cx="23" cy="23" r="16" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="1.1" stroke-dasharray="3 3" />
      <rect x="19" y="19" width="8" height="8" rx="1" fill="${color}" stroke="#040812" stroke-width="1" />
      <rect x="6" y="20.5" width="11" height="5" fill="#38BDF8" stroke="#040812" stroke-width="0.8" />
      <rect x="29" y="20.5" width="11" height="5" fill="#38BDF8" stroke="#040812" stroke-width="0.8" />
      <text x="23" y="45" text-anchor="middle" fill="${color}" font-size="8.5" font-family="JetBrains Mono, monospace" font-weight="bold">${name}</text>
    </svg>
  `;
}

function createBuoySvg(buoy: MetoceanBuoy): string {
  // Wind vector arrow points TO (windDirectionDeg + 180)
  const windToDeg = (buoy.windDirectionDeg + 180) % 360;
  const currToDeg = buoy.currentDirectionDeg;
  return `
    <svg width="56" height="56" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
      <circle cx="28" cy="28" r="15" fill="rgba(6, 12, 24, 0.72)" stroke="#38BDF8" stroke-width="1.2" />
      <!-- Wind directional arrow (Cyan) -->
      <g transform="rotate(${windToDeg} 28 28)">
        <line x1="28" y1="28" x2="28" y2="7" stroke="#00F0FF" stroke-width="1.8" />
        <polygon points="28,3 24.5,10 31.5,10" fill="#00F0FF" />
      </g>
      <!-- Ocean current directional arrow (Emerald) -->
      <g transform="rotate(${currToDeg} 28 28)">
        <line x1="28" y1="28" x2="28" y2="12" stroke="#34D399" stroke-width="1.5" stroke-dasharray="2 2" />
        <polygon points="28,10 25.5,15 30.5,15" fill="#34D399" />
      </g>
      <circle cx="28" cy="28" r="4" fill="#F59E0B" stroke="#040812" stroke-width="1" />
      <text x="28" y="52" text-anchor="middle" fill="#e2e8f0" font-size="8.5" font-family="JetBrains Mono, monospace" font-weight="bold">${buoy.windSpeedKts}KT · ${buoy.waveHeightM}m</text>
    </svg>
  `;
}

function createEonetSvg(title: string): string {
  return `
    <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
      <polygon points="18,4 32,18 18,32 4,18" fill="rgba(245, 158, 11, 0.22)" stroke="#F59E0B" stroke-width="1.5" />
      <circle cx="18" cy="18" r="3.5" fill="#FBBF24" />
      <text x="18" y="42" text-anchor="middle" fill="#FCD34D" font-size="8" font-family="JetBrains Mono, monospace">${title.slice(0, 16)}</text>
    </svg>
  `;
}

function buildCorridorPolygon(points: LatLngPoint[], radiusKm: number): [number, number][] {
  if (points.length < 2) return [];
  const leftSide: [number, number][] = [];
  const rightSide: [number, number][] = [];
  const latDegPerKm = 1 / 111.32;

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.lon - prev.lon;
    const dy = next.lat - prev.lat;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const lonDegPerKm = 1 / (111.32 * Math.cos((points[i].lat * Math.PI) / 180));

    leftSide.push([
      points[i].lat + ny * radiusKm * latDegPerKm,
      points[i].lon + nx * radiusKm * lonDegPerKm,
    ]);
    rightSide.push([
      points[i].lat - ny * radiusKm * latDegPerKm,
      points[i].lon - nx * radiusKm * lonDegPerKm,
    ]);
  }

  return [...leftSide, ...rightSide.reverse()];
}

export const TacticalMap: React.FC<TacticalMapProps> = ({
  hudMode = 'surveillance',
  forensicCases = [],
  selectedForensicCaseId = null,
  forensicTimeOffsetHours = 0,
  baseMap,
  layers,
  vessels,
  incidents,
  subseaCables,
  shippingLanes,
  sarSwaths,
  asfScenes,
  satellites,
  buoys,
  weather,
  eonetEvents,
  selectedIncidentId,
  selectedVesselId,
  selectedAsfSceneId,
  activeEnsemble,
  allOilEnsembles,
  darkEnvelopes = [],
  cableThreatAlerts = [],
  liveOilSimulation = null,
  simActiveVesselIds = {},
  historicalReplay = null,
  flyToRequest,
  hudMinimized,
  onSelectIncident,
  onSelectVessel,
  onSelectAsfScene,
  onSelectForensicCase,
  onExportIncidentDossier,
  onOpenInspectorLab,
  onToggleOptionalSim,
}) => {
  const isForensicStandalone = hudMode === 'forensic' && !historicalReplay;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const baseTileRef = useRef<L.TileLayer | null>(null);
  const nauticalChartGroupRef = useRef<L.LayerGroup | null>(null);
  const swathSvgRendererRef = useRef<L.SVG | null>(null);
  const asfPopupRef = useRef<L.Popup | null>(null);

  const layerGroupsRef = useRef<{
    lanes: L.LayerGroup;
    cables: L.LayerGroup;
    swaths: L.LayerGroup;
    backscatter: L.LayerGroup;
    cones: L.LayerGroup;
    slicks: L.LayerGroup;
    buoys: L.LayerGroup;
    eonet: L.LayerGroup;
    vessels: L.LayerGroup;
    satellites: L.LayerGroup;
  } | null>(null);

  const sarBackscatterDataUrl = useMemo(() => generateSarBackscatterDataUrl(), []);

  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number }>({
    lat: MED_EAST_CENTER[0],
    lon: MED_EAST_CENTER[1],
  });
  const [currentZoom, setCurrentZoom] = useState<number>(MED_EAST_DEFAULT_ZOOM);
  const [trackpadPanEnabled, setTrackpadPanEnabled] = useState<boolean>(true);
  const trackpadPanRef = useRef<boolean>(true);
  const forensicMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const liveMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const livePopupStateRef = useRef<Map<string, string>>(new Map());
  const forensicCallbacksRef = useRef({
    onSelectForensicCase,
    onSelectIncident,
    onSelectVessel,
    onExportIncidentDossier,
    onOpenInspectorLab,
    onToggleOptionalSim,
  });

  useEffect(() => {
    trackpadPanRef.current = trackpadPanEnabled;
  }, [trackpadPanEnabled]);

  useEffect(() => {
    forensicCallbacksRef.current = {
      onSelectForensicCase,
      onSelectIncident,
      onSelectVessel,
      onExportIncidentDossier,
      onOpenInspectorLab,
      onToggleOptionalSim,
    };
  }, [
    onSelectForensicCase,
    onSelectIncident,
    onSelectVessel,
    onExportIncidentDossier,
    onOpenInspectorLab,
    onToggleOptionalSim,
  ]);

  // Initialize Leaflet Map once with smooth trackpad, inertial drag & wheel handlers
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;

    const map = L.map(container, {
      center: MED_EAST_CENTER,
      zoom: MED_EAST_DEFAULT_ZOOM,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      inertia: true,
      inertiaDeceleration: 2400,
      inertiaMaxSpeed: 1800,
      easeLinearity: 0.2,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 120,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      bounceAtZoomLimits: false,
    });

    // Smooth 60fps Trackpad Two-Finger Panning + Pinch-to-Zoom & Mouse-Wheel Hybrid
    let pendingDx = 0;
    let pendingDy = 0;
    let rafId: number | null = null;
    let lastTrackpadPanMs = 0;

    const flushPan = () => {
      rafId = null;
      if (pendingDx !== 0 || pendingDy !== 0) {
        map.panBy([pendingDx, pendingDy], { animate: false, noMoveStart: false });
        pendingDx = 0;
        pendingDy = 0;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Trackpad pinch-to-zoom (browser sets ctrlKey) -> prevent browser zoom & let Leaflet zoom at cursor
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        return;
      }

      if (!trackpadPanRef.current || e.shiftKey) {
        return;
      }

      // Skip hijacking if scrolling inside a scrollable popup/tooltip or HUD scroll container
      const target = e.target as HTMLElement | null;
      if (target && target.closest('.leaflet-popup, .leaflet-popup-content, .vessel-popup-scroll, .hud-scroll')) {
        return;
      }

      const now = performance.now();
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      const isDiscreteMouseTick =
        e.deltaX === 0 &&
        now - lastTrackpadPanMs > 320 &&
        (e.deltaMode !== 0 ||
          (absY >= 100 && (absY % 100 === 0 || absY % 120 === 0)));

      // Discrete physical mouse wheel clicks still zoom cleanly via Leaflet scrollWheelZoom
      if (isDiscreteMouseTick) {
        return;
      }

      // Trackpad two-finger pan (both horizontal & vertical)
      e.preventDefault();
      e.stopPropagation();
      lastTrackpadPanMs = now;

      const scale = e.deltaMode === 1 ? 28 : e.deltaMode === 2 ? 280 : 1;
      pendingDx += e.deltaX * scale;
      pendingDy += e.deltaY * scale;

      if (rafId === null) {
        rafId = window.requestAnimationFrame(flushPan);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });

    const asfPane = map.createPane('asfSwathPane');
    asfPane.style.zIndex = '430';
    swathSvgRendererRef.current = L.svg({ pane: 'asfSwathPane', padding: 0.5 });
    asfPopupRef.current = L.popup({
      className: 'tactical-tooltip',
      maxWidth: 300,
      minWidth: 250,
      autoPan: true,
    });

    const lanes = L.layerGroup().addTo(map);
    const swaths = L.layerGroup().addTo(map);
    const backscatter = L.layerGroup().addTo(map);
    const cables = L.layerGroup().addTo(map);
    const cones = L.layerGroup().addTo(map);
    const slicks = L.layerGroup().addTo(map);
    const buoysGroup = L.layerGroup().addTo(map);
    const eonetGroup = L.layerGroup().addTo(map);
    const vesselsGroup = L.layerGroup().addTo(map);
    const satellitesGroup = L.layerGroup().addTo(map);

    layerGroupsRef.current = {
      lanes,
      cables,
      swaths,
      backscatter,
      cones,
      slicks,
      buoys: buoysGroup,
      eonet: eonetGroup,
      vessels: vesselsGroup,
      satellites: satellitesGroup,
    };

    const handlePopupButtonClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const exportBtn = target?.closest('[data-export-dossier="true"]') as HTMLElement | null;
      if (exportBtn) {
        e.preventDefault();
        e.stopPropagation();
        const mode = exportBtn.getAttribute('data-export-mode') === 'forensic' ? 'forensic' : 'surveillance';
        const exportId = exportBtn.getAttribute('data-export-id') || '';
        if (!exportId) return;
        forensicCallbacksRef.current.onExportIncidentDossier?.({
          mode,
          caseId: mode === 'forensic' ? exportId : undefined,
          vesselId: mode === 'surveillance' ? exportId : undefined,
        });
        return;
      }

      const simToggleBtn = target?.closest('[data-toggle-optional-sim="true"]') as HTMLElement | null;
      if (simToggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        const vesselId = simToggleBtn.getAttribute('data-export-id') || '';
        const openInspector = simToggleBtn.getAttribute('data-open-lab') !== 'false';
        if (!vesselId) return;
        forensicCallbacksRef.current.onToggleOptionalSim?.({
          vesselId,
          openInspector,
        });
        return;
      }

      const labBtn = target?.closest('[data-open-inspector="true"]') as HTMLElement | null;
      if (labBtn) {
        e.preventDefault();
        e.stopPropagation();
        const mode = labBtn.getAttribute('data-export-mode') === 'forensic' ? 'forensic' : 'surveillance';
        const targetId = labBtn.getAttribute('data-export-id') || '';
        if (!targetId) return;
        forensicCallbacksRef.current.onOpenInspectorLab?.({
          mode,
          caseId: mode === 'forensic' ? targetId : undefined,
          vesselId: mode === 'surveillance' ? targetId : undefined,
        });
      }
    };

    container.addEventListener('click', handlePopupButtonClick, { capture: true });

    const handlePopupOpen = (evt: L.PopupEvent) => {
      const popupEl = evt.popup.getElement();
      if (!popupEl) return;
      L.DomEvent.disableClickPropagation(popupEl);
      L.DomEvent.disableScrollPropagation(popupEl);
      const stopMapPropagation = (ev: Event) => {
        ev.stopPropagation();
      };
      popupEl.addEventListener('click', stopMapPropagation);
      popupEl.addEventListener('wheel', stopMapPropagation, { passive: true });
      popupEl.addEventListener('mousedown', stopMapPropagation);
      popupEl.addEventListener('pointerdown', stopMapPropagation);
      popupEl.addEventListener('touchstart', stopMapPropagation, { passive: true });
      popupEl.addEventListener('touchmove', stopMapPropagation, { passive: true });
      popupEl.addEventListener('dblclick', stopMapPropagation);
    };

    map.on('popupopen', handlePopupOpen);

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({ lat: e.latlng.lat, lon: e.latlng.lng });
    });

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    mapRef.current = map;

    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
      container.removeEventListener('click', handlePopupButtonClick, { capture: true });
      map.off('popupopen', handlePopupOpen);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      swathSvgRendererRef.current = null;
      asfPopupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Base Map (Satellite, CARTO Dark Tactical, Esri Nautical Chart L.layerGroup, NASA VIIRS)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (baseTileRef.current) {
      map.removeLayer(baseTileRef.current);
      baseTileRef.current = null;
    }
    if (nauticalChartGroupRef.current) {
      map.removeLayer(nauticalChartGroupRef.current);
      nauticalChartGroupRef.current = null;
    }

    if (baseMap === 'nautical') {
      const worldOceanBase = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Esri, GEBCO, NOAA, CHS, OSU, DeLorme, NAVTEQ',
          maxNativeZoom: 16,
          maxZoom: 18,
          zIndex: 1,
          className: 'nautical-ocean-base-tile',
        }
      );

      const worldOceanReference = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Esri Ocean Reference',
          maxNativeZoom: 16,
          maxZoom: 18,
          zIndex: 2,
          className: 'nautical-ocean-ref-tile',
        }
      );

      // Group Base + Reference layers so both toggle on/off simultaneously
      nauticalChartGroupRef.current = L.layerGroup([
        worldOceanBase,
        worldOceanReference,
      ]).addTo(map);
    } else if (baseMap === 'satellite') {
      baseTileRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Esri World Imagery',
          maxZoom: 18,
          zIndex: 1,
        }
      ).addTo(map);
    } else if (baseMap === 'nasa_viirs') {
      baseTileRef.current = L.tileLayer(
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
        {
          attribution: 'NASA EOSDIS GIBS // VIIRS SNPP (Latest Mosaic)',
          maxNativeZoom: 9,
          maxZoom: 18,
          zIndex: 1,
        }
      ).addTo(map);
    } else {
      baseTileRef.current = L.tileLayer(
        '/api/tiles/carto-dark/{z}/{x}/{y}{r}.png',
        {
          attribution: '&copy; OpenStreetMap &copy; CARTO',
          maxZoom: 19,
          zIndex: 1,
        }
      ).addTo(map);
    }
  }, [baseMap]);

  // Render Nautical Shipping Lanes
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups) return;
    groups.lanes.clearLayers();

    if (!layers.nauticalLanes && baseMap !== 'nautical') return;

    shippingLanes.forEach((lane) => {
      const latlngs = lane.coordinates.map((p) => [p.lat, p.lon] as [number, number]);
      const line = L.polyline(latlngs, {
        color: lane.corridorType === 'SUEZ_APPROACH' ? '#38BDF8' : '#0EA5E9',
        weight: 2,
        opacity: 0.55,
        dashArray: '8 6',
      });
      line.bindTooltip(`${lane.name} (${lane.corridorType})`, {
        className: 'tactical-tooltip',
        sticky: true,
      });
      groups.lanes.addLayer(line);
    });
  }, [layers.nauticalLanes, baseMap, shippingLanes]);

  // Render Subsea Fiber-Optic Cables & 5km Protection Buffer Zones (highlighting threats)
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups) return;
    groups.cables.clearLayers();

    if (!layers.subseaCables) return;

    const threatenedCableIds = new Set<string>();
    darkEnvelopes.forEach((env) => {
      env.intersectingCables.forEach((c) => threatenedCableIds.add(c.cableId));
    });
    cableThreatAlerts.forEach((alert) => {
      threatenedCableIds.add(alert.cableId);
    });

    subseaCables.forEach((cable) => {
      const isThreatened = threatenedCableIds.has(cable.id);
      const corridorColor = isThreatened ? '#EF4444' : '#22D3EE';
      const coreColor = isThreatened ? '#F59E0B' : '#22D3EE';

      const corridorPoly = buildCorridorPolygon(cable.coordinates, cable.bufferRadiusKm);
      if (corridorPoly.length > 0) {
        const buffer = L.polygon(corridorPoly, {
          color: corridorColor,
          weight: isThreatened ? 1.8 : 1,
          opacity: isThreatened ? 0.72 : 0.35,
          fillColor: corridorColor,
          fillOpacity: isThreatened ? 0.18 : 0.09,
          dashArray: '4 4',
          interactive: false,
        });
        groups.cables.addLayer(buffer);
      }

      const latlngs = cable.coordinates.map((p) => [p.lat, p.lon] as [number, number]);
      const glow = L.polyline(latlngs, {
        color: corridorColor,
        weight: isThreatened ? 10 : 6,
        opacity: isThreatened ? 0.42 : 0.22,
        interactive: false,
      });
      const core = L.polyline(latlngs, {
        color: coreColor,
        weight: isThreatened ? 3.2 : 2,
        opacity: 0.95,
      });
      core.bindTooltip(
        isThreatened
          ? `⚠ SUBSEA CABLE THREAT: ${cable.name} · ${cable.capacityTbps} Tbps · Proximity / Dark Envelope Alert`
          : `${cable.name} · ${cable.capacityTbps} Tbps · ${cable.bufferRadiusKm}km Protection Zone`,
        {
          className: 'tactical-tooltip',
          sticky: true,
        }
      );
      groups.cables.addLayer(glow);
      groups.cables.addLayer(core);
    });
  }, [layers.subseaCables, subseaCables, darkEnvelopes, cableThreatAlerts]);

  // Render SAR Satellite Swaths + Live NASA ASF Search API Footprints (or Historical Illuminated Swath / Isolated Forensic Pass Frames)
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups) return;
    groups.swaths.clearLayers();

    if (!layers.sarSwaths) return;

    if (isForensicStandalone) {
      forensicCases.forEach((fc) => {
        const isSel = fc.id === selectedForensicCaseId;
        const pLat = fc.sarPass.passCoordinates.lat;
        const pLon = fc.sarPass.passCoordinates.lon;
        const frameCoords: [number, number][] = [
          [pLat - 0.11, pLon - 0.14],
          [pLat - 0.11, pLon + 0.14],
          [pLat + 0.11, pLon + 0.14],
          [pLat + 0.11, pLon - 0.14],
        ];
        const frame = L.polygon(frameCoords, {
          color: isSel ? '#22D3EE' : '#F59E0B',
          weight: isSel ? 2.2 : 1.2,
          opacity: isSel ? 0.9 : 0.48,
          dashArray: isSel ? undefined : '5 5',
          fillColor: isSel ? '#22D3EE' : '#101C28',
          fillOpacity: isSel ? 0.12 : 0.05,
        });
        frame.bindTooltip(
          `<div style="line-height:1.35">
            <div style="font-weight:700;color:${isSel ? '#22D3EE' : '#F59E0B'}">${fc.caseCode} · ${fc.sarPass.satellite}</div>
            <div>Pass UTC: ${fc.sarPass.passTimestampUtc}</div>
            <div style="color:#94a3b8">Pass Center: ${pLat.toFixed(3)}°N, ${pLon.toFixed(3)}°E · ${fc.sarPass.sensorMode}</div>
          </div>`,
          { className: 'tactical-tooltip', sticky: true }
        );
        frame.on('click', () => {
          onSelectForensicCase?.(fc.id);
          onSelectIncident(fc.id);
          onSelectVessel(fc.primaryVessel.id);
        });
        groups.swaths.addLayer(frame);
      });
      return;
    }

    if (!historicalReplay) {
      sarSwaths.forEach((swath) => {
        const coords = swath.polygon.map((p) => [p.lat, p.lon] as [number, number]);
        const poly = L.polygon(coords, {
          color: swath.color,
          weight: 1.5,
          opacity: 0.55,
          dashArray: '6 5',
          fillColor: swath.color,
          fillOpacity: 0.03,
          interactive: false,
        });
        groups.swaths.addLayer(poly);
      });
    }

    const polygonAreaApprox = (pts: Array<{ lat: number; lon: number }>): number => {
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLon = Infinity;
      let maxLon = -Infinity;
      pts.forEach((p) => {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
      });
      return Math.max(0, (maxLat - minLat) * (maxLon - minLon));
    };

    const sortedScenes = [...asfScenes.slice(0, 8)].sort(
      (a, b) => polygonAreaApprox(b.footprintCoords) - polygonAreaApprox(a.footprintCoords)
    );

    sortedScenes.forEach((scene) => {
      if (scene.footprintCoords.length < 3) return;
      const isSelected = scene.id === selectedAsfSceneId;
      const isHistoricalIlluminated = Boolean(historicalReplay?.sarSwathIlluminated);
      const isHistoricalDimmed = Boolean(historicalReplay && !historicalReplay.sarSwathIlluminated);

      const baseColor = scene.bandLabel.includes('L-BAND') ? '#F59E0B' : '#38BDF8';
      const activeColor = isHistoricalIlluminated
        ? '#00F0FF'
        : scene.bandLabel.includes('L-BAND')
          ? '#FBBF24'
          : '#00F0FF';
      const defaultWeight = isHistoricalIlluminated
        ? 2.8
        : isHistoricalDimmed
          ? 1.1
          : isSelected
            ? 2.8
            : 1.5;
      const defaultFillOpacity = isHistoricalIlluminated
        ? 0.16
        : isHistoricalDimmed
          ? 0.02
          : isSelected
            ? 0.18
            : 0.07;
      const defaultOpacity = isHistoricalIlluminated
        ? 0.96
        : isHistoricalDimmed
          ? 0.3
          : isSelected
            ? 0.96
            : 0.65;
      const coords = scene.footprintCoords.map((p) => [p.lat, p.lon] as [number, number]);

      if (isHistoricalIlluminated) {
        const outerGlow = L.polygon(coords, {
          pane: 'asfSwathPane',
          renderer: swathSvgRendererRef.current ?? undefined,
          color: '#00F0FF',
          weight: 7,
          opacity: 0.24,
          fill: false,
          interactive: false,
        });
        groups.swaths.addLayer(outerGlow);
      }

      const poly = L.polygon(coords, {
        pane: 'asfSwathPane',
        renderer: swathSvgRendererRef.current ?? undefined,
        className: 'asf-clickable-swath',
        color: isHistoricalIlluminated || isSelected ? activeColor : baseColor,
        weight: defaultWeight,
        opacity: defaultOpacity,
        dashArray: isHistoricalIlluminated || isSelected ? undefined : isHistoricalDimmed ? '6 6' : '4 4',
        fillColor: isHistoricalIlluminated || isSelected ? activeColor : baseColor,
        fillOpacity: defaultFillOpacity,
        interactive: true,
      });
      poly.bindTooltip(
        `<div style="line-height:1.35">
          <div style="font-weight:700;color:${isHistoricalIlluminated || isSelected ? activeColor : '#f8fafc'}">${
            isHistoricalIlluminated ? 'ILLUMINATED SAR SWATH · ' : ''
          }ASF ${scene.bandLabel}</div>
          <div>${scene.sceneName}</div>
          <div style="color:#94a3b8">${scene.startTimeUtc.slice(0, 19).replace('T', ' ')}Z · ${scene.polarization}</div>
          <div style="color:${scene.browseImageUrl ? '#34D399' : '#38BDF8'}">${scene.browseImageUrl ? 'QUICKLOOK READY · CLICK TO INSPECT' : 'CLICK TO OPEN SAR LAB'}</div>
        </div>`,
        { className: 'tactical-tooltip', sticky: true }
      );
      poly.on('mouseover', () => {
        poly.setStyle({
          weight: isHistoricalIlluminated || isSelected ? 3.2 : 2.3,
          fillOpacity: isHistoricalIlluminated || isSelected ? 0.24 : 0.14,
          opacity: 0.95,
        });
      });
      poly.on('mouseout', () => {
        poly.setStyle({
          weight: defaultWeight,
          fillOpacity: defaultFillOpacity,
          opacity: defaultOpacity,
        });
      });
      poly.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectAsfScene(scene.id);
        const map = mapRef.current;
        const popup = asfPopupRef.current;
        if (map && popup) {
          const safeName = scene.sceneName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const imgHtml = scene.browseImageUrl
            ? `<div style="margin:6px 0;border-radius:4px;overflow:hidden;border:1px solid rgba(56,189,248,0.35);background:#02050c;">
                <img src="${scene.browseImageUrl}" alt="${safeName}" style="display:block;width:248px;height:132px;object-fit:cover;" />
              </div>`
            : `<div style="margin:6px 0;padding:12px;border-radius:4px;border:1px dashed rgba(56,189,248,0.35);color:#94a3b8;text-align:center;">Quicklook unavailable for this fallback scene</div>`;
          popup
            .setLatLng(e.latlng)
            .setContent(
              `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.35;width:248px">
                <div style="font-weight:700;color:${activeColor}">${scene.bandLabel} · ${scene.beamMode}</div>
                <div style="color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${safeName}</div>
                ${imgHtml}
                <div style="display:flex;justify-content:space-between;color:#94a3b8">
                  <span>${scene.startTimeUtc.slice(0, 19).replace('T', ' ')}Z</span>
                  <span style="color:#34D399">${scene.polarization}</span>
                </div>
              </div>`
            )
            .openOn(map);
        }
      });
      groups.swaths.addLayer(poly);
      if (isSelected || isHistoricalIlluminated) {
        poly.bringToFront();
      }
    });
  }, [
    layers.sarSwaths,
    sarSwaths,
    asfScenes,
    selectedAsfSceneId,
    historicalReplay,
    onSelectAsfScene,
    isForensicStandalone,
    forensicCases,
    selectedForensicCaseId,
    onSelectForensicCase,
    onSelectIncident,
    onSelectVessel,
  ]);

  // Render SAR Radar Backscatter Grayscale Speckle Canvas Overlay
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups) return;
    groups.backscatter.clearLayers();

    if (!layers.sarBackscatter || !sarBackscatterDataUrl) return;

    if (isForensicStandalone) {
      forensicCases.forEach((fc) => {
        const isSel = fc.id === selectedForensicCaseId;
        const bounds: L.LatLngBoundsExpression = [
          [fc.stopCoordinates.lat - 0.09, fc.stopCoordinates.lon - 0.13],
          [fc.stopCoordinates.lat + 0.09, fc.stopCoordinates.lon + 0.13],
        ];
        const overlay = L.imageOverlay(sarBackscatterDataUrl, bounds, {
          opacity: isSel ? 0.72 : 0.34,
          interactive: false,
        });
        groups.backscatter.addLayer(overlay);
      });
      return;
    }

    if (historicalReplay) {
      if (!historicalReplay.sarSwathIlluminated || !historicalReplay.backscatterBounds) {
        return;
      }
      const overlay = L.imageOverlay(sarBackscatterDataUrl, historicalReplay.backscatterBounds, {
        opacity: 0.78,
        interactive: false,
      });
      groups.backscatter.addLayer(overlay);
      return;
    }

    const overlay = L.imageOverlay(sarBackscatterDataUrl, SAR_BACKSCATTER_BOUNDS, {
      opacity: 0.82,
      interactive: false,
    });
    groups.backscatter.addLayer(overlay);
  }, [
    layers.sarBackscatter,
    sarBackscatterDataUrl,
    historicalReplay,
    isForensicStandalone,
    forensicCases,
    selectedForensicCaseId,
  ]);

  // Render Live 3-Point Egyptian Coast Metocean Buoys (Open-Meteo): suppressed in Forensic Case Lab
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups) return;
    groups.buoys.clearLayers();
    if (isForensicStandalone) return;

    buoys.forEach((buoy) => {
      const icon = L.divIcon({
        className: 'vessel-div-icon',
        html: createBuoySvg(buoy),
        iconSize: [56, 56],
        iconAnchor: [28, 28],
      });

      const marker = L.marker([buoy.lat, buoy.lon], {
        icon,
        zIndexOffset: 420,
      });

      const popupHtml = `
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.45;min-width:210px">
          <div style="font-weight:700;color:#38BDF8;margin-bottom:3px">${buoy.name}</div>
          <div style="color:#94a3b8;font-size:10px;margin-bottom:4px">
            ${buoy.lat.toFixed(2)}°N, ${buoy.lon.toFixed(2)}°E · ${buoy.isLiveData ? 'OPEN-METEO LIVE' : 'CACHED'}
          </div>
          <div>Wind: <strong style="color:#00F0FF">${buoy.windSpeedKts} kts (${buoy.windSpeedMs} m/s)</strong> ${buoy.windDirectionCardinal} (${buoy.windDirectionDeg}°)</div>
          <div>Wave Height: <strong style="color:#f8fafc">${buoy.waveHeightM} m</strong></div>
          <div>Ocean Current: <strong style="color:#34D399">${buoy.currentSpeedKts} kts @ ${buoy.currentDirectionDeg}°</strong></div>
        </div>
      `;

      marker.bindTooltip(popupHtml, {
        className: 'tactical-tooltip',
        direction: 'top',
        offset: [0, -14],
      });
      marker.bindPopup(popupHtml, { className: 'tactical-tooltip' });

      groups.buoys.addLayer(marker);
    });
  }, [buoys, isForensicStandalone]);

  // Render NASA EONET Live Earth Events: suppressed in Forensic Case Lab
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups) return;
    groups.eonet.clearLayers();
    if (isForensicStandalone) return;

    eonetEvents.forEach((ev) => {
      const icon = L.divIcon({
        className: 'vessel-div-icon',
        html: createEonetSvg(ev.category),
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([ev.lat, ev.lon], {
        icon,
        zIndexOffset: 380,
      });

      const html = `
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.4;max-width:240px">
          <div style="color:#FBBF24;font-weight:700">NASA EONET // ${ev.category.toUpperCase()}</div>
          <div style="color:#f8fafc;margin:2px 0">${ev.title}</div>
          <div style="color:#94a3b8;font-size:10px">${ev.dateUtc.slice(0, 16)}Z · ${ev.lat.toFixed(2)}°, ${ev.lon.toFixed(2)}°</div>
        </div>
      `;
      marker.bindTooltip(html, { className: 'tactical-tooltip', direction: 'top' });
      groups.eonet.addLayer(marker);
    });
  }, [eonetEvents, isForensicStandalone]);

  // Render SGP4 Propagated Orbital Ground Tracks & Live 1-Second Moving Satellites: suppressed in Forensic Case Lab
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups) return;
    groups.satellites.clearLayers();

    if (isForensicStandalone || !layers.sarSwaths) return;

    satellites.forEach((sat) => {
      sat.trackSegments.forEach((seg) => {
        if (seg.length < 2) return;
        const coords = seg.map((p) => [p.lat, p.lon] as [number, number]);
        const trackLine = L.polyline(coords, {
          color: sat.color,
          weight: 1.4,
          opacity: 0.55,
          dashArray: '4 6',
        });
        groups.satellites.addLayer(trackLine);
      });

      const satIcon = L.divIcon({
        className: 'vessel-div-icon',
        html: createSatelliteSvg(sat.name, sat.color),
        iconSize: [46, 46],
        iconAnchor: [23, 23],
      });

      const marker = L.marker([sat.lat, sat.lon], {
        icon: satIcon,
        zIndexOffset: 750,
      });

      marker.bindTooltip(
        `<div style="line-height:1.35">
          <div style="font-weight:700;color:${sat.color}">${sat.name} (${sat.bandLabel}) · NORAD ${sat.noradId}</div>
          <div>Pos: ${sat.lat.toFixed(2)}°, ${sat.lon.toFixed(2)}°</div>
          <div>Alt: ${sat.altitudeKm.toFixed(1)} km · Vel: ${sat.velocityKmS.toFixed(2)} km/s</div>
          <div style="color:${sat.isLiveTle ? '#34D399' : '#FBBF24'}">${sat.isLiveTle ? 'LIVE NORAD TLE SGP4' : 'CACHED TLE SGP4'}</div>
        </div>`,
        { className: 'tactical-tooltip', direction: 'top' }
      );
      groups.satellites.addLayer(marker);
    });
  }, [layers.sarSwaths, satellites, isForensicStandalone]);

  // Render Lagrangian Search Cones, Dark-Gap 360° Envelopes, Backtrack Paths & Spoofing Ring (or Standalone Multi-Case Tracks)
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups) return;
    groups.cones.clearLayers();

    if (isForensicStandalone && layers.searchCones) {
      forensicCases.forEach((fc) => {
        const isSel = fc.id === selectedForensicCaseId;
        const accent = isSel ? '#22D3EE' : '#F59E0B';
        const temporal = evaluateForensicCaseAtTime(fc, forensicTimeOffsetHours);

        if (temporal.remainingTrack.length >= 2) {
          const remCoords = temporal.remainingTrack.map((p) => [p.lat, p.lon] as [number, number]);
          const remLine = L.polyline(remCoords, {
            color: accent,
            weight: isSel ? 1.8 : 1.2,
            opacity: isSel ? 0.55 : 0.35,
            dashArray: '5 5',
          });
          remLine.bindTooltip(
            `${fc.caseCode} · Remaining Path to Stop (${temporal.transitProgressPct.toFixed(0)}% complete)`,
            { className: 'tactical-tooltip', sticky: true }
          );
          groups.cones.addLayer(remLine);
        }

        if (temporal.traversedTrack.length >= 2) {
          const travCoords = temporal.traversedTrack.map((p) => [p.lat, p.lon] as [number, number]);
          const travLine = L.polyline(travCoords, {
            color: temporal.isBlackoutActive ? '#F59E0B' : '#22D3EE',
            weight: isSel ? 2.8 : 2.0,
            opacity: isSel ? 0.96 : 0.78,
          });
          travLine.bindTooltip(
            `${fc.caseCode} · Traversed Track (${fc.primaryVessel.name} · ${temporal.phaseLabel})`,
            { className: 'tactical-tooltip', sticky: true }
          );
          groups.cones.addLayer(travLine);
        }

        // SAR Pass Coordinate Registration Vector (passCoordinates -> stopCoordinates)
        const sarVector = L.polyline(
          [
            [fc.sarPass.passCoordinates.lat, fc.sarPass.passCoordinates.lon],
            [fc.stopCoordinates.lat, fc.stopCoordinates.lon],
          ],
          {
            color: '#22D3EE',
            weight: isSel ? 2 : 1.3,
            opacity: forensicTimeOffsetHours >= -0.25 ? (isSel ? 0.95 : 0.65) : 0.3,
            dashArray: '3 3',
          }
        );
        groups.cones.addLayer(sarVector);

        const sarPassMarker = L.circleMarker(
          [fc.sarPass.passCoordinates.lat, fc.sarPass.passCoordinates.lon],
          {
            radius: isSel ? 5.5 : 4,
            color: '#22D3EE',
            weight: 1.8,
            fillColor: forensicTimeOffsetHours >= -0.25 ? '#22D3EE' : '#060D14',
            fillOpacity: forensicTimeOffsetHours >= -0.25 ? 0.95 : 0.7,
          }
        );
        sarPassMarker.bindTooltip(
          `<div style="line-height:1.35">
            <div style="font-weight:700;color:#22D3EE">SAR PASS COORDINATES · ${fc.caseCode}</div>
            <div>${fc.sarPass.satellite} · ${fc.sarPass.passTimestampUtc}</div>
            <div>Coord: ${fc.sarPass.passCoordinates.lat.toFixed(3)}°N, ${fc.sarPass.passCoordinates.lon.toFixed(3)}°E</div>
            <div style="color:#F59E0B">Azimuth Offset dx=${fc.sarPass.azimuthDisplacementM}m · Incidence ${fc.sarPass.incidenceAngleDeg}°</div>
          </div>`,
          { className: 'tactical-tooltip', direction: 'top' }
        );
        sarPassMarker.on('click', () => {
          onSelectForensicCase?.(fc.id);
          onSelectIncident(fc.id);
          onSelectVessel(fc.primaryVessel.id);
        });
        groups.cones.addLayer(sarPassMarker);

        // Historical Stop / Blackout Coordinate Beacon
        const stopBeacon = L.circleMarker([fc.stopCoordinates.lat, fc.stopCoordinates.lon], {
          radius: isSel ? 9 : 6.5,
          color: accent,
          weight: isSel ? 2.2 : 1.4,
          fillColor: '#101C28',
          fillOpacity: 0.28,
          interactive: false,
        });
        groups.cones.addLayer(stopBeacon);

        if (isSel) {
          const geom = computeForensicCaseSlickGeometry(fc, forensicTimeOffsetHours);
          if (geom.searchConePolygon.length >= 3) {
            const coneCoords = geom.searchConePolygon.map((p) => [p.lat, p.lon] as [number, number]);
            const conePoly = L.polygon(coneCoords, {
              color: '#F59E0B',
              weight: 1.4,
              opacity: 0.85,
              dashArray: '4 4',
              fillColor: '#F59E0B',
              fillOpacity: 0.14,
            });
            conePoly.bindTooltip(
              `${fc.caseCode} Search & Drift Envelope · ${fc.spill.slickBearingDeg}°T @ ${fc.spill.driftSpeedKts} kts`,
              { className: 'tactical-tooltip' }
            );
            groups.cones.addLayer(conePoly);
          }

          const impactLine = L.polyline(
            [
              [fc.stopCoordinates.lat, fc.stopCoordinates.lon],
              [fc.impactAssessment.impactCoordinates.lat, fc.impactAssessment.impactCoordinates.lon],
            ],
            {
              color: '#F59E0B',
              weight: 1.6,
              opacity: 0.8,
              dashArray: '3 5',
            }
          );
          groups.cones.addLayer(impactLine);

          const impactMarker = L.circleMarker(
            [fc.impactAssessment.impactCoordinates.lat, fc.impactAssessment.impactCoordinates.lon],
            {
              radius: 5.5,
              color: '#EF4444',
              weight: 2,
              fillColor: '#F59E0B',
              fillOpacity: 0.85,
            }
          );
          impactMarker.bindTooltip(
            `Coastal Impact Zone: ${fc.impactAssessment.impactZoneName} (${
              fc.impactAssessment.coastlineImpactEtaHours
                ? `ETA +${fc.impactAssessment.coastlineImpactEtaHours}h`
                : 'Offshore'
            })`,
            { className: 'tactical-tooltip' }
          );
          groups.cones.addLayer(impactMarker);
        }
      });
      return;
    }

    const selectedInc = incidents.find((i) => i.id === selectedIncidentId);
    if (layers.searchCones) {
      // Historical Replay Cyan Search Cone & Reachability Circle
      if (historicalReplay) {
        if (historicalReplay.suspectTrackHistory.length >= 2) {
          const trackCoords = historicalReplay.suspectTrackHistory.map(
            (p) => [p.lat, p.lon] as [number, number]
          );
          const trackLine = L.polyline(trackCoords, {
            color: '#38BDF8',
            weight: 2,
            opacity: 0.78,
            dashArray: '5 4',
          });
          trackLine.bindTooltip('Historical Suspect AIS Track (Pre-Dropout)', {
            className: 'tactical-tooltip',
            sticky: true,
          });
          groups.cones.addLayer(trackLine);
        }

        if (historicalReplay.suspectDarkCone) {
          const hc = historicalReplay.suspectDarkCone;
          if (hc.circlePolygon.length >= 3) {
            const diskCoords = hc.circlePolygon.map((p) => [p.lat, p.lon] as [number, number]);
            const diskPoly = L.polygon(diskCoords, {
              color: '#00F0FF',
              weight: 1.8,
              opacity: 0.82,
              dashArray: '6 4',
              fillColor: '#00F0FF',
              fillOpacity: 0.08,
            });
            diskPoly.bindTooltip(
              `<div style="line-height:1.35">
                <div style="font-weight:700;color:#00F0FF">PREDICTED REACHABILITY CIRCLE</div>
                <div>Radius: ${hc.reachabilityRadiusKm.toFixed(1)} km (Δt=${hc.deltaTMinutesToPass}m to SAR pass)</div>
                <div style="color:#94a3b8">Target Pass: ${hc.targetPassUtc.slice(0, 19).replace('T', ' ')}Z</div>
              </div>`,
              { className: 'tactical-tooltip', sticky: true }
            );
            groups.cones.addLayer(diskPoly);
          }

          if (hc.forwardConePolygon.length >= 3) {
            const coneCoords = hc.forwardConePolygon.map((p) => [p.lat, p.lon] as [number, number]);
            const fwdCone = L.polygon(coneCoords, {
              color: '#00F0FF',
              weight: 2.2,
              opacity: 0.94,
              fillColor: '#00F0FF',
              fillOpacity: 0.2,
            });
            fwdCone.bindTooltip(
              `<div style="line-height:1.35">
                <div style="font-weight:700;color:#00F0FF">ASYMMETRICAL FORWARD SEARCH CONE</div>
                <div>Projected to ASF Pass @ ${hc.targetPassUtc.slice(11, 16)}Z</div>
                <div style="color:#34D399">Elapsed Dark Gap: ${hc.elapsedDarkMinutes} min</div>
              </div>`,
              { className: 'tactical-tooltip', sticky: true }
            );
            groups.cones.addLayer(fwdCone);
          }

          if (hc.drCenterLine.length >= 2) {
            const drCoords = hc.drCenterLine.map((p) => [p.lat, p.lon] as [number, number]);
            const drLine = L.polyline(drCoords, {
              color: '#22D3EE',
              weight: 2,
              opacity: 0.9,
              dashArray: '4 4',
              interactive: false,
            });
            groups.cones.addLayer(drLine);
          }

          const lkpMarker = L.circleMarker([hc.lkpLat, hc.lkpLon], {
            radius: 5.5,
            color: '#00F0FF',
            weight: 2,
            fillColor: '#FF2A5F',
            fillOpacity: 0.95,
          });
          lkpMarker.bindTooltip(
            `Suspect AIS Dropout LKP · Elapsed ${hc.elapsedDarkMinutes}m`,
            { className: 'tactical-tooltip' }
          );
          groups.cones.addLayer(lkpMarker);

          const projMarker = L.circleMarker([hc.projectedCenterLat, hc.projectedCenterLon], {
            radius: 4.5,
            color: '#00F0FF',
            weight: 1.8,
            fillColor: '#040812',
            fillOpacity: 0.95,
          });
          projMarker.bindTooltip(
            `Projected Dead-Reckoning Intercept @ ${hc.targetPassUtc.slice(11, 16)}Z`,
            { className: 'tactical-tooltip' }
          );
          groups.cones.addLayer(projMarker);
        }
      }

      // Live AIS Predictive & Dark-Gap 360° Reachability Envelopes (The 30-Minute Rule)
      darkEnvelopes.forEach((env) => {
        const isSelectedTarget = env.vesselId === selectedVesselId;
        const isConfirmedDark = env.isConfirmedDark;

        if (env.envelopePolygon.length >= 3) {
          const diskCoords = env.envelopePolygon.map((p) => [p.lat, p.lon] as [number, number]);

          // Intensified outer crimson glow ring when vessel exceeds 30 minutes
          if (isConfirmedDark) {
            const outerGlow = L.polygon(diskCoords, {
              color: '#FF2A5F',
              weight: 6.5,
              opacity: isSelectedTarget ? 0.28 : 0.18,
              fill: false,
              interactive: false,
            });
            groups.cones.addLayer(outerGlow);
          }

          const envelopeColor = isConfirmedDark ? '#FF2A5F' : '#34D399';
          const diskPoly = L.polygon(diskCoords, {
            color: envelopeColor,
            weight: isConfirmedDark
              ? isSelectedTarget
                ? 2.8
                : 2.2
              : isSelectedTarget
                ? 1.8
                : 1.25,
            opacity: isConfirmedDark
              ? isSelectedTarget
                ? 0.96
                : 0.85
              : isSelectedTarget
                ? 0.82
                : 0.56,
            dashArray: isConfirmedDark ? '8 4' : '5 5',
            fillColor: envelopeColor,
            fillOpacity: isConfirmedDark
              ? isSelectedTarget
                ? 0.22
                : 0.14
              : isSelectedTarget
                ? 0.09
                : 0.05,
          });
          diskPoly.bindTooltip(
            `<div style="line-height:1.35">
              <div style="font-weight:700;color:${envelopeColor}">${
                isConfirmedDark
                  ? env.isSimulated
                    ? 'FLAGGED DARK ANOMALY (>30m · SIM)'
                    : 'FLAGGED DARK ANOMALY (>30m)'
                  : env.gapMinutes < 0.5
                    ? 'COMPLIANT AIS · PREDICTIVE ENVELOPE'
                    : 'ROUTINE HANDOFF / BRIEF GAP (<30m)'
              }</div>
              <div>${env.vesselName} (MMSI ${env.mmsi})</div>
              <div>Gap: ${env.gapMinutes.toFixed(1)}m / 30m · Vmax ${env.maxSpeedKts} kts · Rmax ${env.reachabilityRadiusKm.toFixed(1)} km</div>
              <div style="color:${
                isConfirmedDark && env.intersectingCables.length > 0 ? '#FB7185' : '#34D399'
              }">
                ${
                  isConfirmedDark && env.intersectingCables.length > 0
                    ? `⚠ SUBSEA CABLE THREAT: ${env.intersectingCables.map((c) => c.cableName).join(', ')}`
                    : `Nearest Cable: ${env.nearestCable.cableName} (${env.nearestCable.distanceKm} km)`
                }
              </div>
            </div>`,
            { className: 'tactical-tooltip', sticky: true }
          );
          diskPoly.on('click', () => onSelectVessel(env.vesselId));
          groups.cones.addLayer(diskPoly);
        }

        if (env.headingConePolygon.length >= 3) {
          const coneCoords = env.headingConePolygon.map((p) => [p.lat, p.lon] as [number, number]);
          const coneColor = isConfirmedDark ? '#F59E0B' : '#10B981';
          const headingCone = L.polygon(coneCoords, {
            color: coneColor,
            weight: isConfirmedDark ? 1.8 : 1.2,
            opacity: isConfirmedDark ? 0.92 : 0.65,
            dashArray: '4 3',
            fillColor: coneColor,
            fillOpacity: isConfirmedDark ? 0.22 : 0.1,
          });
          headingCone.bindTooltip(
            `Directional DR Cone (${env.vesselName}) · LKP SOG + Ocean Current Drift`,
            { className: 'tactical-tooltip' }
          );
          headingCone.on('click', () => onSelectVessel(env.vesselId));
          groups.cones.addLayer(headingCone);
        }

        if (env.drCenterLine.length >= 2) {
          const drCoords = env.drCenterLine.map((p) => [p.lat, p.lon] as [number, number]);
          const drLine = L.polyline(drCoords, {
            color: isConfirmedDark ? '#FBBF24' : '#34D399',
            weight: isConfirmedDark ? 2.2 : 1.5,
            opacity: isConfirmedDark ? 0.92 : 0.72,
            dashArray: '4 4',
            interactive: false,
          });
          groups.cones.addLayer(drLine);
        }

        const lkpMarker = L.circleMarker([env.lkpLat, env.lkpLon], {
          radius: isConfirmedDark ? 5.5 : 4,
          color: isConfirmedDark ? '#FF2A5F' : '#34D399',
          weight: 2,
          fillColor: isConfirmedDark ? '#FF2A5F' : '#040812',
          fillOpacity: 0.95,
        });
        lkpMarker.bindTooltip(
          isConfirmedDark
            ? `LKP DARK ANOMALY: ${env.vesselName} · Silent ${env.gapMinutes.toFixed(1)}m (>30m)`
            : `LKP: ${env.vesselName} · Brief Gap ${env.gapMinutes.toFixed(1)}m (<30m)`,
          { className: 'tactical-tooltip' }
        );
        groups.cones.addLayer(lkpMarker);
      });

      // Subsea Cable Proximity Threat Rings (< 3.0 km or suspicious slowdown)
      cableThreatAlerts.forEach((alert) => {
        const threatHalo = L.circle([alert.lat, alert.lon], {
          radius: 3000,
          color: '#FF2A5F',
          weight: 1.8,
          opacity: 0.85,
          dashArray: '4 4',
          fillColor: '#FF2A5F',
          fillOpacity: 0.12,
        });
        const reasonLabel =
          alert.reason === 'PROXIMITY_UNDER_3KM'
            ? `< 3.0 km proximity (${alert.distanceKm} km)`
            : alert.reason === 'SUSPICIOUS_SLOWDOWN'
              ? `Suspicious slowdown (${alert.sogKts} kts @ ${alert.distanceKm} km)`
              : `Dark envelope intersects cable buffer`;
        threatHalo.bindTooltip(
          `<div style="line-height:1.35">
            <div style="font-weight:700;color:#FF2A5F">⚠ SUBSEA CABLE THREAT</div>
            <div>${alert.vesselName} (MMSI ${alert.mmsi})</div>
            <div style="color:#FBBF24">${alert.cableName} (${alert.capacityTbps} Tbps) · ${reasonLabel}</div>
          </div>`,
          { className: 'tactical-tooltip', sticky: true }
        );
        threatHalo.on('click', () => onSelectVessel(alert.vesselId));
        groups.cones.addLayer(threatHalo);
      });

      if (activeEnsemble) {
        incidents.forEach((inc) => {
          if (inc.spoofingRingCenter) {
            const ringCircle = L.circle(
              [inc.spoofingRingCenter.lat, inc.spoofingRingCenter.lon],
              {
                radius: inc.spoofingRingCenter.radiusKm * 1000,
                color: '#F59E0B',
                weight: 1.5,
                dashArray: '5 5',
                fillColor: '#F59E0B',
                fillOpacity: inc.id === selectedIncidentId ? 0.12 : 0.05,
              }
            );
            ringCircle.bindTooltip(
              `GNSS/AIS Spoofing Ring · ${inc.spoofingRingCenter.affectedCount} Vessels · ${inc.spoofingRingCenter.radiusKm.toFixed(1)} km radius`,
              { className: 'tactical-tooltip' }
            );
            groups.cones.addLayer(ringCircle);
          }
        });

        if (activeEnsemble.searchConePolygon.length >= 3) {
          const coneCoords = activeEnsemble.searchConePolygon.map(
            (p) => [p.lat, p.lon] as [number, number]
          );
          const cone = L.polygon(coneCoords, {
            color: '#F59E0B',
            weight: 1.4,
            opacity: 0.78,
            dashArray: '4 4',
            fillColor: '#F59E0B',
            fillOpacity: 0.14,
          });
          cone.bindTooltip('Lagrangian Probability Search Cone', {
            className: 'tactical-tooltip',
          });
          groups.cones.addLayer(cone);
        }

        if (activeEnsemble.backtrackPath.length >= 2) {
          const backCoords = activeEnsemble.backtrackPath.map(
            (p) => [p.lat, p.lon] as [number, number]
          );
          const backLine = L.polyline(backCoords, {
            color: '#FF2A5F',
            weight: 2.2,
            opacity: 0.85,
            dashArray: '5 4',
          });
          backLine.bindTooltip('Reconstructed Dark Track (AIS Blackout)', {
            className: 'tactical-tooltip',
            sticky: true,
          });
          groups.cones.addLayer(backLine);
        }

        if (activeEnsemble.forwardTrajectory.length >= 2) {
          const fwdCoords = activeEnsemble.forwardTrajectory.map(
            (p) => [p.lat, p.lon] as [number, number]
          );
          const fwdLine = L.polyline(fwdCoords, {
            color: '#F59E0B',
            weight: 1.5,
            opacity: 0.65,
            dashArray: '3 5',
          });
          groups.cones.addLayer(fwdLine);
        }

        if (selectedInc?.driftAttribution) {
          const impactMarker = L.circleMarker(
            [selectedInc.driftAttribution.impactLat, selectedInc.driftAttribution.impactLon],
            {
              radius: 6,
              color: '#FF2A5F',
              weight: 2,
              fillColor: '#F59E0B',
              fillOpacity: 0.75,
            }
          );
          impactMarker.bindTooltip(
            `Projected Landfall: ${selectedInc.driftAttribution.impactZoneName}`,
            { className: 'tactical-tooltip' }
          );
          groups.cones.addLayer(impactMarker);
        }
      }
    }
  }, [
    layers.searchCones,
    incidents,
    selectedIncidentId,
    selectedVesselId,
    activeEnsemble,
    darkEnvelopes,
    cableThreatAlerts,
    historicalReplay,
    onSelectVessel,
    isForensicStandalone,
    forensicCases,
    selectedForensicCaseId,
    forensicTimeOffsetHours,
    onSelectForensicCase,
    onSelectIncident,
  ]);

  // Render Dynamic Oil Slick Polygons & Lagrangian Multi-Particle Plumes (Forensic Multi-Case + Live Surveillance)
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups) return;
    groups.slicks.clearLayers();

    if (!layers.oilDriftEnsemble) return;

    if (isForensicStandalone) {
      forensicCases.forEach((fc) => {
        const isSel = fc.id === selectedForensicCaseId;
        const ensemble = computeForensicCaseSlickGeometry(fc, forensicTimeOffsetHours);
        if (ensemble.slickPolygon.length >= 3) {
          const coords = ensemble.slickPolygon.map((p) => [p.lat, p.lon] as [number, number]);
          const poly = L.polygon(coords, {
            color: isSel ? '#22D3EE' : '#F59E0B',
            weight: isSel ? 2.1 : 1.4,
            opacity: isSel ? 0.94 : 0.72,
            fillColor: isSel ? '#0E7490' : '#B45309',
            fillOpacity: isSel ? 0.4 : 0.24,
          });
          const slickSarConf = computeSarConfidenceAssessment(fc.metoceanAtEvent.windSpeedKts, {
            hasAnomaly: true,
            isConfirmedDark: fc.primaryVessel.aisGapHours >= 0.5,
            aisGapMinutes: fc.primaryVessel.aisGapHours * 60,
            hasSlick: fc.spill.areaKm2 > 0,
            windDirectionDeg: fc.metoceanAtEvent.windDirectionDeg,
          });
          const slickBadgeColor = slickSarConf.tone === 'cyan' ? '#22D3EE' : '#F59E0B';
          poly.bindTooltip(
            `<div style="line-height:1.35">
              <div style="font-weight:700;color:${isSel ? '#22D3EE' : '#F59E0B'}">${fc.caseCode} · ${fc.dateStr} SPILL SLICK</div>
              <div>Vessel: ${fc.primaryVessel.name} (MMSI ${fc.primaryVessel.mmsi})</div>
              <div>Volume/Dim: ${fc.spill.areaKm2} km² (${fc.spill.estimatedVolumeBarrels} bbl) · ${fc.spill.lengthKm} x ${fc.spill.maxWidthKm} km</div>
              <div style="color:${slickBadgeColor};font-weight:700;font-size:9.5px">${slickSarConf.badgeText}</div>
              <div style="color:#94a3b8">${fc.spill.oilType} · ${ensemble.phaseLabel}</div>
            </div>`,
            { className: 'tactical-tooltip', sticky: true }
          );
          poly.on('click', () => {
            onSelectForensicCase?.(fc.id);
            onSelectIncident(fc.id);
            onSelectVessel(fc.primaryVessel.id);
          });
          groups.slicks.addLayer(poly);
        }

        ensemble.particles.forEach((pt) => {
          const particleCircle = L.circle([pt.lat, pt.lon], {
            radius: pt.radiusM,
            color: isSel ? '#22D3EE' : '#FBBF24',
            weight: 0.8,
            opacity: 0.5 * pt.weight,
            fillColor: isSel ? '#22D3EE' : '#F59E0B',
            fillOpacity: 0.34 * pt.weight,
          });
          groups.slicks.addLayer(particleCircle);
        });
      });
      return;
    }

    allOilEnsembles.forEach((ensemble) => {
      const isFocused = ensemble.incidentId === selectedIncidentId;
      if (ensemble.slickPolygon.length >= 3) {
        const coords = ensemble.slickPolygon.map((p) => [p.lat, p.lon] as [number, number]);
        const poly = L.polygon(coords, {
          color: isFocused ? '#EF4444' : '#F59E0B',
          weight: isFocused ? 1.8 : 1.2,
          opacity: isFocused ? 0.9 : 0.55,
          fillColor: isFocused ? '#B91C1C' : '#B45309',
          fillOpacity: isFocused ? 0.36 : 0.2,
        });
        poly.bindTooltip(`SAR Oil Slick Plume · ${ensemble.phaseLabel}`, {
          className: 'tactical-tooltip',
          sticky: true,
        });
        poly.on('click', () => onSelectIncident(ensemble.incidentId));
        groups.slicks.addLayer(poly);
      }

      ensemble.particles.forEach((pt) => {
        const particleCircle = L.circle([pt.lat, pt.lon], {
          radius: pt.radiusM,
          color: isFocused ? '#FCA5A5' : '#FBBF24',
          weight: 0.8,
          opacity: 0.45 * pt.weight,
          fillColor: isFocused ? '#EF4444' : '#F59E0B',
          fillOpacity: 0.32 * pt.weight,
        });
        groups.slicks.addLayer(particleCircle);
      });
    });

    if (historicalReplay?.oilDrift) {
      const histOil = historicalReplay.oilDrift;

      if (histOil.forwardConePolygon.length >= 3) {
        const coneCoords = histOil.forwardConePolygon.map((p) => [p.lat, p.lon] as [number, number]);
        const fwdCone = L.polygon(coneCoords, {
          color: '#F59E0B',
          weight: 1.4,
          opacity: 0.78,
          dashArray: '4 4',
          fillColor: '#F59E0B',
          fillOpacity: 0.13,
        });
        fwdCone.bindTooltip(
          `Open-Meteo Archive Wind Drift Ensemble (${histOil.driftBearingDeg}° @ ${histOil.driftSpeedKts} kts)`,
          { className: 'tactical-tooltip' }
        );
        groups.slicks.addLayer(fwdCone);
      }

      if (histOil.backtrackPath.length >= 2) {
        const backCoords = histOil.backtrackPath.map((p) => [p.lat, p.lon] as [number, number]);
        const backLine = L.polyline(backCoords, {
          color: '#FF2A5F',
          weight: 2.2,
          opacity: 0.9,
          dashArray: '5 4',
        });
        backLine.bindTooltip(
          `Slick Advection Path · Origin ${histOil.originTimeUtc.slice(11, 16)}Z`,
          { className: 'tactical-tooltip', sticky: true }
        );
        groups.slicks.addLayer(backLine);
      }

      if (histOil.forwardTrajectory.length >= 2) {
        const fwdCoords = histOil.forwardTrajectory.map((p) => [p.lat, p.lon] as [number, number]);
        const fwdLine = L.polyline(fwdCoords, {
          color: '#F59E0B',
          weight: 1.6,
          opacity: 0.72,
          dashArray: '3 5',
        });
        groups.slicks.addLayer(fwdLine);
      }

      const originMarker = L.circleMarker([histOil.originLat, histOil.originLon], {
        radius: 5.5,
        color: '#FF2A5F',
        weight: 2,
        fillColor: '#040812',
        fillOpacity: 0.95,
      });
      originMarker.bindTooltip(
        `SAR Detected Discharge Origin (${histOil.slickAreaKm2} km²)`,
        { className: 'tactical-tooltip' }
      );
      groups.slicks.addLayer(originMarker);

      if (histOil.slickPolygon.length >= 3) {
        const coords = histOil.slickPolygon.map((p) => [p.lat, p.lon] as [number, number]);
        const poly = L.polygon(coords, {
          color: '#FF2A5F',
          weight: 2,
          opacity: 0.94,
          fillColor: '#9F1239',
          fillOpacity: 0.42,
        });
        poly.bindTooltip(
          `${histOil.sourceLabel} · ${histOil.slickAreaKm2} km² · ${histOil.phaseLabel}`,
          { className: 'tactical-tooltip', sticky: true }
        );
        groups.slicks.addLayer(poly);
      }

      histOil.particles.forEach((pt) => {
        const particleCircle = L.circle([pt.lat, pt.lon], {
          radius: pt.radiusM,
          color: '#FB7185',
          weight: 0.8,
          opacity: 0.5 * pt.weight,
          fillColor: '#FF2A5F',
          fillOpacity: 0.34 * pt.weight,
        });
        groups.slicks.addLayer(particleCircle);
      });
    }

    if (liveOilSimulation) {
      if (liveOilSimulation.forwardConePolygon.length >= 3) {
        const coneCoords = liveOilSimulation.forwardConePolygon.map(
          (p) => [p.lat, p.lon] as [number, number]
        );
        const fwdCone = L.polygon(coneCoords, {
          color: '#F59E0B',
          weight: 1.3,
          opacity: 0.72,
          dashArray: '4 4',
          fillColor: '#F59E0B',
          fillOpacity: 0.12,
        });
        fwdCone.bindTooltip(
          `3-Buoy Metocean Drift Uncertainty Cone (${liveOilSimulation.driftBearingDeg}° @ ${liveOilSimulation.driftSpeedKts} kts)`,
          { className: 'tactical-tooltip' }
        );
        groups.slicks.addLayer(fwdCone);
      }

      if (liveOilSimulation.backtrackPath.length >= 2) {
        const backCoords = liveOilSimulation.backtrackPath.map(
          (p) => [p.lat, p.lon] as [number, number]
        );
        const backLine = L.polyline(backCoords, {
          color: '#FF2A5F',
          weight: 2.2,
          opacity: 0.88,
          dashArray: '5 4',
        });
        backLine.bindTooltip(
          `Oil Backtrack to Origin (-${liveOilSimulation.releaseHoursAgo}h · ${liveOilSimulation.originTimeUtc.slice(11, 16)}Z)`,
          { className: 'tactical-tooltip', sticky: true }
        );
        groups.slicks.addLayer(backLine);
      }

      const originMarker = L.circleMarker(
        [liveOilSimulation.originLat, liveOilSimulation.originLon],
        {
          radius: 5,
          color: '#FF2A5F',
          weight: 2,
          fillColor: '#040812',
          fillOpacity: 0.95,
        }
      );
      originMarker.bindTooltip(
        `Estimated Discharge Origin (-${liveOilSimulation.releaseHoursAgo}h)`,
        { className: 'tactical-tooltip' }
      );
      groups.slicks.addLayer(originMarker);

      if (liveOilSimulation.slickPolygon.length >= 3) {
        const slickMet = interpolateBuoyMetocean(
          liveOilSimulation.currentCenterLat,
          liveOilSimulation.currentCenterLon,
          buoys,
          weather ?? {
            windSpeedKts: 11,
            windSpeedMs: 5.7,
            windDirectionDeg: 315,
            windDirectionCardinal: 'NW',
            waveHeightM: 1.1,
            seaSurfaceTempC: 22.4,
            surfaceCurrentKts: 0.35,
            surfaceCurrentDeg: 108,
            kpIndex: 2.0,
            kpStatus: 'NOMINAL',
            solarFluxSfu: 120,
            donkiVerified: true,
            donkiStormAlertsCount: 0,
            kpSource: 'FALLBACK',
            metoceanSource: 'FALLBACK',
            sarObservabilityPct: 91,
            updatedUtc: new Date().toISOString(),
          }
        );
        const liveSlickConf = computeSarConfidenceAssessment(slickMet.windSpeedKts, {
          hasAnomaly: true,
          hasSlick: true,
          windDirectionDeg: slickMet.windDirectionDeg,
        });
        const isManualSimSlick = liveOilSimulation.id.startsWith('live-spill-');
        const coords = liveOilSimulation.slickPolygon.map((p) => [p.lat, p.lon] as [number, number]);
        const poly = L.polygon(coords, {
          color: isManualSimSlick ? '#22D3EE' : '#F59E0B',
          weight: 1.8,
          opacity: 0.92,
          dashArray: isManualSimSlick ? '5 4' : undefined,
          fillColor: isManualSimSlick ? '#0E7490' : '#92400E',
          fillOpacity: 0.34,
        });
        poly.bindTooltip(
          `<div style="line-height:1.35">
            <div style="font-weight:700;color:${isManualSimSlick ? '#22D3EE' : '#F59E0B'}">${
              isManualSimSlick
                ? `Optional Drift Simulation (${liveOilSimulation.sourceLabel})`
                : `Anomaly Drift Model (${liveOilSimulation.sourceLabel})`
            }</div>
            <div>${liveOilSimulation.slickAreaKm2} km² · ${liveOilSimulation.phaseLabel}</div>
            <div style="color:${liveSlickConf.tone === 'cyan' ? '#22D3EE' : '#F59E0B'};font-weight:700;font-size:9.5px">${liveSlickConf.badgeText}</div>
          </div>`,
          { className: 'tactical-tooltip', sticky: true }
        );
        groups.slicks.addLayer(poly);
      }

      const isManualSimParticles = liveOilSimulation.id.startsWith('live-spill-');
      liveOilSimulation.particles.forEach((pt) => {
        const particleCircle = L.circle([pt.lat, pt.lon], {
          radius: pt.radiusM,
          color: isManualSimParticles ? '#22D3EE' : '#F59E0B',
          weight: 0.8,
          opacity: 0.52 * pt.weight,
          fillColor: isManualSimParticles ? '#22D3EE' : '#F59E0B',
          fillOpacity: 0.3 * pt.weight,
        });
        groups.slicks.addLayer(particleCircle);
      });
    }
  }, [
    layers.oilDriftEnsemble,
    allOilEnsembles,
    liveOilSimulation,
    historicalReplay,
    selectedIncidentId,
    onSelectIncident,
    isForensicStandalone,
    forensicCases,
    selectedForensicCaseId,
    forensicTimeOffsetHours,
    onSelectForensicCase,
    onSelectVessel,
  ]);

  // Render Oriented Vessel Silhouettes (Persistent Stateful Markers for Multi-Ship Forensic Scrubbing, or Live AIS Stream in Surveillance)
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups) return;

    const escapeHtml = (val: string) =>
      val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (isForensicStandalone) {
      const activeIds = new Set(forensicCases.map((fc) => fc.id));

      // Clear any non-forensic markers cleanly
      liveMarkersRef.current.forEach((marker) => {
        groups.vessels.removeLayer(marker);
      });
      liveMarkersRef.current.clear();

      // Clear any deleted cases without touching active markers
      const forensicLayerSet = new Set<L.Layer>();
      forensicMarkersRef.current.forEach((marker, caseId) => {
        if (!activeIds.has(caseId)) {
          groups.vessels.removeLayer(marker);
          forensicMarkersRef.current.delete(caseId);
        } else {
          forensicLayerSet.add(marker);
        }
      });
      groups.vessels.eachLayer((layer) => {
        if (!forensicLayerSet.has(layer)) {
          groups.vessels.removeLayer(layer);
        }
      });

      forensicCases.forEach((fc) => {
        const pv = fc.primaryVessel;
        const isSelected = fc.id === selectedForensicCaseId;
        const temporal = evaluateForensicCaseAtTime(fc, forensicTimeOffsetHours);
        const yearTag = fc.isExternalIngest
          ? `EXT${fc.dateStr.slice(2, 4)}`
          : `'${fc.dateStr.slice(2, 4)}`;

        const sarConf = computeSarConfidenceAssessment(fc.metoceanAtEvent.windSpeedKts, {
          hasAnomaly: true,
          isConfirmedDark: fc.primaryVessel.aisGapHours >= 0.5,
          aisGapMinutes: fc.primaryVessel.aisGapHours * 60,
          hasSlick: fc.spill.areaKm2 > 0,
          windDirectionDeg: fc.metoceanAtEvent.windDirectionDeg,
        });
        const coastal = computeCoastalImpactAssessment({
          lat: temporal.lat,
          lon: temporal.lon,
          windSpeedKts: fc.metoceanAtEvent.windSpeedKts,
          windDirectionDeg: fc.metoceanAtEvent.windDirectionDeg,
          currentSpeedKts: fc.metoceanAtEvent.currentSpeedKts,
          currentDirectionDeg: fc.metoceanAtEvent.currentDirectionDeg,
          slickWidthKm: fc.spill.maxWidthKm,
          slickAreaKm2: fc.spill.areaKm2,
          driftBearingDeg: fc.spill.slickBearingDeg,
          driftSpeedKts: fc.spill.driftSpeedKts,
          coastlineImpactEtaOverrideHours: fc.impactAssessment.coastlineImpactEtaHours,
        });

        const sarBadgeBorder =
          sarConf.tone === 'cyan' ? 'rgba(34,211,238,0.5)' : 'rgba(245,158,11,0.55)';
        const sarBadgeBg =
          sarConf.tone === 'cyan' ? 'rgba(34,211,238,0.12)' : 'rgba(245,158,11,0.14)';
        const sarBadgeColor = sarConf.tone === 'cyan' ? '#22D3EE' : '#F59E0B';

        const icon = L.divIcon({
          className: 'vessel-div-icon',
          html: createForensicShipSvg(
            yearTag,
            temporal.headingDeg,
            isSelected,
            temporal.phase,
            fc.isExternalIngest
          ),
          iconSize: [56, 62],
          iconAnchor: [28, 28],
        });

        const tooltipHtml = `
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.35;max-width:235px">
            <div style="font-weight:700;color:${isSelected ? '#22D3EE' : '#F59E0B'}">${escapeHtml(fc.caseCode)} · ${escapeHtml(pv.name)}</div>
            <div style="color:#cbd5e1">${temporal.lat.toFixed(3)}°N, ${temporal.lon.toFixed(3)}°E · ${temporal.sogKts.toFixed(1)} kt · ${escapeHtml(temporal.simulatedClockUtc)}</div>
            <div style="color:#94a3b8">${escapeHtml(temporal.phaseLabel)} · ${fc.spill.areaKm2} km²</div>
          </div>
        `;

        const coastalCompactHtml = coastal.approachesOrIntersects
          ? `<div style="background:#101C28;border:1px solid rgba(245,158,11,0.45);border-radius:3px;padding:4px 6px;margin-bottom:5px;font-size:9.5px">
              <div style="color:#F59E0B;font-weight:700">COASTAL: ${escapeHtml(coastal.nearestSectorName)}</div>
              <div style="color:#cbd5e1">ETA ${coastal.estimatedLandfallEtaHours !== null ? `+${coastal.estimatedLandfallEtaHours}h` : 'Approach'} · ${escapeHtml(coastal.responseRequirementLabel)}</div>
            </div>`
          : '';

        const popupHtml = `
          <div class="vessel-popup-scroll hud-scroll max-h-64 overflow-y-auto overscroll-contain pr-1" style="font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.4;width:258px;color:#e2e8f0;overscroll-behavior:contain">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(34,211,238,0.22);padding-bottom:3px;margin-bottom:4px">
              <span style="font-weight:700;color:#22D3EE">${escapeHtml(fc.caseCode)} · ${escapeHtml(temporal.simulatedDateStr)}</span>
              <span style="color:#F59E0B;font-weight:700">${escapeHtml(temporal.simulatedClockUtc)}</span>
            </div>
            <div style="font-weight:700;color:#f8fafc;font-size:11px;margin-bottom:2px">${escapeHtml(pv.name)} (${escapeHtml(pv.flag)})</div>
            <div style="color:#94a3b8;font-size:9.5px;margin-bottom:4px">MMSI ${escapeHtml(pv.mmsi)} · Gap ${pv.aisGapHours}h · ${temporal.sogKts.toFixed(1)} kt @ ${temporal.headingDeg}°</div>
            <div style="margin-bottom:5px;padding:3px 5px;border-radius:3px;border:1px solid ${sarBadgeBorder};background:${sarBadgeBg};color:${sarBadgeColor};font-weight:700;font-size:9px">
              ${escapeHtml(sarConf.badgeText)}
            </div>
            <div style="background:#101C28;border:1px solid rgba(34,211,238,0.2);border-radius:3px;padding:4px 6px;margin-bottom:5px;font-size:9.5px">
              <div><span style="color:#94a3b8">Pos:</span> <span style="color:#22D3EE">${temporal.lat.toFixed(3)}°N, ${temporal.lon.toFixed(3)}°E</span> · ${escapeHtml(temporal.phaseLabel)}</div>
              <div><span style="color:#94a3b8">SAR Pass:</span> <span style="color:#F59E0B">${fc.sarPass.passCoordinates.lat.toFixed(3)}°N, ${fc.sarPass.passCoordinates.lon.toFixed(3)}°E</span> (${escapeHtml(fc.sarPass.satellite)})</div>
              <div><span style="color:#94a3b8">Spill:</span> <strong style="color:#f8fafc">${fc.spill.areaKm2} km²</strong> (${fc.spill.estimatedVolumeBarrels} bbl) · ${escapeHtml(fc.spill.oilType)}</div>
              <div><span style="color:#94a3b8">Wind:</span> ${fc.metoceanAtEvent.windSpeedKts} kt ${escapeHtml(fc.metoceanAtEvent.windDirectionCardinal)} · dx=${fc.sarPass.azimuthDisplacementM}m</div>
            </div>
            ${coastalCompactHtml}
            <div style="display:flex;gap:5px">
              <button type="button" data-export-dossier="true" data-export-mode="forensic" data-export-id="${escapeHtml(fc.id)}" style="flex:1;padding:5px 7px;border-radius:3px;border:1px solid rgba(34,211,238,0.6);background:rgba(34,211,238,0.16);color:#cffafe;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;cursor:pointer;">
                EXPORT INCIDENT DOSSIER
              </button>
              <button type="button" data-open-inspector="true" data-export-mode="forensic" data-export-id="${escapeHtml(fc.id)}" style="padding:5px 7px;border-radius:3px;border:1px solid rgba(245,158,11,0.5);background:rgba(16,28,40,0.9);color:#F59E0B;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;cursor:pointer;">
                LAB
              </button>
            </div>
          </div>
        `;

        const existingMarker = forensicMarkersRef.current.get(fc.id);
        if (existingMarker) {
          existingMarker.setLatLng([temporal.lat, temporal.lon]);
          existingMarker.setIcon(icon);
          existingMarker.setZIndexOffset(isSelected ? 950 : 620);
          existingMarker.setTooltipContent(tooltipHtml);
          if (!existingMarker.isPopupOpen()) {
            existingMarker.setPopupContent(popupHtml);
          }
        } else {
          const marker = L.marker([temporal.lat, temporal.lon], {
            icon,
            zIndexOffset: isSelected ? 950 : 620,
          });

          marker.bindTooltip(tooltipHtml, {
            className: 'tactical-tooltip',
            direction: 'top',
            offset: [0, -14],
          });
          marker.bindPopup(popupHtml, {
            className: 'tactical-tooltip',
            maxWidth: 290,
            autoPan: false,
          });

          marker.on('click', () => {
            forensicCallbacksRef.current.onSelectForensicCase?.(fc.id);
            forensicCallbacksRef.current.onSelectIncident(fc.id);
            forensicCallbacksRef.current.onSelectVessel(pv.id);
          });

          groups.vessels.addLayer(marker);
          forensicMarkersRef.current.set(fc.id, marker);
        }
      });
      return;
    }

    forensicMarkersRef.current.forEach((m) => groups.vessels.removeLayer(m));
    forensicMarkersRef.current.clear();

    const selectedInc = incidents.find((i) => i.id === selectedIncidentId);
    const defaultFallbackWeather: WeatherState = weather ?? {
      windSpeedKts: 11,
      windSpeedMs: 5.7,
      windDirectionDeg: 315,
      windDirectionCardinal: 'NW',
      waveHeightM: 1.1,
      seaSurfaceTempC: 22.4,
      surfaceCurrentKts: 0.35,
      surfaceCurrentDeg: 108,
      kpIndex: 2.0,
      kpStatus: 'NOMINAL',
      solarFluxSfu: 120,
      donkiVerified: true,
      donkiStormAlertsCount: 0,
      kpSource: 'FALLBACK',
      metoceanSource: 'FALLBACK',
      sarObservabilityPct: 91,
      updatedUtc: new Date().toISOString(),
    };

    const darkEnvByVesselId = new Map<string, DarkEnvelopeState>();
    darkEnvelopes.forEach((env) => darkEnvByVesselId.set(env.vesselId, env));

    const activeLiveIds = new Set(vessels.map((v) => v.id));
    liveMarkersRef.current.forEach((existingMarker, id) => {
      if (!activeLiveIds.has(id)) {
        groups.vessels.removeLayer(existingMarker);
        liveMarkersRef.current.delete(id);
      }
    });

    vessels.forEach((vessel) => {
      const isPrimaryOfSelected = selectedInc?.primaryVesselId === vessel.id;
      const isSelected =
        selectedVesselId !== null ? vessel.id === selectedVesselId : isPrimaryOfSelected;
      const isIncidentLinked = Boolean(vessel.incidentId);
      const matchingDarkEnv = darkEnvByVesselId.get(vessel.id);

      let lat = vessel.lat;
      let lon = vessel.lon;
      let heading = vessel.headingDeg;

      if (isPrimaryOfSelected && !vessel.isLiveAis && activeEnsemble) {
        lat = activeEnsemble.vesselPositionAtTime.lat;
        lon = activeEnsemble.vesselPositionAtTime.lon;
        heading = activeEnsemble.vesselHeadingAtTime;
      }

      const icon = L.divIcon({
        className: 'vessel-div-icon',
        html: createShipSvg(vessel.status, heading, isSelected, vessel.isLiveAis),
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      });

      const statusLabel = vessel.isLiveAis
        ? matchingDarkEnv?.isConfirmedDark
          ? `DARK ANOMALY (${Math.round(matchingDarkEnv.gapMinutes)}m GAP)`
          : `LIVE AIS · ${escapeHtml(vessel.vesselType)}`
        : historicalReplay
          ? vessel.status === 'dark'
            ? 'DARK TARGET · AIS DROPOUT'
            : `HISTORICAL AIS · ${escapeHtml(vessel.vesselType)}`
          : vessel.status === 'dark'
            ? 'DARK / AIS GAP'
            : vessel.status === 'spoofed'
              ? 'SPOOFED / ANOMALY'
              : 'FORENSIC CASE';

      const isSimActive = Boolean(simActiveVesselIds[vessel.id]);
      const activeOilForTarget =
        liveOilSimulation &&
        (liveOilSimulation.id === `live-spill-${vessel.id}` ||
          liveOilSimulation.id === `auto-vessel-${vessel.id}` ||
          (isSelected && liveOilSimulation.anchorType === 'vessel'))
          ? liveOilSimulation
          : null;

      const aisGapMins = matchingDarkEnv ? matchingDarkEnv.gapMinutes : vessel.aisGapHours * 60;
      const isDarkOrSpoofed =
        Boolean(matchingDarkEnv?.isConfirmedDark) ||
        vessel.status === 'dark' ||
        vessel.status === 'spoofed';
      const isOptionalSimulationOnly = (isSimActive || Boolean(activeOilForTarget)) && !isDarkOrSpoofed;
      const isConfirmedAnomaly = isDarkOrSpoofed || Boolean(activeOilForTarget) || isSimActive;

      const cableRiskLabel =
        vessel.nearestCableDistanceKm < 3
          ? 'PROXIMITY WATCH (<3 km)'
          : vessel.nearestCableDistanceKm < 8
            ? 'MODERATE PROXIMITY'
            : 'LOW RISK';

      const statusColor =
        vessel.status === 'dark' || matchingDarkEnv?.isConfirmedDark
          ? '#F59E0B'
          : vessel.status === 'spoofed'
            ? '#F59E0B'
            : vessel.isLiveAis
              ? '#34d399'
              : '#22d3ee';

      const tooltipHtml = `
        <div style="line-height:1.35;max-width:225px">
          <div style="font-weight:700;color:#f8fafc">${escapeHtml(vessel.name)}</div>
          <div style="color:#94a3b8">${escapeHtml(vessel.mmsi)} · ${vessel.sogKts.toFixed(1)} kt · ${heading}°</div>
          <div style="color:${isOptionalSimulationOnly ? '#22D3EE' : statusColor}">${isOptionalSimulationOnly ? 'OPTIONAL SIM ACTIVE' : statusLabel}</div>
        </div>
      `;

      let popupHtml = '';

      if (!isConfirmedAnomaly) {
        // Routine / Compliant Vessel (Active AIS or <30 min gap): Clean navigation telemetry only
        const routineHeaderTag =
          matchingDarkEnv && matchingDarkEnv.gapMinutes >= 0.5
            ? `GAP ${Math.round(matchingDarkEnv.gapMinutes)}M (<30M)`
            : 'ROUTINE // COMPLIANT';
        const routineAisStatus =
          matchingDarkEnv && matchingDarkEnv.gapMinutes >= 0.5
            ? `ROUTINE // GAP ${matchingDarkEnv.gapMinutes.toFixed(1)}m (<30m)`
            : 'ROUTINE // COMPLIANT';

        popupHtml = `
          <div class="vessel-popup-scroll hud-scroll max-h-64 overflow-y-auto overscroll-contain pr-1" style="font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.42;width:258px;color:#e2e8f0;overscroll-behavior:contain">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(34,211,238,0.22);padding-bottom:3px;margin-bottom:4px">
              <span style="font-weight:700;color:#22D3EE">MMSI ${escapeHtml(vessel.mmsi)}</span>
              <span style="color:#34d399;font-weight:700">${escapeHtml(routineHeaderTag)}</span>
            </div>
            <div style="font-weight:700;color:#f8fafc;font-size:11px;margin-bottom:2px">${escapeHtml(vessel.name)} (${escapeHtml(vessel.flag)})</div>
            <div style="color:#94a3b8;font-size:9.5px;margin-bottom:5px">${escapeHtml(vessel.vesselType)} · IMO ${escapeHtml(vessel.imo)}</div>
            <div style="background:#101C28;border:1px solid rgba(34,211,238,0.2);border-radius:3px;padding:5px 6px;margin-bottom:6px;font-size:9.5px">
              <div><span style="color:#94a3b8">Position:</span> <span style="color:#22D3EE">${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</span></div>
              <div><span style="color:#94a3b8">Speed / Hdg:</span> <span style="color:#f8fafc">${vessel.sogKts.toFixed(1)} kts · ${heading}°</span></div>
              <div><span style="color:#94a3b8">AIS Status:</span> <span style="color:#34d399">${escapeHtml(routineAisStatus)}</span></div>
              <div><span style="color:#94a3b8">Nearest Cable:</span> <span style="color:${vessel.nearestCableDistanceKm < 3 ? '#F59E0B' : '#cbd5e1'}">${escapeHtml(vessel.nearestCableName)} (${vessel.nearestCableDistanceKm} km · ${cableRiskLabel})</span></div>
            </div>
            <button type="button" data-toggle-optional-sim="true" data-open-lab="true" data-export-mode="surveillance" data-export-id="${escapeHtml(vessel.id)}" style="width:100%;padding:5px 7px;border-radius:3px;border:1px solid rgba(34,211,238,0.55);background:rgba(16,28,40,0.94);color:#22D3EE;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;cursor:pointer;">
              OPEN TARGET LAB / OPTIONAL SIM
            </button>
          </div>
        `;
      } else {
        // Flagged Dark Vessel (>30m blackout / spoofed) or Explicit Optional Drift Simulation
        const localMet = interpolateBuoyMetocean(lat, lon, buoys, defaultFallbackWeather);
        const sarConf = computeSarConfidenceAssessment(localMet.windSpeedKts, {
          hasAnomaly: true,
          isConfirmedDark: Boolean(matchingDarkEnv?.isConfirmedDark),
          aisGapMinutes: aisGapMins,
          hasSlick: Boolean(activeOilForTarget) || isOptionalSimulationOnly,
          windDirectionDeg: localMet.windDirectionDeg,
        });

        const simDriftBearingDeg =
          activeOilForTarget?.driftBearingDeg ??
          Math.round((localMet.windDirectionDeg + 180) % 360);
        const simDriftSpeedKts =
          activeOilForTarget?.driftSpeedKts ??
          Number((localMet.windSpeedKts * 0.03 + localMet.currentSpeedKts).toFixed(2));
        const simSlickAreaKm2 = activeOilForTarget?.slickAreaKm2 ?? 6.2;
        const simEstimatedBarrels = activeOilForTarget?.estimatedVolumeBarrels ?? 340;
        const sarLookAlikeNote =
          localMet.windSpeedKts < 3
            ? 'Low-wind look-alike risk (<3 kts)'
            : localMet.windSpeedKts <= 15
              ? 'Optimal 4-15 kt C/L-band slick window'
              : 'High sea-state dispersion (>16 kts)';

        const coastal = computeCoastalImpactAssessment({
          lat,
          lon,
          windSpeedKts: localMet.windSpeedKts,
          windDirectionDeg: localMet.windDirectionDeg,
          currentSpeedKts: localMet.currentSpeedKts,
          currentDirectionDeg: localMet.currentDirectionDeg,
          slickAreaKm2: simSlickAreaKm2,
          driftBearingDeg: simDriftBearingDeg,
          driftSpeedKts: simDriftSpeedKts,
          coastlineImpactEtaOverrideHours: activeOilForTarget?.coastlineImpactEtaHours,
        });

        const sarBadgeBorder =
          sarConf.tone === 'cyan' ? 'rgba(34,211,238,0.55)' : 'rgba(245,158,11,0.65)';
        const sarBadgeBg =
          sarConf.tone === 'cyan' ? 'rgba(34,211,238,0.14)' : 'rgba(245,158,11,0.16)';
        const sarBadgeColor = sarConf.tone === 'cyan' ? '#22D3EE' : '#F59E0B';

        const headerStatusTag = matchingDarkEnv?.isConfirmedDark
          ? `DARK >30M (${Math.round(matchingDarkEnv.gapMinutes)}M)`
          : vessel.status === 'spoofed'
            ? 'GNSS SPOOFED'
            : vessel.status === 'dark'
              ? 'DARK TARGET'
              : 'OPTIONAL SIM ACTIVE';

        const coastalPopupHtml = coastal.approachesOrIntersects
          ? `<div style="background:#101C28;border:1px solid rgba(245,158,11,0.45);border-radius:3px;padding:4px 6px;margin-bottom:5px;font-size:9.5px">
              <div style="color:#F59E0B;font-weight:700">${isOptionalSimulationOnly ? 'SIMULATED COASTAL PATH' : 'COASTAL'}: ${escapeHtml(coastal.nearestSectorName)}</div>
              <div style="color:#cbd5e1">ETA ${coastal.estimatedLandfallEtaHours !== null ? `+${coastal.estimatedLandfallEtaHours}h` : 'Approach'} · ${escapeHtml(coastal.responseRequirementLabel)}</div>
            </div>`
          : isOptionalSimulationOnly
            ? `<div style="background:#101C28;border:1px solid rgba(34,211,238,0.28);border-radius:3px;padding:4px 6px;margin-bottom:5px;font-size:9.5px">
                <div style="color:#22D3EE;font-weight:700">SIMULATED PATH: OFFSHORE DRIFT</div>
                <div style="color:#cbd5e1">No Nile Delta / Alexandria shoreline landfall within +24h</div>
              </div>`
            : '';

        const optionalSimBlockHtml = isOptionalSimulationOnly
          ? `<div class="vessel-sim-reveal" style="background:#060D14;border:1px solid rgba(34,211,238,0.45);border-radius:3px;padding:5px 6px;margin-bottom:5px;font-size:9.5px">
              <div style="color:#22D3EE;font-weight:700;margin-bottom:2px">OPTIONAL SIMULATION METRICS</div>
              <div><span style="color:#94a3b8">Hypothetical Drift:</span> <span style="color:#f8fafc">${simDriftBearingDeg}° @ ${simDriftSpeedKts.toFixed(2)} kts</span></div>
              <div><span style="color:#94a3b8">Simulated Slick:</span> <span style="color:#F59E0B">${simSlickAreaKm2} km² (${simEstimatedBarrels} bbl)</span></div>
              <div><span style="color:#94a3b8">SAR Look-Alike:</span> <span style="color:#cbd5e1">${escapeHtml(sarLookAlikeNote)}</span></div>
            </div>`
          : '';

        const aisStatusSummary = matchingDarkEnv?.isConfirmedDark
          ? `Blackout ${matchingDarkEnv.gapMinutes.toFixed(1)}m (>30m threshold)`
          : vessel.aisGapHours >= 0.5
            ? `Blackout ${vessel.aisGapHours.toFixed(1)}h`
            : 'ROUTINE // OPTIONAL SIM ACTIVE';

        const footerButtonsHtml = isOptionalSimulationOnly
          ? `<div style="display:flex;gap:5px">
              <button type="button" data-toggle-optional-sim="true" data-open-lab="false" data-export-mode="surveillance" data-export-id="${escapeHtml(vessel.id)}" style="flex:1;padding:5px 7px;border-radius:3px;border:1px solid rgba(245,158,11,0.6);background:rgba(16,28,40,0.95);color:#F59E0B;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;cursor:pointer;">
                STOP OPTIONAL SIM
              </button>
              <button type="button" data-open-inspector="true" data-export-mode="surveillance" data-export-id="${escapeHtml(vessel.id)}" style="padding:5px 7px;border-radius:3px;border:1px solid rgba(34,211,238,0.6);background:rgba(34,211,238,0.16);color:#cffafe;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;cursor:pointer;">
                TARGET LAB
              </button>
            </div>`
          : `<div style="display:flex;gap:5px">
              <button type="button" data-export-dossier="true" data-export-mode="surveillance" data-export-id="${escapeHtml(vessel.id)}" style="flex:1;padding:5px 7px;border-radius:3px;border:1px solid rgba(34,211,238,0.6);background:rgba(34,211,238,0.16);color:#cffafe;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;cursor:pointer;">
                EXPORT INCIDENT DOSSIER
              </button>
              <button type="button" data-open-inspector="true" data-export-mode="surveillance" data-export-id="${escapeHtml(vessel.id)}" style="padding:5px 7px;border-radius:3px;border:1px solid rgba(245,158,11,0.5);background:rgba(16,28,40,0.9);color:#F59E0B;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;cursor:pointer;">
                LAB
              </button>
            </div>`;

        popupHtml = `
          <div class="vessel-popup-scroll hud-scroll max-h-64 overflow-y-auto overscroll-contain pr-1" style="font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.4;width:258px;color:#e2e8f0;overscroll-behavior:contain">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(34,211,238,0.22);padding-bottom:3px;margin-bottom:4px">
              <span style="font-weight:700;color:#22D3EE">MMSI ${escapeHtml(vessel.mmsi)}</span>
              <span style="color:${isOptionalSimulationOnly ? '#22D3EE' : '#F59E0B'};font-weight:700">${escapeHtml(headerStatusTag)}</span>
            </div>
            <div style="font-weight:700;color:#f8fafc;font-size:11px;margin-bottom:2px">${escapeHtml(vessel.name)} (${escapeHtml(vessel.flag)})</div>
            <div style="color:#94a3b8;font-size:9.5px;margin-bottom:4px">${escapeHtml(vessel.vesselType)} · IMO ${escapeHtml(vessel.imo)} · ${vessel.sogKts.toFixed(1)} kt @ ${heading}°</div>
            <div style="margin-bottom:5px;padding:3px 5px;border-radius:3px;border:1px solid ${sarBadgeBorder};background:${sarBadgeBg};color:${sarBadgeColor};font-weight:600;font-size:9px">
              ${isOptionalSimulationOnly ? `SIMULATION // ${escapeHtml(sarConf.badgeText)}` : escapeHtml(sarConf.badgeText)}
            </div>
            ${optionalSimBlockHtml}
            <div style="background:#101C28;border:1px solid rgba(34,211,238,0.2);border-radius:3px;padding:4px 6px;margin-bottom:5px;font-size:9.5px">
              <div><span style="color:#94a3b8">Position:</span> <span style="color:#22D3EE">${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</span></div>
              <div><span style="color:#94a3b8">AIS Status:</span> <span style="color:${isOptionalSimulationOnly ? '#22D3EE' : '#F59E0B'}">${escapeHtml(aisStatusSummary)}</span></div>
              <div><span style="color:#94a3b8">Wind Vector:</span> ${localMet.windSpeedKts} kt ${escapeHtml(localMet.windDirectionCardinal)} (${localMet.windDirectionDeg}°)</div>
              <div><span style="color:#94a3b8">Nearest Cable:</span> ${escapeHtml(vessel.nearestCableName)} (${vessel.nearestCableDistanceKm} km)</div>
            </div>
            ${coastalPopupHtml}
            ${footerButtonsHtml}
          </div>
        `;
      }

      const popupStateKey = `${isConfirmedAnomaly ? 'A' : 'R'}|${isOptionalSimulationOnly ? 'S' : 'N'}|${isSimActive ? '1' : '0'}|${activeOilForTarget ? activeOilForTarget.id : 'none'}`;
      const prevPopupStateKey = livePopupStateRef.current.get(vessel.id);
      livePopupStateRef.current.set(vessel.id, popupStateKey);

      const existingLiveMarker = liveMarkersRef.current.get(vessel.id);
      if (existingLiveMarker) {
        existingLiveMarker.setLatLng([lat, lon]);
        existingLiveMarker.setIcon(icon);
        existingLiveMarker.setZIndexOffset(
          isSelected ? 900 : vessel.status === 'dark' ? 500 : 120
        );
        existingLiveMarker.setTooltipContent(tooltipHtml);
        if (!existingLiveMarker.isPopupOpen() || prevPopupStateKey !== popupStateKey) {
          const popupEl = existingLiveMarker.getPopup()?.getElement();
          const prevScrollTop = popupEl?.querySelector('.vessel-popup-scroll')?.scrollTop ?? 0;
          existingLiveMarker.setPopupContent(popupHtml);
          if (existingLiveMarker.isPopupOpen() && prevScrollTop > 0) {
            window.requestAnimationFrame(() => {
              const updatedScroll = existingLiveMarker
                .getPopup()
                ?.getElement()
                ?.querySelector('.vessel-popup-scroll');
              if (updatedScroll) {
                updatedScroll.scrollTop = prevScrollTop;
              }
            });
          }
        }
      } else {
        const marker = L.marker([lat, lon], {
          icon,
          zIndexOffset: isSelected ? 900 : vessel.status === 'dark' ? 500 : 120,
        });

        marker.bindTooltip(tooltipHtml, {
          className: 'tactical-tooltip',
          direction: 'top',
          offset: [0, -10],
        });

        marker.bindPopup(popupHtml, {
          className: 'tactical-tooltip',
          maxWidth: 288,
          autoPan: false,
          closeOnClick: false,
        });

        marker.on('click', () => {
          forensicCallbacksRef.current.onSelectVessel(vessel.id);
          if (isIncidentLinked && vessel.incidentId) {
            forensicCallbacksRef.current.onSelectIncident(vessel.incidentId);
          }
        });

        groups.vessels.addLayer(marker);
        liveMarkersRef.current.set(vessel.id, marker);
      }
    });
  }, [
    vessels,
    incidents,
    selectedIncidentId,
    selectedVesselId,
    activeEnsemble,
    darkEnvelopes,
    liveOilSimulation,
    simActiveVesselIds,
    buoys,
    weather,
    historicalReplay,
    onSelectIncident,
    onSelectVessel,
    isForensicStandalone,
    forensicCases,
    selectedForensicCaseId,
    forensicTimeOffsetHours,
    onSelectForensicCase,
  ]);

  // Smooth Fly-To Camera Trigger
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToRequest) return;
    map.flyTo([flyToRequest.lat, flyToRequest.lon], flyToRequest.zoom, {
      duration: 1.25,
      easeLinearity: 0.25,
    });
  }, [flyToRequest]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleResetSector = () => {
    mapRef.current?.flyTo(MED_EAST_CENTER, MED_EAST_DEFAULT_ZOOM, { duration: 1.1 });
  };

  return (
    <div className="fixed inset-0 w-screen h-screen z-0">
      <div ref={containerRef} className="w-full h-full" />

      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 58%, rgba(4, 8, 18, 0.42) 100%)',
        }}
      />

      {/* Anchored Vertical Map Camera Toolbar (Fixed right-4, vertically centered, decoupled from HUD minimize) */}
      <div
        aria-label="Map Zoom and Pan Controls"
        className="fixed right-4 top-1/2 -translate-y-1/2 z-[900] hud-glass rounded-md p-1 flex flex-col gap-1"
      >
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
          className="w-8 h-8 flex items-center justify-center rounded text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
          className="w-8 h-8 flex items-center justify-center rounded text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setTrackpadPanEnabled((v) => !v)}
          title={
            trackpadPanEnabled
              ? 'Trackpad Two-Finger Pan Active (Pinch or Shift+Scroll to Zoom · Click to switch to Wheel Zoom)'
              : 'Mouse Wheel Zoom Active (Click to enable Trackpad Two-Finger Pan)'
          }
          aria-label="Toggle Trackpad Pan vs Wheel Zoom"
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors border-t border-cyan-500/15 pt-1 ${
            trackpadPanEnabled
              ? 'text-cyan-300 bg-cyan-500/15 hover:bg-cyan-500/25'
              : 'text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15'
          }`}
        >
          {trackpadPanEnabled ? <Hand className="w-3.5 h-3.5" /> : <Mouse className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={handleResetSector}
          title="Reset Eastern Med View"
          aria-label="Reset Eastern Med View"
          className="w-8 h-8 flex items-center justify-center rounded text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 transition-colors border-t border-cyan-500/15 pt-1"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Anchored Cursor Telemetry Probe */}
      <div className="fixed bottom-[6.75rem] left-1/2 -translate-x-1/2 z-[890] hud-glass-subtle rounded px-2.5 py-1 flex items-center gap-2 text-[10.5px] font-mono text-slate-300 pointer-events-none">
        <Crosshair className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="whitespace-nowrap">
          {cursorCoords.lat.toFixed(4)}°N {cursorCoords.lon.toFixed(4)}°E
        </span>
        <span className="text-slate-500">·</span>
        <span className="text-cyan-300 whitespace-nowrap">Z{currentZoom}</span>
      </div>
    </div>
  );
};
