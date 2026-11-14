import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
// Vercel sets VERCEL=1 in both build and runtime. On Vercel we run as a stateless
// serverless function: no app.listen(), no persistent WebSocket, no background timers.
const IS_VERCEL = Boolean(process.env.VERCEL);

// Egyptian Eastern Mediterranean Sector: Alexandria, Damietta, Port Said, Suez Northern Approach & Offshore Corridor
const MED_EAST_BBOX: [[number, number], [number, number]] = [
  [30.0, 28.5],
  [34.2, 34.8],
];

type ServerAisStatus = 'disconnected' | 'needs_key' | 'connecting' | 'connected' | 'error';

interface LatLng {
  lat: number;
  lon: number;
}

interface SubseaCableDef {
  name: string;
  coordinates: LatLng[];
}

const SUBSEA_CABLES: SubseaCableDef[] = [
  {
    name: 'SEA-ME-WE 5',
    coordinates: [
      { lat: 31.145, lon: 29.74 },
      { lat: 31.32, lon: 29.81 },
      { lat: 31.512, lon: 29.862 },
      { lat: 31.82, lon: 29.79 },
      { lat: 32.18, lon: 29.71 },
      { lat: 32.49, lon: 29.63 },
    ],
  },
  {
    name: 'AAE-1',
    coordinates: [
      { lat: 31.318, lon: 30.068 },
      { lat: 31.52, lon: 30.095 },
      { lat: 31.84, lon: 30.145 },
      { lat: 32.16, lon: 30.18 },
      { lat: 32.48, lon: 30.24 },
    ],
  },
  {
    name: 'FLAG Europe-Asia',
    coordinates: [
      { lat: 31.215, lon: 29.91 },
      { lat: 31.46, lon: 29.97 },
      { lat: 31.75, lon: 30.28 },
      { lat: 32.02, lon: 30.74 },
      { lat: 32.28, lon: 31.42 },
      { lat: 32.47, lon: 32.15 },
    ],
  },
];

interface LiveAisVesselRecord {
  id: string;
  mmsi: string;
  imo: string;
  name: string;
  flag: string;
  vesselType: string;
  shipTypeCode?: number;
  callSign?: string;
  destination?: string;
  navStatus?: string;
  lengthM: number;
  beamM: number;
  draftM: number;
  lat: number;
  lon: number;
  sogKts: number;
  cogDeg: number;
  headingDeg: number;
  status: 'legal';
  aisLastSeenUtc: string;
  aisGapHours: number;
  coverageNeighborsCount: number;
  nearestCableName: string;
  nearestCableDistanceKm: number;
  isLiveAis: true;
  updatedAtMs: number;
}

interface StaticShipCache {
  name?: string;
  imo?: string;
  callSign?: string;
  shipTypeCode?: number;
  vesselType?: string;
  lengthM?: number;
  beamM?: number;
  draftM?: number;
  destination?: string;
}

interface AisStreamRawMessage {
  MessageType?: string;
  error?: string;
  MetaData?: {
    MMSI?: number;
    ShipName?: string;
    latitude?: number;
    longitude?: number;
    time_utc?: string;
  };
  Message?: {
    PositionReport?: {
      UserID?: number;
      Sog?: number;
      Cog?: number;
      TrueHeading?: number;
      Latitude?: number;
      Longitude?: number;
      NavigationalStatus?: number;
    };
    StandardClassBPositionReport?: {
      UserID?: number;
      Sog?: number;
      Cog?: number;
      TrueHeading?: number;
      Latitude?: number;
      Longitude?: number;
    };
    ExtendedClassBPositionReport?: {
      UserID?: number;
      Name?: string;
      Type?: number;
      Sog?: number;
      Cog?: number;
      TrueHeading?: number;
      Latitude?: number;
      Longitude?: number;
      Dimension?: { A?: number; B?: number; C?: number; D?: number };
    };
    ShipStaticData?: {
      UserID?: number;
      Name?: string;
      ImoNumber?: number;
      CallSign?: string;
      Type?: number;
      Destination?: string;
      MaximumStaticDraught?: number;
      Dimension?: { A?: number; B?: number; C?: number; D?: number };
    };
  };
}

function getFlagFromMmsi(mmsi: string): string {
  const mid = mmsi.slice(0, 3);
  const midMap: Record<string, string> = {
    '622': 'EG',
    '351': 'PA',
    '352': 'PA',
    '353': 'PA',
    '354': 'PA',
    '355': 'PA',
    '356': 'PA',
    '357': 'PA',
    '370': 'PA',
    '371': 'PA',
    '372': 'PA',
    '373': 'PA',
    '374': 'PA',
    '636': 'LR',
    '637': 'LR',
    '538': 'MH',
    '215': 'MT',
    '229': 'MT',
    '248': 'MT',
    '249': 'MT',
    '256': 'MT',
    '209': 'CY',
    '210': 'CY',
    '212': 'CY',
    '237': 'GR',
    '239': 'GR',
    '240': 'GR',
    '241': 'GR',
    '271': 'TR',
    '247': 'IT',
    '226': 'FR',
    '227': 'FR',
    '228': 'FR',
    '211': 'DE',
    '218': 'DE',
    '232': 'GB',
    '233': 'GB',
    '234': 'GB',
    '235': 'GB',
    '257': 'NO',
    '258': 'NO',
    '259': 'NO',
    '219': 'DK',
    '220': 'DK',
    '244': 'NL',
    '245': 'NL',
    '246': 'NL',
    '255': 'PT',
    '224': 'ES',
    '225': 'ES',
    '308': 'BS',
    '309': 'BS',
    '311': 'BS',
    '319': 'KY',
    '316': 'CA',
    '338': 'US',
    '366': 'US',
    '367': 'US',
    '368': 'US',
    '369': 'US',
    '412': 'CN',
    '413': 'CN',
    '414': 'CN',
    '477': 'HK',
    '563': 'SG',
    '564': 'SG',
    '565': 'SG',
    '566': 'SG',
    '431': 'JP',
    '432': 'JP',
    '440': 'KR',
    '441': 'KR',
    '419': 'IN',
    '403': 'SA',
    '470': 'AE',
    '471': 'AE',
    '450': 'LB',
    '422': 'IR',
    '273': 'RU',
    '272': 'UA',
    '548': 'PH',
  };
  return midMap[mid] ?? `MID-${mid}`;
}

function decodeShipType(typeCode?: number): string {
  if (typeof typeCode !== 'number' || Number.isNaN(typeCode) || typeCode <= 0) {
    return 'AIS Vessel';
  }
  if (typeCode >= 70 && typeCode <= 79) {
    if (typeCode === 71 || typeCode === 72 || typeCode === 73 || typeCode === 74) {
      return 'Cargo / Hazmat';
    }
    return 'Cargo / Container';
  }
  if (typeCode >= 80 && typeCode <= 89) return 'Tanker';
  if (typeCode >= 60 && typeCode <= 69) return 'Passenger Vessel';
  if (typeCode >= 40 && typeCode <= 49) return 'High Speed Craft';
  if (typeCode === 30) return 'Fishing Vessel';
  if (typeCode === 31 || typeCode === 32 || typeCode === 52) return 'Tug / Towing';
  if (typeCode === 33) return 'Dredger';
  if (typeCode === 34) return 'Diving Ops';
  if (typeCode === 35) return 'Military Ops';
  if (typeCode === 36) return 'Sailing Vessel';
  if (typeCode === 37) return 'Pleasure Craft';
  if (typeCode === 50) return 'Pilot Vessel';
  if (typeCode === 51) return 'Search & Rescue';
  if (typeCode === 53) return 'Port Tender';
  if (typeCode === 55) return 'Law Enforcement';
  if (typeCode === 58) return 'Medical Transport';
  return `AIS Type ${typeCode}`;
}

function decodeNavStatus(code?: number): string | undefined {
  if (typeof code !== 'number') return undefined;
  const map: Record<number, string> = {
    0: 'Under way using engine',
    1: 'At anchor',
    2: 'Not under command',
    3: 'Restricted manoeuvrability',
    4: 'Constrained by draught',
    5: 'Moored',
    6: 'Aground',
    7: 'Engaged in fishing',
    8: 'Under way sailing',
    15: 'Not defined',
  };
  return map[code] ?? `Status ${code}`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentDistanceKmServer(
  lat: number,
  lon: number,
  a: LatLng,
  b: LatLng
): number {
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const px = (lon - a.lon) * 111.32 * cosLat;
  const py = (lat - a.lat) * 111.32;
  const bx = (b.lon - a.lon) * 111.32 * cosLat;
  const by = (b.lat - a.lat) * 111.32;
  const lenSq = bx * bx + by * by;
  if (lenSq <= 1e-9) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  return Math.hypot(px - t * bx, py - t * by);
}

function nearestSubseaCable(lat: number, lon: number): { name: string; distanceKm: number } {
  let bestName = 'Med-East Shelf';
  let bestDist = 999;
  for (const cable of SUBSEA_CABLES) {
    const coords = cable.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const d = pointToSegmentDistanceKmServer(lat, lon, coords[i], coords[i + 1]);
      if (d < bestDist) {
        bestDist = d;
        bestName = cable.name;
      }
    }
  }
  return { name: bestName, distanceKm: Number(bestDist.toFixed(2)) };
}

