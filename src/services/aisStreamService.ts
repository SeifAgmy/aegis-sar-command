import { Vessel } from '../types/telemetry';

export type AisConnectionStatus =
  | 'disconnected'
  | 'needs_key'
  | 'connecting'
  | 'connected'
  | 'error';

export interface AisServerStatusInfo {
  status: AisConnectionStatus;
  vesselCount: number;
  hasKey: boolean;
  keySource: 'env' | 'runtime' | 'none';
  lastMessageUtc: string;
  errorMessage: string;
}

/**
 * Triggers the server-side AIS proxy (/api/ais/reconnect) using the server's configured AISSTREAM_API_KEY.
 */
export async function reconnectServerAisStream(): Promise<AisServerStatusInfo | null> {
  try {
    const res = await fetch('/api/ais/reconnect', { method: 'POST' });
    if (!res.ok) return null;
    return (await res.json()) as AisServerStatusInfo;
  } catch {
    return null;
  }
}

/**
 * Connects to the built-in Express SSE stream (/api/ais/stream) for real-time AIS vessels.
 * All upstream WebSocket credentials remain strictly server-side.
 */
export function connectServerAisStream(
  onVesselsUpdate: (vessels: Vessel[]) => void,
  onStatusUpdate: (info: AisServerStatusInfo) => void
): () => void {
  let eventSource: EventSource | null = null;
  let closed = false;

  try {
    eventSource = new EventSource('/api/ais/stream');

    eventSource.addEventListener('status', (event: MessageEvent) => {
      if (closed) return;
      try {
        const info = JSON.parse(String(event.data)) as AisServerStatusInfo;
        onStatusUpdate(info);
      } catch {
        // Ignore malformed status frame
      }
    });

    eventSource.addEventListener('vessels', (event: MessageEvent) => {
      if (closed) return;
      try {
        const list = JSON.parse(String(event.data)) as Vessel[];
        if (Array.isArray(list)) {
          onVesselsUpdate(list);
        }
      } catch {
        // Ignore malformed vessels payload
      }
    });

    eventSource.onerror = () => {
      if (closed) return;
      if (eventSource?.readyState === EventSource.CLOSED) {
        onStatusUpdate({
          status: 'disconnected',
          vesselCount: 0,
          hasKey: false,
          keySource: 'none',
          lastMessageUtc: '',
          errorMessage: 'Server AIS stream disconnected',
        });
      }
    };
  } catch {
    onStatusUpdate({
      status: 'disconnected',
      vesselCount: 0,
      hasKey: false,
      keySource: 'none',
      lastMessageUtc: '',
      errorMessage: 'EventSource unavailable',
    });
  }

  return () => {
    closed = true;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}
