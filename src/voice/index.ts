import { Directory, File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import ShowAudio from '../../modules/show-audio';
import { VoiceNative, type VoiceStatus } from '../../modules/show-voice';
import { isCriticalSessionActive } from '../runtime/critical-session-gate';
import type { AppLocale, RunSnapshot } from '../domain';
export type { VoiceStatus } from '../../modules/show-voice';
const MODEL_SHA = '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe';
const MODEL_BYTES = 147951465;
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.bin';
let modelDownloadInProgress = false;
function modelFile(): File { return new File(Paths.document, 'speech-models', 'ggml-base.bin'); }
function setupStatus(status: VoiceStatus): VoiceStatus {
  // Native modelReady describes an in-memory recognizer, which is unloaded
  // while calibrating or disarmed. Setup needs the downloaded file instead.
  let modelReady = false;
  try { const file = modelFile(); modelReady = file.exists && file.size === MODEL_BYTES; } catch { /* Missing/unreadable setup is unavailable. */ }
  return { ...status, modelReady };
}
export function resolveVoiceDirector() {
  return {
    getStatus: async (): Promise<VoiceStatus> => setupStatus(await VoiceNative.getStatus()),
    subscribe: (listener: (status: VoiceStatus) => void) => VoiceNative.subscribe((status) => listener(setupStatus(status))),
    calibrate: async (): Promise<VoiceStatus> => {
      if (isCriticalSessionActive()) throw new Error('editor.previewSafety');
      return setupStatus(await VoiceNative.calibrate());
    },
    disarm: async (): Promise<VoiceStatus> => setupStatus(await VoiceNative.disarm()),
    async arm(snapshot: RunSnapshot, locale: AppLocale): Promise<VoiceStatus> {
      const file = modelFile();
      if (!file.exists || file.size !== MODEL_BYTES || await ShowAudio.sha256File(file.uri) !== MODEL_SHA) throw new Error('Download the verified offline speech model before arming');
      return setupStatus(await VoiceNative.arm(snapshot, locale, file.uri));
    },
    async downloadModel(signal?: AbortSignal, onProgress?: (percent: number) => void): Promise<void> {
      if (isCriticalSessionActive()) throw new Error('Speech model downloads are unavailable while a show is armed');
      if (modelDownloadInProgress) throw new Error('Speech model setup is already running');
      modelDownloadInProgress = true;
      try {
      const directory = new Directory(Paths.document, 'speech-models'); directory.create({ intermediates: true, idempotent: true });
      const staged = new File(directory, 'base.download');
      if (staged.exists) staged.delete(); staged.create();
      const handle = staged.open(); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await expoFetch(MODEL_URL, { ...(signal ? {signal} : {}) });
        if (!response.ok || !response.body) throw new Error('Offline speech model download failed');
        reader = response.body.getReader(); let received = 0;
        while (true) {
          if (signal?.aborted || isCriticalSessionActive()) throw new Error('Speech model download cancelled');
          const chunk = await reader.read(); if (chunk.done) break;
          received += chunk.value.length; if (received > MODEL_BYTES) throw new Error('Offline model size mismatch');
          handle.writeBytes(chunk.value); onProgress?.(Math.floor(received * 100 / MODEL_BYTES));
        }
        handle.close();
        if (received !== MODEL_BYTES || await ShowAudio.sha256File(staged.uri) !== MODEL_SHA) throw new Error('Offline model checksum mismatch');
        if (signal?.aborted || isCriticalSessionActive()) throw new Error('Speech model download cancelled');
        const destination = modelFile(); if (destination.exists) destination.delete(); await staged.move(destination);
      } catch (error) { await reader?.cancel().catch(() => undefined); try {handle.close()} catch { /* Already closed. */ } if (staged.exists) staged.delete(); throw error; }
      finally { reader?.releaseLock(); }
      } finally { modelDownloadInProgress = false; }
    },
    suggestVariants(phrase: string): readonly string[] {
      const canonical = phrase.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();
      const folded = canonical.normalize('NFD').replace(/[\p{M}]/gu, '').normalize('NFC');
      // Suggestions require explicit selection; they never broaden an armed rule implicitly.
      const alternatives: readonly (readonly [string, string])[] = [
        ['thank you', 'thankyou'], ['all right', 'alright'], ['okay', 'ok'], ['four', '4'], ['two', '2'],
        ['מוזיקה', 'מוסיקה'], ['יאללה', 'יאלה'], ['בסדר', 'ב סדר'], ['اوكي', 'أوكي'],
        ['d accord', 'daccord'], ['va bene', 'vabene'], ['поехали', 'по ехали'], ['オーケー', 'ok'],
      ];
      const variants = alternatives.flatMap(([left, right]) => canonical.includes(left) ? [canonical.replace(left, right)] : canonical.includes(right) ? [canonical.replace(right, left)] : []);
      return [...new Set([canonical, folded, ...variants])].filter((text) => text && text !== phrase).slice(0, 8);
    },
  };
}