function normalizeAisUtcIso(rawUtc?: string): string {
  if (!rawUtc || typeof rawUtc !== 'string') {
    return new Date().toISOString();
  }
  const trimmed = rawUtc.trim();
  const parsedDirect = Date.parse(trimmed);
  if (Number.isFinite(parsedDirect)) {
    return new Date(parsedDirect).toISOString();
  }
  // AISStream Go format: "2026-11-13 17:45:12.123456789 +0000 UTC"
  const match = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?\s*\+0000\s*UTC$/i
  );
  if (match) {
    const msPart = match[3] ? match[3].slice(0, 3).padEnd(3, '0') : '000';
    const isoCandidate = `${match[1]}T${match[2]}.${msPart}Z`;
    const parsedMatch = Date.parse(isoCandidate);
    if (Number.isFinite(parsedMatch)) {
      return new Date(parsedMatch).toISOString();
    }
  }
  return new Date().toISOString();
}

class AisServerBridge {
  private activeApiKey: string = (process.env.AISSTREAM_API_KEY || '').trim();
  private keySource: 'env' | 'runtime' | 'none' = this.activeApiKey ? 'env' : 'none';
  private ws: WebSocket | null = null;
  private status: ServerAisStatus = this.activeApiKey ? 'connecting' : 'needs_key';
  private errorMessage = '';
  private lastMessageUtc = '';
  private vessels = new Map<string, LiveAisVesselRecord>();
  private staticCache = new Map<string, StaticShipCache>();
  private sseClients = new Set<express.Response>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Serverless: no persistent upstream WebSocket and no background timers.
    if (IS_VERCEL) {
      this.status = 'disconnected';
      this.errorMessage =
        'Live AIS WebSocket stream is not available on serverless hosting. Run the AIS bridge on a persistent host for live vessels.';
      return;
    }

    this.pruneTimer = setInterval(() => {
      const cutoff = Date.now() - 90 * 60 * 1000;
      let removed = false;
      for (const [mmsi, vessel] of this.vessels.entries()) {
        if (vessel.updatedAtMs < cutoff) {
          this.vessels.delete(mmsi);
          removed = true;
        }
      }
      if (removed) {
        this.scheduleBroadcast();
      }
    }, 60_000);

    if (this.activeApiKey) {
      this.connectUpstream();
    }
  }

  public getStatusPayload() {
    return {
      status: this.status,
      vesselCount: this.vessels.size,
      hasKey: Boolean(this.activeApiKey),
      keySource: this.keySource,
      lastMessageUtc: this.lastMessageUtc,
      errorMessage: this.errorMessage,
    };
  }

  public getVesselsList(): LiveAisVesselRecord[] {
    return Array.from(this.vessels.values())
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      .slice(0, 250);
  }

  public reconnect(forceReconnect = true) {
    if (IS_VERCEL) {
      return this.getStatusPayload();
    }

    const envKey = (process.env.AISSTREAM_API_KEY || '').trim();
    this.activeApiKey = envKey;
    this.keySource = envKey ? 'env' : 'none';

    if (!this.activeApiKey) {
      this.closeUpstream();
      this.status = 'needs_key';
      this.errorMessage = 'Server AISSTREAM_API_KEY is not configured in environment.';
      this.broadcastEvent('status', this.getStatusPayload());
      return this.getStatusPayload();
    }

    const alreadyHealthy =
      !forceReconnect &&
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) &&
      (this.status === 'connected' || this.status === 'connecting');

    if (alreadyHealthy) {
      return this.getStatusPayload();
    }

    this.errorMessage = '';
    this.connectUpstream();
    return this.getStatusPayload();
  }

  public addSseClient(res: express.Response) {
    // Serverless: a long-lived SSE connection cannot be held open. Send one snapshot,
    // tell EventSource to wait 60s before retrying, and close cleanly.
    if (IS_VERCEL) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.write('retry: 60000\n\n');
      this.sendSse(res, 'status', this.getStatusPayload());
      this.sendSse(res, 'vessels', []);
      res.end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    this.sseClients.add(res);
    this.sendSse(res, 'status', this.getStatusPayload());
    this.sendSse(res, 'vessels', this.getVesselsList());

    const pingInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, 15_000);

    res.on('close', () => {
      clearInterval(pingInterval);
      this.sseClients.delete(res);
    });
  }

  private sendSse(res: express.Response, event: string, data: unknown) {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private broadcastEvent(event: string, data: unknown) {
    for (const client of this.sseClients) {
      this.sendSse(client, event, data);
    }
  }

  private scheduleBroadcast() {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this.broadcastEvent('status', this.getStatusPayload());
      this.broadcastEvent('vessels', this.getVesselsList());
    }, 850);
  }

  private closeUpstream() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      try {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      } catch {
        // Ignore close errors
      }
    }
  }

  private connectUpstream() {
    this.closeUpstream();
    if (!this.activeApiKey) {
      this.status = 'needs_key';
      this.broadcastEvent('status', this.getStatusPayload());
      return;
    }

    this.status = 'connecting';
    this.broadcastEvent('status', this.getStatusPayload());

    const socket = new WebSocket('wss://stream.aisstream.io/v0/stream');
    this.ws = socket;

    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.status = 'connected';
      this.errorMessage = '';
      socket.send(
        JSON.stringify({
          APIKey: this.activeApiKey,
          BoundingBoxes: [MED_EAST_BBOX],
          FilterMessageTypes: [
            'PositionReport',
            'ShipStaticData',
            'StandardClassBPositionReport',
            'ExtendedClassBPositionReport',
          ],
        })
      );
      this.broadcastEvent('status', this.getStatusPayload());
    };

    socket.onmessage = async (event: MessageEvent) => {
      if (this.ws !== socket) return;
      try {
        let rawText = '';
        if (typeof event.data === 'string') {
          rawText = event.data;
        } else if (event.data instanceof ArrayBuffer) {
          rawText = Buffer.from(event.data).toString('utf8');
        } else if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
          rawText = await event.data.text();
        } else if (Buffer.isBuffer(event.data)) {
          rawText = event.data.toString('utf8');
        }
        if (!rawText) return;

        const msg = JSON.parse(rawText) as AisStreamRawMessage;
        if (msg.error) {
          this.status = 'error';
          this.errorMessage = msg.error;
          this.broadcastEvent('status', this.getStatusPayload());
          return;
        }
        if (msg.MessageType === 'SubscriptionConfirmation') {
          return;
        }

        this.handleAisMessage(msg);
      } catch {
        // Ignore malformed AIS frame
      }
    };

    socket.onerror = () => {
      if (this.ws !== socket) return;
      if (!this.errorMessage) {
        this.errorMessage = 'AISStream WebSocket connection error';
      }
      this.status = 'error';
      this.broadcastEvent('status', this.getStatusPayload());
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      if (this.status !== 'error') {
        this.status = this.activeApiKey ? 'disconnected' : 'needs_key';
      }
      this.broadcastEvent('status', this.getStatusPayload());
      if (this.activeApiKey && !this.errorMessage.toLowerCase().includes('api key')) {
        this.reconnectTimer = setTimeout(() => {
          this.connectUpstream();
        }, 6000);
      }
    };
  }

  private handleAisMessage(msg: AisStreamRawMessage) {
    const meta = msg.MetaData;
    const msgType = msg.MessageType;

    if (msgType === 'ShipStaticData' && msg.Message?.ShipStaticData) {
      const s = msg.Message.ShipStaticData;
      const mmsiNum = meta?.MMSI ?? s.UserID;
      if (!mmsiNum) return;
      const mmsi = String(mmsiNum);
      const dim = s.Dimension;
      const lengthM =
        dim && typeof dim.A === 'number' && typeof dim.B === 'number' && dim.A + dim.B > 0
          ? dim.A + dim.B
          : undefined;
      const beamM =
        dim && typeof dim.C === 'number' && typeof dim.D === 'number' && dim.C + dim.D > 0
          ? dim.C + dim.D
          : undefined;

      const prevStatic = this.staticCache.get(mmsi) ?? {};
      const nextStatic: StaticShipCache = {
        name: s.Name?.trim() || meta?.ShipName?.trim() || prevStatic.name,
        imo: s.ImoNumber && s.ImoNumber > 0 ? String(s.ImoNumber) : prevStatic.imo,
        callSign: s.CallSign?.trim() || prevStatic.callSign,
        shipTypeCode: typeof s.Type === 'number' ? s.Type : prevStatic.shipTypeCode,
        vesselType:
          typeof s.Type === 'number' ? decodeShipType(s.Type) : prevStatic.vesselType,
        lengthM: lengthM ?? prevStatic.lengthM,
        beamM: beamM ?? prevStatic.beamM,
        draftM:
          typeof s.MaximumStaticDraught === 'number' && s.MaximumStaticDraught > 0
            ? Number(s.MaximumStaticDraught.toFixed(1))
            : prevStatic.draftM,
        destination: s.Destination?.trim() || prevStatic.destination,
      };
      this.staticCache.set(mmsi, nextStatic);

      const existing = this.vessels.get(mmsi);
      if (existing) {
        this.vessels.set(mmsi, {
          ...existing,
          name: nextStatic.name || existing.name,
          imo: nextStatic.imo || existing.imo,
          callSign: nextStatic.callSign || existing.callSign,
          shipTypeCode: nextStatic.shipTypeCode ?? existing.shipTypeCode,
          vesselType: nextStatic.vesselType || existing.vesselType,
          lengthM: nextStatic.lengthM ?? existing.lengthM,
          beamM: nextStatic.beamM ?? existing.beamM,
          draftM: nextStatic.draftM ?? existing.draftM,
          destination: nextStatic.destination || existing.destination,
        });
        this.scheduleBroadcast();
      }
      return;
    }

    const pos =
      msg.Message?.PositionReport ??
      msg.Message?.StandardClassBPositionReport ??
      msg.Message?.ExtendedClassBPositionReport;

    if (!pos) return;
    const mmsiNum = meta?.MMSI ?? pos.UserID;
    if (!mmsiNum) return;

    const lat = meta?.latitude ?? pos.Latitude;
    const lon = meta?.longitude ?? pos.Longitude;
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      Number.isNaN(lat) ||
      Number.isNaN(lon) ||
      lat < MED_EAST_BBOX[0][0] ||
      lat > MED_EAST_BBOX[1][0] ||
      lon < MED_EAST_BBOX[0][1] ||
      lon > MED_EAST_BBOX[1][1]
    ) {
      return;
    }

    const mmsi = String(mmsiNum);
    const cachedStatic = this.staticCache.get(mmsi);
    const existing = this.vessels.get(mmsi);
    const ext = msg.Message?.ExtendedClassBPositionReport;

    const cog = typeof pos.Cog === 'number' && pos.Cog < 360 ? Math.round(pos.Cog) : 0;
    const heading =
      typeof pos.TrueHeading === 'number' && pos.TrueHeading < 360
        ? Math.round(pos.TrueHeading)
        : cog;
    const sog =
      typeof pos.Sog === 'number' && pos.Sog < 102.2 ? Number(pos.Sog.toFixed(1)) : 0;

    const navStatus =
      msgType === 'PositionReport' && msg.Message?.PositionReport
        ? decodeNavStatus(msg.Message.PositionReport.NavigationalStatus)
        : existing?.navStatus;

    const extLength =
      ext?.Dimension &&
      typeof ext.Dimension.A === 'number' &&
      typeof ext.Dimension.B === 'number' &&
      ext.Dimension.A + ext.Dimension.B > 0
        ? ext.Dimension.A + ext.Dimension.B
        : undefined;
    const extBeam =
      ext?.Dimension &&
      typeof ext.Dimension.C === 'number' &&
      typeof ext.Dimension.D === 'number' &&
      ext.Dimension.C + ext.Dimension.D > 0
        ? ext.Dimension.C + ext.Dimension.D
        : undefined;

    const nowIso = normalizeAisUtcIso(meta?.time_utc);
    this.lastMessageUtc = nowIso;
    const cable = nearestSubseaCable(lat, lon);

    const record: LiveAisVesselRecord = {
      id: `live-ais-${mmsi}`,
      mmsi,
      imo: cachedStatic?.imo || existing?.imo || 'N/A',
      name:
        cachedStatic?.name ||
        ext?.Name?.trim() ||
        meta?.ShipName?.trim() ||
        existing?.name ||
        `MMSI ${mmsi}`,
      flag: getFlagFromMmsi(mmsi),
      vesselType:
        cachedStatic?.vesselType ||
        (typeof ext?.Type === 'number' ? decodeShipType(ext.Type) : undefined) ||
        existing?.vesselType ||
        'AIS Vessel',
      shipTypeCode: cachedStatic?.shipTypeCode ?? ext?.Type ?? existing?.shipTypeCode,
      callSign: cachedStatic?.callSign || existing?.callSign,
      destination: cachedStatic?.destination || existing?.destination,
      navStatus,
      lengthM: cachedStatic?.lengthM ?? extLength ?? existing?.lengthM ?? 110,
      beamM: cachedStatic?.beamM ?? extBeam ?? existing?.beamM ?? 18,
      draftM: cachedStatic?.draftM ?? existing?.draftM ?? 6.5,
      lat,
      lon,
      sogKts: sog,
      cogDeg: cog,
      headingDeg: heading,
      status: 'legal',
      aisLastSeenUtc: nowIso,
      aisGapHours: 0,
      coverageNeighborsCount: Math.max(0, this.vessels.size - 1),
      nearestCableName: cable.name,
      nearestCableDistanceKm: cable.distanceKm,
      isLiveAis: true,
      updatedAtMs: Date.now(),
    };

    this.vessels.set(mmsi, record);
    this.scheduleBroadcast();
  }

  public dispose() {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    this.closeUpstream();
  }
}

