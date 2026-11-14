import { MediaImportTransaction, type MediaImportPort, type MediaAssetRepository, type ProbedMedia } from '../../src/storage/contracts';

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no });
  return { promise, resolve, reject };
}
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
const probe: ProbedMedia = { durationMs: 2000, codec: 'wav', channels: 1, sampleRate: 48000 };
const checksum = 'a'.repeat(64);
function fixture() {
  const metadata = deferred<ProbedMedia>(); const digest = deferred<string>();
  const files = {
    stage: jest.fn(async () => ({ uri: 'file:///staging/owned.stage', bytes: 1024 })),
    probe: jest.fn(() => metadata.promise), sha256: jest.fn(() => digest.promise),
    commit: jest.fn(async (_uri: string, managedName: string) => ({ uri: 'file:///documents/' + managedName, bytes: 1024, checksumSha256: checksum, managedName, created: true, ownership: 'app-owned' as const })),
    remove: jest.fn(async () => undefined),
  } satisfies MediaImportPort;
  const assets = { get: jest.fn(async () => null), getByChecksum: jest.fn(async () => null), save: jest.fn(async () => undefined), delete: jest.fn(async () => undefined) } satisfies MediaAssetRepository;
  return { metadata, digest, files, assets, picked: { sourceUri: 'file:///picker/owned.wav', displayName: 'owned.wav' } };
}

describe('native import reader lifetime', () => {
  it.each([
    ['probe', 'async'], ['sha256', 'async'], ['probe', 'sync'], ['sha256', 'sync'],
  ] as const)('keeps staging until the other reader finishes after %s rejects %s', async (reader, mode) => {
    const task = fixture(); const failure = new Error('Native ' + reader + ' failed');
    if (mode === 'sync') task.files[reader].mockImplementation(() => { throw failure });
    const pending = new MediaImportTransaction(task.files, task.assets).import(task.picked);
    let settled = false; const outcome = pending.catch((error: unknown) => error).finally(() => { settled = true });
    try {
      await flush();
      if (mode === 'async') { if (reader === 'probe') task.metadata.reject(failure); else task.digest.reject(failure); }
      await flush();
      expect(settled).toBe(false); expect(task.files.remove).not.toHaveBeenCalled();
      expect(task.assets.save).not.toHaveBeenCalled(); expect(task.files.commit).not.toHaveBeenCalled();
    } finally { task.metadata.resolve(probe); task.digest.resolve(checksum); await outcome; }
    expect(await outcome).toBe(failure); expect(task.files.remove).toHaveBeenCalledTimes(1);
    expect(task.files.remove).toHaveBeenCalledWith('file:///staging/owned.stage');
  });

  it('does not begin native readers after cancellation during staging', async () => {
    const task = fixture(); const staged = deferred<{ uri: string; bytes: number }>();
    task.files.stage.mockImplementation(() => staged.promise);
    const controller = new AbortController();
    const pending = new MediaImportTransaction(task.files, task.assets).import(task.picked, controller.signal);
    const outcome = pending.catch((error: unknown) => error);
    controller.abort(); staged.resolve({ uri: 'file:///staging/owned.stage', bytes: 1024 });
    task.metadata.resolve(probe); task.digest.resolve(checksum);
    expect(await outcome).toEqual(expect.objectContaining({ message: 'Import cancelled.' }));
    expect(task.files.probe).not.toHaveBeenCalled(); expect(task.files.sha256).not.toHaveBeenCalled();
    expect(task.files.commit).not.toHaveBeenCalled(); expect(task.assets.save).not.toHaveBeenCalled();
    expect(task.files.remove).toHaveBeenCalledTimes(1);
  });

  it('holds staging during cancellation until both active native readers settle', async () => {
    const task = fixture(); const controller = new AbortController();
    const pending = new MediaImportTransaction(task.files, task.assets).import(task.picked, controller.signal);
    const outcome = pending.catch((error: unknown) => error);
    await flush(); controller.abort(); task.metadata.resolve(probe); await flush();
    expect(task.files.remove).not.toHaveBeenCalled(); expect(task.files.commit).not.toHaveBeenCalled();
    task.digest.resolve(checksum); expect(await outcome).toEqual(expect.objectContaining({ message: 'Import cancelled.' }));
    expect(task.files.remove).toHaveBeenCalledTimes(1); expect(task.assets.save).not.toHaveBeenCalled();
  });

  it('checks the captured operation access again after staging and before native readers', async () => {
    const task = fixture(); const staged = deferred<{ uri: string; bytes: number }>();
    task.files.stage.mockImplementation(() => staged.promise); let critical = false;
    const importer = new MediaImportTransaction(task.files, task.assets, () => { if (critical) throw new Error('library.armed'); });
    const pending = importer.import(task.picked); const outcome = pending.catch((error: unknown) => error);
    critical = true; staged.resolve({ uri: 'file:///staging/owned.stage', bytes: 1024 }); task.metadata.resolve(probe); task.digest.resolve(checksum);
    expect(await outcome).toEqual(expect.objectContaining({ message: 'library.armed' }));
    expect(task.files.probe).not.toHaveBeenCalled(); expect(task.files.sha256).not.toHaveBeenCalled();
    expect(task.files.commit).not.toHaveBeenCalled(); expect(task.assets.save).not.toHaveBeenCalled();
    expect(task.files.remove).toHaveBeenCalledTimes(1);
  });
});
