import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';
import type { AppLocale, RunSnapshot } from '../../src/domain';
export interface VoiceStatus { available: boolean; armed: boolean; modelReady: boolean; calibrated: boolean; detail: string; transcript?: string; lastAction?: string; actionReceipt?: 'dispatched' | 'accepted' | 'rejected'; actionEventId?: string; monotonicMs?: number; confidence?: number }
interface NativeVoice {
  getStatus(): Promise<VoiceStatus>;
  calibrate(): Promise<VoiceStatus>;
  arm(snapshot: string, locale: AppLocale, modelPath: string): Promise<VoiceStatus>;
  disarm(): Promise<VoiceStatus>;
  addListener(event: 'onVoiceStatus', listener: (status: VoiceStatus) => void): {remove(): void};
}
let raw: NativeVoice | null = null;
try { raw = requireOptionalNativeModule<NativeVoice>('ShowVoice'); } catch { /* Unsupported native build. */ }
export const VoiceNative = {
  getStatus: () => raw ? raw.getStatus() : Promise.resolve({ available: false, armed: false, modelReady: false, calibrated: false, detail: 'A native speech development build is required' }),
  async calibrate() {
    if (!raw) throw new Error('Native voice module is unavailable');
    if (Platform.OS === 'android' && await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO) !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Microphone permission was denied');
    return raw.calibrate();
  },
  arm: (snapshot: RunSnapshot, locale: AppLocale, modelPath: string) => { if (!raw) return Promise.reject(new Error('Native voice module is unavailable')); return raw.arm(JSON.stringify(snapshot), locale, modelPath); },
  disarm: () => raw ? raw.disarm() : Promise.resolve({ available: false, armed: false, modelReady: false, calibrated: false, detail: 'Voice is off' }),
  subscribe: (listener: (status: VoiceStatus) => void) => raw ? raw.addListener('onVoiceStatus', listener) : {remove() {}},
};
