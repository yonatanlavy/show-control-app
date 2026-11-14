import { requireOptionalNativeModule } from 'expo';
import type { ControllerCommand, ControllerProfile } from '../../src/domain';

export type ControllerPhase = 'down' | 'up';
export type ControllerDiagnosticMode = 'off' | 'learn' | 'test';

export interface NativeControllerInput {
  /** Stable within the native process and suitable for downstream duplicate suppression. */
  readonly eventId: string;
  readonly sourceSessionId: string;
  readonly sequence: number;
  readonly adapterId: 'flic2' | 'generic-native' | 'system-media';
  readonly deviceId: string;
  readonly inputKey: string;
  readonly phase: ControllerPhase;
  readonly monotonicMs: number;
  readonly isRepeat: boolean;
  readonly wasQueued: boolean;
  readonly ageMs: number;
  /** Confirms only that this app received the input; it is not a remote-side action acknowledgement. */
  readonly deliveryEvidence: 'app_received_only';
  readonly handledNatively?: boolean;
  readonly diagnosticMode?: ControllerDiagnosticMode;
  readonly diagnosticSessionId?: string;
  readonly resolvedCommandType?: ControllerCommand['type'] | '';
}

export interface ControllerHealth {
  readonly sdkAvailable: boolean;
  readonly configured: boolean;
  readonly restored: boolean;
  readonly bluetoothState: string;
  readonly pairedCount: number;
  readonly readyCount: number;
  readonly connectingCount: number;
  readonly staleEventsSuppressed: number;
  readonly inputsDroppedWithoutBridge?: number;
  readonly bridgeAvailable?: boolean;
  readonly bridgeListenerCount?: number;
  readonly active?: boolean;
  readonly backgroundRequested: boolean;
  readonly nativeLifecycleOwner?: 'foreground_service' | 'process_runtime' | 'expo_module';
  /** A user force-quit/force-stop is never claimed as a supported background state. */
  readonly survivesUserForceQuit?: false;
  readonly genericKeyboardListening?: boolean;
  readonly genericKeyboardConnected?: boolean;
  readonly genericKeyboardForegroundOnly?: true;
  readonly genericKeyboardIdentity?: string;
  readonly initialPairingMayRequireInternet: true;
  readonly detail: string;
  readonly diagnosticMode?: ControllerDiagnosticMode;
  readonly diagnosticSessionId?: string;
}

export interface FlicPairResult {
  readonly deviceId: string;
  readonly name?: string;
  readonly paired: true;
  readonly initialPairingMayRequireInternet: true;
}

export interface ControllerScanEvent {
  readonly state: string;
  readonly detail: string;
  readonly initialPairingMayRequireInternet: true;
}

export interface NativeSubscription { remove(): void }

type RawModule = {
  configure(staleQueueMaxAgeMs: number, background: boolean): Promise<void>;
  configureProfile(profileJson: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<ControllerHealth>;
  setDiagnosticMode(mode: ControllerDiagnosticMode): Promise<unknown>;
  scanAndPair(): Promise<FlicPairResult>;
  cancelScan(): void;
  forwardGenericInput(
    deviceId: string,
    inputKey: string,
    phase: ControllerPhase,
    isRepeat: boolean,
  ): void;
  addListener(
    eventName: 'onControllerInput',
    listener: (event: NativeControllerInput) => void,
  ): NativeSubscription;
  addListener(
    eventName: 'onControllerHealth',
    listener: (event: ControllerHealth) => void,
  ): NativeSubscription;
  addListener(
    eventName: 'onControllerScan',
    listener: (event: ControllerScanEvent) => void,
  ): NativeSubscription;
};

const raw = requireOptionalNativeModule<RawModule>('ShowController');

export interface ControllerAvailability {
  readonly nativeModuleAvailable: boolean;
  readonly flicSdkAvailable: boolean | null;
  readonly health: ControllerHealth | null;
  readonly detail: string;
}

function required(): RawModule {
  if (!raw) {
    throw new Error(
      'ShowController is unavailable. Build the native development client; Expo Go cannot load Flic 2.',
    );
  }
  return raw;
}

export default {
  isAvailable: () => raw != null,
  probeAvailability: async (): Promise<ControllerAvailability> => {
    if (!raw) {
      return {
        nativeModuleAvailable: false,
        flicSdkAvailable: null,
        health: null,
        detail: 'ShowController is not linked in this build.',
      };
    }
    try {
      const health = await raw.health();
      return {
        nativeModuleAvailable: true,
        flicSdkAvailable: health.sdkAvailable,
        health,
        detail: health.detail,
      };
    } catch (error) {
      return {
        nativeModuleAvailable: true,
        flicSdkAvailable: null,
        health: null,
        detail: error instanceof Error ? error.message : 'Controller availability probe failed.',
      };
    }
  },
  configure: (options: { staleQueueMaxAgeMs?: number; background?: boolean } = {}) =>
    required().configure(options.staleQueueMaxAgeMs ?? 15_000, options.background ?? true),
  configureProfile: (profile: ControllerProfile) => required().configureProfile(JSON.stringify(profile)),
  start: () => required().start(),
  stop: () => required().stop(),
  health: () => required().health(),
  setDiagnosticMode: async (mode: ControllerDiagnosticMode): Promise<ControllerHealth> => { await required().setDiagnosticMode(mode); return required().health() },
  scanAndPair: async () => { try { return await required().scanAndPair() } catch (error) { if (error instanceof Error && /E_CANCELLED|Pairing cancelled/.test(error.message + String((error as { code?: string }).code))) throw new DOMException('Cancelled', 'AbortError'); throw error } },
  cancelScan: () => required().cancelScan(),
  forwardGenericInput: (
    deviceId: string,
    inputKey: string,
    phase: ControllerPhase,
    isRepeat = false,
  ) => required().forwardGenericInput(deviceId, inputKey, phase, isRepeat),
  addInputListener: (listener: (event: NativeControllerInput) => void) =>
    required().addListener('onControllerInput', listener),
  addHealthListener: (listener: (event: ControllerHealth) => void) =>
    required().addListener('onControllerHealth', listener),
  addScanListener: (listener: (event: ControllerScanEvent) => void) =>
    required().addListener('onControllerScan', listener),
};
