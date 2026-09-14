export type ZoomKind = 'digital' | 'native';

export interface ZoomState {
  value: number;
  min: number;
  max: number;
  kind: ZoomKind;
}

const DIGITAL_MIN = 1;
const DIGITAL_MAX = 12;

export function defaultZoom(): ZoomState {
  return { value: 1, min: DIGITAL_MIN, max: DIGITAL_MAX, kind: 'digital' };
}

function readZoomCaps(track: MediaStreamTrack): { min: number; max: number } | null {
  const caps = track.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min?: number; max?: number } };
  const zoom = caps?.zoom;
  if (!zoom || typeof zoom !== 'object') return null;
  const min = zoom.min ?? 1;
  const max = zoom.max ?? 1;
  if (!(max > min)) return null;
  return { min, max };
}

export async function startCamera(
  video: HTMLVideoElement,
  facingMode: 'environment' | 'user',
): Promise<{ stream: MediaStream; zoom: ZoomState }> {
  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    { audio: false, video: { facingMode } },
    { audio: false, video: true },
  ];

  let stream: MediaStream | null = null;
  let lastErr: unknown = null;
  for (const constraints of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!stream) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr ?? 'unavailable');
    throw new Error(msg);
  }

  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  await video.play();

  const track = stream.getVideoTracks()[0];
  const native = track ? readZoomCaps(track) : null;
  const zoom = defaultZoom();
  if (native) {
    zoom.kind = 'native';
    zoom.min = native.min;
    zoom.max = native.max;
    const settings = track.getSettings?.() as MediaTrackSettings & { zoom?: number };
    zoom.value = settings.zoom ?? native.min;
  }
  return { stream, zoom };
}

export async function applyZoom(
  video: HTMLVideoElement,
  stream: MediaStream | null,
  zoom: ZoomState,
): Promise<ZoomState> {
  const next = { ...zoom };
  if (next.kind === 'native' && stream) {
    const track = stream.getVideoTracks()[0];
    try {
      await track.applyConstraints({ advanced: [{ zoom: next.value } as MediaTrackConstraintSet] });
      video.style.transform = 'none';
      return next;
    } catch {
      next.kind = 'digital';
      next.min = DIGITAL_MIN;
      next.max = DIGITAL_MAX;
      next.value = Math.min(DIGITAL_MAX, Math.max(DIGITAL_MIN, next.value));
    }
  }
  video.style.transform = `scale(${next.value})`;
  video.style.transformOrigin = 'center center';
  return next;
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export function formatZoomLabel(zoom: ZoomState): string {
  const n = zoom.value.toFixed(2);
  if (zoom.kind === 'native') return `Zoom ${n}× · native`;
  return `Zoom ${n}× · digital`;
}