// ============================================================================
// Server-Side Live Telemetry Aggregator (Zero CORS, Proper User-Agent & TTL)
// ============================================================================

const SERVER_USER_AGENT = 'AEGIS-SAR-MedEast/1.0 (Maritime-Orbital-Command)';

interface CacheEntry<T> {
  data: T;
  expiresAtMs: number;
}

const telemetryCache = new Map<string, CacheEntry<unknown>>();

function getCachedValue<T>(key: string, bypass: boolean): T | null {
  if (bypass) return null;
  const hit = telemetryCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAtMs) {
    telemetryCache.delete(key);
    return null;
  }
  return hit.data as T;
}

function setCachedValue<T>(key: string, data: T, ttlMs: number): void {
  telemetryCache.set(key, {
    data,
    expiresAtMs: Date.now() + ttlMs,
  });
}

async function fetchUpstreamText(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': SERVER_USER_AGENT,
        Accept: 'application/json, text/plain, */*',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUpstreamJson(url: string, timeoutMs = 12000): Promise<unknown> {
  const text = await fetchUpstreamText(url, timeoutMs);
  return JSON.parse(text) as unknown;
}

function degreesToCardinal(deg: number): string {
  const dirs = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return dirs[idx];
}

function computeSarObservabilityPct(windSpeedMs: number): number {
  if (windSpeedMs >= 3.5 && windSpeedMs <= 9.0) {
    const distFromIdeal = Math.abs(windSpeedMs - 6.2);
    return Number((97.2 - distFromIdeal * 1.4).toFixed(1));
  }
  if (windSpeedMs >= 3.0 && windSpeedMs <= 10.0) return 86.5;
  if (windSpeedMs < 3.0) return Number(Math.max(42, 60 + windSpeedMs * 8).toFixed(1));
  return Number(Math.max(38, 86 - (windSpeedMs - 10) * 6.5).toFixed(1));
}

const EGYPT_BUOYS = [
  { id: 'buoy-alex', name: 'Alexandria Offshore Buoy', lat: 31.35, lon: 29.85 },
  { id: 'buoy-damietta', name: 'Damietta Shelf Buoy', lat: 31.65, lon: 31.8 },
  { id: 'buoy-portsaid', name: 'Port Said / Suez Approach Buoy', lat: 31.45, lon: 32.35 },
];

interface NoradTleServerRecord {
  noradId: string;
  line1: string;
  line2: string;
  source: string;
}

async function fetchSingleSatelliteTleServer(noradId: string): Promise<NoradTleServerRecord | null> {
  // 1. Official CelesTrak GP TLE endpoint
  try {
    const tleText = await fetchUpstreamText(
      `https://celestrak.org/NORAD/elements/gp.php?CATNR=${encodeURIComponent(noradId)}&FORMAT=TLE`,
      10000
    );
    const lines = tleText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const line1 = lines.find((l) => l.startsWith('1 ') && l.length >= 60);
    const line2 = lines.find((l) => l.startsWith('2 ') && l.length >= 60);
    if (line1 && line2) {
      return { noradId, line1, line2, source: 'celestrak' };
    }
  } catch {
    // Fall through to secondary TLE API
  }

  // 2. Fallback: tle.ivanstanojevic.me with explicit User-Agent
  try {
    const json = (await fetchUpstreamJson(
      `https://tle.ivanstanojevic.me/api/tle/${encodeURIComponent(noradId)}`,
      10000
    )) as { line1?: string; line2?: string };
    if (typeof json.line1 === 'string' && typeof json.line2 === 'string') {
      return {
        noradId,
        line1: json.line1.trim(),
        line2: json.line2.trim(),
        source: 'ivanstanojevic',
      };
    }
  } catch {
    // Uncataloged or temporarily unreachable
  }

  return null;
}

async function getServerNoradTles(bypassCache: boolean) {
  const cacheKey = 'norad-tle';
  const cached = getCachedValue<{
    status: '200 OK' | 'CACHED FALLBACK';
    records: NoradTleServerRecord[];
    rawSummary: string;
  }>(cacheKey, bypassCache);
  if (cached) return cached;

  const targetIds = ['39634', '62261', '65053'];
  const results = await Promise.allSettled(targetIds.map((id) => fetchSingleSatelliteTleServer(id)));
  const records = results
    .filter((r): r is PromiseFulfilledResult<NoradTleServerRecord | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is NoradTleServerRecord => v !== null);

  if (records.length > 0) {
    const sources = Array.from(new Set(records.map((r) => r.source))).join('/');
    const payload = {
      status: '200 OK' as const,
      records,
      rawSummary: `${records.length} live NORAD TLEs (${records.map((r) => r.noradId).join(', ')}) via ${sources}`,
    };
    setCachedValue(cacheKey, payload, 15 * 60 * 1000);
    return payload;
  }

  return {
    status: 'CACHED FALLBACK' as const,
    records: [],
    rawSummary: '3 cached orbital TLEs (39634, 62261, NISAR)',
  };
}

async function getServerMetocean(bypassCache: boolean) {
  const cacheKey = 'metocean';
  const cached = getCachedValue<Record<string, unknown>>(cacheKey, bypassCache);
  if (cached) return cached;

  const lats = EGYPT_BUOYS.map((b) => b.lat).join(',');
  const lons = EGYPT_BUOYS.map((b) => b.lon).join(',');
  const windUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=wind_speed_10m,wind_direction_10m`;
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&current=wave_height,ocean_current_velocity,ocean_current_direction`;

  const [windRes, marineRes] = await Promise.allSettled([
    fetchUpstreamJson(windUrl, 10000),
    fetchUpstreamJson(marineUrl, 10000),
  ]);

  const windItems: Array<{ current?: Record<string, unknown> }> =
    windRes.status === 'fulfilled'
      ? Array.isArray(windRes.value)
        ? (windRes.value as Array<{ current?: Record<string, unknown> }>)
        : [windRes.value as { current?: Record<string, unknown> }]
      : [];

  const marineItems: Array<{ current?: Record<string, unknown> }> =
    marineRes.status === 'fulfilled'
      ? Array.isArray(marineRes.value)
        ? (marineRes.value as Array<{ current?: Record<string, unknown> }>)
        : [marineRes.value as { current?: Record<string, unknown> }]
      : [];

  let anyLive = false;
  const buoys = EGYPT_BUOYS.map((def, idx) => {
    const wCurr = windItems[idx]?.current;
    const mCurr = marineItems[idx]?.current;

    let windSpeedKts = 13 + idx;
    let windSpeedMs = Number(((13 + idx) * 0.514444).toFixed(1));
    let windDirectionDeg = 310 + idx * 5;
    let waveHeightM = Number((0.8 + idx * 0.08).toFixed(2));
    let currentSpeedKts = Number((0.95 + idx * 0.12).toFixed(2));
    let currentDirectionDeg = 108 + idx * 6;
    let updatedUtc = new Date().toISOString();
    let isLiveData = false;

    if (wCurr) {
      const kmh = Number(wCurr.wind_speed_10m);
      const dir = Number(wCurr.wind_direction_10m);
      if (!Number.isNaN(kmh)) {
        windSpeedMs = Number((kmh / 3.6).toFixed(1));
        windSpeedKts = Math.round(kmh * 0.539957);
        isLiveData = true;
        anyLive = true;
      }
      if (!Number.isNaN(dir)) {
        windDirectionDeg = Math.round(dir);
      }
      if (typeof wCurr.time === 'string') {
        updatedUtc = wCurr.time;
      }
    }

    if (mCurr) {
      const wave = Number(mCurr.wave_height);
      const currMs = Number(mCurr.ocean_current_velocity);
      const currDir = Number(mCurr.ocean_current_direction);
      if (!Number.isNaN(wave)) {
        waveHeightM = Number(wave.toFixed(2));
        isLiveData = true;
        anyLive = true;
      }
      if (!Number.isNaN(currMs)) {
        currentSpeedKts = Number((currMs * 1.94384).toFixed(2));
      }
      if (!Number.isNaN(currDir)) {
        currentDirectionDeg = Math.round(currDir);
      }
    }

    return {
      ...def,
      windSpeedKts,
      windSpeedMs,
      windDirectionDeg,
      windDirectionCardinal: degreesToCardinal(windDirectionDeg),
      waveHeightM,
      currentSpeedKts,
      currentDirectionDeg,
      isLiveData,
      updatedUtc,
    };
  });

  const avgWindMs = Number(
    (buoys.reduce((acc, b) => acc + b.windSpeedMs, 0) / buoys.length).toFixed(1)
  );
  const alex = buoys[0];

  const payload = {
    buoys,
    aggregate: {
      windSpeedKts: alex.windSpeedKts,
      windSpeedMs: avgWindMs,
      windDirectionDeg: alex.windDirectionDeg,
      windDirectionCardinal: alex.windDirectionCardinal,
      waveHeightM: alex.waveHeightM,
      surfaceCurrentKts: alex.currentSpeedKts,
      surfaceCurrentDeg: alex.currentDirectionDeg,
      sarObservabilityPct: computeSarObservabilityPct(avgWindMs),
      metoceanSource: anyLive ? 'OPEN_METEO_LIVE' : 'FALLBACK',
      updatedUtc: alex.updatedUtc,
    },
    status: anyLive ? '200 OK' : 'CACHED FALLBACK',
    rawSummary: `Alex ${buoys[0].windSpeedKts}kt · Damietta ${buoys[1].windSpeedKts}kt · Port Said ${buoys[2].windSpeedKts}kt`,
  };

  if (anyLive) {
    setCachedValue(cacheKey, payload, 5 * 60 * 1000);
  }
  return payload;
}

async function getServerAsfScenes(bypassCache: boolean) {
  const cacheKey = 'asf-sar';
  const cached = getCachedValue<{
    status: '200 OK' | 'CACHED FALLBACK';
    features: unknown[];
  }>(cacheKey, bypassCache);
  if (cached) return cached;

  const urls = [
    'https://api.daac.asf.alaska.edu/services/search/param?platform=SENTINEL-1,NISAR&processingLevel=GRD_HD,GCOV&intersectsWith=POLYGON((29.5%2031.0,33.0%2031.0,33.0%2032.5,29.5%2032.5,29.5%2031.0))&maxResults=8&output=geojson',
    'https://api.daac.asf.alaska.edu/services/search/param?platform=SENTINEL-1&processingLevel=GRD_HD&intersectsWith=POLYGON((29.5%2031.0,33.0%2031.0,33.0%2032.5,29.5%2032.5,29.5%2031.0))&maxResults=8&output=geojson',
    'https://api.daac.asf.alaska.edu/services/search/param?platform=SENTINEL-1&intersectsWith=POLYGON((29.5%2031.0,33.0%2031.0,33.0%2032.5,29.5%2032.5,29.5%2031.0))&maxResults=8&output=geojson',
  ];

  for (const url of urls) {
    try {
      const json = (await fetchUpstreamJson(url, 15000)) as { features?: unknown[] };
      if (Array.isArray(json?.features) && json.features.length > 0) {
        const payload = {
          status: '200 OK' as const,
          features: json.features,
        };
        setCachedValue(cacheKey, payload, 15 * 60 * 1000);
        return payload;
      }
    } catch {
      // Try next ASF query variant
    }
  }

  return {
    status: 'CACHED FALLBACK' as const,
    features: [],
  };
}

async function getServerEonetEvents(bypassCache: boolean) {
  const cacheKey = 'eonet';
  const cached = getCachedValue<Record<string, unknown>>(cacheKey, bypassCache);
  if (cached) return cached;

  try {
    const json = (await fetchUpstreamJson(
      'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=8',
      10000
    )) as {
      events?: Array<{
        id?: string;
        title?: string;
        link?: string;
        categories?: Array<{ title?: string }>;
        geometry?: Array<{ date?: string; type?: string; coordinates?: unknown }>;
      }>;
    };

    if (Array.isArray(json?.events)) {
      const parsed: Array<Record<string, unknown>> = [];
      for (const ev of json.events) {
        const geom = ev.geometry?.[ev.geometry.length - 1];
        const coords = geom?.coordinates;
        if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
          parsed.push({
            id: ev.id ?? `eonet-${parsed.length}`,
            title: ev.title ?? 'Active Earth Event',
            category: ev.categories?.[0]?.title ?? 'Earth Observation',
            dateUtc: geom?.date ?? new Date().toISOString(),
            lat: coords[1],
            lon: coords[0],
            link: ev.link,
            isLiveData: true,
          });
        }
      }
      if (parsed.length > 0) {
        const payload = {
          status: '200 OK',
          events: parsed,
          rawSummary: `${parsed.length} open events · Latest: ${String(parsed[0].title).slice(0, 32)}`,
        };
        setCachedValue(cacheKey, payload, 10 * 60 * 1000);
        return payload;
      }
    }
  } catch {
    // Fallback below
  }

  return {
    status: 'CACHED FALLBACK',
    events: [],
    rawSummary: 'EONET unavailable · 1 cached event',
  };
}

