import ShowAudio from '../../modules/show-audio';
import { VoiceNative, type VoiceStatus } from '../../modules/show-voice';
import { compileRunSnapshot, sampleShow, sampleControllerProfiles } from '../../src/domain';
import { resolveVoiceDirector } from '../../src/voice';
import { setCriticalSessionActive } from '../../src/runtime/critical-session-gate';

const mockFileState = { exists: true, size: 147951465 };
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  Directory: class {},
  File: class {
    uri = 'file:///documents/speech-models/ggml-base.bin';
    get exists() { return mockFileState.exists; }
    get size() { return mockFileState.size; }
  },
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../../modules/show-audio', () => ({ __esModule: true, default: { sha256File: jest.fn() } }));
jest.mock('../../modules/show-voice', () => ({ VoiceNative: { getStatus: jest.fn(), calibrate: jest.fn(), arm: jest.fn(), disarm: jest.fn(), subscribe: jest.fn() } }));
const native = jest.mocked(VoiceNative);
const digest = jest.mocked(ShowAudio.sha256File);
const inactive: VoiceStatus = { available: true, armed: false, modelReady: false, calibrated: false, detail: 'Voice off' };
const compiled = compileRunSnapshot(sampleShow, 'set-main', sampleControllerProfiles);
if (!compiled.ok) throw new Error('Invalid voice setup fixture');
const sampleSnapshot = compiled.snapshot;

beforeEach(() => {
  jest.clearAllMocks(); mockFileState.exists = true; mockFileState.size = 147951465;
  native.getStatus.mockResolvedValue(inactive);
  native.calibrate.mockResolvedValue({ ...inactive, calibrated: true });
  native.disarm.mockResolvedValue({ ...inactive, calibrated: true });
  native.arm.mockResolvedValue({ ...inactive, armed: true, calibrated: true, modelReady: true });
  digest.mockResolvedValue('60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe');
});

describe('first-use offline voice setup and rearm', () => {
  it('rejects microphone reconfiguration at the director boundary while a show is critical', async () => {
    setCriticalSessionActive(true);
    try {
      await expect(resolveVoiceDirector().calibrate()).rejects.toThrow('editor.previewSafety');
      expect(native.calibrate).not.toHaveBeenCalled();
    } finally { setCriticalSessionActive(false); }
    await expect(resolveVoiceDirector().calibrate()).resolves.toMatchObject({ calibrated: true });
  });
  it('keeps downloaded model readiness through calibration and disarm', async () => {
    const director = resolveVoiceDirector();
    await expect(director.getStatus()).resolves.toMatchObject({ modelReady: true, armed: false });
    await expect(director.calibrate()).resolves.toMatchObject({ modelReady: true, calibrated: true });
    await expect(director.disarm()).resolves.toMatchObject({ modelReady: true, armed: false });
  });
  it('normalizes status events without losing transcript or admission feedback', () => {
    let callback: ((status: VoiceStatus) => void) | undefined;
    const remove = jest.fn();
    native.subscribe.mockImplementation((listener) => { callback = listener; return { remove }; });
    const listener = jest.fn(); const subscription = resolveVoiceDirector().subscribe(listener);
    callback?.({ ...inactive, calibrated: true, transcript: 'go', actionReceipt: 'accepted' });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ modelReady: true, calibrated: true, transcript: 'go', actionReceipt: 'accepted' }));
    mockFileState.exists = false; callback?.(inactive);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ modelReady: false }));
    subscription.remove(); expect(remove).toHaveBeenCalledTimes(1);
  });
  it('does not treat a missing or partial download as ready', async () => {
    mockFileState.size -= 1;
    await expect(resolveVoiceDirector().calibrate()).resolves.toMatchObject({ modelReady: false });
    mockFileState.exists = false;
    await expect(resolveVoiceDirector().disarm()).resolves.toMatchObject({ modelReady: false });
  });
  it('verifies the complete file checksum before every native arm', async () => {
    const director = resolveVoiceDirector(); digest.mockResolvedValueOnce('wrong');
    await expect(director.arm(sampleSnapshot, 'en')).rejects.toThrow('verified offline speech model');
    expect(native.arm).not.toHaveBeenCalled();
    await expect(director.arm(sampleSnapshot, 'he')).resolves.toMatchObject({ armed: true, modelReady: true });
    expect(native.arm).toHaveBeenCalledWith(sampleSnapshot, 'he', 'file:///documents/speech-models/ggml-base.bin');
    expect(digest).toHaveBeenCalledTimes(2);
  });
});
