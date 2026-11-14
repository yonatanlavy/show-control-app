import { extractStoredEntry, inspectStoredZip, writeStoredZip, type ZipReader } from '../../src/storage/zip';

const payload = new Uint8Array(600_000).fill(42);
const source = { path: 'manifest.json', bytes: payload.length, read: async (offset: number, length: number) => payload.slice(offset, offset + length) };
async function archive() {
  const chunks: Uint8Array[] = []; await writeStoredZip([source], { write: async (chunk) => { chunks.push(chunk); } });
  const bytes = Buffer.concat(chunks); const reader: ZipReader = { size: bytes.length, read: async (offset, length) => bytes.subarray(offset, offset + length) };
  return { reader, entry: (await inspectStoredZip(reader))[0]! };
}
describe('bounded backup cancellation and measured progress', () => {
  it('cancels during checksum calculation before publishing any archive payload', async () => {
    const controller = new AbortController(); const write = jest.fn(async () => undefined);
    const read = jest.fn(async (offset: number, length: number) => { controller.abort(); return payload.slice(offset, offset + length); });
    await expect(writeStoredZip([{ ...source, read }], { write }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).toHaveBeenCalledTimes(1); expect(write).not.toHaveBeenCalled();
  });
  it('stops partial writing on the next bounded chunk and does not finish the directory', async () => {
    const controller = new AbortController(); const chunks: Uint8Array[] = []; const progress: number[] = [];
    await expect(writeStoredZip([source], { write: async (chunk) => { chunks.push(chunk); } }, { signal: controller.signal, onProgress: (bytes) => { progress.push(bytes); controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress).toEqual([262144]); expect(chunks).toHaveLength(2);
    expect(Buffer.concat(chunks).includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(false);
  });
  it('reports actual payload bytes and completed files, excluding headers and CRC reads', async () => {
    const values: [number, number][] = []; const chunks: Uint8Array[] = [];
    await writeStoredZip([source], { write: async (chunk) => { chunks.push(chunk); } }, { onProgress: (bytes, files) => values.push([bytes, files]) });
    expect(values).toEqual([[262144, 0], [524288, 0], [600000, 0], [600000, 1]]);
    expect(Buffer.concat(chunks).length).toBeGreaterThan(payload.length);
  });
  it('cancels extraction before writing a second chunk or treating the entry as validated', async () => {
    const { reader, entry } = await archive(); const controller = new AbortController(); const write = jest.fn(async (_bytes: Uint8Array) => undefined);
    await expect(extractStoredEntry(reader, entry, { write }, { signal: controller.signal, onProgress: () => controller.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(write).toHaveBeenCalledTimes(1); expect(write.mock.calls[0]![0]).toHaveLength(262144);
  });
  it('refuses an already-cancelled archive inspection without reading the file', async () => {
    const controller = new AbortController(); controller.abort(); const read = jest.fn(async () => new Uint8Array());
    await expect(inspectStoredZip({ size: 100, read }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(read).not.toHaveBeenCalled();
  });
  it('admits a real event-loop cancellation even when every source read resolves synchronously', async () => {
    const controller = new AbortController(); const write = jest.fn(async () => undefined);
    const large = new Uint8Array(5_000_000); const input = { ...source, bytes: large.length, read: async (offset: number, length: number) => large.slice(offset, offset + length) };
    const pending = writeStoredZip([input], { write }, { signal: controller.signal });
    setTimeout(() => controller.abort(), 0);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(write).not.toHaveBeenCalled();
  });
});