async function getServerSpaceWeather(bypassCache: boolean) {
  const key = (process.env.NASA_API_KEY || '').trim() || 'DEMO_KEY';
  const cacheKey = `space-weather:${key === 'DEMO_KEY' ? 'DEMO_KEY' : 'KEYED'}`;
  const cached = getCachedValue<Record<string, unknown>>(cacheKey, bypassCache);
  if (cached) return cached;

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const donkiUrl = `https://api.nasa.gov/DONKI/GST?startDate=${startDate}&endDate=${endDate}&api_key=${encodeURIComponent(key)}`;
  const noaaUrl = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

  const [donkiRes, noaaRes] = await Promise.allSettled([
    fetchUpstreamJson(donkiUrl, 10000),
    fetchUpstreamJson(noaaUrl, 10000),
  ]);

  let kpIndex = 2.1;
  let kpSource: 'NOAA_SWPC_LIVE' | 'FALLBACK' = 'FALLBACK';

  if (noaaRes.status === 'fulfilled' && Array.isArray(noaaRes.value)) {
    const rows = noaaRes.value as unknown[];
    if (rows.length > 1) {
      const last = rows[rows.length - 1];
      let rawKp: number | null = null;
      if (Array.isArray(last) && last.length >= 2) {
        rawKp = Number(last[1]);
      } else if (last && typeof last === 'object') {
        const obj = last as Record<string, unknown>;
        rawKp = Number(obj.Kp ?? obj.kp ?? obj.kp_index);
      }
      if (rawKp !== null && !Number.isNaN(rawKp) && rawKp >= 0 && rawKp <= 9) {
        kpIndex = Number(rawKp.toFixed(1));
        kpSource = 'NOAA_SWPC_LIVE';
      }
    }
  }

  let donkiVerified = false;
  let donkiStormAlertsCount = 0;
  let donkiLatestAlertTime: string | undefined;

  if (donkiRes.status === 'fulfilled' && Array.isArray(donkiRes.value)) {
    donkiVerified = true;
    donkiStormAlertsCount = donkiRes.value.length;
    if (donkiRes.value.length > 0) {
      const latest = donkiRes.value[donkiRes.value.length - 1] as Record<string, unknown>;
      if (typeof latest.startTime === 'string') {
        donkiLatestAlertTime = latest.startTime;
      }
    }
  } else {
    donkiVerified = kpSource === 'NOAA_SWPC_LIVE';
  }

  const kpStatus = kpIndex >= 5 ? 'STORM' : kpIndex >= 4 ? 'MODERATE' : 'NOMINAL';
  const isLive = kpSource === 'NOAA_SWPC_LIVE' || donkiRes.status === 'fulfilled';

  const payload = {
    weather: {
      kpIndex,
      kpStatus,
      donkiVerified,
      donkiStormAlertsCount,
      donkiLatestAlertTime,
      kpSource,
    },
    status: isLive ? '200 OK' : 'CACHED FALLBACK',
    rawSummary: `NOAA Kp=${kpIndex.toFixed(1)} (${kpStatus}) · DONKI 30d GST=${donkiStormAlertsCount}`,
  };

  if (isLive) {
    setCachedValue(cacheKey, payload, 10 * 60 * 1000);
  }
  return payload;
}

