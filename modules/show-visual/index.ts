import { requireOptionalNativeModule } from 'expo';
import type { RunSnapshot } from '../../src/domain';
export interface VisualStatus { available: boolean; enabled: boolean; displayDetected: boolean; connected: boolean; testing: boolean; detail: string; errorCode?: 'displayUnavailable' | 'decoderFailed' | 'mediaUnavailable' }
export interface VisualProbe { kind: 'image' | 'video'; mimeType: string; width: number; height: number; durationMs?: number }
interface NativeVisual { configure(json: string): Promise<VisualStatus>; prepare(json: string): Promise<void>; getStatus(): Promise<VisualStatus>; testPattern(json: string): Promise<VisualStatus>; endTestPattern(): Promise<void>; blackout(): Promise<void>; probeVisual(uri: string): Promise<VisualProbe>; addListener(event: 'onVisualStatus', listener: (status: VisualStatus) => void): { remove(): void } }
let raw: NativeVisual | null = null;
try { raw = requireOptionalNativeModule<NativeVisual>('ShowVisual'); } catch { /* Unsupported development runtime. */ }
const absent: VisualStatus = { available: false, enabled: false, displayDetected: false, connected: false, testing: false, detail: 'A native development build is required for external output' };
function required() { if (!raw) throw new Error(absent.detail); return raw; }
export default {
  availability: () => ({ available: !!raw }),
  configure: (settings: { enabled: boolean; fallbackUri?: string }) => raw ? raw.configure(JSON.stringify(settings)) : Promise.resolve(absent),
  prepare: (snapshot: RunSnapshot) => required().prepare(JSON.stringify(snapshot)),
  getStatus: () => raw ? raw.getStatus() : Promise.resolve(absent),
  testPattern: (labels: { title: string; caption: string }) => required().testPattern(JSON.stringify(labels)),
  endTestPattern: () => raw ? raw.endTestPattern() : Promise.resolve(),
  blackout: () => raw ? raw.blackout() : Promise.resolve(),
  probeVisual: (uri: string) => required().probeVisual(uri),
  subscribe: (listener: (status: VisualStatus) => void) => raw ? raw.addListener('onVisualStatus', listener) : { remove() {} },
};