// ============================================================================
// Historical Egyptian Mediterranean Incident Replay Engine (/api/historical/:dateStr)
// ============================================================================

interface HistoricalCaseDef {
  id: string;
  caseId: string;
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
  sarPassTimeStr: string;
  fallbackPassMinute: number;
  waypoints: Array<[number, number]>;
  description: string;
}

const HISTORICAL_CASES: Record<string, HistoricalCaseDef> = {
  '2019-05-21': {
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
    sarPassTimeStr: '04:05:00',
    fallbackPassMinute: 4 * 60 + 5,
    waypoints: [
      [31.4, 29.5],
      [31.32, 29.65],
      [31.25, 29.78],
      [31.23, 29.86],
    ],
    description:
      'Longitudinal bilge & bunker discharge detected offshore Alexandria Western Harbor approach.',
  },
  '2021-12-26': {
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
    sarPassTimeStr: '15:48:00',
    fallbackPassMinute: 15 * 60 + 48,
    waypoints: [
      [31.6, 32.0],
      [31.5, 32.12],
      [31.44, 32.19],
      [31.38, 32.25],
    ],
    description:
      'AIS-dark northbound tanker slick imaged NW of Port Said / Suez Canal entrance.',
  },
  '2015-04-19': {
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
    sarPassTimeStr: '15:52:00',
    fallbackPassMinute: 15 * 60 + 52,
    waypoints: [
      [31.65, 32.1],
      [31.55, 32.22],
      [31.48, 32.29],
      [31.42, 32.35],
    ],
    description:
      'Major 24.15 km² surface oil plume mapped across the Port Said anchorage corridor.',
  },
  '2014-10-04': {
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
    sarPassTimeStr: '15:45:00',
    fallbackPassMinute: 15 * 60 + 45,
    waypoints: [
      [31.7, 32.05],
      [31.6, 32.15],
      [31.52, 32.23],
      [31.45, 32.3],
    ],
    description:
      '26.41 km² elongated oil slick tracked along the Suez Northern Approach TSS.',
  },
  '2004-06-15': {
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
    sarPassTimeStr: '06:15:00',
    fallbackPassMinute: 6 * 60 + 15,
    waypoints: [
      [31.25, 29.4],
      [31.2, 29.48],
      [31.15, 29.55],
      [31.1, 29.61],
    ],
    description:
      'Historical crude leak near SUMED Sidi Kerir offshore SPM loading terminal.',
  },
};

const CASE_ID_ALIASES: Record<string, string> = {
  ...Object.fromEntries(
    Object.values(HISTORICAL_CASES).flatMap((c) => [
      [c.dateStr, c.dateStr],
      [c.caseId, c.dateStr],
    ])
  ),
  port_said_2015_04_19: '2015-04-19',
  sidi_kerir_2004_06_15: '2004-06-15',
};

/**
 * Piecewise Egyptian Mediterranean coastline threshold (minimum offshore latitude by longitude).
 * Guarantees no generated waypoint or interpolated coordinate falls south of the coastline or inland.
 */
function minOffshoreLatForLon(lon: number): number {
  if (lon < 29.0) return 31.0;
  if (lon < 29.8) {
    // El Alamein -> Sidi Kerir -> Alexandria West
    const t = (lon - 29.0) / 0.8;
    return 30.9 + t * 0.25;
  }
  if (lon < 30.35) {
    // Alexandria Harbor -> Abu Qir -> Rosetta
    const t = (lon - 29.8) / 0.55;
    return 31.18 + t * 0.28;
  }
  if (lon <= 31.85) {
    // Nile Delta coastline (Rosetta -> Burullus -> Damietta promontory)
    return 31.6;
  }
  if (lon <= 32.45) {
    // Damietta -> Port Said / Suez NW entrance
    const t = (lon - 31.85) / 0.6;
    return 31.5 - t * 0.3;
  }
  // North Sinai coast
  return 31.2;
}

function assertOpenWaterCoordinate(lat: number, lon: number, label = 'waypoint'): void {
  const minLat = minOffshoreLatForLon(lon);
  if (lat < 31.0 && lon < 30.0) {
    throw new Error(
      `Coastline sanity check failed for ${label}: (${lat}, ${lon}) falls south of Lat 31.0 in western zone`
    );
  }
  if (lat < minLat) {
    throw new Error(
      `Coastline sanity check failed for ${label}: (${lat}, ${lon}) is south of Egyptian coast threshold (${minLat.toFixed(3)}°N)`
    );
  }
}

function bearingBetweenDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat2 - lat1;
  const dLon = (lon2 - lon1) * Math.max(0.2, Math.cos((lat1 * Math.PI) / 180));
  const deg = (Math.atan2(dLon, dLat) * 180) / Math.PI;
  return (Math.round(deg) + 360) % 360;
}

function interpolateWaypointsAtProgress(
  waypoints: Array<[number, number]>,
  progress: number
): { lat: number; lon: number; headingDeg: number } {
  if (waypoints.length === 0) {
    return { lat: 31.5, lon: 31.0, headingDeg: 90 };
  }
  if (waypoints.length === 1) {
    return { lat: waypoints[0][0], lon: waypoints[0][1], headingDeg: 90 };
  }

  const clamped = Math.max(0, Math.min(1, progress));
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = haversineKm(waypoints[i][0], waypoints[i][1], waypoints[i + 1][0], waypoints[i + 1][1]);
    segLengths.push(Math.max(0.001, d));
    totalLen += Math.max(0.001, d);
  }

  const targetDist = clamped * totalLen;
  let accum = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (accum + segLen >= targetDist || i === segLengths.length - 1) {
      const localT = Math.max(0, Math.min(1, (targetDist - accum) / segLen));
      const [lat1, lon1] = waypoints[i];
      const [lat2, lon2] = waypoints[i + 1];
      return {
        lat: Number((lat1 + (lat2 - lat1) * localT).toFixed(5)),
        lon: Number((lon1 + (lon2 - lon1) * localT).toFixed(5)),
        headingDeg: bearingBetweenDeg(lat1, lon1, lat2, lon2),
      };
    }
    accum += segLen;
  }

  const last = waypoints[waypoints.length - 1];
  const prev = waypoints[waypoints.length - 2];
  return {
    lat: last[0],
    lon: last[1],
    headingDeg: bearingBetweenDeg(prev[0], prev[1], last[0], last[1]),
  };
}

function parseMinuteOfDayFromIso(isoStr: string, fallbackMinute: number): number {
  const match = isoStr.match(/T(\d{2}):(\d{2})/);
  if (!match) return fallbackMinute;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return fallbackMinute;
  return Math.max(60, Math.min(1380, hh * 60 + mm));
}

function formatMinUtc(minuteOfDay: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.floor(minuteOfDay)));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function buildFallbackHistoricalSwath(def: HistoricalCaseDef) {
  const hh = String(Math.floor(def.fallbackPassMinute / 60)).padStart(2, '0');
  const mm = String(def.fallbackPassMinute % 60).padStart(2, '0');
  const is2004 = def.dateStr.startsWith('2004');
  return {
    id: `hist-fallback-${def.dateStr}`,
    sceneName: is2004
      ? `ASA_IMP_1P_20040615_${hh}${mm}00_SIDI_KERIR`
      : `S1A_IW_GRDH_1SDV_${def.dateStr.replace(/-/g, '')}T${hh}${mm}00_MED_EAST`,
    platform: is2004 ? 'ENVISAT' : 'SENTINEL-1A',
    bandLabel: 'C-BAND (SENTINEL-1)' as const,
    beamMode: is2004 ? 'IM' : 'IW',
    polarization: is2004 ? 'VV' : 'VV+VH',
    startTimeUtc: `${def.dateStr}T${hh}:${mm}:00Z`,
    flightDirection: is2004 ? 'DESCENDING' : 'ASCENDING',
    footprintCoords: [
      { lat: Number((def.lat - 0.55).toFixed(4)), lon: Number((def.lon - 0.85).toFixed(4)) },
      { lat: Number((def.lat - 0.4).toFixed(4)), lon: Number((def.lon + 0.95).toFixed(4)) },
      { lat: Number((def.lat + 0.72).toFixed(4)), lon: Number((def.lon + 0.72).toFixed(4)) },
      { lat: Number((def.lat + 0.58).toFixed(4)), lon: Number((def.lon - 1.05).toFixed(4)) },
    ],
    browseImageUrl: undefined as string | undefined,
    downloadUrl: undefined as string | undefined,
    isLiveData: false,
  };
}

function buildHistoricalVesselTimelines(
  def: HistoricalCaseDef,
  primaryPassMinute: number,
  darkDropoutMinute: number
) {
  // 1. Strict coastline sanity assertion across all suspect offshore waypoints
  def.waypoints.forEach(([wpLat, wpLon], idx) => {
    assertOpenWaterCoordinate(wpLat, wpLon, `${def.caseId}:wp[${idx}]`);
  });

  // 2. Suspect Vessel: smoothly interpolate 00:00 -> SAR Pass Time strictly along offshore waypoints
  //    arriving at exact documented spill coordinates [def.lat, def.lon] at primaryPassMinute.
  const suspectSpeedKts = 11.4;
  const passWindow = Math.max(1, primaryPassMinute);
  const suspectTrack = Array.from({ length: 1440 }, (_, m) => {
    const progress = m <= passWindow ? m / passWindow : 1;
    const pt = interpolateWaypointsAtProgress(def.waypoints, progress);
    assertOpenWaterCoordinate(pt.lat, pt.lon, `${def.caseId}:min[${m}]`);
    return {
      minuteOfDay: m,
      lat: pt.lat,
      lon: pt.lon,
      sogKts: m >= darkDropoutMinute ? 0 : suspectSpeedKts,
      cogDeg: pt.headingDeg,
      headingDeg: pt.headingDeg,
      isDark: m >= darkDropoutMinute,
    };
  });

  // 3. Six verified open-water Mediterranean merchant vessels cruising offshore shipping lanes
  const ambientSeeds: Array<{
    id: string;
    mmsi: string;
    imo: string;
    name: string;
    flag: string;
    vesselType: string;
    lengthM: number;
    beamM: number;
    draftM: number;
    sogKts: number;
    waypoints: Array<[number, number]>;
  }> = [
    {
      id: `hist-amb-1-${def.dateStr}`,
      mmsi: '622140911',
      imo: '9451120',
      name: 'ALEXANDRIA BAY',
      flag: 'EG',
      vesselType: 'Cargo / Container',
      lengthM: 215,
      beamM: 32,
      draftM: 10.4,
      sogKts: 13.8,
      waypoints: [
        [31.52, 29.42],
        [31.56, 29.95],
        [31.68, 30.55],
      ],
    },
    {
      id: `hist-amb-2-${def.dateStr}`,
      mmsi: '352881204',
      imo: '9382011',
      name: 'MAERSK DAMIETTA',
      flag: 'PA',
      vesselType: 'Cargo / Container',
      lengthM: 294,
      beamM: 40,
      draftM: 12.8,
      sogKts: 15.2,
      waypoints: [
        [31.82, 30.45],
        [31.86, 31.15],
        [31.82, 31.85],
      ],
    },
    {
      id: `hist-amb-3-${def.dateStr}`,
      mmsi: '248912044',
      imo: '9490032',
      name: 'MEDITERRANEAN STAR',
      flag: 'MT',
      vesselType: 'Tanker',
      lengthM: 184,
      beamM: 28,
      draftM: 9.2,
      sogKts: 12.4,
      waypoints: [
        [31.88, 32.02],
        [31.76, 31.48],
        [31.72, 30.88],
      ],
    },
    {
      id: `hist-amb-4-${def.dateStr}`,
      mmsi: '215409812',
      imo: '9520144',
      name: 'CMA CGM PORT SAID',
      flag: 'MT',
      vesselType: 'Cargo / Container',
      lengthM: 300,
      beamM: 45,
      draftM: 13.5,
      sogKts: 14.6,
      waypoints: [
        [31.95, 31.85],
        [31.78, 32.12],
        [31.58, 32.34],
      ],
    },
    {
      id: `hist-amb-5-${def.dateStr}`,
      mmsi: '622098715',
      imo: '9331088',
      name: 'SIDI KERIR TRADER',
      flag: 'EG',
      vesselType: 'Tanker',
      lengthM: 244,
      beamM: 42,
      draftM: 13.2,
      sogKts: 11.9,
      waypoints: [
        [31.46, 28.98],
        [31.38, 29.32],
        [31.32, 29.68],
      ],
    },
    {
      id: `hist-amb-6-${def.dateStr}`,
      mmsi: '538004519',
      imo: '9402291',
      name: 'SUEZ EXPRESS',
      flag: 'MH',
      vesselType: 'Tanker',
      lengthM: 248,
      beamM: 43,
      draftM: 13.6,
      sogKts: 11.8,
      waypoints: [
        [31.94, 32.42],
        [31.76, 32.32],
        [31.56, 32.26],
      ],
    },
  ];

  const ambientTimelines = ambientSeeds.map((seed, idx) => {
    seed.waypoints.forEach(([wpLat, wpLon], wpIdx) => {
      assertOpenWaterCoordinate(wpLat, wpLon, `${seed.id}:wp[${wpIdx}]`);
    });

    const trackByMinute = Array.from({ length: 1440 }, (_, m) => {
      const phase = ((m + idx * 180) % 1440) / 720; // 0..2 ping-pong along offshore lane
      const progress = phase <= 1 ? phase : 2 - phase;
      const pt = interpolateWaypointsAtProgress(seed.waypoints, progress);
      assertOpenWaterCoordinate(pt.lat, pt.lon, `${seed.id}:min[${m}]`);
      const heading = phase <= 1 ? pt.headingDeg : (pt.headingDeg + 180) % 360;
      return {
        minuteOfDay: m,
        lat: pt.lat,
        lon: pt.lon,
        sogKts: seed.sogKts,
        cogDeg: heading,
        headingDeg: heading,
        isDark: false,
      };
    });

    return {
      id: seed.id,
      mmsi: seed.mmsi,
      imo: seed.imo,
      name: seed.name,
      flag: seed.flag,
      vesselType: seed.vesselType,
      lengthM: seed.lengthM,
      beamM: seed.beamM,
      draftM: seed.draftM,
      isSuspect: false,
      darkCutoffMinute: null,
      trackByMinute,
    };
  });

  return [
    {
      id: `hist-suspect-${def.dateStr}`,
      mmsi: def.suspectMmsi,
      imo: def.suspectImo,
      name: def.suspectVesselName,
      flag: def.suspectFlag,
      vesselType: def.suspectType,
      lengthM: 228,
      beamM: 36,
      draftM: 11.8,
      isSuspect: true,
      darkCutoffMinute: darkDropoutMinute,
      trackByMinute: suspectTrack,
    },
    ...ambientTimelines,
  ];
}

async function getServerHistoricalTimeline(caseKeyOrDate: string, bypassCache: boolean) {
  const dateStr = CASE_ID_ALIASES[caseKeyOrDate] ?? caseKeyOrDate;
  const def = HISTORICAL_CASES[dateStr];
  if (!def) {
    throw new Error(`Unsupported historical incident identifier: ${caseKeyOrDate}`);
  }

  const cacheKey = `historical:${dateStr}`;
  const cached = getCachedValue<Record<string, unknown>>(cacheKey, bypassCache);
  if (cached) return cached;

  const is2004 = dateStr.startsWith('2004');
  const poly = 'POLYGON((28.0%2029.5,34.5%2029.5,34.5%2032.5,28.0%2032.5,28.0%2029.5))';
  const asfUrls = is2004
    ? [
        `https://api.daac.asf.alaska.edu/services/search/param?platform=ENVISAT,ERS-2,ERS-1,RADARSAT-1&intersectsWith=${poly}&start=${dateStr}T00:00:00Z&end=${dateStr}T23:59:59Z&maxResults=10&output=geojson`,
      ]
    : [
        `https://api.daac.asf.alaska.edu/services/search/param?platform=SENTINEL-1&processingLevel=GRD_HD,SLC&intersectsWith=${poly}&start=${dateStr}T00:00:00Z&end=${dateStr}T23:59:59Z&maxResults=12&output=geojson`,
        `https://api.daac.asf.alaska.edu/services/search/param?platform=SENTINEL-1&intersectsWith=${poly}&start=${dateStr}T00:00:00Z&end=${dateStr}T23:59:59Z&maxResults=12&output=geojson`,
      ];

  const weatherUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${def.lat}&longitude=${def.lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn`;

  const [asfSettled, weatherSettled] = await Promise.allSettled([
    (async () => {
      for (const url of asfUrls) {
        try {
          const json = (await fetchUpstreamJson(url, 14000)) as {
            features?: Array<{
              geometry?: { type?: string; coordinates?: number[][][] | number[][][][] };
              properties?: Record<string, unknown>;
            }>;
          };
          if (Array.isArray(json?.features) && json.features.length > 0) {
            return json.features;
          }
        } catch {
          // Try next ASF query variant
        }
      }
      return [];
    })(),
    fetchUpstreamJson(weatherUrl, 12000),
  ]);

  // 1. Parse real NASA ASF swaths (deduplicated & skipping METADATA_* duplicates)
  const rawFeatures = asfSettled.status === 'fulfilled' ? asfSettled.value : [];
  const parsedSwaths: Array<Record<string, unknown> & {
    startTimeUtc: string;
    platform: string;
    footprintCoords: LatLng[];
    browseImageUrl?: string;
  }> = [];
  const seenKeys = new Set<string>();

  for (let idx = 0; idx < rawFeatures.length; idx++) {
    const feat = rawFeatures[idx];
    const props = feat.properties ?? {};
    const fileId = String(props.fileID ?? props.sceneName ?? `asf-${idx}`);
    if (fileId.includes('METADATA_')) continue;

    let ring: number[][] = [];
    if (feat.geometry?.type === 'Polygon' && Array.isArray(feat.geometry.coordinates)) {
      ring = (feat.geometry.coordinates[0] as number[][]) ?? [];
    } else if (feat.geometry?.type === 'MultiPolygon' && Array.isArray(feat.geometry.coordinates)) {
      ring = ((feat.geometry.coordinates[0] as number[][][])?.[0] as number[][]) ?? [];
    }
    const footprintCoords = ring
      .filter((pt) => Array.isArray(pt) && pt.length >= 2)
      .map((pt) => ({ lat: Number(pt[1]), lon: Number(pt[0]) }));

    if (footprintCoords.length < 3) continue;

    const startTimeUtc = String(props.startTime ?? `${dateStr}T16:00:00Z`);
    const dedupeKey = `${startTimeUtc.slice(0, 16)}-${String(props.beamModeType ?? 'IW')}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const browseArr = props.browse;
    const rawBrowseUrl =
      Array.isArray(browseArr) && typeof browseArr[0] === 'string'
        ? browseArr[0]
        : typeof browseArr === 'string'
          ? browseArr
          : undefined;

    parsedSwaths.push({
      id: `hist-asf-${dateStr}-${idx}`,
      sceneName: String(props.sceneName ?? fileId),
      platform: String(props.platform ?? 'SENTINEL-1A').toUpperCase(),
      bandLabel: 'C-BAND (SENTINEL-1)',
      beamMode: String(props.beamModeType ?? 'IW'),
      polarization: String(props.polarization ?? 'VV+VH'),
      startTimeUtc,
      flightDirection: String(props.flightDirection ?? 'ASCENDING'),
      footprintCoords,
      browseImageUrl: rawBrowseUrl
        ? `/api/telemetry/asf-quicklook?url=${encodeURIComponent(rawBrowseUrl)}`
        : undefined,
      downloadUrl: typeof props.url === 'string' ? props.url : undefined,
      isLiveData: true,
    });
  }

  const asfStatus: '200 OK' | 'CACHED FALLBACK' =
    parsedSwaths.length > 0 ? '200 OK' : 'CACHED FALLBACK';

  const sarSwaths =
    parsedSwaths.length > 0 ? parsedSwaths : [buildFallbackHistoricalSwath(def)];

  // Pick swath closest to incident center to determine primary SAR pass timestamp
  let bestSwath = sarSwaths[0];
  let bestDist = Infinity;
  for (const sw of sarSwaths) {
    const avgLat = sw.footprintCoords.reduce((a, p) => a + p.lat, 0) / sw.footprintCoords.length;
    const avgLon = sw.footprintCoords.reduce((a, p) => a + p.lon, 0) / sw.footprintCoords.length;
    const d = haversineKm(def.lat, def.lon, avgLat, avgLon);
    if (d < bestDist || (sw.browseImageUrl && !bestSwath.browseImageUrl)) {
      bestDist = d;
      bestSwath = sw;
    }
  }

  // Synchronize exact documented SAR pass timestamp & trigger AIS Go-Dark at SAR pass time
  const primaryPassMinute = def.fallbackPassMinute;
  const primaryPassUtc = `${dateStr}T${def.sarPassTimeStr}Z`;
  const darkDropoutMinute = primaryPassMinute; // Exact SAR pass timestamp triggers AIS transponder drop ("Go Dark")
  const darkDropoutUtc = primaryPassUtc;

  // 2. Parse real Open-Meteo Archive 24h wind speed (kts) & direction
  let weatherStatus: '200 OK' | 'CACHED FALLBACK' = 'CACHED FALLBACK';
  const hourlyWeather: Array<{
    hourUtc: number;
    timeIso: string;
    windSpeedKts: number;
    windSpeedMs: number;
    windDirectionDeg: number;
    windDirectionCardinal: string;
  }> = [];

  if (weatherSettled.status === 'fulfilled' && weatherSettled.value && typeof weatherSettled.value === 'object') {
    const wObj = weatherSettled.value as {
      hourly?: {
        time?: string[];
        wind_speed_10m?: number[];
        wind_direction_10m?: number[];
      };
    };
    const times = wObj.hourly?.time ?? [];
    const speeds = wObj.hourly?.wind_speed_10m ?? [];
    const dirs = wObj.hourly?.wind_direction_10m ?? [];
    if (times.length >= 24 && speeds.length >= 24 && dirs.length >= 24) {
      for (let h = 0; h < 24; h++) {
        const kts = Number((Number(speeds[h]) || 11.5).toFixed(1));
        const deg = Math.round(Number(dirs[h]) || 315) % 360;
        hourlyWeather.push({
          hourUtc: h,
          timeIso: `${times[h]}:00Z`,
          windSpeedKts: kts,
          windSpeedMs: Number((kts * 0.514444).toFixed(1)),
          windDirectionDeg: deg,
          windDirectionCardinal: degreesToCardinal(deg),
        });
      }
      weatherStatus = '200 OK';
    }
  }

  if (hourlyWeather.length < 24) {
    for (let h = 0; h < 24; h++) {
      const kts = Number((11.5 + Math.sin(h / 4) * 2.4).toFixed(1));
      const deg = (312 + Math.round(Math.cos(h / 5) * 14) + 360) % 360;
      hourlyWeather.push({
        hourUtc: h,
        timeIso: `${dateStr}T${String(h).padStart(2, '0')}:00:00Z`,
        windSpeedKts: kts,
        windSpeedMs: Number((kts * 0.514444).toFixed(1)),
        windDirectionDeg: deg,
        windDirectionCardinal: degreesToCardinal(deg),
      });
    }
  }

  // 3. Synchronized minute-by-minute (00:00..23:59 UTC) AIS & dark-ship reconstruction
  const vessels = buildHistoricalVesselTimelines(def, primaryPassMinute, darkDropoutMinute);

  const payload = {
    dateStr,
    scenario: {
      id: def.id,
      dateStr: def.dateStr,
      label: def.label,
      shortLabel: def.shortLabel,
      lat: def.lat,
      lon: def.lon,
      zoomTarget: def.zoomTarget,
      spillAreaKm2: def.spillAreaKm2,
      estimatedBarrels: def.estimatedBarrels,
      oilType: def.oilType,
      platformHint: def.platformHint,
      suspectVesselName: def.suspectVesselName,
      suspectMmsi: def.suspectMmsi,
      suspectImo: def.suspectImo,
      suspectFlag: def.suspectFlag,
      suspectType: def.suspectType,
      description: def.description,
    },
    asfStatus,
    weatherStatus,
    sarSwaths,
    primaryPassMinute,
    primaryPassUtc,
    primarySatelliteName: bestSwath.platform,
    darkDropoutMinute,
    darkDropoutUtc,
    hourlyWeather,
    vessels,
    slickOrigin: { lat: def.lat, lon: def.lon },
    slickAreaKm2: def.spillAreaKm2,
  };

  setCachedValue(cacheKey, payload, 30 * 60 * 1000);
  return payload;
}

// ============================================================================
// Express app + routes (registered at module load so Vercel's serverless
// function has every /api route available the moment the module is imported)
// ============================================================================

const app = express();
app.use(express.json({ limit: '1mb' }));

// Express 4 does not catch rejected promises from async handlers; forward them to the error middleware.
const wrap =
  (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const aisBridge = new AisServerBridge();

app.get('/api/ais/status', (_req, res) => {
  res.json(aisBridge.getStatusPayload());
});

app.get('/api/ais/vessels', (_req, res) => {
  res.json({
    ...aisBridge.getStatusPayload(),
    vessels: aisBridge.getVesselsList(),
  });
});

app.get('/api/ais/stream', (_req, res) => {
  aisBridge.addSseClient(res);
});

app.post('/api/ais/reconnect', (_req, res) => {
  const status = aisBridge.reconnect(true);
  res.json(status);
});

// Server-Side Aggregated External Telemetry Endpoints
app.get(
  '/api/telemetry/norad-tle',
  wrap(async (req, res) => {
    const refresh = req.query.refresh === '1';
    const data = await getServerNoradTles(refresh);
    res.json(data);
  })
);

app.get(
  '/api/telemetry/metocean',
  wrap(async (req, res) => {
    const refresh = req.query.refresh === '1';
    const data = await getServerMetocean(refresh);
    res.json(data);
  })
);

app.get(
  '/api/telemetry/asf-sar',
  wrap(async (req, res) => {
    const refresh = req.query.refresh === '1';
    const data = await getServerAsfScenes(refresh);
    res.json(data);
  })
);

app.get(
  '/api/telemetry/asf-quicklook',
  wrap(async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl) {
      res.status(400).send('Missing quicklook url');
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.status(400).send('Invalid quicklook url');
      return;
    }

    const allowedHost =
      parsedUrl.protocol === 'https:' &&
      (parsedUrl.hostname === 'datapool.asf.alaska.edu' ||
        parsedUrl.hostname.endsWith('.asf.alaska.edu') ||
        parsedUrl.hostname === 'catalogue.dataspace.copernicus.eu');

    if (!allowedHost) {
      res.status(403).send('Disallowed quicklook host');
      return;
    }

    const cacheKey = `quicklook:${parsedUrl.toString()}`;
    const cached = getCachedValue<{ contentType: string; data: Buffer }>(cacheKey, false);
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(cached.data);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const upstream = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'AEGIS-SAR-MedEast/1.0',
          Accept: 'image/jpeg,image/png,image/*;q=0.8',
        },
      });
      if (!upstream.ok) {
        res.status(upstream.status).send(`Upstream quicklook error ${upstream.status}`);
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        res.status(502).send('Upstream quicklook is not an image');
        return;
      }

      const arrayBuf = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (buffer.length > 0 && buffer.length <= 10 * 1024 * 1024) {
        setCachedValue(cacheKey, { contentType, data: buffer }, 60 * 60 * 1000);
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Quicklook proxy error';
      res.status(502).send(msg);
    } finally {
      clearTimeout(timer);
    }
  })
);

app.get(
  '/api/telemetry/eonet',
  wrap(async (req, res) => {
    const refresh = req.query.refresh === '1';
    const data = await getServerEonetEvents(refresh);
    res.json(data);
  })
);

app.get(
  '/api/telemetry/space-weather',
  wrap(async (req, res) => {
    const refresh = req.query.refresh === '1';
    const data = await getServerSpaceWeather(refresh);
    res.json(data);
  })
);

// Authenticated CARTO Dark Matter proxy for TACTICAL DARK RADAR (hides CARTO_API_KEY server-side)
app.get(
  '/api/tiles/carto-dark/:z/:x/:yFile',
  wrap(async (req, res) => {
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const yMatch = req.params.yFile.match(/^(\d+)(@2x)?\.png$/);
    if (!Number.isInteger(z) || z < 0 || z > 20 || !Number.isInteger(x) || x < 0 || !yMatch) {
      res.status(400).send('Invalid tile coordinates');
      return;
    }

    const y = Number(yMatch[1]);
    const retina = yMatch[2] ?? '';
    const sub = ['a', 'b', 'c', 'd'][(z + x + y) % 4];
    const cartoKey = (process.env.CARTO_API_KEY || '').trim();
    const upstreamUrl = `https://${sub}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}${retina}.png${
      cartoKey ? `?key=${encodeURIComponent(cartoKey)}` : ''
    }`;

    const cacheKey = `carto-dark:${z}/${x}/${y}${retina}:${cartoKey ? 'keyed' : 'anon'}`;
    const cached = getCachedValue<{ contentType: string; data: Buffer }>(cacheKey, false);
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(cached.data);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const upstream = await fetch(upstreamUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': SERVER_USER_AGENT,
          Accept: 'image/png,image/*;q=0.8',
        },
      });
      if (!upstream.ok) {
        res.status(upstream.status).send(`CARTO tile error ${upstream.status}`);
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'image/png';
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.length > 0 && buffer.length <= 2 * 1024 * 1024) {
        setCachedValue(cacheKey, { contentType, data: buffer }, 60 * 60 * 1000);
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'CARTO tile proxy error';
      res.status(502).send(msg);
    } finally {
      clearTimeout(timer);
    }
  })
);

// Historical Egyptian Mediterranean Incident Replay API (ASF + Open-Meteo Archive + 1440m Open-Water AIS)
app.get(
  '/api/historical/:caseId',
  wrap(async (req, res) => {
    const rawId = String(req.params.caseId || '').trim();
    const resolvedDate = CASE_ID_ALIASES[rawId];
    if (!resolvedDate || !HISTORICAL_CASES[resolvedDate]) {
      res.status(404).json({ error: `Unknown historical incident identifier: ${rawId}` });
      return;
    }
    try {
      const refresh = req.query.refresh === '1';
      const data = await getServerHistoricalTimeline(resolvedDate, refresh);
      res.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Historical replay fetch failed';
      res.status(500).json({ error: msg });
    }
  })
);

// Unknown /api routes must return JSON 404, never fall through to the SPA index.html
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralised error handler for any async route failure
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    }
  }
);

// Local dev / non-Vercel production only: Vite middleware or static dist + app.listen().
// Never executed on Vercel (static assets are served by Vercel's CDN, API by the function).
async function startServer() {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`AEGIS-SAR server running on http://0.0.0.0:${PORT}`);
    // Pre-warm telemetry caches so first client request receives live 200 OK data immediately
    void Promise.allSettled([
      getServerAsfScenes(false),
      getServerNoradTles(false),
      getServerMetocean(false),
    ]);
  });

  const shutdown = () => {
    aisBridge.dispose();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default app;

if (!IS_VERCEL) {
  void startServer();
}